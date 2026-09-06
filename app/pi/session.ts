import { join, resolve } from 'node:path'
import { ModelRuntime, DefaultResourceLoader, SessionManager, SettingsManager, createAgentSession, type AgentSession, type ToolDefinition, type ExtensionFactory } from '@earendil-works/pi-coding-agent'
import type { Model, Api } from '@earendil-works/pi-ai'
import type { ReasoningExecutor } from '../../plugins/reasoning/contracts.ts'
import { PiReasoningExecutor } from '../../plugins/reasoning/pi/executor.ts'
import { createResearchHubTools } from './tools.ts'
import { BASH_ISOLATION_GAP, isCanonicalKnowledgeBasePath, isCanonicalKnowledgeBasePathSecure, protectedPathError } from './security.ts'
import { RESEARCHHUB_PI_SYSTEM_PROMPT } from './system-prompt.ts'

export interface ResearchHubPiSessionOptions {
  readonly cwd: string
  readonly mountedKnowledgeBaseRoot?: string
  readonly reasoningExecutor?: ReasoningExecutor
  readonly modelRuntime?: ModelRuntime
  readonly model?: Model<Api>
  readonly sessionManager?: SessionManager
  readonly settingsManager?: SettingsManager
  readonly resourceLoader?: DefaultResourceLoader
}

export interface ResearchHubPiSession {
  readonly session: AgentSession
  readonly modelRuntime: ModelRuntime
  readonly customTools: readonly ToolDefinition[]
  readonly bashIsolation: typeof BASH_ISOLATION_GAP | 'intercepted-explicit-paths'
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
        const normalizedCommand = command.replaceAll('\\', '/').toLowerCase()
        const normalizedRoot = root.replaceAll('\\', '/').toLowerCase()
        if (isCanonicalKnowledgeBasePath(cwd, root, cwd) || normalizedCommand.includes(normalizedRoot)) return { block: true, reason: `${BASH_ISOLATION_GAP}: explicit canonical path command rejected; arbitrary shell path construction still requires process isolation` }
      }
      return undefined
    })
  }
}

export async function createResearchHubPiSession(options: ResearchHubPiSessionOptions): Promise<ResearchHubPiSession> {
  if (options.mountedKnowledgeBaseRoot !== undefined && options.resourceLoader !== undefined) throw new Error('A mounted Knowledge Base session cannot replace the resource loader security extension')
  const mountedKnowledgeBaseRoot = options.mountedKnowledgeBaseRoot === undefined ? undefined : resolve(options.mountedKnowledgeBaseRoot)
  const agentDir = join(options.cwd, '.pi', 'agent')
  const modelRuntime = options.modelRuntime ?? await ModelRuntime.create({ authPath: join(agentDir, 'auth.json'), modelsPath: null, allowModelNetwork: false, refreshOnCreate: false })
  const reasoningExecutor = options.reasoningExecutor ?? new PiReasoningExecutor({ modelRuntime, model: options.model })
  const customTools = createResearchHubTools({ mountedKnowledgeBaseRoot, reasoningExecutor })
  const settingsManager = options.settingsManager ?? SettingsManager.inMemory({ defaultProjectTrust: 'always' }, { projectTrusted: true })
  const loader = options.resourceLoader ?? new DefaultResourceLoader({ cwd: options.cwd, agentDir, settingsManager, systemPrompt: RESEARCHHUB_PI_SYSTEM_PROMPT, extensionFactories: mountedKnowledgeBaseRoot ? [protectionExtension(mountedKnowledgeBaseRoot, options.cwd)] : [] })
  if (!options.resourceLoader) await loader.reload()
  const result = await createAgentSession({
    cwd: options.cwd,
    agentDir,
    modelRuntime,
    model: options.model,
    customTools,
    resourceLoader: loader,
    sessionManager: options.sessionManager ?? SessionManager.inMemory(options.cwd),
    settingsManager,
  })
  return { session: result.session, modelRuntime, customTools, bashIsolation: mountedKnowledgeBaseRoot ? BASH_ISOLATION_GAP : 'intercepted-explicit-paths' }
}

export { BASH_ISOLATION_GAP }
