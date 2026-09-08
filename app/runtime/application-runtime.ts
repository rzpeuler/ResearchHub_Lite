import { join, resolve } from 'node:path'
import { getAgentDir, ModelRuntime, SessionManager } from '@earendil-works/pi-coding-agent'
import { PiReasoningExecutor } from '../../plugins/reasoning/pi/executor.ts'
import { selectProductionReasoningModel } from '../pi/model-selection.ts'
import { KnowledgeService } from '../services/knowledge-service.ts'
import { KnowledgeGraphService } from '../services/knowledge-graph-service.ts'
import { ProductionService } from '../services/production-service.ts'
import { ReviewService } from '../services/review-service.ts'
import { WorkflowService } from '../services/workflow-service.ts'
import { ResearchService } from '../services/research-service.ts'
import { CninfoOfficialDisclosureClient, OfficialDisclosureResearchPlugin } from '../../plugins/research-acquisition/official.ts'
import { GdeltResearchPlugin } from '../../plugins/research-acquisition/gdelt.ts'
import { AkshareDataAdapter } from '../../plugins/research-acquisition/akshare.ts'
import { FileResearchSignalStore } from '../../plugins/research-acquisition/signal-store.ts'
import { loadKnowledgeBaseManifest } from '../../knowledge/storage/manifest-loader.ts'
import { createResearchHubSessionRuntime, ResearchHubSessionRuntime } from './session-runtime.ts'
import { validateStorageRoots } from './storage-boundary.ts'
import type { ResearchHubApplicationRuntimeOptions, ResearchHubApplicationServices } from './contracts.ts'
import { DailyIntelligenceService } from '../services/daily-intelligence-service.ts'
import { RssResearchPlugin } from '../../plugins/research-acquisition/rss.ts'
import { PublicInstitutionalViewAcquisition, CommunitySignalAcquisition } from '../../plugins/daily-intelligence/acquisition.ts'
import { loadSourceCatalog } from '../../plugins/daily-intelligence/config.ts'
import { AkshareDailyMarketAcquisition } from '../../plugins/daily-intelligence/market.ts'
import { DailyBriefScheduler } from '../../plugins/daily-intelligence/scheduler.ts'
import { TradingCalendarService } from '../../plugins/daily-intelligence/calendar.ts'

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
  private readonly dailyScheduler?: DailyBriefScheduler
  private readonly dailySchedulerTimer?: NodeJS.Timeout
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
    readonly dailyScheduler?: DailyBriefScheduler
    readonly dailySchedulerTimer?: NodeJS.Timeout
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
    this.dailyScheduler = input.dailyScheduler
    this.dailySchedulerTimer = input.dailySchedulerTimer
  }

  static async create(options: ResearchHubApplicationRuntimeOptions): Promise<ResearchHubApplicationRuntime> {
    const cwd = resolve(options.cwd)
    const agentDir = resolve(options.agentDir ?? getAgentDir())
    const workspaceRoot = resolve(options.workspaceRoot ?? join(cwd, 'workspace'))
    const mountedKnowledgeBaseRoot = options.mountedKnowledgeBaseRoot === undefined ? undefined : resolve(options.mountedKnowledgeBaseRoot)
    if (mountedKnowledgeBaseRoot !== undefined) await validateStorageRoots(workspaceRoot, mountedKnowledgeBaseRoot)
    const ownsModelRuntime = options.modelRuntime === undefined
    const modelRuntime = options.modelRuntime ?? await ModelRuntime.create({ authPath: join(agentDir, 'auth.json'), modelsPath: join(agentDir, 'models.json'), allowModelNetwork: false, refreshOnCreate: false })
    const selectedModel = options.model ?? (options.modelRuntime === undefined ? selectProductionReasoningModel(modelRuntime) : undefined)
    const reasoningExecutor = options.reasoningExecutor ?? new PiReasoningExecutor({ modelRuntime, model: selectedModel })
    const knowledgeService = new KnowledgeService(mountedKnowledgeBaseRoot)
    const knowledgeGraphService = new KnowledgeGraphService(mountedKnowledgeBaseRoot)
    const reviewService = new ReviewService(mountedKnowledgeBaseRoot)
    const workflowService = new WorkflowService()
    const productionService = new ProductionService({ mountedKnowledgeBaseRoot, workspaceRoot, cwd, reasoningExecutor, workflowService })
    let researchService = options.researchService
    const catalog = await loadSourceCatalog(join(cwd, 'config', 'research-sources', 'catalog.yaml')).catch(() => [])
    const institutional = catalog.filter((item) => (item.category === 'institution' || item.category === 'analyst') && item.operationalStatus !== 'blocked').slice(0, 8).map((item) => new PublicInstitutionalViewAcquisition({ provider: item.platform, accountRef: `${item.platform}:${item.accountId}`, urls: item.discoveryUrl ? [item.discoveryUrl] : [item.evidenceUrl], tier: item.reliabilityTier, scope: 'broad' }))
    const community = catalog.filter((item) => item.category === 'community' && item.platform !== 'xueqiu').slice(0, 4).map((item) => new CommunitySignalAcquisition({ provider: item.platform, accountRef: `${item.platform}:${item.accountId}`, urls: item.discoveryUrl ? [item.discoveryUrl] : [item.evidenceUrl], tier: item.reliabilityTier }))
    const dailyIntelligenceService = options.dailyIntelligenceService ?? new DailyIntelligenceService({ cwd, workflowService, reasoningExecutor, mountedKnowledgeBaseRoot, providers: [new OfficialDisclosureResearchPlugin(new CninfoOfficialDisclosureClient()), new GdeltResearchPlugin(), new RssResearchPlugin({ feedUrls: ['https://www.gov.cn/rss/zhengce.xml'] }), new AkshareDailyMarketAcquisition(new AkshareDataAdapter()), ...institutional, ...community] })
    if (researchService === undefined && mountedKnowledgeBaseRoot !== undefined) {
      try { const manifest = await loadKnowledgeBaseManifest(mountedKnowledgeBaseRoot); if (manifest.schemaVersion === '0.4' && manifest.storageFormatVersion === '1') researchService = new ResearchService({ mountedKnowledgeBaseRoot, cwd, workflowService, reasoningExecutor, signalStore: new FileResearchSignalStore(join(cwd, 'runtime-data', 'research-signals.jsonl')), acquisitionPlugins: [new OfficialDisclosureResearchPlugin(new CninfoOfficialDisclosureClient()), new GdeltResearchPlugin()], akshare: new AkshareDataAdapter() }) } catch { /* the normal v0.3 runtime remains available without Company Research */ }
    }
    const services = { knowledgeService, knowledgeGraphService, reviewService, workflowService, productionService, ...(researchService === undefined ? {} : { researchService }), dailyIntelligenceService }
    const sessionManager = options.sessionManager ?? SessionManager.create(cwd, options.sessionDir)
    try {
      const sessionRuntime = await createResearchHubSessionRuntime({ cwd, agentDir, modelRuntime, sessionManager, applicationServices: services, mountedKnowledgeBaseRoot, workspaceRoot, model: selectedModel, reasoningExecutor, settingsManager: options.settingsManager, resourceLoader: options.resourceLoader, researchService, dailyIntelligenceService })
      const dailyScheduler = new DailyBriefScheduler({ statePath: join(cwd, 'runtime-data', 'daily-scheduler.json'), calendar: new TradingCalendarService({ cachePath: join(cwd, 'runtime-data', 'trading-calendar.json') }), run: async (briefType, tradeDate) => { const run = dailyIntelligenceService.startBrief({ workflowRunId: `scheduled-${briefType}-${tradeDate}`, briefType, tradeDate }); const result = await run.completion; return { status: result.status } } })
      const dailySchedulerTimer = setInterval(() => { void dailyScheduler.tick(new Date()) }, 60_000); dailySchedulerTimer.unref?.()
      return new ResearchHubApplicationRuntime({ cwd, agentDir, workspaceRoot, mountedKnowledgeBaseRoot, modelRuntime, sessionManager, services, sessionRuntime, ownsModelRuntime, dailyScheduler, dailySchedulerTimer })
    } catch (error) {
      if (ownsModelRuntime) await disposeModelRuntime(modelRuntime)
      throw error
    }
  }

  get knowledgeService(): KnowledgeService { return this.services.knowledgeService }
  get knowledgeGraphService(): KnowledgeGraphService { return this.services.knowledgeGraphService }
  get reviewService(): ReviewService { return this.services.reviewService }
  get workflowService(): WorkflowService { return this.services.workflowService }
  get productionService(): ProductionService { return this.services.productionService }
  get researchService() { return this.services.researchService }
  get dailyIntelligenceService() { return this.services.dailyIntelligenceService }
  get scheduler(): DailyBriefScheduler | undefined { return this.dailyScheduler }

  async close(): Promise<void> {
    if (this.closed) return
    let sessionError: unknown
    try {
      if (this.dailySchedulerTimer !== undefined) clearInterval(this.dailySchedulerTimer)
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
