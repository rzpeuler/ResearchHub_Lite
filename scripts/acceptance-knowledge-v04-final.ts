import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createFreshKnowledgeBaseV04, readCanonicalV04Assets } from '../knowledge/storage/index.ts'
import { KnowledgeBaseRegistry } from '../knowledge/registry/registry.ts'
import { KnowledgeProductionGateway } from '../knowledge/production/gateway.ts'
import type { ReasoningExecutor, ReasoningRequest, ReasoningResult } from '../plugins/reasoning/contracts.ts'
import type { NormalizedResearchSource, ResearchAcquisitionPlugin, ResearchFetchedSource, ResearchSourceCandidate } from '../plugins/research-acquisition/contracts.ts'
import type { AkshareDataClient } from '../plugins/research-acquisition/akshare.ts'
import { sha256 } from '../plugins/research-acquisition/hash.ts'
import { EARNINGS_REVIEW_SECTIONS } from '../skills/earnings-review/contracts.ts'
import { runEarningsReview } from '../workflows/earnings-review/workflow.ts'

const NOW = '2026-09-18T23:59:59.000Z'
const RIGHTS = { accessScope: 'public' as const, retentionAllowed: true, aiProcessingAllowed: true, derivativeKnowledgeAllowed: true, redistributionAllowed: false }

class FixtureExecutor implements ReasoningExecutor {
  capabilities() { return { maxContextTokens: 100_000, maxOutputTokens: 10_000, structuredOutputSupport: true, maxConcurrency: 2 } }
  async execute(request: ReasoningRequest): Promise<ReasoningResult> { return { operation: request.operation, operationId: `final-fixture-${request.operation}`, output: output() } }
}

function candidate(): ResearchSourceCandidate { return { candidateId: 'official-2026-h1', kind: 'official_disclosure', tier: 1, title: '2026年半年度报告', provider: 'cninfo', publishedAt: '2026-08-30T00:00:00.000Z', metadata: { companySymbol: '600519', fiscalYear: 2026, period: 'H1' } } }
function normalized(candidateValue: ResearchSourceCandidate, content: string, rawBytes?: Uint8Array): NormalizedResearchSource { return { candidate: candidateValue, retrievedAt: NOW, title: candidateValue.title, content, contentHash: sha256(content), ...(rawBytes === undefined ? {} : { rawBytes }), publisher: candidateValue.provider, rights: RIGHTS } }
function plugin(): ResearchAcquisitionPlugin { return { name: 'final-fixture-official-disclosure', discover: async () => [candidate()], fetch: async (item): Promise<ResearchFetchedSource> => ({ candidate: item, retrievedAt: NOW, content: 'Official verified earnings release: revenue, net profit, gross margin, and EPS.', rawBytes: new TextEncoder().encode('PDF:official verified earnings release'), mediaType: 'application/pdf' }), normalize: async (item) => normalized(item.candidate, item.content, item.rawBytes) } }
function akshare(): AkshareDataClient { return { companyBasic: async () => { throw new Error('not used') }, financialData: async () => [{ 报告期: '2025-06-30', 营业收入: 90, 净利润: 9, 销售毛利率: 40, 基本每股收益: 0.8 }, { 报告期: '2026-06-30', 营业收入: 120, 净利润: 15, 销售毛利率: 45, 基本每股收益: 1.2 }], historicalMarketData: async () => { throw new Error('not used') } } }
function output(): Record<string, unknown> {
  const assessments = [{ assessmentId: 'fact-impact', disposition: 'new_fact', existingKnowledgeRefs: [], sourceCandidateIds: ['official-2026-h1'], rationale: 'Official filing and exact-period structured data support the fact.' }, { assessmentId: 'thesis-impact', disposition: 'affects_thesis', existingKnowledgeRefs: [], sourceCandidateIds: ['official-2026-h1'], rationale: 'The verified release warrants a bounded thesis review.' }]
  const proposals = [{ proposalId: 'earnings-fact', kind: 'claim', claimType: 'fact', subjectKey: 'company', statement: 'The requested 2026 H1 earnings period contains a verified company result.', sourceCandidateIds: ['official-2026-h1'], assessmentRefs: ['fact-impact'] }, { proposalId: 'earnings-thesis', kind: 'claim', claimType: 'thesis', subjectKey: 'company', statement: 'The company can maintain long-term pricing power while earnings remain resilient.', sourceCandidateIds: ['official-2026-h1'], assessmentRefs: ['thesis-impact'] }]
  return { sections: EARNINGS_REVIEW_SECTIONS.map((title) => ({ title, markdown: `Verified final-closure evidence for ${title}.`, sourceCandidateIds: ['official-2026-h1'], assessmentRefs: ['fact-impact', 'thesis-impact'] })), impactAssessments: assessments, proposals }
}

async function main(): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), 'rhl-knowledge-v04-final-'))
  const reportRoot = join(root, 'reports')
  const registry = new KnowledgeBaseRegistry()
  try {
    await createFreshKnowledgeBaseV04(root, { knowledgeBaseId: 'kb-knowledge-v04-final', now: NOW })
    let handle = await registry.mount(root)
    const seed = await new KnowledgeProductionGateway(registry).submit({ handle, producerType: 'final_company_seed', producerRunId: 'final-company-seed', schemaProfile: { schemaVersion: '0.4', storageFormatVersion: '1', requiresRawProvenance: true }, entity: { localKey: 'company', entityType: 'company', name: '贵州茅台', aliases: ['600519'], semanticFields: { ticker: '600519', exchange: 'SSE' }, externalIdentifiers: [{ namespace: 'exchange_ticker', value: 'SSE:600519', confidence: 1 }] }, proposals: [], evidenceBindings: [], asOf: NOW, now: () => NOW })
    assert.equal(seed.status, 'committed', JSON.stringify(seed))
    handle = await registry.refresh(root)
    const first = await runEarningsReview({ workflowRunId: 'knowledge-v04-final-earnings', handle, company: { symbol: '600519', name: '贵州茅台', exchange: 'SSE' }, externalIdentifiers: [{ namespace: 'exchange_ticker', value: 'SSE:600519', confidence: 1 }, { namespace: 'cninfo', value: 'company-600519', confidence: 0.95 }], fiscalYear: 2026, period: 'H1', reportRoot, acquisitionPlugins: [plugin()], akshare: akshare(), reasoningExecutor: new FixtureExecutor(), now: () => NOW })
    assert.equal(first.status, 'completed', JSON.stringify(first))
    const beforeReplay = await readCanonicalV04Assets(root)
    const countsBefore = Object.fromEntries([...new Set(beforeReplay.objects.map((item) => item.kind))].map((kind) => [kind, beforeReplay.objects.filter((item) => item.kind === kind).length]))
    const event = beforeReplay.objects.find((item) => item.kind === 'event')?.value as Record<string, unknown> | undefined
    const observations = beforeReplay.objects.filter((item) => item.kind === 'observation').map((item) => item.value as Record<string, unknown>)
    const claims = beforeReplay.objects.filter((item) => item.kind === 'claim').map((item) => item.value as Record<string, unknown>)
    const theses = beforeReplay.objects.filter((item) => item.kind === 'thesis').map((item) => item.value as Record<string, unknown>)
    const edges = beforeReplay.objects.filter((item) => item.kind === 'reasoning_edge').map((item) => item.value as Record<string, unknown>)
    const company = beforeReplay.objects.find((item) => item.kind === 'entity' && (item.value as Record<string, unknown>).type === 'company')?.value as Record<string, unknown> | undefined
    assert.equal(event?.eventType, 'earnings_release')
    assert.ok((event?.sourceRefs as string[] | undefined)?.length)
    assert.deepEqual(new Set(observations.map((item) => item.metricRef)), new Set(['metric:revenue', 'metric:net_profit', 'metric:gross_margin', 'metric:eps']))
    assert.ok(claims.length >= 2)
    assert.ok(claims.every((item) => item.claimType !== 'thesis'))
    assert.ok(theses.length >= 1)
    assert.ok(edges.some((item) => String(item.sourceRef).startsWith('observation:') && String(item.targetRef).startsWith('claim:')))
    assert.ok(edges.some((item) => String(item.sourceRef).startsWith('claim:') && String(item.targetRef).startsWith('thesis:')))
    assert.deepEqual((company?.externalIdentifiers as Array<{ namespace: string; value: string }>).map((item) => `${item.namespace}:${item.value}`).sort(), ['cninfo:company-600519', 'exchange_ticker:SSE:600519'])
    const sourceCount = beforeReplay.objects.filter((item) => item.kind === 'source').length
    assert.ok(sourceCount >= 2)
    const raw = JSON.parse(await readFile(join(root, 'registry', 'raw.yaml'), 'utf8')) as Record<string, unknown>
    assert.ok(Object.keys(raw).length >= 2)
    handle = await registry.refresh(root)
    const second = await runEarningsReview({ workflowRunId: 'knowledge-v04-final-earnings', handle, company: { symbol: '600519', name: '贵州茅台', exchange: 'SSE' }, externalIdentifiers: [{ namespace: 'exchange_ticker', value: 'SSE:600519', confidence: 1 }, { namespace: 'cninfo', value: 'company-600519', confidence: 0.95 }], fiscalYear: 2026, period: 'H1', reportRoot, acquisitionPlugins: [plugin()], akshare: akshare(), reasoningExecutor: new FixtureExecutor(), now: () => NOW })
    const afterReplay = await readCanonicalV04Assets(root)
    assert.equal(second.status, 'completed', JSON.stringify(second))
    assert.deepEqual(Object.fromEntries([...new Set(afterReplay.objects.map((item) => item.kind))].map((kind) => [kind, afterReplay.objects.filter((item) => item.kind === kind).length])), countsBefore)
    const evidence = { schemaVersion: '0.4', workflowRunId: first.workflowRunId, knowledgeBaseId: first.knowledgeBaseId, firstRevision: first.knowledgeBaseRevision, replayRevision: second.knowledgeBaseRevision, canonicalIds: { event: event?.id, observations: observations.map((item) => item.id), claims: claims.map((item) => item.id), theses: theses.map((item) => item.id), reasoningEdges: edges.map((item) => item.id) }, refs: { company: company?.id, officialSourceCount: sourceCount }, assertions: { F1_realWorkflowCompletedAndOfficialEarningsEvent: true, F2_deterministicMetricObservations: true, F3_firstClassThesisAndNoNewThesisClaim: true, F4_reasoningEdgeEndpointContract: true, F5_typedExternalIdentifiersReloaded: true, F6_rawAndSourceProvenancePersisted: true, F7_replayPreservesCanonicalIdentityCounts: true } }
    const evidencePath = join(process.cwd(), 'docs', 'project-state', 'evidence', '2026-09-18-knowledge-v04-final-closure.json')
    await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8')
    console.log(JSON.stringify(evidence, null, 2))
  } finally { await rm(root, { recursive: true, force: true }) }
}

await main()
