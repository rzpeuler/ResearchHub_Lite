import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createFreshKnowledgeBaseV04, readCanonicalV04Assets } from '../../knowledge/storage/index.ts'
import { KnowledgeBaseRegistry } from '../../knowledge/registry/registry.ts'
import { KnowledgeProductionGateway } from '../../knowledge/production/gateway.ts'
import type { ProductionEvidenceBinding } from '../../knowledge/production/contracts.ts'
import type { NormalizedResearchSource } from '../../plugins/research-acquisition/contracts.ts'
import { formalizeThesis } from '../../skills/thesis_formalize/calculations.ts'
import { createThesisProduction } from '../../workflows/thesis-lifecycle/create-production.ts'

const NOW = '2026-09-24T00:00:00.000Z'
const clock = () => NOW
function source(candidateId: string, publishedAt = '2026-09-23T00:00:00.000Z', overrides: Partial<NormalizedResearchSource> = {}): NormalizedResearchSource {
  return { candidate: { candidateId, kind: 'official_disclosure', tier: 1, title: 'Annual report', provider: 'fixture', publishedAt }, retrievedAt: NOW, title: 'Annual report', content: 'Revenue and capacity details.', contentHash: 'a'.repeat(64), publisher: 'Fixture Exchange', rights: { accessScope: 'public', retentionAllowed: true, aiProcessingAllowed: true, derivativeKnowledgeAllowed: true, redistributionAllowed: false }, ...overrides }
}

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'rhl-thesis-create-'))
  await createFreshKnowledgeBaseV04(root, { knowledgeBaseId: 'kb-thesis-create', now: NOW })
  const handle = await new KnowledgeBaseRegistry().mount(root)
  const gateway = new KnowledgeProductionGateway()
  const company = await gateway.submit({ handle, producerType: 'fixture', producerRunId: 'create-company', schemaProfile: { schemaVersion: '0.4', storageFormatVersion: '1', requiresRawProvenance: true }, entity: { localKey: 'company', entityType: 'company', name: 'Fixture Co', semanticFields: { ticker: '600519', exchange: 'SSE' } }, proposals: [], evidenceBindings: [], now: clock })
  assert.equal(company.status, 'committed')
  return { root, handle: await new KnowledgeBaseRegistry().mount(root), gateway, companyRef: company.entityRefsByLocalKey.company as `entity:${string}` }
}

test('CREATE writes one Thesis, basis-mapped Claims, and qualifies edges through the Gateway', async () => {
  const f = await fixture()
  try {
    const formalization = formalizeThesis({ thesisId: 'fixture-thesis', summary: 'Fixture Co has durable earnings growth.', asOf: NOW, propositions: [
      { propositionId: 'driver', statement: 'Capacity expansion supports durable growth.', propositionType: 'business_driver', basis: 'verified_evidence', timeHorizon: 'medium_term', sourceRefs: ['annual'] },
      { propositionId: 'expectation', statement: 'Earnings are expected to increase.', propositionType: 'earnings_expectation', basis: 'inference', timeHorizon: 'near_term', sourceRefs: ['annual'], dependsOnPropositionRefs: ['driver'] },
      { propositionId: 'risk', statement: 'Input costs may pressure margins.', propositionType: 'risk', basis: 'hypothesis', timeHorizon: 'near_term', sourceRefs: ['annual'] },
    ] })
    const binding: ProductionEvidenceBinding = { localSourceId: 'annual-local', source: source('annual') }
    const result = await createThesisProduction({ handle: f.handle, producerRunId: 'thesis-create-run', thesisTitle: 'Durable earnings growth', formalization, evidenceBindings: [binding], companyEntityRef: f.companyRef, asOf: NOW, now: clock, gateway: f.gateway })
    assert.equal(result.status, 'committed', JSON.stringify(result))
    assert.ok(result.thesisRef)
    assert.equal(Object.keys(result.claimRefsByPropositionRef).length, 3)
    assert.equal(Object.keys(result.qualifiesEdgeRefsByPropositionRef).length, 3)
    const assets = await readCanonicalV04Assets(f.root)
    const thesis = assets.objects.find((item) => item.value.id === result.thesisRef)!.value as { subjectRefs: string[]; statement: string }
    assert.deepEqual(thesis.subjectRefs, [f.companyRef])
    assert.equal(thesis.statement, formalization.summary)
    const claims = Object.entries(result.claimRefsByPropositionRef).map(([prop, ref]) => ({ prop, value: assets.objects.find((item) => item.value.id === ref)!.value as { claimType: string; supportsClaimRefs?: string[]; dependsOnClaimRefs?: string[]; provenance?: unknown[] } }))
    assert.equal(claims.find((item) => item.prop === 'driver')!.value.claimType, 'fact')
    assert.equal(claims.find((item) => item.prop === 'expectation')!.value.claimType, 'forecast')
    assert.equal(claims.find((item) => item.prop === 'risk')!.value.claimType, 'risk')
    assert.deepEqual(claims.find((item) => item.prop === 'expectation')!.value.dependsOnClaimRefs, [result.claimRefsByPropositionRef.driver])
    assert.ok(claims.every((item) => item.value.provenance?.length === 1))
    for (const [prop, edgeRef] of Object.entries(result.qualifiesEdgeRefsByPropositionRef)) {
      const edge = assets.objects.find((item) => item.value.id === edgeRef)!.value as { type: string; sourceRef: string; targetRef: string }
      assert.equal(edge.type, 'qualifies')
      assert.equal(edge.sourceRef, result.claimRefsByPropositionRef[prop])
      assert.equal(edge.targetRef, result.thesisRef)
    }
    assert.equal(assets.objects.filter((item) => item.kind === 'thesis').length, 1)
    const revisionAfterCommit = (await new KnowledgeBaseRegistry().mount(f.root)).revision
    const replay = await createThesisProduction({ handle: await new KnowledgeBaseRegistry().mount(f.root), producerRunId: 'thesis-create-run', thesisTitle: 'Durable earnings growth', formalization, evidenceBindings: [binding], companyEntityRef: f.companyRef, asOf: NOW, now: () => '2026-09-25T00:00:00.000Z', gateway: f.gateway })
    assert.equal(replay.status, 'already_committed', JSON.stringify(replay))
    assert.equal(replay.thesisRef, result.thesisRef)
    assert.deepEqual(replay.claimRefsByPropositionRef, result.claimRefsByPropositionRef)
    assert.deepEqual(replay.qualifiesEdgeRefsByPropositionRef, result.qualifiesEdgeRefsByPropositionRef)
    assert.equal((await new KnowledgeBaseRegistry().mount(f.root)).revision, revisionAfterCommit)
    const conflictingReplay = await createThesisProduction({ handle: await new KnowledgeBaseRegistry().mount(f.root), producerRunId: 'thesis-create-run', thesisTitle: 'Conflicting thesis title', formalization, evidenceBindings: [binding], companyEntityRef: f.companyRef, asOf: NOW, now: () => '2026-09-25T00:00:00.000Z', gateway: f.gateway })
    assert.equal(conflictingReplay.status, 'blocked')
    assert.match(conflictingReplay.diagnostics.join(';'), /REPLAY_CONFLICT/)
    assert.equal((await new KnowledgeBaseRegistry().mount(f.root)).revision, revisionAfterCommit)
    const changedSummary = { ...formalization, summary: 'A different thesis summary.' }
    const conflictingSummary = await createThesisProduction({ handle: await new KnowledgeBaseRegistry().mount(f.root), producerRunId: 'thesis-create-run', thesisTitle: 'Durable earnings growth', formalization: changedSummary, evidenceBindings: [binding], companyEntityRef: f.companyRef, asOf: NOW, now: () => '2026-09-25T00:00:00.000Z', gateway: f.gateway })
    assert.equal(conflictingSummary.status, 'blocked')
    assert.match(conflictingSummary.diagnostics.join(';'), /REPLAY_CONFLICT/)
    const changedSource = { ...binding, source: source('annual', '2026-09-23T00:00:00.000Z', { content: 'Changed source bytes.' }) }
    const conflictingEvidence = await createThesisProduction({ handle: await new KnowledgeBaseRegistry().mount(f.root), producerRunId: 'thesis-create-run', thesisTitle: 'Durable earnings growth', formalization, evidenceBindings: [changedSource], companyEntityRef: f.companyRef, asOf: NOW, now: () => '2026-09-25T00:00:00.000Z', gateway: f.gateway })
    assert.equal(conflictingEvidence.status, 'blocked')
    assert.match(conflictingEvidence.diagnostics.join(';'), /REPLAY_CONFLICT/)
    assert.equal((await new KnowledgeBaseRegistry().mount(f.root)).revision, revisionAfterCommit)
  } finally { await rm(f.root, { recursive: true, force: true }) }
})

test('CREATE blocks when any proposition has no accepted evidence binding', async () => {
  const f = await fixture()
  try {
    const formalization = formalizeThesis({ thesisId: 'missing-evidence', summary: 'A thesis.', asOf: NOW, propositions: [
      { propositionId: 'p1', statement: 'A claim.', propositionType: 'other', basis: 'inference', timeHorizon: 'near_term', sourceRefs: ['not-bound'] },
    ] })
    const result = await createThesisProduction({ handle: f.handle, producerRunId: 'thesis-create-missing', thesisTitle: 'Missing evidence', formalization, evidenceBindings: [], companyEntityRef: f.companyRef, asOf: NOW, now: clock, gateway: f.gateway })
    assert.equal(result.status, 'blocked')
    assert.match(result.diagnostics.join(';'), /SOURCE_BINDING_MISSING/)
    assert.equal((await readCanonicalV04Assets(f.root)).objects.some((item) => item.kind === 'thesis'), false)
  } finally { await rm(f.root, { recursive: true, force: true }) }
})

test('CREATE blocks source evidence published after the strict AsOf boundary', async () => {
  const f = await fixture()
  try {
    const formalization = formalizeThesis({ thesisId: 'future-evidence', summary: 'A thesis.', asOf: NOW, propositions: [
      { propositionId: 'p1', statement: 'A claim.', propositionType: 'other', basis: 'verified_evidence', timeHorizon: 'near_term', sourceRefs: ['future'] },
    ] })
    const result = await createThesisProduction({ handle: f.handle, producerRunId: 'thesis-create-future', thesisTitle: 'Future evidence', formalization, evidenceBindings: [{ localSourceId: 'future', source: source('future', '2026-09-25T00:00:00.000Z') }], companyEntityRef: f.companyRef, asOf: NOW, now: clock, gateway: f.gateway })
    assert.equal(result.status, 'blocked')
    assert.match(result.diagnostics.join(';'), /SOURCE_PIT_INVALID/)
    assert.equal((await readCanonicalV04Assets(f.root)).objects.some((item) => item.kind === 'thesis'), false)
  } finally { await rm(f.root, { recursive: true, force: true }) }
})

test('CREATE blocks when the explicit producer AsOf differs from formalization AsOf', async () => {
  const f = await fixture()
  try {
    const formalization = formalizeThesis({ thesisId: 'asof-mismatch', summary: 'A thesis.', asOf: NOW, propositions: [
      { propositionId: 'p1', statement: 'A claim.', propositionType: 'other', basis: 'verified_evidence', timeHorizon: 'near_term', sourceRefs: ['source-1'] },
    ] })
    const result = await createThesisProduction({ handle: f.handle, producerRunId: 'thesis-create-asof-mismatch', thesisTitle: 'AsOf mismatch', formalization, evidenceBindings: [{ localSourceId: 'source-1', source: source('source-1') }], companyEntityRef: f.companyRef, asOf: '2026-09-23T00:00:00.000Z', now: clock, gateway: f.gateway })
    assert.equal(result.status, 'blocked')
    assert.match(result.diagnostics.join(';'), /AS_OF_MISMATCH/)
    assert.equal((await readCanonicalV04Assets(f.root)).objects.some((item) => item.kind === 'thesis'), false)
  } finally { await rm(f.root, { recursive: true, force: true }) }
})
