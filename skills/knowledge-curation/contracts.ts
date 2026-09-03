import type { DocumentBlock, DocumentSection, StructuredDocument } from '../../plugins/document/contracts.ts'
import type { ClaimTypeV03, EntityTypeV03, RelationTypeV03 } from '../../knowledge/schema/domain.ts'
export type { CurationSchemaContext, CurationSchemaContextSlice, RelationSchemaContract } from './schema-context-types.ts'
export type { DocumentBlock, DocumentSection, StructuredDocument }

export type CurationOperation = 'understandAndPlan' | 'extractKnowledge' | 'reconcileKnowledge'
export type DocumentContentRef =
  | { readonly kind: 'block'; readonly blockId: string }
  | { readonly kind: 'section'; readonly sectionId: string }

export interface SourceAssessment {
  readonly summary: string
  readonly sourceType?: string
  readonly reliability?: 'high' | 'medium' | 'low' | 'unknown'
  readonly uncertainty?: string[]
}

export interface ReportMap {
  readonly sourceAssessment: SourceAssessment
  readonly researchScope: string
  readonly majorTopics: readonly { topicId: string; label: string; description?: string; evidenceRefs: readonly DocumentContentRef[] }[]
  readonly majorEntityMentions: readonly { mentionId: string; text: string; entityType?: EntityTypeV03; evidenceRefs: readonly DocumentContentRef[] }[]
  readonly majorConclusions: readonly { conclusionId: string; text: string; evidenceRefs: readonly DocumentContentRef[] }[]
  readonly sectionSemantics: readonly { sectionRef: string; summary: string; topicRefs?: readonly string[]; evidenceRefs?: readonly DocumentContentRef[] }[]
  readonly semanticDependencies: readonly { fromSectionRef: string; toSectionRef: string; reason: string }[]
  readonly themeHypotheses: readonly { text: string; evidenceRefs: readonly DocumentContentRef[] }[]
  readonly uncertainty: readonly string[]
}

export interface ProposedExtractionUnit {
  readonly proposedUnitId: string
  readonly topic: string
  readonly semanticPurpose: string
  readonly primaryRefs: readonly DocumentContentRef[]
  readonly contextRefs: readonly DocumentContentRef[]
  readonly extractionFocus?: string
}

export type PlanValidationCode = 'uncovered_content' | 'primary_overlap' | 'primary_excluded_conflict' | 'unit_count_exceeded' | 'context_capacity_exceeded' | 'duplicate_unit_id' | 'no_primary_content' | 'canonical_id_in_plan'

export interface PlanValidationFeedback {
  readonly code: PlanValidationCode
  readonly message: string
  readonly uncoveredRefs?: readonly DocumentContentRef[]
  readonly overlapRefs?: readonly DocumentContentRef[]
  readonly conflictingUnitIds?: readonly string[]
  readonly affectedUnitId?: string
  readonly estimatedTokens?: number
  readonly allowedTokens?: number
  readonly unitCount?: number
  readonly maxUnits?: number
}

export interface ExtractionPlanProposal {
  readonly units: readonly ProposedExtractionUnit[]
  readonly excludedRefs: readonly DocumentContentRef[]
}

export interface UnderstandAndPlanInput {
  readonly document: StructuredDocument
  readonly instructions?: string
  readonly planRepair?: {
    readonly previousOutput: UnderstandAndPlanOutput
    readonly feedback: PlanValidationFeedback
    readonly attempt: number
  }
}

export interface UnderstandAndPlanOutput {
  readonly reportMap: ReportMap
  readonly extractionPlanProposal: ExtractionPlanProposal
}

export interface EntityCandidate {
  readonly candidateId: string
  readonly entityType: EntityTypeV03
  readonly name: string
  readonly aliases?: readonly string[]
  readonly description?: string | null
  readonly semanticFields?: Readonly<Record<string, unknown>>
  readonly evidenceBlockRefs: readonly string[]
  readonly reason: string
  readonly confidence?: number
}

export interface CandidateEntityRef {
  readonly candidateRef: string
  readonly mention: string
  readonly entityType?: EntityTypeV03
}

export interface RelationCandidate {
  readonly candidateId: string
  readonly relationType: RelationTypeV03
  readonly source: CandidateEntityRef
  readonly target: CandidateEntityRef
  readonly attributes?: Readonly<Record<string, unknown>>
  readonly evidenceBlockRefs: readonly string[]
  readonly reason: string
  readonly confidence?: number
}

export interface ClaimCandidate {
  readonly candidateId: string
  readonly claimType: ClaimTypeV03
  readonly statement: string
  readonly subjectRefs: readonly CandidateEntityRef[]
  readonly temporal?: Readonly<Record<string, unknown>> | null
  readonly structuredValue?: Readonly<Record<string, unknown>> | null
  readonly evidenceBlockRefs: readonly string[]
  readonly reason: string
  readonly confidence?: number
}

export interface ExtractKnowledgeInput {
  readonly document: StructuredDocument
  readonly reportMap: ReportMap
  readonly unit: ProposedExtractionUnit
  readonly instructions?: string
  readonly validationFeedback?: { readonly code: string; readonly message: string }
}

export interface ExtractKnowledgeOutput {
  readonly entities: readonly EntityCandidate[]
  readonly relations: readonly RelationCandidate[]
  readonly claims: readonly ClaimCandidate[]
}

export type CandidateKind = 'entity' | 'relation' | 'claim'
export type CandidateValidationCode = 'invalid_model_output' | 'invalid_reference' | 'invalid_semantics' | 'invalid_confidence' | 'ungrounded_candidate'
export interface CandidateValidationRejection { readonly candidateId?: string; readonly kind: CandidateKind; readonly code: CandidateValidationCode; readonly message: string }
export interface CandidateValidationSummary {
  readonly inputCounts: Readonly<Record<CandidateKind, number>>
  readonly acceptedCounts: Readonly<Record<CandidateKind, number>>
  readonly rejectedCounts: Readonly<Record<CandidateKind, number>>
  readonly rejectionCodes: readonly CandidateValidationCode[]
}
export interface ValidatedExtractKnowledgeResult extends ExtractKnowledgeOutput {
  readonly rejected: readonly CandidateValidationRejection[]
  readonly summary: CandidateValidationSummary
}

export type ReconciliationAction = 'create' | 'duplicate' | 'merge_source' | 'update_state' | 'supersede' | 'keep_both' | 'reject' | 'user_review'
export interface ResolvedCandidateGroup { readonly candidateId: string; readonly kind: CandidateKind; readonly candidate: EntityCandidate | RelationCandidate | ClaimCandidate; readonly existingKnowledge?: readonly unknown[] }
export interface ReconcileKnowledgeInput {
  readonly candidateGroups: readonly ResolvedCandidateGroup[]
  readonly existingKnowledge: readonly unknown[]
  readonly reportMap: ReportMap
  readonly sourceAssessment: SourceAssessment
  readonly instructions?: string
}
export interface ReconciliationDecision { readonly candidateId: string; readonly action: ReconciliationAction; readonly rationale: string; readonly targetCandidateId?: string; readonly conflictingFields?: readonly string[] }
export interface ReconcileKnowledgeOutput { readonly decisions: readonly ReconciliationDecision[] }

export function contentRefKey(ref: DocumentContentRef): string { return `${ref.kind}:${ref.kind === 'block' ? ref.blockId : ref.sectionId}` }
