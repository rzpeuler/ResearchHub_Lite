import { KNOWLEDGE_SCHEMA_V03 } from '../../knowledge/schema/executable-schema.ts'
import type { KnowledgeClaimV03, KnowledgeEntityV03, KnowledgeRelationV03, KnowledgeSourceV03 } from '../../knowledge/schema/domain.ts'
import type { KnowledgeChangeSetV03, KnowledgeOperationV03, KnowledgeSourceOperationV03 } from '../../knowledge/schema/mutation.ts'
import { allocateClaimId, allocateEntityId, allocateRelationId, allocateSourceId } from './id-helpers.ts'
import { hashKnowledgeObject } from '../../knowledge/storage/canonical-hash.ts'
import { KnowledgeIndexV03 } from '../../knowledge/query/index.ts'
import type { ReportMap, ReconciliationDecision, ResolvedCandidateGroup, EntityCandidate, RelationCandidate, ClaimCandidate } from '../../skills/knowledge-curation/contracts.ts'
import type { KnowledgeAssetCollectionV03 } from '../../knowledge/storage/v03-types.ts'
import { consolidationReviewKey, reconciliationReviewKey } from './review-telemetry.ts'
import type { AcceptedExtractionPlan, ReviewItem } from './contracts.ts'

type Dict = Record<string, unknown>
type ResolutionStatus = 'resolved_existing' | 'allocated_new' | 'no_operation' | 'review' | 'rejected'
export interface EntityResolution { readonly candidateId: string; readonly status: ResolutionStatus; readonly canonicalId?: string; readonly rationale: string }

export interface ChangeSetPlanningInput {
  readonly knowledgeBaseId: string
  readonly baseRevision: number
  readonly workflowRunId: string
  readonly rawRef: string
  readonly rawManifest: { readonly originalFilename: string | null; readonly suppliedMetadata: { readonly title: string | null; readonly institution: string | null; readonly author: string | null; readonly publishedAt: string | null; readonly sourceUrl: string | null } }
  readonly documentId: string
  readonly document: { readonly metadata: { readonly originalFilename: string | null; readonly title?: string | null } }
  readonly reportMap: ReportMap
  readonly plan: AcceptedExtractionPlan
  readonly groups: readonly ResolvedCandidateGroup[]
  readonly decisions: readonly ReconciliationDecision[]
  readonly assets: KnowledgeAssetCollectionV03
  readonly consolidationReviews?: readonly { readonly candidateId: string; readonly reason: string; readonly conflictingFields: readonly string[] }[]
}

export interface ChangeSetPlanningResult { readonly changeSet?: KnowledgeChangeSetV03; readonly reviewItems: readonly ReviewItem[]; readonly safeOperationCount: number; readonly summary: Readonly<Record<string, number>>; readonly entityResolutions: readonly EntityResolution[] }

function sourceType(value: string | undefined): KnowledgeSourceV03['sourceType'] { return KNOWLEDGE_SCHEMA_V03.source.types.includes(value as never) ? value as KnowledgeSourceV03['sourceType'] : 'unknown' }
function reliability(value: string | undefined): KnowledgeSourceV03['sourceReliability'] { return KNOWLEDGE_SCHEMA_V03.source.reliabilities.includes(value as never) ? value as KnowledgeSourceV03['sourceReliability'] : 'unknown' }
function normalized(value: unknown): string { return typeof value === 'string' ? value.trim().toLocaleLowerCase() : '' }
function record(value: unknown): value is Dict { return typeof value === 'object' && value !== null && !Array.isArray(value) }
function unique(values: readonly string[]): string[] { return [...new Set(values)].sort() }
function names(value: Dict): string[] { return [value.name, ...(Array.isArray(value.aliases) ? value.aliases.filter((item): item is string => typeof item === 'string') : [])].map(normalized).filter(Boolean) }
function blockLocator(plan: AcceptedExtractionPlan, refs: readonly string[]): string | null { const known = new Set(plan.units.flatMap((unit) => unit.primaryBlockIds)); return [...refs].sort().find((ref) => known.has(ref)) ?? [...refs].sort()[0] ?? null }
function sameEntity(candidate: EntityCandidate, value: Dict): boolean { if (value.type !== candidate.entityType) return false; const wanted = new Set([candidate.name, ...(candidate.aliases ?? [])].map(normalized).filter(Boolean)); return names(value).some((name) => wanted.has(name)) }
function sourceRefs(value: Dict): boolean { return Array.isArray(value.sourceRefs) }
function allowedAttributes(type: string): Dict | undefined { const definition = KNOWLEDGE_SCHEMA_V03.relation.definitions[type as keyof typeof KNOWLEDGE_SCHEMA_V03.relation.definitions] as { attributes?: Dict } | undefined; return definition?.attributes }
function validFinancialContribution(value: unknown): boolean {
  if (value === null) return true
  if (!record(value)) return false
  const allowed = new Set(['period', 'currency', 'revenueAmount', 'revenueShare', 'profitAmount', 'profitShare', 'separatelyReported'])
  for (const [key, child] of Object.entries(value)) {
    if (!allowed.has(key)) return false
    if (['period', 'currency'].includes(key) && child !== null && typeof child !== 'string') return false
    if (['revenueAmount', 'profitAmount'].includes(key) && child !== null && (typeof child !== 'number' || !Number.isFinite(child))) return false
    if (['revenueShare', 'profitShare'].includes(key) && child !== null && (typeof child !== 'number' || !Number.isFinite(child) || child < 0 || child > 1)) return false
    if (key === 'separatelyReported' && child !== null && typeof child !== 'boolean') return false
  }
  return true
}
function relationAttributeError(type: string, attributes: unknown): string | undefined {
  if (attributes === undefined) return undefined
  if (!record(attributes)) return 'Relation attributes must be an object'
  const rules = allowedAttributes(type)
  if (!rules && Object.keys(attributes).length > 0) return 'Relation type ' + type + ' does not support attributes'
  for (const [key, value] of Object.entries(attributes)) {
    const rule = rules?.[key]
    if (rule === undefined) return 'Unsupported relation attribute ' + key
    if (Array.isArray(rule) && !rule.includes(value as never)) return 'Relation attribute ' + key + ' is outside the Schema 0.3 vocabulary'
    if (rule === 'number_0_to_1_or_null' && value !== null && (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1)) return 'Relation attribute ' + key + ' must be between 0 and 1'
    if (key === 'financialContribution' && !validFinancialContribution(value)) return 'financialContribution is not schema-valid'
  }
  return undefined
}
function semanticFieldsError(candidate: EntityCandidate, themeGroups: Map<string, unknown>, existingInvestmentTheme: boolean): string | undefined {
  const fields = candidate.semanticFields
  if (candidate.entityType === 'investment_theme') {
    if (!fields && existingInvestmentTheme) return undefined
    if (!fields || typeof fields.themeGroupRef !== 'string' || !themeGroups.has(fields.themeGroupRef)) return 'New InvestmentTheme requires an existing deterministic ThemeGroup'
    if (Object.keys(fields).some((key) => key !== 'themeGroupRef')) return 'Unsupported InvestmentTheme semanticFields require review'
    return undefined
  }
  if (candidate.entityType === 'company') return fields && Object.keys(fields).some((key) => !['ticker', 'exchange', 'legalName'].includes(key)) ? 'Unsupported company semanticFields require review' : undefined
  return fields && Object.keys(fields).length > 0 ? 'Unsupported semanticFields require review' : undefined
}
function makeEntity(candidate: EntityCandidate, id: string, themeGroups: Map<string, unknown>): KnowledgeEntityV03 {
  const value: Dict = { id, type: candidate.entityType, name: candidate.name, aliases: unique(candidate.aliases ?? []), description: candidate.description ?? null, lifecycle: { status: 'active' } }
  const fields = candidate.semanticFields ?? {}
  if (candidate.entityType === 'company') for (const key of ['ticker', 'exchange', 'legalName']) if (fields[key] !== undefined) value[key] = fields[key]
  if (candidate.entityType === 'investment_theme' && typeof fields.themeGroupRef === 'string' && themeGroups.has(fields.themeGroupRef)) value.themeGroupRef = fields.themeGroupRef
  if (candidate.confidence !== undefined) value.metadata = { extractionConfidence: candidate.confidence }
  return value as unknown as KnowledgeEntityV03
}
function makeRelation(candidate: RelationCandidate, id: string, sourceRef: string, targetRef: string, sourceId: string): KnowledgeRelationV03 {
  const value: Dict = { id, type: candidate.relationType, sourceRef, targetRef, sourceRefs: [sourceId], lifecycle: { status: 'active' } }
  if (candidate.attributes !== undefined && Object.keys(candidate.attributes).length > 0) value.attributes = structuredClone(candidate.attributes)
  if (candidate.confidence !== undefined) value.confidence = candidate.confidence
  return value as unknown as KnowledgeRelationV03
}
function patchEntity(existing: KnowledgeEntityV03, candidate: EntityCandidate): KnowledgeEntityV03 {
  const value = structuredClone(existing) as unknown as Dict
  value.name = candidate.name
  value.aliases = unique([...(Array.isArray(value.aliases) ? value.aliases.filter((item): item is string => typeof item === 'string') : []), ...(candidate.aliases ?? [])])
  if (candidate.description !== undefined) value.description = candidate.description
  if (candidate.entityType === 'company') for (const key of ['ticker', 'exchange', 'legalName']) if (candidate.semanticFields?.[key] !== undefined) value[key] = candidate.semanticFields[key]
  if (candidate.confidence !== undefined) value.metadata = { ...(record(value.metadata) ? value.metadata : {}), extractionConfidence: candidate.confidence }
  return value as unknown as KnowledgeEntityV03
}
function patchRelation(existing: KnowledgeRelationV03, candidate: RelationCandidate, sourceRef: string, targetRef: string, sourceId: string): KnowledgeRelationV03 {
  const value = structuredClone(existing) as unknown as Dict
  value.sourceRef = sourceRef
  value.targetRef = targetRef
  value.sourceRefs = unique([...(Array.isArray(value.sourceRefs) ? value.sourceRefs.filter((item): item is string => typeof item === 'string') : []), sourceId])
  if (candidate.attributes !== undefined) value.attributes = structuredClone(candidate.attributes)
  if (candidate.confidence !== undefined) value.confidence = candidate.confidence
  return value as unknown as KnowledgeRelationV03
}
function patchClaim(input: ChangeSetPlanningInput, existing: KnowledgeClaimV03, candidate: ClaimCandidate, subjects: readonly string[], sourceId: string): KnowledgeClaimV03 {
  const value = structuredClone(existing) as unknown as Dict
  value.statement = candidate.statement
  value.claimType = candidate.claimType
  value.subjectRefs = unique(subjects)
  value.primarySubjectRef = subjects[0]
  value.sourceRefs = unique([...(Array.isArray(value.sourceRefs) ? value.sourceRefs.filter((item): item is string => typeof item === 'string') : []), sourceId])
  const anchors = candidate.evidenceBlockRefs.map((ref) => ({ sourceRef: sourceId, rawRef: input.rawRef, locator: blockLocator(input.plan, [ref]), chunkRef: null }))
  const provenance = Array.isArray(value.provenance) ? value.provenance.filter(record) : []
  const seen = new Set(provenance.map((item) => hashKnowledgeObject(item)))
  for (const anchor of anchors) { const key = hashKnowledgeObject(anchor); if (!seen.has(key)) { provenance.push(anchor); seen.add(key) } }
  value.provenance = provenance
  if (candidate.temporal !== undefined && candidate.temporal !== null) value.temporal = structuredClone(candidate.temporal)
  if (candidate.structuredValue !== undefined && candidate.structuredValue !== null) value.structuredValue = structuredClone(candidate.structuredValue)
  if (candidate.confidence !== undefined) value.confidence = candidate.confidence
  return value as unknown as KnowledgeClaimV03
}
function makeClaim(input: ChangeSetPlanningInput, candidate: ClaimCandidate, id: string, subjects: readonly string[], sourceId: string, supersedes?: string): KnowledgeClaimV03 {
  const value: Dict = { id, claimType: candidate.claimType, statement: candidate.statement, subjectRefs: unique(subjects), primarySubjectRef: subjects[0], sourceRefs: [sourceId], provenance: candidate.evidenceBlockRefs.map((ref) => ({ sourceRef: sourceId, rawRef: input.rawRef, locator: blockLocator(input.plan, [ref]), chunkRef: null })), lifecycle: { status: 'active' } }
  if (supersedes !== undefined) value.supersedes = [supersedes]
  if (candidate.temporal !== undefined && candidate.temporal !== null) value.temporal = structuredClone(candidate.temporal)
  if (candidate.structuredValue !== undefined && candidate.structuredValue !== null) value.structuredValue = structuredClone(candidate.structuredValue)
  if (candidate.confidence !== undefined) value.confidence = candidate.confidence
  return value as unknown as KnowledgeClaimV03
}
function existingEntities(candidate: EntityCandidate, input: ChangeSetPlanningInput, index: KnowledgeIndexV03): KnowledgeEntityV03[] {
  const supplied = input.groups.filter((group) => group.kind === 'entity').flatMap((group) => group.existingKnowledge ?? []).filter(record) as unknown as KnowledgeEntityV03[]
  return [...new Map([...index.entities.values(), ...supplied].filter((value) => typeof value.id === 'string').map((value) => [value.id, value] as const)).values()].filter((value) => sameEntity(candidate, value as unknown as Dict)).sort((a, b) => a.id.localeCompare(b.id))
}
function existingRelations(candidate: RelationCandidate, sourceRef: string, targetRef: string, input: ChangeSetPlanningInput, index: KnowledgeIndexV03): KnowledgeRelationV03[] {
  const supplied = input.groups.filter((group) => group.kind === 'relation').flatMap((group) => group.existingKnowledge ?? []).filter(record) as unknown as KnowledgeRelationV03[]
  const symmetric = candidate.relationType === 'competes_with' || candidate.relationType === 'substitutes_for'
  return [...new Map([...index.relations.values(), ...supplied].filter((value) => typeof value.id === 'string').map((value) => [value.id, value] as const)).values()].filter((value) => value.type === candidate.relationType && (value.sourceRef === sourceRef && value.targetRef === targetRef || symmetric && value.sourceRef === targetRef && value.targetRef === sourceRef)).sort((a, b) => a.id.localeCompare(b.id))
}
function claimIdentity(value: KnowledgeClaimV03): string { return hashKnowledgeObject({ claimType: value.claimType, statement: normalized(value.statement), subjectRefs: unique(value.subjectRefs), temporal: value.temporal ?? null, structuredValue: value.structuredValue ?? null }) }
function existingClaims(candidate: ClaimCandidate, subjects: readonly string[], input: ChangeSetPlanningInput, index: KnowledgeIndexV03): KnowledgeClaimV03[] {
  const wanted = hashKnowledgeObject({ claimType: candidate.claimType, statement: normalized(candidate.statement), subjectRefs: unique(subjects), temporal: candidate.temporal ?? null, structuredValue: candidate.structuredValue ?? null })
  const supplied = input.groups.filter((group) => group.kind === 'claim').flatMap((group) => group.existingKnowledge ?? []).filter(record) as unknown as KnowledgeClaimV03[]
  return [...new Map([...index.claims.values(), ...supplied].filter((value) => typeof value.id === 'string').map((value) => [value.id, value] as const)).values()].filter((value) => claimIdentity(value) === wanted).sort((a, b) => a.id.localeCompare(b.id))
}

export function planKnowledgeChangeSet(input: ChangeSetPlanningInput): ChangeSetPlanningResult {
  const index = KnowledgeIndexV03.fromAssets(input.assets)
  const sourceId = allocateSourceId({ sourceUrl: input.rawManifest.suppliedMetadata.sourceUrl, publishedAt: input.rawManifest.suppliedMetadata.publishedAt, title: input.rawManifest.suppliedMetadata.title ?? input.document.metadata.title ?? input.rawManifest.originalFilename, rawRef: input.rawRef })
  const source: KnowledgeSourceV03 = { id: sourceId as KnowledgeSourceV03['id'], title: input.rawManifest.suppliedMetadata.title ?? input.document.metadata.title ?? input.rawManifest.originalFilename ?? input.documentId, sourceType: sourceType(input.reportMap.sourceAssessment.sourceType), institution: input.rawManifest.suppliedMetadata.institution, author: input.rawManifest.suppliedMetadata.author, publishedAt: input.rawManifest.suppliedMetadata.publishedAt, url: input.rawManifest.suppliedMetadata.sourceUrl, sourceReliability: reliability(input.reportMap.sourceAssessment.reliability), rawRefs: [input.rawRef as KnowledgeSourceV03['rawRefs'] extends (infer T)[] ? T : never], metadata: { workflowRunId: input.workflowRunId, documentId: input.documentId }, lifecycle: { status: 'active' } }
  const decisions = new Map(input.decisions.map((decision) => [decision.candidateId, decision]))
  const groups = new Map(input.groups.map((group) => [group.candidateId, group]))
  const reviews = new Map<string, ReviewItem>()
  const rejected = new Set<string>()
  const dependents = new Map<string, string[]>()
  for (const group of input.groups) {
    if (group.kind === 'relation') for (const ref of [(group.candidate as RelationCandidate).source.candidateRef, (group.candidate as RelationCandidate).target.candidateRef]) dependents.set(ref, [...(dependents.get(ref) ?? []), group.candidateId])
    if (group.kind === 'claim') for (const ref of (group.candidate as ClaimCandidate).subjectRefs.map((subject) => subject.candidateRef)) dependents.set(ref, [...(dependents.get(ref) ?? []), group.candidateId])
  }
  const addReview = (candidateId: string, rationale: string, dependentCandidateIds: readonly string[] = [], metadata: Partial<Pick<ReviewItem, 'stage' | 'category' | 'dependency' | 'origin' | 'reviewKey'>> = {}): void => { const group = groups.get(candidateId); reviews.set(candidateId, { candidateId, kind: group?.kind ?? 'unknown', rationale, dependentCandidateIds: unique(dependentCandidateIds), stage: 'planner', origin: 'planner', dependency: false, ...metadata }) }
  const reconciliationMirror = (decision: ReconciliationDecision): Partial<Pick<ReviewItem, 'category' | 'origin' | 'reviewKey'>> => ({ category: 'reconciliation_review', origin: 'reconciliation_mirror', reviewKey: reconciliationReviewKey(decision.candidateId, decision.action, decision.rationale) })
  for (const constraint of input.consolidationReviews ?? []) addReview(constraint.candidateId, constraint.reason, [], { category: 'other', origin: 'consolidation_mirror', reviewKey: consolidationReviewKey(constraint.candidateId, constraint.reason, constraint.conflictingFields) })
  const entities = new Map<string, string>()
  const resolutions: EntityResolution[] = []
  const resolve = (candidateId: string, status: ResolutionStatus, canonicalId: string | undefined, rationale: string): void => { resolutions.push({ candidateId, status, ...(canonicalId === undefined ? {} : { canonicalId }), rationale }); if (canonicalId && status !== 'review' && status !== 'rejected') entities.set(candidateId, canonicalId) }
  const knowledgeOperations: KnowledgeOperationV03[] = []
  let sequence = 1
  const opId = (prefix: string): string => prefix + '-' + String(sequence++).padStart(3, '0')

  for (const group of input.groups.filter((item) => item.kind === 'entity').sort((a, b) => a.candidateId.localeCompare(b.candidateId))) {
    const decision = decisions.get(group.candidateId)
    const candidate = group.candidate as EntityCandidate
    if (!decision) { resolve(group.candidateId, 'review', undefined, 'Missing reconciliation decision'); addReview(group.candidateId, 'Missing reconciliation decision'); continue }
    if ((input.consolidationReviews ?? []).some((constraint) => constraint.candidateId === group.candidateId)) { resolve(group.candidateId, 'review', undefined, 'Consolidation conflict requires review'); continue }
    if (decision.action === 'reject') { rejected.add(group.candidateId); resolve(group.candidateId, 'rejected', undefined, decision.rationale); continue }
    if (decision.action === 'user_review') { resolve(group.candidateId, 'review', undefined, decision.rationale); addReview(group.candidateId, decision.rationale, dependents.get(group.candidateId), reconciliationMirror(decision)); continue }
    const matches = existingEntities(candidate, input, index)
    const baseId = allocateEntityId(candidate.entityType, candidate.name)
    const semanticError = semanticFieldsError(candidate, index.themeGroups, matches.length === 1 && (decision.action === 'duplicate' || decision.action === 'update_state'))
    if (semanticError) { resolve(group.candidateId, 'review', undefined, semanticError); addReview(group.candidateId, semanticError); continue }
    if (decision.action === 'duplicate') {
      if (matches.length === 1) resolve(group.candidateId, 'resolved_existing', matches[0].id, 'Reused exactly one deterministic existing Entity')
      else { resolve(group.candidateId, 'review', undefined, 'Duplicate requires exactly one deterministic existing Entity'); addReview(group.candidateId, 'Duplicate requires exactly one deterministic existing Entity') }
    } else if (decision.action === 'create') {
      if (matches.length > 0 || index.entities.has(baseId)) { resolve(group.candidateId, 'review', undefined, 'Create target already exists; explicit reuse or review is required'); addReview(group.candidateId, 'Create target already exists; no silent overwrite or skip') }
      else { resolve(group.candidateId, 'allocated_new', baseId, 'Allocated deterministic Entity ID'); knowledgeOperations.push({ operationId: opId('entity-create'), type: 'create', object: makeEntity(candidate, baseId, index.themeGroups) }) }
    } else if (decision.action === 'keep_both') {
      const id = allocateEntityId(candidate.entityType, candidate.name, { rawRef: input.rawRef, candidateId: group.candidateId })
      if (index.entities.has(id)) { resolve(group.candidateId, 'review', undefined, 'keep_both discriminator collides with an existing Entity'); addReview(group.candidateId, 'keep_both discriminator collides with an existing Entity') }
      else { resolve(group.candidateId, 'allocated_new', id, 'Allocated distinct keep_both Entity ID'); knowledgeOperations.push({ operationId: opId('entity-create'), type: 'create', object: makeEntity(candidate, id, index.themeGroups) }) }
    } else if (decision.action === 'update_state') {
      if (matches.length !== 1) { resolve(group.candidateId, 'review', undefined, 'update_state requires exactly one deterministic existing Entity'); addReview(group.candidateId, 'update_state requires exactly one deterministic existing Entity') }
      else { resolve(group.candidateId, 'resolved_existing', matches[0].id, 'Updated exactly one deterministic existing Entity'); knowledgeOperations.push({ operationId: opId('entity-update'), type: 'update', knowledgeId: matches[0].id, expectedBeforeHash: hashKnowledgeObject(matches[0]), object: patchEntity(matches[0], candidate) }) }
    } else { resolve(group.candidateId, 'review', undefined, decision.action + ' is unsupported for Entity targets'); addReview(group.candidateId, decision.action + ' is unsupported for Entity targets') }
  }
  for (const group of input.groups.filter((item) => item.kind === 'entity')) {
    if (reviews.has(group.candidateId)) for (const dependent of dependents.get(group.candidateId) ?? []) addReview(dependent, 'Blocked by Entity candidate ' + group.candidateId + ' requiring review', [group.candidateId], { category: 'invalid_reference', dependency: true, origin: 'dependency_isolation', reviewKey: ['dependency', group.candidateId, dependent].join('|') })
    if (rejected.has(group.candidateId)) for (const dependent of dependents.get(group.candidateId) ?? []) { rejected.add(dependent); addReview(dependent, 'Blocked by rejected Entity candidate ' + group.candidateId, [group.candidateId], { category: 'invalid_reference', dependency: true, origin: 'dependency_isolation', reviewKey: ['dependency', group.candidateId, dependent].join('|') }) }
  }

  for (const group of input.groups.filter((item) => item.kind === 'relation').sort((a, b) => a.candidateId.localeCompare(b.candidateId))) {
    const decision = decisions.get(group.candidateId)
    const candidate = group.candidate as RelationCandidate
    if (!decision) { addReview(group.candidateId, 'Missing reconciliation decision'); continue }
    const consolidationConstraint = (input.consolidationReviews ?? []).find((constraint) => constraint.candidateId === group.candidateId)
    if (consolidationConstraint) { addReview(group.candidateId, 'Consolidation conflict requires review', [], { category: 'other', origin: 'consolidation_mirror', reviewKey: consolidationReviewKey(consolidationConstraint.candidateId, consolidationConstraint.reason, consolidationConstraint.conflictingFields) }); continue }
    if (decision.action === 'reject') { rejected.add(group.candidateId); continue }
    if (decision.action === 'user_review') { addReview(group.candidateId, decision.rationale, [], reconciliationMirror(decision)); continue }
    const sourceRef = entities.get(candidate.source.candidateRef)
    const targetRef = entities.get(candidate.target.candidateRef)
    if (!sourceRef || !targetRef) { if (!rejected.has(group.candidateId)) addReview(group.candidateId, 'Relation endpoint resolution is blocked or ambiguous'); continue }
    const attrError = relationAttributeError(candidate.relationType, candidate.attributes)
    if (attrError) { addReview(group.candidateId, attrError); continue }
    const matches = existingRelations(candidate, sourceRef, targetRef, input, index)
    const deterministicId = allocateRelationId(candidate.relationType, sourceRef, targetRef, candidate.attributes ?? {})
    const create = (id: string): void => { if (index.relations.has(id)) addReview(group.candidateId, 'Deterministic Relation ID already exists; no silent overwrite'); else knowledgeOperations.push({ operationId: opId('relation-create'), type: 'create', object: makeRelation(candidate, id, sourceRef, targetRef, sourceId) }) }
    if (decision.action === 'duplicate') {
      if (matches.length !== 1) addReview(group.candidateId, 'Duplicate requires exactly one deterministic existing Relation')
    } else if (decision.action === 'create') {
      if (matches.length > 0 || index.relations.has(deterministicId)) addReview(group.candidateId, 'Create target already exists; planner will not silently skip it')
      else create(deterministicId)
    } else if (decision.action === 'keep_both') {
      if (candidate.relationType === 'business_exposure' && matches.some((value) => value.lifecycle.status === 'active')) addReview(group.candidateId, 'keep_both is illegal for an existing active business_exposure pair', [], { category: 'relation_cardinality' })
      else create(allocateRelationId(candidate.relationType, sourceRef, targetRef, candidate.attributes ?? {}, { rawRef: input.rawRef, candidateId: group.candidateId }))
    } else if (decision.action === 'merge_source') {
      if (matches.length !== 1 || !sourceRefs(matches[0] as unknown as Dict)) addReview(group.candidateId, 'merge_source requires exactly one Relation target supporting sourceRefs')
      else knowledgeOperations.push({ operationId: opId('relation-source-merge'), type: 'merge_source', knowledgeId: matches[0].id, expectedBeforeHash: hashKnowledgeObject(matches[0]), addSourceRefs: [sourceId] })
    } else if (decision.action === 'update_state') {
      if (matches.length !== 1) addReview(group.candidateId, 'update_state requires exactly one deterministic Relation target')
      else knowledgeOperations.push({ operationId: opId('relation-update'), type: 'update', knowledgeId: matches[0].id, expectedBeforeHash: hashKnowledgeObject(matches[0]), object: patchRelation(matches[0], candidate, sourceRef, targetRef, sourceId) })
    } else addReview(group.candidateId, decision.action + ' is unsupported for Relation targets')
  }

  for (const group of input.groups.filter((item) => item.kind === 'claim').sort((a, b) => a.candidateId.localeCompare(b.candidateId))) {
    const decision = decisions.get(group.candidateId)
    const candidate = group.candidate as ClaimCandidate
    if (!decision) { addReview(group.candidateId, 'Missing reconciliation decision'); continue }
    const consolidationConstraint = (input.consolidationReviews ?? []).find((constraint) => constraint.candidateId === group.candidateId)
    if (consolidationConstraint) { addReview(group.candidateId, 'Consolidation conflict requires review', [], { category: 'other', origin: 'consolidation_mirror', reviewKey: consolidationReviewKey(consolidationConstraint.candidateId, consolidationConstraint.reason, consolidationConstraint.conflictingFields) }); continue }
    if (decision.action === 'reject') { rejected.add(group.candidateId); continue }
    if (decision.action === 'user_review') { addReview(group.candidateId, decision.rationale, [], reconciliationMirror(decision)); continue }
    const subjects = candidate.subjectRefs.map((subject) => entities.get(subject.candidateRef))
    if (subjects.some((value) => value === undefined)) { if (!rejected.has(group.candidateId)) addReview(group.candidateId, 'Claim subject resolution is blocked or ambiguous'); continue }
    const subjectRefs = subjects as string[]
    const matches = existingClaims(candidate, subjectRefs, input, index)
    const deterministicId = allocateClaimId({ claimType: candidate.claimType, statement: normalized(candidate.statement), subjectRefs: unique(subjectRefs), temporal: candidate.temporal ?? null, structuredValue: candidate.structuredValue ?? null })
    if (decision.action === 'duplicate') {
      if (matches.length !== 1) addReview(group.candidateId, 'Duplicate requires exactly one deterministic existing Claim')
    } else if (decision.action === 'create') {
      if (matches.length > 0 || index.claims.has(deterministicId)) addReview(group.candidateId, 'Create target already exists; planner will not silently skip it')
      else knowledgeOperations.push({ operationId: opId('claim-create'), type: 'create', object: makeClaim(input, candidate, deterministicId, subjectRefs, sourceId) })
    } else if (decision.action === 'keep_both') {
      const id = allocateClaimId({ claimType: candidate.claimType, statement: candidate.statement, subjectRefs: unique(subjectRefs), temporal: candidate.temporal ?? null, structuredValue: candidate.structuredValue ?? null, discriminator: { rawRef: input.rawRef, candidateId: group.candidateId } })
      if (index.claims.has(id)) addReview(group.candidateId, 'keep_both discriminator collides with an existing Claim')
      else knowledgeOperations.push({ operationId: opId('claim-create'), type: 'create', object: makeClaim(input, candidate, id, subjectRefs, sourceId) })
    } else if (decision.action === 'merge_source') {
      if (matches.length !== 1 || !sourceRefs(matches[0] as unknown as Dict)) addReview(group.candidateId, 'merge_source requires exactly one Claim target supporting sourceRefs')
      else knowledgeOperations.push({ operationId: opId('claim-source-merge'), type: 'merge_source', knowledgeId: matches[0].id, expectedBeforeHash: hashKnowledgeObject(matches[0]), addSourceRefs: [sourceId] })
    } else if (decision.action === 'update_state') {
      if (matches.length !== 1) addReview(group.candidateId, 'update_state requires exactly one deterministic Claim target')
      else knowledgeOperations.push({ operationId: opId('claim-update'), type: 'update', knowledgeId: matches[0].id, expectedBeforeHash: hashKnowledgeObject(matches[0]), object: patchClaim(input, matches[0], candidate, subjectRefs, sourceId) })
    } else if (decision.action === 'supersede') {
      if (matches.length !== 1) addReview(group.candidateId, 'supersede requires exactly one Claim target')
      else { const id = allocateClaimId({ claimType: candidate.claimType, statement: candidate.statement, subjectRefs: unique(subjectRefs), temporal: candidate.temporal ?? null, structuredValue: candidate.structuredValue ?? null, discriminator: { supersedes: matches[0].id } }); knowledgeOperations.push({ operationId: opId('claim-supersede'), type: 'supersede', knowledgeId: matches[0].id, expectedBeforeHash: hashKnowledgeObject(matches[0]), replacement: makeClaim(input, candidate, id, subjectRefs, sourceId, matches[0].id) }) }
    } else addReview(group.candidateId, decision.action + ' is unsupported for Claim targets')
  }

  const reviewCount = reviews.size
  if (knowledgeOperations.length === 0) return { reviewItems: [...reviews.values()].sort((a, b) => a.candidateId.localeCompare(b.candidateId)), safeOperationCount: 0, summary: { sourceOperations: 0, knowledgeCreates: 0, reviewItems: reviewCount, blockedDependencies: rejected.size, noChanges: 1 }, entityResolutions: resolutions }
  const sourceOperations: KnowledgeSourceOperationV03[] = []
  const existingSource = index.sources.get(sourceId)
  if (existingSource) sourceOperations.push({ operationId: 'source-merge-001', type: 'source_merge', sourceId, expectedBeforeHash: hashKnowledgeObject(existingSource), addRawRefs: [input.rawRef] })
  else sourceOperations.push({ operationId: 'source-create-001', type: 'source_create', source })
  const changeSetId = 'changeset-' + hashKnowledgeObject({ workflowRunId: input.workflowRunId, knowledgeBaseId: input.knowledgeBaseId, rawRef: input.rawRef, documentId: input.documentId, groups: input.groups, decisions: input.decisions }).slice(7, 23)
  const changeSet: KnowledgeChangeSetV03 = { changeSetId, workflowRunId: input.workflowRunId, knowledgeBaseId: input.knowledgeBaseId, schemaVersion: '0.3', storageFormatVersion: '1', expectedBaseRevision: input.baseRevision, requiresRawProvenance: true, sourceOperations, knowledgeOperations, ingestionContext: { documentId: input.documentId, rawRef: input.rawRef, extractionUnitCount: input.plan.units.length } }
  return { changeSet, reviewItems: [...reviews.values()].sort((a, b) => a.candidateId.localeCompare(b.candidateId)), safeOperationCount: sourceOperations.length + knowledgeOperations.length, summary: { sourceOperations: sourceOperations.length, knowledgeCreates: knowledgeOperations.filter((operation) => operation.type === 'create').length, reviewItems: reviewCount, blockedDependencies: rejected.size }, entityResolutions: resolutions }
}
