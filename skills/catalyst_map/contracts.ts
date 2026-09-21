export const CATALYST_STATUSES = ['scheduled', 'conditional', 'occurred', 'cancelled', 'unknown'] as const
export type CatalystStatus = typeof CATALYST_STATUSES[number]
export const CATALYST_EVENT_TYPES = ['earnings', 'guidance', 'product_launch', 'capacity_ramp', 'customer_qualification', 'price_change', 'industry_KPI', 'regulatory_event', 'contract_award', 'capital_allocation', 'other'] as const
export type CatalystEventType = typeof CATALYST_EVENT_TYPES[number]

export interface CatalystCandidate {
  readonly catalystId: string
  readonly eventType: CatalystEventType
  readonly description: string
  readonly targetPropositionRefs: readonly string[]
  readonly targetExpectationGapRefs?: readonly string[]
  readonly eventDate?: string
  readonly eventWindow?: { readonly start?: string; readonly end?: string }
  readonly status: CatalystStatus
  readonly observable: string
  readonly sourceRefs: readonly string[]
  readonly resolutionMechanism?: string
}

export interface CatalystMapInput {
  readonly thesisRef: string
  readonly propositionRefs: readonly string[]
  readonly expectationGapRefs?: readonly string[]
  readonly asOf: string
  readonly catalysts: readonly CatalystCandidate[]
}

export interface CatalystMapResult {
  readonly status: 'complete' | 'partial' | 'unavailable'
  readonly thesisRef: string
  readonly catalysts: readonly CatalystCandidate[]
  readonly diagnostics: readonly string[]
}

export class CatalystMapError extends Error {
  readonly code: string
  constructor(code: string, message = code) {
    super(message)
    this.name = 'CatalystMapError'
    this.code = code
  }
}
