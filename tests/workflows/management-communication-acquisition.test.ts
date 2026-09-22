import assert from 'node:assert/strict'
import test from 'node:test'
import { AkshareDataAdapter } from '../../plugins/research-acquisition/akshare.ts'
import { dedupeDocuments, normalizeExchangeQaRows, runExchangeQa, runManagementCommunicationDocuments, resolveExchange, type CommunicationProvenance, type ManagementCommunicationAcquisitionSources, type ManagementCommunicationDocument } from '../../workflows/management-communication-acquisition/index.ts'

const AS_OF = '2026-09-22T00:00:00.000Z'
const RETRIEVED = '2026-09-22T01:00:00.000Z'

function sources(overrides: Partial<ManagementCommunicationAcquisitionSources> = {}): ManagementCommunicationAcquisitionSources {
  return {
    cninfoIr: async () => [],
    exchangeQaSzse: async () => [],
    exchangeQaSse: async () => [],
    eastmoneyInstitutionalResearch: async () => [],
    ...overrides,
  }
}

function cninfoRecord(overrides: Partial<{ title: string; publishedAt: string; retrievedAt: string; content: string; sourceNativeId: string }> = {}) {
  return {
    ticker: '600519',
    title: '贵州茅台投资者关系活动记录表',
    publishedAt: '2026-08-01T00:00:00.000Z',
    retrievedAt: RETRIEVED,
    content: 'fixture management communication evidence',
    sourceUrl: 'https://static.cninfo.com.cn/finalpage/2026-08-01/123456.PDF',
    sourceNativeId: '123456',
    originPublisher: '贵州茅台',
    ...overrides,
  }
}

function eastmoneyRow(overrides: Record<string, unknown> = {}) {
  return {
    代码: '600519',
    名称: '贵州茅台',
    调研机构: 'Fixture Capital;Fixture Asset',
    机构类型: '证券公司',
    调研人员: 'Analyst',
    接待方式: '路演活动',
    接待人员: 'IR Representative',
    接待地点: 'Online',
    调研日期: '2026-08-01',
    公告日期: '2026-08-02',
    ...overrides,
  }
}

function qaRow(overrides: Record<string, unknown> = {}) {
  return {
    股票代码: '600519',
    提问: 'What is the fixture question?',
    回答: 'This is the fixture answer.',
    提问时间: '2026-08-01 09:00:00',
    回答时间: '2026-08-02 09:00:00',
    attachedId: 'qa-1',
    ...overrides,
  }
}

test('document contract requires independent publication and retrieval times', async () => {
  const result = await runManagementCommunicationDocuments({ request: { ticker: '600519', companyName: '贵州茅台', asOf: AS_OF }, sources: sources({ cninfoIr: async () => [cninfoRecord()] }), now: () => RETRIEVED })
  assert.equal(result.status, 'AVAILABLE')
  assert.equal(result.data[0]?.publishedAt, '2026-08-01T00:00:00.000Z')
  assert.equal(result.data[0]?.retrievedAt, RETRIEVED)
  assert.equal(result.data[0]?.source.originPublisher, '贵州茅台')
  assert.equal(result.data[0]?.source.hostPlatform, 'CNINFO')
  assert.equal(result.data[0]?.source.retrievalProvider, 'cninfo-official-client')
})

test('deterministic document mapping excludes unknown categories', async () => {
  const result = await runManagementCommunicationDocuments({ request: { ticker: '600519', asOf: AS_OF }, sources: sources({ cninfoIr: async () => [cninfoRecord({ title: '贵州茅台关于会计政策变更的公告' })] }), now: () => RETRIEVED })
  assert.equal(result.status, 'UNAVAILABLE')
  assert.equal(result.data.length, 0)
  assert.match(result.diagnostics.join('|'), /unmapped_documentType/)
  assert.doesNotMatch(JSON.stringify(result), /COMPANY_IR_DOCUMENT/)
})

test('missing or future publication time cannot become successful acquisition', async () => {
  for (const record of [cninfoRecord({ publishedAt: '' }), cninfoRecord({ publishedAt: '2026-09-23T00:00:00.000Z' })]) {
    const result = await runManagementCommunicationDocuments({ request: { ticker: '600519', asOf: AS_OF }, sources: sources({ cninfoIr: async () => [record], eastmoneyInstitutionalResearch: async () => [] }), now: () => RETRIEVED })
    assert.equal(result.status, 'UNAVAILABLE')
    assert.equal(result.acquisition.attempts[0]?.status, 'NO_DATA')
    assert.equal(result.acquisition.attempts[1]?.fallbackLevel, 'FALLBACK_2')
  }
})

test('IR FIRST_VALID uses CNINFO and does not call EastMoney after primary success', async () => {
  let eastmoneyCalls = 0
  const result = await runManagementCommunicationDocuments({ request: { ticker: '600519', asOf: AS_OF }, sources: sources({ cninfoIr: async () => [cninfoRecord()], eastmoneyInstitutionalResearch: async () => { eastmoneyCalls++; return [eastmoneyRow()] } }), now: () => RETRIEVED })
  assert.equal(result.status, 'AVAILABLE')
  assert.equal(eastmoneyCalls, 0)
  assert.deepEqual(result.acquisition.attempts.map((attempt) => attempt.fallbackLevel), ['PRIMARY'])
})

test('IR fallback uses executable EastMoney institutional research and preserves S3 provenance', async () => {
  const result = await runManagementCommunicationDocuments({ request: { ticker: '600519', companyName: '贵州茅台', asOf: AS_OF }, sources: sources({ cninfoIr: async () => [], eastmoneyInstitutionalResearch: async () => [eastmoneyRow()] }), now: () => RETRIEVED })
  assert.equal(result.status, 'AVAILABLE')
  assert.equal(result.acquisition.source?.fallbackLevel, 'FALLBACK_2')
  assert.equal(result.data[0]?.source.authority, 'S3_AGGREGATOR')
  assert.equal(result.data[0]?.source.disclosureClass, 'AGGREGATED_IR')
  assert.equal(result.data[0]?.source.hostPlatform, 'EastMoney')
  assert.equal(result.data[0]?.source.retrievalProvider, 'AKShare')
})

test('SZSE exchange routing invokes only SZSE and preserves Q&A pairing', async () => {
  const calls: string[] = []
  const result = await runExchangeQa({ request: { ticker: '000001', exchange: 'SZSE', asOf: AS_OF }, sources: sources({ exchangeQaSzse: async () => { calls.push('szse'); return [{ ...qaRow(), 股票代码: '000001' }] }, exchangeQaSse: async () => { calls.push('sse'); return [qaRow()] } }), now: () => RETRIEVED })
  assert.equal(result.status, 'AVAILABLE')
  assert.deepEqual(calls, ['szse'])
  assert.equal(result.data[0]?.platform, 'SZSE_HUDONGYI')
  assert.equal(result.data[0]?.question, 'What is the fixture question?')
  assert.equal(result.data[0]?.answer, 'This is the fixture answer.')
  assert.equal(result.data[0]?.publishedAt, result.data[0]?.answeredAt)
  assert.equal(result.acquisition.attempts.length, 1)
})

test('SSE exchange routing invokes only SSE and never adds EastMoney fallback', async () => {
  const calls: string[] = []
  const result = await runExchangeQa({ request: { ticker: '600519', exchange: 'SSE', asOf: AS_OF }, sources: sources({ exchangeQaSse: async () => { calls.push('sse'); return [qaRow()] }, eastmoneyInstitutionalResearch: async () => { calls.push('eastmoney'); return [eastmoneyRow()] } }), now: () => RETRIEVED })
  assert.equal(result.status, 'AVAILABLE')
  assert.deepEqual(calls, ['sse'])
  assert.equal(result.data[0]?.platform, 'SSE_EINTERACTION')
})

test('unsupported or unresolved exchange returns UNAVAILABLE without attempting either exchange', async () => {
  const calls: string[] = []
  const result = await runExchangeQa({ request: { ticker: '830000', exchange: 'BSE', asOf: AS_OF }, sources: sources({ exchangeQaSzse: async () => { calls.push('szse'); return [] }, exchangeQaSse: async () => { calls.push('sse'); return [] } }), now: () => RETRIEVED })
  assert.equal(result.status, 'UNAVAILABLE')
  assert.deepEqual(calls, [])
  assert.deepEqual(result.acquisition.attempts, [])
})

test('Q&A rejects answer-only, empty, malformed, and future rows', () => {
  for (const row of [
    { ...qaRow(), 提问: '' },
    { ...qaRow(), 回答: '' },
    { ...qaRow(), 回答时间: 'not-a-date' },
    { ...qaRow(), publishedAt: '2026-09-23T00:00:00.000Z' },
  ]) {
    const batch = normalizeExchangeQaRows([row], { ticker: '600519', asOf: AS_OF }, 'SSE_EINTERACTION', RETRIEVED)
    assert.equal(batch.values.length, 0)
    assert.ok(batch.diagnostics.length > 0)
  }
})

test('normalizer accepts the observed AKShare CNINFO Q&A vocabulary', () => {
  const batch = normalizeExchangeQaRows([{ 股票代码: '000001', 问题: 'Observed question', 回答内容: 'Observed answer', 提问时间: '2026-08-01 09:00:00', 更新时间: '2026-08-02 09:00:00', 问题编号: 'question-1', 回答ID: 'answer-1' }], { ticker: '000001', asOf: AS_OF }, 'SZSE_HUDONGYI', RETRIEVED)
  assert.equal(batch.values.length, 1)
  assert.equal(batch.values[0]?.question, 'Observed question')
  assert.equal(batch.values[0]?.answer, 'Observed answer')
  assert.equal(batch.values[0]?.answeredAt, '2026-08-02T09:00:00.000Z')
  assert.equal(batch.values[0]?.source.sourceNativeId, 'question-1')
})

test('stable dedupe is row-order independent and keeps distinct provenance contexts', () => {
  const source = (retrievalProvider: string): CommunicationProvenance => ({ originPublisher: 'Company', hostPlatform: 'CNINFO', retrievalProvider, authority: 'S1_OFFICIAL', disclosureClass: 'OFFICIAL_IR' })
  const value = (retrievalProvider: string): ManagementCommunicationDocument => ({ id: 'same-id', ticker: '600519', documentType: 'INVESTOR_RELATIONS_RECORD', publishedAt: '2026-08-01T00:00:00.000Z', retrievedAt: RETRIEVED, content: 'fixture', source: source(retrievalProvider) })
  assert.equal(dedupeDocuments([value('client'), value('client')]).length, 1)
  assert.equal(dedupeDocuments([value('client'), value('AKShare')]).length, 2)
})

test('exchange resolver follows existing ticker conventions without extending D0', () => {
  assert.equal(resolveExchange({ ticker: '600519' }), 'SSE')
  assert.equal(resolveExchange({ ticker: '000001' }), 'SZSE')
  assert.equal(resolveExchange({ ticker: '830000' }), undefined)
})

test('AKShare bridge exposes only explicit D2 operations', async () => {
  const calls: Array<{ script: string; args: string[] }> = []
  const adapter = new AkshareDataAdapter({ runner: async (script, args) => { calls.push({ script, args: [...args] }); return '[]' } })
  await adapter.exchangeQaSzse({ symbol: '000001' })
  await adapter.exchangeQaSzseAnswer({ symbol: 'qa-1' })
  await adapter.exchangeQaSse({ symbol: '600519' })
  await adapter.institutionalResearchDetail({ date: '20260901' })
  assert.deepEqual(calls.map((call) => call.args), [
    ['szse-qa', '000001', '', ''],
    ['szse-qa-answer', 'qa-1', '', ''],
    ['sse-qa', '600519', '', ''],
    ['em-institutional-research', '', '20260901', ''],
  ])
  assert.match(calls[0]!.script, /stock_irm_cninfo/)
  assert.match(calls[1]!.script, /stock_irm_ans_cninfo/)
  assert.match(calls[2]!.script, /stock_sns_sseinfo/)
  assert.match(calls[3]!.script, /stock_jgdy_detail_em/)
})
