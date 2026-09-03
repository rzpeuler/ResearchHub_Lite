import { normalizeSemanticText } from '../../knowledge/registry/id-allocation.ts'
import { KnowledgeIndexV03 } from '../../knowledge/query/index.ts'
import type { KnowledgeAssetCollectionV03 } from '../../knowledge/storage/v03-types.ts'
import type { EntityCandidate, RelationCandidate, ClaimCandidate } from '../../skills/knowledge-curation/contracts.ts'
import type { ConsolidatedExtraction } from './consolidation.ts'

function norm(value: string): string { return normalizeSemanticText(value) }
function exactEntity(index: KnowledgeIndexV03, candidate: EntityCandidate) { const candidateNames = new Set([candidate.name, ...(candidate.aliases ?? [])].map(norm)); return [...index.entities.values()].filter((entity) => entity.type === candidate.entityType && [entity.name, ...(entity.aliases ?? [])].some((name) => candidateNames.has(norm(name)))).sort((a, b) => a.id.localeCompare(b.id)) }
function endpointMatches(index: KnowledgeIndexV03, extraction: ConsolidatedExtraction, candidate: RelationCandidate): { sourceIds: Set<string>; targetIds: Set<string> } {
  const source = extraction.entityCandidates.get(candidate.source.candidateRef)
  const target = extraction.entityCandidates.get(candidate.target.candidateRef)
  const sourceIds = new Set(source === undefined ? [] : exactEntity(index, source).map((entity) => entity.id))
  const targetIds = new Set(target === undefined ? [] : exactEntity(index, target).map((entity) => entity.id))
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
      const matches = endpointMatches(index, extraction, candidate)
      const symmetric = candidate.relationType === 'competes_with' || candidate.relationType === 'substitutes_for'
      existingKnowledge = [...index.relations.values()].filter((relation) => relation.type === candidate.relationType && ((matches.sourceIds.has(relation.sourceRef) && matches.targetIds.has(relation.targetRef)) || (symmetric && matches.sourceIds.has(relation.targetRef) && matches.targetIds.has(relation.sourceRef)))).sort((a, b) => a.id.localeCompare(b.id)).slice(0, 8)
    } else {
      const candidate = group.candidate as ClaimCandidate
      const subjects = new Set<string>(candidate.subjectRefs.flatMap((subject) => { const entity = extraction.entityCandidates.get(subject.candidateRef); return entity === undefined ? [] : exactEntity(index, entity).map((item) => item.id) }))
      existingKnowledge = [...index.claims.values()].filter((claim) => claim.claimType === candidate.claimType && claim.subjectRefs.some((subject) => subjects.has(subject))).sort((a, b) => a.id.localeCompare(b.id)).slice(0, 8)
    }
    return { ...group, existingKnowledge }
  })
  return { ...extraction, groups }
}
