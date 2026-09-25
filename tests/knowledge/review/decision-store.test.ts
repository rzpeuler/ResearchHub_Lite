import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildReviewCases } from '../../../knowledge/review/case-builder.ts'
import { beginApplyingReviewCase, deferReviewCase, finalizeAcceptedReviewCase, listReviewDecisionProjections, loadReviewDecision, rejectReviewCase } from '../../../knowledge/review/decision-store.ts'
import { persistReviewCases } from '../../../knowledge/review/store.ts'
import type { KnowledgeAssetCollectionV03 } from '../../../knowledge/storage/v03-types.ts'
import type { EntityCandidate, ResolvedCandidateGroup } from '../../../skills/knowledge-curation/contracts.ts'
import type { ReviewItem } from '../../../workflows/raw-document-knowledge-ingestion/contracts.ts'

const HASH = `sha256:${'a'.repeat(64)}`
const AS_OF = '2026-09-24T12:00:00.000Z'
function makeCase(runId = 'run-decisions') {
  const candidate: EntityCandidate = { candidateId: 'root', entityType: 'company', name: 'Acme', aliases: [], evidenceBlockRefs: ['block-1'], reason: 'review' }
  const group: ResolvedCandidateGroup = { candidateId: 'root', kind: 'entity', candidate }
  const reviewItem: ReviewItem = { candidateId: 'root', kind: 'entity', rationale: 'Ambiguous company identity', dependentCandidateIds: [], category: 'reconciliation_review', origin: 'knowledge_resolution', dependency: false }
  const assets: KnowledgeAssetCollectionV03 = { rootDir: '', themeGroups: [], entities: [], relations: [], claims: [], modules: [], sources: [], registry: [] }
  return buildReviewCases({ knowledgeBaseId: 'kb-decision-store', producerRunId: runId, createdAt: AS_OF, rawRef: `raw-sha256-${'a'.repeat(64)}`, documentId: 'doc-1', knowledgeBaseRevisionAtCreation: 4, assets, groups: [group], reviewItems: [reviewItem] })[0]!
}
async function fixture(t: { after(fn: () => Promise<void>): void }) {
  const root = await mkdtemp(join(tmpdir(), 'rhl-review-decision-'))
  const reviewCase = makeCase()
  const persisted = await persistReviewCases({ rootRef: root, knowledgeBaseId: reviewCase.knowledgeBaseId, producerRunId: reviewCase.producerRunId, cases: [reviewCase], createdAt: reviewCase.createdAt, knowledgeBaseRevisionAtCreation: 4 })
  assert.equal(persisted.kind, 'written')
  t.after(async () => { await rm(root, { recursive: true, force: true }) })
  return { root, reviewCase }
}
function expectation(snapshot: NonNullable<Awaited<ReturnType<typeof loadReviewDecision>>>) { return { expectedHash: snapshot.hash, expectedRevision: snapshot.revision } }

test('decision store persists DEFER then REJECT, replays identical terminal payload, and rejects a different terminal payload', async (t) => {
  const { root, reviewCase } = await fixture(t)
  const initial = await loadReviewDecision(root, reviewCase.producerRunId, reviewCase.reviewCaseId)
  assert.equal(initial?.state, 'OPEN')
  assert.equal(initial?.revision, 0)
  const deferred = await deferReviewCase(root, reviewCase.producerRunId, reviewCase.reviewCaseId, { ...expectation(initial!), at: AS_OF, note: 'Need one more filing.' })
  assert.equal(deferred.kind, 'written')
  assert.equal(deferred.snapshot.state, 'DEFERRED')
  const rejected = await rejectReviewCase(root, reviewCase.producerRunId, reviewCase.reviewCaseId, { ...expectation(deferred.snapshot), at: '2026-09-24T12:01:00.000Z', note: 'Evidence was not sufficient.' })
  assert.equal(rejected.kind, 'written')
  const replay = await rejectReviewCase(root, reviewCase.producerRunId, reviewCase.reviewCaseId, { ...expectation(initial!), at: 'invalid-is-ignored-on-identical-replay', note: 'Evidence was not sufficient.' })
  assert.equal(replay.kind, 'replay')
  const conflict = await deferReviewCase(root, reviewCase.producerRunId, reviewCase.reviewCaseId, { ...expectation(rejected.snapshot), at: AS_OF, note: 'Different terminal decision.' })
  assert.equal(conflict.kind, 'conflict')
  assert.equal((await loadReviewDecision(root, reviewCase.producerRunId, reviewCase.reviewCaseId))?.record?.events.length, 2)
})

test('decision store writes APPLYING intent and finalizes ACCEPTED after reload', async (t) => {
  const { root, reviewCase } = await fixture(t)
  const before = await loadReviewDecision(root, reviewCase.producerRunId, reviewCase.reviewCaseId)
  const deferred = await deferReviewCase(root, reviewCase.producerRunId, reviewCase.reviewCaseId, { ...expectation(before!), at: AS_OF, note: 'Review after deferral.' })
  const checks = { refs: ['claim:result'], status: 'weakening' }
  const applying = await beginApplyingReviewCase(root, reviewCase.producerRunId, reviewCase.reviewCaseId, { ...expectation(deferred.snapshot), at: '2026-09-24T12:01:00.000Z', payloadHash: HASH, baseKnowledgeRevision: 4, writerRunId: 'writer-run-1', expectedResultChecks: checks })
  assert.equal(applying.snapshot.state, 'APPLYING')
  assert.equal(applying.snapshot.record?.events[1]?.applyingIntent?.caseHash, before?.caseHash)
  const reloaded = await loadReviewDecision(root, reviewCase.producerRunId, reviewCase.reviewCaseId)
  assert.equal(reloaded?.state, 'APPLYING')
  const accepted = await finalizeAcceptedReviewCase(root, reviewCase.producerRunId, reviewCase.reviewCaseId, { ...expectation(reloaded!), at: '2026-09-24T12:02:00.000Z', payloadHash: HASH, writerRunId: 'writer-run-1', committedRevision: 5, expectedResultChecks: checks })
  assert.equal(accepted.kind, 'written')
  assert.equal(accepted.snapshot.state, 'ACCEPTED')
  const replay = await finalizeAcceptedReviewCase(root, reviewCase.producerRunId, reviewCase.reviewCaseId, { ...expectation(reloaded!), at: AS_OF, payloadHash: HASH, writerRunId: 'writer-run-1', committedRevision: 5, expectedResultChecks: checks })
  assert.equal(replay.kind, 'replay')
  const mismatchedReplay = await finalizeAcceptedReviewCase(root, reviewCase.producerRunId, reviewCase.reviewCaseId, { ...expectation(accepted.snapshot), at: AS_OF, payloadHash: HASH, writerRunId: 'writer-run-1', committedRevision: 5, expectedResultChecks: { refs: ['claim:other'] } })
  assert.equal(mismatchedReplay.kind, 'conflict')
})

test('decision store compare-and-write serializes concurrent requests and listing overlays cases', async (t) => {
  const { root, reviewCase } = await fixture(t)
  const initial = await loadReviewDecision(root, reviewCase.producerRunId, reviewCase.reviewCaseId)
  const [left, right] = await Promise.all([
    deferReviewCase(root, reviewCase.producerRunId, reviewCase.reviewCaseId, { ...expectation(initial!), at: AS_OF, note: 'Wait.' }),
    rejectReviewCase(root, reviewCase.producerRunId, reviewCase.reviewCaseId, { ...expectation(initial!), at: AS_OF, note: 'No.' }),
  ])
  assert.deepEqual([left.kind, right.kind].sort(), ['conflict', 'written'])
  const projections = await listReviewDecisionProjections(root)
  assert.equal(projections.length, 1)
  assert.equal(projections[0]?.actionable, true)
  assert.equal(projections[0]?.state, left.kind === 'written' ? 'DEFERRED' : 'REJECTED')
})

test('decision store rejects unsafe IDs and malformed persisted decision files', async (t) => {
  const { root, reviewCase } = await fixture(t)
  await assert.rejects(() => loadReviewDecision(root, reviewCase.producerRunId, '../outside'), /Unsafe reviewCaseId/)
  const directory = join(root, 'reviews', 'runs', reviewCase.producerRunId, 'decisions')
  const path = join(directory, `${reviewCase.reviewCaseId}.yaml`)
  await import('node:fs/promises').then(({ mkdir }) => mkdir(directory))
  await writeFile(path, JSON.stringify({ version: '0.1', reviewCaseId: 'other', state: 'OPEN', events: [] }), 'utf8')
  await assert.rejects(() => loadReviewDecision(root, reviewCase.producerRunId, reviewCase.reviewCaseId), /Malformed ReviewDecision/)
  await writeFile(path, '{bad yaml: [', 'utf8')
  await assert.rejects(() => loadReviewDecision(root, reviewCase.producerRunId, reviewCase.reviewCaseId))
})

test('decision persistence survives reload and does not mutate canonical Knowledge files', async (t) => {
  const { root, reviewCase } = await fixture(t)
  const manifestPath = join(root, 'manifest.yaml')
  await writeFile(manifestPath, 'fixture canonical manifest\n', 'utf8')
  const before = await readFile(manifestPath, 'utf8')
  const initial = await loadReviewDecision(root, reviewCase.producerRunId, reviewCase.reviewCaseId)
  await deferReviewCase(root, reviewCase.producerRunId, reviewCase.reviewCaseId, { ...expectation(initial!), at: AS_OF, note: 'Restart safe.' })
  const afterRestart = await loadReviewDecision(root, reviewCase.producerRunId, reviewCase.reviewCaseId)
  assert.equal(afterRestart?.state, 'DEFERRED')
  assert.equal(afterRestart?.revision, 1)
  assert.equal(await readFile(manifestPath, 'utf8'), before)
})
