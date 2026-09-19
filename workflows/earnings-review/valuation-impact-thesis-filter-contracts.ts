import type { KnowledgeClaimV04, KnowledgeObservationV04, KnowledgeReasoningEdgeV04, KnowledgeThesisV04 } from '../../knowledge/schema/domain-v04.ts'
import type { EarningsExpectationAnalysis } from './expectations-contracts.ts'
import type { ReasoningExecutor } from '../../plugins/reasoning/contracts.ts'

export type EarningsFindingKind =
  | 'actual_vs_consensus'
  | 'actual_vs_prior_estimate'
  | 'estimate_revision'
  | 'guidance_revision'
  | 'guidance_vs_consensus'
  | 'segment_kpi_delta'

export type ValuationInput = 'earnings' | 'revenue' | 'margin' | 'cash_flow' | 'growth' | 'multiple'

export type FindingDirection = 'above' | 'below' | 'in_line' | 'raised' | 'lowered' | 'mixed' | 'up' | 'down'

export interface EarningsFinding {
  readonly findingId: string
  readonly kind: EarningsFindingKind
  readonly metric: string
  readonly fiscalPeriod: string
  readonly unit?: string
  readonly direction: FindingDirection
  readonly absoluteDelta?: number
  readonly relativeDelta?: number
  readonly sourceCandidateIds: readonly string[]
  readonly summary: string
}

export interface ValuationImpactBridge {
  readonly findingId: string
  readonly metric: string
  readonly fiscalPeriod: string
  readonly surpriseOrRevision: number | null
  readonly affectedValuationInputs: readonly ValuationInput[]
  readonly requiresValuationRefresh: boolean
  readonly rationale: string
  readonly rationaleRefs: readonly string[]
}

export type ThesisImpactRelation = 'challenges_dependency' | 'supports_dependency' | 'implicates_dependency'

export interface ThesisImpact {
  readonly thesisRef: KnowledgeThesisV04['id']
  readonly thesisTitle: string
  readonly thesisStatus: KnowledgeThesisV04['status']
  readonly dependencyRef: KnowledgeClaimV04['id'] | KnowledgeObservationV04['id']
  readonly dependencyKind: 'claim' | 'observation'
  readonly dependencyStatement: string
  readonly reasoningEdgeRef: KnowledgeReasoningEdgeV04['id']
  readonly reasoningEdgeType: KnowledgeReasoningEdgeV04['type']
  readonly findingIds: readonly string[]
  readonly relation: ThesisImpactRelation
  readonly rationale: string
}

export interface ThesisFilterContext {
  readonly theses: readonly KnowledgeThesisV04[]
  readonly claims: readonly KnowledgeClaimV04[]
  readonly observations: readonly KnowledgeObservationV04[]
  readonly reasoningEdges: readonly KnowledgeReasoningEdgeV04[]
}

export interface EarningsValuationImpactAnalysis {
  readonly findings: readonly EarningsFinding[]
  readonly valuationImpacts: readonly ValuationImpactBridge[]
  readonly thesisImpacts: readonly ThesisImpact[]
  readonly unmatchedFindingIds: readonly string[]
  readonly diagnostics: readonly string[]
  readonly thesisFilterReasoning?: ThesisFilterReasoning
}

export interface ThesisFilterReasoning {
  readonly called: boolean
  readonly validated: boolean
  readonly applied: boolean
  readonly fallbackUsed: boolean
  readonly repairAttempts: number
  readonly operation: 'earnings_expectation_thesis_filter'
  readonly diagnostic?: string
}

export interface EarningsValuationImpactInput {
  readonly expectationAnalysis: EarningsExpectationAnalysis
  readonly thesisContext?: ThesisFilterContext
  readonly reasoningExecutor?: ReasoningExecutor
}
