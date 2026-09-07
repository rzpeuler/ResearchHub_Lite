import { createHash } from 'node:crypto'
import { access, mkdtemp, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { isAbsolute, join, relative, resolve } from 'node:path'
import type { Api, Model } from '@earendil-works/pi-ai'
import { getAgentDir, ModelRuntime } from '@earendil-works/pi-coding-agent'
import { createResearchHubApplicationRuntime } from '../../app/runtime/application-runtime.ts'
import { PRIMARY_PRODUCTION_REASONING_MODEL, selectProductionReasoningModel } from '../../app/pi/model-selection.ts'
import { ResearchHubRuntimeServer } from '../../app/runtime/server.ts'
import { ReasoningExecutorError } from '../../plugins/reasoning/errors.ts'
import type { ReasoningCapabilities, ReasoningExecutor, ReasoningRequest, ReasoningResult } from '../../plugins/reasoning/contracts.ts'
import { PiReasoningExecutor } from '../../plugins/reasoning/pi/executor.ts'
import { DoclingDocumentParser } from '../../plugins/document/parsers/docling/parser.ts'
import { DocumentInputResolver } from '../../plugins/document/input-resolver.ts'
import { KnowledgeBaseRegistry } from '../../knowledge/registry/registry.ts'
import { KnowledgeBaseLoaderV03 } from '../../knowledge/storage/loader.ts'
import { getRaw, verifyRaw } from '../../knowledge/raw/raw-archive.ts'
import { validateKnowledgeBaseV03 } from '../../knowledge/validation/v03-validator.ts'
import { parseYaml } from '../../knowledge/storage/yaml.ts'
import { createKnowledgeBase } from '../knowledge/helpers.ts'
import { classifyReasoningError, classifyWorkflowFailure, sanitizeDiagnosticText, sanitizeReasoningCall, sanitizeWorkflowView, type SafeReasoningCallDiagnostic } from './production-workflow-diagnosis.ts'

const repoRoot = resolve(import.meta.dirname, '../..')
const evidenceDir = join(repoRoot, 'tests/validation/evidence')
const evidencePath = process.env.RHL_DIAGNOSTIC_EVIDENCE_PATH ?? join(evidenceDir, 'rhl-production-workflow-diagnosis-001.json')
const summaryPath = process.env.RHL_DIAGNOSTIC_SUMMARY_PATH ?? join(evidenceDir, 'RHL_PRODUCTION_WORKFLOW_DIAGNOSIS_001_SUMMARY.md')
const taskId = process.env.RHL_DIAGNOSTIC_TASK_ID ?? 'RHL-DIAGNOSE-PRODUCTION-WORKFLOW-FAILURE-001'
const baselineExpected = process.env.RHL_DIAGNOSTIC_BASELINE ?? 'f5676c81db18c1599ffa8459ad98dc0c9eb14a82'
const capabilities: ReasoningCapabilities = { maxContextTokens: 128_000, maxOutputTokens: 16_384, structuredOutputSupport: true, maxConcurrency: 4 }
type Dict = Record<string, unknown>

function isDict(value: unknown): value is Dict { return typeof value === 'object' && value !== null && !Array.isArray(value) }
function sha256(value: Uint8Array): string { return createHash('sha256').update(value).digest('hex') }
function now(): string { return new Date().toISOString() }
function safeError(error: unknown): string { return sanitizeDiagnosticText(error instanceof Error ? error.message : String(error)) }
async function writeEvidence(value: Dict): Promise<void> { await mkdir(evidenceDir, { recursive: true }); await writeFile(evidencePath, JSON.stringify(value, null, 2) + '\n', 'utf8') }
function inside(root: string, candidate: string): boolean { const relativePath = relative(resolve(root), resolve(candidate)); return relativePath === '' || (relativePath !== '..' && !relativePath.startsWith(`..${'\\'}`) && !relativePath.startsWith(`..${'/'}`)) }
function pdfBytes(): Uint8Array {
  const lines = ['RHL Production E2E Validation Report', 'Validation Company operates in Validation Industry.', 'Validation Company offers Validation Product.', 'Validation Company develops Validation Technology.', 'Validation Company has revenue exposure to Validation Industry.']
  const escapePdf = (value: string): string => value.replaceAll('\\', '\\\\').replaceAll('(', '\\(').replaceAll(')', '\\)')
  const stream = ['BT', '/F1 12 Tf', '72 740 Td', ...lines.flatMap((line, index) => [`(${escapePdf(line)}) Tj`, index < lines.length - 1 ? '0 -28 Td' : '']), 'ET'].filter(Boolean).join('\n') + '\n'
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>', '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>', `<< /Length ${Buffer.byteLength(stream, 'binary')} >>\nstream\n${stream}endstream`, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>']
  let content = '%PDF-1.4\n%RHL\n'; const offsets = [0]
  for (let index = 0; index < objects.length; index += 1) { offsets.push(Buffer.byteLength(content, 'binary')); content += `${index + 1} 0 obj\n${objects[index]}\nendobj\n` }
  const xrefOffset = Buffer.byteLength(content, 'binary')
  content += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map((offset) => `${String(offset).padStart(10, '0')} 00000 n `).join('\n')}\ntrailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`
  return Uint8Array.from(Buffer.from(content, 'binary'))
}

class RecordingExecutor implements ReasoningExecutor {
  readonly calls: SafeReasoningCallDiagnostic[] = []
  constructor(private readonly inner: PiReasoningExecutor) {}
  capabilities(): ReasoningCapabilities { return this.inner.capabilities() }
  async execute(request: ReasoningRequest, signal?: AbortSignal): Promise<ReasoningResult> {
    const startedAt = now(); const startedMs = Date.now()
    try {
      const result = await this.inner.execute(request, signal)
      this.calls.push(sanitizeReasoningCall({ operation: request.operation, startedAt, durationMs: Date.now() - startedMs, status: 'passed' }))
      return result
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      const errorCode = error instanceof ReasoningExecutorError ? error.code : undefined
      const diagnosis = classifyReasoningError({ code: errorCode, message })
      this.calls.push(sanitizeReasoningCall({ operation: request.operation, startedAt, durationMs: Date.now() - startedMs, status: 'failed', ...(errorCode === undefined ? {} : { errorCode }), category: diagnosis.category, safeMessage: diagnosis.safeMessage }))
      throw error
    }
  }
}

type HttpResult = { readonly status: number; readonly headers: Headers; readonly body: unknown }
async function requestJson(origin: string, path: string, init: RequestInit = {}): Promise<HttpResult> {
  const response = await fetch(`${origin}${path}`, { ...init, headers: { Origin: origin, ...(init.headers ?? {}) } }); const text = await response.text(); let body: unknown = text
  try { body = text === '' ? undefined : JSON.parse(text) } catch { /* retain text only for local diagnostics, never evidence */ }
  return { status: response.status, headers: response.headers, body }
}
function objectBody(value: HttpResult): Dict { if (!isDict(value.body)) throw new Error(`Expected JSON object from HTTP ${value.status}`); return value.body }
async function upload(origin: string, token: string, bytes: Uint8Array): Promise<Dict> {
  const form = new FormData(); form.append('file', new Blob([bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer], { type: 'application/pdf' }), 'rhl-production-e2e-001.pdf')
  const response = await requestJson(origin, '/api/attachments', { method: 'POST', body: form, headers: { 'X-ResearchHub-Runtime-Token': token } }); if (response.status !== 201) throw new Error(`Attachment upload failed with HTTP ${response.status}`); const body = objectBody(response); if (!isDict(body.attachment)) throw new Error('AttachmentRef was not returned'); return body.attachment
}
async function pollWorkflow(origin: string, runId: string): Promise<Dict> {
  const deadline = Date.now() + 15 * 60 * 1_000; let last: Dict = {}
  while (Date.now() < deadline) {
    const response = await requestJson(origin, `/api/workflows/${encodeURIComponent(runId)}`); if (response.status !== 200) throw new Error(`Workflow polling failed with HTTP ${response.status}`); last = objectBody(response)
    if (['completed', 'completed_with_review', 'failed', 'cancelled', 'blocked'].includes(String(last.status ?? ''))) return last
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 1_000))
  }
  throw new Error('Workflow polling timed out')
}
function collectionCounts(assets: Dict): Dict { return { themeGroups: Array.isArray(assets.themeGroups) ? assets.themeGroups.length : 0, entities: Array.isArray(assets.entities) ? assets.entities.length : 0, relations: Array.isArray(assets.relations) ? assets.relations.length : 0, claims: Array.isArray(assets.claims) ? assets.claims.length : 0, sources: Array.isArray(assets.sources) ? assets.sources.length : 0, modules: Array.isArray(assets.modules) ? assets.modules.length : 0 } }
async function canonicalState(kbRoot: string): Promise<Dict> {
  const registry = new KnowledgeBaseRegistry(); const handle = await registry.mount(kbRoot); const assets = await new KnowledgeBaseLoaderV03(registry).load(handle); const validation = await validateKnowledgeBaseV03(kbRoot)
  return { revision: handle.revision, counts: collectionCounts(assets as unknown as Dict), validation: validation.status }
}
async function rawState(kbRoot: string, expectedHash: string): Promise<Dict> {
  const rawRoot = join(kbRoot, 'raw'); let entries: string[] = []
  try { entries = await readdir(rawRoot) } catch { /* absent raw directory is a valid failure state */ }
  const rawRefs = entries.filter((entry) => /^raw-sha256-[0-9a-f]{64}$/.test(entry)); const registry = new KnowledgeBaseRegistry(); const handle = await registry.mount(kbRoot); const records: Dict[] = []
  for (const rawRef of rawRefs) { try { const record = await getRaw(handle, rawRef); const verified = await verifyRaw(handle, rawRef); records.push({ rawRef, integrityValid: verified.valid, contentHashMatches: record.manifest.contentHash === `sha256:${expectedHash}`, sizeBytes: record.manifest.sizeBytes }) } catch (error) { records.push({ rawRef, integrityValid: false, contentHashMatches: false, inspectionErrorCategory: classifyReasoningError({ message: safeError(error) }).category }) } }
  return { directoryPresent: entries.length > 0, fileOrDirectoryCount: entries.length, rawRefs: records }
}
function logState(kbRoot: string, runId: string): Promise<Dict> {
  return (async () => {
    const path = join(kbRoot, 'logs', 'ingestion', `${runId}.yaml`)
    try {
      const value = parseYaml(await readFile(path, 'utf8'), path); if (!isDict(value)) return { present: true, parseable: false }
      const context = isDict(value.ingestionContext) ? value.ingestionContext : {}
      const errors = Array.isArray(value.errors) ? value.errors.filter(isDict).map((item) => ({ code: typeof item.code === 'string' ? item.code : 'unknown', category: classifyReasoningError({ message: typeof item.message === 'string' ? item.message : '' }).category })) : []
      const reviewSummary = isDict(context.reviewSummary) ? { total: context.reviewSummary.total, rootCount: context.reviewSummary.rootCount, dependencyCount: context.reviewSummary.dependencyCount } : undefined
      return { present: true, parseable: true, status: value.status, workflowRunId: value.workflowRunId, rawRef: value.rawRef ?? context.rawRef, documentId: value.documentId ?? context.documentId, planAttemptCount: Array.isArray(value.planAttempts) ? value.planAttempts.length : undefined, changeSetIdPresent: typeof value.changeSetId === 'string', baseRevision: value.baseRevision, committedRevision: value.committedRevision, reviewSummary, reviewCaseCount: Array.isArray(context.reviewCaseIds) ? context.reviewCaseIds.length : undefined, errorCodes: errors.map((item) => item.code), errorCategories: errors.map((item) => item.category) }
    } catch (error) { if (isDict(error) && error.code === 'ENOENT') return { present: false }; return { present: true, parseable: false, inspectionErrorCategory: classifyReasoningError({ message: safeError(error) }).category } }
  })()
}

async function main(): Promise<void> {
  let tempRoot = ''; let server: ResearchHubRuntimeServer | undefined; let modelRuntime: ModelRuntime | undefined
  const bytes = pdfBytes(); const evidence: Dict = { taskId, startedAt: now(), baselineExpected, provider: 'zhipu-openapi', model: 'glm-5.3-flash', secretsIncluded: false, rawHiddenReasoningIncluded: false, credentialValuesExposed: false, authHeadersExposed: false }
  try {
    const baselineHead = (await Bunless.command('git', ['rev-parse', 'HEAD'])).trim(); const baselineOrigin = (await Bunless.command('git', ['rev-parse', 'origin/main'])).trim(); if (baselineHead !== baselineOrigin) throw new Error(`HEAD and origin/main differ: ${baselineHead} / ${baselineOrigin}`)
    evidence.baseline = { head: baselineHead, originMain: baselineOrigin, expected: baselineExpected, matchesExpected: baselineHead === baselineExpected, trackedWorkingTreeClean: (await Bunless.command('git', ['status', '--porcelain', '--untracked-files=no'])).trim() === '' }
    tempRoot = await mkdtemp(join(tmpdir(), 'researchhub-workflow-diagnosis-')); const workspaceRoot = join(tempRoot, 'workspace'); const cwd = join(tempRoot, 'cwd'); const agentDir = join(tempRoot, 'agent'); await mkdir(workspaceRoot, { recursive: true }); await mkdir(cwd, { recursive: true }); await mkdir(agentDir, { recursive: true })
    const pdfPath = join(tempRoot, 'rhl-production-e2e-001.pdf'); await writeFile(pdfPath, bytes); const pythonExecutable = process.env.RESEARCHHUB_PYTHON_EXECUTABLE ?? resolve(repoRoot, '..', 'ResearchHub', '.researchhub-document-parser', 'venv', 'Scripts', 'python.exe'); const artifactsPath = process.env.RESEARCHHUB_DOCLING_ARTIFACTS_PATH ?? resolve(repoRoot, '..', 'ResearchHub', '.researchhub-document-parser', 'models'); const bridgePath = process.env.RESEARCHHUB_DOCLING_BRIDGE ?? resolve(repoRoot, 'plugins', 'document', 'docling', 'bridge', 'docling_bridge.py'); await Promise.all([access(pythonExecutable), access(artifactsPath), access(bridgePath)]); process.env.RESEARCHHUB_PYTHON_EXECUTABLE = pythonExecutable; process.env.RESEARCHHUB_DOCLING_ARTIFACTS_PATH = artifactsPath; process.env.RESEARCHHUB_DOCLING_BRIDGE = bridgePath
    const parsed = await new DoclingDocumentParser({ pythonExecutable, artifactsPath, bridgePath }).parse(await new DocumentInputResolver({ documentParser: new DoclingDocumentParser({ pythonExecutable, artifactsPath, bridgePath }) }).acquire({ type: 'file', reference: pdfPath }))
    evidence.attachment = { filename: 'rhl-production-e2e-001.pdf', bytes: (await stat(pdfPath)).size, sha256: sha256(bytes), docling: { parser: parsed.parser, stats: parsed.stats } }
    modelRuntime = await ModelRuntime.create({ authPath: join(getAgentDir(), 'auth.json'), modelsPath: join(getAgentDir(), 'models.json'), allowModelNetwork: true, refreshOnCreate: false }); const selected = selectProductionReasoningModel(modelRuntime, PRIMARY_PRODUCTION_REASONING_MODEL); const available = await modelRuntime.getAvailable(PRIMARY_PRODUCTION_REASONING_MODEL.providerId); if (!available.some((model) => model.provider === selected.provider && model.id === selected.id)) throw new Error('Configured primary production model is not authorized'); const inner = new PiReasoningExecutor({ modelRuntime, model: selected as Model<Api>, capabilities, timeoutMs: 900_000, maxOutputChars: 400_000 }); const recorder = new RecordingExecutor(inner)
    const kbRoot = await createKnowledgeBase({ knowledgeBaseId: 'kb-rhl-workflow-diagnosis-001' }); const runtime = await createResearchHubApplicationRuntime({ cwd, agentDir, workspaceRoot, mountedKnowledgeBaseRoot: kbRoot, modelRuntime, model: selected as Model<Api>, reasoningExecutor: recorder }); server = await ResearchHubRuntimeServer.create({ runtime, cwd, agentDir, workspaceRoot, mountedKnowledgeBaseRoot: kbRoot, clientRoot: resolve(repoRoot, 'dist/client') }); const origin = server.address!.origin
    const bootstrap = objectBody(await requestJson(origin, '/api/bootstrap')); const runtimeToken = typeof bootstrap.runtimeToken === 'string' ? bootstrap.runtimeToken : ''; if (!runtimeToken) throw new Error('Bootstrap did not return a runtime token'); const attachment = await upload(origin, runtimeToken, bytes); const uploadId = String(attachment.attachmentId ?? ''); if (!uploadId) throw new Error('Attachment upload did not return an attachmentId'); const productionWorkspaceRoot = (runtime.productionService as unknown as { readonly workspaceRoot?: string }).workspaceRoot; const attachmentService = (server as unknown as { readonly attachmentService?: { resolveAttachmentPath: (id: string) => Promise<string>; getWorkspaceFileReference: (id: string) => Promise<string> } }).attachmentService; const canonicalAttachmentPath = attachmentService === undefined ? undefined : await attachmentService.resolveAttachmentPath(uploadId); const productionWorkspaceReference = attachmentService === undefined ? undefined : await attachmentService.getWorkspaceFileReference(uploadId); const resolvedWorkspaceReference = productionWorkspaceReference === undefined ? undefined : resolve(runtime.workspaceRoot, productionWorkspaceReference); evidence.attachment = { ...(evidence.attachment as Dict), attachmentId: uploadId, uploadSucceeded: true, controlledStorageContentMatches: attachment.sha256 === sha256(bytes) && Number(attachment.size) === bytes.byteLength, canonicalMutationByUpload: false }; evidence.pathBoundary = { runtimeProductionWorkspaceSame: productionWorkspaceRoot === runtime.workspaceRoot, canonicalAttachmentPathPresent: canonicalAttachmentPath !== undefined, productionWorkspaceReference, workspaceReferenceRelative: productionWorkspaceReference !== undefined && productionWorkspaceReference.trim() !== '' && !isAbsolute(productionWorkspaceReference), workspaceReferenceResolvesInsideRuntimeWorkspace: resolvedWorkspaceReference !== undefined && inside(runtime.workspaceRoot, resolvedWorkspaceReference), workspaceReferenceResolvesInsideProductionWorkspace: productionWorkspaceRoot !== undefined && resolvedWorkspaceReference !== undefined && inside(productionWorkspaceRoot, resolvedWorkspaceReference), workspaceReferenceOutsideCanonicalKnowledge: resolvedWorkspaceReference !== undefined && !inside(kbRoot, resolvedWorkspaceReference) }
    const startResponse = await requestJson(origin, '/api/production/ingest', { method: 'POST', body: JSON.stringify({ attachmentId: uploadId, sourceMetadata: { title: 'RHL Production Workflow Diagnosis', institution: 'ResearchHub Validation' } }), headers: { 'Content-Type': 'application/json', 'X-ResearchHub-Runtime-Token': runtimeToken } }); const startBody = objectBody(startResponse); const initialView = sanitizeWorkflowView(startBody.workflow as Dict); const runId = typeof startBody.runId === 'string' ? startBody.runId : initialView.runId
    evidence.productionStart = { runId, initialWorkflow: initialView, httpStatus: startResponse.status, accepted: startBody.accepted === true }
    const terminalRaw = await pollWorkflow(origin, runId); const terminal = sanitizeWorkflowView(terminalRaw); evidence.productionTerminal = terminal; evidence.workflowDurationMs = terminal.startedAt && terminal.completedAt ? Date.parse(terminal.completedAt) - Date.parse(terminal.startedAt) : undefined
    const [raw, logs, canonical] = await Promise.all([rawState(kbRoot, sha256(bytes)), logState(kbRoot, runId), canonicalState(kbRoot)]); evidence.reasoningCalls = recorder.calls; evidence.rawArchive = raw; evidence.ingestionLog = logs; evidence.canonicalKnowledge = canonical; evidence.review = { count: logs.reviewCaseCount ?? 0, source: 'sanitized ingestion log metadata' }
    const diagnosis = classifyWorkflowFailure({ terminal, reasoningCalls: recorder.calls, ingestionLog: logs, canonicalRevision: Number(canonical.revision ?? 0), rawPresent: Boolean(raw.fileOrDirectoryCount), pathBoundary: evidence.pathBoundary as Dict }); evidence.failurePhase = diagnosis.failurePhase; evidence.rootCauseClassification = diagnosis.classification; evidence.rootCauseSummary = diagnosis.rootCauseSummary; if (diagnosis.environmentCategory !== undefined) evidence.environmentCategory = diagnosis.environmentCategory; if (diagnosis.reasoningOperation !== undefined) evidence.reasoningOperation = diagnosis.reasoningOperation
    const terminalStatus = String(terminal.status ?? 'unknown'); const inputResolutionFailure = diagnosis.failurePhase === 'INPUT_RESOLUTION'; const pathFixClassification = terminalStatus === 'completed' || terminalStatus === 'completed_with_review' ? 'ATTACHMENT_PRODUCTION_PATH_DEFECT_FIXED' : inputResolutionFailure ? 'FIX_FAILED' : 'ATTACHMENT_PRODUCTION_PATH_DEFECT_FIXED'; evidence.pathFixClassification = pathFixClassification; if (pathFixClassification === 'ATTACHMENT_PRODUCTION_PATH_DEFECT_FIXED' && terminalStatus === 'failed') evidence.newAuthoritativeFailure = { phase: diagnosis.failurePhase, errorSummary: terminal.errorSummary ?? null, reasoningCallCount: recorder.calls.length, rawArchive: raw, ingestionLog: logs, canonicalKnowledge: canonical }
    if (terminalStatus === 'completed' || terminalStatus === 'completed_with_review') { evidence.failurePhase = 'NONE'; evidence.rootCauseClassification = 'NONE'; evidence.rootCauseSummary = 'Workflow completed without a new authoritative failure' }
    evidence.completedAt = now(); evidence.status = 'executed'; await writeEvidence(evidence); await writeSummary(evidence); process.stdout.write(JSON.stringify({ evidence: evidencePath, summary: summaryPath, classification: pathFixClassification, failurePhase: evidence.failurePhase, runId }) + '\n')
  } catch (error) {
    evidence.status = 'blocked'; evidence.errorCategory = classifyReasoningError({ message: safeError(error) }).category; evidence.error = safeError(error); evidence.completedAt = now(); await writeEvidence(evidence); await writeSummary(evidence); process.stderr.write(JSON.stringify({ evidence: evidencePath, summary: summaryPath, error: evidence.error }) + '\n'); process.exitCode = 1
  } finally { try { await server?.close() } catch { /* best effort */ } try { await (modelRuntime as unknown as { dispose?: () => void | Promise<void> } | undefined)?.dispose?.() } catch { /* best effort */ } if (tempRoot) await rm(tempRoot, { recursive: true, force: true }).catch(() => undefined) }
}

async function writeSummary(evidence: Dict): Promise<void> {
  const terminal = isDict(evidence.productionTerminal) ? evidence.productionTerminal : {}; const start = isDict(evidence.productionStart) ? evidence.productionStart : {}; const diagnosis = String(evidence.rootCauseClassification ?? 'IN_PROGRESS'); const isFixTask = String(evidence.taskId ?? taskId).startsWith('RHL-FIX-ATTACHMENT-PRODUCTION-PATH-BOUNDARY-001'); const lines = [`# ${String(evidence.taskId ?? taskId)}`, '', `${isFixTask ? 'Path Fix Classification' : 'Diagnosis Classification'}: **${String(evidence.pathFixClassification ?? diagnosis)}**`, '', `- Baseline: ${JSON.stringify(evidence.baseline ?? {})}`, `- Provider/model: ${String(evidence.provider)} / ${String(evidence.model)}`, `- Reproduction: fresh KB, real Docling, real PiReasoningExecutor, Attachment -> /api/production/ingest -> /api/workflows/:runId`, `- Workflow identity: runId=${String(start.runId ?? terminal.runId ?? 'n/a')}; initial=${JSON.stringify(start.initialWorkflow ?? {})}; terminal=${String(terminal.status ?? 'n/a')}; durationMs=${String(evidence.workflowDurationMs ?? 'n/a')}`, `- Terminal failure: progress=${JSON.stringify(terminal.progressSummary ?? null)}; errorSummary=${JSON.stringify(terminal.errorSummary ?? null)}`, `- Reasoning trace: ${JSON.stringify(evidence.reasoningCalls ?? [])}`, `- Failure phase: ${String(evidence.failurePhase ?? 'n/a')}`, `- Raw archive: ${JSON.stringify(evidence.rawArchive ?? {})}`, `- Ingestion log: ${JSON.stringify(evidence.ingestionLog ?? {})}`, `- Canonical Knowledge: ${JSON.stringify(evidence.canonicalKnowledge ?? {})}`, `- Review: ${JSON.stringify(evidence.review ?? {})}`, '', `Root cause: ${String(evidence.rootCauseSummary ?? 'n/a')}`, '', `${isFixTask ? 'Production files modified: AttachmentService workspace-reference accessor, Runtime Server handoff' : 'Production files modified: NONE'}`, `Validation files modified: diagnostic helper, deterministic tests, targeted reproduction, evidence, governance`, '', 'Secret hygiene: credentialValuesExposed=false; authHeadersExposed=false; rawHiddenReasoningIncluded=false', '', 'CTO acceptance: PENDING CTO REVIEW', `${isFixTask ? 'Full Production E2E was not run.' : 'No production fix was implemented.'}`]
  lines.splice(7, 0, `- Path boundary forensic (safe type/boolean only): ${JSON.stringify(evidence.pathBoundary ?? {})}`)
  const outcomeIndex = lines.findIndex((line) => line.startsWith('- Terminal failure:'))
  if (outcomeIndex >= 0) lines[outcomeIndex] = lines[outcomeIndex]!.replace('- Terminal failure:', '- Terminal outcome:')
  await mkdir(evidenceDir, { recursive: true }); await writeFile(summaryPath, lines.join('\n') + '\n')
}

const Bunless = { command: async (command: string, args: string[]): Promise<string> => { const { execFile } = await import('node:child_process'); const { promisify } = await import('node:util'); return (await promisify(execFile)(command, args, { cwd: repoRoot, timeout: 120_000, maxBuffer: 256_000 })).stdout } }
await main()
