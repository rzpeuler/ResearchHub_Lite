import assert from 'node:assert/strict'
import { test } from 'node:test'
import { archiveRaw } from '../../knowledge/raw/raw-archive.ts'
import type { KnowledgeAssetCollectionV04, LoadedAssetV04 } from '../../knowledge/storage/v04-types.ts'
import { KnowledgeBaseRegistry } from '../../knowledge/registry/registry.ts'
import { createKnowledgeBase, removeKnowledgeBase } from '../knowledge/helpers.ts'
import { runThesisRefreshAdapter } from '../../workflows/thesis-lifecycle/refresh-adapter.ts'
import { collectThesisRefreshCandidates } from '../../app/services/thesis-lifecycle-service.ts'
import type { KnowledgeAssetV04 } from '../../knowledge/schema/domain-v04.ts'

const asLoaded = (value: KnowledgeAssetV04, kind: LoadedAssetV04['kind']): LoadedAssetV04 => ({ value, kind, filePath: `${value.id}.json`, storageRef: `${kind}/${value.id}.json` })

export async function createThesisRefreshAdapterFixture() {
  const root = await createKnowledgeBase({ schemaVersion: '0.4', knowledgeBaseId: 'kb-thesis-refresh' })
  const handle = await new KnowledgeBaseRegistry().mount(root)
  const raw = await archiveRaw(handle, { bytes: Buffer.from('published research evidence'), originalFilename: 'evidence.txt', mediaType: 'text/plain' }, { clock: () => '2026-04-01T00:00:00.000Z' })
  const thesis = { id: 'thesis:case', subjectRefs: ['entity:issuer'], title: 'Growth thesis', statement: 'Issuer grows', status: 'active', createdAt: '2026-01-01T00:00:00.000Z', lastReviewedAt: '2026-03-01T00:00:00.000Z', lifecycle: { status: 'active' } } as KnowledgeAssetV04
  const entity = { id: 'entity:issuer', type: 'company', name: 'Example Issuer', aliases: [], lifecycle: { status: 'active' } } as unknown as KnowledgeAssetV04
  const claim = { id: 'claim:proposition', claimType: 'viewpoint', statement: 'Margins expand', subjectRefs: ['entity:issuer'], sourceRefs: ['source:report'], provenance: [{ sourceRef: 'source:report', rawRef: raw.manifest.rawRef, locator: null, chunkRef: null }], lifecycle: { status: 'active' }, createdAt: '2026-01-01T00:00:00.000Z' } as unknown as KnowledgeAssetV04
  const source = { id: 'source:report', title: 'Research report', sourceType: 'document', publishedAt: '2026-04-01T00:00:00.000Z', providerTermsKnown: false, rawRefs: [raw.manifest.rawRef], rights: { accessScope: 'public', providerTermsKnown: false, retentionAllowed: true, aiProcessingAllowed: true, derivativeKnowledgeAllowed: true }, usagePolicy: { mode: 'personal_noncommercial_research', retainRaw: true, allowAiProcessing: true, allowDerivedKnowledge: true, redistributionAllowed: false }, lifecycle: { status: 'active' } } as unknown as KnowledgeAssetV04
  const observation = { id: 'observation:margin', observationType: 'metric', subjectRef: 'entity:issuer', metricRef: 'gross_margin', value: 0.42, unit: 'ratio', period: '2026-Q1', sourceRef: 'source:report', provenance: [{ sourceRef: 'source:report', rawRef: raw.manifest.rawRef, locator: 'page 2' }], reportedAt: '2026-04-01T00:00:00.000Z', lifecycle: { status: 'active' } } as unknown as KnowledgeAssetV04
  const membership = { id: 'reasoning-edge:qualifies', type: 'qualifies', sourceRef: 'claim:proposition', targetRef: 'thesis:case', lifecycle: { status: 'active' } } as unknown as KnowledgeAssetV04
  const values = [thesis, entity, claim, source, observation, membership]
  const kinds: LoadedAssetV04['kind'][] = ['thesis', 'entity', 'claim', 'source', 'observation', 'reasoning_edge']
  const assets: KnowledgeAssetCollectionV04 = { rootDir: root, objects: values.map((value, index) => asLoaded(value, kinds[index]!)), registry: [] }
  return { root, handle, assets, rawRef: raw.manifest.rawRef }
}

test('REFRESH adapter reconstructs active qualifies membership and verifies explicit evidence lineage', async () => {
  const f = await createThesisRefreshAdapterFixture()
  try {
    const result = await runThesisRefreshAdapter({
      assets: f.assets,
      handle: f.handle,
      thesisRef: 'thesis:case',
      currentAsOf: '2026-09-01T00:00:00.000Z',
      evidenceBindings: [{ evidenceRef: 'observation:margin', relation: 'supports', targetClaimRefs: ['claim:proposition'], sourceBindings: [{ sourceRef: 'source:report', rawRef: f.rawRef }], basis: 'verified_evidence' }],
    })
    assert.equal(result.status, 'completed')
    assert.deepEqual(result.priorSnapshot?.propositions.map((item) => item.propositionId), ['claim:proposition'])
    assert.equal(result.refresh?.propositionDeltas[0]?.propositionRef, 'claim:proposition')
    assert.equal(result.refresh?.propositionDeltas[0]?.previousStatus, 'unknown')
    assert.equal(result.evidenceLineage[0]?.decision, 'included')
    assert.deepEqual(result.evidenceLineage[0]?.sourceBindings, [{ sourceRef: 'source:report', rawRef: f.rawRef }])
  } finally { await removeKnowledgeBase(f.root) }
})

test('REFRESH adapter excludes future, unknown-publication, and unbound evidence with explicit lineage', async () => {
  const f = await createThesisRefreshAdapterFixture()
  try {
    const source = f.assets.objects.find((item) => item.value.id === 'source:report')!.value as Record<string, unknown>
    const observation = f.assets.objects.find((item) => item.value.id === 'observation:margin')!.value as Record<string, unknown>
    const unknownSource = { ...source, id: 'source:unknown', publishedAt: null } as unknown as KnowledgeAssetV04
    const futureSource = { ...source, id: 'source:future', publishedAt: '2027-01-01T00:00:00.000Z' } as unknown as KnowledgeAssetV04
    const unknown = { ...observation, id: 'observation:unknown', sourceRef: 'source:unknown', provenance: [{ sourceRef: 'source:unknown', rawRef: f.rawRef, locator: 'page 2' }] } as unknown as KnowledgeAssetV04
    const future = { ...observation, id: 'observation:future', sourceRef: 'source:future', provenance: [{ sourceRef: 'source:future', rawRef: f.rawRef, locator: 'page 2' }] } as unknown as KnowledgeAssetV04
    const inactive = { ...(f.assets.objects.find((item) => item.value.id === 'observation:margin')!.value as Record<string, unknown>), id: 'observation:inactive', lifecycle: { status: 'superseded' } } as unknown as KnowledgeAssetV04
    const estimate = { ...observation, id: 'observation:estimate', observationType: 'estimate', publishedAt: '2026-05-01T00:00:00.000Z', fiscalPeriod: '2026-Q2', estimateValue: 12, institutionRef: 'entity:broker' } as unknown as KnowledgeAssetV04
    const assets: KnowledgeAssetCollectionV04 = { ...f.assets, objects: [...f.assets.objects, asLoaded(unknownSource, 'source'), asLoaded(futureSource, 'source'), asLoaded(unknown, 'observation'), asLoaded(future, 'observation'), asLoaded(inactive, 'observation'), asLoaded(estimate, 'observation')] }
    const result = await runThesisRefreshAdapter({
      assets,
      handle: f.handle,
      thesisRef: 'thesis:case',
      currentAsOf: '2026-09-01T00:00:00.000Z',
      evidenceBindings: [
        { evidenceRef: 'observation:unknown', relation: 'supports', targetClaimRefs: ['claim:proposition'], sourceBindings: [{ sourceRef: 'source:unknown', rawRef: f.rawRef }] },
        { evidenceRef: 'observation:future', relation: 'supports', targetClaimRefs: ['claim:proposition'], sourceBindings: [{ sourceRef: 'source:future', rawRef: f.rawRef }] },
        { evidenceRef: 'observation:margin', relation: 'supports', targetClaimRefs: ['claim:proposition'], sourceBindings: [] },
        { evidenceRef: 'observation:inactive', relation: 'supports', targetClaimRefs: ['claim:proposition'], sourceBindings: [{ sourceRef: 'source:report', rawRef: f.rawRef }] },
        { evidenceRef: 'observation:margin', relation: 'supports', targetClaimRefs: ['claim:proposition'], sourceBindings: [{ sourceRef: 'source:report', rawRef: 'raw-sha256-0000000000000000000000000000000000000000000000000000000000000000' }] },
        { evidenceRef: 'observation:estimate', relation: 'supports', targetClaimRefs: ['claim:proposition'], sourceBindings: [{ sourceRef: 'source:report', rawRef: f.rawRef }] },
      ],
    })
    assert.equal(result.status, 'completed')
    assert.deepEqual(result.evidenceLineage.map((item) => item.reason), ['EVIDENCE_PUBLICATION_UNKNOWN', 'EVIDENCE_PUBLICATION_FUTURE', 'EVIDENCE_SOURCE_BINDING_MISSING', 'EVIDENCE_REF_INACTIVE', 'EVIDENCE_BINDING_AMBIGUOUS', 'EVIDENCE_PUBLICATION_BINDING_MISMATCH'])
    assert.deepEqual(result.refresh?.propositionDeltas, [])
  } finally { await removeKnowledgeBase(f.root) }
})

test('REFRESH adapter rejects sources outside lifecycle and rights validity intervals', async () => {
  const f = await createThesisRefreshAdapterFixture()
  try {
    const source = f.assets.objects.find((item) => item.value.id === 'source:report')!.value as Record<string, unknown>
    const observation = f.assets.objects.find((item) => item.value.id === 'observation:margin')!.value as Record<string, unknown>
    const expired = { ...source, id: 'source:expired', lifecycle: { status: 'active', validUntil: '2026-08-31T23:59:59.000Z' } } as unknown as KnowledgeAssetV04
    const malformed = { ...source, id: 'source:malformed', rights: { ...(source.rights as object), expiresAt: 'tomorrow' } } as unknown as KnowledgeAssetV04
    const future = { ...source, id: 'source:future-valid', lifecycle: { status: 'active', validFrom: '2026-10-01T00:00:00.000Z' } } as unknown as KnowledgeAssetV04
    const cloneObservation = (id: string, sourceRef: string) => ({ ...observation, id, sourceRef, provenance: [{ sourceRef, rawRef: (observation.provenance as { rawRef: string }[])[0]!.rawRef }] }) as unknown as KnowledgeAssetV04
    const expiredObservation = cloneObservation('observation:expired-source', 'source:expired')
    const malformedObservation = cloneObservation('observation:malformed-source', 'source:malformed')
    const futureObservation = cloneObservation('observation:future-source', 'source:future-valid')
    const assets: KnowledgeAssetCollectionV04 = { ...f.assets, objects: [...f.assets.objects, asLoaded(expired, 'source'), asLoaded(malformed, 'source'), asLoaded(future, 'source'), asLoaded(expiredObservation, 'observation'), asLoaded(malformedObservation, 'observation'), asLoaded(futureObservation, 'observation')] }
    const result = await runThesisRefreshAdapter({ assets, handle: f.handle, thesisRef: 'thesis:case', currentAsOf: '2026-09-01T00:00:00.000Z', evidenceBindings: [
      { evidenceRef: 'observation:expired-source', relation: 'supports', targetClaimRefs: ['claim:proposition'], sourceBindings: [{ sourceRef: 'source:expired', rawRef: f.rawRef }] },
      { evidenceRef: 'observation:malformed-source', relation: 'supports', targetClaimRefs: ['claim:proposition'], sourceBindings: [{ sourceRef: 'source:malformed', rawRef: f.rawRef }] },
      { evidenceRef: 'observation:future-source', relation: 'supports', targetClaimRefs: ['claim:proposition'], sourceBindings: [{ sourceRef: 'source:future-valid', rawRef: f.rawRef }] },
    ] })
    assert.deepEqual(result.evidenceLineage.map((item) => item.reason), ['EVIDENCE_SOURCE_INELIGIBLE', 'EVIDENCE_SOURCE_INELIGIBLE', 'EVIDENCE_SOURCE_INELIGIBLE'])
    assert.deepEqual(result.refresh?.propositionDeltas, [])
    for (const evidenceRef of ['observation:expired-source', 'observation:malformed-source', 'observation:future-source']) {
      const collected = await collectThesisRefreshCandidates({ assets, handle: f.handle, companyRef: 'entity:issuer', priorAsOf: '2026-03-01T00:00:00.000Z', asOf: '2026-09-01T00:00:00.000Z', activeClaimRefs: new Set(['claim:proposition']), selectedRefs: [evidenceRef] })
      assert.equal(collected.explicitSelectionInvalid, true)
      assert.equal(collected.decisions[0]?.reason, 'EVIDENCE_SOURCE_INELIGIBLE')
    }
  } finally { await removeKnowledgeBase(f.root) }
})

test('REFRESH candidate collection blocks automatic selection when more than 80 verified candidates qualify', async () => {
  const f = await createThesisRefreshAdapterFixture()
  try {
    const source = f.assets.objects.find((item) => item.value.id === 'source:report')!.value as Record<string, unknown>
    const observation = f.assets.objects.find((item) => item.value.id === 'observation:margin')!.value as Record<string, unknown>
    const extras: LoadedAssetV04[] = []
    for (let index = 0; index < 81; index++) {
      const sourceRef = `source:bulk-${index}`
      const evidenceRef = `observation:bulk-${index}`
      extras.push(asLoaded({ ...source, id: sourceRef } as unknown as KnowledgeAssetV04, 'source'))
      extras.push(asLoaded({ ...observation, id: evidenceRef, sourceRef, provenance: [{ sourceRef, rawRef: f.rawRef, locator: 'section 1' }] } as unknown as KnowledgeAssetV04, 'observation'))
    }
    const assets: KnowledgeAssetCollectionV04 = { ...f.assets, objects: [...f.assets.objects, ...extras] }
    const result = await collectThesisRefreshCandidates({ assets, handle: f.handle, companyRef: 'entity:issuer', priorAsOf: '2026-03-01T00:00:00.000Z', asOf: '2026-09-01T00:00:00.000Z', activeClaimRefs: new Set(['claim:proposition']) })
    assert.equal(result.limitExceeded, true)
    assert.equal(result.candidates.length, 0)
    assert.equal(result.decisions.filter((item) => item.reason === 'EVIDENCE_LIMIT_EXCEEDED').length, 82)
    assert.ok(result.diagnostics.includes('EVIDENCE_LIMIT_EXCEEDED'))
  } finally { await removeKnowledgeBase(f.root) }
})

test('REFRESH adapter fails closed on ambiguous active proposition membership', async () => {
  const f = await createThesisRefreshAdapterFixture()
  try {
    const edge = { id: 'reasoning-edge:duplicate', type: 'qualifies', sourceRef: 'claim:proposition', targetRef: 'thesis:case', lifecycle: { status: 'active' } } as unknown as KnowledgeAssetV04
    const assets: KnowledgeAssetCollectionV04 = { ...f.assets, objects: [...f.assets.objects, asLoaded(edge, 'reasoning_edge')] }
    const result = await runThesisRefreshAdapter({ assets, handle: f.handle, thesisRef: 'thesis:case', currentAsOf: '2026-09-01T00:00:00.000Z', evidenceBindings: [] })
    assert.equal(result.status, 'blocked')
    assert.ok(result.diagnostics.includes('THESIS_REFRESH_MEMBERSHIP_AMBIGUOUS'))
  } finally { await removeKnowledgeBase(f.root) }
})

test('REFRESH adapter blocks inconsistent active qualifies edges to inactive Claims', async () => {
  const f = await createThesisRefreshAdapterFixture()
  try {
    const claim = { ...(f.assets.objects.find((item) => item.value.id === 'claim:proposition')!.value as Record<string, unknown>), lifecycle: { status: 'superseded' } } as unknown as KnowledgeAssetV04
    const assets: KnowledgeAssetCollectionV04 = { ...f.assets, objects: f.assets.objects.map((item) => item.value.id === claim.id ? asLoaded(claim, 'claim') : item) }
    const result = await runThesisRefreshAdapter({ assets, handle: f.handle, thesisRef: 'thesis:case', currentAsOf: '2026-09-01T00:00:00.000Z', evidenceBindings: [] })
    assert.equal(result.status, 'blocked')
    assert.ok(result.diagnostics.includes('THESIS_REFRESH_MEMBERSHIP_INACTIVE_CLAIM'))
  } finally { await removeKnowledgeBase(f.root) }
})
