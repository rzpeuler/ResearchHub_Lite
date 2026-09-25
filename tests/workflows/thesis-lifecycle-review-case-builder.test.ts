import assert from 'node:assert/strict'
import { test } from 'node:test'
import { archiveRaw } from '../../knowledge/raw/raw-archive.ts'
import type { KnowledgeAssetV04 } from '../../knowledge/schema/domain-v04.ts'
import type { KnowledgeAssetCollectionV04, LoadedAssetV04 } from '../../knowledge/storage/v04-types.ts'
import { KnowledgeBaseRegistry } from '../../knowledge/registry/registry.ts'
import { createKnowledgeBase, removeKnowledgeBase } from '../knowledge/helpers.ts'
import { runThesisRefreshAdapter } from '../../workflows/thesis-lifecycle/refresh-adapter.ts'
import { buildThesisRefreshReviewCases } from '../../workflows/thesis-lifecycle/review-case-builder.ts'
import type { ReviewClaimCandidate } from '../../knowledge/review/contracts.ts'

const loaded = (value: KnowledgeAssetV04, kind: LoadedAssetV04['kind']): LoadedAssetV04 => ({ value, kind, filePath: `${value.id}.json`, storageRef: `${kind}/${value.id}.json` })

async function fixture() {
  const root = await createKnowledgeBase({ schemaVersion: '0.4', knowledgeBaseId: 'kb-thesis-review' })
  const handle = await new KnowledgeBaseRegistry().mount(root)
  const raw = await archiveRaw(handle, { bytes: Buffer.from('accepted published filing'), originalFilename: 'filing.txt', mediaType: 'text/plain' }, { clock: () => '2026-04-01T00:00:00.000Z' })
  const thesis = { id: 'thesis:case', subjectRefs: ['entity:issuer'], title: 'Growth thesis', statement: 'Issuer grows', status: 'active', createdAt: '2026-01-01T00:00:00.000Z', lastReviewedAt: '2026-03-01T00:00:00.000Z', lifecycle: { status: 'active' } } as unknown as KnowledgeAssetV04
  const issuer = { id: 'entity:issuer', type: 'company', name: 'Example Issuer', aliases: [], lifecycle: { status: 'active' } } as unknown as KnowledgeAssetV04
  const division = { id: 'entity:division', type: 'company', name: 'Example Division', aliases: [], lifecycle: { status: 'active' } } as unknown as KnowledgeAssetV04
  const claimSubject = { id: 'relation:division-of', type: 'upstream_of', sourceRef: 'entity:issuer', targetRef: 'entity:division', lifecycle: { status: 'active' } } as unknown as KnowledgeAssetV04
  const claim = { id: 'claim:margin', claimType: 'viewpoint', statement: 'Margins expand as utilization improves.', subjectRefs: ['relation:division-of'], sourceRefs: [], lifecycle: { status: 'active' } } as unknown as KnowledgeAssetV04
  const source = { id: 'source:filing', title: 'Accepted filing', sourceType: 'document', publishedAt: '2026-04-01T00:00:00.000Z', rawRefs: [raw.manifest.rawRef], rights: { accessScope: 'public', providerTermsKnown: false, retentionAllowed: true, aiProcessingAllowed: true, derivativeKnowledgeAllowed: true }, usagePolicy: { mode: 'personal_noncommercial_research', retainRaw: true, allowAiProcessing: true, allowDerivedKnowledge: true, redistributionAllowed: false }, lifecycle: { status: 'active' } } as unknown as KnowledgeAssetV04
  const observation = { id: 'observation:margin', observationType: 'metric', subjectRef: 'entity:issuer', metricRef: 'gross_margin', value: 0.3, unit: 'ratio', period: '2026-Q1', sourceRef: 'source:filing', provenance: [{ sourceRef: 'source:filing', rawRef: raw.manifest.rawRef, locator: 'page 2' }], lifecycle: { status: 'active' } } as unknown as KnowledgeAssetV04
  const membership = { id: 'reasoning-edge:membership', type: 'qualifies', sourceRef: 'claim:margin', targetRef: 'thesis:case', lifecycle: { status: 'active' } } as unknown as KnowledgeAssetV04
  const values = [thesis, issuer, division, claimSubject, claim, source, observation, membership]
  const kinds: LoadedAssetV04['kind'][] = ['thesis', 'entity', 'entity', 'relation', 'claim', 'source', 'observation', 'reasoning_edge']
  const assets: KnowledgeAssetCollectionV04 = { rootDir: root, objects: values.map((value, index) => loaded(value, kinds[index]!)), registry: [] }
  const adapterResult = await runThesisRefreshAdapter({ assets, handle, thesisRef: 'thesis:case', currentAsOf: '2026-09-01T00:00:00.000Z', evidenceBindings: [{ evidenceRef: 'observation:margin', relation: 'weakens', targetClaimRefs: ['claim:margin'], sourceBindings: [{ sourceRef: 'source:filing', rawRef: raw.manifest.rawRef }], basis: 'verified_evidence' }] })
  return { root, assets, adapterResult }
}

test('thesis refresh ReviewCase builder preserves canonical Claim subjects when they differ from the Thesis subjects', async () => {
  const f = await fixture()
  try {
    const input = { adapterResult: f.adapterResult, assets: f.assets, knowledgeBaseId: 'kb-thesis-review', producerRunId: 'thesis-run-1', knowledgeBaseRevisionAtCreation: 0, createdAt: '2026-09-24T12:00:00.000Z' }
    const result = buildThesisRefreshReviewCases(input)
    assert.equal(result.status, 'completed')
    assert.equal(result.cases.length, 1)
    const reviewCase = result.cases[0]!
    assert.equal(reviewCase.producerType, 'thesis_lifecycle')
    assert.equal(reviewCase.rootProposal.proposalKind, 'claim')
    const semanticPayload = reviewCase.rootProposal.semanticPayload as ReviewClaimCandidate
    assert.deepEqual(semanticPayload.subjectRefs, [{ candidateRef: 'relation:division-of', mention: 'Example Issuer upstream_of Example Division' }])
    assert.deepEqual(semanticPayload.evidenceBlockRefs, [])
    assert.deepEqual(reviewCase.rootProposal.evidenceBindings, [{ kind: 'canonical_research_evidence', sourceRef: 'source:filing', rawRef: f.adapterResult.evidenceLineage[0]!.sourceBindings[0]!.rawRef, evidenceRef: 'observation:margin' }])
    assert.deepEqual(reviewCase.thesisScope?.reviewedEvidence, [{ evidenceRef: 'observation:margin', relation: 'weakens', targetClaimRefs: ['claim:margin'] }])
    assert.deepEqual(reviewCase.thesisScope?.affectedClaimRefs, ['claim:margin'])
    assert.equal(reviewCase.thesisScope?.rootClaimRef, 'claim:margin')
    assert.equal(reviewCase.thesisScope?.proposedThesisStatus, 'weakening')
    assert.deepEqual(reviewCase.impact, { dependentProposalCount: 0, affectedProposalRefs: [] })
    assert.deepEqual(buildThesisRefreshReviewCases(input).cases.map((item) => item.reviewCaseId), [reviewCase.reviewCaseId])
  } finally { await removeKnowledgeBase(f.root) }
})

test('thesis refresh builder emits one aggregate case for multiple changed Claims', async () => {
  const f = await fixture()
  try {
    const secondClaim = { id: 'claim:utilization', claimType: 'viewpoint', statement: 'Utilization improves.', subjectRefs: ['entity:issuer'], sourceRefs: [], lifecycle: { status: 'active' } } as unknown as KnowledgeAssetV04
    const assets: KnowledgeAssetCollectionV04 = { ...f.assets, objects: [...f.assets.objects, loaded(secondClaim, 'claim')] }
    const adapterResult = structuredClone(f.adapterResult) as typeof f.adapterResult
    const changed = adapterResult.refresh!.propositionDeltas.find((delta) => delta.propositionRef === 'claim:margin')!
    const secondDelta = { ...changed, propositionRef: 'claim:utilization', rationale: 'New evidence weakens utilization.' }
    const altered = {
      ...adapterResult,
      priorSnapshot: { ...adapterResult.priorSnapshot!, propositions: [...adapterResult.priorSnapshot!.propositions, { propositionId: 'claim:utilization', statement: 'Utilization improves.' }] },
      refresh: { ...adapterResult.refresh!, propositionDeltas: [...adapterResult.refresh!.propositionDeltas, secondDelta] },
      evidenceLineage: adapterResult.evidenceLineage.map((item) => item.decision === 'included' ? { ...item, targetClaimRefs: ['claim:margin', 'claim:utilization'] } : item),
    }
    const result = buildThesisRefreshReviewCases({ adapterResult: altered, assets, knowledgeBaseId: 'kb-thesis-review', producerRunId: 'thesis-run-aggregate', knowledgeBaseRevisionAtCreation: 0, createdAt: '2026-09-24T12:00:00.000Z' })
    assert.equal(result.status, 'completed')
    assert.equal(result.cases.length, 1)
    assert.equal(result.cases[0]?.thesisScope?.rootClaimRef, 'claim:margin')
    assert.deepEqual(result.cases[0]?.thesisScope?.affectedClaimRefs, ['claim:margin', 'claim:utilization'])
    assert.equal(result.cases[0]?.thesisScope?.proposedThesisStatus, 'weakening')
  } finally { await removeKnowledgeBase(f.root) }
})

test('thesis refresh builder blocks invalidation when no canonical kill criterion source can be revalidated', async () => {
  const f = await fixture()
  try {
    const adapterResult = structuredClone(f.adapterResult) as typeof f.adapterResult
    const altered = {
      ...adapterResult,
      refresh: {
        ...adapterResult.refresh!,
        candidateTransition: 'invalidation_condition_met' as const,
        killCriterionAssessments: [{ conditionId: 'margin-below-floor', status: 'met' as const, targetPropositionRefs: ['claim:margin'], evidenceRefs: ['observation:margin'], rationale: 'Observed gross margin below the explicit 0.35 threshold.' }],
      },
    }
    const result = buildThesisRefreshReviewCases({ adapterResult: altered, assets: f.assets, knowledgeBaseId: 'kb-thesis-review', producerRunId: 'thesis-run-kill', knowledgeBaseRevisionAtCreation: 0, createdAt: '2026-09-24T12:00:00.000Z' })
    assert.equal(result.status, 'blocked')
    assert.deepEqual(result.diagnostics, ['THESIS_REVIEW_KILL_CRITERION_SOURCE_UNAVAILABLE'])
    assert.deepEqual(result.cases, [])
  } finally { await removeKnowledgeBase(f.root) }
})

test('thesis refresh ReviewCase builder fails closed when a review delta has no verified canonical Source/Raw binding', async () => {
  const f = await fixture()
  try {
    const unbound = structuredClone(f.adapterResult) as typeof f.adapterResult
    const altered = { ...unbound, evidenceLineage: unbound.evidenceLineage.map((item) => ({ ...item, sourceBindings: [] })) }
    const result = buildThesisRefreshReviewCases({ adapterResult: altered, assets: f.assets, knowledgeBaseId: 'kb-thesis-review', producerRunId: 'thesis-run-1', knowledgeBaseRevisionAtCreation: 0, createdAt: '2026-09-24T12:00:00.000Z' })
    assert.equal(result.status, 'blocked')
    assert.deepEqual(result.diagnostics, ['REVIEW_EVIDENCE_BINDING_UNAVAILABLE'])
    assert.deepEqual(result.cases, [])
  } finally { await removeKnowledgeBase(f.root) }
})

test('thesis refresh ReviewCase builder rejects the legacy thesis Claim type before casting', async () => {
  const f = await fixture()
  try {
    const assets: KnowledgeAssetCollectionV04 = { ...f.assets, objects: f.assets.objects.map((item) => item.value.id === 'claim:margin' ? loaded({ ...(item.value as unknown as Record<string, unknown>), claimType: 'thesis' } as unknown as KnowledgeAssetV04, 'claim') : item) }
    const result = buildThesisRefreshReviewCases({ adapterResult: f.adapterResult, assets, knowledgeBaseId: 'kb-thesis-review', producerRunId: 'thesis-run-1', knowledgeBaseRevisionAtCreation: 0, createdAt: '2026-09-24T12:00:00.000Z' })
    assert.equal(result.status, 'blocked')
    assert.deepEqual(result.diagnostics, ['THESIS_REVIEW_CLAIM_TYPE_UNSUPPORTED'])
  } finally { await removeKnowledgeBase(f.root) }
})
