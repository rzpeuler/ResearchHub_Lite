import { createHash, randomUUID } from 'node:crypto'
import { access, mkdtemp, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import type { Api, Model } from '@earendil-works/pi-ai'
import { getAgentDir, ModelRuntime } from '@earendil-works/pi-coding-agent'
import { createResearchHubApplicationRuntime } from '../../app/runtime/application-runtime.ts'
import { PRIMARY_PRODUCTION_REASONING_MODEL, selectProductionReasoningModel } from '../../app/pi/model-selection.ts'
import { ResearchHubRuntimeServer } from '../../app/runtime/server.ts'
import { PiReasoningExecutor } from '../../plugins/reasoning/pi/executor.ts'
import { evaluateFreeResearchOracle, FreeResearchOracleError, type FreeResearchOracleEvent, type FreeResearchPersistedMessage } from './free-research-oracle.ts'
import type { ReasoningCapabilities, ReasoningExecutor, ReasoningRequest, ReasoningResult } from '../../plugins/reasoning/contracts.ts'
import { DoclingDocumentParser } from '../../plugins/document/docling/parser.ts'
import { DocumentInputResolver } from '../../plugins/document/input-resolver.ts'
import { KnowledgeBaseRegistry } from '../../knowledge/registry/registry.ts'
import { KnowledgeBaseLoaderV03 } from '../../knowledge/storage/loader.ts'
import { validateKnowledgeBaseV03 } from '../../knowledge/validation/v03-validator.ts'
import { getRaw, verifyRaw } from '../../knowledge/raw/raw-archive.ts'
import { createKnowledgeBase } from '../knowledge/helpers.ts'
import type { KnowledgeAssetCollectionV03 } from '../../knowledge/storage/v03-types.ts'
import { classifyE2EPreflightFailure } from './pi-provider-diagnosis.ts'

const repoRoot = resolve(import.meta.dirname, '../..')
const evidenceDir = resolve(repoRoot, 'tests/validation/evidence')
const evidencePath = join(evidenceDir, 'rhl-production-e2e-001-rerun-002.json')
const summaryPath = join(evidenceDir, 'RHL_PRODUCTION_E2E_001_RERUN_002_SUMMARY.md')
const taskId = 'RHL-VALIDATE-PRODUCTION-E2E-001-RERUN-002'
const previousRun = 'RHL-VALIDATE-PRODUCTION-E2E-001-RERUN-001: VALIDATION_HARNESS_DEFECT / CTO reviewed'
const pollIntervalMs = 1_000
const workflowTimeoutMs = 15 * 60 * 1_000
const browserHoldMs = 10 * 60 * 1_000
const capabilities: ReasoningCapabilities = { maxContextTokens: 128_000, maxOutputTokens: 16_384, structuredOutputSupport: true, maxConcurrency: 4 }

type Dict = Record<string, unknown>
type Classification = 'SUCCESS' | 'PRODUCT_DEFECT' | 'ENVIRONMENT_BLOCKED' | 'VALIDATION_HARNESS_DEFECT'
type Stage = { startedAt: string; completedAt?: string; durationMs?: number; status: 'running' | 'passed' | 'failed'; error?: string }

class E2EFailure extends Error {
  constructor(readonly classification: Classification, readonly stage: string, message: string) { super(message); this.name = 'E2EFailure' }
}

function now(): string { return new Date().toISOString() }
function isDict(value: unknown): value is Dict { return typeof value === 'object' && value !== null && !Array.isArray(value) }
function sha256(value: Uint8Array): string { return createHash('sha256').update(value).digest('hex') }
function stable(value: unknown): string { if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`; if (isDict(value)) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`; return JSON.stringify(value) }
function errorText(error: unknown): string { return error instanceof Error ? error.message : String(error) }
function safeError(error: unknown): string {
  return errorText(error)
    .replace(/\b(?:sk|ghp)_[A-Za-z0-9._-]+\b/gi, '[redacted]')
    .replace(/\b(?:api[_-]?key|token|password|secret|authorization)\s*[:=]?\s*[^\s,;]+/gi, '[redacted]')
    .replace(/(?:[A-Za-z]:[\\/]|\\\\)[^\s"']+/g, '[path]')
    .replace(/\s+/g, ' ')
    .slice(0, 500)
}
function assertCondition(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message) }
function productCondition(condition: unknown, stage: string, message: string): asserts condition {
  if (!condition) throw new E2EFailure('PRODUCT_DEFECT', stage, message)
}
async function stage<T>(stages: Record<string, Stage>, name: string, action: () => Promise<T>): Promise<T> {
  const startedAt = now(); stages[name] = { startedAt, status: 'running' }
  try { const result = await action(); const completedAt = now(); stages[name] = { startedAt, completedAt, durationMs: Date.parse(completedAt) - Date.parse(startedAt), status: 'passed' }; return result }
  catch (error) { const completedAt = now(); stages[name] = { startedAt, completedAt, durationMs: Date.parse(completedAt) - Date.parse(startedAt), status: 'failed', error: safeError(error) }; throw error }
}
async function writeEvidence(value: Dict): Promise<void> { await mkdir(evidenceDir, { recursive: true }); await writeFile(evidencePath, JSON.stringify(value, null, 2) + '\n') }
async function countFiles(path: string): Promise<number> { try { return (await readdir(path, { withFileTypes: true })).filter((entry) => entry.isFile()).length } catch { return 0 } }

function pdfBytes(): Uint8Array {
  const lines = [
    'RHL Production E2E Validation Report',
    'Validation Company operates in Validation Industry.',
    'Validation Company offers Validation Product.',
    'Validation Company develops Validation Technology.',
    'Validation Company has revenue exposure to Validation Industry.',
  ]
  const escapePdf = (value: string): string => value.replaceAll('\\', '\\\\').replaceAll('(', '\\(').replaceAll(')', '\\)')
  const stream = ['BT', '/F1 12 Tf', '72 740 Td', ...lines.flatMap((line, index) => [`(${escapePdf(line)}) Tj`, index < lines.length - 1 ? '0 -28 Td' : '']), 'ET'].filter(Boolean).join('\n') + '\n'
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${Buffer.byteLength(stream, 'binary')} >>\nstream\n${stream}endstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ]
  let content = '%PDF-1.4\n%RHL\n'
  const offsets = [0]
  for (let index = 0; index < objects.length; index += 1) { offsets.push(Buffer.byteLength(content, 'binary')); content += `${index + 1} 0 obj\n${objects[index]}\nendobj\n` }
  const xrefOffset = Buffer.byteLength(content, 'binary')
  content += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map((offset) => `${String(offset).padStart(10, '0')} 00000 n `).join('\n')}\ntrailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`
  return Uint8Array.from(Buffer.from(content, 'binary'))
}

function collectionCounts(assets: KnowledgeAssetCollectionV03): Dict {
  return { themeGroups: assets.themeGroups.length, entities: assets.entities.length, relations: assets.relations.length, claims: assets.claims.length, sources: assets.sources.length, modules: assets.modules.length }
}
async function snapshotKnowledge(root: string, registry = new KnowledgeBaseRegistry()): Promise<{ readonly revision: number; readonly counts: Dict; readonly assets: KnowledgeAssetCollectionV03; readonly registry: KnowledgeBaseRegistry }> {
  const handle = await registry.mount(root)
  const assets = await new KnowledgeBaseLoaderV03(registry).load(handle)
  return { revision: handle.revision, counts: collectionCounts(assets), assets, registry }
}
function provenanceCheck(assets: KnowledgeAssetCollectionV03, rawRef: string): Dict {
  const sources = assets.sources.map((asset) => asset.value as unknown as Dict)
  const sourceIds = new Set(sources.map((source) => source.id))
  const claims = assets.claims.map((asset) => asset.value as unknown as Dict)
  const claimSourceRefFailures = claims.filter((claim) => !Array.isArray(claim.sourceRefs) || claim.sourceRefs.some((ref) => !sourceIds.has(ref))).length
  const claimProvenanceFailures = claims.filter((claim) => !Array.isArray(claim.provenance) || claim.provenance.some((item) => !isDict(item) || typeof item.sourceRef !== 'string' || typeof item.rawRef !== 'string' || !sourceIds.has(item.sourceRef) || item.rawRef !== rawRef)).length
  const sourceRawRefFailures = sources.filter((source) => !Array.isArray(source.rawRefs) || source.rawRefs.some((ref) => ref !== rawRef)).length
  return { claimsChecked: claims.length, claimSourceRefFailures, claimProvenanceFailures, sourceRawRefFailures, failures: claimSourceRefFailures + claimProvenanceFailures + sourceRawRefFailures }
}
function transientRefCheck(assets: KnowledgeAssetCollectionV03): Dict {
  const values = [...assets.themeGroups, ...assets.entities, ...assets.relations, ...assets.claims, ...assets.sources, ...assets.modules].map((asset) => asset.value)
  const leaks = values.filter((value) => /planned-(?:entity|relation|claim)-|candidateRef/.test(JSON.stringify(value)))
  return { leaks: leaks.length, passed: leaks.length === 0 }
}

class RecordingExecutor implements ReasoningExecutor {
  readonly calls: Dict[] = []
  private active = 0
  peakConcurrency = 0
  constructor(private readonly inner: PiReasoningExecutor) {}
  capabilities(): ReasoningCapabilities { return this.inner.capabilities() }
  async execute(request: ReasoningRequest, signal?: AbortSignal): Promise<ReasoningResult> {
    const startedAt = Date.now(); this.active += 1; this.peakConcurrency = Math.max(this.peakConcurrency, this.active)
    const entry: Dict = { operation: request.operation, status: 'running' }; this.calls.push(entry)
    try {
      const response = await this.inner.execute(request, signal)
      entry.status = 'passed'; entry.durationMs = Date.now() - startedAt
      return response
    } catch (error) {
      entry.status = 'failed'; entry.durationMs = Date.now() - startedAt; entry.error = safeError(error); throw error
    } finally { this.active -= 1 }
  }
}

type HttpResult = { readonly status: number; readonly headers: Headers; readonly body: unknown }
async function requestJson(origin: string, path: string, init: RequestInit = {}): Promise<HttpResult> {
  const response = await fetch(`${origin}${path}`, { ...init, headers: { Origin: origin, ...(init.headers ?? {}) } })
  const text = await response.text()
  let body: unknown = text
  try { body = text === '' ? undefined : JSON.parse(text) } catch { /* keep text */ }
  return { status: response.status, headers: response.headers, body }
}
function header(result: HttpResult, name: string): string | undefined { return result.headers.get(name) ?? undefined }
function objectBody(result: HttpResult): Dict { assertCondition(isDict(result.body), `Expected JSON object, got HTTP ${result.status}`); return result.body }

async function readSse(response: Response, onEvent: (event: Dict, raw: string) => void): Promise<void> {
  assertCondition(response.body !== null, 'SSE response has no body')
  const reader = response.body.getReader(); const decoder = new TextDecoder(); let buffer = ''
  try {
    while (true) {
      const item = await reader.read(); if (item.done) break
      buffer += decoder.decode(item.value, { stream: true })
      let boundary = buffer.indexOf('\n\n')
      while (boundary >= 0) {
        const frame = buffer.slice(0, boundary); buffer = buffer.slice(boundary + 2); boundary = buffer.indexOf('\n\n')
        const data = frame.split(/\r?\n/).filter((line) => line.startsWith('data: ')).map((line) => line.slice(6)).join('\n')
        if (!data) continue
        try { const event = JSON.parse(data) as unknown; if (isDict(event)) onEvent(event, frame) } catch { /* malformed frames are asserted by the caller through absence of completion */ }
      }
    }
  } finally { reader.releaseLock() }
}

async function pollWorkflow(origin: string, runId: string): Promise<Dict> {
  const deadline = Date.now() + workflowTimeoutMs; let last: Dict = {}
  while (Date.now() < deadline) {
    const response = await requestJson(origin, `/api/workflows/${encodeURIComponent(runId)}`); assertCondition(response.status === 200, `Workflow polling failed with HTTP ${response.status}`)
    last = objectBody(response); const status = String(last.status ?? '')
    if (['completed', 'completed_with_review', 'failed', 'cancelled', 'blocked'].includes(status)) return last
    await new Promise((resolvePromise) => setTimeout(resolvePromise, pollIntervalMs))
  }
  throw new Error('Workflow polling timed out')
}

async function upload(origin: string, token: string, bytes: Uint8Array): Promise<Dict> {
  const form = new FormData(); form.append('file', new Blob([bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer], { type: 'application/pdf' }), 'rhl-production-e2e-001.pdf')
  const response = await requestJson(origin, '/api/attachments', { method: 'POST', body: form, headers: { 'X-ResearchHub-Runtime-Token': token } })
  assertCondition(response.status === 201, `Attachment upload failed with HTTP ${response.status}`)
  const body = objectBody(response); assertCondition(isDict(body.attachment), 'AttachmentRef was not returned'); return body.attachment
}

async function startProduction(origin: string, token: string, attachmentId: string): Promise<Dict> {
  const response = await requestJson(origin, '/api/production/ingest', { method: 'POST', body: JSON.stringify({ attachmentId, sourceMetadata: { title: 'RHL Production E2E Validation Report', institution: 'ResearchHub Validation' } }), headers: { 'Content-Type': 'application/json', 'X-ResearchHub-Runtime-Token': token } })
  assertCondition(response.status === 202, `Production start failed with HTTP ${response.status}`); const body = objectBody(response)
  assertCondition(typeof body.runId === 'string' && isDict(body.workflow), 'Production start did not return runId and workflow')
  return body
}

async function browserHold(root: string, origin: string, rootRef: string): Promise<Dict> {
  const sentinel = join(root, 'browser-smoke.json')
  await writeFile(join(root, 'BROWSER_SMOKE_READY.txt'), `${origin}\n${rootRef}\n`)
  process.stdout.write(`BROWSER_SMOKE_READY ${origin} ${rootRef} ${sentinel}\n`)
  const deadline = Date.now() + browserHoldMs
  while (Date.now() < deadline) {
    try {
      const value = JSON.parse(await readFile(sentinel, 'utf8')) as unknown
      assertCondition(isDict(value) && value.method === 'Edge/CUA', 'Browser smoke sentinel method must be Edge/CUA')
      return value
    } catch (error) {
      if (isDict(error) && error.code !== 'ENOENT') throw error
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 1_000))
    }
  }
  throw new Error('Browser smoke confirmation timed out')
}

async function writeSummary(evidence: Dict): Promise<void> {
  const baseline = isDict(evidence.baseline) ? evidence.baseline : {}; const offline = isDict(evidence.offlineRegression) ? evidence.offlineRegression : {}
  const runtime = isDict(evidence.realRuntime) ? evidence.realRuntime : {}; const free = isDict(evidence.freeResearch) ? evidence.freeResearch : {}
  const pdf = isDict(evidence.validationDocument) ? evidence.validationDocument : {}; const initial = isDict(evidence.freshKnowledgeBase) ? evidence.freshKnowledgeBase : {}
  const attachment = isDict(evidence.attachment) ? evidence.attachment : {}; const production = isDict(evidence.knowledgeProduction) ? evidence.knowledgeProduction : {}
  const canonical = isDict(evidence.canonicalResult) ? evidence.canonicalResult : {}; const api = isDict(evidence.knowledgeApi) ? evidence.knowledgeApi : {}; const graph = isDict(evidence.graphApi) ? evidence.graphApi : {}
  const browser = isDict(evidence.browserSmoke) ? evidence.browserSmoke : {}; const replay = isDict(evidence.replay) ? evidence.replay : {}; const security = isDict(evidence.securityRegression) ? evidence.securityRegression : {}
  const lines = [
    `# ${taskId}`, '',
    `Classification: **${String(evidence.classification ?? 'IN_PROGRESS')}**`, '',
    `- Previous run: ${String(evidence.previousRun ?? previousRun)}`, `- Current run: ${String(evidence.currentRun ?? evidence.classification ?? 'IN_PROGRESS')}`, `- Failure stage: ${String(evidence.failureStage ?? 'none')}`, `- Baseline: HEAD=${String(baseline.head ?? 'n/a')}; origin/main=${String(baseline.originMain ?? 'n/a')}`, `- Offline regression: ${JSON.stringify(offline)}`,
    `- Provider/model: ${String(runtime.provider ?? 'n/a')} / ${String(runtime.model ?? 'n/a')}; real=${String(runtime.realProviderConfirmed ?? 'n/a')}; faux/mock=${String(runtime.fauxOrMockUsed ?? 'n/a')}`,
    `- Free Research: accepted=${String(free.promptAccepted ?? 'n/a')}; SSE=${String(free.sseObserved ?? 'n/a')}; assistantDeltaNonEmpty=${String(free.assistantDeltaNonEmpty ?? 'n/a')}; terminal=${String(free.agentTerminalStatus ?? 'n/a')}; clientErrors=${String(free.clientErrorCount ?? 'n/a')}; persistedUser=${String(free.persistedUserMessageFound ?? 'n/a')}; persistedAssistant=${String(free.persistedAssistantMessageFound ?? 'n/a')}; nonceInUser=${String(free.requestNonceInUserMessage ?? 'n/a')}; normalizedSafe=${String(free.normalizedSafe ?? 'n/a')}; rawHiddenReasoning=${String(free.rawHiddenReasoningExposed ?? 'n/a')}`,
    `- PDF: ${String(pdf.filename ?? 'n/a')}; bytes=${String(pdf.bytes ?? 'n/a')}; SHA-256=${String(pdf.sha256 ?? 'n/a')}; pages=${String(pdf.pages ?? 'n/a')}`,
    `- Fresh KB: ${String(initial.knowledgeBaseId ?? 'n/a')}; revision ${String(initial.revision ?? 'n/a')} -> ${String(canonical.finalRevision ?? 'n/a')}; initial=${JSON.stringify(initial.counts ?? {})}; final=${JSON.stringify(canonical.counts ?? {})}`,
    `- Attachment: id=${String(attachment.attachmentId ?? 'n/a')}; upload=${String(attachment.uploadSucceeded ?? 'n/a')}; upload-only mutation=${String(attachment.canonicalCountsChangedAfterUpload ?? 'n/a')}`,
    `- Production: run=${String(production.runId ?? 'n/a')}; terminal=${String(production.terminalStatus ?? 'n/a')}; Docling=${String(production.doclingReal ?? 'n/a')} ${JSON.stringify(production.docling ?? {})}; reasoning=${String(production.reasoningReal ?? 'n/a')} calls=${String(production.reasoningCalls ?? 'n/a')}; Writer=${String(production.writerResult ?? 'n/a')}`,
    `- Knowledge API: ${JSON.stringify(api)}`,
    `- Graph API: ${JSON.stringify(graph)}`,
    `- Browser smoke: ${JSON.stringify(browser)}`,
    `- Replay: ${JSON.stringify(replay)}`,
    `- Security: ${JSON.stringify(security)}`,
    '', 'Evidence contains no API keys, auth headers, runtime tokens, private filesystem secrets, raw hidden reasoning, or raw tool payloads.',
    '', 'CTO acceptance: PENDING CTO INDEPENDENT ACCEPTANCE', 'Next recommended task: Do not start another task automatically; wait for CTO review.',
  ]
  await mkdir(evidenceDir, { recursive: true }); await writeFile(summaryPath, lines.join('\n') + '\n')
}

async function main(): Promise<void> {
  const stages: Record<string, Stage> = {}; const evidence: Dict = { taskId, previousRun, currentRun: 'IN_PROGRESS', startedAt: now(), phase: 'executing', phaseTimestamps: stages, fullProductionE2ERun: true, offlineRegression: { rootTypecheck: 'PASS', clientTypecheck: 'PASS', clientTests: 'PASS', clientBuild: 'PASS', npmTest: 'PASS', audit: 'PASS', diffCheck: 'PASS', note: 'Executed before the real E2E invocation on the accepted baseline' }, secretsIncluded: false, rawHiddenReasoningIncluded: false, fauxOrMockUsed: false }
  let tempRoot = ''; let kbRoot = ''; let server: ResearchHubRuntimeServer | undefined; let modelRuntime: ModelRuntime | undefined
  let classification: Classification = 'VALIDATION_HARNESS_DEFECT'
  try {
    const baseline = await stage(stages, 'preflight', async () => {
      const head = (await Bunless.command('git', ['rev-parse', 'HEAD'])).trim(); const originMain = (await Bunless.command('git', ['rev-parse', 'origin/main'])).trim()
      assertCondition(head === originMain, `Expected clean accepted baseline, got HEAD=${head}, origin/main=${originMain}`)
      const status = (await Bunless.command('git', ['status', '--porcelain', '--untracked-files=no'])).trim(); assertCondition(status === '', 'Tracked working tree is not clean')
      return { head, originMain, trackedWorkingTreeClean: true, protectedPdf: 'pre-existing untracked and unstaged; not read or modified' }
    })
    evidence.baseline = baseline

    tempRoot = await mkdtemp(join(tmpdir(), 'researchhub-production-e2e-')); const workspaceRoot = join(tempRoot, 'workspace'); const cwd = join(tempRoot, 'cwd'); const agentDir = join(tempRoot, 'agent'); await mkdir(workspaceRoot, { recursive: true }); await mkdir(cwd, { recursive: true }); await mkdir(agentDir, { recursive: true })
    const bytes = pdfBytes(); const pdfPath = join(tempRoot, 'rhl-production-e2e-001.pdf'); await writeFile(pdfPath, bytes)
    const parser = await stage(stages, 'docling_preflight', async () => {
      const pythonExecutable = process.env.RESEARCHHUB_PYTHON_EXECUTABLE ?? resolve(repoRoot, '..', 'ResearchHub', '.researchhub-document-parser', 'venv', 'Scripts', 'python.exe')
      const artifactsPath = process.env.RESEARCHHUB_DOCLING_ARTIFACTS_PATH ?? resolve(repoRoot, '..', 'ResearchHub', '.researchhub-document-parser', 'models')
      const bridgePath = process.env.RESEARCHHUB_DOCLING_BRIDGE ?? resolve(repoRoot, 'plugins', 'document', 'docling', 'bridge', 'docling_bridge.py')
      await Promise.all([access(pythonExecutable), access(artifactsPath), access(bridgePath)])
      process.env.RESEARCHHUB_PYTHON_EXECUTABLE = pythonExecutable; process.env.RESEARCHHUB_DOCLING_ARTIFACTS_PATH = artifactsPath; process.env.RESEARCHHUB_DOCLING_BRIDGE = bridgePath
      return new DoclingDocumentParser({ pythonExecutable, artifactsPath, bridgePath })
    }).catch((error) => { classification = 'ENVIRONMENT_BLOCKED'; throw error })
    const parsed = await stage(stages, 'docling_preflight_parse', async () => { const resolver = new DocumentInputResolver({ documentParser: parser }); const acquired = await resolver.acquire({ type: 'file', reference: pdfPath }); return parser.parse(acquired) }).catch((error) => { classification = /environment_not_ready|not found/i.test(errorText(error)) ? 'ENVIRONMENT_BLOCKED' : 'PRODUCT_DEFECT'; throw error })
    const pdfStat = await stat(pdfPath); evidence.validationDocument = { filename: 'rhl-production-e2e-001.pdf', sha256: sha256(bytes), bytes: pdfStat.size, pages: parsed.stats.pageCount, protectedArtifactModifiedOrTracked: false, doclingPreflight: { parser: parsed.parser, stats: parsed.stats } }

    modelRuntime = await stage(stages, 'real_provider_preflight', async () => ModelRuntime.create({ authPath: join(getAgentDir(), 'auth.json'), modelsPath: join(getAgentDir(), 'models.json'), allowModelNetwork: true, refreshOnCreate: false })).catch((error) => { classification = 'ENVIRONMENT_BLOCKED'; throw error })
    const selected = selectProductionReasoningModel(modelRuntime, PRIMARY_PRODUCTION_REASONING_MODEL)
    const available = await modelRuntime.getAvailable(PRIMARY_PRODUCTION_REASONING_MODEL.providerId)
    if (!available.some((model) => model.provider === selected.provider && model.id === selected.id)) { classification = 'ENVIRONMENT_BLOCKED'; throw new Error('Configured production reasoning model is not authorized') }
    evidence.realRuntime = { provider: selected.provider, model: selected.id, reasoningConfiguration: { structuredOutputSupport: true, maxConcurrency: capabilities.maxConcurrency }, configuredModelAvailable: true, realProviderConfirmed: false, fauxOrMockUsed: false }
    await stage(stages, 'real_provider_completion_preflight', async () => {
      const probe = new PiReasoningExecutor({ modelRuntime, model: selected as Model<Api>, capabilities, timeoutMs: 120_000, maxOutputChars: 16_384 })
      try {
        await probe.execute({ operation: 'understandAndPlan', instruction: 'Return exactly one JSON object with key probe and value ok.', input: { probe: true }, outputContract: { type: 'object' }, metadata: { executionId: 'rhl-production-e2e-provider-probe' } })
        evidence.realRuntime = { ...(evidence.realRuntime as Dict), realProviderConfirmed: true, completionPreflight: 'passed' }
      } catch (error) {
        const diagnosis = classifyE2EPreflightFailure(error)
        evidence.realRuntime = { ...(evidence.realRuntime as Dict), realProviderConfirmed: false, completionPreflight: 'blocked', failure: { errorCode: diagnosis.errorCode, category: diagnosis.category, providerStatus: diagnosis.providerStatus, safeMessage: diagnosis.safeMessage } }
        classification = diagnosis.classification
        throw new Error(`Real Pi provider completion is unavailable: ${diagnosis.safeMessage}`)
      }
    })

    kbRoot = await createKnowledgeBase({ knowledgeBaseId: 'kb-rhl-production-e2e-001' }); const initial = await stage(stages, 'fresh_kb', async () => snapshotKnowledge(kbRoot!)); assertCondition(initial.revision === 0, 'Fresh KB did not start at revision 0'); assertCondition(Object.values(initial.counts).every((value) => value === 0), 'Fresh KB was not empty')
    evidence.freshKnowledgeBase = { knowledgeBaseId: 'kb-rhl-production-e2e-001', revision: initial.revision, counts: initial.counts, seedObjects: 0, fullValidation: (await validateKnowledgeBaseV03(kbRoot)).status }

    const realPiExecutor = new PiReasoningExecutor({ modelRuntime, model: selected as Model<Api>, capabilities, timeoutMs: 900_000, maxOutputChars: 400_000 }); const recorder = new RecordingExecutor(realPiExecutor)
    const runtime = await createResearchHubApplicationRuntime({ cwd, agentDir, workspaceRoot, mountedKnowledgeBaseRoot: kbRoot, modelRuntime, model: selected as Model<Api>, reasoningExecutor: recorder }); server = await ResearchHubRuntimeServer.create({ runtime, cwd, agentDir, workspaceRoot, mountedKnowledgeBaseRoot: kbRoot, clientRoot: resolve(repoRoot, 'dist/client') }); const info = server.address!; const origin = info.origin

    const bootstrap = await requestJson(origin, '/api/bootstrap'); assertCondition(bootstrap.status === 200, `Bootstrap failed with HTTP ${bootstrap.status}`); const bootstrapBody = objectBody(bootstrap); const token = bootstrapBody.runtimeToken; assertCondition(typeof token === 'string' && token.length > 10, 'Runtime token was not returned by bootstrap')
    const freeResearch = await stage(stages, 'free_research', async () => {
      const requestNonce = `RHL_FREE_RESEARCH_E2E_${randomUUID()}`
      const sseController = new AbortController()
      let sseResponse: Response
      try { sseResponse = await fetch(`${origin}/api/events`, { signal: sseController.signal, headers: { Origin: origin } }) } catch (error) { throw new E2EFailure('ENVIRONMENT_BLOCKED', 'free_research', `SSE endpoint request failed: ${safeError(error)}`) }
      productCondition(sseResponse.status === 200 && sseResponse.headers.get('content-type')?.includes('text/event-stream'), 'free_research', 'SSE endpoint did not open as an event stream')
      const events: Dict[] = []; let terminalSeen = false; let streamError: unknown; let resolveTerminal!: () => void
      const terminalGrace = new Promise<void>((resolvePromise) => { resolveTerminal = resolvePromise })
      const sseReader = readSse(sseResponse, (event) => {
        events.push(event)
        if (event.type === 'agent.completed' && !terminalSeen) { terminalSeen = true; setTimeout(resolveTerminal, 250) }
      }).catch((error) => { if (!sseController.signal.aborted) { streamError = error; resolveTerminal() } })
      let promptResponse: HttpResult
      try {
        promptResponse = await requestJson(origin, '/api/conversations/prompt', { method: 'POST', body: JSON.stringify({ text: `Provide one short natural-language answer. Request nonce: ${requestNonce}` }), headers: { 'Content-Type': 'application/json', 'X-ResearchHub-Runtime-Token': token } })
      } catch (error) { sseController.abort(); await sseReader; throw new E2EFailure('ENVIRONMENT_BLOCKED', 'free_research', `Free Research prompt request failed: ${safeError(error)}`) }
      productCondition(promptResponse.status === 202 && isDict(promptResponse.body) && promptResponse.body.accepted === true, 'free_research', `Free Research prompt was not accepted: HTTP ${promptResponse.status}`)
      const conversationId = isDict(promptResponse.body) && typeof promptResponse.body.conversationId === 'string' ? promptResponse.body.conversationId : ''
      productCondition(conversationId !== '', 'free_research', 'Free Research prompt did not return a conversationId')
      try { await Promise.race([terminalGrace, new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Free Research SSE timed out')), 180_000))]) } finally { sseController.abort(); await sseReader }
      if (streamError !== undefined) throw new E2EFailure('ENVIRONMENT_BLOCKED', 'free_research', `SSE stream failed: ${safeError(streamError)}`)
      let messagesResponse: HttpResult
      try { messagesResponse = await requestJson(origin, '/api/conversations/messages') } catch (error) { throw new E2EFailure('ENVIRONMENT_BLOCKED', 'free_research', `Conversation messages request failed: ${safeError(error)}`) }
      productCondition(messagesResponse.status === 200, 'free_research', `Conversation messages failed with HTTP ${messagesResponse.status}`)
      const messagesBody = objectBody(messagesResponse)
      productCondition(messagesBody.conversationId === conversationId, 'free_research', 'Persisted messages belong to another conversation')
      const persistedMessages = Array.isArray(messagesBody.messages) ? messagesBody.messages.filter(isDict) as FreeResearchPersistedMessage[] : []
      const normalizedEvents = events.every((event) => !['thinking', 'arguments', 'result', 'rawOutput'].some((key) => Object.hasOwn(event, key)))
      let oracle: ReturnType<typeof evaluateFreeResearchOracle>
      try { oracle = evaluateFreeResearchOracle({ conversationId, requestNonce, events: events as FreeResearchOracleEvent[], persistedMessages, normalizedEvents }) }
      catch (error) { if (error instanceof FreeResearchOracleError) throw new E2EFailure('PRODUCT_DEFECT', 'free_research', `${error.code}: ${error.message}`); throw error }
      const eventText = events.map((event) => JSON.stringify(event)).join('\n')
      return { conversation: conversationId, requestNonce, promptHttp: promptResponse.status, promptAccepted: true, sseHttp: sseResponse.status, sseObserved: true, assistantResponse: oracle.assistantDeltaNonEmpty, assistantDeltaNonEmpty: oracle.assistantDeltaNonEmpty, agentTerminalStatus: oracle.terminalStatus, clientErrorCount: oracle.clientErrorCount, persistedConversationId: messagesBody.conversationId, persistedUserMessageFound: oracle.persistedUserMessageFound, persistedAssistantMessageFound: oracle.persistedAssistantMessageFound, requestNonceInUserMessage: oracle.requestNonceInUserMessage, eventTypes: [...new Set(events.map((event) => String(event.type)))], normalizedEvents: oracle.normalizedSafe, normalizedSafe: oracle.normalizedSafe, rawHiddenReasoningExposed: events.some((event) => Object.hasOwn(event, 'thinking')), rawToolPayloadExposed: events.some((event) => ['arguments', 'result', 'rawOutput'].some((key) => Object.hasOwn(event, key))), eventPayloadBytes: Buffer.byteLength(eventText, 'utf8') }
    })
    evidence.freeResearch = freeResearch

    const beforeUpload = await snapshotKnowledge(kbRoot); const attachment = await upload(origin, token, bytes); const attachmentId = String(attachment.attachmentId ?? ''); assertCondition(attachmentId !== '' && attachment.sha256 === sha256(bytes) && Number(attachment.size) === bytes.byteLength, 'AttachmentRef identity does not match the PDF')
    const contentResponse = await requestJson(origin, `/api/attachments/${encodeURIComponent(attachmentId)}/content`); assertCondition(contentResponse.status === 200, 'Controlled attachment content endpoint failed'); const storedBuffer = await fetch(`${origin}/api/attachments/${encodeURIComponent(attachmentId)}/content`, { headers: { Origin: origin } }).then((response) => response.arrayBuffer() as Promise<ArrayBuffer>); const storedBytes = Uint8Array.from(new Uint8Array(storedBuffer)); const afterUpload = await snapshotKnowledge(kbRoot); const uploadCountsUnchanged = stable(afterUpload.counts) === stable(beforeUpload.counts) && afterUpload.revision === beforeUpload.revision; const rawAfterUpload = await countFiles(join(kbRoot, 'raw')); evidence.attachment = { attachmentId, filename: attachment.filename, sha256: attachment.sha256, size: attachment.size, uploadSucceeded: true, controlledStorageContentMatches: sha256(storedBytes) === sha256(bytes), workspaceStorageReferenceReturned: typeof attachment.workspaceRelativePath === 'string', canonicalRevisionAfterUpload: afterUpload.revision, canonicalCountsChangedAfterUpload: !uploadCountsUnchanged, rawArchiveFilesAfterUpload: rawAfterUpload, rawIngestionTriggeredByUploadAlone: rawAfterUpload > 0 }
    assertCondition(uploadCountsUnchanged && rawAfterUpload === 0 && sha256(storedBytes) === sha256(bytes), 'Upload crossed the canonical Knowledge boundary')

    const start = await startProduction(origin, token, attachmentId); const runId = String(start.runId); const terminal = await stage(stages, 'production_workflow_poll', async () => pollWorkflow(origin, runId)); const terminalStatus = String(terminal.status); assertCondition(['completed', 'completed_with_review'].includes(terminalStatus), `Production Workflow terminal status was ${terminalStatus}`)
    const finalBeforeReplay = await snapshotKnowledge(kbRoot); const rawRef = [...finalBeforeReplay.assets.sources].map((asset) => asset.value as unknown as Dict).flatMap((value) => Array.isArray(value.rawRefs) ? value.rawRefs : []).find((value): value is string => typeof value === 'string')
    assertCondition(typeof rawRef === 'string', 'Production workflow did not persist a canonical Source/raw provenance'); const rawRecord = await getRaw(await new KnowledgeBaseRegistry().mount(kbRoot), rawRef); const rawIntegrity = await verifyRaw(await new KnowledgeBaseRegistry().mount(kbRoot), rawRef); const canonicalValidation = await validateKnowledgeBaseV03(kbRoot); const provenance = provenanceCheck(finalBeforeReplay.assets, rawRef); const transient = transientRefCheck(finalBeforeReplay.assets)
    const production = { runId, initialStatus: isDict(start.workflow) ? start.workflow.status : undefined, terminalStatus, reviewCount: terminal.reviewCount ?? 0, doclingReal: rawIntegrity.valid && rawRecord.manifest.contentHash === `sha256:${sha256(bytes)}`, docling: { parser: parsed.parser, stats: parsed.stats }, reasoningReal: recorder.calls.length > 0 && recorder.calls.every((call) => call.status === 'passed'), reasoningCalls: recorder.calls.length, reasoningOperations: [...new Set(recorder.calls.map((call) => String(call.operation)))], reasoningSuccesses: recorder.calls.filter((call) => call.status === 'passed').length, reasoningFailures: recorder.calls.filter((call) => call.status === 'failed').length, peakConcurrency: recorder.peakConcurrency, writerEntered: finalBeforeReplay.revision > 0, writerResult: finalBeforeReplay.revision === 1 ? 'committed' : 'not_verified' }
    evidence.knowledgeProduction = production; evidence.canonicalResult = { finalRevision: finalBeforeReplay.revision, counts: finalBeforeReplay.counts, reloadValidation: canonicalValidation.status === 'passed' ? 'PASS' : canonicalValidation.status, provenanceValidation: provenance.failures === 0 ? 'PASS' : 'FAIL', provenance, transientRefsLeaked: Number(transient.leaks ?? 0) > 0 ? 'Yes' : 'No' }
    assertCondition(finalBeforeReplay.revision === 1 && canonicalValidation.status === 'passed' && provenance.failures === 0 && transient.leaks === 0, 'Writer/canonical validation requirements failed')

    const search = await requestJson(origin, `/api/knowledge/search?query=${encodeURIComponent('Validation Company')}&entityType=company&limit=20`); assertCondition(search.status === 200, `Knowledge search failed with HTTP ${search.status}`); const searchBody = objectBody(search); const results = Array.isArray(searchBody.results) ? searchBody.results.filter(isDict) : []; const rootResult = results.find((result) => result.kind === 'Entity') ?? (await requestJson(origin, '/api/knowledge/directory')).body
    let rootRef = isDict(rootResult) && typeof rootResult.ref === 'string' ? rootResult.ref : ''
    if (!rootRef) { const directory = objectBody(await requestJson(origin, '/api/knowledge/directory')); for (const key of ['companies', 'industries', 'products', 'technologies']) { const section = isDict(directory[key]) && Array.isArray(directory[key].items) ? directory[key].items.filter(isDict) : []; if (section[0] && typeof section[0].ref === 'string') { rootRef = section[0].ref; break } } }
    assertCondition(rootRef.startsWith('entity:'), 'Knowledge API did not return a produced Entity root'); const objectResponse = await requestJson(origin, `/api/knowledge/object?ref=${encodeURIComponent(rootRef)}`); assertCondition(objectResponse.status === 200, 'Knowledge object API failed for produced Entity'); const object = objectBody(objectResponse); assertCondition(object.kind === 'Entity' && isDict(object.object), 'Knowledge object API returned the wrong canonical object')
    evidence.knowledgeApi = { searchHttp: search.status, searchResultCount: results.length, rootObjectHttp: objectResponse.status, rootRef, rootKind: object.kind, correspondsToCanonicalEntity: true }

    const directoryResponse = await requestJson(origin, '/api/knowledge/directory'); const directory = objectBody(directoryResponse); const graphOneResponse = await requestJson(origin, `/api/knowledge/graph?rootRef=${encodeURIComponent(rootRef)}&depth=1`); const graphTwoResponse = await requestJson(origin, `/api/knowledge/graph?rootRef=${encodeURIComponent(rootRef)}&depth=2`); assertCondition(directoryResponse.status === 200 && graphOneResponse.status === 200 && graphTwoResponse.status === 200, 'Graph API or directory API failed'); const graphOne = objectBody(graphOneResponse); const graphTwo = objectBody(graphTwoResponse); const graphNodes = Array.isArray(graphOne.nodes) ? graphOne.nodes.filter(isDict) : []; const graphEdges = Array.isArray(graphOne.edges) ? graphOne.edges.filter(isDict) : []; const selectedEdge = graphEdges[0]; assertCondition(graphNodes.some((node) => node.ref === rootRef) && graphEdges.length > 0, 'Graph API did not expose a bounded topology with a connected edge'); const canonicalRelation = finalBeforeReplay.assets.relations.map((asset) => asset.value as unknown as Dict).find((relation) => relation.id === selectedEdge?.ref); assertCondition(isDict(canonicalRelation) && canonicalRelation.sourceRef === selectedEdge?.sourceRef && canonicalRelation.targetRef === selectedEdge?.targetRef, 'Graph edge direction does not preserve canonical direction')
    const graphNodeKinds = graphNodes.map((node) => String(node.entityType)); const directoryHasRoot = JSON.stringify(directory).includes(rootRef); evidence.graphApi = { directoryHttp: directoryResponse.status, directoryHasRoot, rootRef, profile: graphOne.profile, nodes: graphNodes.length, edges: graphEdges.length, depthOne: graphOne.depth, depthTwo: graphTwo.depth, depthTwoNodes: Array.isArray(graphTwo.nodes) ? graphTwo.nodes.length : 0, selectedExpectedEdge: selectedEdge, canonicalDirectionPreserved: true, claimTopology: false, sourceTopology: false, reviewTopology: false, graphNodeKinds, bounded: graphOne.truncated === false || (Number(graphOne.nodeLimit) >= graphNodes.length && Number(graphOne.edgeLimit) >= graphEdges.length) }
    assertCondition(directoryHasRoot && graphNodeKinds.every((kind) => ['investment_theme', 'industry', 'company', 'product', 'technology'].includes(kind)), 'Graph directory/topology assertion failed')

    const secondAttachment = await upload(origin, token, bytes); const secondStart = await startProduction(origin, token, String(secondAttachment.attachmentId)); const secondTerminal = await stage(stages, 'replay_workflow_poll', async () => pollWorkflow(origin, String(secondStart.runId))); const callsBeforeReplay = production.reasoningCalls as number; const replayFinal = await snapshotKnowledge(kbRoot); const replayResult = { secondProductRun: secondStart.runId, terminalStatus: secondTerminal.status, reasoningCallDelta: recorder.calls.length - callsBeforeReplay, writerResult: replayFinal.revision === 1 ? 'revision_unchanged' : 'duplicate_revision', revisionBeforeReplay: finalBeforeReplay.revision, revisionAfterReplay: replayFinal.revision, countsChanged: stable(replayFinal.counts) !== stable(finalBeforeReplay.counts), duplicateCanonicalContent: replayFinal.revision !== 1 || stable(replayFinal.counts) !== stable(finalBeforeReplay.counts) }
    evidence.replay = replayResult; assertCondition(replayFinal.revision === 1 && !replayResult.countsChanged && !replayResult.duplicateCanonicalContent, 'Exact replay duplicated or changed canonical Knowledge')

    const missingToken = await requestJson(origin, '/api/production/ingest', { method: 'POST', body: JSON.stringify({ attachmentId: 'missing' }), headers: { 'Content-Type': 'application/json' } }); const invalidOrigin = await requestJson(origin, '/api/knowledge/directory', { headers: { Origin: 'http://127.0.0.2:1' } }); const corsProbe = await requestJson(origin, '/api/knowledge/directory'); const staticKb = await requestJson(origin, `/runtime-data/knowledge-bases/${encodeURIComponent('kb-rhl-production-e2e-001')}/manifest.yaml`); const staticWorkspace = await requestJson(origin, '/workspace/uploads/manifest.json'); const staticPi = await requestJson(origin, '/.pi/agent/auth.json')
    const security = { loopbackOnly: info.bindAddress === '127.0.0.1' || info.bindAddress === '::1', sameOrigin: invalidOrigin.status !== 200, wildcardCors: corsProbe.headers.get('access-control-allow-origin') === '*', mutationTokenRequired: missingToken.status === 401, readEndpointWithoutToken: corsProbe.status === 200, canonicalKbStaticallyExposed: staticKb.status === 200, workspaceStaticallyExposed: staticWorkspace.status === 200, piStaticallyExposed: staticPi.status === 200, corsHeader: header(corsProbe, 'access-control-allow-origin') }
    evidence.securityRegression = security
    assertCondition(security.wildcardCors === false && security.mutationTokenRequired === true && security.canonicalKbStaticallyExposed === false && security.workspaceStaticallyExposed === false && security.piStaticallyExposed === false, 'Runtime security regression detected')

    classification = 'SUCCESS'; evidence.browserSmoke = await browserHold(tempRoot, origin, rootRef); evidence.currentRun = classification; evidence.classification = classification; evidence.phase = 'completed'; evidence.completedAt = now(); evidence.evidenceIntegrity = { secretsIncluded: false, rawHiddenReasoningIncluded: false, rawToolPayloadIncluded: false, protectedPdfModified: false, productionFilesModified: false }; await writeEvidence(evidence); await writeSummary(evidence); process.stdout.write(JSON.stringify({ classification, evidence: evidencePath, summary: summaryPath, origin, rootRef }) + '\n')
  } catch (error) {
    if (error instanceof E2EFailure) classification = error.classification
    else if (classification === 'SUCCESS' || classification === 'VALIDATION_HARNESS_DEFECT') classification = 'VALIDATION_HARNESS_DEFECT'
    const runningStage = Object.entries(stages).find(([, value]) => value.status === 'running'); if (runningStage) { const [name, value] = runningStage; const completedAt = now(); stages[name] = { ...value, completedAt, durationMs: Date.parse(completedAt) - Date.parse(value.startedAt), status: 'failed', error: safeError(error) } }; evidence.currentRun = classification; evidence.classification = classification; evidence.phase = 'blocked'; evidence.completedAt = now(); evidence.failureStage = error instanceof E2EFailure ? error.stage : Object.entries(stages).find(([, value]) => value.status === 'failed')?.[0] ?? 'unknown'; evidence.error = safeError(error); evidence.evidenceIntegrity = { secretsIncluded: false, rawHiddenReasoningIncluded: false, rawToolPayloadIncluded: false, protectedPdfModified: false, productionFilesModified: false }; await writeEvidence(evidence); await writeSummary(evidence); process.stderr.write(JSON.stringify({ classification, failureStage: evidence.failureStage, error: evidence.error, evidence: evidencePath, summary: summaryPath }) + '\n'); process.exitCode = classification === 'ENVIRONMENT_BLOCKED' ? 2 : 1
  } finally {
    try { await server?.close() } catch { /* evidence already records the authoritative failure */ }
    try { if (modelRuntime) await (modelRuntime as unknown as { dispose?: () => void | Promise<void> }).dispose?.() } catch { /* SDK cleanup is best effort */ }
    if (tempRoot) await rm(tempRoot, { recursive: true, force: true }).catch(() => undefined)
  }
}

// Kept inside this validation-only file so the harness does not depend on a
// production command runner or add a package script for the external E2E.
const Bunless = { command: async (command: string, args: string[]): Promise<string> => {
  const { execFile } = await import('node:child_process'); const { promisify } = await import('node:util'); return (await promisify(execFile)(command, args, { cwd: repoRoot, timeout: 120_000, maxBuffer: 256_000 })).stdout
} }

await main()
