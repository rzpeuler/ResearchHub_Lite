import { mkdir, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { getAgentDir, ModelRuntime } from '@earendil-works/pi-coding-agent'
import type { Api, Model } from '@earendil-works/pi-ai'
import { PiReasoningExecutor } from '../../plugins/reasoning/pi/executor.ts'
import { selectProductionReasoningModel } from '../../app/pi/model-selection.ts'
import { FileDailySignalStore } from '../../plugins/daily-intelligence/signal-store.ts'
import { runDailyIntelligence } from '../../workflows/daily-intelligence/workflow.ts'
import { sha256 } from '../../plugins/research-acquisition/hash.ts'
import type { ResearchAcquisitionPlugin } from '../../plugins/research-acquisition/contracts.ts'
import { createFreshKnowledgeBaseV04 } from '../../knowledge/storage/index.ts'
import { KnowledgeBaseRegistry } from '../../knowledge/registry/registry.ts'
import { KnowledgeProductionGateway } from '../../knowledge/production/gateway.ts'

const root = resolve('tests/validation/evidence')
await mkdir(root, { recursive: true })
const fixture: ResearchAcquisitionPlugin = {
  name: 'fixture-public-retained-fix-002',
  async discover() { return [
    { candidateId: 'daily-pi-fix-002-official', kind: 'official_disclosure', tier: 1, title: '贵州茅台 management guidance update', provider: 'cninfo', publishedAt: '2026-09-08T00:00:00.000Z', metadata: { companySymbol: '600519' } },
    { candidateId: 'daily-pi-fix-002-market', kind: 'structured_data', tier: 2, title: 'A-share market index observation', provider: 'akshare', publishedAt: '2026-09-08T00:10:00.000Z', metadata: { companySymbol: 'BROAD_SCOPE' } },
    { candidateId: 'daily-pi-fix-002-institution', kind: 'web_article', tier: 2, title: 'Institutional view on premium spirits demand', provider: 'institution-fixture', publishedAt: '2026-09-08T00:20:00.000Z', metadata: { companySymbol: '600519' } },
  ] },
  async fetch(candidate) { const content = `${candidate.title}: public retained fixture evidence. Demand and guidance observation for bounded semantic processing.`; return { candidate, retrievedAt: '2026-09-08T01:00:00.000Z', content, rawBytes: new TextEncoder().encode(content), contentHash: sha256(content) } },
  async normalize(source) { return { candidate: source.candidate, retrievedAt: source.retrievedAt, title: source.candidate.title, content: source.content, rawBytes: source.rawBytes, contentHash: source.contentHash!, publisher: source.candidate.provider, rights: { accessScope: 'public', retentionAllowed: true, aiProcessingAllowed: true, derivativeKnowledgeAllowed: true, redistributionAllowed: false } } },
}

let runtime: ModelRuntime | undefined
try {
  runtime = await ModelRuntime.create({ authPath: join(getAgentDir(), 'auth.json'), modelsPath: join(getAgentDir(), 'models.json'), allowModelNetwork: true, refreshOnCreate: false })
  const model = selectProductionReasoningModel(runtime) as Model<Api>
  const delegate = new PiReasoningExecutor({ modelRuntime: runtime, model, timeoutMs: 900_000, maxOutputChars: 200_000 })
  const operations: string[] = []
  const executor = { capabilities: () => delegate.capabilities(), execute: async (request: Parameters<typeof delegate.execute>[0], signal?: AbortSignal) => { operations.push(request.operation); return delegate.execute(request, signal) } }
  const kbRoot = join(root, 'daily-pi-fix-002-kb')
  await createFreshKnowledgeBaseV04(kbRoot, { knowledgeBaseId: 'kb-daily-pi-fix-002', now: '2026-09-08T00:00:00.000Z' })
  const seedSource = await fixture.fetch({ candidateId: 'daily-pi-fix-002-official', kind: 'official_disclosure', tier: 1, title: '贵州茅台 management guidance update', provider: 'cninfo', metadata: { companySymbol: '600519' } })
  const normalizedSeed = await fixture.normalize(seedSource)
  const seedHandle = await new KnowledgeBaseRegistry().mount(kbRoot)
  await new KnowledgeProductionGateway().submit({ handle: seedHandle, producerType: 'daily_intelligence', producerRunId: 'daily-pi-fix-002-seed', schemaProfile: { schemaVersion: '0.4', storageFormatVersion: '1', requiresRawProvenance: true }, entity: { localKey: '600519', entityType: 'company', name: '贵州茅台', semanticFields: { ticker: '600519', exchange: 'SSE' } }, proposals: [
    { proposalId: 'seed-assumption', kind: 'claim', subjectKey: '600519', claimType: 'assumption', statement: '贵州茅台 demand growth 15 percent', sourceCandidateIds: ['daily-pi-fix-002-official'], confidence: 0.7 },
    { proposalId: 'seed-thesis', kind: 'claim', subjectKey: '600519', claimType: 'thesis', statement: '贵州茅台 premium spirits demand remains durable', sourceCandidateIds: ['daily-pi-fix-002-official'], confidence: 0.7 },
  ], evidenceBindings: [{ localSourceId: normalizedSeed.candidate.candidateId, source: normalizedSeed }], asOf: '2026-09-08T00:00:00.000Z', now: () => '2026-09-08T00:00:00.000Z' })
  const base = { watchlist: { companies: [{ symbol: '600519', name: '贵州茅台', exchange: 'SSE' }], themes: ['AI'], industries: ['consumer'] }, providers: [fixture], signalStore: new FileDailySignalStore(join(root, 'daily-pi-fix-002-signals.jsonl')), briefRoot: join(root, 'daily-pi-fix-002-briefs'), reportRoot: join(root, 'daily-pi-fix-002-reports'), knowledgeBaseRoot: kbRoot, reasoningExecutor: executor, now: () => '2026-09-08T02:00:00.000Z' }
  const runs = []
  for (const briefType of ['morning', 'evening'] as const) runs.push(await runDailyIntelligence({ ...base, briefType, workflowRunId: `daily-pi-fix-002-${briefType}-${Date.now()}`, tradeDate: '2026-09-08', forceRefresh: true }))
  const telemetry = runs.map((run) => ({ status: run.status, briefType: run.brief?.briefType ?? null, sectionCount: run.brief?.sections.length ?? 0, signalCount: run.signals.length, reportItemCount: run.brief?.quality.reportItemCount ?? null, enrichmentReasoningUsed: run.enrichmentReasoningUsed ?? false, enrichmentAppliedCount: run.enrichmentAppliedCount ?? 0, enrichmentFallbackCount: run.enrichmentFallbackCount ?? 0, changeAssessmentReasoningUsed: run.changeAssessmentReasoningUsed ?? false, changeAssessmentAppliedCount: run.changeAssessmentAppliedCount ?? 0, briefReasoningUsed: run.briefReasoningUsed ?? false, modelDerivedItemCount: run.modelDerivedItemCount ?? 0, errors: run.errors }))
  const evidence = { generatedAt: new Date().toISOString(), taskId: 'RHL-PERSONAL-RESEARCH-V1-DAILY-INTELLIGENCE-001-FIX-002', classification: runs.every((run) => run.status === 'completed') ? 'EXECUTED' : 'PRODUCT_OR_ENVIRONMENT_BLOCKED', realPiReasoningExecutor: true, operations, model: delegate.runtimeMetadata(), operationCoverage: { enrichment: operations.includes('daily_signal_enrichment'), changeAssessment: operations.includes('daily_change_assessment'), synthesis: operations.includes('daily_brief_synthesis') }, runs: telemetry, secretsIncluded: false, rawBodiesIncluded: false }
  await writeFile(join(root, 'RHL_DAILY_INTELLIGENCE_V1_FIX_002_PI_E2E.json'), `${JSON.stringify(evidence, null, 2)}\n`, 'utf8')
  console.log(JSON.stringify(evidence, null, 2))
} catch (error) {
  const evidence = { generatedAt: new Date().toISOString(), taskId: 'RHL-PERSONAL-RESEARCH-V1-DAILY-INTELLIGENCE-001-FIX-002', classification: 'ENVIRONMENT_BLOCKED', realPiReasoningExecutor: true, error: error instanceof Error ? error.message : String(error), secretsIncluded: false, rawBodiesIncluded: false }
  await writeFile(join(root, 'RHL_DAILY_INTELLIGENCE_V1_FIX_002_PI_E2E.json'), `${JSON.stringify(evidence, null, 2)}\n`, 'utf8')
  console.error(JSON.stringify(evidence, null, 2))
  process.exitCode = 1
} finally { await Promise.resolve((runtime as unknown as { dispose?: () => void | Promise<void> } | undefined)?.dispose?.()).catch(() => undefined) }
