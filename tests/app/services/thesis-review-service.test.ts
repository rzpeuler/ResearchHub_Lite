import test from 'node:test'
import assert from 'node:assert/strict'
import { createKnowledgeBase, removeKnowledgeBase } from '../../knowledge/helpers.ts'
import { ReviewService } from '../../../app/services/review-service.ts'
import { beginApplyingReviewCase, deferReviewCase, finalizeAcceptedReviewCase, loadReviewDecision, markReviewCaseStale, rejectReviewCase } from '../../../knowledge/review/decision-store.ts'
import { buildReviewCases } from '../../../knowledge/review/case-builder.ts'
import { persistReviewCases } from '../../../knowledge/review/store.ts'
import type { EntityCandidate, ResolvedCandidateGroup } from '../../../skills/knowledge-curation/contracts.ts'
import type { ReviewItem } from '../../../workflows/raw-document-knowledge-ingestion/contracts.ts'

const AS_OF = '2026-09-24T12:00:00.000Z'
const PAYLOAD_HASH = `sha256:${'b'.repeat(64)}`
const checks = { refs: ['claim:updated-demand'], status: 'weakening' }

function buildCase(producerRunId: string, producerType = 'thesis_lifecycle') {
  const candidate: EntityCandidate = { candidateId: 'root', entityType: 'company', name: 'Acme', aliases: [], evidenceBlockRefs: ['block-1'], reason: 'review' }
  const groups: ResolvedCandidateGroup[] = [{ candidateId: 'root', kind: 'entity', candidate }]
  const reviewItems: ReviewItem[] = [{ candidateId: 'root', kind: 'entity', rationale: 'Review thesis evidence', dependentCandidateIds: [], stage: 'knowledge_resolution', category: 'reconciliation_review', origin: 'knowledge_resolution', dependency: false }]
  const [base] = buildReviewCases({ knowledgeBaseId: 'kb-thesis-review-service', producerRunId, createdAt: AS_OF, rawRef: `raw-sha256-${'a'.repeat(64)}`, documentId: 'doc-1', knowledgeBaseRevisionAtCreation: 4, assets: { rootDir: '', themeGroups: [], entities: [], relations: [], claims: [], modules: [], sources: [], registry: [] }, groups, reviewItems })
  const value = structuredClone(base!) as any
  if (producerType === 'thesis_lifecycle') {
    value.producerType = 'thesis_lifecycle'
    value.resolutionContext.schemaVersionAtCreation = '0.4'
    value.rootProposal.proposalKind = 'claim'
    value.rootProposal.semanticType = 'assumption'
    value.rootProposal.semanticPayload = { candidateId: value.rootProposal.proposalId, claimType: 'assumption', statement: 'Demand remains durable.', subjectRefs: [{ candidateRef: 'e-root', mention: 'Acme' }], evidenceBlockRefs: ['research-source-1'], reason: 'review' }
    value.rootProposal.evidenceBindings = [{ kind: 'canonical_research_evidence', sourceRef: 'source:filing-1', rawRef: `raw-sha256-${'a'.repeat(64)}`, evidenceRef: 'observation:revenue-1' }]
    value.thesisScope = { thesisRef: 'thesis:acme-demand', rootClaimRef: 'claim:demand', affectedClaimRefs: ['claim:demand'], evidenceRefs: ['observation:revenue-1'], reviewedEvidence: [{ evidenceRef: 'observation:revenue-1', relation: 'weakens', targetClaimRefs: ['claim:demand'] }], candidateTransition: 'weakened', asOf: AS_OF, proposedThesisStatus: 'weakening' }
    value.impact.affectedProposalRefs = value.suspendedProposalBundle.dependentProposals.map((item: { proposalId: string }) => item.proposalId)
  }
  return value
}

test('ReviewService overlays Thesis decisions, hides terminal cases, preserves deferred actionability, and bounds decision history', async () => {
  const root = await createKnowledgeBase({ knowledgeBaseId: 'kb-thesis-review-service' })
  try {
    const cases = ['run-open', 'run-deferred', 'run-accepted', 'run-rejected', 'run-stale'].map((runId) => buildCase(runId))
    const legacy = buildCase('run-legacy', 'raw_document_knowledge_ingestion')
    for (const reviewCase of [...cases, legacy]) await persistReviewCases({ rootRef: root, knowledgeBaseId: reviewCase.knowledgeBaseId, producerRunId: reviewCase.producerRunId, producerType: reviewCase.producerType, cases: [reviewCase], createdAt: reviewCase.createdAt, schemaVersionAtCreation: reviewCase.resolutionContext.schemaVersionAtCreation, knowledgeBaseRevisionAtCreation: reviewCase.resolutionContext.knowledgeBaseRevisionAtCreation })

    const [openCase, deferredCase, acceptedCase, rejectedCase, staleCase] = cases
    let snapshot = (await loadReviewDecision(root, deferredCase!.producerRunId, deferredCase!.reviewCaseId))!
    let deferred = await deferReviewCase(root, deferredCase!.producerRunId, deferredCase!.reviewCaseId, { expectedHash: snapshot.hash, expectedRevision: snapshot.revision, at: AS_OF, note: 'Wait for filing.' })
    for (let i = 0; i < 21; i += 1) deferred = await deferReviewCase(root, deferredCase!.producerRunId, deferredCase!.reviewCaseId, { expectedHash: deferred.snapshot.hash, expectedRevision: deferred.snapshot.revision, at: '2026-09-24T12:00:00.000Z', note: `Follow-up ${i}.` })

    snapshot = (await loadReviewDecision(root, acceptedCase!.producerRunId, acceptedCase!.reviewCaseId))!
    const applying = await beginApplyingReviewCase(root, acceptedCase!.producerRunId, acceptedCase!.reviewCaseId, { expectedHash: snapshot.hash, expectedRevision: snapshot.revision, at: AS_OF, payloadHash: PAYLOAD_HASH, baseKnowledgeRevision: 4, writerRunId: 'writer-run-accepted', expectedResultChecks: checks })
    await finalizeAcceptedReviewCase(root, acceptedCase!.producerRunId, acceptedCase!.reviewCaseId, { expectedHash: applying.snapshot.hash, expectedRevision: applying.snapshot.revision, at: AS_OF, payloadHash: PAYLOAD_HASH, writerRunId: 'writer-run-accepted', committedRevision: 5, expectedResultChecks: checks })

    snapshot = (await loadReviewDecision(root, rejectedCase!.producerRunId, rejectedCase!.reviewCaseId))!
    await rejectReviewCase(root, rejectedCase!.producerRunId, rejectedCase!.reviewCaseId, { expectedHash: snapshot.hash, expectedRevision: snapshot.revision, at: AS_OF, note: 'Evidence failed review.' })
    snapshot = (await loadReviewDecision(root, staleCase!.producerRunId, staleCase!.reviewCaseId))!
    await markReviewCaseStale(root, staleCase!.producerRunId, staleCase!.reviewCaseId, { expectedHash: snapshot.hash, expectedRevision: snapshot.revision, at: AS_OF, note: 'Knowledge changed.' })

    const service = new ReviewService(root)
    const list = await service.listOpenReviewCases({ limit: 50 })
    assert.equal(list.total, 3)
    assert.deepEqual(new Set(list.cases.map((item) => item.producerRunId)), new Set(['run-deferred', 'run-legacy', 'run-open']))
    assert.equal(list.cases.find((item) => item.producerRunId === 'run-deferred')?.decisionState, 'DEFERRED')
    assert.equal(await service.countOpenReviewCases(), 3)

    const detail = await service.getReviewCase(deferredCase!.reviewCaseId)
    assert.equal(detail.thesisScope?.thesisRef, 'thesis:acme-demand')
    assert.equal(detail.decision?.state, 'DEFERRED')
    assert.equal(detail.decision?.events.length, 20)
    assert.equal(detail.decision?.eventsTruncated, true)
    assert.equal(JSON.stringify(detail.decision).includes('payloadHash'), false)
    assert.equal((await service.getReviewCase(openCase!.reviewCaseId)).decision?.state, 'OPEN')
    assert.equal((await service.getReviewCase(acceptedCase!.reviewCaseId)).decision?.state, 'ACCEPTED')
    assert.equal((await service.getReviewCase(legacy.reviewCaseId)).decision, undefined)
  } finally { await removeKnowledgeBase(root) }
})
