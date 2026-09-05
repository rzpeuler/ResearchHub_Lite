import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildReviewCases } from '../../knowledge/review/case-builder.ts'
import { validateReviewCase, validateReviewRunManifest } from '../../knowledge/review/validation.ts'
import { listOpenReviewCases, loadReviewCase, persistReviewCases, recoverReviewCasesFromExecutionLog } from '../../knowledge/review/store.ts'
import type { KnowledgeAssetCollectionV03 } from '../../knowledge/storage/v03-types.ts'
import type { ClaimCandidate, EntityCandidate, RelationCandidate, ResolvedCandidateGroup } from '../../skills/knowledge-curation/contracts.ts'
import type { ReviewItem } from '../../workflows/raw-document-knowledge-ingestion/contracts.ts'
import type { ResolutionIntent } from '../../workflows/raw-document-knowledge-ingestion/knowledge-resolution.ts'

const baseAssets = (): KnowledgeAssetCollectionV03 => ({ rootDir: '', themeGroups: [], entities: [], relations: [], claims: [], modules: [], sources: [], registry: [] })
const loaded = (kind: 'entity' | 'relation' | 'claim', value: Record<string, unknown>) => ({ kind, value, filePath: '', storageRef: '' })
function entity(candidateId: string, name: string, entityType: EntityCandidate['entityType'] = 'company'): EntityCandidate { return { candidateId, entityType, name, aliases: ['Alias'], description: 'bounded', semanticFields: entityType === 'company' ? { ticker: 'ACM', exchange: 'NYSE', legalName: 'Acme Legal' } : undefined, evidenceBlockRefs: ['block-1'], reason: 'fixture' } }
function relation(candidateId: string, source: string, target: string): RelationCandidate { return { candidateId, relationType: 'offers_product', source: { candidateRef: source, mention: source }, target: { candidateRef: target, mention: target }, attributes: { importance: 'high' }, evidenceBlockRefs: ['block-2'], reason: 'fixture' } }
function claim(candidateId: string, subject: string): ClaimCandidate { return { candidateId, claimType: 'fact', statement: 'A bounded statement.', subjectRefs: [{ candidateRef: subject, mention: subject }], evidenceBlockRefs: ['block-3'], reason: 'fixture' } }
function group(candidate: EntityCandidate | RelationCandidate | ClaimCandidate): ResolvedCandidateGroup { return { candidateId: candidate.candidateId, kind: 'entityType' in candidate ? 'entity' : 'relationType' in candidate ? 'relation' : 'claim', candidate } }

function fixtureCases() {
  const root = entity('e-root', 'Acme')
  const dependentRelation = relation('r-dependent', 'e-root', 'e-product')
  const dependentClaim = claim('c-dependent', 'e-product')
  const groups = [group(root), group(entity('e-product', 'Widget', 'product')), group(dependentRelation), group(dependentClaim)]
  const reviewItems: ReviewItem[] = [
    { candidateId: 'e-root', kind: 'entity', rationale: 'Company identity is ambiguous', dependentCandidateIds: ['r-dependent'], dependencyDirection: 'blocks_dependents', stage: 'knowledge_resolution', category: 'reconciliation_review', origin: 'knowledge_resolution', dependency: false, reviewKey: 'root|identity' },
    { candidateId: 'r-dependent', kind: 'relation', rationale: 'Relation depends on unresolved Entity binding', dependentCandidateIds: ['e-root'], stage: 'knowledge_resolution_dependency', category: 'invalid_reference', origin: 'dependency_isolation', dependency: true, reviewKey: 'dep|relation' },
    { candidateId: 'c-dependent', kind: 'claim', rationale: 'Claim depends on unresolved Relation', dependentCandidateIds: ['r-dependent'], stage: 'knowledge_resolution_dependency', category: 'invalid_reference', origin: 'dependency_isolation', dependency: true, reviewKey: 'dep|claim' },
    { candidateId: 'e-product', kind: 'entity', rationale: 'Extraction rejection only', dependentCandidateIds: [], stage: 'extraction', category: 'invalid_semantics', origin: 'extraction_rejection', dependency: false, reviewKey: 'telemetry-only' },
  ]
  const assets = { ...baseAssets(), entities: [loaded('entity', { id: 'entity:acme', type: 'company', name: 'Acme', aliases: ['ACME'], ticker: 'ACM', exchange: 'NYSE', legalName: 'Acme Legal', lifecycle: { status: 'active' } }) as never] }
  const intents: ResolutionIntent[] = [
    { candidateRef: 'r-dependent', candidateKind: 'relation', disposition: 'review', semanticBasis: { rationale: 'Relation depends on unresolved Entity binding' }, evidenceRefs: ['block-2'], reviewDependencyRefs: ['e-root'] },
    { candidateRef: 'c-dependent', candidateKind: 'claim', disposition: 'review', semanticBasis: { rationale: 'Claim depends on unresolved Relation' }, evidenceRefs: ['block-3'], reviewDependencyRefs: ['r-dependent'] },
  ]
  const cases = buildReviewCases({ knowledgeBaseId: 'kb-review-case', producerRunId: 'run-001', createdAt: '2026-09-06T00:00:00.000Z', rawRef: 'raw-sha256-' + '0'.repeat(64), documentId: 'doc-001', knowledgeBaseRevisionAtCreation: 4, assets, groups, reviewItems, bindings: new Map([['e-root', { candidateId: 'e-root', state: 'Unresolved', plausibleMatches: ['entity:acme'] }]]), intents })
  return { cases, assets, groups, reviewItems, intents }
}

test('ReviewCase builder excludes telemetry-only rejection and preserves transitive dependency closure', () => {
  const { cases, assets, groups, reviewItems } = fixtureCases()
  assert.equal(cases.length, 1)
  const reviewCase = cases[0]!
  assert.equal(reviewCase.classification.actionability, 'knowledge_decision')
  assert.equal(reviewCase.rootProposal.proposalId, 'e-root')
  assert.deepEqual(reviewCase.suspendedProposalBundle.dependentProposals.map((item) => item.proposalId), ['c-dependent', 'r-dependent'])
  assert.deepEqual(reviewCase.rootProposal.evidenceBindings, [{ kind: 'raw_document_block', rawRef: 'raw-sha256-' + '0'.repeat(64), documentId: 'doc-001', blockId: 'block-1' }])
  assert.equal(reviewCase.resolutionContext.existingKnowledgeProjections[0]?.payload.kind, 'entity')
  assert.equal(JSON.stringify(reviewCase).includes('bounded'), true)
  assert.equal(JSON.stringify(reviewCase).includes('textExcerpt'), false)
  const otherRun = buildReviewCases({ knowledgeBaseId: 'kb-review-case', producerRunId: 'run-002', createdAt: '2026-09-06T00:00:00.000Z', rawRef: 'raw-sha256-' + '0'.repeat(64), documentId: 'doc-001', knowledgeBaseRevisionAtCreation: 4, assets, groups, reviewItems })
  assert.notEqual(reviewCase.reviewCaseId, otherRun[0]?.reviewCaseId)
})

test('ReviewCase actionability is deterministic metadata, not rationale text', () => {
  const groups = [
    group(entity('identity', 'Identity')),
    group(entity('theme-ambiguity', 'Theme ambiguity', 'investment_theme')),
    group(entity('theme-creation', 'New theme', 'investment_theme')),
    group(entity('schema-gap', 'Schema gap')),
    group(entity('bad-attributes', 'Bad attributes')),
    group(entity('bad-temporal', 'Bad temporal')),
    group(entity('bad-reference', 'Bad reference')),
    group(entity('rejected', 'Rejected')),
    group(entity('isolated', 'Isolated')),
  ]
  const reviewItems: ReviewItem[] = [
    { candidateId: 'identity', kind: 'entity', rationale: 'arbitrary rationale', dependentCandidateIds: [], category: 'reconciliation_review', origin: 'knowledge_resolution', dependency: false },
    { candidateId: 'theme-ambiguity', kind: 'entity', rationale: 'arbitrary rationale', dependentCandidateIds: [], category: 'theme_ambiguity', origin: 'knowledge_resolution', dependency: false },
    { candidateId: 'theme-creation', kind: 'entity', rationale: 'arbitrary rationale', dependentCandidateIds: [], category: 'theme_creation', origin: 'knowledge_resolution', dependency: false },
    { candidateId: 'schema-gap', kind: 'entity', rationale: 'arbitrary rationale', dependentCandidateIds: [], category: 'schema_gap', origin: 'knowledge_resolution', dependency: false },
    { candidateId: 'bad-attributes', kind: 'entity', rationale: 'Company identity is ambiguous', dependentCandidateIds: [], category: 'invalid_semantics', origin: 'planner', dependency: false },
    { candidateId: 'bad-temporal', kind: 'entity', rationale: 'Theme ambiguity', dependentCandidateIds: [], category: 'invalid_semantics', origin: 'planner', dependency: false },
    { candidateId: 'bad-reference', kind: 'entity', rationale: 'Company identity is ambiguous', dependentCandidateIds: [], category: 'invalid_reference', origin: 'planner', dependency: false },
    { candidateId: 'rejected', kind: 'entity', rationale: 'Company identity is ambiguous', dependentCandidateIds: [], category: 'reconciliation_review', origin: 'extraction_rejection', dependency: false },
    { candidateId: 'isolated', kind: 'entity', rationale: 'Company identity is ambiguous', dependentCandidateIds: ['identity'], category: 'invalid_reference', origin: 'dependency_isolation', dependency: true },
  ]
  const cases = buildReviewCases({ knowledgeBaseId: 'kb-actionability', producerRunId: 'run-actionability', createdAt: '2026-09-06T00:00:00.000Z', rawRef: 'raw-sha256-' + '1'.repeat(64), documentId: 'doc-actionability', knowledgeBaseRevisionAtCreation: 0, assets: baseAssets(), groups, reviewItems })
  assert.deepEqual(cases.map((item) => [item.rootProposal.proposalId, item.classification.actionability]).sort(), [
    ['identity', 'knowledge_decision'],
    ['schema-gap', 'schema_design'],
    ['theme-ambiguity', 'knowledge_decision'],
    ['theme-creation', 'research_followup'],
  ])
})

test('RelationConflictCase and ClaimConflictCase preserve bounded canonical projections', () => {
  const groups = [group(entity('a', 'A')), group(entity('b', 'B', 'product')), group(relation('r', 'e-a', 'e-b')), group(claim('c', 'e-a'))]
  const assets = {
    ...baseAssets(),
    entities: [loaded('entity', { id: 'entity:a', type: 'company', name: 'A', aliases: [], lifecycle: { status: 'active' } }), loaded('entity', { id: 'entity:b', type: 'product', name: 'B', aliases: [], lifecycle: { status: 'active' } })] as never,
    relations: [loaded('relation', { id: 'relation:old', type: 'offers_product', sourceRef: 'entity:a', targetRef: 'entity:b', attributes: { importance: 'low' }, lifecycle: { status: 'active' } })] as never,
    claims: [loaded('claim', { id: 'claim:old', claimType: 'fact', statement: 'A was growing slowly', subjectRefs: ['entity:a'], temporal: null, structuredValue: null, lifecycle: { status: 'active' } })] as never,
  }
  const reviewItems: ReviewItem[] = [
    { candidateId: 'r', kind: 'relation', rationale: 'Relation semantic conflict', dependentCandidateIds: [], category: 'reconciliation_review', origin: 'semantic_case', dependency: false },
    { candidateId: 'c', kind: 'claim', rationale: 'Claim semantic conflict', dependentCandidateIds: [], category: 'reconciliation_review', origin: 'semantic_case', dependency: false },
  ]
  const intents: ResolutionIntent[] = [
    { candidateRef: 'r', candidateKind: 'relation', disposition: 'review', semanticBasis: { rationale: 'Relation semantic conflict', caseKind: 'RelationConflictCase' }, evidenceRefs: ['block-2'], reviewExistingKnowledgeRefs: ['relation:old'] },
    { candidateRef: 'c', candidateKind: 'claim', disposition: 'review', semanticBasis: { rationale: 'Claim semantic conflict', caseKind: 'ClaimConflictCase' }, evidenceRefs: ['block-3'], reviewExistingKnowledgeRefs: ['claim:old'] },
  ]
  const cases = buildReviewCases({ knowledgeBaseId: 'kb-projections', producerRunId: 'run-projections', createdAt: '2026-09-06T00:00:00.000Z', rawRef: 'raw-sha256-' + '2'.repeat(64), documentId: 'doc-projections', knowledgeBaseRevisionAtCreation: 2, assets, groups, reviewItems, intents })
  const relationCase = cases.find((item) => item.rootProposal.proposalId === 'r')!
  const claimCase = cases.find((item) => item.rootProposal.proposalId === 'c')!
  assert.deepEqual(relationCase.resolutionContext.existingKnowledgeProjections, [{ canonicalRef: 'relation:old', kind: 'relation', semanticType: 'offers_product', payload: { kind: 'relation', type: 'offers_product', sourceRef: 'entity:a', targetRef: 'entity:b', attributes: { importance: 'low' } } }])
  assert.deepEqual(claimCase.resolutionContext.existingKnowledgeProjections, [{ canonicalRef: 'claim:old', kind: 'claim', semanticType: 'fact', payload: { kind: 'claim', claimType: 'fact', statement: 'A was growing slowly', subjectRefs: ['entity:a'], temporal: null, structuredValue: null } }])
})

test('ReviewCase and manifest validation reject inconsistent semantic and impact state', () => {
  const { cases } = fixtureCases()
  const malformedPayload = structuredClone(cases[0]!) as any
  malformedPayload.rootProposal.semanticType = 'wrong-type'
  assert.throws(() => validateReviewCase(malformedPayload), /semantic kind/)
  const duplicateDependencies = structuredClone(cases[0]!) as any
  duplicateDependencies.rootProposal.dependencyRefs = ['e-root', 'e-root']
  assert.throws(() => validateReviewCase(duplicateDependencies), /must not contain duplicates/)
  const inconsistentImpact = structuredClone(cases[0]!) as any
  inconsistentImpact.impact.dependentProposalCount = 0
  assert.throws(() => validateReviewCase(inconsistentImpact), /impact is inconsistent/)
  assert.throws(() => validateReviewRunManifest({ version: '0.1', knowledgeBaseId: 'kb', producerType: 'producer', producerRunId: 'run', reviewCaseCount: 2, caseIds: ['case-b', 'case-a'], deterministicSetHash: 'sha256:' + '0'.repeat(64), createdAt: 'now', schemaVersionAtCreation: '0.3', knowledgeBaseRevisionAtCreation: 0 }), /unsorted/)
})

test('ReviewCase store is atomic, reloadable, idempotent, and rejects conflicting runs', async () => {
  const root = await mkdtemp(join(tmpdir(), 'rhl-review-case-'))
  try {
    const { cases } = fixtureCases()
    await assert.rejects(() => persistReviewCases({ rootRef: root, knowledgeBaseId: 'kb-review-case', producerRunId: 'run-001', cases, createdAt: '2026-09-06T00:00:00.000Z', knowledgeBaseRevisionAtCreation: 0, failpoint: () => { throw new Error('injected') } }), /injected/)
    await assert.rejects(() => readFile(join(root, 'reviews', 'runs', 'run-001', 'manifest.yaml')), /ENOENT/)
    const first = await persistReviewCases({ rootRef: root, knowledgeBaseId: 'kb-review-case', producerRunId: 'run-001', cases, createdAt: '2026-09-06T00:00:00.000Z', knowledgeBaseRevisionAtCreation: 4 })
    assert.equal(first.kind, 'written')
    await rm(join(root, 'reviews', 'runs', 'run-001'), { recursive: true, force: true })
    const recovered = await recoverReviewCasesFromExecutionLog(root, { workflowRunId: 'run-001', knowledgeBaseId: 'kb-review-case', completedAt: '2026-09-06T00:00:00.000Z', ingestionContext: { producerRunId: 'run-001', producerType: 'raw_document_knowledge_ingestion', reviewCases: cases, reviewCaseSetHash: first.manifest?.deterministicSetHash } })
    assert.deepEqual(recovered.map((item) => item.reviewCaseId), cases.map((item) => item.reviewCaseId))
    const replay = await persistReviewCases({ rootRef: root, knowledgeBaseId: 'kb-review-case', producerRunId: 'run-001', cases, createdAt: 'different', knowledgeBaseRevisionAtCreation: 9 })
    assert.equal(replay.kind, 'replay')
    assert.equal((await listOpenReviewCases(root)).length, 1)
    assert.equal((await loadReviewCase(root, cases[0]!.reviewCaseId, 'run-001'))?.reviewCaseId, cases[0]!.reviewCaseId)
    const changed = [{ ...cases[0]!, classification: { ...cases[0]!.classification, rationale: 'changed' } }]
    const conflict = await persistReviewCases({ rootRef: root, knowledgeBaseId: 'kb-review-case', producerRunId: 'run-001', cases: changed, createdAt: 'different', knowledgeBaseRevisionAtCreation: 9 })
    assert.equal(conflict.kind, 'conflict')
  } finally { await rm(root, { recursive: true, force: true }) }
})
