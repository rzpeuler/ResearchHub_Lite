/**
 * Schema-neutral contracts for future deterministic valuation calculations.
 *
 * These types describe research-domain inputs and outputs only. Formula
 * implementations and product integration belong to a later Wave 1 task.
 */

export interface CapmInput {
  readonly riskFreeRate: number
  readonly beta: number
  readonly equityRiskPremium: number
}

export interface CapmResult {
  readonly costOfEquity: number
}

export interface AfterTaxCostOfDebtInput {
  readonly pretaxCostOfDebt: number
  readonly taxRate: number
}

export interface AfterTaxCostOfDebtResult {
  readonly afterTaxCostOfDebt: number
}

export interface WaccInput {
  readonly marketValueEquity: number
  readonly grossDebt: number
  readonly costOfEquity: number
  readonly pretaxCostOfDebt: number
  readonly taxRate: number
}

export interface WaccResult {
  readonly wacc: number
  readonly equityWeight: number
  readonly debtWeight: number
  readonly costOfEquity: number
  readonly afterTaxCostOfDebt: number
}

export interface FcffForecastPeriodInput {
  readonly fiscalYear: number
  readonly revenue: number
  readonly ebitMargin: number
  readonly taxRate: number
  readonly depreciationAndAmortization: number
  readonly capex: number
  readonly changeInNwc: number
}

export interface FcffForecastPeriodResult extends FcffForecastPeriodInput {
  readonly ebit: number
  readonly nopat: number
  readonly fcff: number
}

export interface DcfInput {
  readonly fcff: readonly number[]
  readonly discountRate: number
  readonly terminalGrowthRate: number
  readonly midYearConvention?: boolean
}

export interface DcfResult {
  readonly enterpriseValue: number
  readonly pvExplicitFcff: number
  readonly terminalValueAtHorizon: number
  readonly pvTerminalValue: number
  readonly terminalValueShare: number
  readonly terminalImpliedPriceToFcff: number | null
  readonly discountPeriods: readonly number[]
}

export interface EnterpriseToEquityInput {
  readonly enterpriseValue: number
  readonly cashAndEquivalents: number
  readonly grossDebt: number
  readonly dilutedShares?: number
  readonly nonOperatingAssets?: number
  readonly preferredStock?: number
  readonly minorityInterest?: number
  readonly unfundedPension?: number
}

export interface EnterpriseToEquityResult {
  readonly equityValue: number
  readonly valuePerShare?: number
}

export interface ReverseDcfInput {
  readonly currentEnterpriseValue: number
  readonly explicitFcff: readonly number[]
  readonly discountRate: number
  readonly terminalGrowthRate: number
  readonly currentRevenue?: number
  readonly steadyStateFcffMargin?: number
}

export interface ReverseDcfResult {
  readonly impliedTerminalFcff: number
  readonly impliedTerminalRevenue?: number
  readonly impliedRevenueCagr?: number
}

export interface ComparableCompanyInput {
  readonly id: string
  readonly marketCap: number
  readonly grossDebt: number
  readonly cash: number
  readonly revenue?: number
  readonly ebitda?: number
  readonly netIncome?: number
  readonly bookEquity?: number
  readonly freeCashFlow?: number
  readonly preferredStock?: number
  readonly minorityInterest?: number
}

export type ComparableMultipleKind = 'EV_REVENUE' | 'EV_EBITDA' | 'PE' | 'PB' | 'FCF_YIELD'

export interface ComparableCompanyResult {
  readonly id: string
  readonly enterpriseValue: number
  readonly evRevenue?: number
  readonly evEbitda?: number
  readonly pe?: number
  readonly pb?: number
  readonly fcfYield?: number
  readonly invalidReasons: readonly string[]
}

export interface ComparableMultipleSummary {
  readonly kind: ComparableMultipleKind
  readonly min: number
  readonly median: number
  readonly max: number
  readonly validCount: number
  readonly rejectedCount: number
}

export interface ComparableCompanyRejection {
  readonly id: string
  readonly reasons: readonly string[]
}

export interface ComparableSetResult {
  readonly peers: readonly ComparableCompanyResult[]
  readonly summaries: readonly ComparableMultipleSummary[]
  readonly validPeerCount: number
  readonly rejectedPeerCount: number
  readonly rejections: readonly ComparableCompanyRejection[]
}

export interface ImpliedEquityFromEvMultipleInput {
  readonly metric: number
  readonly selectedMultiple: number
  readonly grossDebt: number
  readonly cash: number
  readonly dilutedShares: number
  readonly preferredStock?: number
  readonly minorityInterest?: number
}

export interface ImpliedEquityFromEvMultipleResult {
  readonly impliedEnterpriseValue: number
  readonly equityValue: number
  readonly valuePerShare: number
}

export interface DcfSensitivityCell {
  readonly discountRate: number
  readonly terminalGrowthRate: number
  readonly status: 'available' | 'unavailable'
  readonly enterpriseValue?: number
  readonly errorCode?: string
}

export interface DcfSensitivityResult {
  readonly discountRates: readonly number[]
  readonly terminalGrowthRates: readonly number[]
  readonly cells: readonly DcfSensitivityCell[]
}

export interface ValuationQcInput {
  readonly discountRate: number
  readonly terminalGrowthRate: number
  readonly terminalValueShare?: number
  readonly values?: readonly number[]
}

export type ValuationQcSeverity = 'critical' | 'warning' | 'info'

export interface ValuationQcIssue {
  readonly code: string
  readonly severity: ValuationQcSeverity
  readonly message: string
}
