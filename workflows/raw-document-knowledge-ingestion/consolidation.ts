import { normalizeSemanticText } from '../../knowledge/registry/id-allocation.ts'
import { canonicalSerialize, hashKnowledgeObject } from '../../knowledge/storage/canonical-hash.ts'
import type { CandidateEntityRef, ClaimCandidate, EntityCandidate, RelationCandidate, ValidatedExtractKnowledgeResult } from '../../skills/knowledge-curation/contracts.ts'
import { normalizeCompanyCandidateIdentity } from '../../skills/knowledge-curation/company-identity.ts'
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
function companyHardKey(candidate: EntityCandidate): string | undefined {
  if (candidate.entityType !== 'company') return undefined
  const fields = candidate.semanticFields ?? {}
  const ticker = typeof fields.ticker === 'string' ? normalizeSemanticText(fields.ticker) : ''
  const exchange = typeof fields.exchange === 'string' ? normalizeSemanticText(fields.exchange) : ''
  return ticker !== '' && exchange !== '' ? canonicalSerialize({ exchange, ticker }) : undefined
}
function labelSet(candidate: EntityCandidate): Set<string> { return new Set([candidate.name, ...(candidate.aliases ?? [])].map(normalizeSemanticText).filter(Boolean)) }
function intersects(left: Set<string>, right: Set<string>): boolean { for (const value of left) if (right.has(value)) return true; return false }
function displayName(candidate: EntityCandidate): string { return candidate.name.trim().replace(/\s+/gu, ' ') }
function canonicalCompanyName(candidates: readonly EntityCandidate[]): string {
  return [...candidates].map(displayName).sort((left, right) => [...left].length - [...right].length || normalizeSemanticText(left).localeCompare(normalizeSemanticText(right)) || left.localeCompare(right))[0]!
}
function mergedEntityId(candidates: readonly EntityCandidate[], hardKey: string | undefined): string {
  const candidate = candidates[0]!
  const identity = hardKey !== undefined ? { entityType: candidate.entityType, companyHardKey: hardKey } : candidate.entityType === 'company' ? { ...semanticEntityIdentity({ ...candidate, name: canonicalCompanyName(candidates) }), names: candidates.map((item) => normalizeSemanticText(item.name)).sort() } : semanticEntityIdentity(candidate)
  return `merged-entity-${hashKnowledgeObject(identity).slice(7, 23)}`
}
function addUnique(values: readonly string[], additions: readonly string[]): string[] { return [...new Set([...values, ...additions])].sort() }
function constraint(candidateId: string, reason: string, fields: readonly string[], blocking: boolean, category: ConsolidationReviewConstraint['category'], conflictValues?: ConsolidationReviewConstraint['conflictValues']): ConsolidationReviewConstraint {
  return { candidateId, reason, conflictingFields: [...new Set(fields)].sort(), blocking, category, reviewKey: consolidationReviewKey(candidateId, reason, fields), ...(conflictValues === undefined ? {} : { conflictValues }) }
}
function mergeConfidence(left: number | undefined, right: number | undefined): number | undefined { if (left === undefined) return right; if (right === undefined) return left; return Math.min(left, right) }
function candidateRef(candidateRef: string, mention: string, entityType?: EntityCandidate['entityType']): CandidateEntityRef { return { candidateRef, mention, ...(entityType === undefined ? {} : { entityType }) } }
function namespaced(unitId: string, id: string): string { return `${unitId}::${id}` }
function mergeGenericSemanticFields(candidates: readonly EntityCandidate[]): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...(candidates[0]?.semanticFields ?? {}) }
  const conflicted = new Set<string>()
  for (const candidate of candidates.slice(1)) {
    for (const [key, value] of Object.entries(candidate.semanticFields ?? {})) {
      if (value === undefined || value === null || conflicted.has(key)) continue
      const current = merged[key]
      if (current === undefined || current === null) merged[key] = value
      else if (normalizeSemanticText(String(current)) === normalizeSemanticText(String(value))) merged[key] = [String(current), String(value)].sort((left, right) => left.localeCompare(right))[0]
      else if (key === 'legalName' || key === 'ticker' || key === 'exchange') { conflicted.add(key); delete merged[key] }
    }
  }
  return merged
}

interface EntityInput { readonly unitId: string; readonly originalId: string; readonly candidate: EntityCandidate }
interface EntityGroupState { readonly groupKey: string; readonly hardKey?: string; readonly inputs: EntityInput[]; readonly blockingReason?: string }

function mergeEntityCandidates(inputs: readonly EntityInput[], hardKey: string | undefined): { candidate: EntityCandidate; conflicts: readonly { reason: string; fields: readonly string[]; blocking: boolean; category: ConsolidationReviewConstraint['category'] }[] } {
  const candidates = inputs.map((input) => input.candidate)
  const first = candidates[0]!
  const name = first.entityType === 'company' ? canonicalCompanyName(candidates) : displayName(first)
  const namesAndAliases = candidates.flatMap((candidate) => first.entityType === 'company' ? [candidate.name, ...(candidate.aliases ?? [])] : (candidate.aliases ?? [])).map((value) => value.trim().replace(/\s+/gu, ' ')).filter(Boolean)
  const mergedAliases = first.entityType === 'company'
    ? [...new Map(namesAndAliases.map((value) => [normalizeSemanticText(value), value])).values()].filter((value) => normalizeSemanticText(value) !== normalizeSemanticText(name)).sort((left, right) => normalizeSemanticText(left).localeCompare(normalizeSemanticText(right)) || left.localeCompare(right))
    : [...new Set(namesAndAliases)].sort((left, right) => normalizeSemanticText(left).localeCompare(normalizeSemanticText(right)) || left.localeCompare(right))
  const conflicts: Array<{ reason: string; fields: readonly string[]; blocking: boolean; category: ConsolidationReviewConstraint['category'] }> = []
  const descriptions = candidates.map((candidate) => candidate.description).filter((value): value is string => value !== undefined && value !== null)
  const description = descriptions.length === 0 ? undefined : new Set(descriptions.map(normalizeSemanticText)).size === 1 ? [...descriptions].sort((left, right) => left.localeCompare(right))[0] : undefined
  if (descriptions.length > 1 && new Set(descriptions.map(normalizeSemanticText)).size > 1) conflicts.push({ reason: 'Entity description variants across extraction units; canonical description omitted', fields: ['description'], blocking: false, category: 'other' })
  const fieldValues = (field: string): string[] => candidates.map((candidate) => candidate.semanticFields?.[field]).filter((value): value is string => typeof value === 'string' && value.trim() !== '').map((value) => value.trim())
  const semanticFields: Record<string, unknown> = first.entityType === 'company' ? {} : mergeGenericSemanticFields(candidates)
  for (const field of ['ticker', 'exchange', 'legalName']) {
    const values = fieldValues(field)
    if (values.length === 0) continue
    const normalizedValues = new Set(values.map(normalizeSemanticText))
    if (normalizedValues.size === 1) semanticFields[field] = [...values].sort((left, right) => left.localeCompare(right))[0]
    else {
      delete semanticFields[field]
      const blocking = field === 'ticker' || field === 'exchange'
      conflicts.push({ reason: blocking ? 'Company hard identity fields conflict across extraction units' : 'Entity legalName variants across extraction units; canonical legalName omitted', fields: [field], blocking, category: blocking ? 'reconciliation_review' : 'other' })
    }
  }
  const evidenceBlockRefs = [...new Set(inputs.flatMap((input) => input.candidate.evidenceBlockRefs))].sort()
  const confidence = inputs.map((input) => input.candidate.confidence).reduce((left, right) => mergeConfidence(left, right), undefined)
  const candidate: EntityCandidate = { ...structuredClone(first), candidateId: mergedEntityId(candidates, hardKey), name, ...(mergedAliases.length === 0 ? { aliases: undefined } : { aliases: mergedAliases }), description, ...(Object.keys(semanticFields).length === 0 ? { semanticFields: undefined } : { semanticFields }), evidenceBlockRefs, ...(confidence === undefined ? {} : { confidence }) }
  return { candidate, conflicts }
}

export function consolidateExtractions(extractions: readonly { unit: AcceptedExtractionUnit; result: ValidatedExtractKnowledgeResult }[]): ConsolidatedExtraction {
  const entityGroups = new Map<string, EntityCandidate>()
  const entityByMergedId = new Map<string, EntityCandidate>()
  const entityAliases = new Map<string, string>()
  const supportByEntityKey = new Map<string, { supportingCandidateCount: number; supportingUnitIds: Set<string>; evidenceBlockRefs: Set<string> }>()
  const entityInputs: EntityInput[] = []
  const relationInputs: Array<{ unitId: string; candidate: RelationCandidate }> = []
  const claimInputs: Array<{ unitId: string; candidate: ClaimCandidate }> = []
  const rejected: unknown[] = []
  const reviewConstraints: ConsolidationReviewConstraint[] = []
  let entityInput = 0
  let relationInput = 0
  let claimInput = 0
  for (const extraction of extractions) {
    const entities = [...extraction.result.entities].sort((a, b) => a.candidateId.localeCompare(b.candidateId))
    for (const candidate of entities) {
      entityInput += 1
      const originalId = namespaced(extraction.unit.unitId, candidate.candidateId)
      const normalized = normalizeCompanyCandidateIdentity(candidate)
      if (normalized.diagnostics.length > 0) { rejected.push({ candidateId: candidate.candidateId, kind: 'entity', code: 'invalid_semantics', message: normalized.diagnostics[0]!.message }); continue }
      entityInputs.push({ unitId: extraction.unit.unitId, originalId, candidate: normalized.candidate })
    }
    for (const candidate of [...extraction.result.relations].sort((a, b) => a.candidateId.localeCompare(b.candidateId))) { relationInput += 1; relationInputs.push({ unitId: extraction.unit.unitId, candidate }) }
    for (const candidate of [...extraction.result.claims].sort((a, b) => a.candidateId.localeCompare(b.candidateId))) { claimInput += 1; claimInputs.push({ unitId: extraction.unit.unitId, candidate }) }
    rejected.push(...extraction.result.rejected)
  }
  const hardGroups = new Map<string, EntityInput[]>()
  const unkeyed = [] as EntityInput[]
  const genericGroups = new Map<string, EntityInput[]>()
  for (const input of entityInputs) {
    if (input.candidate.entityType !== 'company') {
      const key = entityKey(input.candidate)
      genericGroups.set(key, [...(genericGroups.get(key) ?? []), input])
      continue
    }
    const hardKey = companyHardKey(input.candidate)
    if (hardKey === undefined) unkeyed.push(input)
    else hardGroups.set(hardKey, [...(hardGroups.get(hardKey) ?? []), input])
  }
  const states: EntityGroupState[] = [...genericGroups.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([groupKey, inputs]) => ({ groupKey, inputs }))
  const hardStates: EntityGroupState[] = [...hardGroups.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([hardKey, inputs]) => ({ groupKey: `company-hard:${hardKey}`, hardKey, inputs }))
  states.push(...hardStates)
  const addToState = (state: EntityGroupState, input: EntityInput): void => { state.inputs.push(input) }
  for (const input of unkeyed.sort((left, right) => left.originalId.localeCompare(right.originalId))) {
    const labels = labelSet(input.candidate)
    const matches = hardStates.filter((state) => intersects(labels, new Set(state.inputs.flatMap((item) => [...labelSet(item.candidate)]))))
    if (matches.length === 1) { addToState(matches[0]!, input); continue }
    if (matches.length > 1) {
      states.push({ groupKey: `company-ambiguous:${input.originalId}`, inputs: [input], blockingReason: 'Unkeyed Company candidate ambiguously matches multiple hard-identity groups' })
      continue
    }
    const unkeyedStates = states.filter((state) => state.hardKey === undefined && state.groupKey.startsWith('company-unkeyed:'))
    const exactMatches = unkeyedStates.filter((state) => intersects(labels, new Set(state.inputs.flatMap((item) => [...labelSet(item.candidate)]))))
    if (exactMatches.length === 1) addToState(exactMatches[0]!, input)
    else if (exactMatches.length > 1) states.push({ groupKey: `company-ambiguous-unkeyed:${input.originalId}`, inputs: [input], blockingReason: 'Unkeyed Company candidate ambiguously matches multiple exact Company groups' })
    else states.push({ groupKey: `company-unkeyed:${input.originalId}`, inputs: [input] })
  }
  for (const state of states.sort((left, right) => left.groupKey.localeCompare(right.groupKey))) {
    const hardKey = state.hardKey
    const merged = mergeEntityCandidates(state.inputs, hardKey)
    const candidate = merged.candidate
    entityGroups.set(state.groupKey, candidate)
    entityByMergedId.set(candidate.candidateId, candidate)
    for (const input of state.inputs) entityAliases.set(input.originalId, candidate.candidateId)
    const support = { supportingCandidateCount: state.inputs.length, supportingUnitIds: new Set(state.inputs.map((input) => input.unitId)), evidenceBlockRefs: new Set(state.inputs.flatMap((input) => input.candidate.evidenceBlockRefs)) }
    supportByEntityKey.set(state.groupKey, support)
    for (const item of merged.conflicts) reviewConstraints.push(constraint(candidate.candidateId, item.reason, item.fields, item.blocking, item.category))
    if (state.blockingReason !== undefined) reviewConstraints.push(constraint(candidate.candidateId, state.blockingReason, [], true, 'reconciliation_review'))
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
      if (conflict) {
        const leftAttributes = left && typeof left === 'object' && !Array.isArray(left) ? left as Record<string, unknown> : {}
        const rightAttributes = right && typeof right === 'object' && !Array.isArray(right) ? right as Record<string, unknown> : {}
        reviewConstraints.push(constraint(current.candidateId, 'Relation attributes conflict across extraction units', [...new Set([...Object.keys(leftAttributes), ...Object.keys(rightAttributes)])].sort(), true, 'reconciliation_review', { left: structuredClone(leftAttributes), right: structuredClone(rightAttributes) }))
      }
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
