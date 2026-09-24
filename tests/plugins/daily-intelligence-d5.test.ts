import assert from 'node:assert/strict'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { AkshareDailyMarketAcquisition } from '../../plugins/daily-intelligence/market.ts'
import { DailyExpectationRevisionAcquisition } from '../../plugins/daily-intelligence/expectations.ts'
import { AkshareInstitutionalActivityAcquisition } from '../../plugins/daily-intelligence/institutional.ts'
import { DailyIndustryObservationAcquisition } from '../../plugins/daily-intelligence/industry.ts'
import { DailyIntelligenceService } from '../../app/services/daily-intelligence-service.ts'
import { WorkflowService } from '../../app/services/workflow-service.ts'
import { TradingCalendarService } from '../../plugins/daily-intelligence/calendar.ts'
import { loadSourceCatalog } from '../../plugins/daily-intelligence/config.ts'
import type { AkshareDataClient } from '../../plugins/research-acquisition/akshare.ts'
import type { IndustryOperatingObservationAcquisitionPort, IndustryOperatingObservation } from '../../plugins/research-acquisition/industry-operating-observations.ts'
import type { EarningsExpectationAcquisitionResult, EarningsExpectationsAcquisitionSource } from '../../workflows/earnings-review/expectations-acquisition.ts'
import type { EstimatePoint } from '../../skills/earnings-review/expectations/contracts.ts'
import type { NormalizedResearchSource, ResearchAcquisitionPlugin, ResearchFetchedSource } from '../../plugins/research-acquisition/contracts.ts'

const asOf = '2026-09-24T23:59:59.999Z'
function source(candidateId: string, publishedAt = '2026-09-20T00:00:00.000Z'): NormalizedResearchSource { const content = `source:${candidateId}`; return { candidate: { candidateId, kind: 'structured_data', tier: 3, title: candidateId, provider: 'fixture', publishedAt }, retrievedAt: asOf, title: candidateId, content, contentHash: candidateId, rawBytes: new TextEncoder().encode(content), publisher: 'Fixture', rights: { accessScope: 'public', retentionAllowed: true, aiProcessingAllowed: true, derivativeKnowledgeAllowed: true, redistributionAllowed: false } } }
function point(id: string, value: number, publishedAt: string, sourceId = id): EstimatePoint { return { estimateId: id, metric: 'eps', fiscalPeriod: '2026-FY', value, unit: 'CNY_per_share', institutionKey: 'fixture-org', publishedAt, sourceCandidateIds: [sourceId] } }
function projection(estimates: readonly EstimatePoint[], sources = estimates.map((item) => source(item.sourceCandidateIds[0]!, item.publishedAt))): EarningsExpectationAcquisitionResult { return { projection: { estimates, sources, institutions: [{ institutionKey: 'fixture-org', name: 'Fixture Institution', providerCode: 'fixture' }], diagnostics: [], providerOutcome: { provider: 'fixture', providerAttempted: true, providerSucceeded: estimates.length > 0, providerEmpty: estimates.length === 0, providerFailed: false, usableSourceCount: sources.length }, truncated: false }, results: [], attempts: [], diagnostics: [], providerOutcomes: [], status: estimates.length > 0 ? 'available' : 'unavailable' } }
function fakeAkshare(overrides: Partial<AkshareDataClient>): AkshareDataClient { return { companyBasic: async () => [], financialData: async () => [], historicalMarketData: async () => [], ...overrides } }

test('D5 market lane selects the exact latest eligible row, preserves zero, and keeps identity independent of asOf', async () => {
  const client = fakeAkshare({ indexDaily: async () => [{ date: '2026-09-25', close: 99 }, { date: '2026-09-24', close: 0 }, { date: '2026-09-23', close: 98 }] })
  const lane = new AkshareDailyMarketAcquisition(client, () => asOf)
  const first = await lane.discover({ company: { symbol: 'BROAD_SCOPE' }, asOf })
  const fetched = await lane.fetch(first[0]!)
  assert.equal(fetched.candidate.metadata?.observationDate, '2026-09-24')
  assert.equal(fetched.candidate.metadata?.value, 0)
  const second = await lane.discover({ company: { symbol: 'BROAD_SCOPE' }, asOf: '2026-09-26T23:59:59.999Z' })
  const secondFetched = await lane.fetch(second[0]!)
  assert.notEqual(secondFetched.candidate.metadata?.observationDate, '2026-09-24')
  const repeated = await lane.fetch((await lane.discover({ company: { symbol: 'BROAD_SCOPE' }, asOf }) )[0]!)
  assert.equal(fetched.candidate.candidateId, repeated.candidate.candidateId)
  assert.equal(fetched.candidate.metadata?.sourceAuthority, 'S3_AGGREGATOR')
})

test('D5 market lane rejects rows without deterministic trade dates', async () => {
  const lane = new AkshareDailyMarketAcquisition(fakeAkshare({ indexDaily: async () => [{ close: 1 }] }))
  const candidate = (await lane.discover({ company: { symbol: 'BROAD_SCOPE' }, asOf })) [0]!
  await assert.rejects(lane.fetch(candidate), /MARKET_TRADE_DATE_MISSING/)
})

test('D5 catalog audit keeps only proven feeds active and blocked endpoints visible', async () => {
  const catalog = await loadSourceCatalog()
  assert.equal(catalog.length, 43)
  assert.deepEqual(catalog.filter((item) => item.operationalStatus === 'active').map((item) => item.platform), ['cninfo', 'gdelt', 'akshare'])
  assert.equal(catalog.find((item) => item.platform === 'gov.cn')?.operationalStatus, 'blocked')
  assert.equal(catalog.find((item) => item.platform === 'gov.cn')?.catalogRole, 'reference_only')
  assert.equal(catalog.filter((item) => item.operationalStatus === 'metadata_only').length, 39)
})

test('D5 D1 lane emits a snapshot, one real revision, and no future point', async () => {
  let mode: 'snapshot' | 'revision' | 'future' = 'snapshot'
  const expectationSource: EarningsExpectationsAcquisitionSource = { acquire: async () => mode === 'snapshot' ? projection([point('estimate-1', 1, '2026-09-10T00:00:00.000Z')]) : mode === 'revision' ? projection([point('estimate-1', 1, '2026-09-10T00:00:00.000Z'), point('estimate-2', 1.2, '2026-09-20T00:00:00.000Z')]) : projection([point('estimate-future', 2, '2026-09-25T00:00:00.000Z')]) }
  const lane = new DailyExpectationRevisionAcquisition(expectationSource)
  const snapshot = await lane.discover({ company: { symbol: '600519' }, asOf })
  assert.equal(snapshot[0]?.metadata?.expectationMode, 'snapshot')
  const repeated = await lane.discover({ company: { symbol: '600519' }, asOf })
  assert.equal(snapshot[0]?.metadata?.providerObjectId, repeated[0]?.metadata?.providerObjectId)
  mode = 'revision'; const revision = await lane.discover({ company: { symbol: '600519' }, asOf })
  assert.equal(revision[0]?.metadata?.expectationMode, 'revision')
  mode = 'future'; await assert.rejects(lane.discover({ company: { symbol: '600519' }, asOf }), /EXPECTATIONS_UNAVAILABLE/)
})

test('D5 institutional lane preserves activity semantics, date, company attribution, and dedup', async () => {
  const row = { 证券代码: '600519', 证券简称: '贵州茅台', 机构名称: 'Fixture Fund', 调研日期: '2026-09-23', 公告日期: '2026-09-24' }
  const lane = new AkshareInstitutionalActivityAcquisition(fakeAkshare({ institutionalResearchDetail: async () => [row, { ...row }] }))
  const candidates = await lane.discover({ company: { symbol: 'BROAD_SCOPE' }, asOf })
  assert.equal(candidates.length, 1)
  assert.equal(candidates[0]?.metadata?.dailySignalKind, 'institutional_activity')
  assert.equal(candidates[0]?.metadata?.dailySignalCategory, 'institutional_activity')
  assert.equal(candidates[0]?.metadata?.eventDate, '2026-09-23')
  assert.equal(candidates[0]?.metadata?.companySymbol, '600519')
  assert.notEqual(candidates[0]?.metadata?.dailySignalKind, 'institutional_view')
})

test('D5 D4 lane makes zero calls for unsupported broad aliases and reuses supported observations', async () => {
  let calls = 0
  const observation = { observationId: 'observation-d4-1', metricKey: 'lithium_battery.total_output', observationClass: 'PRODUCTION', value: 1240, qualifier: 'LOWER_BOUND', unit: 'GWh', originalValue: '>1240', originalUnit: 'GWh', periodStart: '2026-01-01T00:00:00.000Z', periodEnd: '2026-06-30T23:59:59.999Z', frequency: 'H1', aggregation: 'YTD', geography: 'China national', productOrSegment: '锂离子电池', publishedAt: '2026-09-15T14:43:00.000Z', retrievedAt: asOf, originPublisher: 'MIIT', hostPlatform: 'MIIT official web', retrievalProvider: 'ResearchHub direct HTTPS', sourceAuthority: 'S1_OFFICIAL', determinismClass: 'EVIDENCE_BACKED_NUMERIC', sourceCandidateId: 'miit-source', sourceRef: undefined, publicationPit: 'VERIFIED', valueVersionPit: 'UNVERIFIED', metadata: {} } as IndustryOperatingObservation
  const normalized = source('miit-source', '2026-09-15T14:43:00.000Z')
  const acquisition: IndustryOperatingObservationAcquisitionPort = { acquire: async () => { calls += 1; return { status: 'COMPLETED', observations: [observation], sources: [normalized], diagnostics: [] } } }
  const lane = new DailyIndustryObservationAcquisition(acquisition, () => asOf)
  assert.deepEqual(await lane.discover({ industry: { name: 'new-energy', searchTerms: ['new-energy'] }, asOf }), [])
  assert.equal(calls, 0)
  const candidates = await lane.discover({ industry: { name: 'lithium battery', searchTerms: ['lithium battery'] }, asOf })
  assert.equal(calls, 1)
  assert.equal(candidates[0]?.metadata?.value, 1240)
  assert.equal(candidates[0]?.metadata?.qualifier, 'LOWER_BOUND')
  assert.equal(candidates[0]?.metadata?.sourceCandidateId, 'miit-source')
})

test('D5 Morning and Evening use the normal Daily service path with a structured signal', async () => {
  const provider: ResearchAcquisitionPlugin & { readonly dailyScope: 'broad' } = { name: 'd5-fixture-feed', dailyScope: 'broad', async discover() { return [{ candidateId: 'd5-announcement', kind: 'official_disclosure', tier: 1, title: 'Fixture announcement', provider: 'd5', publishedAt: '2026-09-24T10:00:00.000Z', metadata: { companySymbol: '600519', providerObjectId: 'd5-announcement' } }, { candidateId: 'd5-market', kind: 'structured_data', tier: 2, title: 'Fixture market close', provider: 'd5', metadata: { companySymbol: '600519', providerObjectId: 'd5-market:2026-09-24', dailySignalKind: 'market', dailySignalCategory: 'market', observationDate: '2026-09-24', sourceAuthority: 'S3_AGGREGATOR', retrievalProvider: 'fixture' } }] }, async fetch(candidate) { const content = candidate.candidateId; return { candidate, retrievedAt: asOf, content, rawBytes: new TextEncoder().encode(content), contentHash: candidate.candidateId } }, async normalize(fetched: ResearchFetchedSource) { return { candidate: fetched.candidate, retrievedAt: fetched.retrievedAt, title: fetched.candidate.title, content: fetched.content, contentHash: fetched.contentHash!, publisher: 'Fixture', rights: { accessScope: 'public', retentionAllowed: true, aiProcessingAllowed: true, derivativeKnowledgeAllowed: false, redistributionAllowed: false } } } }
  const root = await mkdtemp(join(tmpdir(), 'rhl-d5-service-')); const calendar = new TradingCalendarService({ cachePath: join(root, 'calendar.json'), manualTradingDays: ['2026-09-24'] }); const service = new DailyIntelligenceService({ cwd: process.cwd(), workflowService: new WorkflowService(), providers: [provider], runtimeRoot: root, calendar })
  for (const briefType of ['morning', 'evening'] as const) { const run = service.startBrief({ workflowRunId: `d5-${briefType}`, briefType, tradeDate: '2026-09-24', asOf }); const result = await run.completion; assert.equal(result.status, 'completed', result.errors.join('; ')); assert.ok(result.brief?.sections.length); assert.ok(result.signals.some((signal) => signal.category === 'market' && signal.eventDate === '2026-09-24')); assert.equal(result.providerOutcomes[0]?.status, 'succeeded') }
})
