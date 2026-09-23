import assert from 'node:assert/strict'
import test from 'node:test'
import type { AkshareDataClient, AksharePeerComparisonFamily } from '../../plugins/research-acquisition/akshare.ts'
import type { OfficialDisclosureClient } from '../../plugins/research-acquisition/official.ts'
import { resolveAutomaticComps } from '../../workflows/valuation/automatic-comps.ts'
import { buildValuationCrosscheck } from '../../workflows/valuation/crosscheck.ts'

const NOW = '2026-09-09T00:00:00.000Z'
const target = '600519'
const peers = ['000001', '000002', '000003']
function row(ticker: string, extra: Record<string, unknown> = {}): Record<string, unknown> { return { SECUCODE: `${ticker}.${ticker.startsWith('6') ? 'SH' : 'SZ'}`, SECURITY_CODE: ticker, SECURITY_NAME_ABBR: `Company ${ticker}`, ...extra } }
function family(family: AksharePeerComparisonFamily, tickers: readonly string[]): readonly Record<string, unknown>[] {
  if (family === 'growth') return [row(target), ...tickers.map((ticker) => row(ticker, { YYSR_3Y: 0.1, JLR_3Y: 0.12, MGSY_3Y: 0.08, REPORT_DATE: '2025-12-31' }))]
  if (family === 'dupont') return [row(target), ...tickers.map((ticker) => row(ticker, { ROE_AVG: 0.12, XSJLL_AVG: 0.1, TOAZZL_AVG: 0.8, REPORT_DATE: '2025-12-31' }))]
  if (family === 'scale') return [row(target, { TOTAL_CAP: 1000, FREECAP: 800, REPORT_TYPE: '2025年报' }), ...tickers.map((ticker, index) => row(ticker, { TOTAL_CAP: 900 + index * 100, FREECAP: 700, REPORT_TYPE: '2025年报' }))]
  return [row(target)]
}
function fakeAkshare(tickers: readonly string[] = peers): AkshareDataClient & { readonly peerCalls: string[]; readonly validationCalls: string[] } {
  const peerCalls: string[] = []; const validationCalls: string[] = []
  return { peerCalls, validationCalls, companyBasic: async () => [], financialData: async () => [], historicalMarketData: async ({ symbol }) => { validationCalls.push(`market:${symbol}`); return [{ date: '2026-09-08', close: 100 }] }, valuationFinancialIndicators: async ({ symbol }) => { validationCalls.push(`financial:${symbol}`); return [{ REPORT_DATE: '2025-12-31', EPSJB: 10, BPS: 20 }] }, peerComparison: async ({ family: requested }) => { peerCalls.push(requested); return { result: { data: family(requested, tickers) } } } }
}
const official: OfficialDisclosureClient = { list: async () => [], fetch: async () => '', resolveAnnualReportPublication: async ({ fiscalYear, company }) => ({ issuer: company.symbol, fiscalYear, reportTitle: `${fiscalYear} annual report`, officialPublishedAt: '2026-03-30T00:00:00.000Z', rawPublishedAt: '2026-03-30', sourceUrl: `https://static.cninfo.com.cn/${company.symbol}-${fiscalYear}.pdf`, originPublisher: 'CNINFO', originAuthority: 'S0_STATUTORY', retrievalProvider: 'CNINFO', retrievedAt: NOW }) }
function request(akshare: AkshareDataClient, overrides: Partial<Parameters<typeof resolveAutomaticComps>[0]> = {}) { return resolveAutomaticComps({ company: { symbol: target, name: 'Target', exchange: 'SSE' }, valuationDate: NOW, basisFiscalYear: 2025, targetFiscalYear: 2026, selectedMethod: 'PE', targetForecastMetric: 12, targetSourceRefs: ['target-financial'], akshare, officialDisclosure: official, retrievedAt: NOW, now: NOW, ...overrides }) }

test('automatic resolver applies four-family consensus, exact identity, profile and scale gates', async () => {
  const akshare = fakeAkshare(); const resolved = await request(akshare)
  assert.deepEqual(akshare.peerCalls, ['growth', 'valuation', 'dupont', 'scale'])
  assert.equal(resolved.result.availability, 'available')
  assert.equal(resolved.result.validPeers.length, 3)
  assert.equal(resolved.result.selectedMedian, 10)
  assert.equal(resolved.result.impliedTargetPrice, 120)
  assert.equal(resolved.result.multipleBasisFiscalYear, 2025)
  assert.equal(resolved.result.targetFiscalYear, 2026)
  assert.ok(resolved.sources.some((source) => source.candidate.metadata?.originAuthority === 'S0_STATUTORY'))
})

test('automatic resolver orders deterministically and hard caps expensive validation at twelve', async () => {
  const many = Array.from({ length: 14 }, (_, index) => String(100001 + index)); const akshare = fakeAkshare(many); const resolved = await request(akshare)
  assert.equal(resolved.result.expensiveValidationCount, 12)
  assert.equal(akshare.validationCalls.filter((call) => call.startsWith('market:')).length, 12)
  assert.equal(resolved.result.validPeers.length, 8)
  const again = await request(fakeAkshare(many))
  assert.deepEqual(resolved.result.validPeers.map((peer) => peer.identity.ticker), again.result.validPeers.map((peer) => peer.identity.ticker))
})

test('historical input is not accepted by the automatic resolver path contract', async () => {
  const akshare = fakeAkshare(); const before = akshare.peerCalls.length
  assert.equal(before, 0)
  assert.equal((await request(akshare, { signal: AbortSignal.abort() }).catch((error) => error)).message, 'WORKFLOW_CANCELLED')
  assert.equal(akshare.peerCalls.length, 0)
})

test('automatic crosscheck uses target FY, preserves multiple basis, and never averages', () => {
  const result = { availability: 'available' as const, subject: { identity: { companyId: '600519.SH', ticker: '600519', exchange: 'SH' }, sourceRefs: ['target'] }, selectedMethod: 'PE' as const, multipleBasisFiscalYear: 2025, targetFiscalYear: 2026, valuationDate: NOW, targetForecastMetric: 12, validPeers: [], rejectedPeers: [], multipleSummaries: [{ method: 'PE' as const, validCount: 3, median: 10, min: 9, max: 11, peerRefs: ['peer'] }], selectedMedian: 10, impliedTargetPrice: 120, sourceRefs: ['target', 'peer'], diagnostics: [], candidatePeerCount: 3, expensiveValidationCount: 3 }
  const crosscheck = buildValuationCrosscheck({ eligibleMethods: ['PE'], automaticCompsResult: result })
  const comps = crosscheck.methodResults.find((item) => item.method === 'comps_valuation')!
  assert.equal(comps.period, 'FY2026')
  assert.equal(comps.valuationDate, NOW)
  assert.ok(comps.diagnostics.includes('multipleBasisPeriod=FY2025'))
  assert.equal(crosscheck.automaticAveraging, false)
})
