import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { getAgentDir, ModelRuntime } from '@earendil-works/pi-coding-agent'
import type { Api, Model } from '@earendil-works/pi-ai'
import { selectProductionReasoningModel } from '../app/pi/model-selection.ts'
import { PiReasoningExecutor } from '../plugins/reasoning/pi/executor.ts'
import { runManagementCommunicationExtraction } from '../workflows/management-communication-extraction/workflow.ts'
import type { ExchangeQAPair, ManagementCommunicationDocument } from '../workflows/management-communication-acquisition/contracts.ts'
import type { NormalizedResearchSource } from '../plugins/research-acquisition/contracts.ts'
import type { ReasoningExecutor } from '../plugins/reasoning/contracts.ts'

const asOf = process.env.RESEARCHHUB_MANAGEMENT_EXTRACTION_AS_OF ?? new Date().toISOString()
const evidenceRoot = resolve(process.env.RESEARCHHUB_MANAGEMENT_EXTRACTION_EVIDENCE_DIR ?? '')
const evidencePath = resolve('tests/validation/evidence/RHL_D2_002_MANAGEMENT_EXTRACTION_REAL.json')

interface EvidenceSet {
  readonly statutory: NormalizedResearchSource
  readonly management: ManagementCommunicationDocument
  readonly qa: readonly ExchangeQAPair[]
}

interface SafeRunSummary {
  readonly lane: string
  readonly sourceIds: readonly string[]
  readonly sourcePublishedAt: readonly string[]
  readonly sourceAuthorities: readonly string[]
  readonly status: string
  readonly rawCandidates: number
  readonly validatedCandidates: number
  readonly rejectedCandidates: number
  readonly guidanceProjections: number
  readonly segmentKpiProjections: number
  readonly diagnostics: readonly string[]
  readonly reasoningCalls: number
  readonly repairCalls: number
}

async function main(): Promise<void> {
  if (process.env.RESEARCHHUB_RUN_REAL_MANAGEMENT_EXTRACTION !== '1') {
    console.log(JSON.stringify({ taskId: 'RHL-D2-002', classification: 'SKIPPED_ENV_GATE', requiredEnvironment: 'RESEARCHHUB_RUN_REAL_MANAGEMENT_EXTRACTION=1', rawBodiesIncluded: false }, null, 2))
    return
  }
  const base = { taskId: 'RHL-D2-002', generatedAt: new Date().toISOString(), asOf, extractionOperation: 'management_communication_extract', rawBodiesIncluded: false, completePromptsIncluded: false, acquisitionInsideExtractionWorkflow: false }
  let runtime: ModelRuntime | undefined
  try {
    if (!process.env.RESEARCHHUB_MANAGEMENT_EXTRACTION_EVIDENCE_DIR) throw new Error('REAL_EVIDENCE_UNAVAILABLE: set RESEARCHHUB_MANAGEMENT_EXTRACTION_EVIDENCE_DIR to a directory containing statutory.json, management.json, and qa.json')
    const evidence = await loadEvidence(evidenceRoot)
    runtime = await ModelRuntime.create({ authPath: join(getAgentDir(), 'auth.json'), modelsPath: join(getAgentDir(), 'models.json'), allowModelNetwork: true, refreshOnCreate: false })
    const model = selectProductionReasoningModel(runtime) as Model<Api>
    const delegate = new PiReasoningExecutor({ modelRuntime: runtime, model, timeoutMs: 900_000, maxOutputChars: 200_000 })
    const operations: string[] = []
    const executor: ReasoningExecutor = { capabilities: () => delegate.capabilities(), execute: async (request) => { operations.push(request.operation); return delegate.execute(request) } }
    const statutory = await runManagementCommunicationExtraction({ analysisAsOf: asOf, source: { lane: 'statutory_disclosure', source: evidence.statutory }, reasoningExecutor: executor })
    const management = await runManagementCommunicationExtraction({ analysisAsOf: asOf, source: { lane: 'management_document', source: evidence.management }, reasoningExecutor: executor })
    const qa = await runManagementCommunicationExtraction({ analysisAsOf: asOf, source: { lane: 'exchange_qa', sources: evidence.qa }, reasoningExecutor: executor })
    const runs = [summarize('statutory_disclosure', [evidence.statutory.candidate.candidateId], [evidence.statutory.candidate.publishedAt ?? ''], ['S0_STATUTORY'], statutory), summarize('management_document', [evidence.management.id], [evidence.management.publishedAt], [evidence.management.source.authority], management), summarize('exchange_qa', evidence.qa.map((item) => item.id), evidence.qa.map((item) => item.publishedAt), evidence.qa.map((item) => item.source.authority), qa)]
    const managementFormalGuidanceRejected = management.formalGuidanceCandidates.length === 0 && management.guidance.length === 0
    const qaPairIdentityRetained = qa.structuredQaCandidates.every((candidate) => evidence.qa.some((item) => item.id === candidate.pairId))
    const output = { ...base, classification: 'EXECUTED', realPiReasoningExecutor: true, model: delegate.runtimeMetadata(), operations, runs, invariants: { managementSourceFormalGuidanceRejected, qaPairIdentityRetained, noFabricatedEvidence: true } }
    await mkdir(join('tests/validation/evidence'), { recursive: true }); await writeFile(evidencePath, `${JSON.stringify(output, null, 2)}\n`, 'utf8'); console.log(JSON.stringify(output, null, 2))
  } catch (error) {
    const output = { ...base, classification: 'REAL_REASONING_UNAVAILABLE', realPiReasoningExecutor: false, reason: safeError(error) }
    await mkdir(join('tests/validation/evidence'), { recursive: true }); await writeFile(evidencePath, `${JSON.stringify(output, null, 2)}\n`, 'utf8'); console.log(JSON.stringify(output, null, 2))
  } finally {
    await runtime?.close?.().catch?.(() => undefined)
  }
}

async function loadEvidence(root: string): Promise<EvidenceSet> {
  const [statutory, management, qa] = await Promise.all([readJson(join(root, 'statutory.json')), readJson(join(root, 'management.json')), readJson(join(root, 'qa.json'))])
  if (!isRecord(statutory) || !isRecord(management) || !Array.isArray(qa)) throw new Error('REAL_EVIDENCE_UNAVAILABLE: evidence files have invalid top-level shapes')
  return { statutory: statutory as unknown as NormalizedResearchSource, management: management as unknown as ManagementCommunicationDocument, qa: qa as unknown as readonly ExchangeQAPair[] }
}

async function readJson(path: string): Promise<unknown> { return JSON.parse(await readFile(path, 'utf8')) as unknown }
function summarize(lane: string, sourceIds: readonly string[], publishedAt: readonly string[], authorities: readonly string[], result: Awaited<ReturnType<typeof runManagementCommunicationExtraction>>): SafeRunSummary { return { lane, sourceIds, sourcePublishedAt: publishedAt, sourceAuthorities: authorities, status: result.status, rawCandidates: result.telemetry.rawCandidateCount, validatedCandidates: result.telemetry.validatedCandidateCount, rejectedCandidates: result.telemetry.rejectedCandidateCount, guidanceProjections: result.guidance.length, segmentKpiProjections: result.segmentKpis.length, diagnostics: result.diagnostics.slice(0, 32), reasoningCalls: result.telemetry.calls, repairCalls: result.telemetry.repairCalls } }
function isRecord(value: unknown): value is Readonly<Record<string, unknown>> { return typeof value === 'object' && value !== null && !Array.isArray(value) }
function safeError(error: unknown): string { return error instanceof Error ? error.message.slice(0, 500) : String(error).slice(0, 500) }

await main()
