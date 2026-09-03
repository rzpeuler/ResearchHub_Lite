import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile, readdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { consolidateExtractions } from '../../workflows/raw-document-knowledge-ingestion/consolidation.ts'
import { planKnowledgeChangeSet } from '../../workflows/raw-document-knowledge-ingestion/changeset-planner.ts'
import { allocateSourceId } from '../../workflows/raw-document-knowledge-ingestion/id-helpers.ts'
import { boundedExtract } from '../../workflows/raw-document-knowledge-ingestion/workflow.ts'
import { KnowledgeCurationError } from '../../skills/knowledge-curation/errors.ts'
import { retrieveFocusedKnowledge } from '../../workflows/raw-document-knowledge-ingestion/retrieval.ts'
import { emptyReviewSummary, normalizeReviewSummary, writeNoOpExecutionRecord } from '../../workflows/raw-document-knowledge-ingestion/review-telemetry.ts'
import { withKnowledgeBaseMutationLock } from '../../knowledge/storage/mutation-lock.ts'
import { createKnowledgeBase, readManifest, removeKnowledgeBase } from '../knowledge/helpers.ts'
import type { KnowledgeAssetCollectionV03 } from '../../knowledge/storage/v03-types.ts'
import type { ClaimCandidate, EntityCandidate, RelationCandidate, ResolvedCandidateGroup, ReconciliationDecision, ValidatedExtractKnowledgeResult } from '../../skills/knowledge-curation/contracts.ts'
import type { EntityTypeV03 } from '../../knowledge/schema/domain.ts'

const rawRef = 'raw-sha256-' + '0'.repeat(64)
const emptyAssets = (): KnowledgeAssetCollectionV03 => ({ rootDir: '', themeGroups: [], entities: [], relations: [], claims: [], modules: [], sources: [], registry: [] })
const reportMap = { sourceAssessment: { summary: 'test', sourceType: 'unknown' as const, reliability: 'unknown' as const }, researchScope: 'test', majorTopics: [], majorEntityMentions: [], majorConclusions: [], sectionSemantics: [], semanticDependencies: [], themeHypotheses: [], uncertainty: [] }
const acceptedPlan = { units: [], excludedBlockIds: [], estimatedContextTokens: {} }
function loaded(kind: 'entity' | 'relation' | 'claim', value: Record<string, unknown>): { kind: typeof kind; value: Record<string, unknown>; filePath: string; storageRef: string } { return { kind, value, filePath: '', storageRef: '' } }
function entity(id: string, name: string, type: EntityTypeV03 = 'company', extra: Record<string, unknown> = {}): EntityCandidate { return { candidateId: id, entityType: type, name, evidenceBlockRefs: [], reason: 'test', ...extra } }
function relation(id: string, type: RelationCandidate['relationType'], source: string, target: string, attributes?: Record<string, unknown>): RelationCandidate { return { candidateId: id, relationType: type, source: { candidateRef: source, mention: source }, target: { candidateRef: target, mention: target }, ...(attributes === undefined ? {} : { attributes }), evidenceBlockRefs: [], reason: 'test' } }
function claim(id: string, statement: string, subject: string, extra: Record<string, unknown> = {}): ClaimCandidate { return { candidateId: id, claimType: 'fact', statement, subjectRefs: [{ candidateRef: subject, mention: subject }], evidenceBlockRefs: [], reason: 'test', ...extra } }
function input(groups: readonly ResolvedCandidateGroup[], decisions: readonly ReconciliationDecision[], assets = emptyAssets()): Parameters<typeof planKnowledgeChangeSet>[0] { return { knowledgeBaseId: 'kb-test', baseRevision: 0, workflowRunId: 'run-test', rawRef, rawManifest: { originalFilename: 'test.txt', suppliedMetadata: { title: 'Test', institution: null, author: null, publishedAt: null, sourceUrl: null } }, documentId: 'doc-test', document: { metadata: { originalFilename: 'test.txt', title: 'Test' } }, reportMap, plan: acceptedPlan, groups, decisions, assets } }
function decisionsFor(groups: readonly ResolvedCandidateGroup[], action: ReconciliationDecision['action']): ReconciliationDecision[] { return groups.map((group) => ({ candidateId: group.candidateId, action, rationale: 'test' })) }
function assetsWithEntities(values: Record<string, unknown>[], relations: Record<string, unknown>[] = [], claims: Record<string, unknown>[] = []): KnowledgeAssetCollectionV03 { return { ...emptyAssets(), entities: values.map((value) => loaded('entity', value) as never), relations: relations.map((value) => loaded('relation', value) as never), claims: claims.map((value) => loaded('claim', value) as never) } }
function extraction(unitId: string, candidate: ClaimCandidate, description = 'same'): { unit: { unitId: string; proposedUnitId: string; topic: string; semanticPurpose: string; primaryRefs: []; contextRefs: []; primaryBlockIds: string[]; contextBlockIds: string[] }; result: ValidatedExtractKnowledgeResult } { return { unit: { unitId, proposedUnitId: unitId, topic: 'test', semanticPurpose: 'test', primaryRefs: [], contextRefs: [], primaryBlockIds: [], contextBlockIds: [] }, result: { entities: [entity('e', 'Entity', 'company', { description, evidenceBlockRefs: [] })], relations: [], claims: [candidate], rejected: [], summary: { inputCounts: { entity: 1, relation: 0, claim: 1 }, acceptedCounts: { entity: 1, relation: 0, claim: 1 }, rejectedCounts: { entity: 0, relation: 0, claim: 0 }, rejectionCodes: [] } } } }

test('planner duplicate Entity requires one exact target and never creates', () => {
  const group = { candidateId: 'e', kind: 'entity' as const, candidate: entity('e', 'Acme'), existingKnowledge: [{ id: 'entity:acme', type: 'company', name: 'Acme', lifecycle: { status: 'active' } }] }
  const result = planKnowledgeChangeSet(input([group], decisionsFor([group], 'duplicate')))
  assert.equal(result.entityResolutions[0]?.status, 'resolved_existing')
  assert.equal(result.changeSet, undefined)
})

test('planner duplicate Entity with zero or ambiguous targets becomes review', () => {
  const zero = { candidateId: 'e', kind: 'entity' as const, candidate: entity('e', 'Acme') }
  assert.equal(planKnowledgeChangeSet(input([zero], decisionsFor([zero], 'duplicate'))).reviewItems.length, 1)
  const ambiguous = { ...zero, existingKnowledge: [{ id: 'entity:a', type: 'company', name: 'Acme', lifecycle: { status: 'active' } }, { id: 'entity:b', type: 'company', name: 'Acme', lifecycle: { status: 'active' } }] }
  assert.equal(planKnowledgeChangeSet(input([ambiguous], decisionsFor([ambiguous], 'duplicate'))).reviewItems.length, 1)
})

test('planner Relation merge_source and update_state preserve sourceRefs', () => {
  const a = { id: 'entity:a', type: 'company', name: 'A', lifecycle: { status: 'active' } }
  const b = { id: 'entity:b', type: 'product', name: 'B', lifecycle: { status: 'active' } }
  const old = { id: 'relation:old', type: 'offers_product', sourceRef: 'entity:a', targetRef: 'entity:b', sourceRefs: ['source:old'], supportingClaimRefs: ['claim:keep'], lifecycle: { status: 'active' } }
  const entities = [{ candidateId: 'a', kind: 'entity' as const, candidate: entity('a', 'A'), existingKnowledge: [a] }, { candidateId: 'b', kind: 'entity' as const, candidate: entity('b', 'B', 'product'), existingKnowledge: [b] }]
  const rg = { candidateId: 'r', kind: 'relation' as const, candidate: relation('r', 'offers_product', 'a', 'b'), existingKnowledge: [old] }
  const merge = planKnowledgeChangeSet(input([...entities, rg], [...decisionsFor(entities, 'duplicate'), { candidateId: 'r', action: 'merge_source', rationale: 'test' }]))
  assert.equal(merge.changeSet?.knowledgeOperations[0]?.type, 'merge_source')
  const update = planKnowledgeChangeSet(input([...entities, rg], [...decisionsFor(entities, 'duplicate'), { candidateId: 'r', action: 'update_state', rationale: 'test' }]))
  const updated = update.changeSet?.knowledgeOperations.find((operation) => operation.type === 'update')
  const sourceId = allocateSourceId({ sourceUrl: null, publishedAt: null, title: 'Test', rawRef })
  assert.deepEqual(updated && updated.type === 'update' && 'sourceRefs' in updated.object ? updated.object.sourceRefs : [], [sourceId, 'source:old'].sort())
})

test('planner Relation keep_both is distinct and business_exposure active pair is review', () => {
  const a = { id: 'entity:a', type: 'company', name: 'A', lifecycle: { status: 'active' } }
  const b = { id: 'entity:b', type: 'product', name: 'B', lifecycle: { status: 'active' } }
  const entities = [{ candidateId: 'a', kind: 'entity' as const, candidate: entity('a', 'A'), existingKnowledge: [a] }, { candidateId: 'b', kind: 'entity' as const, candidate: entity('b', 'B', 'product'), existingKnowledge: [b] }]
  const rg = { candidateId: 'r', kind: 'relation' as const, candidate: relation('r', 'offers_product', 'a', 'b') }
  const result = planKnowledgeChangeSet(input([...entities, rg], [...decisionsFor(entities, 'duplicate'), { candidateId: 'r', action: 'keep_both', rationale: 'test' }]))
  assert.equal(result.changeSet?.knowledgeOperations.some((operation) => operation.type === 'create'), true)
  const industry = { id: 'entity:i', type: 'industry', name: 'Industry', lifecycle: { status: 'active' } }
  const business = { id: 'relation:business', type: 'business_exposure', sourceRef: 'entity:a', targetRef: 'entity:i', lifecycle: { status: 'active' } }
  const ig = { candidateId: 'i', kind: 'entity' as const, candidate: entity('i', 'Industry', 'industry'), existingKnowledge: [industry] }
  const bg = { candidateId: 'b', kind: 'relation' as const, candidate: relation('b', 'business_exposure', 'a', 'i'), existingKnowledge: [business] }
  const blocked = planKnowledgeChangeSet(input([{ ...entities[0]! }, ig, bg], [...decisionsFor([{ ...entities[0]! }, ig], 'duplicate'), { candidateId: 'b', action: 'keep_both', rationale: 'test' }], assetsWithEntities([a, industry], [business])))
  assert.ok(blocked.reviewItems.some((item) => item.candidateId === 'b'))
})

test('planner Claim duplicate, update, supersede, and keep_both are deterministic', () => {
  const a = { id: 'entity:a', type: 'company', name: 'A', lifecycle: { status: 'active' } }
  const old = { id: 'claim:old', claimType: 'fact', statement: 'A grows', subjectRefs: ['entity:a'], sourceRefs: ['source:old'], provenance: [{ sourceRef: 'source:old', rawRef, locator: null, chunkRef: null }], lifecycle: { status: 'active' } }
  const eg = { candidateId: 'a', kind: 'entity' as const, candidate: entity('a', 'A'), existingKnowledge: [a] }
  const cg = { candidateId: 'c', kind: 'claim' as const, candidate: claim('c', 'A grows', 'a'), existingKnowledge: [old] }
  const base = [eg, cg]
  const duplicate = planKnowledgeChangeSet(input(base, [...decisionsFor([eg], 'duplicate'), { candidateId: 'c', action: 'duplicate', rationale: 'test' }], assetsWithEntities([a], [], [old])))
  assert.equal(duplicate.changeSet, undefined)
  const update = planKnowledgeChangeSet(input(base, [...decisionsFor([eg], 'duplicate'), { candidateId: 'c', action: 'update_state', rationale: 'test' }], assetsWithEntities([a], [], [old])))
  const updateOp = update.changeSet?.knowledgeOperations.find((operation) => operation.type === 'update')
  assert.equal(updateOp?.type, 'update')
  const sourceId = allocateSourceId({ sourceUrl: null, publishedAt: null, title: 'Test', rawRef })
  if (updateOp?.type === 'update' && 'sourceRefs' in updateOp.object) assert.deepEqual(updateOp.object.sourceRefs, [sourceId, 'source:old'].sort())
  const supersede = planKnowledgeChangeSet(input(base, [...decisionsFor([eg], 'duplicate'), { candidateId: 'c', action: 'supersede', rationale: 'test' }], assetsWithEntities([a], [], [old])))
  assert.equal(supersede.changeSet?.knowledgeOperations.some((operation) => operation.type === 'supersede'), true)
  const keep = planKnowledgeChangeSet(input([eg, { ...cg, existingKnowledge: [] }], [...decisionsFor([eg], 'duplicate'), { candidateId: 'c', action: 'keep_both', rationale: 'test' }]))
  assert.equal(keep.changeSet?.knowledgeOperations.some((operation) => operation.type === 'create'), true)
})

test('planner isolates rejected and review Entity dependencies', () => {
  const eg = { candidateId: 'a', kind: 'entity' as const, candidate: entity('a', 'A') }
  const rg = { candidateId: 'r', kind: 'relation' as const, candidate: relation('r', 'offers_product', 'a', 'a') }
  const cg = { candidateId: 'c', kind: 'claim' as const, candidate: claim('c', 'A grows', 'a') }
  const result = planKnowledgeChangeSet(input([eg, rg, cg], [{ candidateId: 'a', action: 'reject', rationale: 'bad' }, { candidateId: 'r', action: 'create', rationale: 'test' }, { candidateId: 'c', action: 'create', rationale: 'test' }]))
  assert.equal(result.changeSet, undefined)
  assert.ok(result.reviewItems.some((item) => item.candidateId === 'r'))
  assert.ok(result.reviewItems.some((item) => item.candidateId === 'c'))
})

test('planner preserves dependency reviews from two reviewed parent candidates', () => {
  const a = { candidateId: 'a', kind: 'entity' as const, candidate: entity('a', 'A') }
  const b = { candidateId: 'b', kind: 'entity' as const, candidate: entity('b', 'B', 'product') }
  const r = { candidateId: 'r', kind: 'relation' as const, candidate: relation('r', 'offers_product', 'a', 'b') }
  const result = planKnowledgeChangeSet(input([a, b, r], [{ candidateId: 'a', action: 'user_review', rationale: 'Review A' }, { candidateId: 'b', action: 'user_review', rationale: 'Review B' }, { candidateId: 'r', action: 'create', rationale: 'create' }]))
  const dependencies = result.reviewItems.filter((item) => item.candidateId === 'r' && item.dependency)
  assert.equal(dependencies.length, 2)
  assert.equal(new Set(dependencies.map((item) => item.reviewKey)).size, 2)
  const summary = normalizeReviewSummary({ plannerReviewItems: result.reviewItems, candidateGroups: [a, b, r] })
  assert.ok(summary.dependencyCount >= 2)
  assert.equal(summary.rootCount + summary.dependencyCount, summary.total)
  assert.equal(Object.values(summary.byCategory).reduce((sum, value) => sum + value, 0), summary.total)
  assert.equal(Object.values(summary.byCandidateKind).reduce((sum, value) => sum + value, 0), summary.total)
})

test('planner preserves a relation root review alongside its dependency review', () => {
  const a = { candidateId: 'a', kind: 'entity' as const, candidate: entity('a', 'A') }
  const b = { candidateId: 'b', kind: 'entity' as const, candidate: entity('b', 'B', 'product') }
  const r = { candidateId: 'r', kind: 'relation' as const, candidate: relation('r', 'offers_product', 'a', 'b') }
  const result = planKnowledgeChangeSet(input([a, b, r], [{ candidateId: 'a', action: 'user_review', rationale: 'Review A' }, { candidateId: 'b', action: 'create', rationale: 'create' }, { candidateId: 'r', action: 'user_review', rationale: 'Review relation' }]))
  const relationReviews = result.reviewItems.filter((item) => item.candidateId === 'r')
  assert.equal(relationReviews.length, 2)
  assert.equal(relationReviews.some((item) => item.dependency === true), true)
  assert.equal(relationReviews.some((item) => item.dependency === false && item.origin === 'reconciliation_mirror'), true)
  const summary = normalizeReviewSummary({ plannerReviewItems: result.reviewItems, candidateGroups: [a, b, r] })
  const relationSamples = Object.values(summary.samplesByCategory).flat().filter((sample) => sample.candidateId === 'r')
  assert.equal(relationSamples.filter((sample) => sample.dependency === true).length, 1)
  assert.equal(relationSamples.filter((sample) => sample.dependency === false).length, 1)
})

test('planner consolidation mirror is stored once by its explicit reviewKey', () => {
  const a = { candidateId: 'a', kind: 'entity' as const, candidate: entity('a', 'A') }
  const b = { candidateId: 'b', kind: 'entity' as const, candidate: entity('b', 'B', 'product') }
  const r = { candidateId: 'r', kind: 'relation' as const, candidate: relation('r', 'offers_product', 'a', 'b') }
  const constraint = { candidateId: 'r', reason: 'Relation attributes conflict', conflictingFields: ['importance'] }
  const result = planKnowledgeChangeSet({ ...input([a, b, r], decisionsFor([a, b, r], 'create')), consolidationReviews: [constraint] })
  assert.equal(result.reviewItems.filter((item) => item.candidateId === 'r').length, 1)
  assert.equal(normalizeReviewSummary({ consolidationReviews: [constraint], plannerReviewItems: result.reviewItems, candidateGroups: [a, b, r] }).total, 1)
})

test('planner reviewItems are deterministically ordered by reviewKey', () => {
  const a = { candidateId: 'a', kind: 'entity' as const, candidate: entity('a', 'A') }
  const b = { candidateId: 'b', kind: 'entity' as const, candidate: entity('b', 'B', 'product') }
  const r = { candidateId: 'r', kind: 'relation' as const, candidate: relation('r', 'offers_product', 'a', 'b') }
  const decisions = [{ candidateId: 'a', action: 'user_review' as const, rationale: 'Review A' }, { candidateId: 'b', action: 'user_review' as const, rationale: 'Review B' }, { candidateId: 'r', action: 'user_review' as const, rationale: 'Review relation' }]
  const first = planKnowledgeChangeSet(input([a, b, r], decisions))
  const second = planKnowledgeChangeSet(input([a, b, r], decisions))
  assert.deepEqual(first.reviewItems.map((item) => item.reviewKey), second.reviewItems.map((item) => item.reviewKey))
  assert.deepEqual(first.reviewItems.map((item) => item.candidateId), second.reviewItems.map((item) => item.candidateId))
})

test('existing InvestmentTheme duplicate and update preserve ThemeGroup identity without model refs', () => {
  const existing = { id: 'entity:theme', type: 'investment_theme', name: 'Energy Transition', themeGroupRef: 'theme-group:energy', taxonomyRefs: ['taxonomy:one'], lifecycle: { status: 'active' } }
  const group = { candidateId: 'theme', kind: 'entity' as const, candidate: entity('theme', 'Energy Transition', 'investment_theme'), existingKnowledge: [existing] }
  const assets = { ...emptyAssets(), entities: [loaded('entity', existing) as never] }
  const duplicate = planKnowledgeChangeSet(input([group], decisionsFor([group], 'duplicate'), assets))
  assert.equal(duplicate.changeSet, undefined)
  const update = planKnowledgeChangeSet(input([group], decisionsFor([group], 'update_state'), assets))
  const operation = update.changeSet?.knowledgeOperations.find((item) => item.type === 'update')
  assert.equal(operation?.type, 'update')
  if (operation?.type === 'update' && 'themeGroupRef' in operation.object) assert.equal(operation.object.themeGroupRef, 'theme-group:energy')
})

test('consolidation preserves entity conflicts and separates Claim temporal/value identity', () => {
  const first = extraction('u1', claim('c1', 'Revenue grows', 'e', { temporal: { asOf: null, scope: { type: 'fiscal_year', start: '2026-01-01', end: '2026-12-31', label: null } } }), 'one')
  const second = extraction('u2', claim('c2', 'Revenue grows', 'e', { temporal: { asOf: null, scope: { type: 'fiscal_year', start: '2027-01-01', end: '2027-12-31', label: null } } }), 'two')
  const result = consolidateExtractions([first, second])
  assert.equal(result.groups.filter((group) => group.kind === 'claim').length, 2)
  assert.equal(new Set(result.groups.filter((group) => group.kind === 'claim').map((group) => group.candidateId)).size, 2)
  assert.equal(result.reviewConstraints.length, 1)
  const identical = consolidateExtractions([first, extraction('u3', first.result.claims[0]!)])
  assert.equal(identical.groups.filter((group) => group.kind === 'claim').length, 1)
})

test('consolidation Claim IDs differ for structuredValue identity', () => {
  const one = extraction('u1', claim('c1', 'Revenue is measured', 'e', { structuredValue: { metric: 'revenue', value: 1, unit: 'USD', comparator: null } }))
  const two = extraction('u2', claim('c2', 'Revenue is measured', 'e', { structuredValue: { metric: 'revenue', value: 2, unit: 'USD', comparator: null } }))
  const result = consolidateExtractions([one, two])
  assert.equal(new Set(result.groups.filter((group) => group.kind === 'claim').map((group) => group.candidateId)).size, 2)
})

test('consolidation emits a review constraint for conflicting Relation attributes', () => {
  const one = extraction('u1', claim('unused', 'x', 'e'))
  const two = extraction('u2', claim('unused-2', 'y', 'e'))
  const relationOne = relation('r1', 'competes_with', 'e', 'e', { importance: 'core' })
  const relationTwo = relation('r2', 'competes_with', 'e', 'e', { importance: 'material' })
  const result = consolidateExtractions([{ ...one, result: { ...one.result, relations: [relationOne], claims: [] } }, { ...two, result: { ...two.result, relations: [relationTwo], claims: [] } }])
  assert.equal(result.reviewConstraints.some((item) => item.reason.includes('Relation attributes conflict')), true)
})

function emptyExtraction(): ValidatedExtractKnowledgeResult { return { entities: [], relations: [], claims: [], rejected: [], summary: { inputCounts: { entity: 0, relation: 0, claim: 0 }, acceptedCounts: { entity: 0, relation: 0, claim: 0 }, rejectedCounts: { entity: 0, relation: 0, claim: 0 }, rejectionCodes: [] } } }
const extractionUnits = [{ unitId: 'unit-001', proposedUnitId: 'one', topic: 'test', semanticPurpose: 'test', primaryRefs: [], contextRefs: [], primaryBlockIds: [], contextBlockIds: [] }, { unitId: 'unit-002', proposedUnitId: 'two', topic: 'test', semanticPurpose: 'test', primaryRefs: [], contextRefs: [], primaryBlockIds: [], contextBlockIds: [] }]
const extractionConfig = { maxExtractionUnits: 64, maxPlanAttempts: 2, maxExtractionAttempts: 3, maxConcurrency: 1 }

test('bounded extraction retries invalid model output and does not rerun completed units', async () => {
  const calls: string[] = []
  const input = { config: extractionConfig, skill: { extractKnowledge: async ({ unit }: { unit: { unitId: string } }) => { calls.push(unit.unitId); if (unit.unitId === 'unit-002' && calls.filter((id) => id === unit.unitId).length === 1) throw new KnowledgeCurationError('invalid_model_output', 'bad JSON'); return emptyExtraction() } } } as never
  const result = await boundedExtract(input, {} as never, {} as never, extractionUnits, 1, extractionConfig)
  assert.deepEqual(calls, ['unit-001', 'unit-002', 'unit-002'])
  assert.deepEqual(result.summaries.map((item) => item.attempts), [1, 2])
})

test('bounded extraction does not retry reasoning configuration failures', async () => {
  let calls = 0
  const input = { config: extractionConfig, skill: { extractKnowledge: async () => { calls += 1; throw new KnowledgeCurationError('reasoning_failed', 'invalid executor configuration', undefined, { cause: { code: 'reasoning_configuration_invalid' } }) } } } as never
  const result = await boundedExtract(input, {} as never, {} as never, [extractionUnits[0]!], 1, extractionConfig)
  assert.equal(calls, 1)
  assert.equal(result.summaries[0]?.attempts, 1)
  assert.equal(result.errors.length, 1)
})

test('focused retrieval finds reverse-oriented symmetric Relations', () => {
  const a = entity('a', 'A')
  const b = entity('b', 'B')
  const assets = assetsWithEntities([{ id: 'entity:a', type: 'company', name: 'A', lifecycle: { status: 'active' } }, { id: 'entity:b', type: 'company', name: 'B', lifecycle: { status: 'active' } }], [{ id: 'relation:reverse', type: 'competes_with', sourceRef: 'entity:b', targetRef: 'entity:a', lifecycle: { status: 'active' } }])
  const groups = [{ candidateId: 'a', kind: 'entity' as const, candidate: a }, { candidateId: 'b', kind: 'entity' as const, candidate: b }, { candidateId: 'r', kind: 'relation' as const, candidate: relation('r', 'competes_with', 'a', 'b') }]
  const result = retrieveFocusedKnowledge(assets, { groups, reviewConstraints: [], rejected: [], candidateCounts: {}, candidateAliases: new Map(), entityCandidates: new Map([['a', a], ['b', b]]) })
  assert.equal(result.groups.find((group) => group.candidateId === 'r')?.existingKnowledge?.length, 1)
})

test('ReviewSummary has the frozen zero shape', () => {
  const summary = emptyReviewSummary()
  assert.deepEqual(Object.keys(summary.byCategory).sort(), ['invalid_reference', 'invalid_semantics', 'other', 'reconciliation_review', 'relation_cardinality', 'schema_gap', 'theme_ambiguity', 'theme_creation'])
  assert.deepEqual(Object.keys(summary.byCandidateKind).sort(), ['claim', 'entity', 'relation', 'workflow_level'])
  assert.equal(summary.total, 0)
  assert.equal(summary.rootCount, 0)
  assert.equal(summary.dependencyCount, 0)
})

test('ReviewSummary normalizes extraction rejection codes and candidate kinds', () => {
  const summary = normalizeReviewSummary({ extractionRejected: [
    { candidateId: 'e', kind: 'entity', code: 'invalid_reference', message: 'bad ref' },
    { candidateId: 'r', kind: 'relation', code: 'invalid_semantics', message: 'bad relation' },
    { candidateId: 'w', code: 'unexpected', message: 'workflow issue' },
  ] })
  assert.equal(summary.total, 3)
  assert.equal(summary.byCategory.invalid_reference, 1)
  assert.equal(summary.byCategory.invalid_semantics, 1)
  assert.equal(summary.byCategory.other, 1)
  assert.deepEqual(summary.byCandidateKind, { entity: 1, relation: 1, claim: 0, workflow_level: 1 })
})

test('ReviewSummary deduplicates a consolidation conflict across planner signals', () => {
  const summary = normalizeReviewSummary({
    consolidationReviews: [{ candidateId: 'e', reason: 'Entity description conflict', conflictingFields: ['description'] }],
    plannerReviewItems: [{ candidateId: 'e', kind: 'entity', rationale: 'Consolidation conflict requires review', dependentCandidateIds: [] }],
    candidateGroups: [{ candidateId: 'e', kind: 'entity', candidate: entity('e', 'Entity') }],
  })
  assert.equal(summary.total, 1)
  assert.equal(summary.rootCount, 1)
  assert.equal(summary.dependencyCount, 0)
  assert.equal(summary.byCategory.other, 1)
})

test('ReviewSummary records one reconciliation user-review root event', () => {
  const summary = normalizeReviewSummary({
    reconciliationDecisions: [{ candidateId: 'c', action: 'user_review', rationale: 'Ambiguous existing target' }],
    plannerReviewItems: [{ candidateId: 'c', kind: 'claim', rationale: 'Ambiguous existing target', dependentCandidateIds: [] }],
    candidateGroups: [{ candidateId: 'c', kind: 'claim', candidate: claim('c', 'A grows', 'e') }],
  })
  assert.equal(summary.total, 1)
  assert.equal(summary.rootCount, 1)
  assert.equal(summary.byCategory.reconciliation_review, 1)
  assert.equal(summary.byCandidateKind.claim, 1)
})

test('ReviewSummary keeps reconciliation root and dependency telemetry distinct', () => {
  const summary = normalizeReviewSummary({
    reconciliationDecisions: [{ candidateId: 'e', action: 'reject', rationale: 'Rejected by reviewer' }],
    plannerReviewItems: [{ candidateId: 'r', kind: 'relation', rationale: 'Blocked by rejected Entity candidate e', dependentCandidateIds: ['e'] }],
    candidateGroups: [{ candidateId: 'e', kind: 'entity', candidate: entity('e', 'Entity') }, { candidateId: 'r', kind: 'relation', candidate: relation('r', 'offers_product', 'e', 'e') }],
  })
  assert.equal(summary.total, 2)
  assert.equal(summary.rootCount, 1)
  assert.equal(summary.dependencyCount, 1)
  assert.equal(summary.byCategory.reconciliation_review, 1)
  assert.equal(summary.byCategory.invalid_reference, 1)
  assert.equal(summary.byCandidateKind.entity, 1)
  assert.equal(summary.byCandidateKind.relation, 1)
})

test('ReviewSummary maps theme, schema, cardinality, and semantic planner reviews', () => {
  const summary = normalizeReviewSummary({ plannerReviewItems: [
    { candidateId: 'a', kind: 'entity', rationale: 'Theme group creation requires review', dependentCandidateIds: [] },
    { candidateId: 'b', kind: 'entity', rationale: 'Theme is ambiguous across multiple groups', dependentCandidateIds: [] },
    { candidateId: 'c', kind: 'relation', rationale: 'Relation cardinality conflict', dependentCandidateIds: [] },
    { candidateId: 'd', kind: 'claim', rationale: 'Schema gap in durable field', dependentCandidateIds: [] },
    { candidateId: 'f', kind: 'claim', rationale: 'Unsupported semantic value', dependentCandidateIds: [] },
  ] })
  assert.equal(summary.byCategory.theme_creation, 1)
  assert.equal(summary.byCategory.theme_ambiguity, 1)
  assert.equal(summary.byCategory.relation_cardinality, 1)
  assert.equal(summary.byCategory.schema_gap, 1)
  assert.equal(summary.byCategory.invalid_semantics, 1)
})

test('no-op execution records replay, reject input conflicts, and preserve committed logs', async () => {
  const root = await createKnowledgeBase({ knowledgeBaseId: 'kb-telemetry-log' })
  try {
    const record = { workflowRunId: 'run-log', knowledgeBaseId: 'kb-telemetry-log', rawRef: 'raw-ref', documentId: 'doc', workflowInputFingerprint: 'fingerprint', status: 'completed' as const, writeStatus: 'no_changes' as const, baseRevision: 0, committedRevision: 0, reviewSummary: emptyReviewSummary(), completedAt: '2026-09-03T00:00:00.000Z', errors: [] }
    const first = await writeNoOpExecutionRecord(root, record)
    assert.equal(first.kind, 'written')
    assert.equal((await writeNoOpExecutionRecord(root, record)).kind, 'replay')
    const conflict = await writeNoOpExecutionRecord(root, { ...record, workflowInputFingerprint: 'different' })
    assert.equal(conflict.kind, 'conflict')
    const path = join(root, 'logs', 'ingestion', 'run-log.yaml')
    const committed = { ...(JSON.parse(await readFile(path, 'utf8')) as Record<string, unknown>), writeStatus: 'committed' }
    await withKnowledgeBaseMutationLock(root, async () => { await writeFile(path, JSON.stringify(committed), 'utf8') })
    const protectedLog = await writeNoOpExecutionRecord(root, record)
    assert.equal(protectedLog.kind, 'replay')
    assert.equal((await writeNoOpExecutionRecord(root, { ...record, workflowInputFingerprint: 'other' })).kind, 'conflict')
    assert.equal((JSON.parse(await readFile(path, 'utf8')) as Record<string, unknown>).writeStatus, 'committed')
  } finally { await removeKnowledgeBase(root) }
})

test('no-op execution records reject unsafe workflow identifiers', async () => {
  const root = await createKnowledgeBase({ knowledgeBaseId: 'kb-unsafe-log' })
  try {
    await assert.rejects(() => writeNoOpExecutionRecord(root, { workflowRunId: '../escape', knowledgeBaseId: 'kb-unsafe-log', rawRef: 'raw', documentId: 'doc', workflowInputFingerprint: 'fp', status: 'completed', writeStatus: 'no_changes', baseRevision: 0, committedRevision: 0, reviewSummary: emptyReviewSummary(), completedAt: 'now', errors: [] }))
  } finally { await removeKnowledgeBase(root) }
})

test('ReviewSummary preserves two distinct root causes for one candidate', () => {
  const summary = normalizeReviewSummary({
    consolidationReviews: [{ candidateId: 'r', reason: 'Relation attributes conflict', conflictingFields: ['importance'] }],
    plannerReviewItems: [{ candidateId: 'r', kind: 'relation', category: 'relation_cardinality', rationale: 'business_exposure cardinality conflict', dependentCandidateIds: [] }],
  })
  assert.equal(summary.total, 2)
  assert.equal(summary.rootCount, 2)
  assert.equal(summary.dependencyCount, 0)
  assert.equal(summary.byCategory.other, 1)
  assert.equal(summary.byCategory.relation_cardinality, 1)
})

test('ReviewSummary keeps a reconciliation review and a different planner issue', () => {
  const summary = normalizeReviewSummary({
    reconciliationDecisions: [{ candidateId: 'r', action: 'user_review', rationale: 'Need reviewer judgment' }],
    plannerReviewItems: [{ candidateId: 'r', kind: 'relation', category: 'relation_cardinality', rationale: 'Illegal business_exposure cardinality', dependentCandidateIds: [] }],
  })
  assert.equal(summary.total, 2)
  assert.equal(summary.byCategory.reconciliation_review, 1)
  assert.equal(summary.byCategory.relation_cardinality, 1)
})

test('ReviewSummary invariants hold for same-candidate root and dependency events', () => {
  const summary = normalizeReviewSummary({ plannerReviewItems: [
    { candidateId: 'r', kind: 'relation', category: 'reconciliation_review', rationale: 'Root review', dependentCandidateIds: [], dependency: false, origin: 'planner', reviewKey: 'root-r' },
    { candidateId: 'r', kind: 'relation', category: 'invalid_reference', rationale: 'Blocked by root review', dependentCandidateIds: [], dependency: true, origin: 'dependency_isolation', reviewKey: 'dependency-r' },
  ] })
  assert.equal(summary.rootCount + summary.dependencyCount, summary.total)
  assert.equal(Object.values(summary.byCategory).reduce((sum, value) => sum + value, 0), summary.total)
  assert.equal(Object.values(summary.byCandidateKind).reduce((sum, value) => sum + value, 0), summary.total)
})

test('simultaneous identical no-op writes serialize to one record and clean temp files', async () => {
  const root = await createKnowledgeBase({ knowledgeBaseId: 'kb-noop-race-same' })
  try {
    const record = { workflowRunId: 'run-race-same', knowledgeBaseId: 'kb-noop-race-same', rawRef: 'raw', documentId: 'doc', workflowInputFingerprint: 'same', status: 'completed_with_review' as const, writeStatus: 'no_changes' as const, baseRevision: 0, committedRevision: 0, reviewSummary: emptyReviewSummary(), completedAt: 'now', errors: [] }
    const results = await Promise.all([writeNoOpExecutionRecord(root, record), writeNoOpExecutionRecord(root, record)])
    assert.deepEqual(results.map((item) => item.kind).sort(), ['replay', 'written'])
    assert.equal((JSON.parse(await readFile(join(root, 'logs', 'ingestion', 'run-race-same.yaml'), 'utf8')) as Record<string, unknown>).workflowInputFingerprint, 'same')
    assert.deepEqual((await readdir(join(root, 'logs', 'ingestion'))).filter((name) => name.includes('.tmp-')), [])
    assert.equal((await readManifest(root)).revision, 0)
  } finally { await removeKnowledgeBase(root) }
})

test('simultaneous different no-op fingerprints yield one record and one conflict', async () => {
  const root = await createKnowledgeBase({ knowledgeBaseId: 'kb-noop-race-different' })
  try {
    const base = { workflowRunId: 'run-race-different', knowledgeBaseId: 'kb-noop-race-different', rawRef: 'raw', documentId: 'doc', status: 'completed' as const, writeStatus: 'no_changes' as const, baseRevision: 0, committedRevision: 0, reviewSummary: emptyReviewSummary(), completedAt: 'now', errors: [] }
    const results = await Promise.all([writeNoOpExecutionRecord(root, { ...base, workflowInputFingerprint: 'one' }), writeNoOpExecutionRecord(root, { ...base, workflowInputFingerprint: 'two' })])
    assert.deepEqual(results.map((item) => item.kind).sort(), ['conflict', 'written'])
    const persisted = JSON.parse(await readFile(join(root, 'logs', 'ingestion', 'run-race-different.yaml'), 'utf8')) as Record<string, unknown>
    assert.ok(persisted.workflowInputFingerprint === 'one' || persisted.workflowInputFingerprint === 'two')
    assert.equal(typeof persisted.reviewSummary, 'object')
    assert.deepEqual((await readdir(join(root, 'logs', 'ingestion'))).filter((name) => name.includes('.tmp-')), [])
    assert.equal((await readManifest(root)).revision, 0)
  } finally { await removeKnowledgeBase(root) }
})
