import type { ComparableCompanyInput, ComparableCompanyResult, ComparableMultipleKind, ComparableMultipleSummary, ImpliedEquityFromEvMultipleResult } from '../valuation/calculations/contracts.ts'

export const COMPARABLE_PERIOD_KINDS = ['LTM', 'FY', 'NTM', 'FISCAL'] as const
export type ComparablePeriodKind = (typeof COMPARABLE_PERIOD_KINDS)[number]

export interface ComparablePeriod {
  readonly kind: ComparablePeriodKind
  readonly label: string
  readonly fiscalYear?: number
}

export const COMPARABILITY_DIMENSIONS = ['business_model', 'customer_decision', 'product_service', 'economics', 'growth_profile', 'margin_structure', 'capital_intensity', 'geography', 'scale'] as const
export type ComparabilityDimension = (typeof COMPARABILITY_DIMENSIONS)[number]

export interface ComparablePeerIdentity {
  readonly companyId: string
  readonly ticker: string
  readonly exchange: string
  readonly name?: string
}

export interface ComparableFinancials extends Omit<ComparableCompanyInput, 'id'> {
  readonly dilutedShares?: number
}

export interface ComparablePeerCandidate extends ComparablePeerIdentity {
  readonly retrievedAt: string
  readonly asOf: string
  readonly publishedAt?: string
  readonly sourceRefs: readonly string[]
  readonly period: ComparablePeriod
  readonly currency: string
  readonly metricUnits: Readonly<Partial<Record<'marketCap' | 'grossDebt' | 'cash' | 'revenue' | 'ebitda' | 'netIncome' | 'bookEquity' | 'freeCashFlow', string>>>
  readonly shareBasis: 'basic' | 'diluted'
  readonly comparabilityEvidence: readonly ComparabilityDimension[]
  readonly financials: ComparableFinancials
}

export interface ComparableTarget {
  readonly identity: ComparablePeerIdentity
  readonly period: ComparablePeriod
  readonly asOf: string
  readonly currency: string
  readonly metricUnits: Readonly<Partial<Record<'marketCap' | 'grossDebt' | 'cash' | 'revenue' | 'ebitda' | 'netIncome' | 'bookEquity' | 'freeCashFlow', string>>>
  readonly shareBasis: 'basic' | 'diluted'
  readonly financials: ComparableFinancials
}

export interface CompsValuationSelection {
  readonly method: ComparableMultipleKind
  readonly basis: 'peer_median' | 'peer_min' | 'peer_max' | 'explicit_user_assumption'
  readonly value?: number
}

export interface CompsValuationInput {
  readonly subject: ComparableTarget
  readonly asOf: string
  readonly candidatePeers: readonly ComparablePeerCandidate[]
  readonly sources: readonly { readonly candidate: { readonly candidateId: string; readonly publishedAt?: string }; readonly retrievedAt: string }[]
  readonly selection?: CompsValuationSelection
  readonly minimumPeerCount?: number
}

export interface ComparablePeerMetricDiagnostic {
  readonly method: ComparableMultipleKind
  readonly reasonCode: string
}

export interface AcceptedComparablePeer {
  readonly identity: ComparablePeerIdentity
  readonly sourceRefs: readonly string[]
  readonly period: ComparablePeriod
  readonly currency: string
  readonly result: ComparableCompanyResult
  readonly metricDiagnostics: readonly ComparablePeerMetricDiagnostic[]
}

export interface RejectedComparablePeer {
  readonly identity: Partial<ComparablePeerIdentity>
  readonly reasonCodes: readonly string[]
  readonly sourceRefs: readonly string[]
}

export interface CompsValuationResult {
  readonly subject: ComparableTarget
  readonly asOf: string
  readonly valuationBasis: ComparablePeriod
  readonly candidatePeers: readonly ComparablePeerIdentity[]
  readonly acceptedPeers: readonly AcceptedComparablePeer[]
  readonly rejectedPeers: readonly RejectedComparablePeer[]
  readonly multipleSummaries: readonly ComparableMultipleSummary[]
  readonly selectedMethod?: ComparableMultipleKind
  readonly selectedMultiple?: number
  readonly selectedMultipleBasis?: CompsValuationSelection['basis']
  readonly impliedValuation?: ImpliedEquityFromEvMultipleResult | { readonly impliedEquityValue: number; readonly valuePerShare: number }
  readonly diagnostics: readonly string[]
  readonly sourceRefs: readonly string[]
  readonly availability: 'available' | 'unavailable' | 'insufficient_data'
}

export const AUTOMATIC_PEER_COMPARISON_FAMILIES = ['GROWTH', 'VALUATION', 'DUPONT', 'SCALE'] as const
export type AutomaticPeerComparisonFamily = (typeof AUTOMATIC_PEER_COMPARISON_FAMILIES)[number]

export interface AutomaticPeerCohortMembership {
  readonly family: AutomaticPeerComparisonFamily
  readonly reportDate?: string
  readonly reportType?: string
  readonly sourceRef: string
}

export interface AutomaticPeerScaleProfile {
  readonly marketCap?: number
  readonly freeFloatMarketCap?: number
  readonly marketCapToSubject?: number
}

export interface AutomaticPeerGrowthProfile {
  readonly revenueGrowth3Y?: number
  readonly netProfitGrowth3Y?: number
  readonly epsGrowth3Y?: number
}

export interface AutomaticPeerProfitabilityProfile {
  readonly roe?: number
  readonly netMargin?: number
  readonly assetTurnover?: number
}

export interface AutomaticComparablePeer {
  readonly identity: ComparablePeerIdentity
  readonly cohortFamilyCount: number
  readonly cohortMembership: readonly AutomaticPeerCohortMembership[]
  readonly scale: AutomaticPeerScaleProfile
  readonly growth?: AutomaticPeerGrowthProfile
  readonly profitability?: AutomaticPeerProfitabilityProfile
  readonly marketPrice?: number
  readonly marketPriceDate?: string
  readonly eps?: number
  readonly bvps?: number
  readonly multipleBasisFiscalYear: number
  readonly sourceRefs: readonly string[]
  readonly diagnostics: readonly string[]
}

export interface AutomaticComparableSubject {
  readonly identity: ComparablePeerIdentity
  readonly marketCap?: number
  readonly sourceRefs: readonly string[]
}

export interface AutomaticMultipleSummary {
  readonly method: 'PE' | 'PB'
  readonly validCount: number
  readonly min?: number
  readonly median?: number
  readonly max?: number
  readonly peerRefs: readonly string[]
}

export interface AutomaticRejectedPeer {
  readonly identity: Partial<ComparablePeerIdentity>
  readonly reasonCodes: readonly string[]
  readonly sourceRefs: readonly string[]
}

export interface AutomaticEquityCompsResult {
  readonly availability: 'available' | 'unavailable' | 'insufficient_data'
  readonly subject: AutomaticComparableSubject
  readonly selectedMethod: 'PE' | 'PB'
  readonly multipleBasisFiscalYear: number
  readonly targetFiscalYear: number
  readonly valuationDate: string
  readonly targetForecastMetric?: number
  readonly validPeers: readonly AutomaticComparablePeer[]
  readonly rejectedPeers: readonly AutomaticRejectedPeer[]
  readonly multipleSummaries: readonly AutomaticMultipleSummary[]
  readonly selectedMedian?: number
  readonly impliedTargetPrice?: number
  readonly sourceRefs: readonly string[]
  readonly diagnostics: readonly string[]
  readonly candidatePeerCount: number
  readonly expensiveValidationCount: number
}

export interface AutomaticEquityCompsInput {
  readonly subject: AutomaticComparableSubject
  readonly selectedMethod: 'PE' | 'PB'
  readonly multipleBasisFiscalYear: number
  readonly targetFiscalYear: number
  readonly valuationDate: string
  readonly targetForecastMetric: number
  readonly peers: readonly AutomaticComparablePeer[]
  readonly rejectedPeers?: readonly AutomaticRejectedPeer[]
  readonly sourceRefs?: readonly string[]
}
