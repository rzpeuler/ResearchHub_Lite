import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import test from 'node:test'
import { KnowledgeProductionGateway } from '../../../knowledge/production/gateway.ts'
import { KnowledgeBaseRegistry } from '../../../knowledge/registry/registry.ts'
import { createFreshKnowledgeBaseV04 } from '../../../knowledge/storage/create-v04.ts'
import { readCanonicalV04Assets } from '../../../knowledge/storage/canonical-v04-loader.ts'
import { ResearchService } from '../../../app/services/research-service.ts'
import { readResearchReport, writeResearchReport, type ResearchReport } from '../../../app/services/research-report.ts'
import { WorkflowService } from '../../../app/services/workflow-service.ts'
import { runThesisRefreshAdapter } from '../../../workflows/thesis-lifecycle/refresh-adapter.ts'
import { knowledgeV04Input, normalizedSource } from '../../fixtures/knowledge-v04.ts'

test('ResearchService runs normal thesis REFRESH and persists a no-change report', async () => {
  const root = await mkdtemp(join(tmpdir(), 'rhl-thesis-lifecycle-service-'))
  const reports = join(root, 'reports')
  try {
    const kbRoot = join(root, 'kb')
    await createFreshKnowledgeBaseV04(kbRoot, { knowledgeBaseId: 'kb-thesis-lifecycle-service', now: '2026-09-18T00:00:00.000Z' })
    const registry = new KnowledgeBaseRegistry()
    const handle = await registry.mount(kbRoot)
    const fixture = knowledgeV04Input(handle, 'seed-thesis-lifecycle')
    const proposals = fixture.proposals.map((proposal) => proposal.proposalId === 'edge-claim-thesis' ? { ...proposal, edgeType: 'qualifies' as const } : proposal)
    const seeded = await new KnowledgeProductionGateway(registry).submit({ ...fixture, proposals })
    assert.ok(seeded.thesisRefsByProposalId?.thesis, JSON.stringify(seeded))
    assert.ok(seeded.claimRefsByProposalId['earnings-claim'], JSON.stringify(seeded))

    const workflowService = new WorkflowService()
    const service = new ResearchService({ mountedKnowledgeBaseRoot: kbRoot, reportRoot: reports, acquisitionPlugins: [], workflowService })
    const started = service.startThesisLifecycleRefresh({ thesisRef: seeded.thesisRefsByProposalId!.thesis!, asOf: '2026-09-24T00:00:00.000Z', runId: 'thesis-lifecycle-no-change' })
    assert.equal(workflowService.getWorkflowStatus(started.runId)?.workflowType, 'thesis_lifecycle')
    const result = await started.completion
    assert.equal(result.status, 'completed', result.diagnostics.join('; '))
    assert.deepEqual(result.reviewCaseIds, [])
    assert.ok(result.reportId)
    const report = JSON.parse(await readFile(join(reports, `${result.reportId}.md.json`), 'utf8')) as { sections: { id: string; markdown: string }[] }
    const reviewState = report.sections.find((section) => section.id === 'review-state')
    assert.match(reviewState?.markdown ?? '', /Refresh disposition: completed/)
    assert.match(reviewState?.markdown ?? '', /ReviewCase IDs: None/)
    assert.match(reviewState?.markdown ?? '', /Thesis membership\/status and reviewed impact edges require explicit human decision/)
    await writeFile(join(reports, `${result.reportId}.md`), 'stale partial markdown', 'utf8')
    const restarted = new ResearchService({ mountedKnowledgeBaseRoot: kbRoot, reportRoot: reports, acquisitionPlugins: [], workflowService: new WorkflowService() })
    const replay = await restarted.startThesisLifecycleRefresh({ thesisRef: seeded.thesisRefsByProposalId!.thesis!, asOf: '2026-09-24T00:00:00.000Z', runId: 'thesis-lifecycle-no-change' }).completion
    assert.equal(replay.status, result.status)
    assert.equal(replay.reportId, result.reportId)
    assert.deepEqual(replay.evidenceDecisions, result.evidenceDecisions)
    assert.match(await readFile(join(reports, `${result.reportId}.md`), 'utf8'), /Thesis Lifecycle/)
  } finally { await rm(root, { recursive: true, force: true }) }
})

test('ResearchService writes a context-only evidence Claim through Gateway without Thesis membership', async () => {
  const root = await mkdtemp(join(tmpdir(), 'rhl-thesis-lifecycle-auto-safe-'))
  const reports = join(root, 'reports')
  try {
    const kbRoot = join(root, 'kb')
    await createFreshKnowledgeBaseV04(kbRoot, { knowledgeBaseId: 'kb-thesis-lifecycle-auto-safe', now: '2026-09-18T00:00:00.000Z' })
    const registry = new KnowledgeBaseRegistry()
    const handle = await registry.mount(kbRoot)
    const fixture = knowledgeV04Input(handle, 'seed-thesis-lifecycle-auto-safe')
    const proposals = fixture.proposals.map((proposal) => proposal.proposalId === 'edge-claim-thesis' ? { ...proposal, edgeType: 'qualifies' as const } : proposal)
    const seeded = await new KnowledgeProductionGateway(registry).submit({ ...fixture, proposals })
    const thesisRef = seeded.thesisRefsByProposalId?.thesis
    assert.ok(thesisRef)

    const refreshedHandle = await registry.mount(kbRoot)
    const source = normalizedSource('new-metric', 'New metric evidence', 'Q2 margin was 0.37.')
    const datedSource = { ...source, candidate: { ...source.candidate, publishedAt: '2026-09-22T00:00:00.000Z' }, retrievedAt: '2026-09-23T00:00:00.000Z' }
    const added = await new KnowledgeProductionGateway(registry).submit({
      ...knowledgeV04Input(refreshedHandle, 'seed-new-metric'),
      producerRunId: 'seed-new-metric',
      asOf: '2026-09-23T00:00:00.000Z',
      now: () => '2026-09-23T00:00:00.000Z',
      proposals: [{ proposalId: 'q2-margin', kind: 'observation', observationType: 'metric', subjectKey: 'company', metricRef: 'metric:revenue', value: 0.37, unit: 'ratio', period: '2026-Q2', temporal: { reportedAt: '2026-09-22T00:00:00.000Z' }, sourceCandidateIds: ['new-metric'] }],
      evidenceBindings: [{ localSourceId: 'new-metric', source: datedSource }],
    })
    assert.ok(added.observationRefsByProposalId?.['q2-margin'], JSON.stringify(added))
    const executor = {
      capabilities: () => ({ maxContextTokens: 20_000, maxOutputTokens: 2_000, structuredOutputSupport: true, maxConcurrency: 1 }),
      execute: async (request: { input: unknown; operation: string }) => {
        assert.equal(request.operation, 'thesis_refresh_semantic')
        const semanticInput = request.input as { evidence: { evidenceId: string; sourceRefs: readonly string[] }[] }
        return { operation: request.operation as never, output: { evidence: semanticInput.evidence.map((item) => ({ evidenceId: item.evidenceId, relation: 'context', targetPropositionRefs: [], sourceRefs: item.sourceRefs, rationale: 'Context-only verified metric.' })) } }
      },
    }
    const workflowService = new WorkflowService()
    const service = new ResearchService({ mountedKnowledgeBaseRoot: kbRoot, reportRoot: reports, acquisitionPlugins: [], workflowService, reasoningExecutor: executor })
    const result = await service.startThesisLifecycleRefresh({ thesisRef, asOf: '2026-09-24T00:00:00.000Z', runId: 'thesis-lifecycle-auto-safe' }).completion
    assert.equal(result.status, 'completed', result.diagnostics.join('; '))
    assert.equal(result.reviewCaseIds.length, 0)
    assert.equal(result.autoSafeClaimRefs?.length, 1)
    assert.ok(result.autoSafeWriterRunId)
    assert.equal(result.knowledgeBaseRevision, seeded.knowledgeBaseRevision + 2)
    const assets = await readCanonicalV04Assets(kbRoot)
    const claimRef = result.autoSafeClaimRefs![0]!
    const claim = assets.objects.find((item) => item.kind === 'claim' && item.value.id === claimRef)?.value as { claimType: string; statement: string; provenance?: readonly { sourceRef: string; rawRef: string }[] } | undefined
    assert.equal(claim?.claimType, 'fact')
    assert.equal(claim?.statement, 'metric:revenue=0.37 ratio')
    assert.ok(claim?.provenance?.length)
    assert.equal(assets.objects.some((item) => item.kind === 'reasoning_edge' && (item.value as { type?: string; sourceRef?: string; targetRef?: string }).type === 'qualifies' && (item.value as { sourceRef?: string }).sourceRef === claimRef && (item.value as { targetRef?: string }).targetRef === thesisRef), false)
    const report = JSON.parse(await readFile(join(reports, `${result.reportId}.md.json`), 'utf8')) as { knowledgeBaseRevision: number; sections: { id: string; markdown: string }[] }
    assert.equal(report.knowledgeBaseRevision, result.knowledgeBaseRevision)
    assert.match(report.sections.find((section) => section.id === 'review-state')?.markdown ?? '', /Decision state: AUTO_APPLIED/)
    assert.match(report.sections.find((section) => section.id === 'review-state')?.markdown ?? '', new RegExp(claimRef))

    // Simulate process death after Writer commit but before report JSON commit.
    // The prewrite intent plus Writer log must recover the report without a
    // second semantic pass or Gateway write.
    const latestHandle = await registry.mount(kbRoot)
    const recoveredAssets = await readCanonicalV04Assets(kbRoot)
    const bindingDecisions = result.evidenceDecisions.filter((item) => item.decision === 'included' && item.relation && item.targetClaimRefs)
    const adapterResult = await runThesisRefreshAdapter({ assets: recoveredAssets, handle: latestHandle, thesisRef: thesisRef as `thesis:${string}`, currentAsOf: '2026-09-24T00:00:00.000Z', evidenceBindings: bindingDecisions.map((item) => ({ evidenceRef: item.evidenceRef, relation: item.relation!, targetClaimRefs: item.targetClaimRefs!, sourceBindings: item.sourceBindings })) })
    assert.equal(adapterResult.status, 'completed')
    const recoveredClaim = recoveredAssets.objects.find((item) => item.kind === 'claim' && item.value.id === claimRef)?.value as { claimType: 'fact' | 'forecast'; statement: string; subjectRefs: readonly string[]; structuredValue?: Readonly<Record<string, unknown>>; provenance?: readonly { sourceRef: string; rawRef: string }[] }
    assert.ok(recoveredClaim)
    const runId = 'thesis-lifecycle-auto-safe'
    const inputFingerprint = createHash('sha256').update(JSON.stringify({ thesisRef, asOf: '2026-09-24T00:00:00.000Z' })).digest('hex').slice(0, 24)
    const payload = { runId, inputFingerprint, knowledgeBaseId: latestHandle.knowledgeBaseId, thesisRef, asOf: '2026-09-24T00:00:00.000Z', baseRevision: result.knowledgeBaseRevision! - 1, writerRunId: result.autoSafeWriterRunId!, expected: [{ claimRef, claimType: recoveredClaim.claimType, statement: recoveredClaim.statement, subjectRef: recoveredClaim.subjectRefs[0]!, structuredValue: recoveredClaim.structuredValue!, sourceBindings: recoveredClaim.provenance! }], adapterResult, decisions: result.evidenceDecisions, diagnostics: result.diagnostics }
    const checksum = createHash('sha256').update(JSON.stringify(payload)).digest('hex').slice(0, 24)
    await rm(join(reports, `${result.reportId}.md`), { force: true })
    await rm(join(reports, `${result.reportId}.md.json`), { force: true })
    await writeFile(join(reports, `thesis-lifecycle-${runId}.autosafe-intent.json`), JSON.stringify({ version: 1, payload, checksum }), 'utf8')
    const restarted = new ResearchService({ mountedKnowledgeBaseRoot: kbRoot, reportRoot: reports, acquisitionPlugins: [], workflowService: new WorkflowService() })
    const recovered = await restarted.startThesisLifecycleRefresh({ thesisRef, asOf: '2026-09-24T00:00:00.000Z', runId }).completion
    assert.equal(recovered.status, 'completed', recovered.diagnostics.join('; '))
    assert.ok(recovered.diagnostics.includes('THESIS_REFRESH_AUTO_SAFE_REPORT_RECOVERED_FROM_WRITER_LOG'))
    assert.deepEqual(recovered.autoSafeClaimRefs, [claimRef])
    assert.ok(await readFile(join(reports, `${result.reportId}.md.json`), 'utf8'))
  } finally { await rm(root, { recursive: true, force: true }) }
})

test('ResearchService rejects a runId replay bound to different REFRESH inputs', async () => {
  const root = await mkdtemp(join(tmpdir(), 'rhl-thesis-lifecycle-replay-'))
  try {
    const kbRoot = join(root, 'kb')
    await createFreshKnowledgeBaseV04(kbRoot, { knowledgeBaseId: 'kb-thesis-lifecycle-replay', now: '2026-09-18T00:00:00.000Z' })
    const service = new ResearchService({ mountedKnowledgeBaseRoot: kbRoot, acquisitionPlugins: [], workflowService: new WorkflowService() })
    await service.startThesisLifecycleRefresh({ thesisRef: 'thesis:one', asOf: '2026-09-24T00:00:00.000Z', runId: 'thesis-run-replay' }).completion
    assert.throws(() => service.startThesisLifecycleRefresh({ thesisRef: 'thesis:two', asOf: '2026-09-24T00:00:00.000Z', runId: 'thesis-run-replay' }), /different thesis refresh input/)
  } finally { await rm(root, { recursive: true, force: true }) }
})

test('ResearchService fails closed when AUTO_SAFE Writer committed but the lifecycle report is missing', async () => {
  const root = await mkdtemp(join(tmpdir(), 'rhl-thesis-lifecycle-writer-recovery-'))
  try {
    const kbRoot = join(root, 'kb')
    await createFreshKnowledgeBaseV04(kbRoot, { knowledgeBaseId: 'kb-thesis-lifecycle-writer-recovery', now: '2026-09-18T00:00:00.000Z' })
    const runId = 'thesis-writer-crash-window'
    const hash = createHash('sha256').update(JSON.stringify({ runId, phase: 'safe-evidence-claims' })).digest('hex').slice(0, 24)
    const writerRunId = `thesis-auto-${hash}`
    const logRoot = join(kbRoot, 'logs', 'research')
    await mkdir(logRoot, { recursive: true })
    await writeFile(join(logRoot, `${writerRunId}.yaml`), JSON.stringify({ workflowRunId: writerRunId, status: 'completed', writeStatus: 'committed' }), 'utf8')
    const service = new ResearchService({ mountedKnowledgeBaseRoot: kbRoot, reportRoot: join(root, 'reports'), acquisitionPlugins: [], workflowService: new WorkflowService() })
    const result = await service.startThesisLifecycleRefresh({ thesisRef: 'thesis:missing', asOf: '2026-09-24T00:00:00.000Z', runId }).completion
    assert.equal(result.status, 'blocked')
    assert.ok(result.diagnostics.includes('THESIS_REFRESH_AUTO_SAFE_INTENT_MISSING_MANUAL_RECOVERY'))
  } finally { await rm(root, { recursive: true, force: true }) }
})

test('ResearchService appends the durable post-decision Writer outcome to the lifecycle report', async () => {
  const root = await mkdtemp(join(tmpdir(), 'rhl-thesis-lifecycle-decision-report-'))
  try {
    const reportRoot = join(root, 'reports')
    const storedResult = { runId: 'decision-run', status: 'completed_with_review', thesisRef: 'thesis:fixture', reviewCaseIds: ['thesis-refresh-fixture'], evidenceDecisions: [], diagnostics: [], summary: 'Review required' }
    const runResult = `<!-- THESIS_LIFECYCLE_RESULT_V1:${Buffer.from(JSON.stringify({ inputFingerprint: 'fixture-fingerprint', result: storedResult }), 'utf8').toString('base64url')} -->`
    const report: ResearchReport = { reportId: 'thesis-lifecycle-decision-run', reportType: 'thesis_lifecycle', subjectRefs: ['thesis:fixture'], generatedAt: '2026-09-24T00:00:00.000Z', asOf: '2026-09-24T00:00:00.000Z', workflowRunId: 'decision-run', knowledgeBaseRevision: 3, sourceRefs: ['source:filing'], claimRefs: ['claim:fixture'], methodology: 'Fixture report.', sections: [{ id: 'review-state', title: 'Review and Write State', markdown: 'Refresh disposition: completed_with_review\n\nReviewCase IDs: thesis-refresh-fixture\n\nDecision state: REVIEW_REQUIRED\n\nAUTO_SAFE Claim refs: None.\n\nGateway Writer run: None.\n\nFinal Knowledge revision: 3\n\nNo Thesis membership/status or reviewed impact-edge writes were performed.' }, { id: 'run-result', title: 'Run Result Metadata', markdown: runResult }], outputPath: 'thesis-lifecycle-decision-run.md' }
    await writeResearchReport(report, reportRoot)
    const service = new ResearchService({ mountedKnowledgeBaseRoot: root, reportRoot, acquisitionPlugins: [], workflowService: new WorkflowService() })
    const deferred = service.recordThesisLifecycleDecision({ producerRunId: 'decision-run', reviewCaseId: 'thesis-refresh-fixture', decisionState: 'DEFERRED', knowledgeBaseRevision: 3 })
    const accepted = service.recordThesisLifecycleDecision({ producerRunId: 'decision-run', reviewCaseId: 'thesis-refresh-fixture', decisionState: 'ACCEPTED', knowledgeBaseRevision: 3, committedRevision: 4, writerRunId: 'writer-thesis-fixture' })
    const [deferredResult, updated] = await Promise.all([deferred, accepted])
    assert.equal(deferredResult.status, 'updated')
    assert.equal(updated.status, 'updated')
    const saved = await readResearchReport(join(reportRoot, 'thesis-lifecycle-decision-run.md.json'))
    assert.equal(saved.knowledgeBaseRevision, 4)
    const outcome = saved.sections.find((section) => section.id === 'decision-outcome')?.markdown ?? ''
    assert.match(outcome, /Decision state: ACCEPTED/)
    assert.match(outcome, /Writer run: writer-thesis-fixture/)
    assert.match(outcome, /Committed revision: 4/)
    // Once an ACCEPTED result is recorded, a late report callback cannot
    // downgrade it to an earlier DEFERRED outcome.
    const acceptedResult = await service.recordThesisLifecycleDecision({ producerRunId: 'decision-run', reviewCaseId: 'thesis-refresh-fixture', decisionState: 'ACCEPTED', knowledgeBaseRevision: 3, committedRevision: 4, writerRunId: 'writer-thesis-fixture' })
    assert.equal(acceptedResult.status, 'updated')
    const repeated = await service.recordThesisLifecycleDecision({ producerRunId: 'decision-run', reviewCaseId: 'thesis-refresh-fixture', decisionState: 'DEFERRED', knowledgeBaseRevision: 3 })
    assert.equal(repeated.status, 'failed')
    assert.ok(repeated.errors.includes('THESIS_DECISION_REPORT_STATE_CONFLICT'))
    const final = await readResearchReport(join(reportRoot, 'thesis-lifecycle-decision-run.md.json'))
    assert.match(final.sections.find((section) => section.id === 'decision-outcome')?.markdown ?? '', /Decision state: ACCEPTED/)
  } finally { await rm(root, { recursive: true, force: true }) }
})
