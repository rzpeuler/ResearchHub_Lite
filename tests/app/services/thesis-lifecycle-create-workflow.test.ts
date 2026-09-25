import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdir, mkdtemp, rm, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createFreshKnowledgeBaseV04, readCanonicalV04Assets } from '../../../knowledge/storage/index.ts'
import { KnowledgeBaseRegistry } from '../../../knowledge/registry/registry.ts'
import { KnowledgeProductionGateway } from '../../../knowledge/production/gateway.ts'
import type { ReasoningCapabilities, ReasoningExecutor, ReasoningRequest, ReasoningResult } from '../../../plugins/reasoning/contracts.ts'
import type { NormalizedResearchSource } from '../../../plugins/research-acquisition/contracts.ts'
import { ResearchService } from '../../../app/services/research-service.ts'
import { WorkflowService } from '../../../app/services/workflow-service.ts'

const NOW = '2026-09-24T00:00:00.000Z'
const AS_OF = '2026-09-23T00:00:00.000Z'
const caps: ReasoningCapabilities = { maxContextTokens: 8_000, maxOutputTokens: 2_000, structuredOutputSupport: true, maxConcurrency: 1 }

class ThesisExecutor implements ReasoningExecutor {
  readonly requests: ReasoningRequest[] = []
  constructor(private readonly evidenceRef: string) {}
  capabilities(): ReasoningCapabilities { return caps }
  async execute(request: ReasoningRequest): Promise<ReasoningResult> {
    this.requests.push(request)
    return { operation: request.operation, output: { summary: 'Durable growth outlook.', propositions: [{ propositionId: 'growth', statement: 'Capacity expansion supports durable growth.', propositionType: 'business_driver', basis: 'verified_evidence', timeHorizon: 'medium_term', sourceRefs: [this.evidenceRef] }] } }
  }
}

function source(): NormalizedResearchSource {
  return { candidate: { candidateId: 'annual-report', kind: 'official_disclosure', tier: 1, title: 'Annual report', provider: 'fixture', publishedAt: AS_OF }, retrievedAt: NOW, title: 'Annual report', content: 'Revenue and capacity details.', contentHash: 'a'.repeat(64), publisher: 'Fixture Exchange', rights: { accessScope: 'public', retentionAllowed: true, aiProcessingAllowed: true, derivativeKnowledgeAllowed: true, redistributionAllowed: false } }
}

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'rhl-thesis-create-workflow-'))
  const kb = join(root, 'kb'); const reportRoot = join(root, 'reports'); await mkdir(reportRoot)
  await createFreshKnowledgeBaseV04(kb, { knowledgeBaseId: 'kb-thesis-create-workflow', now: NOW })
  const gateway = new KnowledgeProductionGateway()
  let handle = await new KnowledgeBaseRegistry().mount(kb)
  const company = await gateway.submit({ handle, producerType: 'fixture', producerRunId: 'create-workflow-company', schemaProfile: { schemaVersion: '0.4', storageFormatVersion: '1', requiresRawProvenance: true }, entity: { localKey: 'company', entityType: 'company', name: 'Fixture Co', semanticFields: { ticker: '600519', exchange: 'SSE' } }, proposals: [], evidenceBindings: [], now: () => NOW })
  assert.equal(company.status, 'committed')
  const companyRef = company.entityRefsByLocalKey.company as `entity:${string}`
  handle = await new KnowledgeBaseRegistry().mount(kb)
  const evidence = await gateway.submit({ handle, producerType: 'fixture', producerRunId: 'create-workflow-evidence', schemaProfile: { schemaVersion: '0.4', storageFormatVersion: '1', requiresRawProvenance: true }, entity: { localKey: 'company', entityType: 'company', name: 'Fixture Co', semanticFields: { ticker: '600519', exchange: 'SSE' }, existingEntityRef: companyRef }, proposals: [{ proposalId: 'capacity-claim', kind: 'claim', subjectKey: 'company', claimType: 'fact', statement: 'Capacity expansion is underway.', sourceCandidateIds: ['annual-local'], temporal: { asOf: AS_OF } }], evidenceBindings: [{ localSourceId: 'annual-local', source: source() }], asOf: AS_OF, now: () => NOW })
  assert.equal(evidence.status, 'committed')
  const evidenceRef = evidence.claimRefsByProposalId['capacity-claim'] as `claim:${string}`
  const input = { workflowRunId: 'thesis-create-workflow-run', companyRef, thesisTitle: 'Durable growth', narrative: 'Capacity expansion should support sustained growth.', evidenceRefs: [evidenceRef], asOf: AS_OF }
  const createService = (executor: ThesisExecutor, workflowService = new WorkflowService()) => new ResearchService({ mountedKnowledgeBaseRoot: kb, reportRoot, acquisitionPlugins: [], workflowService, reasoningExecutor: executor })
  return { root, kb, reportRoot, input, evidenceRef, createService, close: () => rm(root, { recursive: true, force: true }) }
}

test('Thesis CREATE uses Workflow, persists a validated lifecycle report, and replays before Pi after restart', async () => {
  const f = await fixture()
  try {
    const executor = new ThesisExecutor(f.evidenceRef)
    const service = f.createService(executor)
    const first = await service.startThesisLifecycleCreate(f.input).completion
    assert.equal(first.status, 'completed', JSON.stringify(first))
    assert.match(first.reportId ?? '', /^thesis-lifecycle-thesis-create-workflow-run$/)
    assert.equal(executor.requests.length, 1)
    const report = await service.getResearchReport(first.reportId!)
    assert.equal(report.reportType, 'thesis_lifecycle')
    assert.deepEqual(report.subjectRefs, [f.input.companyRef])
    assert.ok(report.sections.some((section) => section.id === 'evidence-pit' && section.markdown.includes(f.evidenceRef)))
    assert.ok(report.sections.some((section) => section.id === 'writer-state' && section.markdown.includes(`Committed revision: ${first.committedRevision}`)))
    const committedRevision = (await new KnowledgeBaseRegistry().mount(f.kb)).revision
    const restartExecutor = new ThesisExecutor(f.evidenceRef)
    const replay = await f.createService(restartExecutor).startThesisLifecycleCreate(f.input).completion
    assert.equal(replay.status, 'completed')
    assert.equal(replay.thesisRef, first.thesisRef)
    assert.equal((await new KnowledgeBaseRegistry().mount(f.kb)).revision, committedRevision)
    assert.equal(restartExecutor.requests.length, 0)
    const conflict = await f.createService(restartExecutor).startThesisLifecycleCreate({ ...f.input, thesisTitle: 'Changed title' }).completion
    assert.equal(conflict.status, 'failed')
    assert.deepEqual(conflict.diagnostics, ['THESIS_CREATE_REPLAY_INPUT_CONFLICT'])
    assert.equal(restartExecutor.requests.length, 0)
  } finally { await f.close() }
})

test('Thesis CREATE fails closed before Pi if a prior Writer log exists without the durable report', async () => {
  const f = await fixture()
  try {
    const executor = new ThesisExecutor(f.evidenceRef)
    const first = await f.createService(executor).startThesisLifecycleCreate(f.input).completion
    assert.equal(first.status, 'completed')
    await unlink(join(f.reportRoot, `${first.reportId}.md.json`))
    await unlink(join(f.reportRoot, `${first.reportId}.md`))
    const retryExecutor = new ThesisExecutor(f.evidenceRef)
    const retry = await f.createService(retryExecutor).startThesisLifecycleCreate(f.input).completion
    assert.equal(retry.status, 'failed')
    assert.deepEqual(retry.diagnostics, ['THESIS_CREATE_COMMITTED_WITHOUT_DURABLE_REPORT'])
    assert.equal(retryExecutor.requests.length, 0)
    assert.ok((await readCanonicalV04Assets(f.kb)).objects.some((item) => item.kind === 'thesis' && item.value.id === first.thesisRef))
  } finally { await f.close() }
})
