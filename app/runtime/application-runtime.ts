import { join, resolve } from 'node:path'
import { getAgentDir, ModelRuntime, SessionManager } from '@earendil-works/pi-coding-agent'
import { PiReasoningExecutor } from '../../plugins/reasoning/pi/executor.ts'
import { KnowledgeService } from '../services/knowledge-service.ts'
import { ProductionService } from '../services/production-service.ts'
import { ReviewService } from '../services/review-service.ts'
import { WorkflowService } from '../services/workflow-service.ts'
import { createResearchHubSessionRuntime, ResearchHubSessionRuntime } from './session-runtime.ts'
import { validateStorageRoots } from './storage-boundary.ts'
import type { ResearchHubApplicationRuntimeOptions, ResearchHubApplicationServices } from './contracts.ts'

export class ResearchHubApplicationRuntime {
  readonly cwd: string
  readonly agentDir: string
  readonly workspaceRoot: string
  readonly mountedKnowledgeBaseRoot?: string
  readonly modelRuntime: ModelRuntime
  readonly sessionManager: SessionManager
  readonly services: ResearchHubApplicationServices
  readonly sessionRuntime: ResearchHubSessionRuntime
  private readonly ownsModelRuntime: boolean
  private closed = false

  private constructor(input: {
    readonly cwd: string
    readonly agentDir: string
    readonly workspaceRoot: string
    readonly mountedKnowledgeBaseRoot?: string
    readonly modelRuntime: ModelRuntime
    readonly sessionManager: SessionManager
    readonly services: ResearchHubApplicationServices
    readonly sessionRuntime: ResearchHubSessionRuntime
    readonly ownsModelRuntime: boolean
  }) {
    this.cwd = input.cwd
    this.agentDir = input.agentDir
    this.workspaceRoot = input.workspaceRoot
    this.mountedKnowledgeBaseRoot = input.mountedKnowledgeBaseRoot
    this.modelRuntime = input.modelRuntime
    this.sessionManager = input.sessionManager
    this.services = input.services
    this.sessionRuntime = input.sessionRuntime
    this.ownsModelRuntime = input.ownsModelRuntime
  }

  static async create(options: ResearchHubApplicationRuntimeOptions): Promise<ResearchHubApplicationRuntime> {
    const cwd = resolve(options.cwd)
    const agentDir = resolve(options.agentDir ?? getAgentDir())
    const workspaceRoot = resolve(options.workspaceRoot ?? join(cwd, 'workspace'))
    const mountedKnowledgeBaseRoot = options.mountedKnowledgeBaseRoot === undefined ? undefined : resolve(options.mountedKnowledgeBaseRoot)
    if (mountedKnowledgeBaseRoot !== undefined) await validateStorageRoots(workspaceRoot, mountedKnowledgeBaseRoot)
    const ownsModelRuntime = options.modelRuntime === undefined
    const modelRuntime = options.modelRuntime ?? await ModelRuntime.create({ authPath: join(agentDir, 'auth.json'), modelsPath: join(agentDir, 'models.json'), allowModelNetwork: false, refreshOnCreate: false })
    const reasoningExecutor = options.reasoningExecutor ?? new PiReasoningExecutor({ modelRuntime, model: options.model })
    const knowledgeService = new KnowledgeService(mountedKnowledgeBaseRoot)
    const reviewService = new ReviewService(mountedKnowledgeBaseRoot)
    const workflowService = new WorkflowService()
    const productionService = new ProductionService({ mountedKnowledgeBaseRoot, workspaceRoot, cwd, reasoningExecutor, workflowService })
    const services = { knowledgeService, reviewService, workflowService, productionService }
    const sessionManager = options.sessionManager ?? SessionManager.create(cwd, options.sessionDir)
    try {
      const sessionRuntime = await createResearchHubSessionRuntime({ cwd, agentDir, modelRuntime, sessionManager, applicationServices: services, mountedKnowledgeBaseRoot, workspaceRoot, model: options.model, reasoningExecutor, settingsManager: options.settingsManager, resourceLoader: options.resourceLoader })
      return new ResearchHubApplicationRuntime({ cwd, agentDir, workspaceRoot, mountedKnowledgeBaseRoot, modelRuntime, sessionManager, services, sessionRuntime, ownsModelRuntime })
    } catch (error) {
      if (ownsModelRuntime) await disposeModelRuntime(modelRuntime)
      throw error
    }
  }

  get knowledgeService(): KnowledgeService { return this.services.knowledgeService }
  get reviewService(): ReviewService { return this.services.reviewService }
  get workflowService(): WorkflowService { return this.services.workflowService }
  get productionService(): ProductionService { return this.services.productionService }

  async close(): Promise<void> {
    if (this.closed) return
    let sessionError: unknown
    try {
      await this.sessionRuntime.dispose()
    } catch (error) {
      sessionError = error
    } finally {
      if (this.ownsModelRuntime) {
        try {
          await disposeModelRuntime(this.modelRuntime)
        } catch (error) {
          if (sessionError === undefined) sessionError = error
          else sessionError = new AggregateError([sessionError, error], 'Application runtime disposal failed')
        }
      }
    }
    if (sessionError !== undefined) throw sessionError
    this.closed = true
  }

  async dispose(): Promise<void> { return this.close() }
}

async function disposeModelRuntime(modelRuntime: ModelRuntime): Promise<void> {
  const candidate = modelRuntime as unknown as { readonly dispose?: () => void | Promise<void> }
  if (typeof candidate.dispose === 'function') await candidate.dispose()
}

export async function createResearchHubApplicationRuntime(options: ResearchHubApplicationRuntimeOptions): Promise<ResearchHubApplicationRuntime> { return ResearchHubApplicationRuntime.create(options) }
