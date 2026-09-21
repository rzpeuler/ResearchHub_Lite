import type { EarningsFinancialQualitySummary, NormalizedFinancialQualityData } from '../earnings-review/financial-quality/contracts.ts'

export interface FinancialQualityAnalysisInput {
  readonly data: NormalizedFinancialQualityData
  readonly revenueRecognitionDivergenceThreshold: number
}

export interface FinancialQualityAnalysisResult {
  readonly status: 'complete' | 'partial' | 'unavailable'
  readonly period: string
  readonly sourceCandidateId: string
  readonly summary: EarningsFinancialQualitySummary
  readonly unavailableFields: readonly string[]
  readonly diagnostics: readonly string[]
}
