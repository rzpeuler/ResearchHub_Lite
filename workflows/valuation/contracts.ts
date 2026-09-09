import type { KnowledgeBaseHandle } from '../../knowledge/storage/handle.ts'
import type { AkshareDataClient } from '../../plugins/research-acquisition/akshare.ts'
import type { ReasoningExecutor } from '../../plugins/reasoning/contracts.ts'
import type { ResearchCompanyIdentity } from '../../plugins/research-acquisition/contracts.ts'
import type { ValuationComputation, ValuationAssumptionPlan, ValuationMethod, ValuationReasoningTelemetry, ValuationSynthesisOutput } from '../../skills/valuation/index.ts'

export interface ValuationWorkflowInput {
  readonly workflowRunId: string
  readonly handle: KnowledgeBaseHandle
  readonly company: ResearchCompanyIdentity
  readonly asOf?: string
  readonly methods?: readonly ValuationMethod[]
  readonly targetFiscalYear?: number
  readonly reportRoot: string
  readonly akshare?: AkshareDataClient
  readonly reasoningExecutor?: ReasoningExecutor
  readonly signal?: AbortSignal
  readonly now?: () => string
}

export interface ValuationProviderOutcome {
  readonly providerAttempted: boolean
  readonly transportSucceeded: boolean
  readonly companyBasicRowCount: number
  readonly financialRowCount: number
  readonly marketRowCount: number
  readonly marketPriceFound: boolean
  readonly fiscalYearBasisFound: boolean
  readonly peEligible: boolean
  readonly pbEligible: boolean
  readonly evEbitdaEligible: boolean
  readonly usableForValuation: boolean
}

export interface ValuationWorkflowResult {
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
  readonly blockedReason?: 'COMPANY_COVERAGE_NOT_FOUND' | 'COMPANY_COVERAGE_AMBIGUOUS' | 'VALUATION_MARKET_PRICE_UNAVAILABLE' | 'VALUATION_ASOF_IN_FUTURE' | 'VALUATION_TARGET_FISCAL_YEAR_INVALID'
  readonly diagnostics: readonly string[]
  readonly providerOutcome: ValuationProviderOutcome
  readonly basis?: ValuationComputation['basis']
  readonly plan?: ValuationAssumptionPlan
  readonly computation?: ValuationComputation
  readonly synthesis?: ValuationSynthesisOutput
  readonly telemetry: ValuationTelemetrySnapshot
}

export interface ValuationTelemetrySnapshot {
  readonly companyCoverageResolved: boolean
  readonly marketDataUsable: boolean
  readonly financialBasisUsable: boolean
  readonly pointInTimeVerified: boolean
  readonly eligibleMethods: readonly ValuationMethod[]
  readonly primaryMethod?: ValuationMethod
  readonly assumptionDesign: ValuationReasoningTelemetry
  readonly computation: { readonly scenarioCount: number; readonly calculatedScenarioCount: number; readonly sensitivityCellCount: number; readonly deterministicRecomputeStatus: 'matched' | 'unavailable' | 'mismatch' }
  readonly synthesis: ValuationReasoningTelemetry
  readonly modelDerivedInterpretiveSectionCount: number
  readonly proposalCandidateCount: number
  readonly acceptedProposalCount: number
  readonly canonicalSourceCount: number
  readonly canonicalClaimCount: number
}
