import { allocateKnowledgeId as allocateKnowledgeIdBase, allocateEntityId as allocateEntityIdBase, allocateSourceId as allocateSourceIdBase } from '../../knowledge/registry/id-allocation.ts'

export function allocateEntityId(type: string, name: string, discriminator?: unknown): string { return allocateEntityIdBase(type, name, discriminator) }
export function allocateSourceId(input: { sourceUrl?: string | null; publishedAt?: string | null; title?: string | null; rawRef: string }): string { return allocateSourceIdBase(input) }
export function allocateRelationId(type: string, sourceRef: string, targetRef: string, attributes: unknown, discriminator?: unknown): string { return allocateKnowledgeIdBase('relation', { type, sourceRef, targetRef, attributes, discriminator }) }
export function allocateClaimId(identity: unknown): string { return allocateKnowledgeIdBase('claim', identity) }
