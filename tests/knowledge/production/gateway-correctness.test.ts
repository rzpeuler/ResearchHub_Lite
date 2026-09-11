import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { KnowledgeBaseRegistry } from '../../../knowledge/registry/registry.ts'
import { createFreshKnowledgeBaseV04, readCanonicalV04Assets } from '../../../knowledge/storage/index.ts'
import { KnowledgeProductionGateway } from '../../../knowledge/production/gateway.ts'
import type { KnowledgeProductionInput } from '../../../knowledge/production/contracts.ts'
import type { NormalizedResearchSource } from '../../../plugins/research-acquisition/contracts.ts'
import { validateUsableAcquisitionPayload } from '../../../plugins/research-acquisition/payload-validation.ts'
import { listReviewCases } from '../../../knowledge/review/store.ts'

const clock = () => '2026-09-08T00:00:00.000Z'
function source(symbol: string, candidateId = `structured-${symbol}`, value = 'same bytes'): NormalizedResearchSource { return { candidate: { candidateId, kind: 'structured_data', tier: 2, title: 'Financial fixture', provider: 'akshare', metadata: { companySymbol: symbol, dataKind: 'financial', period: 'FY2027' } }, retrievedAt: clock(), title: 'Financial fixture', content: value, contentHash: 'a'.repeat(64), publisher: 'AKShare', rights: { accessScope: 'public', retentionAllowed: true, aiProcessingAllowed: true, derivativeKnowledgeAllowed: true, redistributionAllowed: false } } }
async function input(root: string, run: string, symbol = '600519', proposals: KnowledgeProductionInput['proposals'] = [], evidence: readonly NormalizedResearchSource[] = [source(symbol)]): Promise<KnowledgeProductionInput> { return { handle: await new KnowledgeBaseRegistry().mount(root), producerType: 'company_deep_research', producerRunId: run, schemaProfile: { schemaVersion: '0.4', storageFormatVersion: '1', requiresRawProvenance: true }, entity: { localKey: 'company', entityType: 'company', name: symbol, aliases: [symbol], semanticFields: { ticker: symbol, exchange: symbol.startsWith('6') ? 'SSE' : 'SZSE' } }, proposals, evidenceBindings: evidence.map((item) => ({ localSourceId: item.candidate.candidateId, source: item })), asOf: '2026-09-08T00:00:00.000Z', now: clock } }
function claim(proposalId: string, value: unknown, temporal?: unknown, resolution?: 'supersede' | 'contradict' | 'review') { return { proposalId, kind: 'claim' as const, subjectKey: 'company', claimType: 'forecast' as const, statement: `EPS is ${String(value)}`, sourceCandidateIds: ['structured-600519'], structuredValue: { metric: 'eps', value, unit: 'CNY', comparator: null, period: 'FY2027' }, ...(temporal === undefined ? {} : { temporal }), ...(resolution === undefined ? {} : { resolution }), probability: 0.7 } }

test('usable acquisition validation excludes empty, null, error, and all-empty payloads', () => {
  for (const value of [[], {}, null, undefined, '', { data: [] }, { success: false, error: 'quota' }, { a: null, b: '' }]) assert.notEqual(validateUsableAcquisitionPayload(value).status, 'usable')
  assert.equal(validateUsableAcquisitionPayload([{ row: 1 }]).status, 'usable')
})

test('same Raw bytes can back distinct provenance-context Sources', async () => {
  const root = await mkdtemp(join(tmpdir(), 'rhl-source-identity-'))
  try {
    await createFreshKnowledgeBaseV04(root, { knowledgeBaseId: 'kb-source-identity', now: clock() }); const gateway = new KnowledgeProductionGateway()
    const first = await gateway.submit(await input(root, 'source-600519', '600519'))
    const second = await gateway.submit(await input(root, 'source-000858', '000858', [], [source('000858', 'structured-000858')]))
    assert.equal(first.status, 'committed'); assert.equal(second.status, 'committed')
    const assets = await readCanonicalV04Assets(root); const sources = assets.objects.filter((item) => item.kind === 'source'); const raws = new Set(sources.flatMap((item) => (item.value as { rawRefs?: string[] }).rawRefs ?? []))
    assert.equal(sources.length, 2); assert.equal(raws.size, 1)
  } finally { await rm(root, { recursive: true, force: true }) }
})

test('Claim identity ignores Research AsOf but preserves explicit Claim temporal observations', async () => {
  const root = await mkdtemp(join(tmpdir(), 'rhl-temporal-'))
  try {
    await createFreshKnowledgeBaseV04(root, { knowledgeBaseId: 'kb-temporal', now: clock() }); const gateway = new KnowledgeProductionGateway(); const firstInput = await input(root, 'temporal-1'); const first = await gateway.submit({ ...firstInput, proposals: [claim('eps-1', 42)] }); assert.equal(first.status, 'committed')
    const second = await gateway.submit({ ...(await input(root, 'temporal-2')), asOf: '2026-09-09T00:00:00.000Z', proposals: [claim('eps-2', 42)] }); assert.equal(second.status, 'no_changes', second.errors.join('; '))
    const priceClaim = (id: string, day: string) => ({ ...claim(id, 1), statement: `Price is observed on ${day}`, structuredValue: { metric: 'market_price', value: 1, unit: 'CNY', comparator: null }, temporal: { asOf: day, scope: { type: 'point_in_time', start: day, end: day, label: day } } })
    const third = await gateway.submit({ ...(await input(root, 'temporal-3')), proposals: [priceClaim('price-1', '2026-09-08'), priceClaim('price-2', '2026-09-09')] }); assert.equal(third.status, 'committed', third.errors.join('; '))
    const assets = await readCanonicalV04Assets(root); assert.equal(assets.objects.filter((item) => item.kind === 'claim').length, 3)
  } finally { await rm(root, { recursive: true, force: true }) }
})

test('Company Relation proposals are validated, canonicalized, and deduplicated', async () => {
  const root = await mkdtemp(join(tmpdir(), 'rhl-relation-'))
  try {
    await createFreshKnowledgeBaseV04(root, { knowledgeBaseId: 'kb-relation', now: clock() }); const gateway = new KnowledgeProductionGateway(); const industry = { proposalId: 'industry', kind: 'entity' as const, subjectKey: 'industry', entityType: 'industry' as const, entityName: 'Beverage Industry' }; const relation = { proposalId: 'belongs', kind: 'relation' as const, subjectKey: 'company', targetKey: 'industry', relationType: 'belongs_to_industry', sourceCandidateIds: ['structured-600519'] }
    const first = await gateway.submit({ ...(await input(root, 'relation-1')), proposals: [industry, relation] }); assert.equal(first.status, 'committed', first.errors.join('; ')); const second = await gateway.submit({ ...(await input(root, 'relation-2')), proposals: [industry, relation] }); assert.equal(second.status, 'no_changes', second.errors.join('; '))
    const assets = await readCanonicalV04Assets(root); assert.equal(assets.objects.filter((item) => item.kind === 'relation').length, 1)
  } finally { await rm(root, { recursive: true, force: true }) }
})

test('Changed semantic slot can supersede or persist a durable ReviewCase', async () => {
    const root = await mkdtemp(join(tmpdir(), 'rhl-resolution-'))
  try {
    await createFreshKnowledgeBaseV04(root, { knowledgeBaseId: 'kb-resolution', now: clock() }); const gateway = new KnowledgeProductionGateway(); const temporal = { asOf: '2026-09-08', scope: { type: 'point_in_time', start: '2026-09-08', end: '2026-09-08', label: '2026-09-08' } }; const first = await gateway.submit({ ...(await input(root, 'resolution-1')), proposals: [claim('old', 42, temporal)] }); assert.equal(first.status, 'committed', first.errors.join('; '))
    const superseded = await gateway.submit({ ...(await input(root, 'resolution-2')), proposals: [claim('new', 38, temporal, 'supersede')] }); assert.equal(superseded.status, 'committed', superseded.errors.join('; ')); let assets = await readCanonicalV04Assets(root); assert.equal(assets.objects.filter((item) => item.kind === 'claim').length, 2); assert.ok(assets.objects.some((item) => item.kind === 'claim' && (item.value as { lifecycle: { status: string } }).lifecycle.status === 'superseded'))
    const review = await gateway.submit({ ...(await input(root, 'resolution-3')), proposals: [claim('ambiguous', 37, temporal, 'review')] }); assert.equal(review.status, 'no_changes'); const cases = await listReviewCases(root, { producerRunId: 'resolution-3' }); assert.equal(cases.length, 1); assets = await readCanonicalV04Assets(root); assert.equal(assets.objects.filter((item) => item.kind === 'claim').length, 2)
  } finally { await rm(root, { recursive: true, force: true }) }
})

test('producer-neutral Industry Relation mapping resolves Relation-subject Claims without root fallback', async () => {
  const root = await mkdtemp(join(tmpdir(), 'rhl-producer-neutral-'))
  try {
    await createFreshKnowledgeBaseV04(root, { knowledgeBaseId: 'kb-producer-neutral', now: clock() })
    const gateway = new KnowledgeProductionGateway()
    const evidence = source('INDUSTRY', 'structured-INDUSTRY')
    const result = await gateway.submit({
      handle: await new KnowledgeBaseRegistry().mount(root), producerType: 'company_deep_research', producerRunId: 'producer-neutral-1',
      schemaProfile: { schemaVersion: '0.4', storageFormatVersion: '1', requiresRawProvenance: true },
      entity: { localKey: 'root-industry', entityType: 'industry', name: 'Battery Cells' },
      proposals: [
        { proposalId: 'peer-industry', kind: 'entity', subjectKey: 'peer-industry', entityType: 'industry', entityName: 'Battery Materials' },
        { proposalId: 'chain-link', kind: 'relation', subjectKey: 'root-industry', targetKey: 'peer-industry', relationType: 'upstream_of', sourceCandidateIds: ['structured-INDUSTRY'] },
        { proposalId: 'relation-claim', kind: 'claim', subjectKey: 'chain-link', claimType: 'fact', statement: 'The chain link is structurally material', sourceCandidateIds: ['structured-INDUSTRY'] }
      ],
      evidenceBindings: [{ localSourceId: 'structured-INDUSTRY', source: evidence }], now: clock
    })
    assert.equal(result.status, 'committed', result.errors.join('; '))
    assert.ok(result.relationRefsByProposalId?.['chain-link'])
    assert.ok(result.claimRefsByProposalId['relation-claim'])
    const assets = await readCanonicalV04Assets(root)
    const claimAsset = assets.objects.find((item) => (item.value as { id: string }).id === result.claimRefsByProposalId['relation-claim'])
    assert.ok(claimAsset, JSON.stringify(result))
    assert.equal((claimAsset.value as { subjectRefs: string[] }).subjectRefs[0], result.relationRefsByProposalId?.['chain-link'])
  } finally { await rm(root, { recursive: true, force: true }) }
})
