export type ManagementTargetType = 'numeric_range' | 'numeric_at_least' | 'numeric_at_most' | 'qualitative'
export type ExecutionAssessment = 'met' | 'partially_met' | 'not_met' | 'not_yet_observable' | 'inconclusive'

export interface ManagementCommitment {
  readonly id: string
  readonly statement: string
  readonly speaker: string
  readonly publishedAt: string
  readonly targetMetric: string
  readonly targetPeriod: string
  readonly targetEndDate?: string
  readonly targetType: ManagementTargetType
  readonly targetUnit?: string
  readonly targetLow?: number
  readonly targetHigh?: number
  readonly qualitativeCondition?: string
  readonly sourceRefs: readonly string[]
}

export interface ManagementOutcome {
  readonly commitmentId: string
  readonly period: string
  readonly observedAt: string
  readonly value?: number
  readonly unit?: string
  readonly qualitativeResult?: 'met' | 'partially_met' | 'not_met'
  readonly statement?: string
  readonly sourceRefs: readonly string[]
}

export interface ManagementExecutionInput {
  readonly companyRef: string
  readonly commitments: readonly ManagementCommitment[]
  readonly outcomes: readonly ManagementOutcome[]
  readonly asOf: string
}

export interface ManagementExecutionAssessment {
  readonly commitmentId: string
  readonly targetMetric: string
  readonly targetPeriod: string
  readonly assessment: ExecutionAssessment
  readonly target?: { readonly low?: number; readonly high?: number; readonly unit?: string }
  readonly outcome?: { readonly value?: number; readonly unit?: string; readonly statement?: string }
  readonly sourceRefs: readonly string[]
  readonly diagnostics: readonly string[]
}

export interface ManagementExecutionResult {
  readonly status: 'complete' | 'partial' | 'unavailable'
  readonly companyRef: string
  readonly assessments: readonly ManagementExecutionAssessment[]
  readonly diagnostics: readonly string[]
  readonly asOf: string
}
