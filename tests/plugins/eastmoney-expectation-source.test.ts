import test from 'node:test'
import assert from 'node:assert/strict'
import { EastmoneyReportClient, normalizeEastmoneyTimestamp } from '../../plugins/research-acquisition/expectations/index.ts'

const COMPANY = { symbol: '600519', name: '贵州茅台', exchange: 'SSE' as const }

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

function row(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    title: '业绩预测报告', stockName: '贵州茅台', stockCode: '600519', orgCode: '10000001', orgName: '测试证券股份有限公司', orgSName: '测试证券',
    publishDate: '2026-08-20 10:30:00', infoCode: 'AP202608201234567890', researcher: '研究员甲',
    predictThisYearEps: '10.5', predictNextYearEps: '11.5', predictNextTwoYearEps: '12.5', emRatingName: '买入', ...overrides,
  }
}

function page(data: readonly unknown[], totalPages = 1, currentYear = 2026): Record<string, unknown> {
  return { data, TotalPage: totalPages, pageNo: 1, currentYear }
}

function client(fetchImpl: typeof fetch, options: { readonly now?: string; readonly maxPages?: number } = {}): EastmoneyReportClient {
  return new EastmoneyReportClient({ fetchImpl, now: () => options.now ?? '2026-09-20T00:00:00.000Z', maxPages: options.maxPages })
}

test('Eastmoney request uses bounded PIT parameters and strict source normalization', async () => {
  const calls: URL[] = []
  const plugin = client(async (input) => { calls.push(new URL(String(input))); return response(page([row()])) })
  const result = await plugin.acquire({ company: COMPANY, asOf: '2026-08-20T23:00:00+08:00', targetFiscalYear: 2026 })
  assert.equal(calls.length, 1)
  assert.equal(calls[0]?.searchParams.get('qType'), '0')
  assert.equal(calls[0]?.searchParams.get('code'), '600519')
  assert.equal(calls[0]?.searchParams.get('pageSize'), '100')
  assert.equal(calls[0]?.searchParams.get('beginTime'), '2024-01-01')
  assert.equal(calls[0]?.searchParams.get('endTime'), '2026-08-20')
  assert.equal(result.providerOutcome.providerSucceeded, true)
  assert.equal(result.records.length, 1)
  assert.equal(result.sources.length, 1)
  assert.equal(result.sources[0]?.candidate.kind, 'structured_data')
  assert.equal(result.sources[0]?.candidate.tier, 3)
  assert.equal(result.sources[0]?.candidate.provider, 'eastmoney-reportapi')
  assert.equal(result.sources[0]?.rights.redistributionAllowed, false)
  assert.equal(result.sources[0]?.candidate.metadata?.period, undefined)
  assert.equal(result.sources[0]?.contentHash.length, 64)
})

test('provider currentYear anchors all three forecast horizons, not publication year', async () => {
  const plugin = client(async () => response(page([row({ publishDate: '2024-01-02', predictThisYearEps: '10', predictNextYearEps: '11', predictNextTwoYearEps: '12' })])))
  const result = await plugin.acquire({ company: COMPANY, asOf: '2026-08-20T23:59:59.999+08:00', targetFiscalYear: 2026 })
  assert.deepEqual(result.records[0]?.epsForecasts.map((item) => [item.providerField, item.fiscalYear, item.value]), [['predictThisYearEps', 2026, 10], ['predictNextYearEps', 2027, 11], ['predictNextTwoYearEps', 2028, 12]])
  assert.equal(result.forecastBaseYear, 2026)
})

test('pagination combines deterministically and reports truncation at the bound', async () => {
  const calls: URL[] = []
  const plugin = client(async (input) => { const url = new URL(String(input)); calls.push(url); const pageNo = Number(url.searchParams.get('pageNo')); return response(page([row({ infoCode: `AP-${pageNo}`, orgCode: `ORG-${pageNo}` })], 3)) }, { maxPages: 2 })
  const result = await plugin.acquire({ company: COMPANY, asOf: '2026-08-20T23:59:59.999+08:00', targetFiscalYear: 2026 })
  assert.deepEqual(calls.map((item) => item.searchParams.get('pageNo')), ['1', '2'])
  assert.equal(result.records.length, 2)
  assert.equal(result.truncated, true)
  assert.ok(result.diagnostics.includes('eastmoney_report_pagination_truncated'))
})

test('malformed response layers fail closed without synthetic provider data', async () => {
  for (const body of [{ data: [], TotalPage: 1 }, { data: [], currentYear: 2026 }, { TotalPage: 1, currentYear: 2026 }, { data: [], TotalPage: 'bad', currentYear: 2026 }]) {
    const plugin = client(async () => response(body))
    const result = await plugin.acquire({ company: COMPANY, asOf: '2026-08-20T23:59:59+08:00', targetFiscalYear: 2026 })
    assert.equal(result.records.length, 0)
    assert.equal(result.sources.length, 0)
    assert.equal(result.providerOutcome.providerFailed, true)
  }
})

test('full datetime and date-only publication timestamps use conservative Shanghai semantics', () => {
  assert.deepEqual(normalizeEastmoneyTimestamp('2026-08-20 10:30:00'), { iso: '2026-08-20T02:30:00.000Z', precision: 'datetime' })
  assert.deepEqual(normalizeEastmoneyTimestamp('2026-08-20'), { iso: '2026-08-20T15:59:59.999Z', precision: 'date' })
  assert.equal(normalizeEastmoneyTimestamp('not-a-date'), undefined)
})

test('future reports, malformed timestamps, symbol mismatches, and missing institutions are excluded', async () => {
  const plugin = client(async () => response(page([
    row({ infoCode: 'future', publishDate: '2026-08-21', orgCode: 'future-org' }),
    row({ infoCode: 'bad-date', publishDate: '2026/99/99' }),
    row({ infoCode: 'wrong-symbol', stockCode: '000001' }),
    row({ infoCode: 'no-org', orgCode: '' }),
    row({ infoCode: 'included', publishDate: '2026-08-20' }),
  ])))
  const result = await plugin.acquire({ company: COMPANY, asOf: '2026-08-20T23:59:59.999+08:00', targetFiscalYear: 2026 })
  assert.deepEqual(result.records.map((item) => item.infoCode), ['included'])
  assert.ok(result.diagnostics.some((item) => item.startsWith('eastmoney_report_published_after_asOf:future')))
  assert.ok(result.diagnostics.some((item) => item.startsWith('eastmoney_report_timestamp_invalid:bad-date')))
  assert.ok(result.diagnostics.some((item) => item.startsWith('eastmoney_report_stock_mismatch:wrong-symbol')))
  assert.ok(result.diagnostics.some((item) => item.startsWith('eastmoney_report_orgCode_required:no-org')))
})

test('finite positive, zero, and negative EPS values are preserved while malformed fields are rejected', async () => {
  const plugin = client(async () => response(page([row({ predictThisYearEps: '10', predictNextYearEps: '0', predictNextTwoYearEps: '-1.25', infoCode: 'numeric' }), row({ infoCode: 'malformed', predictThisYearEps: 'N/A', predictNextYearEps: '--', predictNextTwoYearEps: 'Infinity' })])))
  const result = await plugin.acquire({ company: COMPANY, asOf: '2026-08-20T23:59:59+08:00', targetFiscalYear: 2026 })
  assert.equal(result.records.length, 2)
  assert.deepEqual(result.records.find((item) => item.infoCode === 'numeric')?.epsForecasts.map((item) => item.value), [10, 0, -1.25])
  assert.deepEqual(result.records.find((item) => item.infoCode === 'malformed')?.epsForecasts, [])
  assert.ok(result.diagnostics.includes('eastmoney_eps_invalid:malformed:predictThisYearEps'))
  assert.ok(result.diagnostics.includes('eastmoney_eps_invalid:malformed:predictNextYearEps'))
  assert.ok(result.diagnostics.includes('eastmoney_eps_invalid:malformed:predictNextTwoYearEps'))
})

test('stable source identity and exact duplicate handling are order independent', async () => {
  const duplicate = row({ infoCode: 'same', orgCode: 'org-same' })
  const first = await client(async () => response(page([row({ infoCode: 'b', orgCode: 'org-b' }), duplicate, duplicate])) , { now: '2026-09-20T01:00:00.000Z' }).acquire({ company: COMPANY, asOf: '2026-08-20T23:59:59+08:00', targetFiscalYear: 2026 })
  const second = await client(async () => response(page([duplicate, row({ infoCode: 'b', orgCode: 'org-b' })])) , { now: '2026-09-20T02:00:00.000Z' }).acquire({ company: COMPANY, asOf: '2026-08-20T23:59:59+08:00', targetFiscalYear: 2026 })
  assert.deepEqual(first.records, second.records)
  assert.deepEqual(first.sources.map((item) => item.candidate.candidateId), second.sources.map((item) => item.candidate.candidateId))
  assert.equal(first.sources[0]?.contentHash, second.sources[0]?.contentHash)
  assert.notEqual(first.sources[0]?.retrievedAt, second.sources[0]?.retrievedAt)
})

test('conflicting duplicate report identities fail closed regardless of input order', async () => {
  const left = row({ infoCode: 'conflict', predictThisYearEps: '10' })
  const right = row({ infoCode: 'conflict', predictThisYearEps: '11' })
  const first = await client(async () => response(page([left, right]))).acquire({ company: COMPANY, asOf: '2026-08-20T23:59:59+08:00', targetFiscalYear: 2026 })
  const second = await client(async () => response(page([right, left]))).acquire({ company: COMPANY, asOf: '2026-08-20T23:59:59+08:00', targetFiscalYear: 2026 })
  assert.equal(first.records.length, 0)
  assert.equal(second.records.length, 0)
  assert.deepEqual(first.diagnostics, second.diagnostics)
  assert.ok(first.diagnostics.includes('eastmoney_report_identity_conflict:conflict'))
})

test('unsupported endpoint and request inputs fail closed before network access', async () => {
  assert.throws(() => new EastmoneyReportClient({ endpoint: 'https://evil.example/report/list' }), /not_allowlisted/)
  let calls = 0
  const plugin = client(async () => { calls++; return response(page([])) })
  const invalid = await plugin.acquire({ company: { symbol: '519' }, asOf: '2026-08-20T23:59:59+08:00', targetFiscalYear: 2026 })
  assert.equal(calls, 0)
  assert.equal(invalid.providerOutcome.providerAttempted, false)
  assert.ok(invalid.diagnostics.includes('eastmoney_company_symbol_invalid'))
})
