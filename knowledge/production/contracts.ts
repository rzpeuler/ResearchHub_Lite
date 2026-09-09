import type { KnowledgeBaseHandle } from '../storage/handle.ts'
import type { NormalizedResearchSource } from '../../plugins/research-acquisition/contracts.ts'

export type SemanticProductionClaimType = 'fact' | 'forecast' | 'viewpoint' | 'trend' | 'risk' | 'assumption' | 'thesis' | 'catalyst'

/** Producer-facing semantic output. IDs in this contract are local proposal keys only. */
export interface SemanticProductionProposal {
  readonly proposalId: string
  readonly kind: 'entity' | 'claim' | 'relation' | 'source'
  readonly claimType?: SemanticProductionClaimType
  readonly subjectKey: string
  readonly statement?: string
  readonly entityType?: 'company' | 'industry' | 'product' | 'technology'
  readonly entityName?: string
  readonly relationType?: string
  readonly targetKey?: string
  readonly attributes?: Readonly<Record<string, unknown>>
  readonly sourceCandidateIds?: readonly string[]
  /** Optional producer-owned binding to an existing canonical Claim. */
  readonly existingKnowledgeRefs?: readonly string[]
  readonly temporal?: unknown
  readonly structuredValue?: Readonly<Record<string, unknown>> | null
  readonly confidence?: number
  readonly probability?: number
  readonly supportsProposalIds?: readonly string[]
  readonly dependsOnProposalIds?: readonly string[]
  readonly contradictsProposalIds?: readonly string[]
  readonly semanticKey?: string
  /** Explicit generic intent to update one existing canonical Claim in place. */
  readonly resolution?: 'update' | 'supersede' | 'contradict' | 'review'
}

export interface SemanticResolutionDecision {
  readonly outcome: 'equivalent' | 'supersedes' | 'contradicts' | 'uncertain'
  readonly reason: string
}

export type SemanticResolver = (input: {
  readonly proposal: SemanticProductionProposal
  readonly existing: readonly Record<string, unknown>[]
  readonly evidence: readonly Record<string, unknown>[]
}) => Promise<SemanticResolutionDecision> | SemanticResolutionDecision

export interface ProductionEntityInput {
  readonly localKey: string
  readonly entityType: 'company' | 'industry' | 'product' | 'technology'
  readonly name: string
  readonly aliases?: readonly string[]
  readonly semanticFields?: Readonly<Record<string, unknown>>
}

export interface ProductionEvidenceBinding {
  readonly localSourceId: string
  readonly source: NormalizedResearchSource
  readonly originalFilename?: string
  readonly mediaType?: string
}

export interface KnowledgeProductionInput {
  readonly handle: KnowledgeBaseHandle
  readonly producerType: string
  readonly producerRunId: string
  readonly schemaProfile: { readonly schemaVersion: '0.4'; readonly storageFormatVersion: '1'; readonly requiresRawProvenance: true }
  readonly entity: ProductionEntityInput
  readonly proposals: readonly SemanticProductionProposal[]
  readonly evidenceBindings: readonly ProductionEvidenceBinding[]
  readonly asOf?: string
  readonly now?: () => string
  readonly semanticResolver?: SemanticResolver
  readonly reviewProducerType?: string
}

export interface ResolutionIntentSummary {
  readonly intentId: string
  readonly proposalId?: string
  readonly localKey?: string
  readonly disposition: 'bound_existing' | 'created_new' | 'review_required' | 'skipped'
  readonly targetRef?: string
  readonly reason: string
}

export interface KnowledgeProductionOutcome {
  readonly status: 'committed' | 'already_committed' | 'no_changes' | 'blocked' | 'failed'
  readonly knowledgeBaseId: string
  readonly knowledgeBaseRevision: number
  readonly baseRevision: number
  readonly changeSetId?: string
  readonly createdIds: readonly string[]
  readonly updatedIds: readonly string[]
  readonly sourceRefsByLocalId: Readonly<Record<string, string>>
  readonly claimRefsByProposalId: Readonly<Record<string, string>>
  readonly entityRefsByLocalKey: Readonly<Record<string, string>>
  readonly resolutionIntents: readonly ResolutionIntentSummary[]
  readonly errors: readonly string[]
}
