export type CapitalActionType = 'organic_capex' | 'acquisition' | 'buyback' | 'dividend' | 'debt_repayment' | 'cash_accumulation' | 'R&D' | 'other'
export type CapitalValueAssessment = 'value_supported' | 'value_destroyed' | 'inconclusive'

export interface CapitalAction {
  readonly id: string
  readonly actionType: CapitalActionType
  readonly date: string
  readonly period: string
  readonly amount: number
  readonly unit: string
  readonly sourceRefs: readonly string[]
  readonly sharesBefore?: number
  readonly sharesAfter?: number
  readonly netDebtBefore?: number
  readonly netDebtAfter?: number
  readonly returnOnIncrementalCapital?: number
  readonly hurdleRate?: number
  readonly returnSourceRefs?: readonly string[]
  readonly hurdleSourceRefs?: readonly string[]
  readonly subsequentOutcome?: { readonly metric: string; readonly value: number; readonly unit: string; readonly sourceRefs: readonly string[] }
}

export interface CapitalAllocationContext {
  readonly currentRevenue?: number
  readonly currentNetIncome?: number
  readonly marketCapitalization?: number
  readonly sourceRefs: readonly string[]
}

export interface CapitalAllocationInput {
  readonly companyRef: string
  readonly period: string
  readonly actions: readonly CapitalAction[]
  readonly context?: CapitalAllocationContext
  readonly asOf: string
}

export interface CapitalMetric {
  readonly actionId: string
  readonly metric: 'capex_intensity' | 'dividend_payout' | 'buyback_yield' | 'net_debt_change' | 'acquisition_spend' | 'share_count_change'
  readonly value?: number
  readonly unit: string
  readonly sourceRefs: readonly string[]
  readonly status: 'available' | 'unavailable'
  readonly diagnostics: readonly string[]
}

export interface CapitalActionAssessment {
  readonly actionId: string
  readonly actionType: CapitalActionType
  readonly valueAssessment: CapitalValueAssessment
  readonly valueEvidence: {
    readonly actionAmountSourceRefs: readonly string[]
    readonly returnSourceRefs: readonly string[]
    readonly hurdleSourceRefs: readonly string[]
    readonly subsequentOutcomeSourceRefs: readonly string[]
  }
  readonly metrics: readonly CapitalMetric[]
  readonly diagnostics: readonly string[]
}

export interface CapitalAllocationResult {
  readonly status: 'complete' | 'partial' | 'unavailable'
  readonly companyRef: string
  readonly period: string
  readonly actions: readonly CapitalActionAssessment[]
  readonly diagnostics: readonly string[]
  readonly asOf: string
}
