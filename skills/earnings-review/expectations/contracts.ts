/** Schema-neutral research contracts for point-in-time earnings expectations. */

export type ExpectationMetric = 'revenue' | 'net_profit' | 'eps' | 'gross_margin' | (string & {})

export interface EstimatePoint {
  readonly estimateId: string
  readonly metric: ExpectationMetric
  readonly fiscalPeriod: string
  readonly value: number
  readonly unit: string
  readonly institutionKey: string
  readonly analystKey?: string
  readonly publishedAt: string
  readonly estimateHorizon?: string
  readonly sourceCandidateIds: readonly string[]
}

export interface ConsensusSnapshot {
  readonly metric: ExpectationMetric
  readonly fiscalPeriod: string
  readonly unit: string
  readonly asOf: string
  readonly mean: number
  readonly median: number
  readonly high: number
  readonly low: number
  readonly count: number
  readonly dispersion?: number
  readonly contributingEstimateIds: readonly string[]
}

export interface ActualMetricPoint {
  readonly metric: ExpectationMetric
  readonly fiscalPeriod: string
  readonly value: number
  readonly unit: string
  readonly sourceCandidateIds: readonly string[]
}

export type ExpectationBenchmarkType = 'consensus' | 'prior_estimate' | 'guidance_midpoint'
export type ExpectationDirection = 'above' | 'below' | 'in_line'

export interface ExpectationBenchmark {
  readonly metric: ExpectationMetric
  readonly fiscalPeriod: string
  readonly value: number
  readonly unit: string
  readonly benchmarkType: ExpectationBenchmarkType
}

export interface ActualVsExpectationResult {
  readonly metric: ExpectationMetric
  readonly fiscalPeriod: string
  readonly actual: number
  readonly benchmark: number
  readonly absoluteDelta: number
  readonly relativeDelta?: number
  readonly direction: ExpectationDirection
  readonly benchmarkType: ExpectationBenchmarkType
}

export interface EstimateRevisionResult {
  readonly metric: ExpectationMetric
  readonly fiscalPeriod: string
  readonly institutionKey: string
  readonly oldValue: number
  readonly newValue: number
  readonly absoluteRevision: number
  readonly relativeRevision?: number
  readonly oldPublishedAt: string
  readonly newPublishedAt: string
}

export interface EstimateSelectionInput {
  readonly estimates: readonly EstimatePoint[]
  readonly metric: ExpectationMetric
  readonly fiscalPeriod: string
  readonly asOf: string
}

export interface EstimateSelectionResult {
  readonly selected: readonly EstimatePoint[]
  readonly excludedEstimateIds: readonly string[]
  readonly diagnostics: readonly string[]
}

export interface ConsensusCalculationInput extends EstimateSelectionInput {
  readonly minimumCount: number
}

export interface ConsensusCalculationResult {
  readonly snapshot?: ConsensusSnapshot
  readonly selectedEstimates: readonly EstimatePoint[]
  readonly diagnostics: readonly string[]
}

export interface PriorEstimateSelectionInput {
  readonly estimates: readonly EstimatePoint[]
  readonly metric: ExpectationMetric
  readonly fiscalPeriod: string
  readonly institutionKey: string
  readonly beforePublishedAt: string
  readonly analysisAsOf: string
}

export interface ActualVsPriorEstimateInput {
  readonly actual: ActualMetricPoint
  readonly estimates: readonly EstimatePoint[]
  readonly institutionKey: string
  readonly comparisonCutoff: string
}

export interface EstimateRevisionInput {
  readonly oldEstimate: EstimatePoint
  readonly newEstimate: EstimatePoint
}
