import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createFreshKnowledgeBaseV04 } from '../../knowledge/storage/index.ts'
import { KnowledgeBaseRegistry } from '../../knowledge/registry/registry.ts'
import { KnowledgeProductionGateway } from '../../knowledge/production/gateway.ts'
import { runEarningsReview } from '../../workflows/earnings-review/workflow.ts'
import { sha256 } from '../../plugins/research-acquisition/hash.ts'
import type { ReasoningExecutor, ReasoningRequest, ReasoningResult } from '../../plugins/reasoning/contracts.ts'
import type { ResearchAcquisitionPlugin, ResearchFetchedSource, ResearchSourceCandidate } from '../../plugins/research-acquisition/contracts.ts'
import type { AkshareDataClient } from '../../plugins/research-acquisition/akshare.ts'
import { buildEarningsExpectationAnalysis, enrichEarningsReviewSectionsWithExpectations } from '../../workflows/earnings-review/expectations-integration.ts'
import { EARNINGS_REVIEW_SECTIONS } from '../../skills/earnings-review/contracts.ts'
import type { NormalizedResearchSource } from '../../plugins/research-acquisition/contracts.ts'
import type { ConsensusSnapshot, EstimatePoint, GuidanceRange, SegmentKpiDeltaInput } from '../../skills/earnings-review/expectations/contracts.ts'

const AS_OF = '2026-09-08T23:59:59.000Z'
const RESULT = '2026-08-30T00:00:00.000Z'

function source(candidateId: string, publishedAt = '2026-07-01T00:00:00.000Z', content = candidateId): NormalizedResearchSource {
  return { candidate: { candidateId, kind: 'web_article', tier: 3, title: candidateId, provider: 'fixture', publishedAt }, retrievedAt: publishedAt, title: candidateId, content, contentHash: sha256(content), publisher: 'fixture', rights: { accessScope: 'public', retentionAllowed: true, aiProcessingAllowed: true, derivativeKnowledgeAllowed: true, redistributionAllowed: false } }
}
function estimate(overrides: Partial<EstimatePoint> = {}): EstimatePoint {
  return { estimateId: 'estimate-a', metric: 'revenue', fiscalPeriod: '2026-H1', value: 100, unit: 'CNY', institutionKey: 'house-a', publishedAt: '2026-07-01T00:00:00.000Z', sourceCandidateIds: ['estimate-a-source'], ...overrides }
}
function actual() { return [{ metric: 'revenue' as const, value: 120, unit: 'CNY' as const, period: '2026-H1', comparator: 'eq' as const, calculation: 'observed' as const, sourceCandidateIds: ['actual-source'] }] }
function validBundle(overrides: Partial<NonNullable<Parameters<typeof buildEarningsExpectationAnalysis>[0]['expectations']>> = {}) {
  const estimates = [estimate(), estimate({ estimateId: 'estimate-b', institutionKey: 'house-b', value: 110, sourceCandidateIds: ['estimate-b-source'], publishedAt: '2026-07-02T00:00:00.000Z' })]
  const consensus: ConsensusSnapshot = { metric: 'revenue', fiscalPeriod: '2026-H1', unit: 'CNY', asOf: '2026-08-01T00:00:00.000Z', mean: 105, median: 105, high: 110, low: 100, count: 2, dispersion: 5, contributingEstimateIds: ['estimate-a', 'estimate-b'] }
  return { sources: [source('estimate-a-source'), source('estimate-b-source')], estimates, consensusSnapshots: [consensus], ...overrides }
}

class NoopExecutor implements ReasoningExecutor {
  capabilities() { return { maxContextTokens: 100_000, maxOutputTokens: 10_000, structuredOutputSupport: true, maxConcurrency: 1 } }
  async execute(request: ReasoningRequest): Promise<ReasoningResult> { return { operation: request.operation, operationId: 'w2-004-noop', output: {} } }
}

async function liveFixture() {
  const now = AS_OF; const root = await mkdtemp(join(tmpdir(), 'rhl-w2-004-')); const reports = join(root, 'reports'); await createFreshKnowledgeBaseV04(root, { knowledgeBaseId: 'kb-w2-004', now }); const registry = new KnowledgeBaseRegistry(); let handle = await registry.mount(root)
  const seedCandidate: ResearchSourceCandidate = { candidateId: 'seed-source', kind: 'official_disclosure', tier: 1, title: 'Seed coverage', provider: 'fixture', publishedAt: '2026-01-01T00:00:00.000Z', metadata: { companySymbol: '600519' } }
  const seed = { ...source('seed-source', '2026-01-01T00:00:00.000Z', 'seed'), candidate: seedCandidate }
  const seeded = await new KnowledgeProductionGateway(registry).submit({ handle, producerType: 'fixture', producerRunId: 'seed-w2-004', schemaProfile: { schemaVersion: '0.4', storageFormatVersion: '1', requiresRawProvenance: true }, entity: { localKey: 'company', entityType: 'company', name: '贵州茅台', aliases: ['600519'], semanticFields: { ticker: '600519', exchange: 'SH' } }, proposals: [{ proposalId: 'seed-claim', kind: 'claim', claimType: 'fact', subjectKey: 'company', statement: 'Seed coverage exists.', sourceCandidateIds: ['seed-source'] }], evidenceBindings: [{ localSourceId: 'seed-source', source: seed }], asOf: now, now: () => now })
  if (seeded.status !== 'committed') throw new Error(JSON.stringify(seeded)); handle = await registry.mount(root)
  const candidate: ResearchSourceCandidate = { candidateId: 'official-2026-h1', kind: 'official_disclosure', tier: 1, title: '2026年半年度报告', provider: 'fixture', publishedAt: RESULT, metadata: { companySymbol: '600519' } }
  const plugin: ResearchAcquisitionPlugin = { name: 'fixture-official-disclosure', discover: async () => [candidate], fetch: async (item): Promise<ResearchFetchedSource> => ({ candidate: item, retrievedAt: now, content: 'official filing', contentHash: sha256('official filing') }), normalize: async (item) => ({ ...source(item.candidate.candidateId, item.candidate.publishedAt ?? now, item.content), candidate: item.candidate }) }
  const akshare: AkshareDataClient = { companyBasic: async () => { throw new Error('not used') }, financialData: async () => [{ 报告期: '2026-06-30', 营业收入: 120, 净利润: 15 }, { 报告期: '2025-06-30', 营业收入: 100, 净利润: 10 }], historicalMarketData: async () => { throw new Error('not used') } }
  return { root, reports, handle, plugin, akshare, async close() { await rm(root, { recursive: true, force: true }) } }
}

test('W2-004 live Workflow enriches report after expectation-blind reasoning without canonicalizing expectation sources', async () => {
  const fixture = await liveFixture()
  try {
    const expectationSources = [source('estimate-a-source'), source('estimate-b-source')]
    const result = await runEarningsReview({ workflowRunId: 'w2-004-live', handle: fixture.handle, company: { symbol: '600519', name: '贵州茅台', exchange: 'SSE' }, fiscalYear: 2026, period: 'H1', reportRoot: fixture.reports, acquisitionPlugins: [fixture.plugin], akshare: fixture.akshare, reasoningExecutor: new NoopExecutor(), now: () => AS_OF, expectations: validBundle({ sources: expectationSources }) })
    assert.equal(result.status, 'completed')
    assert.equal(result.telemetry.consensusStatus, 'available')
    assert.equal(result.telemetry.expectationStatus, 'available')
    assert.equal(result.telemetry.expectationDiagnosticCount, 0)
    assert.equal(result.expectationAnalysis?.actualVsConsensus.length, 1)
    const report = await readFile(result.report!.outputPath, 'utf8')
    assert.match(report, /Point-in-time consensus comparison is available for 1 current-period metric/)
    assert.doesNotMatch(report, /Valuation Implications[\s\S]*Consensus unavailable/)
    assert.equal(result.sourceIds.some((id) => id.includes('estimate-a-source') || id.includes('estimate-b-source')), false)
    assert.equal(result.claimIds.length, 0)
  } finally { await fixture.close() }
})

test('W2-004 no bundle is empty and valid PIT consensus uses exact existing arithmetic', () => {
  const empty = buildEarningsExpectationAnalysis({ analysisAsOf: AS_OF, resultPublishedAt: RESULT, actualMetrics: actual() })
  assert.equal(empty.consensusStatus, 'unavailable')
  const result = buildEarningsExpectationAnalysis({ analysisAsOf: AS_OF, resultPublishedAt: RESULT, actualMetrics: actual(), expectations: validBundle() })
  assert.equal(result.consensusStatus, 'available')
  assert.deepEqual(result.actualVsConsensus[0]?.result, { metric: 'revenue', fiscalPeriod: '2026-H1', actual: 120, benchmark: 105, absoluteDelta: 15, relativeDelta: 15 / 105, direction: 'above', benchmarkType: 'consensus' })
  assert.deepEqual(result.actualVsConsensus[0]?.sourceCandidateIds, ['actual-source', 'estimate-a-source', 'estimate-b-source'])
})

test('W2-004 selects latest strict pre-result consensus and rejects look-ahead', () => {
  const older: ConsensusSnapshot = { metric: 'revenue', fiscalPeriod: '2026-H1', unit: 'CNY', asOf: '2026-07-15T00:00:00.000Z', mean: 100, median: 100, high: 100, low: 100, count: 2, dispersion: 0, contributingEstimateIds: ['estimate-a', 'estimate-b'] }
  const newer: ConsensusSnapshot = { ...older, asOf: '2026-08-15T00:00:00.000Z', mean: 105, median: 105, high: 110, low: 100, dispersion: 5 }
  const post: ConsensusSnapshot = { ...newer, asOf: RESULT, mean: 120, median: 120, high: 120, low: 120, dispersion: 0 }
  const result = buildEarningsExpectationAnalysis({ analysisAsOf: AS_OF, resultPublishedAt: RESULT, actualMetrics: actual(), expectations: validBundle({ consensusSnapshots: [post, newer, older] }) })
  assert.equal(result.actualVsConsensus[0]?.result.benchmark, 105)
  assert.ok(result.diagnostics.includes(`consensus_not_pre_result:revenue:2026-H1:${RESULT}`))
  const postOnly = buildEarningsExpectationAnalysis({ analysisAsOf: AS_OF, resultPublishedAt: RESULT, actualMetrics: actual(), expectations: validBundle({ consensusSnapshots: [post] }) })
  assert.equal(postOnly.consensusStatus, 'unavailable')
  assert.equal(postOnly.actualVsConsensus.length, 0)
})

test('W2-004 fails closed on ambiguous or inconsistent consensus and duplicate source identity', () => {
  const base = validBundle()
  const ambiguous: ConsensusSnapshot = { ...base.consensusSnapshots![0]!, asOf: '2026-08-15T00:00:00.000Z', mean: 104, median: 104, high: 110, low: 100, dispersion: 6 }
  const conflictingSource = source('estimate-a-source', '2026-07-01T00:00:00.000Z', 'different')
  const result = buildEarningsExpectationAnalysis({ analysisAsOf: AS_OF, resultPublishedAt: RESULT, actualMetrics: actual(), expectations: { ...base, sources: [...base.sources, conflictingSource], consensusSnapshots: [base.consensusSnapshots![0]!, ambiguous] } })
  assert.equal(result.consensusStatus, 'unavailable')
  assert.ok(result.diagnostics.includes('ambiguous_expectation_source:estimate-a-source'))
  assert.ok(result.diagnostics.some((item) => item.startsWith('consensus_inconsistent:')))
  assert.ok(result.diagnostics.some((item) => item.startsWith('expectation_source_missing:') || item.startsWith('ambiguous_expectation_source:')))
})

test('W2-004 prior estimate and revision require explicit institution and links', () => {
  const old = estimate({ estimateId: 'old', value: 90, publishedAt: '2026-06-01T00:00:00.000Z', sourceCandidateIds: ['old-source'] })
  const newer = estimate({ estimateId: 'new', value: 95, publishedAt: '2026-07-15T00:00:00.000Z', sourceCandidateIds: ['new-source'] })
  const result = buildEarningsExpectationAnalysis({ analysisAsOf: AS_OF, resultPublishedAt: RESULT, actualMetrics: actual(), expectations: { ...validBundle({ estimates: [old, newer, estimate({ estimateId: 'other', institutionKey: 'house-b', value: 110, sourceCandidateIds: ['other-source'] })], consensusSnapshots: [] }), sources: [source('old-source'), source('new-source'), source('other-source')], priorEstimateInstitutionKeys: ['house-a', 'house-c'], estimateRevisionLinks: [{ oldEstimateId: 'old', newEstimateId: 'new' }] } })
  assert.equal(result.actualVsPriorEstimate.length, 1)
  assert.equal(result.actualVsPriorEstimate[0]?.result.benchmark, 95)
  assert.equal(result.estimateRevisions[0]?.result.absoluteRevision, 5)
  assert.ok(result.diagnostics.includes('prior_estimate_unavailable:house-c:revenue'))
})

test('W2-004 reuses Guidance and Segment KPI primitives without numeric inference', () => {
  const current: GuidanceRange = { guidanceId: 'guidance-current', metric: 'revenue', fiscalPeriod: '2026-H1', low: 100, high: 130, midpoint: 115, unit: 'CNY', guidanceType: 'range', publishedAt: '2026-08-01T00:00:00.000Z', sourceCandidateIds: ['guidance-current-source'], qualifiers: [] }
  const prior: GuidanceRange = { ...current, guidanceId: 'guidance-prior', low: 90, high: 120, midpoint: 105, publishedAt: '2026-06-01T00:00:00.000Z', sourceCandidateIds: ['guidance-prior-source'] }
  const segment: SegmentKpiDeltaInput = { current: { segmentKey: 'core', metric: 'revenue', fiscalPeriod: '2026-H1', value: 60, unit: 'CNY', sourceCandidateIds: ['segment-current'] }, priorComparable: { segmentKey: 'core', metric: 'revenue', fiscalPeriod: '2025-H1', value: 50, unit: 'CNY', sourceCandidateIds: ['segment-prior'] }, expectation: { segmentKey: 'core', metric: 'revenue', fiscalPeriod: '2026-H1', value: 55, unit: 'CNY', sourceCandidateIds: ['segment-expectation'] } }
  const sources = ['guidance-current-source', 'guidance-prior-source', 'segment-current', 'segment-prior', 'segment-expectation', 'estimate-a-source', 'estimate-b-source'].map((id) => source(id))
  const result = buildEarningsExpectationAnalysis({ analysisAsOf: AS_OF, resultPublishedAt: RESULT, actualMetrics: actual(), expectations: { ...validBundle({ consensusSnapshots: [] }), sources, guidances: [current, prior], currentGuidanceIds: ['guidance-current'], segmentKpiComparisons: [segment] } })
  assert.equal(result.guidanceRevisions.length, 1)
  assert.equal(result.segmentKpiDeltas.length, 1)
  const qualitative: GuidanceRange = { guidanceId: 'qualitative', metric: 'revenue', fiscalPeriod: '2026-H1', guidanceType: 'qualitative', publishedAt: '2026-08-01T00:00:00.000Z', sourceCandidateIds: ['qualitative-source'], qualifiers: ['stable demand'] }
  const qualitativeResult = buildEarningsExpectationAnalysis({ analysisAsOf: AS_OF, resultPublishedAt: RESULT, actualMetrics: actual(), expectations: { ...validBundle({ consensusSnapshots: [] }), sources: [...sources, source('qualitative-source')], guidances: [qualitative], currentGuidanceIds: ['qualitative'] } })
  assert.equal(qualitativeResult.guidanceRevisions.length, 0)
  assert.equal(qualitativeResult.guidanceVsConsensus.length, 0)
})

test('W2-004 enrichment preserves all 14 sections and removes the legacy sentinel only for valid consensus', () => {
  const sections = EARNINGS_REVIEW_SECTIONS.map((title) => ({ id: title.toLowerCase().replaceAll(' ', '-'), title, markdown: title === 'Valuation Implications' ? 'Consensus unavailable' : title, sourceCandidateIds: [], assessmentRefs: [] }))
  const analysis = buildEarningsExpectationAnalysis({ analysisAsOf: AS_OF, resultPublishedAt: RESULT, actualMetrics: actual(), expectations: validBundle() })
  const enriched = enrichEarningsReviewSectionsWithExpectations(sections, analysis)
  assert.equal(enriched.length, 14)
  assert.ok(!enriched.find((section) => section.title === 'Valuation Implications')?.markdown.includes('Consensus unavailable'))
  assert.match(enriched.find((section) => section.title === 'Valuation Implications')?.markdown ?? '', /Valuation impact is not calculated in W2-004/)
  assert.match(enriched.find((section) => section.title === 'Earnings Snapshot')?.markdown ?? '', /actual 120 vs PIT consensus 105/)
})
