import type { KnowledgeClaimV03, KnowledgeEntityV03, KnowledgeRelationV03 } from '../schema/domain.ts'
import type { ClaimCandidate, EntityCandidate, RelationCandidate } from '../../skills/knowledge-curation/contracts.ts'

export type ReviewCaseStatus = 'open'
export type ReviewCaseProducerType = string
export type ReviewCaseActionability = 'knowledge_decision' | 'research_followup' | 'schema_design'
export type ReviewCaseCategory = 'invalid_reference' | 'invalid_semantics' | 'relation_cardinality' | 'schema_gap' | 'theme_creation' | 'theme_ambiguity' | 'reconciliation_review' | 'other'
export type ReviewCaseOrigin = 'extraction_rejection' | 'consolidation' | 'consolidation_mirror' | 'knowledge_resolution' | 'semantic_case' | 'planner' | 'dependency_isolation'
export type ReviewProposalKind = 'entity' | 'relation' | 'claim'

export interface RawDocumentBlockEvidenceBinding {
  readonly kind: 'raw_document_block'
  readonly rawRef: string
  readonly documentId: string
  readonly blockId: string
}
export type ReviewEvidenceBinding = RawDocumentBlockEvidenceBinding

export type ReviewSemanticPayload = EntityCandidate | RelationCandidate | ClaimCandidate
export interface ReviewSemanticProposal {
  readonly proposalId: string
  readonly proposalKind: ReviewProposalKind
  readonly semanticType: EntityCandidate['entityType'] | RelationCandidate['relationType'] | ClaimCandidate['claimType']
  readonly semanticPayload: ReviewSemanticPayload
  readonly evidenceBindings: readonly ReviewEvidenceBinding[]
  readonly dependencyRefs: readonly string[]
}

export interface ExistingEntityProjection {
  readonly kind: 'entity'
  readonly type: KnowledgeEntityV03['type']
  readonly name: string
  readonly aliases: readonly string[]
  readonly description?: string | null
  readonly ticker?: string | null
  readonly exchange?: string | null
  readonly legalName?: string | null
  readonly definition?: string | null
  readonly inclusionCriteria?: readonly string[]
  readonly exclusionCriteria?: readonly string[]
}
export interface ExistingRelationProjection {
  readonly kind: 'relation'
  readonly type: KnowledgeRelationV03['type']
  readonly sourceRef: string
  readonly targetRef: string
  readonly attributes?: Readonly<Record<string, unknown>> | null
}
export interface ExistingClaimProjection {
  readonly kind: 'claim'
  readonly claimType: KnowledgeClaimV03['claimType']
  readonly statement: string
  readonly subjectRefs: readonly string[]
  readonly temporal?: KnowledgeClaimV03['temporal'] | null
  readonly structuredValue?: Readonly<Record<string, unknown>> | null
}
export type ExistingKnowledgeProjectionPayload = ExistingEntityProjection | ExistingRelationProjection | ExistingClaimProjection
export interface ExistingKnowledgeProjection {
  readonly canonicalRef: string
  readonly kind: ReviewProposalKind
  readonly semanticType: string
  readonly payload: ExistingKnowledgeProjectionPayload
}

export interface ReviewCaseClassification {
  readonly category: ReviewCaseCategory
  readonly actionability: ReviewCaseActionability
  readonly origin: ReviewCaseOrigin
  readonly stage: string
  readonly rationale: string
}
export interface ReviewCaseResolutionContext {
  readonly existingKnowledgeProjections: readonly ExistingKnowledgeProjection[]
  readonly schemaVersionAtCreation: '0.3'
  readonly knowledgeBaseRevisionAtCreation: number
  readonly context?: Readonly<Record<string, string | number | boolean | null>>
}
export interface ReviewCaseImpact {
  readonly dependentProposalCount: number
  readonly affectedProposalRefs: readonly string[]
}
export interface ReviewCaseAttributeConflict {
  readonly fields: readonly string[]
  readonly left: Readonly<Record<string, unknown>>
  readonly right: Readonly<Record<string, unknown>>
}
export interface ReviewCaseAdvisory {
  readonly recommendation?: string
  readonly support?: Readonly<Record<string, number | readonly string[]>>
  readonly suggestedNextAction?: string
  readonly recommendationReason?: string
  readonly novelty?: string
  readonly attributeConflict?: ReviewCaseAttributeConflict
}
export interface ReviewCaseState { readonly status: ReviewCaseStatus }

export interface ReviewCase {
  readonly version: '0.1'
  readonly reviewCaseId: string
  readonly knowledgeBaseId: string
  readonly producerType: ReviewCaseProducerType
  readonly producerRunId: string
  readonly createdAt: string
  readonly classification: ReviewCaseClassification
  readonly rootProposal: ReviewSemanticProposal
  readonly suspendedProposalBundle: { readonly dependentProposals: readonly ReviewSemanticProposal[] }
  readonly resolutionContext: ReviewCaseResolutionContext
  readonly impact: ReviewCaseImpact
  readonly advisory?: ReviewCaseAdvisory
  readonly state: ReviewCaseState
}
export type ReviewCaseV01 = ReviewCase

export interface ReviewRunManifest {
  readonly version: '0.1'
  readonly knowledgeBaseId: string
  readonly producerType: ReviewCaseProducerType
  readonly producerRunId: string
  readonly reviewCaseCount: number
  readonly caseIds: readonly string[]
  readonly deterministicSetHash: string
  readonly createdAt: string
  readonly schemaVersionAtCreation: '0.3'
  readonly knowledgeBaseRevisionAtCreation: number
}
