import { mkdir, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { getAgentDir, ModelRuntime } from '@earendil-works/pi-coding-agent'
import type { Api, Model } from '@earendil-works/pi-ai'
import { PiReasoningExecutor } from '../../plugins/reasoning/pi/executor.ts'
import { selectProductionReasoningModel } from '../../app/pi/model-selection.ts'
import { FileDailySignalStore } from '../../plugins/daily-intelligence/signal-store.ts'
import { runDailyIntelligence } from '../../workflows/daily-intelligence/workflow.ts'
import { sha256 } from '../../plugins/research-acquisition/hash.ts'
import type { ResearchAcquisitionPlugin, ResearchSourceCandidate } from '../../plugins/research-acquisition/contracts.ts'
import { createFreshKnowledgeBaseV04 } from '../../knowledge/storage/index.ts'
import { KnowledgeBaseRegistry } from '../../knowledge/registry/registry.ts'
import { KnowledgeProductionGateway } from '../../knowledge/production/gateway.ts'

const root = resolve('tests/validation/evidence')
await mkdir(root, { recursive: true })
const companies = [{ symbol: '600519', name: '贵州茅台', exchange: 'SSE' as const }]
const fixture: ResearchAcquisitionPlugin = {
  name: 'fixture-public-retained-fix-003',
  async discover({ company }) {
    const symbol = company.symbol
    const entries: ResearchSourceCandidate[] = symbol === '600519' ? [
      { candidateId: 'daily-pi-fix-003-official', kind: 'official_disclosure', tier: 1, title: '贵州茅台 management guidance update', provider: 'cninfo', publishedAt: '2026-09-08T00:00:00.000Z', metadata: { companySymbol: '600519' } },
      { candidateId: 'daily-pi-fix-003-institution', kind: 'web_article', tier: 2, title: 'Institutional view on premium spirits demand', provider: 'institution-fixture', publishedAt: '2026-09-08T00:20:00.000Z', metadata: { companySymbol: '600519' } },
      { candidateId: 'daily-pi-fix-003-market', kind: 'structured_data', tier: 2, title: 'A-share market index observation', provider: 'akshare', publishedAt: '2026-09-08T00:10:00.000Z', metadata: { companySymbol: 'BROAD_SCOPE' } },
    ] : []
    return entries
  },
  async fetch(candidate) { const content = `${candidate.title}: public retained fixture evidence. Demand and guidance observation for bounded semantic processing.`; return { candidate, retrievedAt: '2026-09-08T01:00:00.000Z', content, rawBytes: new TextEncoder().encode(content), contentHash: sha256(content) } },
  async normalize(source) { return { candidate: source.candidate, retrievedAt: source.retrievedAt, title: source.candidate.title, content: source.content, rawBytes: source.rawBytes, contentHash: source.contentHash!, publisher: source.candidate.provider, rights: { accessScope: 'public', retentionAllowed: true, aiProcessingAllowed: true, derivativeKnowledgeAllowed: true, redistributionAllowed: false } } },
}

async function seedKnowledge(kbRoot: string, candidateId: string, symbol: string, name: string, exchange: 'SSE' | 'SZSE', claimType: 'fact' | 'assumption' | 'thesis', statement: string) {
  const candidate: ResearchSourceCandidate = { candidateId, kind: 'official_disclosure', tier: 1, title: `${symbol} retained seed`, provider: 'fixture', metadata: { companySymbol: symbol } }
  const content = `${candidate.title}: retained seed evidence.`
  const source = { candidate, retrievedAt: '2026-09-08T00:00:00.000Z', title: candidate.title, content, rawBytes: new TextEncoder().encode(content), contentHash: sha256(content), publisher: 'fixture', rights: { accessScope: 'public' as const, retentionAllowed: true, aiProcessingAllowed: true, derivativeKnowledgeAllowed: true, redistributionAllowed: false } }
  const handle = await new KnowledgeBaseRegistry().mount(kbRoot)
  await new KnowledgeProductionGateway().submit({ handle, producerType: 'daily_intelligence', producerRunId: `daily-pi-fix-003-seed-${symbol}-${claimType}`, schemaProfile: { schemaVersion: '0.4', storageFormatVersion: '1', requiresRawProvenance: true }, entity: { localKey: symbol, entityType: 'company', name, semanticFields: { ticker: symbol, exchange } }, proposals: [{ proposalId: `seed-${symbol}-${claimType}`, kind: 'claim', subjectKey: symbol, claimType, statement, sourceCandidateIds: [candidateId], confidence: 0.7 }], evidenceBindings: [{ localSourceId: candidateId, source }], asOf: '2026-09-08T00:00:00.000Z', now: () => '2026-09-08T00:00:00.000Z' })
}

let runtime: ModelRuntime | undefined
try {
  runtime = await ModelRuntime.create({ authPath: join(getAgentDir(), 'auth.json'), modelsPath: join(getAgentDir(), 'models.json'), allowModelNetwork: true, refreshOnCreate: false })
  const model = selectProductionReasoningModel(runtime) as Model<Api>
  const delegate = new PiReasoningExecutor({ modelRuntime: runtime, model, timeoutMs: 900_000, maxOutputChars: 200_000 })
  const operations: string[] = []
  const executor = { capabilities: () => delegate.capabilities(), execute: async (request: Parameters<typeof delegate.execute>[0], signal?: AbortSignal) => { let lastError: unknown; for (let attempt = 0; attempt < 3; attempt++) { operations.push(request.operation); try { return await delegate.execute(request, signal) } catch (error) { lastError = error; if (!(error && typeof error === 'object' && 'code' in error && (error as { code?: unknown }).code === 'reasoning_execution_failed')) throw error } } throw lastError } }
  const kbRoot = join(root, 'daily-pi-fix-003-kb')
  await createFreshKnowledgeBaseV04(kbRoot, { knowledgeBaseId: 'kb-daily-pi-fix-003', now: '2026-09-08T00:00:00.000Z' })
  await seedKnowledge(kbRoot, 'daily-pi-fix-003-seed-600519-claim', '600519', '贵州茅台', 'SSE', 'fact', '贵州茅台 premium spirits demand remains durable')
  await seedKnowledge(kbRoot, 'daily-pi-fix-003-seed-600519-assumption', '600519', '贵州茅台', 'SSE', 'assumption', '贵州茅台 demand growth 15 percent')
  await seedKnowledge(kbRoot, 'daily-pi-fix-003-seed-600519-thesis', '600519', '贵州茅台', 'SSE', 'thesis', '贵州茅台 premium spirits demand supports durable thesis')
  const base = { watchlist: { companies, themes: ['AI'], industries: ['consumer'] }, providers: [fixture], signalStore: new FileDailySignalStore(join(root, 'daily-pi-fix-003-signals.jsonl')), briefRoot: join(root, 'daily-pi-fix-003-briefs'), reportRoot: join(root, 'daily-pi-fix-003-reports'), knowledgeBaseRoot: kbRoot, reasoningExecutor: executor, now: () => '2026-09-08T02:00:00.000Z' }
  const runs = []
  for (const briefType of ['morning', 'evening'] as const) runs.push(await runDailyIntelligence({ ...base, briefType, workflowRunId: `daily-pi-fix-003-${briefType}-${Date.now()}`, tradeDate: '2026-09-08', forceRefresh: true }))
  const telemetry = runs.map((run) => ({ status: run.status, briefType: run.brief?.briefType ?? null, sectionCount: run.brief?.sections.length ?? 0, signalCount: run.signals.length, reportItemCount: run.brief?.quality.reportItemCount ?? null, enrichmentReasoningUsed: run.enrichmentReasoningUsed ?? false, enrichmentAppliedCount: run.enrichmentAppliedCount ?? 0, enrichmentFallbackCount: run.enrichmentFallbackCount ?? 0, changeAssessmentReasoningUsed: run.changeAssessmentReasoningUsed ?? false, changeAssessmentAppliedCount: run.changeAssessmentAppliedCount ?? 0, changeAssessmentFallbackCount: run.changeAssessmentFallbackCount ?? 0, briefReasoningUsed: run.briefReasoningUsed ?? false, modelDerivedItemCount: run.modelDerivedItemCount ?? 0, briefFallbackCount: run.briefFallbackCount ?? 0, reasoningDiagnostics: run.brief?.reasoningDiagnostics ?? {}, errors: run.errors }))
  const gate = runs.every((run) => run.status === 'completed') && runs.some((run) => (run.enrichmentAppliedCount ?? 0) >= 1) && runs.some((run) => (run.changeAssessmentAppliedCount ?? 0) >= 1) && runs.some((run) => (run.modelDerivedItemCount ?? 0) >= 1)
  const contractClosure = { daily_signal_enrichment: { called: operations.includes('daily_signal_enrichment'), validated: telemetry.some((run) => run.enrichmentAppliedCount > 0), applied: telemetry.some((run) => run.enrichmentAppliedCount > 0), appliedCount: telemetry.reduce((total, run) => total + run.enrichmentAppliedCount, 0), fallbackCount: telemetry.reduce((total, run) => total + run.enrichmentFallbackCount, 0) }, daily_change_assessment: { called: operations.includes('daily_change_assessment'), validated: telemetry.some((run) => run.changeAssessmentAppliedCount > 0), applied: telemetry.some((run) => run.changeAssessmentAppliedCount > 0), appliedCount: telemetry.reduce((total, run) => total + run.changeAssessmentAppliedCount, 0), fallbackCount: telemetry.reduce((total, run) => total + run.changeAssessmentFallbackCount, 0) }, daily_brief_synthesis: { called: operations.includes('daily_brief_synthesis'), validated: telemetry.some((run) => run.modelDerivedItemCount > 0), applied: telemetry.some((run) => run.modelDerivedItemCount > 0), modelDerivedItemCount: telemetry.reduce((total, run) => total + run.modelDerivedItemCount, 0), fallbackCount: telemetry.reduce((total, run) => total + run.briefFallbackCount, 0) } }
  const evidence = { generatedAt: new Date().toISOString(), taskId: 'RHL-PERSONAL-RESEARCH-V1-DAILY-INTELLIGENCE-001-FIX-003', classification: gate ? 'EXECUTED' : 'REAL_MODEL_CONTRACT_BLOCKED', realPiReasoningExecutor: true, operations, model: delegate.runtimeMetadata(), operationCoverage: { enrichment: operations.includes('daily_signal_enrichment'), changeAssessment: operations.includes('daily_change_assessment'), synthesis: operations.includes('daily_brief_synthesis') }, gate, contractClosure, runs: telemetry, secretsIncluded: false, rawBodiesIncluded: false }
  await writeFile(join(root, 'RHL_DAILY_INTELLIGENCE_V1_FIX_003_PI_E2E.json'), `${JSON.stringify(evidence, null, 2)}\n`, 'utf8')
  console.log(JSON.stringify(evidence, null, 2))
  if (!gate) process.exitCode = 2
} catch (error) {
  const evidence = { generatedAt: new Date().toISOString(), taskId: 'RHL-PERSONAL-RESEARCH-V1-DAILY-INTELLIGENCE-001-FIX-003', classification: 'ENVIRONMENT_BLOCKED', realPiReasoningExecutor: true, error: error instanceof Error ? error.message : String(error), secretsIncluded: false, rawBodiesIncluded: false }
  await writeFile(join(root, 'RHL_DAILY_INTELLIGENCE_V1_FIX_003_PI_E2E.json'), `${JSON.stringify(evidence, null, 2)}\n`, 'utf8')
  console.error(JSON.stringify(evidence, null, 2)); process.exitCode = 1
} finally { await Promise.resolve((runtime as unknown as { dispose?: () => void | Promise<void> } | undefined)?.dispose?.()).catch(() => undefined) }
