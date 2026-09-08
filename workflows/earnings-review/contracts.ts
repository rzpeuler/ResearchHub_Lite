import type { KnowledgeBaseHandle } from '../../knowledge/storage/handle.ts'
import type { ResearchAcquisitionPlugin, ResearchCompanyIdentity, ResearchProviderOutcome } from '../../plugins/research-acquisition/contracts.ts'
import type { AkshareDataClient } from '../../plugins/research-acquisition/akshare.ts'
import type { ReasoningExecutor } from '../../plugins/reasoning/contracts.ts'
import type { EarningsPeriod, EarningsReviewReasoningTelemetry, EarningsReviewSection, EarningsImpactAssessment } from '../../skills/earnings-review/index.ts'

export interface EarningsReviewWorkflowInput {
  readonly workflowRunId: string
  readonly handle: KnowledgeBaseHandle
  readonly company: ResearchCompanyIdentity
  readonly fiscalYear: number
  readonly period: EarningsPeriod
  readonly asOf?: string
  readonly reportRoot: string
  readonly acquisitionPlugins: readonly ResearchAcquisitionPlugin[]
  readonly akshare?: AkshareDataClient
  readonly reasoningExecutor?: ReasoningExecutor
  readonly signal?: AbortSignal
  readonly now?: () => string
  readonly maxSources?: number
}

export interface EarningsReviewTelemetry {
  readonly reasoning: EarningsReviewReasoningTelemetry
  readonly assessmentCount: number
  readonly validAssessmentCount: number
  readonly durableAssessmentCount: number
  readonly proposalCandidateCount: number
  readonly acceptedProposalCount: number
  readonly canonicalSourceCount: number
  readonly canonicalClaimCount: number
  readonly officialEvidenceStatus: 'available' | 'unavailable' | 'future_filtered'
  readonly structuredFinancialEvidenceStatus: 'available' | 'unavailable'
  readonly consensusStatus: 'unavailable'
}

export interface EarningsReviewWorkflowResult {
  readonly workflowRunId: string
  readonly status: 'completed' | 'blocked' | 'cancelled' | 'failed'
  readonly knowledgeBaseId: string
  readonly knowledgeBaseRevision: number
  readonly report?: { readonly reportId: string; readonly outputPath: string }
  readonly proposalIds: readonly string[]
  readonly committedIds: readonly string[]
  readonly sourceIds: readonly string[]
  readonly claimIds: readonly string[]
  readonly errors: readonly string[]
  readonly selectionDiagnostics: readonly string[]
  readonly acquisitionDiagnostics: readonly { readonly provider: string; readonly candidateId?: string; readonly kind?: string; readonly status: string; readonly reason: string }[]
  readonly blockedReason?: 'COMPANY_COVERAGE_NOT_FOUND' | 'COMPANY_COVERAGE_AMBIGUOUS' | 'EARNINGS_PERIOD_EVIDENCE_UNAVAILABLE'
  readonly sections?: readonly EarningsReviewSection[]
  readonly assessments?: readonly EarningsImpactAssessment[]
  readonly telemetry: EarningsReviewTelemetry
  readonly providerOutcomes: readonly ResearchProviderOutcome[]
}
