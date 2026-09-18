/**
 * Schema-neutral contracts for future deterministic financial-quality
 * calculations. This Wave 1 slice defines no calculation implementation.
 */

export interface FinancialQualityPeriodFacts {
  readonly period: string
  readonly daysInPeriod: number

  readonly revenue?: number
  readonly cogs?: number
  readonly netIncome?: number
  readonly cashFromOperations?: number
  readonly capex?: number

  readonly receivables?: number
  readonly inventory?: number
  readonly payables?: number
  readonly contractAssets?: number
  readonly deferredRevenue?: number
  readonly totalAssets?: number
}

export interface WorkingCapitalQualityResult {
  readonly period: string
  readonly dso?: number
  readonly dio?: number
  readonly dpo?: number
  readonly cashConversionCycle?: number
  readonly unavailableFields: readonly string[]
  readonly diagnostics: readonly string[]
}

export interface AccrualQualityResult {
  readonly period: string
  readonly accrualRatio?: number
  readonly unavailableReason?: string
  readonly diagnostics: readonly string[]
}

export interface CashConversionQualityResult {
  readonly period: string
  readonly cfoToNetIncome?: number
  readonly freeCashFlow?: number
  readonly fcfToNetIncome?: number
  readonly unavailableFields: readonly string[]
  readonly diagnostics: readonly string[]
}

export type RevenueRecognitionFlagCode =
  | 'receivables_outgrowing_sales'
  | 'contract_assets_outgrowing_sales'
  | 'sales_outgrowing_cfo'
  | 'context_dependent_deferred_revenue_divergence'

export interface RevenueRecognitionFlag {
  readonly code: RevenueRecognitionFlagCode
  readonly thresholdUsed: number
  readonly observedSpreadOrDifference: number
  readonly currentPeriod: FinancialQualityPeriodFacts
  readonly priorPeriod?: FinancialQualityPeriodFacts
  readonly explanation: string
}
