export const THESIS_PROPOSITION_TYPES = ['business_driver', 'industry_condition', 'competitive_position', 'financial_outcome', 'earnings_expectation', 'valuation_expectation', 'catalyst', 'risk', 'other'] as const
export type ThesisPropositionType = typeof THESIS_PROPOSITION_TYPES[number]

export const THESIS_EVIDENCE_BASES = ['verified_evidence', 'inference', 'hypothesis'] as const
export type ThesisEvidenceBasis = typeof THESIS_EVIDENCE_BASES[number]

export const THESIS_AVAILABILITY = ['available', 'insufficient_evidence', 'unavailable'] as const
export type ThesisAvailability = typeof THESIS_AVAILABILITY[number]

export interface ThesisResearchGap {
  readonly gapId: string
  readonly statement: string
  readonly affectedPropositionRefs?: readonly string[]
  readonly requiredEvidence?: string
}

export interface ThesisPropositionInput {
  readonly propositionId: string
  readonly statement: string
  readonly propositionType: ThesisPropositionType
  readonly basis: ThesisEvidenceBasis
  readonly timeHorizon: 'immediate' | 'near_term' | 'medium_term' | 'long_term' | string
  readonly sourceRefs?: readonly string[]
  readonly existingKnowledgeRefs?: readonly string[]
  readonly dependsOnPropositionRefs?: readonly string[]
  readonly supportingPropositionRefs?: readonly string[]
  readonly verificationCondition?: string
  readonly verificationTime?: string
  readonly availability?: ThesisAvailability
  readonly loadBearing?: boolean
}

export interface ThesisFormalizeInput {
  readonly thesisId?: string
  readonly localRef?: string
  readonly summary: string
  readonly propositions: readonly ThesisPropositionInput[]
  readonly researchGaps?: readonly ThesisResearchGap[]
  readonly asOf?: string
}

export interface ThesisDependency {
  readonly dependencyId: string
  readonly sourcePropositionRef: string
  readonly targetPropositionRef: string
  readonly relation: 'depends_on' | 'supports'
}

export interface FormalizedThesisProposition extends ThesisPropositionInput {
  readonly sourceRefs: readonly string[]
  readonly existingKnowledgeRefs: readonly string[]
  readonly dependsOnPropositionRefs: readonly string[]
  readonly supportingPropositionRefs: readonly string[]
  readonly availability: ThesisAvailability
  readonly downstreamPropositionCount: number
  readonly loadBearing: boolean
}

export interface FormalizedThesisResult {
  readonly status: 'complete' | 'partial' | 'blocked'
  readonly thesisId: string
  readonly localRef?: string
  readonly summary: string
  readonly propositions: readonly FormalizedThesisProposition[]
  readonly dependencies: readonly ThesisDependency[]
  readonly researchGaps: readonly ThesisResearchGap[]
  readonly loadBearingPropositionRefs: readonly string[]
  readonly diagnostics: readonly string[]
  readonly asOf?: string
}

export class ThesisFormalizationError extends Error {
  readonly code: string
  constructor(code: string, message = code) {
    super(message)
    this.name = 'ThesisFormalizationError'
    this.code = code
  }
}
