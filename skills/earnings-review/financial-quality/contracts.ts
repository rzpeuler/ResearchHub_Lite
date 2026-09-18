/** Schema-neutral contracts for deterministic, report-only financial-quality analysis. */

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

export interface NormalizedFinancialQualityData {
  readonly current?: FinancialQualityPeriodFacts
  readonly opening?: FinancialQualityPeriodFacts
  readonly priorComparable?: FinancialQualityPeriodFacts
  readonly sourceCandidateId: string
  readonly diagnostics: readonly string[]
}

export interface WorkingCapitalAnalysisInput {
  readonly current: FinancialQualityPeriodFacts
  readonly opening: FinancialQualityPeriodFacts
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

export interface AccrualQualityInput {
  readonly current: FinancialQualityPeriodFacts
  readonly opening: FinancialQualityPeriodFacts
}

export interface AccrualQualityResult {
  readonly period: string
  readonly accrualRatio?: number
  readonly unavailableFields: readonly string[]
  readonly unavailableReason?: string
  readonly diagnostics: readonly string[]
}

export interface CashConversionAnalysisInput {
  readonly current: FinancialQualityPeriodFacts
}

export interface CashConversionQualityResult {
  readonly period: string
  readonly cfoToNetIncome?: number
  readonly freeCashFlow?: number
  readonly fcfToNetIncome?: number
  readonly unavailableFields: readonly string[]
  readonly diagnostics: readonly string[]
}

export interface RevenueRecognitionAnalysisInput {
  readonly current: FinancialQualityPeriodFacts
  readonly priorComparable: FinancialQualityPeriodFacts
  readonly threshold: number
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

export interface RevenueRecognitionAnalysisResult {
  readonly period: string
  readonly thresholdUsed: number
  readonly flags: readonly RevenueRecognitionFlag[]
  readonly unavailableComparisons: readonly string[]
  readonly diagnostics: readonly string[]
}

export interface EarningsFinancialQualitySummary {
  readonly period: string
  readonly sourceCandidateId: string
  readonly workingCapital: WorkingCapitalQualityResult
  readonly accrualQuality: AccrualQualityResult
  readonly cashConversion: CashConversionQualityResult
  readonly revenueRecognition: RevenueRecognitionAnalysisResult
  readonly diagnostics: readonly string[]
}
