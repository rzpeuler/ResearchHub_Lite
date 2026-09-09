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
import { evaluateValuationPiGate } from './valuation-pi-e2e-gate.ts'

const repoRoot = resolve(import.meta.dirname, '../..')
const evidencePath = resolve(repoRoot, 'tests/validation/evidence/RHL_M3A_VALUATION_V1_PI_E2E.json')
const NOW = '2026-09-09T00:00:00.000Z'
const AS_OF = '2026-09-08T00:00:00.000Z'
const RIGHTS = { accessScope: 'public' as const, retentionAllowed: true, aiProcessingAllowed: true, derivativeKnowledgeAllowed: true, redistributionAllowed: false }
const now = () => NOW
const akshare: AkshareDataClient = { companyBasic: async () => [{ 公司名称: 'Pi Valuation Fixture' }], financialData: async () => [{ 报告期: '2025-12-31', 公告日期: '2026-03-30', 基本每股收益: 10, 每股净资产: 20, EBITDA: 100000000, 净负债: 10000000, 总股本: 1000000 }], historicalMarketData: async () => [{ 日期: '2026-09-08', 收盘: 150 }, { 日期: '2026-12-31', 收盘: 999 }] }

async function seed(root: string): Promise<Awaited<ReturnType<KnowledgeBaseRegistry['mount']>>> {
  await createFreshKnowledgeBaseV04(root, { knowledgeBaseId: 'kb-m3a-valuation-pi', now: NOW }); const registry = new KnowledgeBaseRegistry(); let handle = await registry.mount(root)
  const content = 'Seeded existing Company coverage with thesis and assumption for valuation E2E.'; const source = { candidate: { candidateId: 'pi-valuation-seed', kind: 'official_disclosure' as const, tier: 1 as const, title: 'Seed coverage', provider: 'fixture', publishedAt: '2026-01-01T00:00:00.000Z', metadata: { companySymbol: '600519' } }, retrievedAt: NOW, title: 'Seed coverage', content, rawBytes: new TextEncoder().encode(content), contentHash: sha256(content), publisher: 'Fixture', rights: RIGHTS }
  const outcome = await new KnowledgeProductionGateway(registry).submit({ handle, producerType: 'fixture_seed', producerRunId: 'm3a-valuation-pi-seed', schemaProfile: { schemaVersion: '0.4', storageFormatVersion: '1', requiresRawProvenance: true }, entity: { localKey: 'company', entityType: 'company', name: 'Pi Valuation Fixture', aliases: ['600519'], semanticFields: { ticker: '600519', exchange: 'SH' } }, proposals: [{ proposalId: 'seed-assumption', kind: 'claim', claimType: 'assumption', subjectKey: 'company', statement: 'Seed assumption for valuation.', sourceCandidateIds: ['pi-valuation-seed'] }, { proposalId: 'seed-thesis', kind: 'claim', claimType: 'thesis', subjectKey: 'company', statement: 'Seed thesis for valuation.', sourceCandidateIds: ['pi-valuation-seed'] }], evidenceBindings: [{ localSourceId: 'pi-valuation-seed', source }], asOf: NOW, now })
  if (outcome.status !== 'committed') throw new Error(`Unable to seed valuation E2E Knowledge Base: ${outcome.errors.join('; ')}`)
  handle = await registry.mount(root); return handle
}

let modelRuntime: ModelRuntime | undefined
let workflowExecutionStarted = false
try {
  const temp = await mkdtemp(join(tmpdir(), 'rhl-m3a-valuation-pi-')); const kbRoot = join(temp, 'kb'); const reportRoot = join(temp, 'reports'); await mkdir(reportRoot, { recursive: true }); await seed(kbRoot); const baseline = await readCanonicalV04Assets(kbRoot)
  modelRuntime = await ModelRuntime.create({ authPath: join(getAgentDir(), 'auth.json'), modelsPath: join(getAgentDir(), 'models.json'), allowModelNetwork: true, refreshOnCreate: false })
  const model = selectProductionReasoningModel(modelRuntime) as Model<Api>; const delegate = new PiReasoningExecutor({ modelRuntime, model, timeoutMs: 900_000, maxOutputChars: 400_000 }); const operations: string[] = []; const executor = { capabilities: () => delegate.capabilities(), execute: async (request: Parameters<typeof delegate.execute>[0]) => { operations.push(request.operation); return delegate.execute(request) } }; const service = new ResearchService({ mountedKnowledgeBaseRoot: kbRoot, reportRoot, acquisitionPlugins: [], akshare, workflowService: new WorkflowService(), reasoningExecutor: executor }); workflowExecutionStarted = true; const started = service.startValuation({ workflowRunId: 'm3a-valuation-pi-001', symbol: '600519', name: 'Pi Valuation Fixture', exchange: 'SSE', asOf: AS_OF }); const result = await started.completion; const telemetry = result.telemetry as ValuationTelemetrySnapshot
  const assets = await readCanonicalV04Assets(kbRoot); const report = result.reportId ? JSON.parse(await readFile(join(reportRoot, `${result.reportId}.md.json`), 'utf8')) as { reportType?: string; sections?: readonly unknown[] } : undefined; const baselineEntityCount = baseline.objects.filter((item) => item.kind === 'entity').length; const finalEntityCount = assets.objects.filter((item) => item.kind === 'entity').length; const baselineSourceCount = baseline.objects.filter((item) => item.kind === 'source').length; const finalSourceCount = assets.objects.filter((item) => item.kind === 'source').length; const baselineClaimCount = baseline.objects.filter((item) => item.kind === 'claim').length; const finalClaimCount = assets.objects.filter((item) => item.kind === 'claim').length; const unusedBasicSourceCanonicalized = assets.objects.some((item) => item.kind === 'source' && ((item.value as { metadata?: { dataKind?: unknown } }).metadata?.dataKind === 'company-basic'))
  const runtimeMetadata = delegate.runtimeMetadata(); const gate = { executorProof: { instanceOfPiReasoningExecutor: delegate instanceof PiReasoningExecutor, runtimeProvider: runtimeMetadata.provider }, operations, status: result.status, reportType: report?.reportType ?? null, sectionCount: report?.sections?.length ?? 0, assumptionDesign: telemetry.assumptionDesign, synthesis: telemetry.synthesis, primaryMethod: telemetry.primaryMethod, eligibleMethods: telemetry.eligibleMethods, computation: telemetry.computation, modelDerivedInterpretiveSectionCount: telemetry.modelDerivedInterpretiveSectionCount, acceptedProposalCount: telemetry.acceptedProposalCount, baselineEntityCount, finalEntityCount, baselineSourceCount, finalSourceCount, canonicalSourceCountDelta: finalSourceCount - baselineSourceCount, baselineClaimCount, finalClaimCount, canonicalClaimCountDelta: finalClaimCount - baselineClaimCount, unusedBasicSourceCanonicalized }
  const decision = evaluateValuationPiGate(gate); const evidence = { generatedAt: NOW, taskId: 'RHL-PERSONAL-RESEARCH-V1-M3A-VALUATION-001-FIX-001', classification: decision.classification, processExitCode: decision.exitCode, model: delegate.runtimeMetadata(), gate, run: { status: result.status, reportId: result.reportId ?? null, errors: result.errorSummary ?? null }, canonicalCounts: { entities: finalEntityCount, sources: finalSourceCount, claims: finalClaimCount }, secretsIncluded: false, rawBodiesIncluded: false }
  await mkdir(resolve(repoRoot, 'tests/validation/evidence'), { recursive: true }); await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8'); console.log(JSON.stringify(evidence, null, 2)); process.exitCode = decision.exitCode
} catch (error) {
  const evidence = { generatedAt: NOW, taskId: 'RHL-PERSONAL-RESEARCH-V1-M3A-VALUATION-001-FIX-001', classification: workflowExecutionStarted ? 'REAL_MODEL_CONTRACT_BLOCKED' : 'ENVIRONMENT_OR_PROVIDER_BLOCKED', processExitCode: 1, failureStage: workflowExecutionStarted ? 'workflow_execution' : 'runtime_or_provider_initialization', error: error instanceof Error ? error.message : String(error), secretsIncluded: false, rawBodiesIncluded: false }; await mkdir(resolve(repoRoot, 'tests/validation/evidence'), { recursive: true }); await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8'); console.error(JSON.stringify(evidence, null, 2)); process.exitCode = 1
} finally { await Promise.resolve((modelRuntime as unknown as { dispose?: () => void | Promise<void> } | undefined)?.dispose?.()).catch(() => undefined) }
