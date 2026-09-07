import test from 'node:test'
import assert from 'node:assert/strict'
import { canonicalRefHash, graphStructuralSnapshot, RestartPersistenceValidationError, setEvidenceClassification, validateReviewApiListAndDetail, verifyCanonicalPersistence, verifyGraphPersistence, verifyRawPersistence, verifyReviewPersistence, verifyRuntimeInstanceIndependence } from './restart-review-persistence-contract.ts'

const counts = { entities: 1, relations: 1, claims: 0, sources: 1, modules: 0, themeGroups: 0 }
const refs = ['entity:a', 'relation:r', 'source:s']
const graph = { rootRef: 'entity:a', nodes: ['entity:a', 'entity:b'], edges: [{ ref: 'relation:r', sourceRef: 'entity:a', targetRef: 'entity:b' }] }
const list = { total: 1, cases: [{ reviewCaseId: 'review:1', producerRunId: 'run:1', producerType: 'raw_document_knowledge_ingestion', createdAt: '2026-09-07T00:00:00.000Z', category: 'reconciliation_review', actionability: 'knowledge_decision', origin: 'knowledge_resolution', proposalKind: 'entity', semanticType: 'company', dependentProposalCount: 0, status: 'open' }] }
const detail = { reviewCaseId: 'review:1', producerRunId: 'run:1', rootProposal: { proposalId: 'proposal:1' }, evidenceBindings: [{ kind: 'raw_document_block', rawRef: 'raw-sha256-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', documentId: 'doc:1', blockId: 'block:1' }], totalDependentProposals: 0, dependentProposalSamples: [], dependentProposals: [] }

test('restart verifier rejects same Runtime instance identity', () => { const value = {}; assert.throws(() => verifyRuntimeInstanceIndependence(value, value), RestartPersistenceValidationError) })
test('restart verifier rejects revision change', () => assert.throws(() => verifyCanonicalPersistence({ revision: 1, counts, refs }, { revision: 2, counts, refs }), /revision changed/))
test('restart verifier rejects canonical ref-set change', () => assert.throws(() => verifyCanonicalPersistence({ revision: 1, counts, refs }, { revision: 1, counts, refs: [...refs, 'claim:c'] }), /ref set changed/))
test('restart verifier rejects missing rawRef', () => assert.throws(() => verifyRawPersistence({ rawRef: '', sizeBytes: 1, contentHash: 'sha256:a', integrity: true }, { rawRef: '', sizeBytes: 1, contentHash: 'sha256:a', integrity: true }), /missing rawRef/))
test('restart verifier rejects graph node/edge change', () => assert.throws(() => verifyGraphPersistence(graph, { ...graph, edges: [{ ...graph.edges[0], targetRef: 'entity:c' }] }), /Graph edge/))
test('restart verifier rejects missing persisted ReviewCase', () => assert.throws(() => validateReviewApiListAndDetail({ total: 0, cases: [] }, detail, 'run:1'), /positive total|current Production/))
test('Review API validator requires list and detail', () => assert.throws(() => validateReviewApiListAndDetail(list, { ...detail, evidenceBindings: [] }, 'run:1'), /evidence bindings/))
test('sorted ordering differences do not fail equivalent structural state', () => {
  assert.equal(canonicalRefHash(['entity:b', 'entity:a']), canonicalRefHash(['entity:a', 'entity:b']))
  assert.deepEqual(graphStructuralSnapshot({ ...graph, nodes: ['entity:b', 'entity:a'], edges: [...graph.edges] }), graphStructuralSnapshot({ ...graph, nodes: ['entity:a', 'entity:b'], edges: [...graph.edges] }))
  const before = validateReviewApiListAndDetail(list, detail, 'run:1'); const after = validateReviewApiListAndDetail({ ...list, cases: [...list.cases].reverse() }, detail, 'run:1')
  assert.deepEqual(verifyReviewPersistence(before, after), { reviewStable: true, reviewCaseFound: true, detailFound: true, metadataStable: true })
  assert.deepEqual(verifyRawPersistence({ rawRef: 'raw-sha256-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', sizeBytes: 1, contentHash: 'sha256:a', integrity: true }, { rawRef: 'raw-sha256-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', sizeBytes: 1, contentHash: 'sha256:a', integrity: true }), { rawStable: true, sameRawRef: true, sameHash: true, sameSize: true, integrity: true })
})

test('evidence classification writes currentRun and classification as one state', () => {
  const evidence: Record<string, unknown> = { currentRun: 'IN_PROGRESS', classification: 'IN_PROGRESS' }
  setEvidenceClassification(evidence, 'PRODUCT_DEFECT')
  assert.equal(evidence.currentRun, 'PRODUCT_DEFECT')
  assert.equal(evidence.classification, 'PRODUCT_DEFECT')
})
