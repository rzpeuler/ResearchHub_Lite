export const EXPECTATION_SURFACES = ['price_implied', 'consensus', 'management', 'own_research'] as const
export type ExpectationSurfaceKind = typeof EXPECTATION_SURFACES[number]

export const EXPECTATION_PAIR_TYPES = ['market_vs_consensus', 'market_vs_management', 'market_vs_own', 'consensus_vs_management', 'consensus_vs_own', 'management_vs_own'] as const
export type ExpectationPairType = typeof EXPECTATION_PAIR_TYPES[number]

export type ExpectationRelationship = 'below_range' | 'inside_range' | 'above_range' | 'below_point' | 'above_point' | 'overlap' | 'equal' | 'in_line' | 'not_directly_comparable' | 'unavailable'

export interface ExpectationRange {
  readonly low: number
  readonly high: number
}

export interface ExpectationSurfaceInput {
  readonly surface: ExpectationSurfaceKind
  readonly metric: string
  readonly period: string
  readonly unit: string
  readonly basis: string
  readonly value?: number
  readonly range?: ExpectationRange
  readonly sourceRefs: readonly string[]
  readonly upstreamResultRefs?: readonly string[]
  readonly publishedAt?: string
}

export interface ExpectationGapInput {
  readonly asOf: string
  readonly surfaces: readonly ExpectationSurfaceInput[]
  readonly pairs?: readonly ExpectationPairType[]
  readonly materialityThreshold?: number
}

export interface ExpectationGapPairResult {
  readonly pairId: ExpectationPairType
  readonly leftSurface: ExpectationSurfaceKind
  readonly rightSurface: ExpectationSurfaceKind
  readonly comparable: boolean
  readonly relationship: ExpectationRelationship
  readonly absoluteDelta?: number
  readonly percentageDelta?: number
  readonly sourceRefs: readonly string[]
  readonly diagnostics: readonly string[]
}

export interface ExpectationGapProposition {
  readonly propositionId: string
  readonly statement: string
  readonly pairId: ExpectationPairType
  readonly relationship: Exclude<ExpectationRelationship, 'not_directly_comparable' | 'unavailable'>
  readonly sourceRefs: readonly string[]
  readonly verificationCondition?: string
}

export interface ExpectationGapResult {
  readonly status: 'complete' | 'partial' | 'unavailable'
  readonly surfaces: readonly ExpectationSurfaceInput[]
  readonly pairs: readonly ExpectationGapPairResult[]
  readonly gapPropositions: readonly ExpectationGapProposition[]
  readonly noMaterialExpectationGap: boolean | null
  readonly diagnostics: readonly string[]
}

export class ExpectationGapError extends Error {
  readonly code: string
  constructor(code: string, message = code) {
    super(message)
    this.name = 'ExpectationGapError'
    this.code = code
  }
}
