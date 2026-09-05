import { normalizeSemanticText } from '../../knowledge/registry/id-allocation.ts'
import { canonicalSerialize, hashKnowledgeObject } from '../../knowledge/storage/canonical-hash.ts'
import type { CandidateEntityRef, ClaimCandidate, EntityCandidate, RelationCandidate, ValidatedExtractKnowledgeResult } from '../../skills/knowledge-curation/contracts.ts'
import { consolidationReviewKey } from './review-telemetry.ts'
import type { AcceptedExtractionUnit, ConsolidationReviewConstraint } from './contracts.ts'

export interface ConsolidatedCandidateSupport {
  readonly supportingCandidateCount: number
  readonly supportingUnitIds: readonly string[]
  readonly evidenceBlockRefs: readonly string[]
}

export interface ConsolidatedExtraction {
  readonly groups: readonly { candidateId: string; kind: 'entity' | 'relation' | 'claim'; candidate: EntityCandidate | RelationCandidate | ClaimCandidate }[]
  readonly reviewConstraints: readonly ConsolidationReviewConstraint[]
  readonly rejected: readonly unknown[]
  readonly candidateCounts: Readonly<Record<string, number>>
  readonly candidateAliases: ReadonlyMap<string, string>
  readonly entityCandidates: ReadonlyMap<string, EntityCandidate>
  readonly candidateSupport: ReadonlyMap<string, ConsolidatedCandidateSupport>
}

function semanticEntityIdentity(candidate: Pick<EntityCandidate, 'entityType' | 'name'>) { return { entityType: candidate.entityType, normalizedSemanticName: normalizeSemanticText(candidate.name) } }
function entityKey(candidate: EntityCandidate): string { return canonicalSerialize(semanticEntityIdentity(candidate)) }
function mergedEntityId(candidate: EntityCandidate): string { return `merged-entity-${hashKnowledgeObject(semanticEntityIdentity(candidate)).slice(7, 23)}` }
function addUnique(values: readonly string[], additions: readonly string[]): string[] { return [...new Set([...values, ...additions])].sort() }
function mergeText(left: string | null | undefined, right: string | null | undefined): string | undefined {
  const values = [left, right].filter((value): value is string => value !== undefined && value !== null)
  if (values.length === 0) return undefined
  if (values.length === 1 || normalizeSemanticText(values[0]!) === normalizeSemanticText(values[1]!)) return [...values].sort((a, b) => a.localeCompare(b))[0]
  return undefined
}
function mergeSemanticFields(left: Readonly<Record<string, unknown>> | undefined, right: Readonly<Record<string, unknown>> | undefined, conflicted: Set<string>): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...(left ?? {}) }
  for (const [key, value] of Object.entries(right ?? {})) {
    if (value === undefined || value === null) continue
    if (conflicted.has(key)) { delete merged[key]; continue }
    const current = merged[key]
    if (current === undefined || current === null) merged[key] = value
    else if (normalizeSemanticText(String(current)) === normalizeSemanticText(String(value))) merged[key] = [String(current), String(value)].sort((a, b) => a.localeCompare(b))[0]
    else if (key === 'legalName' || key === 'ticker' || key === 'exchange') { conflicted.add(key); delete merged[key] }
  }
  return merged
}
function constraint(candidateId: string, reason: string, fields: readonly string[], blocking: boolean, category: ConsolidationReviewConstraint['category']): ConsolidationReviewConstraint {
  return { candidateId, reason, conflictingFields: [...new Set(fields)].sort(), blocking, category, reviewKey: consolidationReviewKey(candidateId, reason, fields) }
}
function mergeConfidence(left: number | undefined, right: number | undefined): number | undefined { if (left === undefined) return right; if (right === undefined) return left; return Math.min(left, right) }
function candidateRef(candidateRef: string, mention: string, entityType?: EntityCandidate['entityType']): CandidateEntityRef { return { candidateRef, mention, ...(entityType === undefined ? {} : { entityType }) } }
function namespaced(unitId: string, id: string): string { return `${unitId}::${id}` }

export function consolidateExtractions(extractions: readonly { unit: AcceptedExtractionUnit; result: ValidatedExtractKnowledgeResult }[]): ConsolidatedExtraction {
  const entityGroups = new Map<string, EntityCandidate>()
  const entityByMergedId = new Map<string, EntityCandidate>()
  const entityAliases = new Map<string, string>()
  const supportByEntityKey = new Map<string, { supportingCandidateCount: number; supportingUnitIds: Set<string>; evidenceBlockRefs: Set<string> }>()
  const relationInputs: Array<{ unitId: string; candidate: RelationCandidate }> = []
  const claimInputs: Array<{ unitId: string; candidate: ClaimCandidate }> = []
  const rejected: unknown[] = []
  const reviewConstraints: ConsolidationReviewConstraint[] = []
  const conflictedEntityFields = new Map<string, Set<string>>()
  let entityInput = 0
  let relationInput = 0
  let claimInput = 0
  for (const extraction of extractions) {
    const entities = [...extraction.result.entities].sort((a, b) => a.candidateId.localeCompare(b.candidateId))
    for (const candidate of entities) {
      entityInput += 1
      const originalId = namespaced(extraction.unit.unitId, candidate.candidateId)
      const key = entityKey(candidate)
      const support = supportByEntityKey.get(key) ?? { supportingCandidateCount: 0, supportingUnitIds: new Set<string>(), evidenceBlockRefs: new Set<string>() }
      support.supportingCandidateCount += 1
      support.supportingUnitIds.add(extraction.unit.unitId)
      for (const blockId of candidate.evidenceBlockRefs) support.evidenceBlockRefs.add(blockId)
      supportByEntityKey.set(key, support)
      const current = entityGroups.get(key)
      if (!current) {
        const mergedId = mergedEntityId(candidate)
        const value = { ...structuredClone(candidate), candidateId: mergedId, aliases: candidate.aliases === undefined ? undefined : [...new Set(candidate.aliases)].sort(), evidenceBlockRefs: [...new Set(candidate.evidenceBlockRefs)].sort() }
        entityGroups.set(key, value)
        entityByMergedId.set(mergedId, value)
        entityAliases.set(originalId, mergedId)
      } else {
        const conflicted = conflictedEntityFields.get(key) ?? new Set<string>()
        const descriptionConflict = !conflicted.has('description') && current.description !== undefined && current.description !== null && candidate.description !== undefined && candidate.description !== null && normalizeSemanticText(current.description) !== normalizeSemanticText(candidate.description)
        const currentFields = (current.semanticFields ?? {}) as Readonly<Record<string, unknown>>
        const candidateFields = (candidate.semanticFields ?? {}) as Readonly<Record<string, unknown>>
        const hardConflicts = candidate.entityType === 'company' ? ['ticker', 'exchange'].filter((field) => currentFields[field] !== undefined && currentFields[field] !== null && candidateFields[field] !== undefined && candidateFields[field] !== null && normalizeSemanticText(String(currentFields[field])) !== normalizeSemanticText(String(candidateFields[field]))) : []
        const legalNameConflict = !conflicted.has('legalName') && candidate.entityType === 'company' && currentFields.legalName !== undefined && currentFields.legalName !== null && candidateFields.legalName !== undefined && candidateFields.legalName !== null && normalizeSemanticText(String(currentFields.legalName)) !== normalizeSemanticText(String(candidateFields.legalName))
        const mergedFields = mergeSemanticFields(currentFields, candidateFields, conflicted)
        const merged = { ...current, aliases: addUnique(current.aliases ?? [], candidate.aliases ?? []), evidenceBlockRefs: addUnique(current.evidenceBlockRefs, candidate.evidenceBlockRefs), confidence: mergeConfidence(current.confidence, candidate.confidence), semanticFields: mergedFields, description: conflicted.has('description') || descriptionConflict ? undefined : mergeText(current.description, candidate.description) }
        if (descriptionConflict) { conflicted.add('description'); reviewConstraints.push(constraint(current.candidateId, 'Entity description variants across extraction units; canonical description omitted', ['description'], false, 'other')) }
        if (legalNameConflict) { conflicted.add('legalName'); reviewConstraints.push(constraint(current.candidateId, 'Entity legalName variants across extraction units; canonical legalName omitted', ['legalName'], false, 'other')) }
        if (hardConflicts.length > 0) { for (const field of hardConflicts) conflicted.add(field); reviewConstraints.push(constraint(current.candidateId, 'Company hard identity fields conflict across extraction units', hardConflicts, true, 'reconciliation_review')) }
        conflictedEntityFields.set(key, conflicted)
        entityGroups.set(key, merged)
        entityByMergedId.set(merged.candidateId, merged)
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
    const relationIdentity = { relationType: candidate.relationType, sourceCandidateId: endpoints[0]!, targetCandidateId: endpoints[1]! }
    const key = canonicalSerialize(relationIdentity)
    const current = relations.get(key)
    const sourceEntity = entityByMergedId.get(endpoints[0]!)
    const targetEntity = entityByMergedId.get(endpoints[1]!)
    const normalizedCandidate: RelationCandidate = { ...structuredClone(candidate), candidateId: `merged-relation-${hashKnowledgeObject(relationIdentity).slice(7, 23)}`, source: candidateRef(endpoints[0]!, sourceEntity?.name ?? candidate.source.mention, sourceEntity?.entityType ?? candidate.source.entityType), target: candidateRef(endpoints[1]!, targetEntity?.name ?? candidate.target.mention, targetEntity?.entityType ?? candidate.target.entityType) }
    if (!current) relations.set(key, normalizedCandidate)
    else {
      const left = current.attributes ?? null
      const right = normalizedCandidate.attributes ?? null
      const conflict = canonicalSerialize(left) !== canonicalSerialize(right)
      const mergedAttributes = !conflict && current.attributes !== undefined ? current.attributes : current.attributes ?? normalizedCandidate.attributes
      if (conflict) reviewConstraints.push(constraint(current.candidateId, 'Relation attributes conflict across extraction units', [...new Set([...Object.keys((left && typeof left === 'object' ? left : {}) as object), ...Object.keys((right && typeof right === 'object' ? right : {}) as object)])].sort(), true, 'reconciliation_review'))
      relations.set(key, { ...current, evidenceBlockRefs: addUnique(current.evidenceBlockRefs, normalizedCandidate.evidenceBlockRefs), confidence: mergeConfidence(current.confidence, normalizedCandidate.confidence), ...(mergedAttributes === undefined ? {} : { attributes: mergedAttributes }) })
    }
  }
  const claims = new Map<string, ClaimCandidate>()
  for (const { unitId, candidate } of claimInputs) {
    const resolvedSubjects = candidate.subjectRefs.map((subject) => {
      const mergedCandidateId = entityAliases.get(namespaced(unitId, subject.candidateRef))
      return mergedCandidateId === undefined ? undefined : { mergedCandidateId, originalRef: subject.candidateRef }
    })
    if (resolvedSubjects.some((subject) => subject === undefined || entityByMergedId.get(subject.mergedCandidateId) === undefined)) { rejected.push({ candidateId: candidate.candidateId, kind: 'claim', code: 'invalid_reference', message: 'Claim subject was not retained during consolidation' }); continue }
    const orderedSubjectIds = [...new Set(resolvedSubjects.map((subject) => subject!.mergedCandidateId))].sort()
    const semanticIdentity = { claimType: candidate.claimType, statement: normalizeSemanticText(candidate.statement), subjectRefs: orderedSubjectIds, temporal: candidate.temporal ?? null, structuredValue: candidate.structuredValue ?? null }
    const key = canonicalSerialize(semanticIdentity)
    const normalizedCandidate: ClaimCandidate = { ...structuredClone(candidate), candidateId: `merged-claim-${hashKnowledgeObject(semanticIdentity).slice(7, 23)}`, subjectRefs: orderedSubjectIds.map((mergedCandidateId) => { const entity = entityByMergedId.get(mergedCandidateId)!; return candidateRef(mergedCandidateId, entity.name, entity.entityType) }) }
    const current = claims.get(key)
    if (!current) claims.set(key, normalizedCandidate)
    else claims.set(key, { ...current, evidenceBlockRefs: addUnique(current.evidenceBlockRefs, normalizedCandidate.evidenceBlockRefs), confidence: mergeConfidence(current.confidence, normalizedCandidate.confidence) })
  }
  const groups = [
    ...[...entityGroups.values()].sort((a, b) => a.candidateId.localeCompare(b.candidateId)).map((candidate) => ({ candidateId: candidate.candidateId, kind: 'entity' as const, candidate })),
    ...[...relations.values()].sort((a, b) => a.candidateId.localeCompare(b.candidateId)).map((candidate) => ({ candidateId: candidate.candidateId, kind: 'relation' as const, candidate })),
    ...[...claims.values()].sort((a, b) => a.candidateId.localeCompare(b.candidateId)).map((candidate) => ({ candidateId: candidate.candidateId, kind: 'claim' as const, candidate })),
  ]
  const candidateIds = new Set<string>()
  for (const group of groups) {
    if (candidateIds.has(group.candidateId)) throw new Error(`Consolidation produced duplicate candidateId: ${group.candidateId}`)
    candidateIds.add(group.candidateId)
  }
  const entityCandidates = new Map([...entityGroups.values()].map((candidate) => [candidate.candidateId, candidate]))
  const candidateSupport = new Map([...entityGroups.entries()].map(([key, candidate]) => {
    const support = supportByEntityKey.get(key)!
    return [candidate.candidateId, { supportingCandidateCount: support.supportingCandidateCount, supportingUnitIds: [...support.supportingUnitIds].sort(), evidenceBlockRefs: [...support.evidenceBlockRefs].sort() }] as const
  }))
  return { groups, reviewConstraints: [...new Map(reviewConstraints.map((item) => [item.reviewKey, item])).values()].sort((a, b) => a.reviewKey.localeCompare(b.reviewKey)), rejected, candidateCounts: { entity: entityInput, relation: relationInput, claim: claimInput, consolidated: groups.length, rejected: rejected.length }, candidateAliases: entityAliases, entityCandidates, candidateSupport }
}
