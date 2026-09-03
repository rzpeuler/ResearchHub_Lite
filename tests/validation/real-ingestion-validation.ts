import { createHash } from 'node:crypto'
import { execFile as execFileCallback } from 'node:child_process'
import { access, mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises'
import { promisify } from 'node:util'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { CodexReasoningExecutor } from '../../plugins/reasoning/codex/executor.ts'
import type { ReasoningExecutor, ReasoningRequest, ReasoningResult, ReasoningCapabilities } from '../../plugins/reasoning/contracts.ts'
import { DocumentInputResolver } from '../../plugins/document/input-resolver.ts'
import { DoclingDocumentParser } from '../../plugins/document/docling/parser.ts'
import { validateStructuredDocument } from '../../plugins/document/validation.ts'
import { KnowledgeCurationSkill } from '../../skills/knowledge-curation/skill.ts'
import { KnowledgeBaseRegistry } from '../../knowledge/registry/registry.ts'
import { KnowledgeBaseLoaderV03 } from '../../knowledge/storage/loader.ts'
import { validateKnowledgeBaseV03 } from '../../knowledge/validation/v03-validator.ts'
import { parseYaml } from '../../knowledge/storage/yaml.ts'
import { runRawDocumentKnowledgeIngestion } from '../../workflows/raw-document-knowledge-ingestion/workflow.ts'
import type { IngestionWorkflowResult, ReviewSummary } from '../../workflows/raw-document-knowledge-ingestion/contracts.ts'

const execFile = promisify(execFileCallback)
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const validationEvidenceDir = resolve(repoRoot, 'tests/validation/evidence')
const pdfFilename = '20260805-西部证券-AI算力行业：AI算力上游材料产业链研究报告.pdf'
const expectedSha256 = '998703cef102300518bb2edcbcc3e9bc26fa374f157b0714f3986c5028d78d63'
const expectedBytes = 3209114
const productBaseline = 'f6e2a3062afe784c114b966a8810b9ed0029be2f'
const workflowRunId = 'rhl-validation-001-primary'
const knowledgeBaseId = 'kb-rhl-validation-001'
const historicalEvidencePath = 'C:\\Users\\Administrator\\Desktop\\ResearchHub\\tests\\knowledge\\product-validation\\evidence\\c004-r9-r6-r1-final-full-pipeline.json'
const configuredCapabilities: ReasoningCapabilities = { maxContextTokens: 100000, maxOutputTokens: 20000, structuredOutputSupport: true, maxConcurrency: 1 }
const validationTimeoutMs = 900000
const validationMaxOutputChars = 400000

type Dict = Record<string, unknown>
type Stage = { startedAt: string; completedAt?: string; durationMs?: number; status: 'running' | 'passed' | 'failed'; error?: string }

class ValidationFailure extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ValidationFailure'
  }
}

class RecordingExecutor implements ReasoningExecutor {
  readonly calls: Array<Dict> = []
  private sequence = 0

  constructor(private readonly inner: CodexReasoningExecutor) {}

  capabilities(): ReasoningCapabilities { return this.inner.capabilities() }

  async execute(request: ReasoningRequest): Promise<ReasoningResult> {
    const sequence = ++this.sequence
    const startedAt = new Date().toISOString()
    const executionId = `rhl-validation-001-primary-${String(sequence).padStart(3, '0')}`
    const inputChars = JSON.stringify(request.input).length
    const contractChars = JSON.stringify(request.outputContract).length
    const entry: Dict = { sequence, executionId, operation: request.operation, startedAt, instructionChars: request.instruction.length, inputChars, contractChars, status: 'running' }
    this.calls.push(entry)
    try {
      const result = await this.inner.execute({ ...request, metadata: { ...(request.metadata ?? {}), executionId } })
      entry.completedAt = new Date().toISOString()
      entry.durationMs = result.durationMs ?? 0
      entry.outputBytes = Buffer.byteLength(String(result.rawOutput ?? result.output), 'utf8')
      entry.status = 'passed'
      return result
    } catch (error) {
      entry.completedAt = new Date().toISOString()
      entry.durationMs = Date.parse(String(entry.completedAt)) - Date.parse(startedAt)
      entry.status = 'failed'
      entry.errorCode = typeof (error as { code?: unknown })?.code === 'string' ? (error as { code: string }).code : 'unknown'
      entry.error = error instanceof Error ? error.message.slice(0, 240) : String(error).slice(0, 240)
      throw error
    }
  }
}

function now(): string { return new Date().toISOString() }
function errorText(error: unknown): string { return error instanceof Error ? error.message : String(error) }
function isDict(value: unknown): value is Dict { return typeof value === 'object' && value !== null && !Array.isArray(value) }
function assertCondition(condition: unknown, message: string): asserts condition { if (!condition) throw new ValidationFailure(message) }
function sha256(bytes: Uint8Array): string { return createHash('sha256').update(bytes).digest('hex') }
function sum(values: readonly number[]): number { return values.reduce((total, value) => total + value, 0) }

async function runStage<T>(stages: Record<string, Stage>, name: string, action: () => Promise<T>): Promise<T> {
  const startedAt = now()
  stages[name] = { startedAt, status: 'running' }
  try {
    const result = await action()
    const completedAt = now()
    stages[name] = { startedAt, completedAt, durationMs: Date.parse(completedAt) - Date.parse(startedAt), status: 'passed' }
    return result
  } catch (error) {
    const completedAt = now()
    stages[name] = { startedAt, completedAt, durationMs: Date.parse(completedAt) - Date.parse(startedAt), status: 'failed', error: errorText(error).slice(0, 500) }
    throw error
  }
}

async function findFrozenPdf(): Promise<string> {
  const roots = [resolve(repoRoot, '..', 'ResearchHub'), repoRoot]
  async function visit(root: string): Promise<string | undefined> {
    try {
      const entries = await readdir(root, { withFileTypes: true })
      for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
        const path = join(root, entry.name)
        if (entry.isFile() && entry.name === pdfFilename) return path
        if (entry.isDirectory() && !['.git', 'node_modules', '.researchhub-document-parser', 'runtime-data'].includes(entry.name)) {
          const found = await visit(path)
          if (found) return found
        }
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
    return undefined
  }
  for (const root of roots) {
    const found = await visit(root)
    if (found) return found
  }
  throw new ValidationFailure('INPUT_NOT_FOUND: required frozen PDF was not found under the allowed local roots')
}

async function commandOutput(command: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
  const result = await execFile(command, args, { cwd: repoRoot, timeout: 120000, maxBuffer: 256000 })
  return { stdout: result.stdout, stderr: result.stderr }
}

async function prepareFreshKnowledgeBase(root: string): Promise<void> {
  try { await access(root); throw new ValidationFailure(`Fresh Knowledge Base path already exists: ${root}`) } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
  for (const directory of ['raw', 'registry', 'theme-groups', 'entities', 'relations', 'claims', 'sources', 'modules', 'logs/ingestion']) await mkdir(join(root, directory), { recursive: true })
  const timestamp = '2026-09-03T00:00:00.000Z'
  await writeFile(join(root, 'manifest.yaml'), JSON.stringify({ knowledgeBaseId, name: 'RHL-VALIDATION-001 Real Ingestion', schemaVersion: '0.3', storageFormatVersion: '1', revision: 0, status: 'active', createdAt: timestamp, updatedAt: timestamp }) + '\n')
  await writeFile(join(root, 'registry', 'assets.yaml'), '{}\n')
  await writeFile(join(root, 'registry', 'raw.yaml'), '{}\n')
}

function boundedValue(value: unknown, depth = 0): unknown {
  if (depth > 2) return typeof value === 'string' ? value.slice(0, 240) : '[nested]'
  if (typeof value === 'string') return value.length > 240 ? value.slice(0, 237) + '...' : value
  if (typeof value === 'number' || typeof value === 'boolean' || value === null) return value
  if (Array.isArray(value)) return value.slice(0, 12).map((item) => boundedValue(item, depth + 1))
  if (isDict(value)) return Object.fromEntries(Object.entries(value).slice(0, 16).map(([key, item]) => [key, boundedValue(item, depth + 1)]))
  return String(value).slice(0, 240)
}

function semanticSample(value: unknown): Dict {
  if (!isDict(value)) return { value: boundedValue(value) as unknown }
  const keys = ['id', 'type', 'name', 'description', 'claimType', 'statement', 'sourceRef', 'targetRef', 'subjectRefs', 'primarySubjectRef', 'sourceRefs', 'provenance', 'supportingClaimRefs', 'contextRefs', 'attributes', 'lifecycle']
  return Object.fromEntries(keys.filter((key) => key in value).map((key) => [key, boundedValue(value[key])]))
}

function groupedSamples(items: readonly Dict[], groupKey: string, maxPerGroup: number): Dict {
  const grouped = new Map<string, Dict[]>()
  for (const item of items) {
    const key = typeof item[groupKey] === 'string' ? item[groupKey] as string : 'unknown'
    const bucket = grouped.get(key) ?? []
    if (bucket.length < maxPerGroup) bucket.push(semanticSample(item))
    grouped.set(key, bucket)
  }
  return Object.fromEntries([...grouped.entries()].sort(([left], [right]) => left.localeCompare(right)))
}

function reviewInvariants(summary: ReviewSummary): Dict {
  const categoryTotal = sum(Object.values(summary.byCategory))
  const kindTotal = sum(Object.values(summary.byCandidateKind))
  const sampleLimits = Object.values(summary.samplesByCategory).every((items) => items.length <= 5)
  return { totalEqualsRootPlusDependency: summary.total === summary.rootCount + summary.dependencyCount, categoryTotalEqualsTotal: categoryTotal === summary.total, candidateKindTotalEqualsTotal: kindTotal === summary.total, samplesBoundedToFive: sampleLimits, allHold: summary.total === summary.rootCount + summary.dependencyCount && categoryTotal === summary.total && kindTotal === summary.total && sampleLimits }
}

function boundedReviewSamples(summary: ReviewSummary): Dict {
  return Object.fromEntries(Object.entries(summary.samplesByCategory).filter(([, items]) => items.length > 0).map(([category, items]) => [category, items.slice(0, 5).map((item) => ({ candidateId: item.candidateId, kind: item.kind, stage: item.stage, category: item.category, rationale: item.rationale.slice(0, 240), dependentCandidateIds: item.dependentCandidateIds.slice(0, 12), dependency: item.dependency, origin: item.origin, reviewKey: item.reviewKey }))]))
}

function collectionCounts(assets: Awaited<ReturnType<KnowledgeBaseLoaderV03['load']>>): Dict {
  return { themeGroups: assets.themeGroups.length, entities: assets.entities.length, relations: assets.relations.length, claims: assets.claims.length, modules: assets.modules.length, sources: assets.sources.length, registryEntries: assets.registry.length }
}

function provenanceMetrics(assets: Awaited<ReturnType<KnowledgeBaseLoaderV03['load']>>, rawRef: string): Dict {
  const claims = assets.claims.map((asset) => asset.value as unknown as Dict)
  const relations = assets.relations.map((asset) => asset.value as unknown as Dict)
  const claimsWithSource = claims.filter((claim) => Array.isArray(claim.sourceRefs) && claim.sourceRefs.length > 0).length
  const claimsWithRaw = claims.filter((claim) => Array.isArray(claim.provenance) && claim.provenance.some((item) => isDict(item) && item.rawRef === rawRef)).length
  const relationsWithSource = relations.filter((relation) => Array.isArray(relation.sourceRefs) && relation.sourceRefs.length > 0).length
  return { claimCount: claims.length, claimsWithSourceRefs: claimsWithSource, claimsWithRawProvenance: claimsWithRaw, relationCount: relations.length, relationsWithSourceRefs: relationsWithSource, allClaimsHaveSourceRefs: claimsWithSource === claims.length, allClaimsHaveExactRawProvenance: claimsWithRaw === claims.length }
}

function primarySummary(result: IngestionWorkflowResult): Dict {
  const plan = result.acceptedPlan
  return {
    status: result.status,
    workflowRunId: result.workflowRunId,
    knowledgeBaseId: result.knowledgeBaseId,
    rawRef: result.rawRef,
    documentId: result.documentId,
    writeStatus: result.writeStatus,
    baseRevision: result.baseRevision,
    committedRevision: result.committedRevision,
    changeSetId: result.changeSetId,
    candidateCounts: result.candidateCounts,
    rejectedCandidateCount: result.rejectedCandidates.length,
    reviewItemCount: result.reviewItems.length,
    reviewSummary: result.reviewSummary,
    reconciliationSummary: result.reconciliationSummary,
    extractionConcurrency: result.extractionConcurrency,
    peakExtractionConcurrency: result.peakExtractionConcurrency,
    unitCount: plan?.units.length ?? 0,
    excludedBlockCount: plan?.excludedBlockIds.length ?? 0,
    unitSummaries: result.unitSummaries.map((unit) => ({ unitId: unit.unitId, proposedUnitId: unit.proposedUnitId, attempts: unit.attempts, status: unit.status, candidateCounts: unit.candidateCounts, rejectedCount: unit.rejectedCount, error: unit.error }))
  }
}

async function main(): Promise<void> {
  const stages: Record<string, Stage> = {}
  const evidence: Dict = { taskId: 'RHL-VALIDATION-001-RESUME-001', validationTask: 'RHL-VALIDATION-001', validationProductBaseline: productBaseline, startedAt: now(), phase: 'executing', phaseTimestamps: stages, architectureDocumentsModified: false, mockReasoningCalls: 0 }
  let pdfPath: string | undefined
  let kbRoot: string | undefined
  let recorder: RecordingExecutor | undefined
  try {
    const gitHead = (await commandOutput('git', ['rev-parse', 'HEAD'])).stdout.trim()
    const remoteHead = (await commandOutput('git', ['rev-parse', 'origin/main'])).stdout.trim()
    const changedProduct = (await commandOutput('git', ['diff', '--quiet', productBaseline, '--', 'knowledge', 'workflows', 'skills', 'plugins']).catch(() => ({ stdout: 'changed', stderr: '' }))).stdout
    evidence.baseline = { productBaseline, currentHead: gitHead, originMain: remoteHead, governanceOnlySinceBaseline: changedProduct === '' }
    assertCondition(gitHead === remoteHead, `Git parity failed: HEAD=${gitHead}, origin/main=${remoteHead}`)
    assertCondition(changedProduct === '', 'Product-code freeze failed: production paths differ from the accepted product baseline')
    stages.baseline_verified = { startedAt: now(), completedAt: now(), durationMs: 0, status: 'passed' }

    pdfPath = await runStage(stages, 'pdf_verified', async () => {
      const found = await findFrozenPdf()
      const bytes = Uint8Array.from(await readFile(found))
      const digest = sha256(bytes)
      const fileStat = await stat(found)
      assertCondition(fileStat.size === expectedBytes && digest === expectedSha256, `Frozen PDF identity mismatch: bytes=${fileStat.size}, sha256=${digest}`)
      evidence.pdf = { path: found, filename: pdfFilename, bytes: fileStat.size, sha256: digest, expectedBytes, expectedSha256, exactMatch: true }
      return found
    })

    const codexPreflight = await runStage(stages, 'codex_preflight', async () => {
      let version: string
      let helpBytes: number
      try {
        version = (await commandOutput('codex', ['--version'])).stdout.trim()
        const help = await commandOutput('codex', ['exec', '--help'])
        helpBytes = Buffer.byteLength(help.stdout, 'utf8')
      } catch (error) { throw new ValidationFailure(`CODEX_PREFLIGHT_BLOCKED: ${errorText(error).slice(0, 500)}`) }
      const inner = new CodexReasoningExecutor({ capabilities: configuredCapabilities, timeoutMs: validationTimeoutMs, maxOutputChars: validationMaxOutputChars })
      const smokeStarted = Date.now()
      const smoke = await inner.execute({ operation: 'understandAndPlan', instruction: 'Return a JSON object with one key named smoke and value ok. Return no other text.', input: { smoke: true }, outputContract: { type: 'object' }, metadata: { executionId: 'rhl-validation-001-codex-smoke' } })
      evidence.codex = { executable: 'codex', version, helpOutputBytes: helpBytes, configuredCapabilities, timeoutMs: validationTimeoutMs, maxOutputChars: validationMaxOutputChars, smoke: { operation: smoke.operation, operationId: smoke.operationId, durationMs: Date.now() - smokeStarted, outputBytes: Buffer.byteLength(String(smoke.rawOutput ?? smoke.output), 'utf8') } }
      return inner
    })

    const parser = await runStage(stages, 'docling_preflight', async () => {
      const pythonExecutable = process.env.RESEARCHHUB_PYTHON_EXECUTABLE ?? resolve(repoRoot, '..', 'ResearchHub', '.researchhub-document-parser', 'venv', 'Scripts', 'python.exe')
      const artifactsPath = process.env.RESEARCHHUB_DOCLING_ARTIFACTS_PATH ?? resolve(repoRoot, '..', 'ResearchHub', '.researchhub-document-parser', 'models')
      const bridgePath = process.env.RESEARCHHUB_DOCLING_BRIDGE ?? resolve(repoRoot, 'plugins', 'document', 'docling', 'bridge', 'docling_bridge.py')
      await access(pythonExecutable); await access(artifactsPath); await access(bridgePath)
      evidence.docling = { pythonExecutable, artifactsPath, bridgePath, offline: true, preferredVersion: '2.116.0' }
      return new DoclingDocumentParser({ pythonExecutable, artifactsPath, bridgePath })
    })

    const document = await runStage(stages, 'docling_parse', async () => {
      const source = await new DocumentInputResolver({ documentParser: parser }).acquire({ type: 'file', reference: pdfPath! })
      const parsed = validateStructuredDocument(await parser.parse(source))
      evidence.docling = { ...(evidence.docling as Dict), parser: parsed.parser, stats: parsed.stats, warningCount: parsed.warnings.length }
      assertCondition(parsed.stats.pageCount === 103, `Expected 103 pages, received ${String(parsed.stats.pageCount)}`)
      assertCondition(parsed.stats.tableCount > 0, 'Docling table pipeline returned no tables')
      assertCondition(parsed.warnings.length === 0, `Docling returned warnings: ${parsed.warnings.join('; ').slice(0, 500)}`)
      return parsed
    })

    kbRoot = resolve(repoRoot, 'runtime-data', 'knowledge-bases', knowledgeBaseId)
    await runStage(stages, 'fresh_kb_ready', async () => {
      await prepareFreshKnowledgeBase(kbRoot!)
      const initial = await validateKnowledgeBaseV03(kbRoot!)
      assertCondition(initial.status === 'passed', 'Fresh Knowledge Base initial full validation failed')
      evidence.freshKnowledgeBase = { knowledgeBaseId, root: kbRoot, schemaVersion: '0.3', storageFormatVersion: '1', revision: 0, seedObjects: 0, initialFullValidation: initial.status }
    })

    recorder = new RecordingExecutor(codexPreflight)
    const skill = new KnowledgeCurationSkill({ executor: recorder })
    const registry = new KnowledgeBaseRegistry()
    const handle = await registry.mount(kbRoot)
    const workflowInput = { handle, documentInput: { type: 'file' as const, reference: pdfPath! }, skill, workflowRunId, sourceMetadata: { institution: '西部证券', publishedAt: '2026-08-05', title: 'AI算力行业：AI算力上游材料产业链研究报告' }, config: { maxExtractionUnits: 32, maxExtractionAttempts: 2, maxConcurrency: 1, maxContextTokens: configuredCapabilities.maxContextTokens }, clock: () => '2026-09-03T00:00:00.000Z' }
    const primary = await runStage(stages, 'primary_workflow', async () => runRawDocumentKnowledgeIngestion(workflowInput))
    evidence.primary = primarySummary(primary)
    evidence.extractionPlan = primary.acceptedPlan ? { unitCount: primary.acceptedPlan.units.length, excludedBlockCount: primary.acceptedPlan.excludedBlockIds.length, estimatedContextTokens: primary.acceptedPlan.estimatedContextTokens, units: primary.acceptedPlan.units.map((unit) => ({ unitId: unit.unitId, proposedUnitId: unit.proposedUnitId, primaryBlockCount: unit.primaryBlockIds.length, contextBlockCount: unit.contextBlockIds.length, topic: unit.topic, semanticPurpose: unit.semanticPurpose, extractionFocus: unit.extractionFocus })) } : null
    assertCondition(primary.status !== 'blocked', `Primary workflow blocked: ${primary.errors.join('; ').slice(0, 1000)}`)
    assertCondition(primary.writeStatus === 'committed', `Expected one committed Writer result, received ${String(primary.writeStatus)}`)
    assertCondition(primary.baseRevision === 0 && primary.committedRevision === 1, 'Expected Knowledge Base revision transition 0 to 1')
    assertCondition(typeof primary.changeSetId === 'string', 'Workflow did not return a ChangeSet identity')
    assertCondition(primary.reviewSummary && reviewInvariants(primary.reviewSummary).allHold === true, 'ReviewSummary invariants failed')
    assertCondition((primary.peakExtractionConcurrency ?? 0) <= 1, 'Extraction concurrency exceeded configured bound')

    const assets = await runStage(stages, 'final_reload_and_validation', async () => {
      const refreshed = await new KnowledgeBaseLoaderV03(registry).mount(kbRoot!)
      const report = await validateKnowledgeBaseV03(kbRoot!)
      assertCondition(report.status === 'passed', `Final Knowledge Base validation failed: ${report.errors.map((item) => item.message).join('; ').slice(0, 1000)}`)
      const loaded = await new KnowledgeBaseLoaderV03(registry).load(refreshed)
      evidence.finalKnowledgeBase = { revision: refreshed.revision, counts: collectionCounts(loaded), fullValidation: report.status, validationErrors: report.errors.length }
      evidence.provenance = provenanceMetrics(loaded, primary.rawRef ?? '')
      evidence.semanticSamples = { entitiesByType: groupedSamples(loaded.entities.map((asset) => asset.value as unknown as Dict), 'type', 3), relationsByType: groupedSamples(loaded.relations.map((asset) => asset.value as unknown as Dict), 'type', 3), claimsByType: groupedSamples(loaded.claims.map((asset) => asset.value as unknown as Dict), 'claimType', 5) }
      assertCondition((evidence.provenance as Dict).allClaimsHaveSourceRefs === true, 'Not all claims have source references')
      assertCondition((evidence.provenance as Dict).allClaimsHaveExactRawProvenance === true, 'Not all claims have exact Raw provenance')
      return loaded
    })

    evidence.reconciliation = { actionCounts: primary.reconciliationSummary ?? {}, reviewSummary: primary.reviewSummary, reviewSamples: boundedReviewSamples(primary.reviewSummary) }
    evidence.reviewSummary = { summary: primary.reviewSummary, invariants: reviewInvariants(primary.reviewSummary) }
    const reasoningRecorder = recorder!
    evidence.reasoningCalls = { total: reasoningRecorder.calls.length, byOperation: Object.fromEntries([...new Set(reasoningRecorder.calls.map((call) => call.operation as string))].sort().map((operation) => [operation, reasoningRecorder.calls.filter((call) => call.operation === operation).length])), maxOutputBytes: Math.max(0, ...reasoningRecorder.calls.map((call) => Number(call.outputBytes ?? 0))), calls: reasoningRecorder.calls }
    evidence.historicalComparison = await (async () => {
      const historical = JSON.parse(await readFile(historicalEvidencePath, 'utf8')) as Dict
      const primaryHistorical = isDict(historical.primary) && isDict(historical.primary.workflow) ? historical.primary.workflow : {}
      const finalHistorical = isDict(historical.finalKnowledgeBase) ? historical.finalKnowledgeBase : {}
      return { evidencePath: historicalEvidencePath, taskId: historical.taskId, baseline: historical.baseline, reviewItemCount: primaryHistorical.reviewItemCount, schemaGapCount: primaryHistorical.schemaGapCount, knowledgeCreate: isDict(primaryHistorical.plannedChangeCounts) ? primaryHistorical.plannedChangeCounts.knowledgeCreate : undefined, finalKnowledgeBase: finalHistorical, comparisonOnly: true }
    })()
    const logPath = join(kbRoot, 'logs', 'ingestion', workflowRunId + '.yaml')
    const log = parseYaml(await readFile(logPath, 'utf8'), logPath)
    evidence.changeSet = { changeSetId: primary.changeSetId, validatedByWorkflow: true, writerStatus: primary.writeStatus, logKeys: isDict(log) ? Object.keys(log).sort() : [] }
    const callsBeforeReplay = recorder.calls.length
    const revisionBeforeReplay = JSON.parse(await readFile(join(kbRoot, 'manifest.yaml'), 'utf8')).revision as number
    const replay = await runStage(stages, 'exact_replay', async () => runRawDocumentKnowledgeIngestion(workflowInput))
    const revisionAfterReplay = JSON.parse(await readFile(join(kbRoot, 'manifest.yaml'), 'utf8')).revision as number
    evidence.replay = { status: replay.status, writeStatus: replay.writeStatus, changeSetId: replay.changeSetId, reviewSummary: replay.reviewSummary, baseRevision: replay.baseRevision, committedRevision: replay.committedRevision, callsBefore: callsBeforeReplay, callsAfter: recorder!.calls.length, additionalRealReasoningCalls: recorder!.calls.length - callsBeforeReplay, revisionBefore: revisionBeforeReplay, revisionAfter: revisionAfterReplay, sameStatus: replay.status === primary.status, sameReviewSummary: JSON.stringify(replay.reviewSummary) === JSON.stringify(primary.reviewSummary), sameChangeSetId: replay.changeSetId === primary.changeSetId, revisionUnchanged: revisionAfterReplay === revisionBeforeReplay, alreadyCommitted: replay.writeStatus === 'already_committed' }
    assertCondition((evidence.replay as Dict).additionalRealReasoningCalls === 0, 'Exact replay made additional real reasoning calls')
    assertCondition((evidence.replay as Dict).sameStatus === true && (evidence.replay as Dict).sameReviewSummary === true && (evidence.replay as Dict).sameChangeSetId === true, 'Exact replay did not preserve status, ReviewSummary, and ChangeSet identity')
    assertCondition((evidence.replay as Dict).revisionUnchanged === true && (evidence.replay as Dict).alreadyCommitted === true, 'Exact replay changed revision or was not already_committed')
    evidence.validationOutcome = 'TECHNICAL PASS / CTO VALIDATION ACCEPTANCE PENDING'
    evidence.phase = 'completed'
    evidence.completedAt = now()
    await writeEvidence(evidence, 'TECHNICAL PASS / CTO VALIDATION ACCEPTANCE PENDING')
    console.log(JSON.stringify({ outcome: evidence.validationOutcome, pdf: evidence.pdf, docling: evidence.docling, primary: primarySummary(primary), finalKnowledgeBase: evidence.finalKnowledgeBase, replay: evidence.replay, evidence: resolve(validationEvidenceDir, 'rhl-validation-001-real-e2e.json') }))
    void document; void assets
  } catch (error) {
    evidence.phase = 'blocked'
    evidence.validationOutcome = error instanceof ValidationFailure ? error.message.split(':')[0] : 'VALIDATION_BLOCKED'
    evidence.error = errorText(error).slice(0, 2000)
    evidence.completedAt = now()
    await writeEvidence(evidence, String(evidence.validationOutcome))
    console.error(JSON.stringify({ outcome: evidence.validationOutcome, error: evidence.error, evidence: resolve(validationEvidenceDir, 'rhl-validation-001-real-e2e.json') }))
    process.exitCode = 1
  }
}

async function writeEvidence(evidence: Dict, outcome: string): Promise<void> {
  await mkdir(validationEvidenceDir, { recursive: true })
  await writeFile(resolve(validationEvidenceDir, 'rhl-validation-001-real-e2e.json'), JSON.stringify(evidence, null, 2) + '\n')
  const primary = isDict(evidence.primary) ? evidence.primary : {}
  const finalKb = isDict(evidence.finalKnowledgeBase) ? evidence.finalKnowledgeBase : {}
  const replay = isDict(evidence.replay) ? evidence.replay : {}
  const summary = ['# RHL-VALIDATION-001 Real E2E Validation', '', `- Outcome: ${outcome}`, `- Product baseline: ${String(evidence.validationProductBaseline)}`, `- PDF: ${String((evidence.pdf as Dict | undefined)?.filename ?? 'not verified')}`, `- Docling: ${String((evidence.docling as Dict | undefined)?.parser ? JSON.stringify((evidence.docling as Dict).parser) : 'not executed')}`, `- Primary status: ${String(primary.status ?? 'not executed')}`, `- Primary Writer: ${String(primary.writeStatus ?? 'not executed')}`, `- Final KB counts: ${JSON.stringify(finalKb.counts ?? {})}`, `- ReviewSummary total: ${String((primary.reviewSummary as Dict | undefined)?.total ?? 'not available')}`, `- Replay: ${JSON.stringify(replay)}`, '', 'The JSON evidence contains bounded telemetry only; prompts, model output bodies, chain-of-thought, credentials, and runtime artifacts are excluded.']
  await writeFile(resolve(validationEvidenceDir, 'RHL_VALIDATION_001_SUMMARY.md'), summary.join('\n') + '\n')
}

await main()
