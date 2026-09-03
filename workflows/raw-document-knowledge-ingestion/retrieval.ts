import { normalizeKnowledgeSlug } from '../../knowledge/registry/id-allocation.ts'
import { KnowledgeIndexV03 } from '../../knowledge/query/index.ts'
import type { KnowledgeAssetCollectionV03 } from '../../knowledge/storage/v03-types.ts'
import type { EntityCandidate, RelationCandidate, ClaimCandidate } from '../../skills/knowledge-curation/contracts.ts'
import type { ConsolidatedExtraction } from './consolidation.ts'

function norm(value: string): string { return normalizeKnowledgeSlug(value) }
function exactEntity(index: KnowledgeIndexV03, candidate: EntityCandidate) { return [...index.entities.values()].filter((entity) => entity.type === candidate.entityType && [entity.name, ...(entity.aliases ?? [])].some((name) => norm(name) === norm(candidate.name))).sort((a, b) => a.id.localeCompare(b.id)) }
function endpointMatches(index: KnowledgeIndexV03, candidate: RelationCandidate): { sourceIds: Set<string>; targetIds: Set<string> } {
  const sourceIds = new Set(exactEntity(index, { candidateId: 'source', entityType: candidate.source.entityType ?? 'company', name: candidate.source.mention, evidenceBlockRefs: [], reason: '' }).map((entity) => entity.id))
  const targetIds = new Set(exactEntity(index, { candidateId: 'target', entityType: candidate.target.entityType ?? 'company', name: candidate.target.mention, evidenceBlockRefs: [], reason: '' }).map((entity) => entity.id))
  return { sourceIds, targetIds }
}

export function retrieveFocusedKnowledge(assets: KnowledgeAssetCollectionV03, extraction: ConsolidatedExtraction): ConsolidatedExtraction {
  const index = KnowledgeIndexV03.fromAssets(assets)
  const groups = extraction.groups.map((group) => {
    let existingKnowledge: unknown[] = []
    if (group.kind === 'entity') {
      existingKnowledge = exactEntity(index, group.candidate as EntityCandidate)
      const related = new Set<unknown>()
      for (const entity of existingKnowledge.slice(0, 4)) {
        const id = (entity as { id?: unknown }).id
        if (typeof id !== 'string') continue
        for (const relation of index.getRelations(id).slice(0, 4)) related.add(relation)
        for (const claim of index.getClaims(id).slice(0, 4)) related.add(claim)
      }
      existingKnowledge = [...existingKnowledge, ...[...related].sort((a, b) => String((a as { id?: string }).id ?? '').localeCompare(String((b as { id?: string }).id ?? '')))]
    } else if (group.kind === 'relation') {
      const candidate = group.candidate as RelationCandidate
      const matches = endpointMatches(index, candidate)
      existingKnowledge = [...index.relations.values()].filter((relation) => relation.type === candidate.relationType && matches.sourceIds.has(relation.sourceRef) && matches.targetIds.has(relation.targetRef)).sort((a, b) => a.id.localeCompare(b.id)).slice(0, 8)
    } else {
      const candidate = group.candidate as ClaimCandidate
      const subjects = new Set<string>(candidate.subjectRefs.flatMap((subject) => exactEntity(index, { candidateId: subject.candidateRef, entityType: subject.entityType ?? 'company', name: subject.mention, evidenceBlockRefs: [], reason: '' }).map((entity) => entity.id)))
      existingKnowledge = [...index.claims.values()].filter((claim) => claim.claimType === candidate.claimType && claim.subjectRefs.some((subject) => subjects.has(subject))).sort((a, b) => a.id.localeCompare(b.id)).slice(0, 8)
    }
    return { ...group, existingKnowledge }
  })
  return { ...extraction, groups }
}
