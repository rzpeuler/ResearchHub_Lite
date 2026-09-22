import assert from 'node:assert/strict'
import test from 'node:test'
import { CninfoOfficialDisclosureClient, GdeltResearchPlugin, RssResearchPlugin } from '../../plugins/research-acquisition/index.ts'

function response(body: string, status = 200): Response { return new Response(body, { status, headers: { 'content-type': 'text/xml' } }) }
test('RSS discovery is fixture-driven and deduplicable', async () => { const plugin = new RssResearchPlugin({ feedUrls: ['https://feed.test/rss'], fetchImpl: async (input) => String(input).includes('/rss') ? response('<rss><channel><item><title>Test</title><link>https://example.com/a</link><pubDate>Mon, 08 Sep 2026 00:00:00 GMT</pubDate></item></channel></rss>') : response('<html><body>Article body</body></html>') }); const items = await plugin.discover({ company: { symbol: '600519', name: 'Test' }, limitPerKind: 5 }); assert.equal(items.length, 1); const normalized = await plugin.normalize(await plugin.fetch(items[0]!)); assert.equal(normalized.content, 'Article body'); assert.equal(normalized.rights.redistributionAllowed, false) })
test('GDELT adapter validates only usable article candidates', async () => { const plugin = new GdeltResearchPlugin({ fetchImpl: async () => response(JSON.stringify({ articles: [{ url: 'https://example.com/a', title: 'News', seendate: '20260908T000000Z' }] }), 200) }); const items = await plugin.discover({ company: { symbol: '600519', name: 'Test' }, limitPerKind: 5 }); assert.equal(items[0]?.candidateId.startsWith('gdelt-'), true); assert.equal(items[0]?.publishedAt, '2026-09-08T00:00:00.000Z') })
test('AKShare adapter uses injected runner without requiring Python in offline tests', async () => { const { AkshareDataAdapter } = await import('../../plugins/research-acquisition/akshare.ts'); const calls: Array<{ script: string; args: string[] }> = []; const adapter = new AkshareDataAdapter({ runner: async (script, args) => { calls.push({ script, args: [...args] }); return '[{"value":1}]' } }); assert.deepEqual(await adapter.companyBasic({ symbol: '600519' }), [{ value: 1 }]); assert.deepEqual(await adapter.historicalMarketData({ symbol: '600519' }), [{ value: 1 }]); assert.deepEqual(await adapter.financialData({ symbol: '600519' }), [{ value: 1 }]); assert.equal(calls.length, 3); const financial = calls.find((call) => call.args[0] === 'financial'); assert.ok(financial); assert.match(financial!.script, /stock_financial_analysis_indicator_em/); assert.match(financial!.script, /symbol\.startswith\('6'\)/) })
test('AKShare expectations adapter exposes observed THS and EastMoney routes', async () => { const { AkshareDataAdapter } = await import('../../plugins/research-acquisition/akshare.ts'); const calls: Array<{ script: string; args: string[] }> = []; const adapter = new AkshareDataAdapter({ runner: async (script, args) => { calls.push({ script, args: [...args] }); return '[]' } }); await adapter.profitForecastThs({ symbol: '600519', indicator: '业绩预测详表-机构' }); await adapter.researchReportEm({ symbol: '600519' }); await adapter.profitForecastEm({ symbol: '600519' }); assert.deepEqual(calls.map((call) => call.args), [['ths-profit-forecast', '600519', '', '', '业绩预测详表-机构'], ['em-research-report', '600519', '', ''], ['em-profit-forecast', '600519', '', '']]); assert.match(calls[0]!.script, /stock_profit_forecast_ths/); assert.match(calls[1]!.script, /stock_research_report_em/); assert.match(calls[2]!.script, /stock_profit_forecast_em/) })

test('CNINFO management communication query sends bounded historical seDate and finds older IR records', async () => {
  const requests: URLSearchParams[] = []
  const client = new CninfoOfficialDisclosureClient({ fetchImpl: async (input, init) => {
    if (String(input).includes('/topSearch/')) return new Response(JSON.stringify([{ code: '600519', orgId: 'gssh0600519', zwjc: '贵州茅台' }]))
    requests.push(new URLSearchParams(String(init?.body ?? '')))
    return new Response(JSON.stringify({ announcements: [
      { announcementTitle: '关于召开2026年半年度业绩说明会的公告', adjunctUrl: '/finalpage/2026-09-01/999.PDF', announcementTime: '2026-09-01T00:00:00.000Z', secName: 'Fixture' },
      { announcementTitle: '投资者关系活动记录表', adjunctUrl: '/finalpage/2026-08-01/123.PDF', announcementTime: '2026-08-01T00:00:00.000Z', secName: 'Fixture' },
    ] }))
  }, pageSize: 5 })
  const records = await client.listManagementCommunication({ company: { symbol: '600519', exchange: 'SSE' }, lookbackStartDate: '2026-07-01', asOf: '2026-08-31T23:59:59.999Z' })
  assert.equal(requests.length, 4)
  assert.ok(requests.every((request) => request.get('seDate') === '2026-07-01~2026-09-01'))
  assert.ok(requests.every((request) => request.get('pageSize') === '5'))
  assert.equal(records.length, 1)
  assert.equal(records[0]?.title, '投资者关系活动记录表')
})
