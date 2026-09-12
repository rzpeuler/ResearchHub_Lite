import assert from 'node:assert/strict'
import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { DailyIntelligenceSignalEnrichmentSkill } from '../../skills/daily-intelligence/enrichment.ts'
import { DailyChangeAssessmentSkill } from '../../skills/daily-intelligence/change-assessment.ts'
import { DailyBriefSynthesisSkill, type DailySynthesisProposal } from '../../skills/daily-intelligence/synthesis.ts'
import { validateProposals } from '../../workflows/daily-intelligence/workflow.ts'
import { runDailyIntelligence } from '../../workflows/daily-intelligence/workflow.ts'
import { FileDailySignalStore } from '../../plugins/daily-intelligence/signal-store.ts'
import { createFreshKnowledgeBaseV04 } from '../../knowledge/storage/index.ts'
import { readCanonicalV04Assets } from '../../knowledge/storage/index.ts'
import { readRaw } from '../../knowledge/raw/index.ts'
import { KnowledgeBaseRegistry } from '../../knowledge/registry/registry.ts'
import { KnowledgeProductionGateway } from '../../knowledge/production/gateway.ts'
import { sha256 } from '../../plugins/research-acquisition/hash.ts'
import type { DailyResearchSignal, DailySignalCluster, ResearchChangeAssessment } from '../../plugins/daily-intelligence/contracts.ts'
import type { ResearchAcquisitionPlugin } from '../../plugins/research-acquisition/contracts.ts'
import { WebResearchAcquisition } from '../../plugins/daily-intelligence/acquisition.ts'
import { AkshareDailyMarketAcquisition } from '../../plugins/daily-intelligence/market.ts'

const capabilities = () => ({ maxContextTokens: 20_000, maxOutputTokens: 4_000, structuredOutputSupport: true, maxConcurrency: 2 })
function signal(symbol = '600519', candidateId = `candidate-${symbol}`, overrides: Partial<DailyResearchSignal> = {}): DailyResearchSignal { return { signalId: `signal-${symbol}`, kind: 'announcement', category: 'announcement', provider: 'fixture', source: { candidateId, kind: 'official_disclosure', tier: 1, title: `${symbol} official update`, provider: 'fixture', metadata: { companySymbol: symbol } }, discoveredAt: '2026-09-08T00:00:00.000Z', entities: [symbol], themes: [], title: `${symbol} official update`, contentHash: `hash-${symbol}`, excerpt: `${symbol} demand growth update`, relevance: 0.8, novelty: 1, importance: 0.8, sourceTier: 1, ...overrides } }
function cluster(items: readonly DailyResearchSignal[], id = `cluster-${items[0]!.signalId}`): DailySignalCluster { return { clusterId: id, representativeSignal: items[0]!.signalId, signalRefs: items.map((item) => item.signalId), entities: [...new Set(items.flatMap((item) => item.entities))], themes: [], firstSeen: items[0]!.discoveredAt, lastSeen: items[0]!.discoveredAt, sourceDiversity: 1, importance: 0.8, title: items[0]!.title, signals: items } }
function assessment(clusterId: string, overrides: Partial<ResearchChangeAssessment> = {}): ResearchChangeAssessment { return { clusterId, disposition: 'supports', relatedKnowledgeRefs: ['claim:existing'], rationale: 'validated durable comparison', durableCandidate: true, subjectKey: '600519', ...overrides } }
function proposal(overrides: Partial<DailySynthesisProposal> = {}): DailySynthesisProposal { return { proposalId: 'proposal-1', kind: 'claim', subjectKey: '600519', claimType: 'viewpoint', statement: 'validated statement', sourceCandidateIds: ['candidate-600519'], assessmentRefs: ['cluster-company'], confidence: 0.8, ...overrides } }

test('FIX-003 enrichment accepts a finite partial row through a bounded wrapper and preserves identity', async () => {
  const original = signal()
  const result = await new DailyIntelligenceSignalEnrichmentSkill().enrichManyDetailedAsync([original], ['600519'], ['AI'], { capabilities, execute: async () => ({ operation: 'daily_signal_enrichment', output: { output: JSON.stringify({ signals: [{ signalId: original.signalId, narrative: 'model narrative' }] }) } }) })
  assert.equal(result.reasoningUsed, true)
  assert.equal(result.appliedCount, 1)
  assert.equal(result.signals[0]!.narrative, 'model narrative')
  assert.equal(result.signals[0]!.source.candidateId, original.source.candidateId)
  assert.equal(result.signals[0]!.contentHash, original.contentHash)
})

test('FIX-003 change assessment accepts fenced JSON only with supplied refs and recomputes durable eligibility', async () => {
  const item = signal()
  const currentCluster = cluster([item], 'cluster-model')
  const result = await new DailyChangeAssessmentSkill().assess(currentCluster, [{ canonicalRef: 'claim:existing', kind: 'claim', statement: 'unrelated' }], ['600519'], { capabilities, execute: async () => ({ operation: 'daily_change_assessment', output: `wrapped: \`\`\`json\n{"clusterId":"cluster-model","disposition":"supports","relatedKnowledgeRefs":["claim:existing"],"rationale":"model comparison","durableCandidate":true,"subjectKey":"600519"}\n\`\`\``.replace(/^wrapped: /, '') }) })
  assert.equal(result.reasoningUsed, true)
  assert.equal(result.applied, true)
  assert.equal(result.assessment.durableCandidate, true)
  assert.deepEqual(result.assessment.relatedKnowledgeRefs, ['claim:existing'])
})

test('FIX-003 synthesis accepts a complete section array with one model-derived item', async () => {
  const item = signal()
  const currentCluster = cluster([item], 'cluster-synthesis')
  const assessmentValue = assessment('cluster-synthesis')
  const titles = ['Overnight Global', 'Macro/Policy', 'A-share Important Announcements', 'Market/Futures/Major Asset', 'AI/Technology/Industry', 'Public Institutional Views', 'IR/Institution Research', 'Watchlist', 'Community/Sentiment', 'Existing Thesis Changes', 'Catalysts', 'Risks', 'Research Gaps', "Today's Questions"]
  const output = { sections: titles.map((title, index) => ({ id: `section-${index}`, title, items: title === 'A-share Important Announcements' ? [{ itemId: 'model-item', headline: 'model headline', markdown: 'model evidence', signalRefs: [item.signalId], assessmentRefs: [], kind: 'signal', rank: 1 }] : [] })), proposals: [] }
  const result = await new DailyBriefSynthesisSkill().synthesize('morning', [item], [currentCluster], [assessmentValue], { capabilities, execute: async () => ({ operation: 'daily_brief_synthesis', output: { data: JSON.stringify(output) } }) })
  assert.equal(result.reasoningUsed, true)
  assert.equal(result.modelDerivedItemCount, 1)
  assert.equal(result.sections.find((section) => section.title === 'A-share Important Announcements')?.items[0]?.headline, 'model headline')
})

test('FIX-003 proposal gate rejects missing, forged, unrelated, community-only, and non-durable assessments', () => {
  const companySignal = signal()
  const otherSignal = signal('000858')
  const companyCluster = cluster([companySignal], 'cluster-company')
  const otherCluster = cluster([otherSignal], 'cluster-other')
  const durable = assessment('cluster-company')
  const candidates = [companySignal, otherSignal]
  const symbols = ['600519', '000858']
  assert.equal(validateProposals([{ ...proposal(), assessmentRefs: [] } as DailySynthesisProposal], candidates, symbols, [durable], [companyCluster]).length, 0)
  assert.equal(validateProposals([null as unknown as DailySynthesisProposal, { ...proposal(), sourceCandidateIds: null as unknown as string[] }], candidates, symbols, [durable], [companyCluster]).length, 0)
  assert.equal(validateProposals([proposal({ assessmentRefs: ['forged-assessment'] })], candidates, symbols, [durable], [companyCluster]).length, 0)
  assert.equal(validateProposals([proposal({ assessmentRefs: ['cluster-other'] })], candidates, symbols, [durable, assessment('cluster-other', { subjectKey: '600519' })], [companyCluster, otherCluster]).length, 0)
  assert.equal(validateProposals([proposal({ subjectKey: '000858' })], candidates, symbols, [durable], [companyCluster]).length, 0)
  assert.equal(validateProposals([proposal({ assessmentRefs: ['cluster-company'] })], candidates, symbols, [assessment('cluster-company', { durableCandidate: false })], [companyCluster]).length, 0)
  assert.equal(validateProposals([proposal({ assessmentRefs: ['cluster-company'] })], candidates, symbols, [assessment('cluster-company', { disposition: 'new', durableCandidate: true })], [companyCluster]).length, 0)
  const community = signal('600519', 'candidate-community', { kind: 'community', category: 'community', sourceTier: 3 })
  const communityCluster = cluster([community], 'cluster-community')
  assert.equal(validateProposals([proposal({ sourceCandidateIds: ['candidate-community'], assessmentRefs: ['cluster-community'] })], [community], ['600519'], [assessment('cluster-community')], [communityCluster]).length, 0)
  assert.equal(validateProposals([proposal()], [companySignal], ['600519'], [durable], [companyCluster]).length, 1)
})

test('FIX-003 ordinary announcement is admissible only in announcement sections', async () => {
  const item = signal()
  const result = await new DailyBriefSynthesisSkill().synthesize('morning', [item], [], [])
  for (const title of ['Overnight Global', 'Macro/Policy', 'Market/Futures/Major Asset', 'Community/Sentiment']) assert.ok(result.sections.find((section) => section.title === title)?.unavailable)
  assert.ok(!result.sections.find((section) => section.title === 'A-share Important Announcements')?.unavailable)
})

test('FIX-002 Daily acquisition preserves Company metadata and guards Industry identity', async () => {
  const fetchImpl = async () => new Response('<item><title>Fixture update</title><link>https://example.test/update</link></item>', { headers: { 'content-type': 'application/rss+xml' } })
  const plugin = new WebResearchAcquisition({ provider: 'fixture', urls: ['https://example.test/feed'], fetchImpl, scope: 'company' })
  const company = await plugin.discover({ company: { symbol: '600519' } })
  assert.equal(company[0]?.metadata?.companySymbol, '600519')
  const industry = await plugin.discover({ industry: { name: 'PCB', searchTerms: ['PCB'] } })
  assert.equal(industry[0]?.metadata?.companySymbol, undefined)
  assert.equal('companySymbol' in (industry[0]?.metadata ?? {}), false)
})

test('FIX-002 Daily market preserves Company and BROAD_SCOPE endpoints and returns no Industry candidates', async () => {
  const plugin = new AkshareDailyMarketAcquisition({ companyBasic: async () => [], financialData: async () => [], historicalMarketData: async () => [] })
  const company = await plugin.discover({ company: { symbol: '600519' }, asOf: '2026-09-08' })
  assert.deepEqual(company.map((item) => item.metadata?.endpoint), ['600519'])
  const broad = await plugin.discover({ company: { symbol: 'BROAD_SCOPE' }, asOf: '2026-09-08' })
  assert.deepEqual(broad.map((item) => item.metadata?.endpoint), ['000001', '399001', '399006', '000688', 'sector'])
  const industry = await plugin.discover({ industry: { name: 'PCB', searchTerms: ['PCB'] }, asOf: '2026-09-08' })
  assert.deepEqual(industry, [])
})

test('FIX-003 evidence binding keeps 100 acquired candidates bounded to one referenced Raw/Source', async () => {
  const root = await mkdtemp(join(tmpdir(), 'rhl-daily-fix-003-evidence-'))
  await createFreshKnowledgeBaseV04(root, { knowledgeBaseId: 'kb-fix-003-evidence', now: '2026-09-08T00:00:00.000Z' })
  const acquired = Array.from({ length: 100 }, (_, index) => signal('600519', `candidate-${index}`))
  const retained = 'x'.repeat(1000)
  const source = { candidate: acquired[0]!.source, retrievedAt: '2026-09-08T01:00:00.000Z', title: acquired[0]!.title, content: retained, rawBytes: new TextEncoder().encode(retained), contentHash: sha256(retained), publisher: 'fixture', rights: { accessScope: 'public' as const, retentionAllowed: true, aiProcessingAllowed: true, derivativeKnowledgeAllowed: true, redistributionAllowed: false } }
  const handle = await new KnowledgeBaseRegistry().mount(root)
  const result = await new KnowledgeProductionGateway().submit({ handle, producerType: 'daily_intelligence', producerRunId: 'fix-003-evidence', schemaProfile: { schemaVersion: '0.4', storageFormatVersion: '1', requiresRawProvenance: true }, entity: { localKey: '600519', entityType: 'company', name: 'Moutai', semanticFields: { ticker: '600519', exchange: 'SSE' } }, proposals: [{ proposalId: 'one-proposal', kind: 'claim', subjectKey: '600519', claimType: 'viewpoint', statement: 'one referenced signal', sourceCandidateIds: [acquired[0]!.source.candidateId], confidence: 0.8 }], evidenceBindings: [{ localSourceId: acquired[0]!.source.candidateId, source }], asOf: '2026-09-08T00:00:00.000Z', now: () => '2026-09-08T02:00:00.000Z' })
  assert.equal(acquired.length, 100)
  assert.equal(Object.keys(result.sourceRefsByLocalId).length, 1)
  const assets = await readCanonicalV04Assets(root)
  const canonicalSource = assets.objects.find((item) => item.kind === 'source')?.value as { rawRefs?: string[] } | undefined
  assert.equal(canonicalSource?.rawRefs?.length, 1)
  assert.equal((await readRaw(handle, canonicalSource!.rawRefs![0]!)).length, 1000)
})

test('FIX-003 real workflow processes two durable subjects through separate Gateway groups', async () => {
  const root = await mkdtemp(join(tmpdir(), 'rhl-daily-fix-003-workflow-'))
  const kbRoot = join(root, 'kb')
  await createFreshKnowledgeBaseV04(kbRoot, { knowledgeBaseId: 'kb-fix-003-workflow', now: '2026-09-08T00:00:00.000Z' })
  const provider: ResearchAcquisitionPlugin = { name: 'fix-003-official', async discover(request) { if (!request.company) return []; const symbol = request.company!.symbol === 'BROAD_SCOPE' ? '600519' : request.company!.symbol; return [{ candidateId: `candidate-${symbol}`, kind: 'official_disclosure', tier: 1, title: `${symbol} demand growth update`, provider: 'fixture', publishedAt: '2026-09-08T00:00:00.000Z', metadata: { companySymbol: symbol } }] }, async fetch(candidate) { const content = `${candidate.title}: retained raw source for ${candidate.metadata?.companySymbol}.`; return { candidate, retrievedAt: '2026-09-08T01:00:00.000Z', content, rawBytes: new TextEncoder().encode(content), contentHash: sha256(content) } }, async normalize(source) { return { candidate: source.candidate, retrievedAt: source.retrievedAt, title: source.candidate.title, content: source.content, rawBytes: source.rawBytes, contentHash: source.contentHash!, publisher: 'fixture', rights: { accessScope: 'public', retentionAllowed: true, aiProcessingAllowed: true, derivativeKnowledgeAllowed: true, redistributionAllowed: false } } } }
  const companies = [{ symbol: '600519', name: 'Moutai', exchange: 'SSE' }, { symbol: '000858', name: 'Wuliangye', exchange: 'SZSE' }]
  const seed = async (symbol: string, name: string, exchange: string) => { const candidate = { candidateId: `candidate-${symbol}`, kind: 'official_disclosure' as const, tier: 1 as const, title: `${symbol} demand growth update`, provider: 'fixture', metadata: { companySymbol: symbol } }; const content = `${candidate.title}: retained raw source for ${symbol}.`; const normalized = { candidate, retrievedAt: '2026-09-08T01:00:00.000Z', title: candidate.title, content, rawBytes: new TextEncoder().encode(content), contentHash: sha256(content), publisher: 'fixture', rights: { accessScope: 'public' as const, retentionAllowed: true, aiProcessingAllowed: true, derivativeKnowledgeAllowed: true, redistributionAllowed: false } }; const handle = await new KnowledgeBaseRegistry().mount(kbRoot); await new KnowledgeProductionGateway().submit({ handle, producerType: 'daily_intelligence', producerRunId: `seed-${symbol}`, schemaProfile: { schemaVersion: '0.4', storageFormatVersion: '1', requiresRawProvenance: true }, entity: { localKey: symbol, entityType: 'company', name, semanticFields: { ticker: symbol, exchange } }, proposals: [{ proposalId: `seed-${symbol}`, kind: 'claim', subjectKey: symbol, claimType: 'fact', statement: `${symbol} demand growth update`, sourceCandidateIds: [candidate.candidateId], confidence: 0.8 }], evidenceBindings: [{ localSourceId: candidate.candidateId, source: normalized }], asOf: '2026-09-08T00:00:00.000Z', now: () => '2026-09-08T00:00:00.000Z' }) }
  await seed('600519', 'Moutai', 'SSE'); await seed('000858', 'Wuliangye', 'SZSE')
  const result = await runDailyIntelligence({ workflowRunId: 'fix-003-two-company', briefType: 'morning', tradeDate: '2026-09-08', watchlist: { companies, themes: [], industries: [] }, providers: [provider], signalStore: new FileDailySignalStore(join(root, 'signals.jsonl')), briefRoot: join(root, 'briefs'), reportRoot: join(root, 'reports'), knowledgeBaseRoot: kbRoot, forceRefresh: true, now: () => '2026-09-08T02:00:00.000Z' })
  assert.equal(result.status, 'completed')
  assert.equal(result.brief?.quality.gatewaySubmittedProposalCount, 2)
  assert.equal(result.committedKnowledgeRefs.length > 0, true)
  const report = await readFile(result.reportPath!, 'utf8')
  assert.doesNotMatch(report, /source:signal-|entity:\d{6}|module:daily-intelligence/)
})
