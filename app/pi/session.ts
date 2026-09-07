import { join, resolve } from 'node:path'
import { ModelRuntime, DefaultResourceLoader, SessionManager, SettingsManager, createAgentSessionFromServices, getAgentDir, type AgentSession, type AgentSessionServices, type CreateAgentSessionResult, type ToolDefinition, type ExtensionFactory } from '@earendil-works/pi-coding-agent'
import type { Model, Api } from '@earendil-works/pi-ai'
import type { ReasoningExecutor } from '../../plugins/reasoning/contracts.ts'
import { PiReasoningExecutor } from '../../plugins/reasoning/pi/executor.ts'
import { createResearchHubTools } from './tools.ts'
import { KnowledgeService } from '../services/knowledge-service.ts'
import { ProductionService } from '../services/production-service.ts'
import { ReviewService } from '../services/review-service.ts'
import { WorkflowService } from '../services/workflow-service.ts'
import type { ResearchHubApplicationServices } from '../runtime/contracts.ts'
import { BASH_ISOLATION_GAP, commandReferencesCanonicalKnowledgeBase, isCanonicalKnowledgeBasePath, isCanonicalKnowledgeBasePathSecure, protectedPathError } from './security.ts'
import { RESEARCHHUB_PI_SYSTEM_PROMPT } from './system-prompt.ts'

export interface ResearchHubPiSessionOptions {
  readonly cwd: string
  /** Explicit override for tests or isolated deployments; omitted means Pi's official global agent directory. */
  readonly agentDir?: string
  readonly mountedKnowledgeBaseRoot?: string
  readonly workspaceRoot?: string
  readonly reasoningExecutor?: ReasoningExecutor
  readonly modelRuntime?: ModelRuntime
  readonly model?: Model<Api>
  readonly sessionManager?: SessionManager
  readonly settingsManager?: SettingsManager
  readonly resourceLoader?: DefaultResourceLoader
  /** Runtime-scoped services reused when Pi replaces the active conversation. */
  readonly applicationServices?: ResearchHubApplicationServices
  readonly sessionStartEvent?: import('@earendil-works/pi-coding-agent').SessionStartEvent
}

export interface ResearchHubPiSession {
  readonly session: AgentSession
  readonly extensionsResult: CreateAgentSessionResult['extensionsResult']
  readonly modelFallbackMessage?: string
  readonly services: AgentSessionServices
  readonly modelRuntime: ModelRuntime
  readonly agentDir: string
  readonly customTools: readonly ToolDefinition[]
  readonly bashIsolation: typeof BASH_ISOLATION_GAP | 'intercepted-explicit-paths'
  readonly knowledgeService: KnowledgeService
  readonly productionService: ProductionService
  readonly reviewService: ReviewService
  readonly workflowService: WorkflowService
  readonly workspaceRoot: string
}

function protectionExtension(root: string, cwd: string): ExtensionFactory {
  return (pi) => {
    pi.on('tool_call', async (event) => {
      if (event.toolName === 'write' || event.toolName === 'edit') {
        const path = typeof event.input.path === 'string' ? event.input.path : ''
        if (path && await isCanonicalKnowledgeBasePathSecure(path, root, cwd)) return { block: true, reason: protectedPathError(path).message }
      }
      if (event.toolName === 'bash' || event.toolName === 'powershell') {
        const command = typeof event.input.command === 'string' ? event.input.command : ''
        if (isCanonicalKnowledgeBasePath(cwd, root, cwd) || commandReferencesCanonicalKnowledgeBase(command, root, cwd)) return { block: true, reason: `${BASH_ISOLATION_GAP}: explicit canonical path command rejected; arbitrary shell path construction still requires process isolation` }
      }
      return undefined
    })
  }
}

export async function createResearchHubPiSession(options: ResearchHubPiSessionOptions): Promise<ResearchHubPiSession> {
  if (options.mountedKnowledgeBaseRoot !== undefined && options.resourceLoader !== undefined) throw new Error('A mounted Knowledge Base session cannot replace the resource loader security extension')
  const mountedKnowledgeBaseRoot = options.mountedKnowledgeBaseRoot === undefined ? undefined : resolve(options.mountedKnowledgeBaseRoot)
  const agentDir = resolve(options.agentDir ?? getAgentDir())
  const modelRuntime = options.modelRuntime ?? await ModelRuntime.create({ authPath: join(agentDir, 'auth.json'), modelsPath: join(agentDir, 'models.json'), allowModelNetwork: false, refreshOnCreate: false })
  const reasoningExecutor = options.reasoningExecutor ?? new PiReasoningExecutor({ modelRuntime, model: options.model })
  const applicationServices = options.applicationServices ?? (() => {
    const knowledgeService = new KnowledgeService(mountedKnowledgeBaseRoot)
    const reviewService = new ReviewService(mountedKnowledgeBaseRoot)
    const workflowService = new WorkflowService()
    const productionService = new ProductionService({ mountedKnowledgeBaseRoot, workspaceRoot: resolve(options.workspaceRoot ?? join(options.cwd, 'workspace')), cwd: options.cwd, reasoningExecutor, workflowService })
    return { knowledgeService, productionService, reviewService, workflowService }
  })()
  const { knowledgeService, productionService, reviewService, workflowService } = applicationServices
  const customTools = createResearchHubTools({ knowledgeService, productionService, reviewService, workflowService })
  const settingsManager = options.settingsManager ?? SettingsManager.create(options.cwd, agentDir, { projectTrusted: true })
  const loader = options.resourceLoader ?? new DefaultResourceLoader({ cwd: options.cwd, agentDir, settingsManager, systemPrompt: RESEARCHHUB_PI_SYSTEM_PROMPT, extensionFactories: mountedKnowledgeBaseRoot ? [protectionExtension(mountedKnowledgeBaseRoot, options.cwd)] : [] })
  if (!options.resourceLoader) await loader.reload()
  const services: AgentSessionServices = { cwd: resolve(options.cwd), agentDir, modelRuntime, settingsManager, resourceLoader: loader, diagnostics: [] }
  const result = await createAgentSessionFromServices({
    services,
    model: options.model,
    customTools,
    sessionManager: options.sessionManager ?? SessionManager.inMemory(options.cwd),
    sessionStartEvent: options.sessionStartEvent,
  })
  return { session: result.session, extensionsResult: result.extensionsResult, modelFallbackMessage: result.modelFallbackMessage, services, modelRuntime, agentDir, customTools, knowledgeService, productionService, reviewService, workflowService, workspaceRoot: resolve(options.workspaceRoot ?? join(options.cwd, 'workspace')), bashIsolation: mountedKnowledgeBaseRoot ? BASH_ISOLATION_GAP : 'intercepted-explicit-paths' }
}

export { BASH_ISOLATION_GAP }
