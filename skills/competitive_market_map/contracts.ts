export type CompetitorStatus = 'active' | 'inactive' | 'acquired' | 'shutdown' | 'pivoted' | 'unknown'
export type CompetitiveEventType = 'entry' | 'exit' | 'acquisition' | 'capacity_entry' | 'pivot'
export type WhitespaceConclusion = 'supported_whitespace' | 'economically_unattractive' | 'inconclusive'

export interface CompetitiveBoundary {
  readonly marketName: string
  readonly included: readonly string[]
  readonly excluded: readonly string[]
  readonly geography: string
  readonly period: string
  readonly sourceRefs: readonly string[]
}

export interface CompetitiveSegmentation {
  readonly axis: string
  readonly values: readonly string[]
  readonly sourceRefs: readonly string[]
}

export interface PositioningEvidence {
  readonly segments: readonly string[]
  readonly valueProposition: string
  readonly differentiators: readonly string[]
  readonly sourceRefs: readonly string[]
}

export interface PeerEvidence {
  readonly samePurchaseDecision: boolean
  readonly sameWorkflow: boolean
  readonly sameEconomics: boolean
  readonly customerOverlap: boolean
  readonly sourceRefs: readonly string[]
}

export interface ScaleProxy {
  readonly metric: string
  readonly value?: number
  readonly unit: string
  readonly period: string
  readonly sourceRefs: readonly string[]
}

export interface CompetitiveEvent {
  readonly id: string
  readonly type: CompetitiveEventType
  readonly description: string
  readonly period: string
  readonly sourceRefs: readonly string[]
}

export interface CompetitivePlayer {
  readonly id: string
  readonly name: string
  readonly status: CompetitorStatus
  readonly geography: string
  readonly positioning: PositioningEvidence
  readonly peerEvidence?: PeerEvidence
  readonly scaleProxy?: ScaleProxy
  readonly events: readonly CompetitiveEvent[]
  readonly sourceRefs: readonly string[]
}

export interface WhitespaceEvidence {
  readonly unmetNeed: 'present' | 'absent' | 'unknown'
  readonly economicSignal: 'attractive' | 'unattractive' | 'mixed' | 'unknown'
  readonly explanation: string
  readonly sourceRefs: readonly string[]
}

export interface CompetitiveMarketMapInput {
  readonly marketRef: string
  readonly boundary: CompetitiveBoundary
  readonly segmentation: CompetitiveSegmentation
  readonly players: readonly CompetitivePlayer[]
  readonly whitespace?: WhitespaceEvidence
  readonly asOf: string
}

export interface PeerAssessment {
  readonly playerId: string
  readonly isAttributablePeer: boolean
  readonly reasons: readonly string[]
  readonly sourceRefs: readonly string[]
}

export interface CompetitiveMarketMapResult {
  readonly status: 'complete' | 'partial' | 'unavailable'
  readonly marketRef: string
  readonly boundary: CompetitiveBoundary
  readonly segmentation: CompetitiveSegmentation
  readonly players: readonly CompetitivePlayer[]
  readonly peerAssessments: readonly PeerAssessment[]
  readonly events: readonly (CompetitiveEvent & { readonly playerId: string })[]
  readonly whitespace: (WhitespaceEvidence & { readonly conclusion: WhitespaceConclusion }) | undefined
  readonly diagnostics: readonly string[]
  readonly asOf: string
}
