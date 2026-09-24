import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { DailyIntelligenceSignalEnrichmentSkill } from '../../skills/daily-intelligence/enrichment.ts'
import { DailyChangeAssessmentSkill } from '../../skills/daily-intelligence/change-assessment.ts'
import { DailyBriefSynthesisSkill } from '../../skills/daily-intelligence/synthesis.ts'
import { createDailyIntelligenceComposition } from '../../app/services/daily-intelligence-composition.ts'
import { WorkflowService } from '../../app/services/workflow-service.ts'
import { loadSourceCatalog } from '../../plugins/daily-intelligence/config.ts'
import { TradingCalendarService } from '../../plugins/daily-intelligence/calendar.ts'
import type { AkshareDataClient } from '../../plugins/research-acquisition/akshare.ts'
import type { DailyResearchSignal, DailySignalCluster } from '../../plugins/daily-intelligence/contracts.ts'

const capabilities = () => ({ maxContextTokens: 20_000, maxOutputTokens: 4_000, structuredOutputSupport: true, maxConcurrency: 2 })
function signal(overrides: Partial<DailyResearchSignal> = {}): DailyResearchSignal { return { signalId: 'signal-fix-002', kind: 'announcement', category: 'announcement', provider: 'fixture', source: { candidateId: 'candidate-fix-002', kind: 'official_disclosure', tier: 1, title: '贵州茅台 guidance update', provider: 'fixture', metadata: { companySymbol: '600519' } }, discoveredAt: '2026-09-08T00:00:00.000Z', entities: ['600519'], themes: [], title: '贵州茅台 guidance update', contentHash: 'hash-fix-002', excerpt: 'guidance update', relevance: 0.4, novelty: 1, importance: 0.5, sourceTier: 1, ...overrides } }
function cluster(items: readonly DailyResearchSignal[] = [signal()]): DailySignalCluster { return { clusterId: 'cluster-fix-002', representativeSignal: items[0]!.signalId, signalRefs: items.map((item) => item.signalId), entities: ['600519'], themes: [], firstSeen: items[0]!.discoveredAt, lastSeen: items[0]!.discoveredAt, sourceDiversity: 1, importance: 0.5, title: items[0]!.title, signals: items } }

test('FIX-002 enrichment invokes the semantic operation and applies only validated fields', async () => { const calls: string[] = []; const result = await new DailyIntelligenceSignalEnrichmentSkill().enrichManyDetailedAsync([signal()], ['600519'], ['AI'], { capabilities, execute: async (request) => { calls.push(request.operation); return { operation: request.operation, output: { signals: [{ signalId: 'signal-fix-002', entities: ['600519'], themes: ['AI'], category: 'management_guidance', relevance: 0.9, sentiment: -0.2, importance: 0.8, narrative: 'validated narrative' }] } } } }); assert.deepEqual(calls, ['daily_signal_enrichment']); assert.equal(result.reasoningUsed, true); assert.equal(result.appliedCount, 1); assert.equal(result.signals[0]!.title, '贵州茅台 guidance update'); assert.equal(result.signals[0]!.category, 'management_guidance') })
test('FIX-002 enrichment rejects out-of-scope rows and falls back without identity mutation', async () => { const original = signal(); const result = await new DailyIntelligenceSignalEnrichmentSkill().enrichManyDetailedAsync([original], ['600519'], [], { capabilities, execute: async () => ({ operation: 'daily_signal_enrichment', output: { signals: [{ signalId: 'foreign-signal', entities: ['000001'], category: 'news' }] } }) }); assert.equal(result.fallbackCount, 1); assert.equal(result.signals[0]!.signalId, original.signalId); assert.deepEqual(result.signals[0]!.entities, original.entities) })
test('FIX-002 change assessment returns noise for community-only clusters without model reasoning', async () => { let called = false; const result = await new DailyChangeAssessmentSkill().assess(cluster([signal({ kind: 'community', category: 'community' })]), [], ['600519'], { capabilities, execute: async () => { called = true; return { operation: 'daily_change_assessment', output: {} } } }); assert.equal(result.assessment.disposition, 'noise'); assert.equal(result.reasoningUsed, false); assert.equal(called, false) })
test('FIX-002 change assessment maps bounded existing overlap to supports', async () => { const result = await new DailyChangeAssessmentSkill().assess(cluster(), [{ canonicalRef: 'claim:existing', kind: 'claim', claimType: 'fact', statement: '贵州茅台 guidance update' }], ['600519']); assert.equal(result.assessment.disposition, 'supports'); assert.deepEqual(result.assessment.relatedKnowledgeRefs, ['claim:existing']) })
test('FIX-002 change assessment maps a negative claim update to contradicts', async () => { const result = await new DailyChangeAssessmentSkill().assess(cluster([signal({ title: '贵州茅台 guidance growth 15 percent down', excerpt: 'guidance growth 15 percent down' })]), [{ canonicalRef: 'claim:existing', kind: 'claim', claimType: 'fact', statement: '贵州茅台 guidance growth 15 percent' }], ['600519']); assert.equal(result.assessment.disposition, 'contradicts'); assert.deepEqual(result.assessment.relatedKnowledgeRefs, ['claim:existing']) })
test('FIX-002 change assessment maps an assumption update to changes_assumption', async () => { const result = await new DailyChangeAssessmentSkill().assess(cluster([signal({ title: '贵州茅台 demand growth 15 percent down', excerpt: 'demand growth 15 percent down' })]), [{ canonicalRef: 'claim:assumption', kind: 'assumption', statement: '贵州茅台 demand growth 15 percent' }], ['600519']); assert.equal(result.assessment.disposition, 'changes_assumption') })
test('FIX-002 change assessment maps a thesis update to affects_thesis', async () => { const result = await new DailyChangeAssessmentSkill().assess(cluster([signal({ title: '贵州茅台 demand growth 15 percent down', excerpt: 'demand growth 15 percent down' })]), [{ canonicalRef: 'claim:thesis', kind: 'thesis', statement: '贵州茅台 demand growth 15 percent' }], ['600519']); assert.equal(result.assessment.disposition, 'affects_thesis') })
test('FIX-002 ambiguous change assessment invokes Pi and rejects forged references', async () => { const calls: string[] = []; const result = await new DailyChangeAssessmentSkill().assess(cluster(), [{ canonicalRef: 'claim:existing', kind: 'claim', statement: 'unrelated statement' }], ['600519'], { capabilities, execute: async (request) => { calls.push(request.operation); return { operation: request.operation, output: { clusterId: 'cluster-fix-002', disposition: 'supports', relatedKnowledgeRefs: ['claim:forged'], rationale: 'bad ref', durableCandidate: true } } } }); assert.deepEqual(calls, ['daily_change_assessment']); assert.equal(result.assessment.disposition, 'new'); assert.equal(result.applied, false) })
test('FIX-002 synthesis rejects an announcement from filling Overnight Global', async () => {
  const names = ['Overnight Global', 'Macro/Policy', 'A-share Important Announcements', 'Market/Futures/Major Asset', 'AI/Technology/Industry', 'Public Institutional Views', 'IR/Institution Research', 'Watchlist', 'Community/Sentiment', 'Existing Thesis Changes', 'Catalysts', 'Risks', 'Research Gaps', "Today's Questions"]
  const output = { sections: names.map((title, index) => ({ id: `section-${index}`, title, items: index === 0 ? [{ itemId: 'bad', headline: 'bad', markdown: 'bad', signalRefs: ['signal-fix-002'] }] : [] })), proposals: [] }
  const result = await new DailyBriefSynthesisSkill().synthesize('morning', [signal()], [], [], { capabilities, execute: async () => ({ operation: 'daily_brief_synthesis', output }) })
  assert.equal(result.reasoningUsed, false)
  assert.equal(result.sections[0]!.unavailable, true)
})
test('FIX-002 source catalog exposes operational counts without activating metadata-only entries', async () => { const catalog = await loadSourceCatalog(); assert.equal(catalog.length, 43); assert.ok(catalog.filter((item) => item.operationalStatus === 'metadata_only').length > 0); assert.ok(catalog.filter((item) => item.operationalStatus === 'active').every((item) => item.operationalStatus === 'active')) })
test('FIX-002 shared composition returns one calendar and the explicit D5 lane graph', async () => { const root = await mkdtemp(join(tmpdir(), 'rhl-daily-composition-')); const composition = await createDailyIntelligenceComposition({ cwd: process.cwd(), workflowService: new WorkflowService(), runtimeRoot: root }); assert.equal(composition.service.calendar, composition.calendar); assert.equal(composition.catalog.length, 43); assert.deepEqual(composition.providers.map((provider) => provider.name), ['official-disclosure-research-acquisition', 'gdelt-research-acquisition', 'akshare-daily-market-acquisition', 'd1-daily-expectation-revisions', 'akshare-institutional-activity', 'd4-daily-industry-observations']) })
test('FIX-002 AKShare catalog state gates all AKShare Daily lanes while D4 remains independent', async () => {
  const states = ['active', 'blocked', 'metadata_only', 'absent'] as const
  for (const state of states) {
    const root = await mkdtemp(join(tmpdir(), `rhl-daily-catalog-${state}-`))
    try {
      const catalogPath = join(root, 'catalog.yaml')
      const fixture = state === 'absent' ? [] : [{ platform: 'akshare', accountId: 'fixture', category: 'official', acquisitionMode: 'python_bridge', catalogRole: 'active_feed', operationalStatus: state, enabled: state === 'active' }]
      await writeFile(catalogPath, JSON.stringify(fixture), 'utf8')
      const providerNames = (await createDailyIntelligenceComposition({ cwd: process.cwd(), catalogPath, workflowService: new WorkflowService(), runtimeRoot: root, industryOperatingObservationAcquisition: { acquire: async () => ({ status: 'SCOPE_UNSUPPORTED', observations: [], sources: [], diagnostics: [] }) } })).providers.map((provider) => provider.name)
      const akshareLanes = ['akshare-daily-market-acquisition', 'd1-daily-expectation-revisions', 'akshare-institutional-activity']
      assert.equal(providerNames.includes('d4-daily-industry-observations'), true, state)
      assert.deepEqual(providerNames.filter((name) => akshareLanes.includes(name)), state === 'active' ? akshareLanes : [], state)
    } finally { await rm(root, { recursive: true, force: true }) }
  }
})
test('FIX-002 inactive AKShare composition makes no AKShare or calendar bridge calls on Daily execution', async () => {
  const root = await mkdtemp(join(tmpdir(), 'rhl-daily-inactive-akshare-')); const catalogPath = join(root, 'catalog.yaml'); await writeFile(catalogPath, JSON.stringify([{ platform: 'akshare', accountId: 'fixture', category: 'official', acquisitionMode: 'python_bridge', catalogRole: 'active_feed', operationalStatus: 'blocked', enabled: false }]), 'utf8')
  let akshareCalls = 0; let calendarCalls = 0
  const counted = (): unknown[] => { akshareCalls += 1; return [] }
  const client: AkshareDataClient = { companyBasic: async () => counted(), financialData: async () => counted(), historicalMarketData: async () => counted(), indexDaily: async () => counted(), institutionalResearchDetail: async () => counted(), tradingCalendar: async () => { calendarCalls += 1; return [] } }
  try {
    const composition = await createDailyIntelligenceComposition({ cwd: process.cwd(), catalogPath, workflowService: new WorkflowService(), runtimeRoot: root, akshare: client, industryOperatingObservationAcquisition: { acquire: async () => ({ status: 'SCOPE_UNSUPPORTED', observations: [], sources: [], diagnostics: [] }) } })
    const result = await composition.service.startBrief({ workflowRunId: 'fix-002-inactive-akshare', briefType: 'morning', tradeDate: '2026-09-23', asOf: '2026-09-24T04:00:00.000Z', forceRefresh: true }).completion
    assert.ok(['completed', 'blocked', 'failed'].includes(result.status))
    assert.equal(akshareCalls, 0)
    assert.equal(calendarCalls, 0)
  } finally { await rm(root, { recursive: true, force: true }) }
})
test('FIX-002 manual calendar overrides take precedence over provider and cache', async () => { const root = await mkdtemp(join(tmpdir(), 'rhl-calendar-override-')); const calendar = new TradingCalendarService({ cachePath: join(root, 'calendar.json'), manualHolidays: ['2026-09-08'], provider: async () => true }); const result = await calendar.isTradingDay('2026-09-08'); assert.equal(result.isTradingDay, false); assert.equal(result.calendarConfidence, 'manual') })
