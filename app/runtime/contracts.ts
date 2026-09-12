import type { ModelRuntime, SessionManager, SettingsManager, DefaultResourceLoader } from '@earendil-works/pi-coding-agent'
import type { Api, Model } from '@earendil-works/pi-ai'
import type { KnowledgeService } from '../services/knowledge-service.ts'
import type { KnowledgeGraphService } from '../services/knowledge-graph-service.ts'
import type { ProductionService } from '../services/production-service.ts'
import type { ReviewService } from '../services/review-service.ts'
import type { WorkflowService } from '../services/workflow-service.ts'
import type { ResearchService } from '../services/research-service.ts'
import type { ReasoningExecutor } from '../../plugins/reasoning/contracts.ts'
import type { DailyIntelligenceService } from '../services/daily-intelligence-service.ts'

export interface SafeConversationSummary {
  readonly conversationId: string
  readonly name?: string
  readonly updatedAt: string
  readonly messageCount: number
  readonly isActive: boolean
}

export interface SafeConversationMessage {
  readonly role: 'user' | 'assistant' | 'tool'
  readonly content: string
  readonly timestamp?: string
  readonly toolName?: string
  readonly isError?: boolean
}

export interface CurrentSessionState {
  readonly conversationId: string
  readonly name?: string
  readonly isStreaming: boolean
  readonly isIdle: boolean
  readonly pendingMessageCount: number
  readonly thinkingLevel: string
  readonly model?: { readonly provider: string; readonly modelId: string }
}

export interface ResearchHubApplicationServices {
  readonly knowledgeService: KnowledgeService
  readonly knowledgeGraphService: KnowledgeGraphService
  readonly reviewService: ReviewService
  readonly workflowService: WorkflowService
  readonly productionService: ProductionService
  readonly researchService?: ResearchService
  readonly dailyIntelligenceService?: DailyIntelligenceService
}

export interface ResearchHubSessionRuntimeOptions {
  readonly cwd: string
  readonly agentDir: string
  readonly modelRuntime: ModelRuntime
  readonly sessionManager: SessionManager
  readonly applicationServices: ResearchHubApplicationServices
  readonly mountedKnowledgeBaseRoot?: string
  readonly workspaceRoot?: string
  readonly model?: Model<Api>
  readonly reasoningExecutor?: ReasoningExecutor
  readonly settingsManager?: SettingsManager
  readonly resourceLoader?: DefaultResourceLoader
  readonly researchService?: ResearchService
  readonly dailyIntelligenceService?: DailyIntelligenceService
}

export interface ResearchHubApplicationRuntimeOptions {
  readonly cwd: string
  readonly agentDir?: string
  readonly sessionDir?: string
  readonly mountedKnowledgeBaseRoot?: string
  readonly workspaceRoot?: string
  readonly modelRuntime?: ModelRuntime
  readonly sessionManager?: SessionManager
  readonly model?: Model<Api>
  readonly reasoningExecutor?: ReasoningExecutor
  /** Lazy, Industry-only production executor selection. It is never a fallback. */
  readonly industryReasoningExecutorFactory?: () => Promise<ReasoningExecutor>
  readonly settingsManager?: SettingsManager
  readonly resourceLoader?: DefaultResourceLoader
  readonly researchService?: ResearchService
  readonly dailyIntelligenceService?: DailyIntelligenceService
}
