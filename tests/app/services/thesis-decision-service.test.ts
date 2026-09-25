import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import test from 'node:test'
import { KnowledgeProductionGateway } from '../../../knowledge/production/gateway.ts'
import { loadReviewDecision } from '../../../knowledge/review/decision-store.ts'
import { persistReviewCases } from '../../../knowledge/review/store.ts'
import { KnowledgeBaseRegistry } from '../../../knowledge/registry/registry.ts'
import { createFreshKnowledgeBaseV04, readCanonicalV04Assets } from '../../../knowledge/storage/index.ts'
import type { NormalizedResearchSource } from '../../../plugins/research-acquisition/contracts.ts'
import { sha256 } from '../../../plugins/research-acquisition/hash.ts'
import { ThesisDecisionService } from '../../../app/services/thesis-decision-service.ts'
import { buildThesisRefreshReviewCases } from '../../../workflows/thesis-lifecycle/review-case-builder.ts'
import { runThesisRefreshAdapter } from '../../../workflows/thesis-lifecycle/refresh-adapter.ts'

const at = '2026-09-24T12:00:00.000Z'
const source: NormalizedResearchSource = {
  candidate: { candidateId: 'decision-evidence', kind: 'official_disclosure', tier: 1, title: 'Quarterly filing', provider: 'fixture', url: 'https://example.test/filing', publishedAt: '2026-09-11T00:00:00.000Z', metadata: { companySymbol: '600519' } },
  retrievedAt: '2026-09-11T00:00:00.000Z', title: 'Quarterly filing', content: 'Verified quarterly evidence.', canonicalUrl: 'https://example.test/filing', contentHash: sha256('Verified quarterly evidence.'), rawBytes: new TextEncoder().encode('Verified quarterly evidence.'), publisher: 'Fixture publisher', rights: { accessScope: 'public', retentionAllowed: true, aiProcessingAllowed: true, derivativeKnowledgeAllowed: true, redistributionAllowed: false },
}

async function fixture(relation: 'weakens' | 'contradicts' = 'weakens', invalidationCase = false) {
  const root = await mkdtemp(join(tmpdir(), 'rhl-thesis-decision-'))
  await createFreshKnowledgeBaseV04(root, { knowledgeBaseId: `kb-thesis-decision-${Date.now()}`, now: '2026-09-01T00:00:00.000Z' })
  const registry = new KnowledgeBaseRegistry()
  const gateway = new KnowledgeProductionGateway(registry)
  const seeded = await gateway.submit({
    handle: await registry.mount(root), producerType: 'fixture_seed', producerRunId: 'thesis-seed',
    schemaProfile: { schemaVersion: '0.4', storageFormatVersion: '1', requiresRawProvenance: true },
    entity: { localKey: 'company', entityType: 'company', name: 'Fixture Company', aliases: ['600519'], semanticFields: { ticker: '600519', exchange: 'SSE' } },
    proposals: [
      { proposalId: 'root-claim', kind: 'claim', claimType: 'viewpoint', subjectKey: 'company', statement: 'Margins expand as utilization improves.', sourceCandidateIds: ['decision-evidence'] },
      { proposalId: 'evidence-claim', kind: 'claim', claimType: 'fact', subjectKey: 'company', statement: 'Gross margin declined in the latest quarter.', sourceCandidateIds: ['decision-evidence'] },
      { proposalId: 'thesis', kind: 'thesis', subjectKey: 'company', thesisTitle: 'Margin recovery', statement: 'Issuer margins recover.', thesisStatus: 'active' },
      { proposalId: 'membership', kind: 'reasoning_edge', sourceProposalId: 'root-claim', targetKey: 'thesis', edgeType: 'qualifies' },
    ],
    evidenceBindings: [{ localSourceId: 'decision-evidence', source }], asOf: '2026-09-11T00:00:00.000Z', now: () => '2026-09-01T00:00:00.000Z',
  })
  assert.equal(seeded.status, 'committed', seeded.errors.join('; '))
  const handle = await registry.mount(root)
  const assets = await readCanonicalV04Assets(root)
  const rootClaimRef = seeded.claimRefsByProposalId['root-claim']!
  const evidenceRef = seeded.claimRefsByProposalId['evidence-claim']!
  const thesisRef = seeded.thesisRefsByProposalId?.thesis as `thesis:${string}`
  const sourceAsset = assets.objects.find((item) => item.kind === 'source')!.value as { id: `source:${string}`; rawRefs: readonly `raw-sha256-${string}`[] }
  const rawRef = sourceAsset.rawRefs[0]!
  const adapterResult = await runThesisRefreshAdapter({ assets, handle, thesisRef, currentAsOf: at, evidenceBindings: [{ evidenceRef, relation, targetClaimRefs: [rootClaimRef], sourceBindings: [{ sourceRef: sourceAsset.id, rawRef }] }] })
  assert.equal(adapterResult.status, 'completed', adapterResult.diagnostics.join('; '))
  const built = buildThesisRefreshReviewCases({ adapterResult, assets, knowledgeBaseId: handle.knowledgeBaseId, producerRunId: 'thesis-review-run', knowledgeBaseRevisionAtCreation: handle.revision, createdAt: at })
  assert.equal(built.status, 'completed', built.diagnostics.join('; '))
  assert.equal(built.cases.length, 1)
  const base = built.cases[0]!
  const cases = ['accept', 'defer', 'stale'].map((suffix) => ({ ...structuredClone(base), reviewCaseId: `${base.reviewCaseId}-${suffix}` }))
  cases[0] = { ...cases[0]!, thesisScope: { ...cases[0]!.thesisScope!, proposedThesisStatus: relation === 'contradicts' ? 'challenged' : 'weakening' } }
  if (invalidationCase) cases[0] = { ...cases[0]!, thesisScope: { ...cases[0]!.thesisScope!, candidateTransition: 'invalidation_condition_met', proposedThesisStatus: 'invalidated', killCriterionAssessments: [{ conditionId: 'kill-margin', status: 'met', targetPropositionRefs: [rootClaimRef], evidenceRefs: [evidenceRef], rationale: 'The sourced margin threshold was met.' }] } }
  const persisted = await persistReviewCases({ rootRef: root, knowledgeBaseId: handle.knowledgeBaseId, producerRunId: 'thesis-review-run', producerType: 'thesis_lifecycle', cases, createdAt: at, schemaVersionAtCreation: '0.4', knowledgeBaseRevisionAtCreation: handle.revision })
  assert.equal(persisted.kind, 'written')
  return { root, gateway, registry, handle, assets, cases, rootClaimRef, thesisRef }
}

test('Thesis decisions use durable intents, Gateway writes, terminal replay, and no-write DEFER/REJECT', async () => {
  const f = await fixture()
  try {
    const before = await readCanonicalV04Assets(f.root)
    const acceptedCase = f.cases[0]!
    const service = new ThesisDecisionService({ mountedKnowledgeBaseRoot: f.root, now: () => at })
    const deferCase = f.cases[1]!
    assert.equal((await service.decide({ reviewCaseId: deferCase.reviewCaseId, decision: 'DEFER', note: 'review later' })).status, 'deferred')
    const deferredReplay = await service.decide({ reviewCaseId: deferCase.reviewCaseId, decision: 'DEFER', note: 'review later' })
    assert.equal(deferredReplay.status, 'deferred')
    assert.equal(deferredReplay.replay, true)
    const updatedDeferral = await service.decide({ reviewCaseId: deferCase.reviewCaseId, decision: 'DEFER', note: 'different note' })
    assert.equal(updatedDeferral.status, 'deferred')
    assert.equal(updatedDeferral.replay, false)
    assert.equal((await service.decide({ reviewCaseId: deferCase.reviewCaseId, decision: 'REJECT', note: 'decline' })).status, 'rejected')
    const rejectedReplay = await service.decide({ reviewCaseId: deferCase.reviewCaseId, decision: 'REJECT', note: 'decline' })
    assert.equal(rejectedReplay.status, 'rejected')
    assert.equal(rejectedReplay.replay, true)
    assert.equal((await service.decide({ reviewCaseId: deferCase.reviewCaseId, decision: 'REJECT', note: 'different rejection' })).status, 'conflict')
    assert.deepEqual((await readCanonicalV04Assets(f.root)).objects.map((item) => item.value.id).sort(), before.objects.map((item) => item.value.id).sort())
    let crashed = false
    const crashing = new ThesisDecisionService({ mountedKnowledgeBaseRoot: f.root, now: () => at, failpoint: (phase) => { if (phase === 'after_writer' && !crashed) { crashed = true; throw new Error('simulated process interruption') } } })
    await assert.rejects(() => crashing.decide({ reviewCaseId: acceptedCase.reviewCaseId, decision: 'ACCEPT', note: 'approve refresh' }), /simulated process interruption/)
    assert.equal((await loadReviewDecision(f.root, acceptedCase.producerRunId, acceptedCase.reviewCaseId))?.state, 'APPLYING')
    const afterWriter = await readCanonicalV04Assets(f.root)
    assert.equal(afterWriter.objects.length, before.objects.length + 1)
    assert.equal((await new ThesisDecisionService({ mountedKnowledgeBaseRoot: f.root, now: () => at }).decide({ reviewCaseId: acceptedCase.reviewCaseId, decision: 'ACCEPT', note: 'different payload' })).status, 'conflict')
    const accepted = await service.decide({ reviewCaseId: acceptedCase.reviewCaseId, decision: 'ACCEPT', note: 'approve refresh' })
    assert.equal(accepted.status, 'accepted')
    assert.equal(accepted.decisionState, 'ACCEPTED')
    assert.equal((await loadReviewDecision(f.root, acceptedCase.producerRunId, acceptedCase.reviewCaseId))?.state, 'ACCEPTED')
    const replay = await service.decide({ reviewCaseId: acceptedCase.reviewCaseId, decision: 'ACCEPT', note: 'approve refresh' })
    assert.equal(replay.status, 'accepted')
    assert.equal(replay.replay, true)
    assert.equal((await service.decide({ reviewCaseId: acceptedCase.reviewCaseId, decision: 'ACCEPT', note: 'different payload' })).status, 'conflict')
    assert.equal((await service.decide({ reviewCaseId: acceptedCase.reviewCaseId, decision: 'REJECT' })).status, 'conflict')

    const staleCase = f.cases[2]!
    const currentHandle = await new KnowledgeBaseRegistry().mount(f.root)
    const statusChange = await new KnowledgeProductionGateway().submit({ handle: currentHandle, producerType: 'fixture_update', producerRunId: 'thesis-archive', schemaProfile: { schemaVersion: '0.4', storageFormatVersion: '1', requiresRawProvenance: true }, entity: { localKey: 'company', entityType: 'company', name: 'Fixture Company', aliases: ['600519'], semanticFields: { ticker: '600519', exchange: 'SSE' }, existingEntityRef: (before.objects.find((item) => item.kind === 'entity')!.value as { id: string }).id }, proposals: [{ proposalId: 'archive-thesis', kind: 'thesis', subjectKey: 'company', thesisTitle: 'Margin recovery', statement: 'Issuer margins recover.', thesisStatus: 'archived' }], evidenceBindings: [], asOf: at, now: () => at })
    assert.equal(statusChange.status, 'committed', statusChange.errors.join('; '))
    assert.equal((await service.decide({ reviewCaseId: staleCase.reviewCaseId, decision: 'ACCEPT' })).status, 'stale')
    assert.equal((await loadReviewDecision(f.root, staleCase.producerRunId, staleCase.reviewCaseId))?.state, 'STALE')
    const final = await readCanonicalV04Assets(f.root)
    assert.equal(final.objects.filter((item) => item.kind === 'reasoning_edge' && item.value.id !== before.objects.find((x) => x.kind === 'reasoning_edge')?.value.id && (item.value as { type: string }).type !== 'qualifies').length, 1)
  } finally { await rm(f.root, { recursive: true, force: true }) }
})

test('possible invalidation applies only a reviewed challenged status and does not invalidate automatically', async () => {
  const f = await fixture('contradicts')
  try {
    assert.equal(f.cases[0]!.thesisScope?.candidateTransition, 'possible_invalidation')
    assert.equal(f.cases[0]!.thesisScope?.proposedThesisStatus, 'challenged')
    const result = await new ThesisDecisionService({ mountedKnowledgeBaseRoot: f.root, now: () => at }).decide({ reviewCaseId: f.cases[0]!.reviewCaseId, decision: 'ACCEPT', note: 'challenge reviewed' })
    assert.equal(result.status, 'accepted', result.errors.join('; '))
    const assets = await readCanonicalV04Assets(f.root)
    const thesis = assets.objects.find((item) => item.kind === 'thesis' && item.value.id === f.thesisRef)?.value as { status: string }
    assert.equal(thesis.status, 'challenged')
  } finally { await rm(f.root, { recursive: true, force: true }) }
})

test('invalidation ACCEPT fails closed when the met assessment has no current canonical criterion binding', async () => {
  const f = await fixture('weakens', true)
  try {
    const before = await readCanonicalV04Assets(f.root)
    const invalidationCase = f.cases[0]!
    const result = await new ThesisDecisionService({ mountedKnowledgeBaseRoot: f.root, now: () => at }).decide({ reviewCaseId: invalidationCase.reviewCaseId, decision: 'ACCEPT', note: 'approve invalidation' })
    assert.equal(result.status, 'stale')
    assert.ok(result.errors.includes('THESIS_DECISION_KILL_CRITERION_CANONICAL_BINDING_UNAVAILABLE'))
    assert.equal((await loadReviewDecision(f.root, invalidationCase.producerRunId, invalidationCase.reviewCaseId))?.state, 'STALE')
    const after = await readCanonicalV04Assets(f.root)
    assert.deepEqual(after.objects.map((item) => item.value.id).sort(), before.objects.map((item) => item.value.id).sort())
    const thesis = after.objects.find((item) => item.kind === 'thesis' && item.value.id === f.thesisRef)?.value as { status: string }
    assert.equal(thesis.status, 'active')
  } finally { await rm(f.root, { recursive: true, force: true }) }
})
