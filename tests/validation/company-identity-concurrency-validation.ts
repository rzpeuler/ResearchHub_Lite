import { createHash } from 'node:crypto'
import { execFile as execFileCallback } from 'node:child_process'
import { access, mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { promisify } from 'node:util'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { CodexReasoningExecutor } from '../../plugins/reasoning/codex/executor.ts'
import type { ReasoningCapabilities, ReasoningExecutor, ReasoningRequest, ReasoningResult } from '../../plugins/reasoning/contracts.ts'
import { DocumentInputResolver } from '../../plugins/document/input-resolver.ts'
import { DoclingDocumentParser } from '../../plugins/document/docling/parser.ts'
import { KnowledgeCurationSkill } from '../../skills/knowledge-curation/skill.ts'
import { KnowledgeBaseRegistry } from '../../knowledge/registry/registry.ts'
import { KnowledgeBaseLoaderV03 } from '../../knowledge/storage/loader.ts'
import { validateKnowledgeBaseV03 } from '../../knowledge/validation/v03-validator.ts'
import { normalizeSemanticText } from '../../knowledge/registry/id-allocation.ts'
import { normalizeExchange } from '../../skills/knowledge-curation/company-identity.ts'
import { runRawDocumentKnowledgeIngestion } from '../../workflows/raw-document-knowledge-ingestion/workflow.ts'

const execFile = promisify(execFileCallback)
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const evidenceDir = resolve(repoRoot, 'tests/validation/evidence')
const outputPath = resolve(evidenceDir, 'rhl-validation-company-identity-concurrency-001.json')
const summaryPath = resolve(evidenceDir, 'RHL_VALIDATION_COMPANY_IDENTITY_CONCURRENCY_001_SUMMARY.md')
const pdfFilename = '20260805-西部证券-AI算力行业：AI算力上游材料产业链研究报告.pdf'
const pdfPath = resolve(repoRoot, pdfFilename)
const expectedBytes = 3209114
const expectedSha256 = '998703cef102300518bb2edcbcc3e9bc26fa374f157b0714f3986c5028d78d63'
const productBaseline = 'c0d7a3f9d9ddb8cd646ff13ded7da49cf072df6a'
const knowledgeBaseId = 'kb-rhl-company-identity-concurrency-001'
const workflowRunId = 'rhl-company-identity-concurrency-001-primary'
const requestedModel = 'gpt-5.6-luna'
const requestedReasoningEffort = 'high' as const
const timeoutMs = 900000
const maxOutputChars = 400000
const serialReferenceMs = 3402775
const baseCapabilities: Omit<ReasoningCapabilities, 'maxConcurrency'> = { maxContextTokens: 100000, maxOutputTokens: 20000, structuredOutputSupport: true }

type Dict = Record<string, unknown>
type Stage = { startedAt: string; completedAt?: string; durationMs?: number; status: 'running' | 'passed' | 'failed'; error?: string }
type SmokeCall = { sequence: number; startedAt: string; completedAt?: string; durationMs?: number; status: 'passed' | 'failed'; errorCode?: string; error?: string }

function isDict(value: unknown): value is Dict { return typeof value === 'object' && value !== null && !Array.isArray(value) }
function parsedOutput(value: unknown): unknown { if (typeof value !== 'string') return value; try { return JSON.parse(value) as unknown } catch { return undefined } }
function errorText(error: unknown): string { return error instanceof Error ? error.message : String(error) }
function sha256(bytes: Uint8Array): string { return createHash('sha256').update(bytes).digest('hex') }
function now(): string { return new Date().toISOString() }
function stable(value: unknown): string { return JSON.stringify(value, (_key, item) => item && typeof item === 'object' && !Array.isArray(item) ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item) }
function assertCondition(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message) }
function durationBetween(startedAt: string, completedAt: string): number { return Math.max(0, Date.parse(completedAt) - Date.parse(startedAt)) }
async function stage<T>(stages: Record<string, Stage>, name: string, action: () => Promise<T>): Promise<T> { const startedAt = now(); stages[name] = { startedAt, status: 'running' }; try { const result = await action(); const completedAt = now(); stages[name] = { startedAt, completedAt, durationMs: durationBetween(startedAt, completedAt), status: 'passed' }; return result } catch (error) { const completedAt = now(); stages[name] = { startedAt, completedAt, durationMs: durationBetween(startedAt, completedAt), status: 'failed', error: errorText(error).slice(0, 1000) }; throw error } }
async function command(command: string, args: string[]): Promise<string> { const result = await execFile(command, args, { cwd: repoRoot, timeout: 120000, maxBuffer: 256000 }); return result.stdout.trim() }
async function writeEvidence(value: Dict): Promise<void> { await mkdir(evidenceDir, { recursive: true }); await writeFile(outputPath, JSON.stringify(value, null, 2) + '\n', 'utf8') }

async function prepareFreshKnowledgeBase(root: string): Promise<void> {
  try { await access(root); throw new Error(`Fresh Knowledge Base already exists: ${root}`) } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
  for (const directory of ['raw', 'registry', 'theme-groups', 'entities', 'relations', 'claims', 'sources', 'modules', 'logs/ingestion']) await mkdir(join(root, directory), { recursive: true })
  const timestamp = '2026-09-05T00:00:00.000Z'
  await writeFile(join(root, 'manifest.yaml'), JSON.stringify({ knowledgeBaseId, name: 'RHL Company Identity Concurrency Validation', schemaVersion: '0.3', storageFormatVersion: '1', revision: 0, status: 'active', createdAt: timestamp, updatedAt: timestamp }) + '\n')
  await writeFile(join(root, 'registry', 'assets.yaml'), '{}\n')
  await writeFile(join(root, 'registry', 'raw.yaml'), '{}\n')
}

async function smoke(executor: CodexReasoningExecutor, count: number): Promise<{ requested: number; calls: SmokeCall[]; wallClockMs: number; peak: number; passed: boolean }> {
  let active = 0
  let peak = 0
  const calls: SmokeCall[] = []
  const started = Date.now()
  await Promise.all(Array.from({ length: count }, async (_, index) => {
    const sequence = index + 1
    const entry: SmokeCall = { sequence, startedAt: now(), status: 'failed' }
    calls.push(entry)
    active += 1; peak = Math.max(peak, active)
    try {
      await executor.execute({ operation: 'understandAndPlan', instruction: 'Return a JSON object with one key named smoke and value ok. Return no other text.', input: { smoke: true, sequence }, outputContract: { type: 'object' }, metadata: { executionId: `rhl-company-identity-concurrency-001-smoke-${sequence}` } })
      entry.completedAt = now(); entry.durationMs = durationBetween(entry.startedAt, entry.completedAt); entry.status = 'passed'
    } catch (error) {
      entry.completedAt = now(); entry.durationMs = durationBetween(entry.startedAt, entry.completedAt); entry.errorCode = typeof (error as { code?: unknown })?.code === 'string' ? (error as { code: string }).code : 'unknown'; entry.error = errorText(error).slice(0, 500)
    } finally { active -= 1 }
  }))
  calls.sort((left, right) => left.sequence - right.sequence)
  return { requested: count, calls, wallClockMs: Date.now() - started, peak, passed: calls.every((call) => call.status === 'passed') }
}

class RecordingExecutor implements ReasoningExecutor {
  readonly calls: Dict[] = []
  readonly extractionCandidates: Dict[] = []
  private sequence = 0
  private active = 0
  private extractionActive = 0
  extractionPeak = 0
  peak = 0
  constructor(private readonly inner: CodexReasoningExecutor, private readonly runId: string) {}
  capabilities(): ReasoningCapabilities { return this.inner.capabilities() }
  async execute(request: ReasoningRequest): Promise<ReasoningResult> {
    const sequence = ++this.sequence
    const startedAt = now()
    const input = isDict(request.input) ? request.input : {}
    const unit = isDict(input.unit) ? input.unit : {}
    const resolutionCase = isDict(input.resolutionCase) ? input.resolutionCase : {}
    const entry: Dict = { sequence, operation: request.operation, unitId: typeof unit.unitId === 'string' ? unit.unitId : typeof resolutionCase.caseId === 'string' ? resolutionCase.caseId : null, startedAt, inputChars: JSON.stringify(request.input).length, outputBytes: 0, status: 'running' }
    this.calls.push(entry); this.active += 1; this.peak = Math.max(this.peak, this.active); if (request.operation === 'extractKnowledge') { this.extractionActive += 1; this.extractionPeak = Math.max(this.extractionPeak, this.extractionActive) }
    try {
      const result = await this.inner.execute({ ...request, metadata: { ...(request.metadata ?? {}), executionId: `${this.runId}-${String(sequence).padStart(3, '0')}` } })
      const completedAt = now(); entry.completedAt = completedAt; entry.durationMs = result.durationMs ?? durationBetween(startedAt, completedAt); entry.outputBytes = Buffer.byteLength(String(result.rawOutput ?? result.output), 'utf8'); entry.status = 'passed'; const output = parsedOutput(result.output); if (request.operation === 'extractKnowledge' && isDict(output) && Array.isArray(output.entities)) for (const candidate of output.entities) if (isDict(candidate)) this.extractionCandidates.push({ candidateId: candidate.candidateId ?? null, entityType: candidate.entityType ?? null, name: candidate.name ?? null, aliases: Array.isArray(candidate.aliases) ? candidate.aliases.slice(0, 12) : [] })
      return result
    } catch (error) {
      const completedAt = now(); entry.completedAt = completedAt; entry.durationMs = durationBetween(startedAt, completedAt); entry.status = 'failed'; entry.errorCode = typeof (error as { code?: unknown })?.code === 'string' ? (error as { code: string }).code : 'unknown'; entry.error = errorText(error).slice(0, 500); throw error
    } finally { this.active -= 1; if (request.operation === 'extractKnowledge') this.extractionActive -= 1 }
  }
}

function entityValue(asset: { value: object }): Dict { return asset.value as Dict }
function companyLabel(value: Dict): string { return typeof value.name === 'string' ? normalizeSemanticText(value.name) : '' }
function companyHardKey(value: Dict): string | null { const ticker = typeof value.ticker === 'string' ? normalizeSemanticText(value.ticker) : ''; const exchange = typeof value.exchange === 'string' ? normalizeSemanticText(normalizeExchange(value.exchange)) : ''; return ticker && exchange ? `${exchange}|${ticker}` : null }
function approvedSecurityBase(name: string): string { const match = /^(?<base>.+?)\s*[（(]\s*[0-9]{6}\.(?:SH|SSE|SZ|SZSE|BJ|BSE|NQ|NEEQ)\s*[）)]\s*$/iu.exec(name) ?? /^(?<base>.+?)\s+[0-9]{6}\.(?:SH|SSE|SZ|SZSE|BJ|BSE|NQ|NEEQ)\s*$/iu.exec(name); return match?.groups?.base?.trim().replace(/\s+/gu, ' ') ?? name }
function groupsFromMap(map: Map<string, string[]>): Dict[] { return [...map.entries()].filter(([, ids]) => ids.length > 1).sort(([a], [b]) => a.localeCompare(b)).map(([key, ids]) => ({ key, entityIds: ids.sort() })) }

function companyAudit(assets: Awaited<ReturnType<KnowledgeBaseLoaderV03['load']>>): Dict {
  const companies = assets.entities.filter((asset) => { const value = entityValue(asset); const lifecycle = isDict(value.lifecycle) ? value.lifecycle : {}; return value.type === 'company' && lifecycle.status === 'active' })
  const hardMap = new Map<string, string[]>(); const labelMap = new Map<string, string[]>(); const securityMap = new Map<string, string[]>()
  for (const asset of companies) {
    const value = entityValue(asset); const id = String(value.id); const hard = companyHardKey(value); if (hard) hardMap.set(hard, [...(hardMap.get(hard) ?? []), id])
    for (const label of [value.name, ...(Array.isArray(value.aliases) ? value.aliases : [])]) if (typeof label === 'string' && companyLabel({ name: label })) labelMap.set(companyLabel({ name: label }), [...(labelMap.get(companyLabel({ name: label })) ?? []), id])
    const base = approvedSecurityBase(typeof value.name === 'string' ? value.name : ''); if (base !== value.name && base !== '') securityMap.set(normalizeSemanticText(base), [...(securityMap.get(normalizeSemanticText(base)) ?? []), id])
  }
  const hardGroups = groupsFromMap(hardMap); const exactGroups = groupsFromMap(labelMap); const securityGroups = groupsFromMap(securityMap)
  const coverage = { totalCompanies: companies.length, companiesWithTicker: companies.filter((asset) => typeof entityValue(asset).ticker === 'string' && entityValue(asset).ticker !== '').length, companiesWithExchange: companies.filter((asset) => typeof entityValue(asset).exchange === 'string' && entityValue(asset).exchange !== '').length, companiesWithCompleteHardIdentity: companies.filter((asset) => companyHardKey(entityValue(asset)) !== null).length }
  return { coverage, percentageCompleteHardIdentity: companies.length === 0 ? 0 : Number((coverage.companiesWithCompleteHardIdentity / companies.length * 100).toFixed(2)), duplicateCompleteHardKeyGroups: hardGroups, exactNameAliasSuspectGroups: exactGroups, approvedSecurityDecorationSuspectGroups: securityGroups, activeCompanyCount: companies.length }
}

function knownCompanyCheck(assets: Awaited<ReturnType<KnowledgeBaseLoaderV03['load']>>, variants: string[], observed: Dict[]): Dict {
  const normalizedVariants = variants.map((value) => normalizeSemanticText(value)); const matches = assets.entities.filter((asset) => { const value = entityValue(asset); return value.type === 'company' && [value.name, ...(Array.isArray(value.aliases) ? value.aliases : [])].some((label) => typeof label === 'string' && normalizedVariants.includes(normalizeSemanticText(label))) })
  const observedVariants = normalizedVariants.filter((variant) => observed.some((item) => typeof item.name === 'string' && normalizeSemanticText(item.name) === variant || Array.isArray(item.aliases) && item.aliases.some((label) => typeof label === 'string' && normalizeSemanticText(label) === variant)))
  return { observedInModelOutput: observedVariants.length > 0, targetNotReproduced: observedVariants.length < normalizedVariants.length, observedVariants: observedVariants.map((variant) => variants[normalizedVariants.indexOf(variant)]), expectedVariants: variants, canonicalCount: matches.length, entities: matches.map((asset) => { const value = entityValue(asset); return { id: value.id, name: value.name, aliases: value.aliases ?? [], ticker: value.ticker ?? null, exchange: value.exchange ?? null, legalName: value.legalName ?? null } }) }
}

function relationClaimConvergence(assets: Awaited<ReturnType<KnowledgeBaseLoaderV03['load']>>, checks: Record<string, Dict>): Dict {
  const companyIds = new Set(Object.values(checks).flatMap((check) => Array.isArray(check.entities) ? check.entities.map((entity) => String((entity as Dict).id)) : []))
  const relations = assets.relations.map((asset) => asset.value as unknown as Dict).filter((value) => companyIds.has(String(value.sourceRef)) || companyIds.has(String(value.targetRef)))
  const claims = assets.claims.map((asset) => asset.value as unknown as Dict).filter((value) => Array.isArray(value.subjectRefs) && value.subjectRefs.some((ref) => companyIds.has(String(ref))))
  return { passed: [...companyIds].every((id) => relations.some((value) => value.sourceRef === id || value.targetRef === id) || claims.some((value) => (value.subjectRefs as unknown[]).some((ref) => String(ref) === id))), relationCount: relations.length, claimCount: claims.length, relations, claims }
}

function reviewDetails(summary: unknown): Dict { const value = isDict(summary) ? summary : {}; return { total: Number(value.total ?? 0), root: Number(value.rootCount ?? 0), dependency: Number(value.dependencyCount ?? 0), byCategory: value.byCategory ?? {}, byKind: value.byCandidateKind ?? {} } }
function operationCounts(assets: Awaited<ReturnType<KnowledgeBaseLoaderV03['load']>>): Dict { return { entityCreates: assets.entities.length, relationCreates: assets.relations.length, claimCreates: assets.claims.length, investmentThemeCreates: assets.entities.filter((asset) => entityValue(asset).type === 'investment_theme').length, themeGroupCreates: assets.themeGroups.length, themeGroupUpdates: 0 } }
function latency(calls: Dict[], operation: string): Dict { const values = calls.filter((call) => call.operation === operation && typeof call.durationMs === 'number').map((call) => Number(call.durationMs)).sort((a, b) => a - b); const percentile = (fraction: number): number | null => values.length === 0 ? null : values[Math.min(values.length - 1, Math.floor((values.length - 1) * fraction))]!; return { count: values.length, min: values[0] ?? null, mean: values.length === 0 ? null : Math.round(values.reduce((sum, value) => sum + value, 0) / values.length), p50: percentile(0.5), p95: percentile(0.95), max: values.at(-1) ?? null } }

async function main(): Promise<void> {
  const stages: Record<string, Stage> = {}; const started = Date.now(); const evidence: Dict = { taskId: 'RHL-VALIDATION-COMPANY-IDENTITY-CONCURRENCY-001', validationTask: 'RHL-VALIDATION-COMPANY-IDENTITY-CONCURRENCY-001', productBaseline, knowledgeBaseId, workflowRunId, phase: 'executing', phaseTimestamps: stages, productionCodeModified: false, historicalEvidenceModified: false, historicalRuntimeKbModified: false }
  let kbRoot = resolve(repoRoot, 'runtime-data', 'knowledge-bases', knowledgeBaseId); let recorder: RecordingExecutor | undefined
  try {
    if (process.argv.includes('--refresh-evidence-only')) { const existing = JSON.parse(await readFile(outputPath, 'utf8')) as Dict; const finalKb = isDict(existing.finalKnowledgeBase) ? existing.finalKnowledgeBase : {}; const observed = Array.isArray(finalKb.companyCandidatesObserved) ? finalKb.companyCandidatesObserved.filter(isDict) : []; const refreshRegistry = new KnowledgeBaseRegistry(); const refreshHandle = await refreshRegistry.mount(kbRoot); const refreshAssets = await new KnowledgeBaseLoaderV03(refreshRegistry).load(refreshHandle); finalKb.knownCompanyChecks = { zhongjixin: knownCompanyCheck(refreshAssets, ['中巨芯', '中巨芯（688549.SH）', '中巨芯(688549.SH)'], observed), shanghaiXinyang: knownCompanyCheck(refreshAssets, ['上海新阳', '上海新阳（300236.SZ）'], observed), honeywell: knownCompanyCheck(refreshAssets, ['霍尼韦尔', '霍尼韦尔（Honeywell）', 'Honeywell'], observed) }; existing.finalKnowledgeBase = finalKb; await writeEvidence(existing); await writeSummary(existing); console.log(JSON.stringify({ refreshedEvidence: outputPath, summary: summaryPath, knownCompanyChecks: finalKb.knownCompanyChecks })); return }
    const head = await command('git', ['rev-parse', 'HEAD']); const remote = await command('git', ['rev-parse', 'origin/main']); const status = await command('git', ['status', '--porcelain']); evidence.baseline = { head, originMain: remote, productBaseline, trackedWorkingTreeClean: status === '' || status.split('\n').every((line) => line.startsWith('?? ')), protectedPdfUntracked: status.includes(pdfFilename) }; assertCondition(head === productBaseline && remote === productBaseline, `Product baseline mismatch: HEAD=${head}, origin/main=${remote}`); assertCondition(status === '' || status.split('\n').every((line) => line.startsWith('?? ')), 'Tracked working tree is not clean')
    await stage(stages, 'pdf_verified', async () => { const fileStat = await stat(pdfPath); const digest = sha256(Uint8Array.from(await readFile(pdfPath))); assertCondition(fileStat.size === expectedBytes && digest === expectedSha256, `Frozen PDF identity mismatch: bytes=${fileStat.size}, sha256=${digest}`); evidence.pdf = { filename: pdfFilename, path: pdfPath, bytes: fileStat.size, sha256: digest, expectedBytes, expectedSha256, exactMatch: true } })
    const smokeExecutor = new CodexReasoningExecutor({ capabilities: { ...baseCapabilities, maxConcurrency: 4 }, timeoutMs, maxOutputChars, model: requestedModel, reasoningEffort: requestedReasoningEffort })
    const fourWay = await stage(stages, 'four_way_smoke', async () => smoke(smokeExecutor, 4)); let selectedConcurrency = 4; let fallback: Dict = { used: false }
    if (!fourWay.passed) { const twoWay = await stage(stages, 'two_way_smoke', async () => smoke(new CodexReasoningExecutor({ capabilities: { ...baseCapabilities, maxConcurrency: 2 }, timeoutMs, maxOutputChars, model: requestedModel, reasoningEffort: requestedReasoningEffort }), 2)); fallback = { used: true, reason: 'four-way smoke failed', twoWay }; assertCondition(twoWay.passed, 'Both four-way and two-way host smoke failed'); selectedConcurrency = 2 }
    evidence.concurrencySmoke = { requested: 4, fourWay, fallback, selectedConcurrency, passed: true }
    const pythonExecutable = process.env.RESEARCHHUB_PYTHON_EXECUTABLE ?? resolve(repoRoot, '..', 'ResearchHub', '.researchhub-document-parser', 'venv', 'Scripts', 'python.exe'); const artifactsPath = process.env.RESEARCHHUB_DOCLING_ARTIFACTS_PATH ?? resolve(repoRoot, '..', 'ResearchHub', '.researchhub-document-parser', 'models'); const bridgePath = process.env.RESEARCHHUB_DOCLING_BRIDGE ?? resolve(repoRoot, 'plugins', 'document', 'docling', 'bridge', 'docling_bridge.py'); await access(pythonExecutable); await access(artifactsPath); await access(bridgePath)
    process.env.RESEARCHHUB_PYTHON_EXECUTABLE = pythonExecutable; process.env.RESEARCHHUB_DOCLING_ARTIFACTS_PATH = artifactsPath; process.env.RESEARCHHUB_DOCLING_BRIDGE = bridgePath; const parser = new DoclingDocumentParser({ pythonExecutable, artifactsPath, bridgePath }); const resolver = new DocumentInputResolver(); const acquired = await resolver.acquire({ type: 'file', reference: pdfPath }); const doclingStarted = Date.now(); const parsed = await parser.parse(acquired); const doclingDuration = Date.now() - doclingStarted; evidence.runtime = { codexCli: await command('codex', ['--version']), model: requestedModel, reasoningEffort: requestedReasoningEffort, docling: { parser: parsed.parser, stats: parsed.stats, warnings: parsed.warnings, durationMs: doclingDuration, pythonExecutable, artifactsPath, bridgePath }, selectedConcurrency, configuredCapabilities: { ...baseCapabilities, maxConcurrency: selectedConcurrency } }
    await prepareFreshKnowledgeBase(kbRoot); const registry = new KnowledgeBaseRegistry(); const handle = await registry.mount(kbRoot); const inner = new CodexReasoningExecutor({ capabilities: { ...baseCapabilities, maxConcurrency: selectedConcurrency }, timeoutMs, maxOutputChars, model: requestedModel, reasoningEffort: requestedReasoningEffort }); recorder = new RecordingExecutor(inner, workflowRunId); const skill = new KnowledgeCurationSkill({ executor: recorder }); const workflowInput = { handle, documentInput: { type: 'file' as const, reference: pdfPath }, skill, workflowRunId, sourceMetadata: { institution: '西部证券', publishedAt: '2026-08-05', title: 'AI算力行业：AI算力上游材料产业链研究报告' }, config: { maxExtractionUnits: 32, maxPlanAttempts: 2, maxExtractionAttempts: 2, maxConcurrency: selectedConcurrency, maxResolutionAttempts: 2, maxResolutionCases: 32, maxEntityBindingCandidates: 8, maxContextTokens: baseCapabilities.maxContextTokens }, clock: () => '2026-09-05T00:00:00.000Z' }
    const primaryStarted = Date.now(); const primary = await stage(stages, 'primary_workflow', async () => runRawDocumentKnowledgeIngestion(workflowInput)); const primaryDuration = Date.now() - primaryStarted; evidence.primary = { status: primary.status, writeStatus: primary.writeStatus, baseRevision: primary.baseRevision, committedRevision: primary.committedRevision, acceptedPlanUnits: primary.acceptedPlan?.units.length ?? 0, unitSummaries: primary.unitSummaries, candidateCounts: primary.candidateCounts, rejectedCandidates: primary.rejectedCandidates.length, extractionConcurrency: primary.extractionConcurrency, peakExtractionConcurrency: primary.peakExtractionConcurrency, errors: primary.errors }
    assertCondition(primary.status !== 'blocked', `Primary workflow blocked: ${primary.errors.join('; ')}`); assertCondition(primary.writeStatus === 'committed', `Expected committed Writer result, received ${String(primary.writeStatus)}`); assertCondition(primary.baseRevision === 0 && primary.committedRevision === 1, 'Expected revision 0 to 1'); assertCondition(primary.acceptedPlan !== undefined && primary.unitSummaries.length === primary.acceptedPlan.units.length && primary.unitSummaries.every((unit) => unit.status === 'completed'), 'Not all ExtractionUnits completed'); assertCondition(primary.extractionConcurrency === selectedConcurrency && (primary.peakExtractionConcurrency ?? 0) <= selectedConcurrency, 'Extraction concurrency telemetry violated configured bound')
    const assets = await stage(stages, 'reload_validation', async () => { const refreshed = await new KnowledgeBaseLoaderV03(registry).refresh(handle); const report = await validateKnowledgeBaseV03(kbRoot); assertCondition(report.status === 'passed', `Reload validation failed: ${report.errors.map((item) => item.message).join('; ')}`); return { refreshed, assets: await new KnowledgeBaseLoaderV03(registry).load(refreshed), report } })
    const loaded = assets.assets; const audit = companyAudit(loaded); const observed = recorder.extractionCandidates; const known = { zhongjixin: knownCompanyCheck(loaded, ['中巨芯', '中巨芯（688549.SH）', '中巨芯(688549.SH)'], observed), shanghaiXinyang: knownCompanyCheck(loaded, ['上海新阳', '上海新阳（300236.SZ）'], observed), honeywell: knownCompanyCheck(loaded, ['霍尼韦尔', '霍尼韦尔（Honeywell）', 'Honeywell'], observed) }; const relationsClaims = relationClaimConvergence(loaded, known); const persistedObjects = [...loaded.themeGroups, ...loaded.entities, ...loaded.relations, ...loaded.claims, ...loaded.modules, ...loaded.sources].map((asset) => asset.value); const plannedLeaks = persistedObjects.filter((value) => /planned-(?:entity|relation|claim)-/.test(JSON.stringify(value))).length; const sourceById = new Map(loaded.sources.map((asset) => [String((asset.value as unknown as Dict).id), asset.value as unknown as Dict])); const provenanceFailures = loaded.claims.filter((asset) => { const value = asset.value as unknown as Dict; if (!Array.isArray(value.sourceRefs) || value.sourceRefs.length === 0) return true; return value.sourceRefs.some((ref) => typeof ref !== 'string' || !sourceById.has(ref) || !(sourceById.get(ref)?.rawRefs as unknown[] | undefined)?.includes(primary.rawRef)) }).length; const operations = operationCounts(loaded); const reviews = reviewDetails(primary.reviewSummary); evidence.finalKnowledgeBase = { revision: assets.refreshed.revision, counts: { themeGroups: loaded.themeGroups.length, entities: loaded.entities.length, relations: loaded.relations.length, claims: loaded.claims.length, sources: loaded.sources.length, modules: loaded.modules.length }, validation: assets.report.status, provenanceFailures, plannedReferenceLeakCount: plannedLeaks, companyAudit: audit, knownCompanyChecks: known, relationClaimConvergence: relationsClaims, companyCandidatesObserved: observed, relationClaimReview: reviews }; evidence.reviewSummary = reviews; evidence.changeset = operations; evidence.writer = { invocations: 1, revisionBefore: primary.baseRevision, revisionAfter: primary.committedRevision, status: primary.writeStatus }; assertCondition(audit.duplicateCompleteHardKeyGroups instanceof Array && audit.duplicateCompleteHardKeyGroups.length === 0, 'Duplicate complete Company hard keys found'); assertCondition(plannedLeaks === 0 && provenanceFailures === 0, 'Persisted safety invariant failed'); assertCondition(Number(operations.investmentThemeCreates) === 0 && Number(operations.themeGroupCreates) === 0 && Number(operations.themeGroupUpdates) === 0, 'Theme mutation safety invariant failed')
    const callsBeforeReplay = recorder.calls.length; const revisionBeforeReplay = assets.refreshed.revision; const replayStarted = Date.now(); const replay = await stage(stages, 'replay', async () => runRawDocumentKnowledgeIngestion(workflowInput)); const replayDuration = Date.now() - replayStarted; const revisionAfterReplay = (await new KnowledgeBaseLoaderV03(registry).refresh(handle)).revision; evidence.replay = { status: replay.status, writeStatus: replay.writeStatus, additionalReasoningCalls: recorder.calls.length - callsBeforeReplay, revisionBefore: revisionBeforeReplay, revisionAfter: revisionAfterReplay, alreadyCommitted: replay.writeStatus === 'already_committed', sameStatus: replay.status === primary.status, sameReviewSummary: stable(replay.reviewSummary) === stable(primary.reviewSummary), sameChangeSetId: replay.changeSetId === primary.changeSetId, idempotent: replay.writeStatus === 'already_committed' && recorder.calls.length === callsBeforeReplay && revisionAfterReplay === revisionBeforeReplay }; assertCondition((evidence.replay as Dict).idempotent === true, 'Replay was not idempotent')
    const allCalls = recorder.calls; const extractionCalls = allCalls.filter((call) => call.operation === 'extractKnowledge'); const extractionStarts = extractionCalls.map((call) => call.startedAt).filter((value): value is string => typeof value === 'string'); const extractionCompletions = extractionCalls.map((call) => call.completedAt).filter((value): value is string => typeof value === 'string'); const firstExtraction = extractionStarts.sort()[0]; const lastExtraction = extractionCompletions.sort().at(-1); const extractionWall = firstExtraction && lastExtraction ? durationBetween(firstExtraction, lastExtraction) : null; const planDuration = latency(allCalls, 'understandAndPlan'); const primaryOverhead = extractionWall === null ? null : Math.max(0, primaryDuration - extractionWall); evidence.performance = { stages: { doclingPreflightMs: doclingDuration, planMs: planDuration, extractionWallClockMs: extractionWall, postExtractionAndWorkflowOverheadMs: primaryOverhead, primaryWorkflowMs: primaryDuration, replayMs: replayDuration, totalWallClockMs: Date.now() - started }, extractionLatencyMs: latency(allCalls, 'extractKnowledge'), reasoningOperations: allCalls, concurrency: { configured: selectedConcurrency, executorCapability: inner.capabilities().maxConcurrency, actual: primary.extractionConcurrency, peak: recorder.extractionPeak }, historicalComparison: { serialPrimaryMs: serialReferenceMs, currentPrimaryMs: primaryDuration, approximateSpeedup: Number((serialReferenceMs / primaryDuration).toFixed(3)), approximateTimeReductionPct: Number(((1 - primaryDuration / serialReferenceMs) * 100).toFixed(2)), caveat: 'Approximate only: Luna outputs, ExtractionUnit count, and service latency vary; speedup is not attributed solely to concurrency.' } }
    evidence.validationOutcome = 'SUCCESS'; evidence.ctoAcceptance = 'PENDING'; evidence.phase = 'completed'; evidence.completedAt = now(); await writeEvidence(evidence); await writeSummary(evidence); console.log(JSON.stringify({ outcome: evidence.validationOutcome, pdf: evidence.pdf, smoke: evidence.concurrencySmoke, primary: evidence.primary, finalKnowledgeBase: evidence.finalKnowledgeBase, replay: evidence.replay, evidence: outputPath, summary: summaryPath }))
  } catch (error) { evidence.phase = 'blocked'; evidence.completedAt = now(); evidence.validationOutcome = /mismatch|not found|access|codex|docling|baseline/i.test(errorText(error)) ? 'VALIDATION_ENVIRONMENT_FAILURE' : /timeout|timed out/i.test(errorText(error)) ? 'REASONING_FAILURE' : 'PRODUCT_DEFECT'; evidence.error = errorText(error).slice(0, 4000); await writeEvidence(evidence); await writeSummary(evidence); console.error(JSON.stringify({ outcome: evidence.validationOutcome, error: evidence.error, evidence: outputPath, summary: summaryPath })); process.exitCode = 1 }
}

async function writeSummary(evidence: Dict): Promise<void> { const runtime = isDict(evidence.runtime) ? evidence.runtime : {}; const pdf = isDict(evidence.pdf) ? evidence.pdf : {}; const smoke = isDict(evidence.concurrencySmoke) ? evidence.concurrencySmoke : {}; const primary = isDict(evidence.primary) ? evidence.primary : {}; const finalKb = isDict(evidence.finalKnowledgeBase) ? evidence.finalKnowledgeBase : {}; const replay = isDict(evidence.replay) ? evidence.replay : {}; const performance = isDict(evidence.performance) ? evidence.performance : {}; const reviews = isDict(evidence.reviewSummary) ? evidence.reviewSummary : {}; const audit = isDict(finalKb.companyAudit) ? finalKb.companyAudit : {}; const known = isDict(finalKb.knownCompanyChecks) ? finalKb.knownCompanyChecks : {}; const lines = ['# RHL-VALIDATION-COMPANY-IDENTITY-CONCURRENCY-001', '', `- Classification: **${String(evidence.validationOutcome ?? 'IN_PROGRESS')}**`, '- CTO acceptance: pending', `- Product baseline: \`${productBaseline}\``, `- PDF: ${pdf.filename ?? pdfFilename}; ${pdf.bytes ?? 'n/a'} bytes; ${pdf.sha256 ?? 'n/a'}`, `- Runtime: Docling=${JSON.stringify(runtime.docling ?? {})}; Codex=${String(runtime.codexCli ?? 'n/a')}; model=${String(runtime.model ?? requestedModel)}; effort=${String(runtime.reasoningEffort ?? requestedReasoningEffort)}`, `- Concurrency smoke: 4-way=${String((isDict(smoke.fourWay) ? smoke.fourWay.passed : false))}; selected=${String(smoke.selectedConcurrency ?? 'n/a')}; fallback=${String(isDict(smoke.fallback) && smoke.fallback.used)}`, `- Primary: status=${String(primary.status ?? 'n/a')}; Writer=${String(primary.writeStatus ?? 'n/a')}; units=${String(primary.acceptedPlanUnits ?? 'n/a')}; candidates=${JSON.stringify(primary.candidateCounts ?? {})}`, `- Final KB: ${JSON.stringify(finalKb.counts ?? {})}; validation=${String(finalKb.validation ?? 'n/a')}; provenanceFailures=${String(finalKb.provenanceFailures ?? 'n/a')}; plannedLeaks=${String(finalKb.plannedReferenceLeakCount ?? 'n/a')}`, `- Company coverage: ${JSON.stringify(audit.coverage ?? {})}; completeHardIdentity=${String(audit.percentageCompleteHardIdentity ?? 'n/a')}%`, `- Company hard-key duplicate groups: ${JSON.stringify(audit.duplicateCompleteHardKeyGroups ?? [])}`, `- Known Companies: ${JSON.stringify(known)}`, `- Relation/Claim convergence: ${JSON.stringify(finalKb.relationClaimConvergence ?? {})}`, `- Reviews: ${JSON.stringify(reviews)}`, `- ChangeSet: ${JSON.stringify(evidence.changeset ?? {})}`, `- Replay: ${JSON.stringify(replay)}`, `- Performance: ${JSON.stringify(performance)}`, '', 'Historical comparison is approximate and does not attribute all speedup to concurrency.', 'No production code, Schema, Writer, ID allocator, Knowledge Resolution, Reasoning policy, architecture, historical evidence, or historical runtime KB was modified by this validation task.', '', 'Residual risk: known Company variants may not all be emitted in one stochastic Luna run; a target not emitted is recorded as targetNotReproduced rather than treated as a pass.']
  await writeFile(summaryPath, lines.join('\n') + '\n', 'utf8')
}

void main()
