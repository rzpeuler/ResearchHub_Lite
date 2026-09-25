import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createFreshKnowledgeBaseV04, readCanonicalV04Assets } from '../../../knowledge/storage/index.ts'
import { KnowledgeBaseRegistry } from '../../../knowledge/registry/registry.ts'
import { KnowledgeProductionGateway } from '../../../knowledge/production/gateway.ts'
import type { ReasoningCapabilities, ReasoningExecutor, ReasoningRequest, ReasoningResult } from '../../../plugins/reasoning/contracts.ts'
import type { NormalizedResearchSource } from '../../../plugins/research-acquisition/contracts.ts'
import { ThesisCreateService } from '../../../app/services/thesis-create-service.ts'

const NOW = '2026-09-24T00:00:00.000Z'
const AS_OF = '2026-09-23T00:00:00.000Z'
const caps: ReasoningCapabilities = { maxContextTokens: 8_000, maxOutputTokens: 2_000, structuredOutputSupport: true, maxConcurrency: 1 }

class ThesisExecutor implements ReasoningExecutor {
  readonly requests: ReasoningRequest[] = []
  constructor(private readonly evidenceRef: string, private readonly outputOverride?: unknown) {}
  capabilities(): ReasoningCapabilities { return caps }
  async execute(request: ReasoningRequest): Promise<ReasoningResult> {
    this.requests.push(request)
    return { operation: request.operation, output: this.outputOverride ?? { summary: 'Durable earnings growth.', propositions: [{ propositionId: 'growth', statement: 'Capacity expansion supports durable growth.', propositionType: 'business_driver', basis: 'verified_evidence', timeHorizon: 'medium_term', sourceRefs: [this.evidenceRef] }] } }
  }
}

function source(candidateId: string): NormalizedResearchSource {
  return { candidate: { candidateId, kind: 'official_disclosure', tier: 1, title: 'Annual report', provider: 'fixture', publishedAt: AS_OF }, retrievedAt: NOW, title: 'Annual report', content: 'Revenue and capacity details.', contentHash: 'a'.repeat(64), publisher: 'Fixture Exchange', rights: { accessScope: 'public', retentionAllowed: true, aiProcessingAllowed: true, derivativeKnowledgeAllowed: true, redistributionAllowed: false } }
}

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'rhl-thesis-create-service-'))
  await createFreshKnowledgeBaseV04(root, { knowledgeBaseId: 'kb-thesis-create-service', now: NOW })
  const registry = new KnowledgeBaseRegistry()
  const handle = await registry.mount(root)
  const gateway = new KnowledgeProductionGateway()
  const companyResult = await gateway.submit({ handle, producerType: 'fixture', producerRunId: 'thesis-create-company', schemaProfile: { schemaVersion: '0.4', storageFormatVersion: '1', requiresRawProvenance: true }, entity: { localKey: 'company', entityType: 'company', name: 'Fixture Co', semanticFields: { ticker: '600519', exchange: 'SSE' } }, proposals: [], evidenceBindings: [], now: () => NOW })
  assert.equal(companyResult.status, 'committed')
  const companyRef = companyResult.entityRefsByLocalKey.company as `entity:${string}`
  const evidenceWrite = await gateway.submit({ handle: await new KnowledgeBaseRegistry().mount(root), producerType: 'fixture', producerRunId: 'thesis-create-evidence', schemaProfile: { schemaVersion: '0.4', storageFormatVersion: '1', requiresRawProvenance: true }, entity: { localKey: 'company', entityType: 'company', name: 'Fixture Co', semanticFields: { ticker: '600519', exchange: 'SSE' }, existingEntityRef: companyRef }, proposals: [{ proposalId: 'capacity-claim', kind: 'claim', subjectKey: 'company', claimType: 'fact', statement: 'Capacity expansion is underway.', sourceCandidateIds: ['annual-local'], temporal: { asOf: AS_OF } }], evidenceBindings: [{ localSourceId: 'annual-local', source: source('annual') }], asOf: AS_OF, now: () => NOW })
  assert.equal(evidenceWrite.status, 'committed', JSON.stringify(evidenceWrite))
  const evidenceRef = evidenceWrite.claimRefsByProposalId['capacity-claim'] as `claim:${string}`
  return { root, companyRef, evidenceRef, gateway, close: () => rm(root, { recursive: true, force: true }) }
}

test('Thesis CREATE formalizes only admitted canonical evidence and reuses its Source/Raw through Gateway', async () => {
  const f = await fixture()
  try {
    const before = await readCanonicalV04Assets(f.root)
    const executor = new ThesisExecutor(f.evidenceRef)
    const service = new ThesisCreateService({ mountedKnowledgeBaseRoot: f.root, reasoningExecutor: executor, gateway: f.gateway, now: () => NOW })
    const input = { workflowRunId: 'thesis-create-service-run', companyRef: f.companyRef, thesisTitle: 'Durable growth', narrative: 'Capacity expansion should support sustained growth.', evidenceRefs: [f.evidenceRef], asOf: AS_OF }
    const result = await service.create(input)
    assert.equal(result.status, 'completed', JSON.stringify(result))
    assert.ok(result.thesisRef)
    assert.deepEqual(Object.keys(result.claimRefsByPropositionRef), ['growth'])
    assert.equal(result.evidenceDecisions[0]?.decision, 'included')
    assert.equal(executor.requests.length, 1)
    const after = await readCanonicalV04Assets(f.root)
    assert.equal(after.objects.filter((item) => item.kind === 'source').length, before.objects.filter((item) => item.kind === 'source').length)
    assert.equal((after.objects.find((item) => item.value.id === result.thesisRef)?.value as { statement: string }).statement, 'Durable earnings growth.')
    const revisionAfterCommit = (await new KnowledgeBaseRegistry().mount(f.root)).revision
    const replay = await service.create(input)
    assert.equal(replay.status, 'completed')
    assert.equal(replay.thesisRef, result.thesisRef)
    assert.equal((await new KnowledgeBaseRegistry().mount(f.root)).revision, revisionAfterCommit)
  } finally { await f.close() }
})

test('Thesis CREATE blocks semantically unbound proposition output before any write', async () => {
  const f = await fixture()
  try {
    const before = (await new KnowledgeBaseRegistry().mount(f.root)).revision
    const executor = new ThesisExecutor(f.evidenceRef, { summary: 'A thesis.', propositions: [{ propositionId: 'growth', statement: 'Unsupported statement.', propositionType: 'business_driver', basis: 'inference', timeHorizon: 'medium_term', sourceRefs: [] }] })
    const service = new ThesisCreateService({ mountedKnowledgeBaseRoot: f.root, reasoningExecutor: executor, gateway: f.gateway, now: () => NOW })
    const result = await service.create({ workflowRunId: 'thesis-create-unbound', companyRef: f.companyRef, thesisTitle: 'Unbound', narrative: 'A thesis narrative.', evidenceRefs: [f.evidenceRef], asOf: AS_OF })
    assert.equal(result.status, 'blocked')
    assert.match(result.diagnostics.join(';'), /PROPOSITION_EVIDENCE_UNBOUND/)
    assert.equal((await new KnowledgeBaseRegistry().mount(f.root)).revision, before)
  } finally { await f.close() }
})

test('Thesis CREATE fails closed when the reasoning executor is missing', async () => {
  const f = await fixture()
  try {
    const service = new ThesisCreateService({ mountedKnowledgeBaseRoot: f.root, now: () => NOW })
    const result = await service.create({ workflowRunId: 'thesis-create-no-executor', companyRef: f.companyRef, thesisTitle: 'No executor', narrative: 'A thesis narrative.', evidenceRefs: [f.evidenceRef], asOf: AS_OF })
    assert.equal(result.status, 'blocked')
    assert.deepEqual(result.diagnostics, ['THESIS_CREATE_REASONING_EXECUTOR_MISSING'])
  } finally { await f.close() }
})
