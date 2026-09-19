import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import test from 'node:test'
import { KnowledgeBaseRegistry } from '../../knowledge/registry/registry.ts'
import { createFreshKnowledgeBaseV04, readCanonicalV04Assets } from '../../knowledge/storage/index.ts'
import { KnowledgeProductionGateway } from '../../knowledge/production/gateway.ts'
import type { KnowledgeProductionInput } from '../../knowledge/production/contracts.ts'
import type { NormalizedResearchSource } from '../../plugins/research-acquisition/contracts.ts'
import { buildConsensusSnapshot } from '../../skills/earnings-review/expectations/consensus.ts'
import type { ConsensusSnapshot, EstimatePoint } from '../../skills/earnings-review/expectations/contracts.ts'
import { projectExpectationsKnowledgeV04 } from '../../workflows/earnings-review/expectations-knowledge-v04-projection.ts'

const NOW = '2026-09-19T00:00:00.000Z'
const ANALYSIS_AS_OF = '2026-09-19T00:00:00.000Z'

function source(candidateId = 'estimate-source', content = 'Attributable estimate fixture'): NormalizedResearchSource {
  return { candidate: { candidateId, kind: 'structured_data', tier: 2, title: 'Estimate Fixture', provider: 'fixture', metadata: { companySymbol: '600519', dataKind: 'earnings_estimates', sourceKey: candidateId } }, retrievedAt: NOW, title: 'Estimate Fixture', content, contentHash: 'a'.repeat(64), publisher: 'Fixture Provider', rights: { accessScope: 'public', retentionAllowed: true, aiProcessingAllowed: true, derivativeKnowledgeAllowed: true, redistributionAllowed: false } }
}

function estimate(overrides: Partial<EstimatePoint> = {}): EstimatePoint {
  return { estimateId: 'estimate-a', metric: 'revenue', fiscalPeriod: '2026-FY', value: 100, unit: 'CNY', institutionKey: 'broker-a', publishedAt: '2026-07-01T00:00:00.000Z', sourceCandidateIds: ['estimate-source'], ...overrides }
}

function parties() { return [{ key: 'broker-a', name: 'Broker A Securities', kind: 'institution' as const }] }

function project(overrides: Partial<Parameters<typeof projectExpectationsKnowledgeV04>[0]> = {}) {
  return projectExpectationsKnowledgeV04({ subjectKey: 'company', analysisAsOf: ANALYSIS_AS_OF, estimates: [], consensusSnapshots: [], parties: parties(), ...overrides })
}

async function gatewayInput(root: string, proposals: KnowledgeProductionInput['proposals'], evidence: readonly NormalizedResearchSource[] = [source()], run = 'w2-002-run'): Promise<KnowledgeProductionInput> {
  return { handle: await new KnowledgeBaseRegistry().mount(root), producerType: 'earnings_expectations_projection', producerRunId: run, schemaProfile: { schemaVersion: '0.4', storageFormatVersion: '1', requiresRawProvenance: true }, entity: { localKey: 'company', entityType: 'company', name: 'Fixture Company', aliases: ['600519'], semanticFields: { ticker: '600519', exchange: 'SSE' } }, proposals, evidenceBindings: evidence.map((item) => ({ localSourceId: item.candidate.candidateId, source: item })), asOf: ANALYSIS_AS_OF, now: () => NOW }
}

async function freshRoot(name: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), `rhl-${name}-`))
  await createFreshKnowledgeBaseV04(root, { knowledgeBaseId: `kb-${name}`, now: NOW })
  return root
}

function estimateProposal(result: ReturnType<typeof projectExpectationsKnowledgeV04>, id = 'estimate-a') {
  return result.proposals.find((proposal) => proposal.kind === 'observation' && proposal.observationType === 'estimate' && proposal.proposalId === `estimate-${[...id].map((char) => char.charCodeAt(0).toString(16).padStart(4, '0')).join('')}`)
}

function consensusFrom(estimates: readonly EstimatePoint[], asOf: string): ConsensusSnapshot {
  const result = buildConsensusSnapshot({ estimates, metric: 'revenue', fiscalPeriod: '2026-FY', asOf, minimumCount: 2 })
  assert.ok(result.snapshot)
  return result.snapshot
}

test('T1 EstimatePoint projects to an attributable estimate proposal', () => {
  const result = project({ estimates: [estimate()] })
  const proposal = estimateProposal(result)
  assert.equal(proposal?.observationType, 'estimate')
  assert.equal(proposal?.metricRef, 'metric:revenue')
  assert.equal(proposal?.fiscalPeriod, '2026-FY')
  assert.equal(proposal?.estimateValue, 100)
  assert.equal(proposal?.unit, 'CNY')
  assert.equal(proposal?.institutionKey, 'party-institution-00620072006f006b00650072002d0061')
  assert.equal(proposal?.publishedAt, '2026-07-01T00:00:00.000Z')
  assert.deepEqual(proposal?.sourceCandidateIds, ['estimate-source'])
})

test('T2 unsupported metrics fail closed without changing the registry', () => {
  const result = project({ estimates: [estimate({ metric: 'unsupported_metric' as EstimatePoint['metric'] })] })
  assert.equal(result.proposals.some((proposal) => proposal.observationType === 'estimate'), false)
  assert.ok(result.diagnostics.includes('unregistered_metric:unsupported_metric'))
})

test('T3 unresolved institution and analyst parties fail closed', () => {
  const result = project({ estimates: [estimate({ analystKey: 'analyst-a' })] })
  assert.equal(result.proposals.some((proposal) => proposal.observationType === 'estimate'), false)
  assert.ok(result.diagnostics.includes('institution_binding_missing:estimate-a:broker-a') === false)
  assert.ok(result.diagnostics.includes('analyst_binding_missing:estimate-a:analyst-a'))
  const institutionMissing = project({ parties: [], estimates: [estimate()] })
  assert.ok(institutionMissing.diagnostics.includes('institution_binding_missing:estimate-a:broker-a'))
})

test('T4 future estimates fail the historical projection gate', () => {
  const result = project({ estimates: [estimate({ publishedAt: '2026-09-20T00:00:00.000Z' })] })
  assert.equal(result.proposals.some((proposal) => proposal.observationType === 'estimate'), false)
  assert.ok(result.diagnostics.includes('estimate_outside_analysisAsOf:estimate-a'))
})

test('T5 a valid estimate persists through the Gateway with raw-backed provenance', async () => {
  const root = await freshRoot('estimate-persist')
  try {
    const projected = project({ estimates: [estimate()] })
    const outcome = await new KnowledgeProductionGateway().submit(await gatewayInput(root, projected.proposals))
    assert.equal(outcome.status, 'committed', outcome.errors.join('; '))
    const assets = await readCanonicalV04Assets(root)
    const estimateObject = assets.objects.find((item) => item.kind === 'observation' && (item.value as { observationType?: string }).observationType === 'estimate')?.value as { metricRef: string; estimateValue: number; unit: string; institutionRef: string; publishedAt: string; sourceRef: string; provenance?: readonly { rawRef: string }[] } | undefined
    assert.ok(estimateObject)
    assert.equal(estimateObject.metricRef, 'metric:revenue')
    assert.equal(estimateObject.estimateValue, 100)
    assert.equal(estimateObject.unit, 'CNY')
    assert.match(estimateObject.institutionRef, /^entity:/)
    assert.equal(estimateObject.publishedAt, '2026-07-01T00:00:00.000Z')
    assert.match(estimateObject.sourceRef, /^source:/)
    assert.ok(estimateObject.provenance?.[0]?.rawRef.startsWith('raw-sha256-'))
  } finally { await rm(root, { recursive: true, force: true }) }
})

test('T6 valid explicit revision links persist two historical estimates and revisionOf', async () => {
  const root = await freshRoot('estimate-revision')
  try {
    const oldEstimate = estimate({ estimateId: 'estimate-old', value: 100, publishedAt: '2026-07-01T00:00:00.000Z' })
    const newEstimate = estimate({ estimateId: 'estimate-new', value: 110, publishedAt: '2026-08-01T00:00:00.000Z' })
    const projected = project({ estimates: [newEstimate, oldEstimate], revisionLinks: [{ oldEstimateId: 'estimate-old', newEstimateId: 'estimate-new' }] })
    const outcome = await new KnowledgeProductionGateway().submit(await gatewayInput(root, projected.proposals))
    assert.equal(outcome.status, 'committed', outcome.errors.join('; '))
    const estimates = (await readCanonicalV04Assets(root)).objects.filter((item) => item.kind === 'observation' && (item.value as { observationType?: string }).observationType === 'estimate').map((item) => item.value as { id: string; estimateValue: number; revisionOf?: string })
    assert.equal(estimates.length, 2)
    const oldObject = estimates.find((item) => item.estimateValue === 100)
    const newObject = estimates.find((item) => item.estimateValue === 110)
    assert.ok(oldObject && newObject)
    assert.equal(newObject?.revisionOf, oldObject?.id)
  } finally { await rm(root, { recursive: true, force: true }) }
})

test('T7 invalid revisions are rejected without a revisionOf link', () => {
  const oldEstimate = estimate({ estimateId: 'estimate-old', unit: 'CNY' })
  const newEstimate = estimate({ estimateId: 'estimate-new', unit: 'CNY_million', publishedAt: '2026-08-01T00:00:00.000Z' })
  const result = project({ estimates: [oldEstimate, newEstimate], revisionLinks: [{ oldEstimateId: 'estimate-old', newEstimateId: 'estimate-new' }] })
  const revised = estimateProposal(result, 'estimate-new')
  assert.equal(revised?.revisionOfProposalId, undefined)
  assert.ok(result.diagnostics.includes('invalid_revision_link:estimate-old->estimate-new'))
})

test('T8 exact Estimate replay is idempotent and preserves recordedAt', async () => {
  const root = await freshRoot('estimate-replay')
  try {
    const projected = project({ estimates: [estimate()] })
    const gateway = new KnowledgeProductionGateway()
    const first = await gateway.submit(await gatewayInput(root, projected.proposals, [source()], 'replay-one'))
    assert.equal(first.status, 'committed', first.errors.join('; '))
    const firstEstimate = (await readCanonicalV04Assets(root)).objects.find((item) => item.kind === 'observation' && (item.value as { observationType?: string }).observationType === 'estimate')?.value as { id: string; recordedAt?: string } | undefined
    const second = await gateway.submit(await gatewayInput(root, projected.proposals, [source()], 'replay-two'))
    assert.equal(second.status, 'no_changes', second.errors.join('; '))
    const estimates = (await readCanonicalV04Assets(root)).objects.filter((item) => item.kind === 'observation' && (item.value as { observationType?: string }).observationType === 'estimate').map((item) => item.value as { id: string; recordedAt?: string })
    assert.equal(estimates.length, 1)
    assert.equal(estimates[0]?.id, firstEstimate?.id)
    assert.equal(estimates[0]?.recordedAt, firstEstimate?.recordedAt)
  } finally { await rm(root, { recursive: true, force: true }) }
})

test('T9-T11 consensus projection preserves full statistics and historical asOf', async () => {
  const root = await freshRoot('consensus-persist')
  try {
    const estimates = [estimate({ estimateId: 'estimate-a', value: 100 }), estimate({ estimateId: 'estimate-b', institutionKey: 'broker-b', value: 120 })]
    const snapshot = consensusFrom(estimates, '2026-08-30T00:00:00.000Z')
    const projected = project({ estimates, consensusSnapshots: [snapshot], parties: [...parties(), { key: 'broker-b', name: 'Broker B Securities', kind: 'institution' as const }] })
    const outcome = await new KnowledgeProductionGateway().submit(await gatewayInput(root, projected.proposals))
    assert.equal(outcome.status, 'committed', outcome.errors.join('; '))
    const assets = await readCanonicalV04Assets(root)
    const consensus = assets.objects.find((item) => item.kind === 'observation' && (item.value as { observationType?: string }).observationType === 'consensus')?.value as { asOf: string; mean: number; median?: number; high?: number; low?: number; count: number; dispersion?: number; contributingObservationRefs: string[] } | undefined
    assert.ok(consensus)
    assert.equal(consensus.asOf, '2026-08-30T00:00:00.000Z')
    assert.equal(consensus.mean, snapshot.mean)
    assert.equal(consensus.median, snapshot.median)
    assert.equal(consensus.high, snapshot.high)
    assert.equal(consensus.low, snapshot.low)
    assert.equal(consensus.count, snapshot.count)
    assert.equal(consensus.dispersion, snapshot.dispersion)
    assert.equal(consensus.contributingObservationRefs.length, 2)
    for (const ref of consensus.contributingObservationRefs) assert.equal(assets.objects.find((item) => (item.value as { id?: string }).id === ref)?.value && (assets.objects.find((item) => (item.value as { id?: string }).id === ref)?.value as { observationType?: string }).observationType, 'estimate')
  } finally { await rm(root, { recursive: true, force: true }) }
})

test('T12 separate historical consensus asOf values remain distinct', async () => {
  const root = await freshRoot('consensus-history')
  try {
    const estimates = [estimate({ estimateId: 'estimate-a-old', value: 100 }), estimate({ estimateId: 'estimate-a-new', value: 110, publishedAt: '2026-08-15T00:00:00.000Z' }), estimate({ estimateId: 'estimate-b', institutionKey: 'broker-b', value: 90 })]
    const snapshots = [consensusFrom([estimates[0]!, estimates[2]!], '2026-07-31T00:00:00.000Z'), consensusFrom(estimates.slice(1), '2026-08-31T00:00:00.000Z')]
    const projected = project({ estimates, consensusSnapshots: snapshots, parties: [...parties(), { key: 'broker-b', name: 'Broker B Securities', kind: 'institution' as const }] })
    const outcome = await new KnowledgeProductionGateway().submit(await gatewayInput(root, projected.proposals))
    assert.equal(outcome.status, 'committed', outcome.errors.join('; '))
    const consensus = (await readCanonicalV04Assets(root)).objects.filter((item) => item.kind === 'observation' && (item.value as { observationType?: string }).observationType === 'consensus')
    assert.equal(consensus.length, 2)
    assert.deepEqual(consensus.map((item) => (item.value as { asOf: string }).asOf).sort(), ['2026-07-31T00:00:00.000Z', '2026-08-31T00:00:00.000Z'])
  } finally { await rm(root, { recursive: true, force: true }) }
})

test('T13 inconsistent consensus snapshots fail closed', () => {
  const estimates = [estimate({ estimateId: 'estimate-a', value: 100 }), estimate({ estimateId: 'estimate-b', institutionKey: 'broker-b', value: 120 })]
  const snapshot = consensusFrom(estimates, '2026-08-30T00:00:00.000Z')
  const result = project({ estimates, consensusSnapshots: [{ ...snapshot, mean: snapshot.mean + 1 }], parties: [...parties(), { key: 'broker-b', name: 'Broker B Securities', kind: 'institution' as const }] })
  assert.equal(result.proposals.some((proposal) => proposal.observationType === 'consensus'), false)
  assert.ok(result.diagnostics.includes('consensus_snapshot_inconsistent:revenue:2026-FY:2026-08-30T00:00:00.000Z'))
})

test('T14 mixed contributor units fail closed without conversion', () => {
  const estimates = [estimate({ estimateId: 'estimate-a', value: 100 }), estimate({ estimateId: 'estimate-b', institutionKey: 'broker-b', value: 120, unit: 'CNY_million' })]
  const result = project({ estimates, consensusSnapshots: [{ metric: 'revenue', fiscalPeriod: '2026-FY', unit: 'CNY', asOf: '2026-08-30T00:00:00.000Z', mean: 110, median: 110, high: 120, low: 100, count: 2, dispersion: 10, contributingEstimateIds: ['estimate-a', 'estimate-b'] }], parties: [...parties(), { key: 'broker-b', name: 'Broker B Securities', kind: 'institution' as const }] })
  assert.equal(result.proposals.some((proposal) => proposal.observationType === 'consensus'), false)
  assert.ok(result.diagnostics.includes('consensus_contributor_semantics_invalid:revenue:2026-FY:2026-08-30T00:00:00.000Z'))
})

test('T15 post-asOf consensus contributors fail closed', () => {
  const estimates = [estimate({ estimateId: 'estimate-a', value: 100 }), estimate({ estimateId: 'estimate-b', institutionKey: 'broker-b', value: 120, publishedAt: '2026-09-01T00:00:00.000Z' })]
  const result = project({ estimates, consensusSnapshots: [{ metric: 'revenue', fiscalPeriod: '2026-FY', unit: 'CNY', asOf: '2026-08-30T00:00:00.000Z', mean: 110, median: 110, high: 120, low: 100, count: 2, dispersion: 10, contributingEstimateIds: ['estimate-a', 'estimate-b'] }], parties: [...parties(), { key: 'broker-b', name: 'Broker B Securities', kind: 'institution' as const }] })
  assert.equal(result.proposals.some((proposal) => proposal.observationType === 'consensus'), false)
  assert.ok(result.diagnostics.includes('consensus_contributor_semantics_invalid:revenue:2026-FY:2026-08-30T00:00:00.000Z'))
})

test('T16 report-only comparison and revision outputs are absent from durable proposals', () => {
  const oldEstimate = estimate({ estimateId: 'estimate-old', value: 100 })
  const newEstimate = estimate({ estimateId: 'estimate-new', value: 110, publishedAt: '2026-08-01T00:00:00.000Z' })
  const snapshot = consensusFrom([oldEstimate, estimate({ estimateId: 'estimate-b', institutionKey: 'broker-b', value: 120 })], '2026-08-30T00:00:00.000Z')
  const result = project({ estimates: [oldEstimate, newEstimate, estimate({ estimateId: 'estimate-b', institutionKey: 'broker-b', value: 120 })], consensusSnapshots: [snapshot], revisionLinks: [{ oldEstimateId: 'estimate-old', newEstimateId: 'estimate-new' }], parties: [...parties(), { key: 'broker-b', name: 'Broker B Securities', kind: 'institution' as const }] })
  assert.ok(result.proposals.every((proposal) => proposal.kind === 'entity' || (proposal.kind === 'observation' && (proposal.observationType === 'estimate' || proposal.observationType === 'consensus'))))
  assert.equal(result.proposals.some((proposal) => proposal.kind === 'observation' && proposal.observationType === 'metric'), false)
})

test('T17 projection proposal order and content are input-order independent', () => {
  const estimates = [estimate({ estimateId: 'estimate-a', value: 100 }), estimate({ estimateId: 'estimate-b', institutionKey: 'broker-b', value: 120 })]
  const snapshot = consensusFrom(estimates, '2026-08-30T00:00:00.000Z')
  const first = project({ estimates, consensusSnapshots: [snapshot], parties: [...parties(), { key: 'broker-b', name: 'Broker B Securities', kind: 'institution' as const }] })
  const reversed = project({ estimates: [...estimates].reverse(), consensusSnapshots: [{ ...snapshot, contributingEstimateIds: [...snapshot.contributingEstimateIds].reverse() }], parties: [{ key: 'broker-b', name: 'Broker B Securities', kind: 'institution' as const }, ...parties()] })
  assert.deepEqual(reversed, first)
})

test('T18 source candidate order does not change the Estimate proposal', () => {
  const first = project({ estimates: [estimate({ sourceCandidateIds: ['source-a', 'source-b'] })] })
  const reversed = project({ estimates: [estimate({ sourceCandidateIds: ['source-b', 'source-a'] })] })
  assert.deepEqual(reversed, first)
  assert.deepEqual(first.proposals.find((proposal) => proposal.observationType === 'estimate')?.sourceCandidateIds, ['source-a', 'source-b'])
})

test('T19 source candidate and evidence order does not change the canonical Estimate ID', async () => {
  const firstRoot = await freshRoot('source-order-one')
  const secondRoot = await freshRoot('source-order-two')
  try {
    const firstProjection = project({ estimates: [estimate({ sourceCandidateIds: ['source-a', 'source-b'] })] })
    const secondProjection = project({ estimates: [estimate({ sourceCandidateIds: ['source-b', 'source-a'] })] })
    const firstOutcome = await new KnowledgeProductionGateway().submit(await gatewayInput(firstRoot, firstProjection.proposals, [source('source-a', 'A'), source('source-b', 'B')], 'source-order-one'))
    const secondOutcome = await new KnowledgeProductionGateway().submit(await gatewayInput(secondRoot, secondProjection.proposals, [source('source-b', 'B'), source('source-a', 'A')], 'source-order-two'))
    assert.equal(firstOutcome.status, 'committed', firstOutcome.errors.join('; '))
    assert.equal(secondOutcome.status, 'committed', secondOutcome.errors.join('; '))
    const firstEstimate = (await readCanonicalV04Assets(firstRoot)).objects.find((item) => item.kind === 'observation' && (item.value as { observationType?: string }).observationType === 'estimate')?.value as { id: string } | undefined
    const secondEstimate = (await readCanonicalV04Assets(secondRoot)).objects.find((item) => item.kind === 'observation' && (item.value as { observationType?: string }).observationType === 'estimate')?.value as { id: string } | undefined
    assert.ok(firstEstimate && secondEstimate)
    assert.equal(firstEstimate?.id, secondEstimate?.id)
  } finally { await rm(firstRoot, { recursive: true, force: true }); await rm(secondRoot, { recursive: true, force: true }) }
})

test('T20 an Estimate with one missing declared source fails closed', async () => {
  const root = await freshRoot('missing-source')
  try {
    const projected = project({ estimates: [estimate({ sourceCandidateIds: ['source-a', 'source-b'] })] })
    const outcome = await new KnowledgeProductionGateway().submit(await gatewayInput(root, projected.proposals, [source('source-a', 'A')]))
    assert.ok(outcome.resolutionIntents.some((item) => item.disposition === 'review_required'))
    const estimates = (await readCanonicalV04Assets(root)).objects.filter((item) => item.kind === 'observation' && (item.value as { observationType?: string }).observationType === 'estimate')
    assert.equal(estimates.length, 0)
  } finally { await rm(root, { recursive: true, force: true }) }
})

test('T21 duplicate source candidate IDs are normalized before persistence', async () => {
  const root = await freshRoot('duplicate-source')
  try {
    const projected = project({ estimates: [estimate({ sourceCandidateIds: ['source-a', 'source-a'] })] })
    const proposal = projected.proposals.find((item) => item.observationType === 'estimate')
    assert.deepEqual(proposal?.sourceCandidateIds, ['source-a'])
    const outcome = await new KnowledgeProductionGateway().submit(await gatewayInput(root, projected.proposals, [source('source-a', 'A')]))
    assert.equal(outcome.status, 'committed', outcome.errors.join('; '))
    const estimateObject = (await readCanonicalV04Assets(root)).objects.find((item) => item.kind === 'observation' && (item.value as { observationType?: string }).observationType === 'estimate')?.value as { provenance?: readonly unknown[]; sourceRef?: string } | undefined
    assert.ok(estimateObject)
    assert.equal(estimateObject?.provenance?.length, 1)
    assert.ok(estimateObject?.sourceRef)
  } finally { await rm(root, { recursive: true, force: true }) }
})

test('T22 ambiguous valid revision predecessors fail closed independent of link order', () => {
  const estimates = [
    estimate({ estimateId: 'old-a', value: 100, publishedAt: '2026-07-01T00:00:00.000Z' }),
    estimate({ estimateId: 'old-b', value: 105, publishedAt: '2026-07-02T00:00:00.000Z' }),
    estimate({ estimateId: 'new', value: 110, publishedAt: '2026-08-01T00:00:00.000Z' }),
  ]
  const links = [{ oldEstimateId: 'old-a', newEstimateId: 'new' }, { oldEstimateId: 'old-b', newEstimateId: 'new' }]
  const first = project({ estimates, revisionLinks: links })
  const reversed = project({ estimates: [...estimates].reverse(), revisionLinks: [...links].reverse() })
  const newProposal = first.proposals.find((item) => item.proposalId === `estimate-${[...'new'].map((char) => char.charCodeAt(0).toString(16).padStart(4, '0')).join('')}`)
  assert.equal(newProposal?.revisionOfProposalId, undefined)
  assert.ok(first.diagnostics.includes('ambiguous_revision_target:new'))
  assert.deepEqual(reversed, first)
})

test('T23 exact duplicate revision links deduplicate to one valid lineage', () => {
  const estimates = [estimate({ estimateId: 'old', value: 100 }), estimate({ estimateId: 'new', value: 110, publishedAt: '2026-08-01T00:00:00.000Z' })]
  const result = project({ estimates, revisionLinks: [{ oldEstimateId: 'old', newEstimateId: 'new' }, { oldEstimateId: 'old', newEstimateId: 'new' }] })
  const revised = result.proposals.find((item) => item.proposalId === `estimate-${[...'new'].map((char) => char.charCodeAt(0).toString(16).padStart(4, '0')).join('')}`)
  assert.equal(revised?.revisionOfProposalId, `estimate-${[...'old'].map((char) => char.charCodeAt(0).toString(16).padStart(4, '0')).join('')}`)
  assert.equal(result.diagnostics.some((item) => item.includes('invalid_revision_link')), false)
})

test('T24 institution and analyst with one literal key remain distinct canonical Entities', async () => {
  const root = await freshRoot('party-key-isolation')
  try {
    const projected = project({ parties: [{ key: 'shared-key', name: 'Shared Broker', kind: 'institution' }, { key: 'shared-key', name: 'Shared Analyst', kind: 'analyst' }], estimates: [estimate({ institutionKey: 'shared-key', analystKey: 'shared-key' })] })
    const estimateProposal = projected.proposals.find((item) => item.observationType === 'estimate')
    assert.equal(estimateProposal?.institutionKey, 'party-institution-007300680061007200650064002d006b00650079')
    assert.equal(estimateProposal?.analystKey, 'party-analyst-007300680061007200650064002d006b00650079')
    const outcome = await new KnowledgeProductionGateway().submit(await gatewayInput(root, projected.proposals))
    assert.equal(outcome.status, 'committed', outcome.errors.join('; '))
    const entities = (await readCanonicalV04Assets(root)).objects.filter((item) => item.kind === 'entity').map((item) => item.value as { type?: string; name?: string })
    assert.ok(entities.some((item) => item.type === 'institution' && item.name === 'Shared Broker'))
    assert.ok(entities.some((item) => item.type === 'person' && item.name === 'Shared Analyst'))
  } finally { await rm(root, { recursive: true, force: true }) }
})

async function canonicalValues(root: string): Promise<readonly unknown[]> {
  return (await readCanonicalV04Assets(root)).objects.map((item) => item.value).sort((left, right) => left.id.localeCompare(right.id))
}

test('T25 full projection and canonical persistence are input-order independent', async () => {
  const oldA = estimate({ estimateId: 'old-a', value: 100, publishedAt: '2026-07-01T00:00:00.000Z', sourceCandidateIds: ['source-a', 'source-b'] })
  const newA = estimate({ estimateId: 'new-a', value: 110, publishedAt: '2026-08-01T00:00:00.000Z', sourceCandidateIds: ['source-b', 'source-a'] })
  const oldB = estimate({ estimateId: 'old-b', institutionKey: 'broker-b', value: 90, publishedAt: '2026-07-02T00:00:00.000Z', sourceCandidateIds: ['source-a', 'source-b'] })
  const newB = estimate({ estimateId: 'new-b', institutionKey: 'broker-b', value: 95, publishedAt: '2026-08-02T00:00:00.000Z', sourceCandidateIds: ['source-b', 'source-a'] })
  const snapshotOld = consensusFrom([oldA, oldB], '2026-07-31T00:00:00.000Z')
  const snapshotNew = consensusFrom([newA, newB], '2026-08-31T00:00:00.000Z')
  const partyList = [...parties(), { key: 'broker-b', name: 'Broker B Securities', kind: 'institution' as const }]
  const first = project({ estimates: [newA, newB, oldA, oldB], parties: [...partyList].reverse(), consensusSnapshots: [snapshotNew, snapshotOld], revisionLinks: [{ oldEstimateId: 'old-b', newEstimateId: 'new-b' }, { oldEstimateId: 'old-a', newEstimateId: 'new-a' }] })
  const second = project({ estimates: [oldB, oldA, newB, newA].map((item) => ({ ...item, sourceCandidateIds: [...item.sourceCandidateIds].reverse() })), parties: partyList, consensusSnapshots: [{ ...snapshotOld, contributingEstimateIds: [...snapshotOld.contributingEstimateIds].reverse() }, { ...snapshotNew, contributingEstimateIds: [...snapshotNew.contributingEstimateIds].reverse() }], revisionLinks: [{ oldEstimateId: 'old-a', newEstimateId: 'new-a' }, { oldEstimateId: 'old-b', newEstimateId: 'new-b' }] })
  assert.deepEqual(second, first)
  const firstRoot = await freshRoot('full-order-one')
  const secondRoot = await freshRoot('full-order-two')
  try {
    const firstOutcome = await new KnowledgeProductionGateway().submit(await gatewayInput(firstRoot, first.proposals, [source('source-a', 'A'), source('source-b', 'B')], 'full-order-one'))
    const secondOutcome = await new KnowledgeProductionGateway().submit(await gatewayInput(secondRoot, second.proposals, [source('source-b', 'B'), source('source-a', 'A')], 'full-order-two'))
    assert.equal(firstOutcome.status, 'committed', firstOutcome.errors.join('; '))
    assert.equal(secondOutcome.status, 'committed', secondOutcome.errors.join('; '))
    assert.deepEqual(await canonicalValues(secondRoot), await canonicalValues(firstRoot))
  } finally { await rm(firstRoot, { recursive: true, force: true }); await rm(secondRoot, { recursive: true, force: true }) }
})
