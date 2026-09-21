export type IndicatorDirection = 'up' | 'down' | 'flat' | 'mixed' | 'unknown'
export type CycleState = 'unknown' | 'expansion' | 'oversupply' | 'destocking' | 'bottoming' | 'restocking' | 'tightening' | 'shortage' | 'normalization'
export type InflectionClassification = 'possible_inflection' | 'confirmed_inflection' | 'no_evidence' | 'insufficient_data'

export interface DemandIndicator {
  readonly id: string
  readonly kind: 'end_demand' | 'penetration' | 'replacement' | 'orders' | 'bookings' | 'backlog' | 'channel_restocking' | 'regulatory_demand' | 'technology_transition'
  readonly direction: IndicatorDirection
  readonly period: string
  readonly sourceRefs: readonly string[]
  readonly confidence: 'high' | 'medium' | 'low' | 'unknown'
  readonly availability: 'reported' | 'unavailable'
}

export interface CapacityObservation {
  readonly id: string
  readonly state: 'announced' | 'under_construction' | 'installed' | 'commissioned' | 'effective'
  readonly change: IndicatorDirection
  readonly value?: number
  readonly unit: string
  readonly period: string
  readonly sourceRefs: readonly string[]
  readonly adjustments?: { readonly closure?: number; readonly maintenance?: number; readonly yield?: number; readonly qualification?: number; readonly ramp?: number }
}

export interface UtilizationObservation {
  readonly period: string
  readonly reportedValue?: number
  readonly outputValue?: number
  readonly capacityValue?: number
  readonly unit: string
  readonly sourceRefs: readonly string[]
}

export interface InventoryObservation {
  readonly id: string
  readonly kind: 'producer_inventory' | 'channel_inventory' | 'customer_inventory'
  readonly direction: IndicatorDirection
  readonly level?: number
  readonly days?: number
  readonly unit: string
  readonly period: string
  readonly hasHistory: boolean
  readonly sourceRefs: readonly string[]
}

export interface PricingObservation {
  readonly id: string
  readonly kind: 'ASP' | 'spot_price' | 'contract_price' | 'spread' | 'input_price' | 'output_price'
  readonly direction: IndicatorDirection
  readonly currentValue?: number
  readonly priorValue?: number
  readonly unit: string
  readonly period: string
  readonly priorPeriod?: string
  readonly sourceRefs: readonly string[]
}

export interface IndustrySupplyDemandCycleInput {
  readonly industryRef: string
  readonly asOf: string
  readonly demand: readonly DemandIndicator[]
  readonly capacity: readonly CapacityObservation[]
  readonly utilization?: UtilizationObservation
  readonly inventory: readonly InventoryObservation[]
  readonly pricing: readonly PricingObservation[]
}

export interface CycleEvidence {
  readonly id: string
  readonly category: 'demand' | 'capacity' | 'utilization' | 'inventory' | 'pricing'
  readonly direction: IndicatorDirection
  readonly sourceRefs: readonly string[]
  readonly role: 'leading' | 'confirming' | 'contradicting'
}

export interface IndustrySupplyDemandCycleResult {
  readonly status: 'complete' | 'partial' | 'unavailable'
  readonly industryRef: string
  readonly state: CycleState
  readonly inflection: InflectionClassification
  readonly leadingIndicators: readonly CycleEvidence[]
  readonly confirmingIndicators: readonly CycleEvidence[]
  readonly contradictingIndicators: readonly CycleEvidence[]
  readonly missingIndicators: readonly string[]
  readonly effectiveCapacity?: { readonly value: number; readonly unit: string; readonly sourceRefs: readonly string[] }
  readonly utilization?: { readonly value: number; readonly unit: string; readonly method: 'reported' | 'output_divided_by_capacity'; readonly sourceRefs: readonly string[] }
  readonly priceDeltas: readonly { readonly id: string; readonly delta?: number; readonly unit: string; readonly sourceRefs: readonly string[] }[]
  readonly diagnostics: readonly string[]
  readonly asOf: string
}
