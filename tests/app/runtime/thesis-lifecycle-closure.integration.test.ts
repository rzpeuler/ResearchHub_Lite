import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import test from 'node:test'
import { ModelRuntime } from '@earendil-works/pi-coding-agent'
import { fauxProvider } from '@earendil-works/pi-ai'
import { createFreshKnowledgeBaseV04, readCanonicalV04Assets } from '../../../knowledge/storage/index.ts'
import { KnowledgeBaseRegistry } from '../../../knowledge/registry/registry.ts'
import { KnowledgeProductionGateway } from '../../../knowledge/production/gateway.ts'
import { hashKnowledgeObject } from '../../../knowledge/storage/canonical-hash.ts'
import { createResearchHubApplicationRuntime } from '../../../app/runtime/application-runtime.ts'
import { ResearchHubRuntimeServer } from '../../../app/runtime/server.ts'
import type { ReasoningExecutor, ReasoningRequest } from '../../../plugins/reasoning/contracts.ts'
import { sha256 } from '../../../plugins/research-acquisition/hash.ts'
import type { NormalizedResearchSource } from '../../../plugins/research-acquisition/contracts.ts'
import { loadReviewDecision } from '../../../knowledge/review/decision-store.ts'

const BASE = '2026-09-20T00:00:00.000Z'
const PUBLISHED = '2026-09-22T09:00:00.000Z'
const AS_OF = '2026-09-24T00:00:00.000Z'
const LIVE_SOURCE_ID = 'integration-official-source'

class ControlledReasoningExecutor implements ReasoningExecutor {
  propositionRef = ''
  capabilities() { return { maxContextTokens: 32_000, maxOutputTokens: 2_000, structuredOutputSupport: true, maxConcurrency: 1 } }
  async execute(request: ReasoningRequest) {
    assert.equal(request.operation, 'thesis_refresh_semantic')
    const input = request.input as { evidence: readonly { evidenceId: string; sourceRefs: readonly string[] }[] }
    return {
      operation: request.operation,
      output: {
        evidence: input.evidence.map((item) => ({
          evidenceId: item.evidenceId,
          relation: 'weakens',
          targetPropositionRefs: [this.propositionRef],
          sourceRefs: item.sourceRefs,
          rationale: 'Controlled integration classification for the lifecycle path.',
        })),
      },
    }
  }
}

function source(): NormalizedResearchSource {
  const content = 'Integration-only source content. This deterministic test does not claim real acquisition or Pi reasoning.'
  return {
    candidate: { candidateId: LIVE_SOURCE_ID, kind: 'official_disclosure', tier: 1, title: 'Integration-only disclosure', provider: 'test-only', url: 'https://example.test/thesis-lifecycle', publishedAt: PUBLISHED, metadata: { companySymbol: '600519', testOnly: true } },
    retrievedAt: AS_OF,
    title: 'Integration-only disclosure',
    content,
    canonicalUrl: 'https://example.test/thesis-lifecycle',
    contentHash: sha256(content),
    rawBytes: new TextEncoder().encode(content),
    publisher: 'test-only',
    rights: { accessScope: 'public', retentionAllowed: true, aiProcessingAllowed: true, derivativeKnowledgeAllowed: true, redistributionAllowed: false },
  }
}

async function waitForWorkflow(origin: string, runId: string, headers: Record<string, string>) {
  for (let attempt = 0; attempt < 500; attempt += 1) {
    const response = await fetch(`${origin}/api/workflows/${encodeURIComponent(runId)}`, { headers })
    assert.equal(response.status, 200)
    const workflow = await response.json() as { status: string }
    if (['completed', 'completed_with_review', 'blocked', 'failed', 'cancelled'].includes(workflow.status)) return workflow
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
  throw new Error(`Workflow did not reach a terminal state: ${runId}`)
}

const canonicalHashes = (root: string) => readCanonicalV04Assets(root).then((assets) => assets.objects.map((item) => [item.value.id, hashKnowledgeObject(item.value)]).sort(([a], [b]) => String(a).localeCompare(String(b))))

test('deterministic HTTP integration: REFRESH, DEFER no-write, ACCEPT Writer/reload, and replay', async () => {
  const root = await mkdtemp(join(tmpdir(), 'rhl-thesis-lifecycle-closure-http-'))
  const kbRoot = join(root, 'kb')
  const cwd = join(root, 'cwd')
  const workspaceRoot = join(root, 'workspace')
  const agentDir = join(root, 'agent')
  await Promise.all([mkdir(cwd), mkdir(workspaceRoot), mkdir(agentDir)])
  await createFreshKnowledgeBaseV04(kbRoot, { knowledgeBaseId: 'kb-thesis-lifecycle-closure-http', now: BASE })
  const modelRuntime = await ModelRuntime.create({ authPath: join(agentDir, 'auth.json'), modelsPath: null, refreshOnCreate: false, allowModelNetwork: false })
  const fake = fauxProvider({ provider: `thesis-lifecycle-closure-${Date.now()}-${Math.random()}`, models: [{ id: 'controlled-test-model' }] })
  modelRuntime.registerNativeProvider(fake.provider)
  const executor = new ControlledReasoningExecutor()
  let runtime: Awaited<ReturnType<typeof createResearchHubApplicationRuntime>> | undefined
  let server: ResearchHubRuntimeServer | undefined
  try {
    const registry = new KnowledgeBaseRegistry()
    const gateway = new KnowledgeProductionGateway(registry)
    const seeded = await gateway.submit({
      handle: await registry.mount(kbRoot),
      producerType: 'test_only_seed',
      producerRunId: 'thesis-closure-seed',
      schemaProfile: { schemaVersion: '0.4', storageFormatVersion: '1', requiresRawProvenance: true },
      entity: { localKey: 'company', entityType: 'company', name: 'Test Company', aliases: ['600519'], semanticFields: { ticker: '600519', exchange: 'SSE' } },
      proposals: [
        { proposalId: 'challenge-candidate', kind: 'claim', claimType: 'viewpoint', subjectKey: 'company', statement: 'This controlled proposition is sensitive to the newly admitted source.', sourceCandidateIds: [LIVE_SOURCE_ID] },
        { proposalId: 'unchanged-candidate', kind: 'claim', claimType: 'fact', subjectKey: 'company', statement: 'The issuer is listed on the Shanghai exchange.', sourceCandidateIds: [LIVE_SOURCE_ID] },
        { proposalId: 'new-evidence', kind: 'claim', claimType: 'fact', subjectKey: 'company', statement: 'The newly admitted source contains evidence for the review.', sourceCandidateIds: [LIVE_SOURCE_ID] },
        { proposalId: 'thesis', kind: 'thesis', subjectKey: 'company', thesisTitle: 'Controlled lifecycle acceptance', statement: 'A bounded test Thesis for persistence and decision closure.', thesisStatus: 'active' },
        { proposalId: 'qualifies-challenge', kind: 'reasoning_edge', sourceProposalId: 'challenge-candidate', targetKey: 'thesis', edgeType: 'qualifies' },
        { proposalId: 'qualifies-unchanged', kind: 'reasoning_edge', sourceProposalId: 'unchanged-candidate', targetKey: 'thesis', edgeType: 'qualifies' },
      ],
      evidenceBindings: [{ localSourceId: LIVE_SOURCE_ID, source: source() }],
      asOf: AS_OF,
      now: () => BASE,
    })
    assert.equal(seeded.status, 'committed', seeded.errors.join('; '))
    const thesisRef = seeded.thesisRefsByProposalId?.thesis
    const challengeRef = seeded.claimRefsByProposalId['challenge-candidate']
    const unchangedRef = seeded.claimRefsByProposalId['unchanged-candidate']
    const evidenceRef = seeded.claimRefsByProposalId['new-evidence']
    assert.ok(thesisRef && challengeRef && unchangedRef && evidenceRef)
    executor.propositionRef = challengeRef

    runtime = await createResearchHubApplicationRuntime({ cwd, agentDir, mountedKnowledgeBaseRoot: kbRoot, workspaceRoot, modelRuntime, model: fake.getModel(), reasoningExecutor: executor })
    server = new ResearchHubRuntimeServer({ runtime, clientRoot: join(root, 'missing-client'), port: 0 })
    const info = await server.start()
    const headers = { origin: info.origin, 'x-researchhub-runtime-token': info.runtimeToken, 'content-type': 'application/json' }

    const beforeHashes = await canonicalHashes(kbRoot)
    const beforeRevision = (await registry.mount(kbRoot)).revision
    const refreshResponse = await fetch(`${info.origin}/api/production/thesis-lifecycle/refresh`, { method: 'POST', headers, body: JSON.stringify({ thesisRef, asOf: AS_OF, evidenceRefs: [evidenceRef] }) })
    assert.equal(refreshResponse.status, 202)
    const launch = await refreshResponse.json() as { accepted: boolean; runId: string }
    assert.equal(launch.accepted, true)
    const workflow = await waitForWorkflow(info.origin, launch.runId, headers)
    assert.equal(workflow.status, 'completed_with_review')

    const reviewListResponse = await fetch(`${info.origin}/api/review-cases?producerRunId=${encodeURIComponent(launch.runId)}`, { headers })
    assert.equal(reviewListResponse.status, 200)
    const reviewList = await reviewListResponse.json() as { cases: readonly { reviewCaseId: string; decisionState?: string }[] }
    assert.equal(reviewList.cases.length, 1)
    const reviewCaseId = reviewList.cases[0]!.reviewCaseId
    const detailResponse = await fetch(`${info.origin}/api/review-cases/${encodeURIComponent(reviewCaseId)}`, { headers })
    assert.equal(detailResponse.status, 200)
    const detail = await detailResponse.json() as { thesisScope?: { rootClaimRef?: string; reviewedEvidence?: readonly { evidenceRef: string; relation: string; targetClaimRefs: readonly string[] }[] } }
    assert.equal(detail.thesisScope?.rootClaimRef, challengeRef)
    assert.deepEqual(detail.thesisScope?.reviewedEvidence?.map((item) => item.evidenceRef), [evidenceRef])
    assert.deepEqual(detail.thesisScope?.reviewedEvidence?.[0]?.targetClaimRefs, [challengeRef])
    const reportResponse = await fetch(`${info.origin}/api/research-reports/thesis-lifecycle-${encodeURIComponent(launch.runId)}`, { headers })
    assert.equal(reportResponse.status, 200)
    const refreshReport = await reportResponse.json() as { sections: readonly { id: string; markdown: string }[] }
    assert.ok(refreshReport.sections.find((section) => section.id === 'unchanged')?.markdown.includes(unchangedRef))
    assert.deepEqual(await canonicalHashes(kbRoot), beforeHashes, 'REFRESH must preserve canonical graph state')
    const refreshRevision = (await registry.mount(kbRoot)).revision
    assert.equal(refreshRevision, beforeRevision, 'REFRESH should persist the report/ReviewCase without canonical semantic writes')

    const deferResponse = await fetch(`${info.origin}/api/review-cases/${encodeURIComponent(reviewCaseId)}/decision`, { method: 'POST', headers, body: JSON.stringify({ decision: 'DEFER', note: 'Review after the next filing.' }) })
    assert.equal(deferResponse.status, 200)
    const deferred = await deferResponse.json() as { status: string; decisionState: string; reportUpdate?: { status: string } }
    assert.equal(deferred.status, 'deferred')
    assert.equal(deferred.decisionState, 'DEFERRED')
    assert.equal(deferred.reportUpdate?.status, 'updated')
    assert.equal((await registry.mount(kbRoot)).revision, refreshRevision, 'DEFER must not advance canonical Knowledge revision')
    assert.deepEqual(await canonicalHashes(kbRoot), beforeHashes, 'DEFER must preserve every canonical object hash')
    assert.equal((await loadReviewDecision(kbRoot, launch.runId, reviewCaseId))?.state, 'DEFERRED')

    const acceptNote = 'Apply the reviewed challenge edge.'
    const acceptResponse = await fetch(`${info.origin}/api/review-cases/${encodeURIComponent(reviewCaseId)}/decision`, { method: 'POST', headers, body: JSON.stringify({ decision: 'ACCEPT', note: acceptNote }) })
    assert.equal(acceptResponse.status, 200)
    const accepted = await acceptResponse.json() as { status: string; decisionState: string; writerRunId?: string; committedRevision?: number; reportUpdate?: { status: string; errors?: readonly string[] } }
    assert.equal(accepted.status, 'accepted')
    assert.equal(accepted.decisionState, 'ACCEPTED')
    assert.ok(accepted.writerRunId)
    assert.ok(accepted.committedRevision! > refreshRevision)
    assert.equal(accepted.reportUpdate?.status, 'updated', JSON.stringify(accepted.reportUpdate))
    assert.equal((await loadReviewDecision(kbRoot, launch.runId, reviewCaseId))?.state, 'ACCEPTED')

    const afterAcceptHandle = await new KnowledgeBaseRegistry().mount(kbRoot)
    const afterAccept = await readCanonicalV04Assets(kbRoot)
    const newImpactEdges = afterAccept.objects.filter((item) => item.kind === 'reasoning_edge' && !beforeHashes.some(([id]) => id === item.value.id))
    assert.equal(newImpactEdges.length, 1)
    assert.equal((newImpactEdges[0]!.value as { type: string }).type, 'challenges')
    assert.equal((newImpactEdges[0]!.value as { sourceRef: string }).sourceRef, evidenceRef)
    assert.equal((newImpactEdges[0]!.value as { targetRef: string }).targetRef, challengeRef)
    const thesis = afterAccept.objects.find((item) => item.kind === 'thesis' && item.value.id === thesisRef)?.value as { status: string }
    assert.equal(thesis.status, 'weakening')
    assert.ok(afterAcceptHandle.revision >= accepted.committedRevision!)
    const finalReportResponse = await fetch(`${info.origin}/api/research-reports/thesis-lifecycle-${encodeURIComponent(launch.runId)}`, { headers })
    const finalReport = await finalReportResponse.json() as { sections: readonly { id: string; markdown: string }[] }
    assert.equal(finalReportResponse.status, 200)
    assert.match(finalReport.sections.find((section) => section.id === 'review-state')?.markdown ?? '', /Decision state: ACCEPTED/)
    const actionableAfterAccept = await fetch(`${info.origin}/api/review-cases?producerRunId=${encodeURIComponent(launch.runId)}`, { headers }).then((response) => response.json()) as { cases: readonly unknown[] }
    assert.equal(actionableAfterAccept.cases.length, 0, 'ACCEPTED case must leave the actionable listing')

    const replayResponse = await fetch(`${info.origin}/api/review-cases/${encodeURIComponent(reviewCaseId)}/decision`, { method: 'POST', headers, body: JSON.stringify({ decision: 'ACCEPT', note: acceptNote }) })
    assert.equal(replayResponse.status, 200)
    const replay = await replayResponse.json() as { status: string; replay?: boolean; writerRunId?: string }
    assert.equal(replay.status, 'accepted')
    assert.equal(replay.replay, true)
    assert.equal(replay.writerRunId, accepted.writerRunId)
    assert.equal((await new KnowledgeBaseRegistry().mount(kbRoot)).revision, afterAcceptHandle.revision, 'identical ACCEPT replay must not write twice')

    const reportPath = `${info.origin}/api/research-reports/thesis-lifecycle-${encodeURIComponent(launch.runId)}`
    const reportBeforeConflictResponse = await fetch(reportPath, { headers })
    assert.equal(reportBeforeConflictResponse.status, 200)
    const reportBeforeConflict = await reportBeforeConflictResponse.json() as { knowledgeBaseRevision: number; sections: readonly { id: string; markdown: string }[] }
    const reviewStateBeforeConflict = reportBeforeConflict.sections.find((section) => section.id === 'review-state')?.markdown
    const decisionOutcomeBeforeConflict = reportBeforeConflict.sections.find((section) => section.id === 'decision-outcome')?.markdown
    assert.match(reviewStateBeforeConflict ?? '', /Decision state: ACCEPTED/)
    assert.ok(decisionOutcomeBeforeConflict?.includes(accepted.writerRunId!))

    const conflictResponse = await fetch(`${info.origin}/api/review-cases/${encodeURIComponent(reviewCaseId)}/decision`, { method: 'POST', headers, body: JSON.stringify({ decision: 'ACCEPT', note: 'A conflicting replay must not replace the durable report.' }) })
    assert.equal(conflictResponse.status, 200)
    const conflict = await conflictResponse.json() as { status: string; reportUpdate?: unknown }
    assert.equal(conflict.status, 'conflict')
    assert.equal(conflict.reportUpdate, undefined)

    const reportAfterConflictResponse = await fetch(reportPath, { headers })
    const reportAfterConflict = await reportAfterConflictResponse.json() as { knowledgeBaseRevision: number; sections: readonly { id: string; markdown: string }[] }
    assert.equal(reportAfterConflict.knowledgeBaseRevision, reportBeforeConflict.knowledgeBaseRevision)
    assert.equal(reportAfterConflict.sections.find((section) => section.id === 'review-state')?.markdown, reviewStateBeforeConflict)
    assert.equal(reportAfterConflict.sections.find((section) => section.id === 'decision-outcome')?.markdown, decisionOutcomeBeforeConflict)
  } finally {
    await server?.close()
    await runtime?.close()
    await Promise.resolve((modelRuntime as unknown as { dispose?: () => void | Promise<void> }).dispose?.())
    await rm(root, { recursive: true, force: true })
  }
})
