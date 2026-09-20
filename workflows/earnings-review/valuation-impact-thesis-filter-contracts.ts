import type { EarningsExpectationAnalysis } from './expectations-contracts.ts'
import type { ReasoningExecutor } from '../../plugins/reasoning/contracts.ts'

export type EarningsFindingKind =
  | 'actual_vs_consensus'
  | 'actual_vs_prior_estimate'
  | 'estimate_revision'
  | 'guidance_revision'
  | 'guidance_vs_consensus'
  | 'segment_kpi_prior'
  | 'segment_kpi_expectation'

export type ValuationInput = 'earnings' | 'revenue' | 'margin' | 'cash_flow' | 'growth' | 'multiple'
export type FindingDirection = 'above' | 'below' | 'in_line' | 'raised' | 'lowered' | 'mixed' | 'up' | 'down'
export type ThesisStatus = 'active' | 'strengthening' | 'weakening' | 'challenged'
export type ThesisEdgeType = 'supports' | 'contradicts' | 'depends_on' | 'qualifies' | 'invalidates' | 'challenges'
export type ThesisFindingClassificationCode = 'thesis_critical' | 'thesis_relevant' | 'thesis_irrelevant' | 'uncertain'
export type ThesisCriticality = 'load_bearing' | 'direct'
export type ThesisEffect = 'supports' | 'challenges' | 'mixed' | 'uncertain'

export interface FindingDelta {
  readonly dimension: string
  readonly absoluteDelta: number
  readonly relativeDelta?: number
}

export interface EarningsFinding {
  readonly findingId: string
  readonly kind: EarningsFindingKind
  readonly metric: string
  readonly fiscalPeriod: string
  readonly unit?: string
  readonly institutionKey?: string
  readonly direction: FindingDirection
  readonly relationship?: string
  readonly absoluteDelta?: number
  readonly relativeDelta?: number
  readonly deterministicDeltas: readonly FindingDelta[]
  readonly sourceCandidateIds: readonly string[]
  readonly summary: string
}

export interface ValuationImpactBridge {
  readonly findingId: string
  readonly metric: string
  readonly fiscalPeriod: string
  readonly surpriseOrRevision: number | null
  readonly deterministicDeltas: readonly FindingDelta[]
  readonly affectedValuationInputs: readonly ValuationInput[]
  readonly requiresValuationRefresh: boolean
  readonly rationale: string
  readonly rationaleRefs: readonly string[]
}

export interface EarningsThesisDependencyContext {
  readonly edgeRef: string
  readonly edgeType: ThesisEdgeType
  readonly sourceRef: string
  readonly sourceKind: 'claim' | 'observation'
  readonly statement?: string
  readonly claimType?: string
  readonly metric?: string
  readonly fiscalPeriod?: string
  readonly unit?: string
}

export interface EarningsThesisContext {
  readonly thesisRef: string
  readonly title: string
  readonly statement: string
  readonly status: ThesisStatus
  readonly dependencies: readonly EarningsThesisDependencyContext[]
  readonly truncated: boolean
}

export interface ThesisFilterContext {
  readonly theses: readonly EarningsThesisContext[]
  readonly diagnostics: readonly string[]
  readonly status: 'available' | 'unavailable' | 'truncated'
}

export interface ThesisImpact {
  readonly findingId: string
  readonly thesisRef: string
  readonly thesisTitle: string
  readonly thesisStatus: ThesisStatus
  readonly dependencyRef: string
  readonly dependencyKind: 'claim' | 'observation'
  readonly dependencyStatement?: string
  readonly reasoningEdgeRef: string
  readonly reasoningEdgeType: ThesisEdgeType
  readonly criticality: ThesisCriticality
  readonly effect: ThesisEffect
  readonly relation: 'challenges_dependency' | 'supports_dependency' | 'implicates_dependency'
  readonly rationale: string
}

export interface ThesisFindingClassification {
  readonly findingId: string
  readonly classification: ThesisFindingClassificationCode
  readonly matches: readonly ThesisImpact[]
  readonly unresolved: boolean
  readonly rationale: string
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

export interface EarningsValuationImpactAnalysis {
  readonly findings: readonly EarningsFinding[]
  readonly valuationImpacts: readonly ValuationImpactBridge[]
  readonly thesisImpacts: readonly ThesisImpact[]
  readonly thesisFindingClassifications: readonly ThesisFindingClassification[]
  readonly unmatchedFindingIds: readonly string[]
  readonly diagnostics: readonly string[]
  readonly thesisContextStatus: ThesisFilterContext['status']
  readonly thesisContextThesisCount: number
  readonly thesisDependencyCount: number
  readonly thesisFilterReasoning: ThesisFilterReasoning
}

export interface EarningsValuationImpactInput {
  readonly expectationAnalysis: EarningsExpectationAnalysis
  readonly thesisContext?: ThesisFilterContext
  readonly reasoningExecutor?: ReasoningExecutor
}

export interface SemanticFindingDecision {
  readonly findingId: string
  readonly matches: readonly {
    readonly thesisRef: string
    /** Bounded direct ReasoningEdge refs, not Claim/Observation source refs. */
    readonly dependencyRefs: readonly string[]
    readonly effect: ThesisEffect
    readonly rationale: string
  }[]
  readonly unresolved: boolean
}
