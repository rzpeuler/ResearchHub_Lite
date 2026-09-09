import type { SemanticProductionProposal } from '../../knowledge/production/contracts.ts'

export const EVENT_EVIDENCE_VERDICTS = ['supports', 'contradicts', 'context', 'irrelevant'] as const
export type EventEvidenceVerdict = (typeof EVENT_EVIDENCE_VERDICTS)[number]

export const EVENT_EVIDENCE_REQUIREMENTS = ['primary', 'corroborated', 'single_source'] as const
export type EventEvidenceRequirement = (typeof EVENT_EVIDENCE_REQUIREMENTS)[number]

export const EVENT_VERIFICATION_LEVELS = ['official_verified', 'corroborated', 'single_source', 'conflicted', 'unverified'] as const
export type EventVerificationLevel = (typeof EVENT_VERIFICATION_LEVELS)[number]

export const EVENT_IMPACT_DISPOSITIONS = [
  'new_fact',
  'supports_existing',
  'contradicts_existing',
  'changes_assumption',
  'affects_thesis',
  'new_catalyst',
  'new_risk',
  'no_change',
  'research_gap',
] as const
export type EventImpactDisposition = (typeof EVENT_IMPACT_DISPOSITIONS)[number]

export const EVENT_DURABLE_CLAIM_TYPES = ['viewpoint', 'risk', 'catalyst', 'assumption'] as const
export type EventDurableClaimType = (typeof EVENT_DURABLE_CLAIM_TYPES)[number]

export const EVENT_RESEARCH_SECTIONS = [
  'Event Summary',
  'Event Anchor & Scope',
  'Evidence Verification',
  'Verified Event Facts',
  'Contradictions & Uncertainty',
  'Existing Research Context',
  'Direct Impact',
  'Second-order Impact',
  'Affected Assumptions',
  'Affected Thesis',
  'Catalysts',
  'Risks',
  'Open Research Questions',
  'Proposed Knowledge Updates',
  'Monitoring Plan',
  'Conclusion',
] as const
export type EventResearchSectionTitle = (typeof EVENT_RESEARCH_SECTIONS)[number]

export interface EventResearchCompany {
  readonly symbol: string
  readonly name?: string
  readonly exchange?: string
}

export interface EventResearchAnchorContext {
  readonly kind: 'daily_signal' | 'article' | 'url' | 'user_event'
  readonly title: string
  readonly description?: string
  readonly signalId?: string
  readonly url?: string
  readonly publishedAt?: string
  readonly eventDate?: string
}

export interface EventEvidenceSource {
  readonly candidateId: string
  readonly title: string
  readonly provider: string
  readonly kind?: string
  readonly url?: string
  readonly publishedAt?: string
  readonly excerpt: string
  readonly official?: boolean
}

export interface EventExistingKnowledgeClaim {
  readonly canonicalRef: string
  readonly claimType: string
  readonly statement?: string
  readonly subjectRefs?: readonly string[]
  readonly structuredValue?: Readonly<Record<string, unknown>> | null
}

export interface EventEvidenceAssessmentInput {
  readonly company: EventResearchCompany
  readonly anchor: EventResearchAnchorContext
  readonly asOf?: string
  readonly eventDate?: string
  readonly sources: readonly EventEvidenceSource[]
}

export interface EventSourceAssessment {
  readonly sourceCandidateId: string
  readonly verdict: EventEvidenceVerdict
  readonly confidence: number
  readonly rationale: string
  readonly evidenceRequirement: EventEvidenceRequirement
}

export type EventSourceVerdict = EventSourceAssessment

export interface EventVerifiedFact {
  readonly factId: string
  readonly statement: string
  readonly sourceCandidateIds: readonly string[]
  readonly confidence: number
  readonly evidenceRequirement: EventEvidenceRequirement
  readonly structuredValue?: EventStructuredValue
}

export interface EventContradiction {
  readonly statement: string
  readonly sourceCandidateIds: readonly string[]
  readonly contradictionId?: string
  readonly rationale?: string
}

export interface EventEvidenceAssessmentOutput {
  readonly sourceAssessments: readonly EventSourceAssessment[]
  readonly verifiedFacts: readonly EventVerifiedFact[]
  readonly contradictions: readonly EventContradiction[]
}

export interface EventVerificationResult {
  readonly verificationLevel: EventVerificationLevel
  readonly strongVerification: boolean
  readonly supportingSourceCandidateIds: readonly string[]
  readonly contradictingSourceCandidateIds: readonly string[]
}

export interface EventImpactAssessment {
  readonly assessmentId: string
  readonly disposition: EventImpactDisposition
  readonly existingKnowledgeRefs: readonly string[]
  readonly sourceCandidateIds: readonly string[]
  readonly rationale: string
  readonly directImpact: string
  readonly secondOrderImpact: string
}

export interface EventResearchSection {
  readonly sectionId: string
  readonly title: EventResearchSectionTitle
  readonly markdown: string
  readonly sourceCandidateIds: readonly string[]
  readonly existingKnowledgeRefs: readonly string[]
  readonly assessmentRefs: readonly string[]
}

export interface EventResearchProposal extends SemanticProductionProposal {
  readonly claimType: EventDurableClaimType
  readonly sourceCandidateIds: readonly string[]
  readonly existingKnowledgeRefs: readonly string[]
  readonly assessmentRefs: readonly string[]
}

export interface EventResearchSynthesisInput {
  readonly company: EventResearchCompany
  readonly anchor: EventResearchAnchorContext
  readonly eventFingerprint: string
  readonly eventDate?: string
  readonly verification: EventVerificationResult
  readonly evidence: EventEvidenceAssessmentOutput
  readonly existingKnowledge: readonly EventExistingKnowledgeClaim[]
}

export interface EventResearchSynthesisOutput {
  readonly sections: readonly EventResearchSection[]
  readonly assessments: readonly EventImpactAssessment[]
  readonly proposals: readonly EventResearchProposal[]
}

export interface EventResearchReasoningTelemetry {
  readonly called: boolean
  readonly validated: boolean
  readonly applied: boolean
  readonly fallbackUsed: boolean
  readonly repairAttempts: number
  readonly operation: 'event_evidence_assessment' | 'event_research_synthesis'
  readonly diagnostic?: string
  readonly diagnostics?: readonly string[]
  readonly model?: string
}

export interface EventEvidenceAssessmentSkillResult {
  readonly output: EventEvidenceAssessmentOutput
  readonly verification: EventVerificationResult
  readonly reasoning: EventResearchReasoningTelemetry
}

export interface EventResearchSynthesisSkillResult {
  readonly output: EventResearchSynthesisOutput
  readonly reasoning: EventResearchReasoningTelemetry
}

export interface EventStructuredValue {
  readonly [key: string]: unknown
  readonly metric: string
  readonly value: string | number | boolean | null
  readonly unit: string | null
  readonly comparator: 'eq' | 'gt' | 'gte' | 'lt' | 'lte' | 'approx' | null
  readonly period?: string | null
  readonly fiscalPeriod?: string | null
  readonly semanticKey?: string | null
}

export interface EventAssumptionUpdate {
  readonly existingClaimRef: string
  readonly structuredValue: EventStructuredValue
}
