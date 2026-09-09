import { access, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { ModelRuntime, getAgentDir } from '@earendil-works/pi-coding-agent'
import type { Api, Model } from '@earendil-works/pi-ai'
import { createFreshKnowledgeBaseV04, readCanonicalV04Assets } from '../../knowledge/storage/index.ts'
import { KnowledgeBaseRegistry } from '../../knowledge/registry/registry.ts'
import { KnowledgeProductionGateway } from '../../knowledge/production/gateway.ts'
import { FileDailySignalStore } from '../../plugins/daily-intelligence/signal-store.ts'
import type { DailyResearchSignal } from '../../plugins/daily-intelligence/contracts.ts'
import type { NormalizedResearchSource, ResearchAcquisitionPlugin, ResearchSourceCandidate } from '../../plugins/research-acquisition/contracts.ts'
import { sha256 } from '../../plugins/research-acquisition/hash.ts'
import { PiReasoningExecutor } from '../../plugins/reasoning/pi/executor.ts'
import { selectProductionReasoningModel } from '../../app/pi/model-selection.ts'
import { computeEventFingerprint } from '../../workflows/event-research/workflow.ts'
import { ResearchService } from '../../app/services/research-service.ts'
import { WorkflowService } from '../../app/services/workflow-service.ts'
import { evaluateEventResearchPiGate } from './event-research-pi-e2e-gate.ts'

const repoRoot = resolve(import.meta.dirname, '../..')
const evidencePath = resolve(repoRoot, 'tests/validation/evidence/RHL_M3A_EVENT_RESEARCH_V1_PI_E2E.json')
const nowValue = '2026-09-09T00:00:00.000Z'
const asOf = '2026-09-08T23:59:59.000Z'
const generatedAt = new Date().toISOString()
const rights = { accessScope: 'public' as const, retentionAllowed: true, aiProcessingAllowed: true, derivativeKnowledgeAllowed: true, redistributionAllowed: false }

function candidate(candidateId: string, provider: 'cninfo' | 'gdelt', title: string, publishedAt: string): ResearchSourceCandidate {
  return { candidateId, kind: provider === 'cninfo' ? 'official_disclosure' : 'news', tier: provider === 'cninfo' ? 1 : 3, title, provider, url: `https://example.test/event/${candidateId}`, publishedAt, metadata: { companySymbol: '600519' } }
}

function source(value: ResearchSourceCandidate, content: string): NormalizedResearchSource {
  return { candidate: value, retrievedAt: nowValue, title: value.title, content, canonicalUrl: value.url, contentHash: sha256(content), rawBytes: new TextEncoder().encode(content), publisher: value.provider, rights }
}

function fixturePlugin(name: string, values: readonly ResearchSourceCandidate[], contents: ReadonlyMap<string, string>): ResearchAcquisitionPlugin {
  return {
    name,
    async discover() { return values },
    async fetch(value) { const content = contents.get(value.candidateId) ?? `Bounded fixture evidence for ${value.candidateId}.`; return { candidate: value, retrievedAt: nowValue, content, contentHash: sha256(content), rawBytes: new TextEncoder().encode(content) } },
    async normalize(value) { return source(value.candidate, value.content) },
  }
}

function signal(value: ResearchSourceCandidate): DailyResearchSignal {
  return { signalId: 'pi-event-signal-001', clusterKey: 'event:pi-selected', kind: 'announcement', category: 'announcement', provider: 'fixture', source: value, publishedAt: '2026-09-08T01:00:00.000Z', discoveredAt: '2026-09-08T01:05:00.000Z', entities: ['600519'], themes: [], title: 'Fixture selected event', contentHash: sha256('fixture-selected-event'), relevance: 1, novelty: 1, importance: 1, sourceTier: 1, excerpt: 'A selected event requiring bounded verification.' }
}

async function fileExists(path: string): Promise<boolean> {
  try { await access(path); return true } catch { return false }
}

let modelRuntime: ModelRuntime | undefined
let tempRoot: string | undefined
try {
  tempRoot = await mkdtemp(join(tmpdir(), 'rhl-event-research-pi-'))
  const kbRoot = join(tempRoot, 'kb')
  const reportRoot = join(tempRoot, 'reports')
  await mkdir(reportRoot, { recursive: true })
  await createFreshKnowledgeBaseV04(kbRoot, { knowledgeBaseId: 'kb-event-research-pi', now: nowValue })
  const registry = new KnowledgeBaseRegistry()
  let handle = await registry.mount(kbRoot)
  const seedCandidate = candidate('pi-event-seed', 'cninfo', 'Seeded Company coverage', '2026-01-01T00:00:00.000Z')
  const seedSource = source(seedCandidate, 'Seeded Company coverage with a durable thesis and assumption context.')
  const seed = await new KnowledgeProductionGateway(registry).submit({ handle, producerType: 'fixture_seed', producerRunId: 'pi-event-seed-001', schemaProfile: { schemaVersion: '0.4', storageFormatVersion: '1', requiresRawProvenance: true }, entity: { localKey: 'company', entityType: 'company', name: 'Fixture Company', aliases: ['600519'], semanticFields: { ticker: '600519', exchange: 'SSE' } }, proposals: [{ proposalId: 'seed-thesis', kind: 'claim', claimType: 'thesis', subjectKey: 'company', statement: 'The company has durable operating strength.', sourceCandidateIds: ['pi-event-seed'] }, { proposalId: 'seed-assumption', kind: 'claim', claimType: 'assumption', statement: 'Event impact remains bounded until corroborated.', subjectKey: 'company', sourceCandidateIds: ['pi-event-seed'], structuredValue: { metric: 'event_impact_bound', value: true, unit: 'event', comparator: 'eq', period: '2026-01-01' } }, { proposalId: 'seed-risk', kind: 'claim', claimType: 'risk', subjectKey: 'company', statement: 'Event evidence may expose execution risk.', sourceCandidateIds: ['pi-event-seed'], structuredValue: { metric: 'execution_risk', value: true, unit: 'event', comparator: 'eq', period: '2026-01-01' } }], evidenceBindings: [{ localSourceId: 'pi-event-seed', source: seedSource }], asOf: nowValue, now: () => nowValue })
  if (seed.status !== 'committed') throw new Error(`Fixture seed failed: ${seed.errors.join('; ')}`)
  handle = await registry.mount(kbRoot)
  const signalStore = new FileDailySignalStore(join(tempRoot, 'signals.jsonl'))
  await signalStore.appendMany([signal(candidate('pi-event-anchor', 'cninfo', 'Selected event anchor', '2026-09-08T01:00:00.000Z'))])
  const official = candidate('pi-event-official', 'cninfo', 'Official disclosure: selected event', '2026-09-08T02:00:00.000Z')
  const supporting = candidate('pi-event-supporting', 'gdelt', 'Independent context: selected event', '2026-09-08T03:00:00.000Z')
  const irrelevant = candidate('pi-event-irrelevant', 'gdelt', 'Unrelated sector article', '2026-09-08T04:00:00.000Z')
  const contents = new Map([['pi-event-official', 'Official disclosure confirms the selected event for the Company on 2026-09-08.'], ['pi-event-supporting', 'Independent context corroborates the same event and identifies a bounded monitoring risk.'], ['pi-event-irrelevant', 'This article concerns an unrelated sector and does not support the selected Company event.']])
  modelRuntime = await ModelRuntime.create({ authPath: join(getAgentDir(), 'auth.json'), modelsPath: join(getAgentDir(), 'models.json'), allowModelNetwork: true, refreshOnCreate: false })
  const model = selectProductionReasoningModel(modelRuntime) as Model<Api>
  const delegate = new PiReasoningExecutor({ modelRuntime, model, timeoutMs: 900_000, maxOutputChars: 400_000 })
  const operations: string[] = []
  const executor = { capabilities: () => delegate.capabilities(), execute: async (request: Parameters<typeof delegate.execute>[0]) => { operations.push(request.operation); return delegate.execute(request) } }
  const workflowService = new WorkflowService()
  const service = new ResearchService({ mountedKnowledgeBaseRoot: kbRoot, reportRoot, acquisitionPlugins: [fixturePlugin('official-cninfo', [official], contents), fixturePlugin('gdelt-news', [supporting, irrelevant], contents)], workflowService, dailySignalStore: signalStore, reasoningExecutor: executor })
  const baseline = await readCanonicalV04Assets(kbRoot)
  const started = service.startEventResearch({ workflowRunId: 'pi-event-research-001', symbol: '600519', name: 'Fixture Company', exchange: 'SSE', anchor: { kind: 'daily_signal', signalId: 'pi-event-signal-001' }, asOf })
  const applicationResult = await started.completion
  const telemetry = applicationResult.telemetry as any
  const report = applicationResult.reportId === undefined ? undefined : await service.getResearchReport(applicationResult.reportId)
  const finalAssets = await readCanonicalV04Assets(kbRoot)
  const reportPath = applicationResult.reportId === undefined ? undefined : join(reportRoot, `${applicationResult.reportId}.md`)
  const canonicalSourceCountDelta = finalAssets.objects.filter((item) => item.kind === 'source').length - baseline.objects.filter((item) => item.kind === 'source').length
  const canonicalClaimCountDelta = finalAssets.objects.filter((item) => item.kind === 'claim').length - baseline.objects.filter((item) => item.kind === 'claim').length
  const irrelevantSourceCanonicalized = finalAssets.objects.some((item) => item.kind === 'source' && JSON.stringify(item.value).includes('pi-event-irrelevant'))
  const baselineEntityCount = baseline.objects.filter((item) => item.kind === 'entity').length
  const baselineSourceCount = baseline.objects.filter((item) => item.kind === 'source').length
  const baselineClaimCount = baseline.objects.filter((item) => item.kind === 'claim').length
  const gateInput = { executed: true, realPiReasoningExecutor: true, operations, assessmentCalled: telemetry.assessment.called, assessmentValidated: telemetry.assessment.validated, assessmentApplied: telemetry.assessment.applied, synthesisCalled: telemetry.synthesis.called, synthesisValidated: telemetry.synthesis.validated, synthesisApplied: telemetry.synthesis.applied, fallbackUsed: telemetry.assessment.fallbackUsed || telemetry.synthesis.fallbackUsed, strongVerification: telemetry.verification?.strongVerification === true, reportType: report?.reportType ?? null, reportSectionCount: report?.sections.length ?? 0, reportPersisted: reportPath === undefined ? false : await fileExists(reportPath), acceptedProposalCount: telemetry.acceptedProposalCount, canonicalSourceCountDelta, canonicalClaimCountDelta, irrelevantSourceCanonicalized, workflowTerminalStatus: workflowService.getWorkflowStatus(started.runId)?.status ?? applicationResult.status, eventFingerprintUsesClusterIdentity: telemetry.eventFingerprint === computeEventFingerprint({ symbol: '600519', name: 'Fixture Company', exchange: 'SH' }, 'daily_cluster:event:pi-selected'), stageBRepairAttempts: telemetry.synthesis.repairAttempts, directImpactCount: telemetry.directImpactCount, secondOrderImpactCount: telemetry.secondOrderImpactCount, affectedExistingClaimCount: telemetry.affectedExistingClaimCount, modelDerivedInterpretiveSectionCount: telemetry.modelDerivedInterpretiveSectionCount, eventOccurrenceProposalIncluded: telemetry.eventOccurrenceProposalIncluded, baselineEntityCount, finalEntityCount: finalAssets.objects.filter((item) => item.kind === 'entity').length, baselineSourceCount, finalSourceCount: finalAssets.objects.filter((item) => item.kind === 'source').length, baselineClaimCount, finalClaimCount: finalAssets.objects.filter((item) => item.kind === 'claim').length }
  const decision = evaluateEventResearchPiGate(gateInput)
  const evidence = { generatedAt, taskId: 'RHL-PERSONAL-RESEARCH-V1-M3A-EVENT-RESEARCH-001-FIX-001', classification: decision.classification, processExitCode: decision.exitCode, implementationCommit: 'pre-commit-working-tree', sourceBaseline: '2b4b52f4b237972e86eb110ac5147ba4067872be', workingTreeDiffCleanAfterGeneration: false, realPiReasoningExecutor: true, host: delegate.runtimeMetadata(), operations, gate: gateInput, run: { status: applicationResult.status, reportId: applicationResult.reportId ?? null, reportPath: applicationResult.reportPath ?? null, errors: applicationResult.errorSummary ?? null, diagnostics: telemetry.diagnostics ?? [] }, verification: telemetry.verification ?? null, canonicalCounts: { entities: finalAssets.objects.filter((item) => item.kind === 'entity').length, sources: finalAssets.objects.filter((item) => item.kind === 'source').length, claims: finalAssets.objects.filter((item) => item.kind === 'claim').length }, reportContract: { persisted: gateInput.reportPersisted, workflowState: telemetry.reportPersistence, note: 'event_research is admitted by app/services/research-report.ts and persisted by the existing report writer; the Real Pi gate may still block on model contract fallback' }, irrelevantSourceCanonicalized, secretsIncluded: false, rawBodiesIncluded: false }
  await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8')
  console.log(JSON.stringify(evidence, null, 2))
  if (decision.exitCode !== 0) process.exitCode = decision.exitCode
} catch (error) {
  const evidence = { generatedAt, taskId: 'RHL-PERSONAL-RESEARCH-V1-M3A-EVENT-RESEARCH-001', classification: 'NOT_EXECUTED / BLOCKED', processExitCode: 1, implementationCommit: 'pre-commit-working-tree', realPiReasoningExecutor: false, error: error instanceof Error ? error.message : String(error), secretsIncluded: false, rawBodiesIncluded: false }
  await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8')
  console.error(JSON.stringify(evidence, null, 2))
  process.exitCode = 1
} finally {
  await Promise.resolve((modelRuntime as unknown as { dispose?: () => void | Promise<void> } | undefined)?.dispose?.()).catch(() => undefined)
  if (tempRoot !== undefined) await rm(tempRoot, { recursive: true, force: true }).catch(() => undefined)
}
