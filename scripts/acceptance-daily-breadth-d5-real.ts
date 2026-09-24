import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { createDailyIntelligenceComposition } from '../app/services/daily-intelligence-composition.ts'
import { WorkflowService } from '../app/services/workflow-service.ts'
import { AkshareDataAdapter } from '../plugins/research-acquisition/akshare.ts'
import { TradingCalendarService } from '../plugins/daily-intelligence/calendar.ts'
import { marketSameDayCloseEligible, marketShanghaiCalendarDate } from '../plugins/daily-intelligence/market.ts'

if (process.env.RESEARCHHUB_RUN_REAL_DAILY_BREADTH !== '1') {
  console.log('REAL_DAILY_BREADTH_NOT_RUN')
  console.log('networkCalls=0')
  process.exit(0)
}

const root = await mkdtemp(join(resolve('.'), 'runtime-d5-real-'))
const watchlistPath = join(root, 'acceptance-watchlist.json')
await writeFile(watchlistPath, JSON.stringify({ companies: [{ symbol: '600519', name: '贵州茅台', exchange: 'SSE', focusTags: ['consumer'] }], themes: ['consumer', 'macro'], industries: ['lithium battery', 'room air conditioner'] }), 'utf8')
let networkCalls = 0; let akshareBridgeCalls = 0; const akshareCalls: Array<{ readonly kind: string; readonly args: readonly string[] }> = []
const originalFetch = globalThis.fetch
globalThis.fetch = (async (...args: Parameters<typeof fetch>) => { networkCalls += 1; return originalFetch(...args) }) as typeof fetch
const tradeDate = process.env.RESEARCHHUB_D5_TRADE_DATE ?? new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
const asOf = new Date().toISOString()
try {
  const akshare = new AkshareDataAdapter({ onCall: (kind, args) => { akshareBridgeCalls += 1; akshareCalls.push({ kind, args }) } })
  const calendar = new TradingCalendarService({ cachePath: join(root, 'acceptance-calendar.json'), manualTradingDays: [tradeDate] })
  const composition = await createDailyIntelligenceComposition({ cwd: resolve('.'), workflowService: new WorkflowService(), watchlistPath, runtimeRoot: root, akshare, calendar })
  const results = []
  for (const briefType of ['morning', 'evening'] as const) {
    const run = composition.service.startBrief({ workflowRunId: `d5-real-${briefType}-${tradeDate}`, briefType, tradeDate, asOf, forceRefresh: true })
    results.push(await run.completion)
  }
  const allSignals = results.flatMap((result) => result.signals); const outcomes = results.flatMap((result) => result.providerOutcomes); const documentNews = allSignals.some((signal) => signal.kind === 'announcement' || signal.kind === 'news'); const marketSignals = allSignals.filter((signal) => signal.kind === 'market' && signal.category === 'market'); const expectationSignals = allSignals.filter((signal) => signal.kind === 'expectation'); const institutionalSignals = allSignals.filter((signal) => signal.kind === 'institutional_activity' && signal.category === 'institutional_activity'); const d4Signals = allSignals.filter((signal) => signal.source.provider === 'd4-industry-observations'); const market = marketSignals.length > 0; const reusable = expectationSignals.length > 0 || institutionalSignals.length > 0 || d4Signals.length > 0; const d1Semantics = expectationSignals.every((signal) => { const mode = signal.source.metadata?.expectationMode; return (mode === 'snapshot' && signal.category === 'expectation_snapshot') || (mode === 'revision' && signal.category === 'expectation_revision') }); const d4Semantics = d4Signals.every((signal) => signal.kind === 'industry_observation' && signal.category === 'industry'); const pitSafe = allSignals.every((signal) => signal.eventDate === undefined || signal.eventDate <= tradeDate) && allSignals.every((signal) => signal.publishedAt === undefined || signal.publishedAt <= asOf); const completed = results.every((result) => result.status === 'completed' || result.status === 'already_completed'); const institutionalProvider = composition.providers.find((provider) => provider.name === 'akshare-institutional-activity') as { readonly lastTelemetry?: unknown } | undefined; const blockers = outcomes.filter((outcome) => outcome.status === 'blocked' || outcome.status === 'failed').map((outcome) => `${outcome.provider}:${outcome.diagnostics[0] ?? outcome.status}`).slice(0, 20)
  const verified = completed && documentNews && market && reusable && pitSafe && d1Semantics && d4Semantics
  console.log(JSON.stringify({ classification: verified ? 'D5_DAILY_BREADTH_REAL_PRODUCT_PATH_VERIFIED' : 'REAL_DAILY_BREADTH_PARTIAL', tradeDate, asOf, networkCalls, akshareBridgeCalls, catalog: { total: composition.catalog.length, active: composition.catalog.filter((item) => item.operationalStatus === 'active').map((item) => item.platform), blocked: composition.catalog.filter((item) => item.operationalStatus === 'blocked').map((item) => item.platform) }, marketTelemetry: { logicalIndexes: ['000001', '399001', '399006', '000688'], providerRequests: akshareCalls.filter((call) => call.kind === 'index').map((call) => ({ providerSymbol: call.args[1], endDate: call.args[3] })), selectedTradeDates: marketSignals.map((signal) => signal.eventDate ?? signal.source.metadata?.observationDate), asOf, sameDayCloseEligible: marketSameDayCloseEligible(asOf), asOfShanghaiDate: marketShanghaiCalendarDate(asOf) }, institutionalTelemetry: institutionalProvider?.lastTelemetry, briefs: results.map((result) => ({ status: result.status, errors: result.errors.slice(0, 5), briefType: result.brief?.briefType, sections: result.brief?.sections.length ?? 0, providerOutcomes: result.providerOutcomes.map((outcome) => ({ provider: outcome.provider, status: outcome.status, attempted: outcome.attempted, usable: outcome.usable, diagnostics: outcome.diagnostics.slice(0, 3) })), structuredSignalCount: result.signals.filter((signal) => signal.kind === 'market' || signal.kind === 'expectation' || signal.kind === 'industry_observation' || signal.kind === 'institutional_activity').length })), documentNews, market, expectationLane: { count: expectationSignals.length, semantics: d1Semantics }, institutionalLane: { count: institutionalSignals.length }, d4Lane: { count: d4Signals.length, semantics: d4Semantics }, pitSafe, fabricatedFallback: false, blockers }, null, 2))
} catch (error) {
  console.log(JSON.stringify({ classification: 'REAL_DAILY_BREADTH_PARTIAL', networkCalls, akshareBridgeCalls, fabricatedFallback: false, error: error instanceof Error ? error.message : String(error) }, null, 2))
} finally {
  globalThis.fetch = originalFetch
  await rm(root, { recursive: true, force: true })
}
