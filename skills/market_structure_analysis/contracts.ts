export type MarketSizingMethod = 'top_down' | 'bottom_up' | 'supply_based' | 'demand_based' | 'mixed' | 'unavailable'

export interface MarketBoundary {
  readonly marketName: string
  readonly included: readonly string[]
  readonly excluded: readonly string[]
  readonly edgeCases: readonly string[]
  readonly geography: string
  readonly period: string
  readonly unit: string
  readonly sourceRefs: readonly string[]
}

export interface MarketSegmentation {
  readonly axis: string
  readonly values: readonly string[]
  readonly sourceRefs: readonly string[]
}

export interface MarketEstimate {
  readonly id: string
  readonly definition: string
  readonly geography: string
  readonly period: string
  readonly unit: string
  readonly method: MarketSizingMethod
  readonly value?: number
  readonly sourceRefs: readonly string[]
}

export interface ValueChainNode {
  readonly id: string
  readonly stage: 'upstream' | 'midstream' | 'downstream'
  readonly name: string
  readonly role: string
  readonly sourceRefs: readonly string[]
}

export interface MarketStructureInput {
  readonly marketRef: string
  readonly boundary: MarketBoundary
  readonly segmentation: MarketSegmentation
  readonly estimates: readonly MarketEstimate[]
  readonly valueChain: readonly ValueChainNode[]
  readonly asOf: string
}

export interface MarketEstimateReconciliation {
  readonly estimateIds: readonly string[]
  readonly comparable: boolean
  readonly differences: readonly string[]
  readonly conclusion: 'preserve_separately' | 'same_basis_conflict' | 'unavailable'
}

export interface MarketStructureResult {
  readonly status: 'complete' | 'partial' | 'unavailable'
  readonly marketRef: string
  readonly boundary: MarketBoundary
  readonly segmentation: MarketSegmentation
  readonly estimates: readonly MarketEstimate[]
  readonly reconciliations: readonly MarketEstimateReconciliation[]
  readonly valueChain: readonly ValueChainNode[]
  readonly diagnostics: readonly string[]
  readonly asOf: string
}
