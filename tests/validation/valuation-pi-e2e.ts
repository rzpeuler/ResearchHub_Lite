import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { ModelRuntime, getAgentDir } from '@earendil-works/pi-coding-agent'
import type { Api, Model } from '@earendil-works/pi-ai'
import { PiReasoningExecutor } from '../../plugins/reasoning/pi/executor.ts'
import { selectProductionReasoningModel } from '../../app/pi/model-selection.ts'
import { createFreshKnowledgeBaseV04, readCanonicalV04Assets } from '../../knowledge/storage/index.ts'
import { KnowledgeBaseRegistry } from '../../knowledge/registry/registry.ts'
import { KnowledgeProductionGateway } from '../../knowledge/production/gateway.ts'
import { ResearchService } from '../../app/services/research-service.ts'
import { WorkflowService } from '../../app/services/workflow-service.ts'
import type { ValuationTelemetrySnapshot } from '../../workflows/valuation/contracts.ts'
import type { AkshareDataClient } from '../../plugins/research-acquisition/akshare.ts'
import { sha256 } from '../../plugins/research-acquisition/hash.ts'

const repoRoot = resolve(import.meta.dirname, '../..')
const evidencePath = resolve(repoRoot, 'tests/validation/evidence/RHL_M3A_VALUATION_V1_PI_E2E.json')
const NOW = '2026-09-09T00:00:00.000Z'
const RIGHTS = { accessScope: 'public' as const, retentionAllowed: true, aiProcessingAllowed: true, derivativeKnowledgeAllowed: true, redistributionAllowed: false }
const now = () => NOW
const asOf = new Date(Date.now() - 1_000).toISOString()
const akshare: AkshareDataClient = { companyBasic: async () => [{ 公司名称: 'Pi Valuation Fixture' }], financialData: async () => [{ 报告期: '2025-12-31', 公告日期: '2026-03-30', 基本每股收益: 10, 每股净资产: 20, EBITDA: 100000000, 净负债: 10000000, 总股本: 1000000 }], historicalMarketData: async () => [{ 日期: '2026-09-08', 收盘: 150 }, { 日期: '2026-12-31', 收盘: 999 }] }

async function seed(root: string): Promise<Awaited<ReturnType<KnowledgeBaseRegistry['mount']>>> {
  await createFreshKnowledgeBaseV04(root, { knowledgeBaseId: 'kb-m3a-valuation-pi', now: NOW }); const registry = new KnowledgeBaseRegistry(); let handle = await registry.mount(root)
  const content = 'Seeded existing Company coverage with thesis and assumption for valuation E2E.'; const source = { candidate: { candidateId: 'pi-valuation-seed', kind: 'official_disclosure' as const, tier: 1 as const, title: 'Seed coverage', provider: 'fixture', publishedAt: '2026-01-01T00:00:00.000Z', metadata: { companySymbol: '600519' } }, retrievedAt: NOW, title: 'Seed coverage', content, rawBytes: new TextEncoder().encode(content), contentHash: sha256(content), publisher: 'Fixture', rights: RIGHTS }
  const outcome = await new KnowledgeProductionGateway(registry).submit({ handle, producerType: 'fixture_seed', producerRunId: 'm3a-valuation-pi-seed', schemaProfile: { schemaVersion: '0.4', storageFormatVersion: '1', requiresRawProvenance: true }, entity: { localKey: 'company', entityType: 'company', name: 'Pi Valuation Fixture', aliases: ['600519'], semanticFields: { ticker: '600519', exchange: 'SH' } }, proposals: [{ proposalId: 'seed-assumption', kind: 'claim', claimType: 'assumption', subjectKey: 'company', statement: 'Seed assumption for valuation.', sourceCandidateIds: ['pi-valuation-seed'] }, { proposalId: 'seed-thesis', kind: 'claim', claimType: 'thesis', subjectKey: 'company', statement: 'Seed thesis for valuation.', sourceCandidateIds: ['pi-valuation-seed'] }], evidenceBindings: [{ localSourceId: 'pi-valuation-seed', source }], asOf: NOW, now })
  if (outcome.status !== 'committed') throw new Error(`Unable to seed valuation E2E Knowledge Base: ${outcome.errors.join('; ')}`)
  handle = await registry.mount(root); return handle
}

let modelRuntime: ModelRuntime | undefined
try {
  const temp = await mkdtemp(join(tmpdir(), 'rhl-m3a-valuation-pi-')); const kbRoot = join(temp, 'kb'); const reportRoot = join(temp, 'reports'); await mkdir(reportRoot, { recursive: true }); await seed(kbRoot); const baseline = await readCanonicalV04Assets(kbRoot)
  modelRuntime = await ModelRuntime.create({ authPath: join(getAgentDir(), 'auth.json'), modelsPath: join(getAgentDir(), 'models.json'), allowModelNetwork: true, refreshOnCreate: false })
  const model = selectProductionReasoningModel(modelRuntime) as Model<Api>; const delegate = new PiReasoningExecutor({ modelRuntime, model, timeoutMs: 900_000, maxOutputChars: 400_000 }); const operations: string[] = []; const executor = { capabilities: () => delegate.capabilities(), execute: async (request: Parameters<typeof delegate.execute>[0]) => { operations.push(request.operation); return delegate.execute(request) } }; const service = new ResearchService({ mountedKnowledgeBaseRoot: kbRoot, reportRoot, acquisitionPlugins: [], akshare, workflowService: new WorkflowService(), reasoningExecutor: executor }); const started = service.startValuation({ workflowRunId: 'm3a-valuation-pi-001', symbol: '600519', name: 'Pi Valuation Fixture', exchange: 'SSE', asOf }); const result = await started.completion; const telemetry = result.telemetry as ValuationTelemetrySnapshot
  const assets = await readCanonicalV04Assets(kbRoot); const report = result.reportId ? JSON.parse(await readFile(join(reportRoot, `${result.reportId}.md.json`), 'utf8')) as { reportType?: string; sections?: readonly unknown[] } : undefined; const gate = { realPiReasoningExecutor: true, operations, status: result.status, reportType: report?.reportType ?? null, sectionCount: report?.sections?.length ?? 0, assumptionDesign: telemetry.assumptionDesign, synthesis: telemetry.synthesis, computation: telemetry.computation, acceptedProposalCount: telemetry.acceptedProposalCount, canonicalSourceCount: telemetry.canonicalSourceCount, canonicalClaimCount: telemetry.canonicalClaimCount, provider: result.providerOutcome, exactCompanyCoverage: telemetry.companyCoverageResolved, baselineEntityCount: baseline.objects.filter((item) => item.kind === 'entity').length, finalEntityCount: assets.objects.filter((item) => item.kind === 'entity').length }
  const passed = gate.status === 'completed' && gate.reportType === 'valuation' && gate.sectionCount === 16 && gate.operations.includes('valuation_assumption_design') && gate.operations.includes('valuation_synthesis') && gate.assumptionDesign.called && gate.assumptionDesign.validated && gate.assumptionDesign.applied && !gate.assumptionDesign.fallbackUsed && gate.synthesis.called && gate.synthesis.validated && gate.synthesis.applied && !gate.synthesis.fallbackUsed && gate.computation.scenarioCount === 3 && gate.computation.sensitivityCellCount === 9 && gate.computation.deterministicRecomputeStatus === 'matched' && gate.acceptedProposalCount >= 1 && gate.exactCompanyCoverage
  const evidence = { generatedAt: new Date().toISOString(), taskId: 'RHL-PERSONAL-RESEARCH-V1-M3A-VALUATION-001', classification: passed ? 'EXECUTED_PASS' : 'REAL_MODEL_CONTRACT_BLOCKED', model: delegate.runtimeMetadata(), realPiReasoningExecutor: true, gate, run: { status: result.status, reportId: result.reportId ?? null, errors: result.errorSummary ?? null }, canonicalCounts: { entities: assets.objects.filter((item) => item.kind === 'entity').length, sources: assets.objects.filter((item) => item.kind === 'source').length, claims: assets.objects.filter((item) => item.kind === 'claim').length }, secretsIncluded: false, rawBodiesIncluded: false }
  await mkdir(resolve(repoRoot, 'tests/validation/evidence'), { recursive: true }); await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8'); console.log(JSON.stringify(evidence, null, 2)); if (!passed) process.exitCode = 1
} catch (error) {
  const evidence = { generatedAt: new Date().toISOString(), taskId: 'RHL-PERSONAL-RESEARCH-V1-M3A-VALUATION-001', classification: 'ENVIRONMENT_OR_REAL_MODEL_BLOCKED', realPiReasoningExecutor: true, error: error instanceof Error ? error.message : String(error), secretsIncluded: false, rawBodiesIncluded: false }; await mkdir(resolve(repoRoot, 'tests/validation/evidence'), { recursive: true }); await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8'); console.error(JSON.stringify(evidence, null, 2)); process.exitCode = 1
} finally { await Promise.resolve((modelRuntime as unknown as { dispose?: () => void | Promise<void> } | undefined)?.dispose?.()).catch(() => undefined) }
