import { normalizeKnowledgeSlug } from '../../knowledge/registry/id-allocation.ts'
import { canonicalSerialize } from '../../knowledge/storage/canonical-hash.ts'
import type { CandidateEntityRef, ClaimCandidate, EntityCandidate, RelationCandidate, ValidatedExtractKnowledgeResult } from '../../skills/knowledge-curation/contracts.ts'
import type { AcceptedExtractionUnit } from './contracts.ts'

export interface ConsolidatedExtraction {
  readonly groups: readonly { candidateId: string; kind: 'entity' | 'relation' | 'claim'; candidate: EntityCandidate | RelationCandidate | ClaimCandidate; existingKnowledge?: readonly unknown[] }[]
  readonly reviewConstraints: readonly { candidateId: string; reason: string; conflictingFields: readonly string[] }[]
  readonly rejected: readonly unknown[]
  readonly candidateCounts: Readonly<Record<string, number>>
  readonly candidateAliases: ReadonlyMap<string, string>
  readonly entityCandidates: ReadonlyMap<string, EntityCandidate>
}

function normalize(value: string): string { return normalizeKnowledgeSlug(value) }
function entityKey(candidate: EntityCandidate): string { return `${candidate.entityType}:${normalize(candidate.name)}` }
function addUnique(values: readonly string[], additions: readonly string[]): string[] { return [...new Set([...values, ...additions])].sort() }
function mergeDescription(left: string | null | undefined, right: string | null | undefined): string | null | undefined { if (left === undefined) return right; if (right === undefined || left === right) return left; return undefined }
function mergeConfidence(left: number | undefined, right: number | undefined): number | undefined { if (left === undefined) return right; if (right === undefined) return left; return Math.min(left, right) }
function candidateRef(candidateRef: string, mention: string, entityType?: EntityCandidate['entityType']): CandidateEntityRef { return { candidateRef, mention, ...(entityType === undefined ? {} : { entityType }) } }
function namespaced(unitId: string, id: string): string { return `${unitId}::${id}` }

export function consolidateExtractions(extractions: readonly { unit: AcceptedExtractionUnit; result: ValidatedExtractKnowledgeResult }[]): ConsolidatedExtraction {
  const entityGroups = new Map<string, EntityCandidate>()
  const entityAliases = new Map<string, string>()
  const relationInputs: Array<{ unitId: string; candidate: RelationCandidate }> = []
  const claimInputs: Array<{ unitId: string; candidate: ClaimCandidate }> = []
  const rejected: unknown[] = []
  const reviewConstraints: Array<{ candidateId: string; reason: string; conflictingFields: readonly string[] }> = []
  let entityInput = 0
  let relationInput = 0
  let claimInput = 0
  for (const extraction of extractions) {
    const entities = [...extraction.result.entities].sort((a, b) => a.candidateId.localeCompare(b.candidateId))
    for (const candidate of entities) {
      entityInput += 1
      const originalId = namespaced(extraction.unit.unitId, candidate.candidateId)
      const key = entityKey(candidate)
      const current = entityGroups.get(key)
      if (!current) {
        const mergedId = `merged-entity-${normalize(`${candidate.entityType}-${candidate.name}`)}`
        const value = { ...structuredClone(candidate), candidateId: mergedId, aliases: candidate.aliases === undefined ? undefined : [...new Set(candidate.aliases)].sort(), evidenceBlockRefs: [...new Set(candidate.evidenceBlockRefs)].sort() }
        entityGroups.set(key, value)
        entityAliases.set(originalId, mergedId)
      } else {
        const descriptionConflict = current.description !== undefined && current.description !== null && candidate.description !== undefined && candidate.description !== null && current.description !== candidate.description
        const merged = { ...current, aliases: addUnique(current.aliases ?? [], candidate.aliases ?? []), evidenceBlockRefs: addUnique(current.evidenceBlockRefs, candidate.evidenceBlockRefs), confidence: mergeConfidence(current.confidence, candidate.confidence), description: descriptionConflict ? current.description : mergeDescription(current.description, candidate.description) }
        if (descriptionConflict) reviewConstraints.push({ candidateId: current.candidateId, reason: 'Entity descriptions conflict across extraction units', conflictingFields: ['description'] })
        entityGroups.set(key, merged)
        entityAliases.set(originalId, current.candidateId)
      }
    }
    for (const candidate of [...extraction.result.relations].sort((a, b) => a.candidateId.localeCompare(b.candidateId))) { relationInput += 1; relationInputs.push({ unitId: extraction.unit.unitId, candidate }) }
    for (const candidate of [...extraction.result.claims].sort((a, b) => a.candidateId.localeCompare(b.candidateId))) { claimInput += 1; claimInputs.push({ unitId: extraction.unit.unitId, candidate }) }
    rejected.push(...extraction.result.rejected)
  }
  const relations = new Map<string, RelationCandidate>()
  for (const { unitId, candidate } of relationInputs) {
    const source = entityAliases.get(namespaced(unitId, candidate.source.candidateRef))
    const target = entityAliases.get(namespaced(unitId, candidate.target.candidateRef))
    if (!source || !target) { rejected.push({ candidateId: candidate.candidateId, kind: 'relation', code: 'invalid_reference', message: 'Relation endpoint was not retained during consolidation' }); continue }
    const symmetric = candidate.relationType === 'competes_with' || candidate.relationType === 'substitutes_for'
    const endpoints = symmetric ? [source, target].sort() : [source, target]
    const key = `${candidate.relationType}:${endpoints.join(':')}`
    const current = relations.get(key)
    const sourceEntity = [...entityGroups.values()].find((item) => `merged-entity-${normalize(`${item.entityType}-${item.name}`)}` === endpoints[0])
    const targetEntity = [...entityGroups.values()].find((item) => `merged-entity-${normalize(`${item.entityType}-${item.name}`)}` === endpoints[1])
    const normalizedCandidate: RelationCandidate = { ...structuredClone(candidate), candidateId: `merged-relation-${normalize(`${candidate.relationType}-${endpoints.join('-')}`)}`, source: candidateRef(endpoints[0]!, sourceEntity?.name ?? candidate.source.mention, sourceEntity?.entityType ?? candidate.source.entityType), target: candidateRef(endpoints[1]!, targetEntity?.name ?? candidate.target.mention, targetEntity?.entityType ?? candidate.target.entityType) }
    if (!current) relations.set(key, normalizedCandidate)
    else {
      const left = current.attributes ?? null
      const right = normalizedCandidate.attributes ?? null
      const conflict = canonicalSerialize(left) !== canonicalSerialize(right)
      const mergedAttributes = !conflict && current.attributes !== undefined ? current.attributes : current.attributes ?? normalizedCandidate.attributes
      if (conflict) reviewConstraints.push({ candidateId: current.candidateId, reason: 'Relation attributes conflict across extraction units', conflictingFields: [...new Set([...Object.keys((left && typeof left === 'object' ? left : {}) as object), ...Object.keys((right && typeof right === 'object' ? right : {}) as object)])].sort() })
      relations.set(key, { ...current, evidenceBlockRefs: addUnique(current.evidenceBlockRefs, normalizedCandidate.evidenceBlockRefs), confidence: mergeConfidence(current.confidence, normalizedCandidate.confidence), ...(mergedAttributes === undefined ? {} : { attributes: mergedAttributes }) })
    }
  }
  const claims = new Map<string, ClaimCandidate>()
  for (const { unitId, candidate } of claimInputs) {
    const subjects = candidate.subjectRefs.map((subject) => entityAliases.get(namespaced(unitId, subject.candidateRef))).filter((ref): ref is string => ref !== undefined)
    if (subjects.length !== candidate.subjectRefs.length) { rejected.push({ candidateId: candidate.candidateId, kind: 'claim', code: 'invalid_reference', message: 'Claim subject was not retained during consolidation' }); continue }
    const orderedSubjects = [...new Set(subjects)].sort()
    const key = `${candidate.claimType}:${normalize(candidate.statement)}:${orderedSubjects.join(',')}:${canonicalSerialize(candidate.temporal ?? null)}:${canonicalSerialize(candidate.structuredValue ?? null)}`
    const normalizedCandidate: ClaimCandidate = { ...structuredClone(candidate), candidateId: `merged-claim-${normalize(`${candidate.claimType}-${candidate.statement}-${orderedSubjects.join('-')}`)}`, subjectRefs: orderedSubjects.map((ref, index) => candidateRef(ref, candidate.subjectRefs[index]?.mention ?? ref, candidate.subjectRefs[index]?.entityType)) }
    const current = claims.get(key)
    if (!current) claims.set(key, normalizedCandidate)
    else claims.set(key, { ...current, evidenceBlockRefs: addUnique(current.evidenceBlockRefs, normalizedCandidate.evidenceBlockRefs), confidence: mergeConfidence(current.confidence, normalizedCandidate.confidence) })
  }
  const groups = [
    ...[...entityGroups.values()].sort((a, b) => a.candidateId.localeCompare(b.candidateId)).map((candidate) => ({ candidateId: candidate.candidateId, kind: 'entity' as const, candidate })),
    ...[...relations.values()].sort((a, b) => a.candidateId.localeCompare(b.candidateId)).map((candidate) => ({ candidateId: candidate.candidateId, kind: 'relation' as const, candidate })),
    ...[...claims.values()].sort((a, b) => a.candidateId.localeCompare(b.candidateId)).map((candidate) => ({ candidateId: candidate.candidateId, kind: 'claim' as const, candidate })),
  ]
  const entityCandidates = new Map([...entityGroups.values()].map((candidate) => [candidate.candidateId, candidate]))
  return { groups, reviewConstraints: [...new Map(reviewConstraints.map((item) => [item.candidateId, item])).values()].sort((a, b) => a.candidateId.localeCompare(b.candidateId)), rejected, candidateCounts: { entity: entityInput, relation: relationInput, claim: claimInput, consolidated: groups.length, rejected: rejected.length }, candidateAliases: entityAliases, entityCandidates }
}
