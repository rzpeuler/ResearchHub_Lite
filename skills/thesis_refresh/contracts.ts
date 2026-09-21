export const REFRESH_EVIDENCE_RELATIONS = ['supports', 'weakens', 'contradicts', 'context', 'irrelevant'] as const
export type RefreshEvidenceRelation = typeof REFRESH_EVIDENCE_RELATIONS[number]
export const REFRESH_PROPOSITION_STATUSES = ['unchanged', 'strengthened', 'weakened', 'challenged', 'possible_invalidation', 'invalidation_condition_met', 'insufficient_evidence'] as const
export type RefreshPropositionStatus = typeof REFRESH_PROPOSITION_STATUSES[number]
export const REFRESH_TRANSITIONS = ['unchanged', 'strengthened', 'weakened', 'requires_review', 'possible_invalidation', 'invalidation_condition_met'] as const
export type ThesisRefreshTransition = typeof REFRESH_TRANSITIONS[number]
export const KILL_CRITERION_STATUSES = ['not_yet_observable', 'not_met', 'met', 'inconclusive', 'threshold_pending_evidence'] as const
export type KillCriterionStatus = typeof KILL_CRITERION_STATUSES[number]
export const KILL_OPERATORS = ['eq', 'gt', 'gte', 'lt', 'lte'] as const
export type KillCriterionOperator = typeof KILL_OPERATORS[number]

export interface RefreshPropositionSnapshot {
  readonly propositionId: string
  readonly statement: string
  readonly status?: string
  readonly loadBearing?: boolean
}

export interface PriorThesisSnapshot {
  readonly thesisId: string
  readonly priorAsOf: string
  readonly propositions: readonly RefreshPropositionSnapshot[]
}

export interface RefreshEvidence {
  readonly evidenceId: string
  readonly publishedAt: string
  readonly relation: RefreshEvidenceRelation
  readonly targetPropositionRefs: readonly string[]
  readonly sourceRefs: readonly string[]
  readonly basis?: 'verified_evidence' | 'inference' | 'hypothesis'
  readonly metric?: string
  readonly period?: string
  readonly unit?: string
  readonly value?: number
  readonly statement?: string
}

export interface KillCriterion {
  readonly conditionId: string
  readonly targetPropositionRefs: readonly string[]
  readonly observableMetric?: string
  readonly operator?: KillCriterionOperator
  readonly threshold?: number
  readonly period?: string
  readonly deadline?: string
  readonly sourceRequirement?: string
  readonly thresholdSourceRefs?: readonly string[]
  readonly status?: KillCriterionStatus
}

export interface ThesisRefreshInput {
  readonly priorSnapshot?: PriorThesisSnapshot
  readonly currentAsOf: string
  readonly evidence: readonly RefreshEvidence[]
  readonly killCriteria?: readonly KillCriterion[]
}

export interface RefreshEvidenceCandidate {
  readonly evidenceId: string
  readonly publishedAt: string
  readonly sourceRefs: readonly string[]
  readonly statement?: string
  readonly metric?: string
  readonly period?: string
  readonly unit?: string
  readonly value?: number
}

export interface ThesisRefreshSemanticInput {
  readonly priorSnapshot?: PriorThesisSnapshot
  readonly currentAsOf: string
  readonly evidence: readonly RefreshEvidenceCandidate[]
  readonly killCriteria?: readonly KillCriterion[]
}

export interface ThesisRefreshSemanticTelemetry {
  readonly called: boolean
  readonly validated: boolean
  readonly applied: boolean
  readonly fallbackUsed: boolean
  readonly repairAttempts: number
  readonly diagnostics: readonly string[]
}

export interface ThesisRefreshSemanticResult {
  readonly status: 'complete' | 'blocked'
  readonly result?: ThesisRefreshResult
  readonly diagnostics: readonly string[]
  readonly telemetry: ThesisRefreshSemanticTelemetry
}

export interface PropositionRefreshDelta {
  readonly propositionRef: string
  readonly previousStatus: string
  readonly newEvidenceRelation?: RefreshEvidenceRelation
  readonly supportChange: RefreshPropositionStatus
  readonly changedAssumption?: string
  readonly changedExpectation?: string
  readonly candidateStatus: RefreshPropositionStatus
  readonly sourceRefs: readonly string[]
  readonly rationale: string
}

export interface KillCriterionAssessment {
  readonly conditionId: string
  readonly status: KillCriterionStatus
  readonly targetPropositionRefs: readonly string[]
  readonly evidenceRefs: readonly string[]
  readonly rationale: string
}

export interface ThesisRefreshResult {
  readonly status: 'complete' | 'partial' | 'blocked'
  readonly thesisId?: string
  readonly priorAsOf?: string
  readonly currentAsOf: string
  readonly propositionDeltas: readonly PropositionRefreshDelta[]
  readonly unchangedPropositionRefs: readonly string[]
  readonly killCriterionAssessments: readonly KillCriterionAssessment[]
  readonly candidateTransition: ThesisRefreshTransition
  readonly diagnostics: readonly string[]
}

export class ThesisRefreshError extends Error {
  readonly code: string
  constructor(code: string, message = code) {
    super(message)
    this.name = 'ThesisRefreshError'
    this.code = code
  }
}
