import { lstat, mkdir, mkdtemp, readdir, realpath, rm, writeFile } from 'node:fs/promises'
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { tmpdir } from 'node:os'
import { ModelRuntime, getAgentDir } from '@earendil-works/pi-coding-agent'
import type { Api, Model } from '@earendil-works/pi-ai'
import { createFreshKnowledgeBaseV04, readCanonicalV04Assets } from '../knowledge/storage/index.ts'
import { KnowledgeBaseRegistry } from '../knowledge/registry/registry.ts'
import { KnowledgeProductionGateway } from '../knowledge/production/gateway.ts'
import { verifyRaw } from '../knowledge/raw/raw-archive.ts'
import { CninfoOfficialDisclosureClient, OfficialDisclosureResearchPlugin } from '../plugins/research-acquisition/official.ts'
import { selectProductionReasoningModel } from '../app/pi/model-selection.ts'
import { PiReasoningExecutor } from '../plugins/reasoning/pi/executor.ts'
import { createResearchHubApplicationRuntime } from '../app/runtime/application-runtime.ts'
import { ResearchHubRuntimeServer } from '../app/runtime/server.ts'
import { hashKnowledgeObject } from '../knowledge/storage/canonical-hash.ts'
import { readResearchReport, type ResearchReport } from '../app/services/research-report.ts'

const repoRoot = resolve(import.meta.dirname, '..')
const evidencePath = resolve(repoRoot, 'tests/validation/evidence/RHL_TL001_THESIS_LIFECYCLE_CREATE_REAL_E2E.json')
const reportPath = resolve(repoRoot, 'docs/engineering/reports/2026-09-24-thesis-lifecycle-create-acceptance.md')
const symbol = process.env.RHL_TL001_SYMBOL ?? '600519'
const companyName = process.env.RHL_TL001_COMPANY_NAME ?? '贵州茅台'
const exchange = process.env.RHL_TL001_EXCHANGE ?? 'SSE'
const safeError = (error: unknown): string => String(error instanceof Error ? error.message : error)
  .replace(/[A-Za-z]:\\[^\s;,]*/gu, '<path>')
  .replace(/(authorization|cookie|api[-_]?key|token|secret)\s*[:=]\s*[^,;\s]+/giu, '$1=<redacted>')
  .replace(/(?:sk-[A-Za-z0-9_-]{12,}|Bearer\s+\S+)/giu, '<redacted>')
  .slice(0, 300)
const jsonObject = (value: unknown): Record<string, unknown> | undefined => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined
const normalizedText = (value: string): string => value.normalize('NFKC').replace(/\s+/gu, ' ').trim()
const fingerprint = (assets: Awaited<ReturnType<typeof readCanonicalV04Assets>>): string => assets.objects
  .map((item) => [item.value.id, hashKnowledgeObject(item.value)])
  .sort(([left], [right]) => String(left).localeCompare(String(right)))
  .map((entry) => entry.join(':'))
  .join('|')
const samePath = (left: string, right: string): boolean => process.platform === 'win32' ? left.toLocaleLowerCase('en-US') === right.toLocaleLowerCase('en-US') : left === right

interface CreateReportExpectations {
  readonly reportId: string
  readonly workflowRunId: string
  readonly companyRef: string
  readonly asOf: string
  readonly thesisRef: string
  readonly knowledgeBaseId: string
  readonly baseRevision: number
  readonly committedRevision: number
  readonly writerRunId: string
  readonly sourceRef: string
  readonly rawRef: string
  readonly evidenceClaimRef: string
  readonly propositionRefs: readonly string[]
}

function assertCreateReport(report: ResearchReport | undefined, label: 'SERVICE_REPORT' | 'DISK_REPORT', expected: CreateReportExpectations): void {
  const fail = (code: string): never => { throw new Error(`${label}_${code}`) }
  if (!report) fail('MISSING')
  if (report.reportId !== expected.reportId) fail('ID_INVALID')
  if (report.reportType !== 'thesis_lifecycle') fail('TYPE_INVALID')
  if (report.workflowRunId !== expected.workflowRunId) fail('WORKFLOW_ID_INVALID')
  if (report.asOf !== expected.asOf) fail('AS_OF_INVALID')
  if (report.subjectRefs.length !== 1 || report.subjectRefs[0] !== expected.companyRef) fail('SUBJECT_BINDING_INVALID')
  if (report.knowledgeBaseRevision !== expected.committedRevision) fail('REVISION_INVALID')

  const expectedClaims = [...new Set(expected.propositionRefs)].sort((left, right) => left.localeCompare(right))
  const reportClaims = [...report.claimRefs].sort((left, right) => left.localeCompare(right))
  if (JSON.stringify(reportClaims) !== JSON.stringify(expectedClaims)) fail('PROPOSITION_CLAIM_REFS_INVALID')
  if (report.sourceRefs.length !== 1 || report.sourceRefs[0] !== expected.sourceRef) fail('SOURCE_REFS_INVALID')

  const propositionSection = report.sections.find((section) => section.id === 'propositions')
  if (!propositionSection) fail('PROPOSITIONS_SECTION_MISSING')
  const propositionSectionClaims = [...(propositionSection.claimRefs ?? [])].sort((left, right) => left.localeCompare(right))
  if (JSON.stringify(propositionSectionClaims) !== JSON.stringify(expectedClaims)) fail('PROPOSITIONS_SECTION_CLAIM_REFS_INVALID')
  if (expectedClaims.some((claimRef) => !propositionSection.markdown.includes(claimRef))) fail('PROPOSITIONS_SECTION_CONTENT_INVALID')

  const evidenceSection = report.sections.find((section) => section.id === 'evidence-pit')
  if (!evidenceSection) fail('EVIDENCE_SECTION_MISSING')
  if (evidenceSection.sourceRefs?.length !== 1 || evidenceSection.sourceRefs[0] !== expected.sourceRef) fail('EVIDENCE_SECTION_SOURCE_REFS_INVALID')
  const evidenceLines = evidenceSection.markdown.split(/\r?\n/u).filter((line) => line.startsWith(`- ${expected.evidenceClaimRef}:`))
  if (evidenceLines.length !== 1 || !evidenceLines[0]!.startsWith(`- ${expected.evidenceClaimRef}: included`)) fail('EVIDENCE_DECISION_INVALID')
  if (!evidenceLines[0]!.includes(`${expected.sourceRef} -> ${expected.rawRef}`)) fail('EVIDENCE_SOURCE_RAW_BINDING_INVALID')

  const writerSection = report.sections.find((section) => section.id === 'writer-state')
  if (!writerSection) fail('WRITER_SECTION_MISSING')
  const writerLines = writerSection.markdown.split(/\r?\n/u)
  for (const value of [
    `Knowledge Base: ${expected.knowledgeBaseId}`,
    `Base revision: ${expected.baseRevision}`,
    `Committed revision: ${expected.committedRevision}`,
    `Writer run: ${expected.writerRunId}`,
  ]) if (!writerLines.includes(value)) fail('WRITER_STATE_INVALID')

  const thesisSection = report.sections.find((section) => section.id === 'thesis-created')
  if (!thesisSection) fail('THESIS_SECTION_MISSING')
  if (!thesisSection.markdown.split(/\r?\n/u).includes(`Thesis: ${expected.thesisRef}`)) fail('THESIS_REF_INVALID')
}

async function removeVerifiedMkdtemp(targetRoot: string, prefix: string): Promise<void> {
  const configuredTemp = resolve(tmpdir())
  const candidate = resolve(targetRoot)
  if (!samePath(dirname(candidate), configuredTemp) || !basename(candidate).startsWith(prefix)) throw new Error('TEMP_CLEANUP_CONTAINMENT_REJECTED')
  const rootStat = await lstat(candidate)
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) throw new Error('TEMP_CLEANUP_REPARSE_ROOT_REJECTED')
  const tempReal = await realpath(configuredTemp)
  const candidateReal = await realpath(candidate)
  if (!samePath(dirname(candidateReal), tempReal) || !basename(candidateReal).startsWith(prefix)) throw new Error('TEMP_CLEANUP_REALPATH_REJECTED')
  const inspect = async (directory: string): Promise<void> => {
    for (const name of await readdir(directory)) {
      const child = join(directory, name)
      const info = await lstat(child)
      if (info.isSymbolicLink() || (!info.isDirectory() && !info.isFile())) throw new Error('TEMP_CLEANUP_REPARSE_ENTRY_REJECTED')
      const actual = await realpath(child)
      const rel = relative(candidateReal, actual)
      if (rel === '' || rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) throw new Error('TEMP_CLEANUP_ENTRY_ESCAPE_REJECTED')
      if (info.isDirectory()) await inspect(child)
    }
  }
  await inspect(candidateReal)
  await rm(candidateReal, { recursive: true })
}

interface Stage { readonly status: 'PASS' | 'BLOCKED' | 'FAIL'; readonly detail: string }
interface AcceptanceEvidence {
  readonly generatedAt: string
  readonly taskId: 'RHL-TL-001'
  readonly classification: 'NOT_EXECUTED / BLOCKED' | 'EXECUTED / GATE_NOT_MET' | 'EXECUTED / PASS GATE'
  readonly processExitCode: number
  readonly pathClassification: 'isolated_source_evidence_seed_plus_normal_http_create'
  readonly userKnowledgeBaseTouched: false
  readonly seedIsProductCreateE2E: false
  readonly reasoning: { readonly provider: string; readonly model: string; readonly executor: 'PiReasoningExecutor'; readonly operations: readonly string[]; readonly formalization: 'real_model' | 'not_completed'; readonly exactSourceSpanVerified: boolean }
  readonly source?: { readonly publisher: 'CNINFO'; readonly provider: string; readonly publishedAt: string; readonly retrievedAt: string; readonly rightsEligible: boolean; readonly rawVerified: boolean; readonly rawBytes: number; readonly sourceBodyPersistedInEvidence: false }
  readonly seed?: { readonly knowledgeBaseId: string; readonly revision: number; readonly companyRef: string; readonly sourceRef: string; readonly rawRef: string; readonly evidenceClaimRef: string; readonly seededAssetCounts: Readonly<Record<string, number>> }
  readonly create?: { readonly workflowRunId: string; readonly serviceStatus?: string; readonly diagnostics?: readonly string[]; readonly workflowStatus: string; readonly thesisRef?: string; readonly propositionRefs: readonly string[]; readonly membershipEdgeRefs: readonly string[]; readonly baseRevision?: number; readonly committedRevision?: number; readonly writerRunId?: string; readonly identicalReplay: boolean; readonly changedInputConflict: boolean; readonly revisionAfterReplay?: number }
  readonly stages: Readonly<Record<string, Stage>>
  readonly errors: readonly string[]
  readonly secretsIncluded: false
  readonly sourceBodyIncluded: false
}

const stages: Record<string, Stage> = {}
const errors: string[] = []
const operations: string[] = []
let modelRuntime: ModelRuntime | undefined
let appRuntime: Awaited<ReturnType<typeof createResearchHubApplicationRuntime>> | undefined
let server: ResearchHubRuntimeServer | undefined
let tempRoot: string | undefined
let modelProvider = 'unavailable'
let modelName = 'unavailable'
let formalization: 'real_model' | 'not_completed' = 'not_completed'
let exactSourceSpanVerified = false
let sourceEvidence: AcceptanceEvidence['source']
let seedEvidence: AcceptanceEvidence['seed']
let createEvidence: AcceptanceEvidence['create']

function evidence(classification: AcceptanceEvidence['classification'], processExitCode: number): AcceptanceEvidence {
  return {
    generatedAt: new Date().toISOString(), taskId: 'RHL-TL-001', classification, processExitCode,
    pathClassification: 'isolated_source_evidence_seed_plus_normal_http_create', userKnowledgeBaseTouched: false, seedIsProductCreateE2E: false,
    reasoning: { provider: modelProvider, model: modelName, executor: 'PiReasoningExecutor', operations: [...operations], formalization, exactSourceSpanVerified },
    ...(sourceEvidence === undefined ? {} : { source: sourceEvidence }), ...(seedEvidence === undefined ? {} : { seed: seedEvidence }), ...(createEvidence === undefined ? {} : { create: createEvidence }),
    stages: { ...stages }, errors: [...new Set(errors)].slice(0, 20), secretsIncluded: false, sourceBodyIncluded: false,
  }
}

async function writeArtifacts(classification: AcceptanceEvidence['classification'], processExitCode: number): Promise<void> {
  const result = evidence(classification, processExitCode)
  await mkdir(join(repoRoot, 'tests/validation/evidence'), { recursive: true })
  await writeFile(evidencePath, `${JSON.stringify(result, null, 2)}\n`, 'utf8')
  const stageRows = Object.entries(stages).map(([name, stage]) => `| ${name} | ${stage.status} | ${stage.detail.replace(/[|\r\n]+/gu, ' ').slice(0, 220)} |`).join('\n') || '| none | BLOCKED | Acceptance did not reach runtime setup. |'
  const errorRows = errors.length ? errors.map((item) => `- ${item}`).join('\n') : '- None.'
  const createSummary = createEvidence
    ? `Workflow \`${createEvidence.workflowRunId}\` ended \`${createEvidence.workflowStatus}\`. Thesis ${createEvidence.thesisRef ?? 'not persisted'}; ${createEvidence.propositionRefs.length} generated proposition Claim(s), ${createEvidence.membershipEdgeRefs.length} \`qualifies\` edge(s); Writer run ${createEvidence.writerRunId ?? 'unavailable'}; revision ${createEvidence.baseRevision ?? 'unavailable'} -> ${createEvidence.committedRevision ?? 'unavailable'}. Identical replay: ${createEvidence.identicalReplay}; changed-input conflict: ${createEvidence.changedInputConflict}.`
    : 'The normal CREATE route did not complete.'
  const report = `# Thesis lifecycle CREATE acceptance\n\nDate: ${result.generatedAt.slice(0, 10)}\n\nTask: \`RHL-TL-001\`\n\nClassification: isolated v0.4 source/evidence setup followed by the normal authenticated HTTP CREATE route and configured Pi Thesis Formalize operation. The temporary seed contains a company scope Entity, one live original-publisher Source/Raw, and one source-bound canonical evidence Claim. It contains no Thesis, generated proposition Claim, or \`qualifies\` membership edge before product CREATE.\n\n## Result\n\n${result.classification} (process exit ${processExitCode}). ${createSummary}\n\nThe seed is setup only and is not counted as CREATE product E2E. CREATE was invoked with the same bounded public command accepted by the runtime HTTP API. The workflow used \`${modelProvider}/${modelName}\` through \`PiReasoningExecutor\`; required operation: \`thesis_formalize_semantic\`. The disposable KB and runtime were temporary. The mounted user Knowledge Base was not touched. Evidence omits source text, extracted statements, credentials, and Raw bytes.\n\n## Evidence stages\n\n| Stage | Status | Evidence |\n| --- | --- | --- |\n${stageRows}\n\n## Errors / blockers\n\n${errorRows}\n\n## Machine evidence\n\n- \`tests/validation/evidence/RHL_TL001_THESIS_LIFECYCLE_CREATE_REAL_E2E.json\`\n- Script: \`scripts/acceptance-thesis-lifecycle-create-real.ts\`\n- User KB touched: \`false\`\n- Setup seed counted as CREATE: \`false\`\n- Secrets included: \`false\`\n- Source body included: \`false\`\n`
  await mkdir(join(repoRoot, 'docs/engineering/reports'), { recursive: true })
  await writeFile(reportPath, report, 'utf8')
  console.log(JSON.stringify(result, null, 2))
}

async function waitForWorkflow(origin: string, runId: string, headers: Record<string, string>): Promise<{ readonly status: string }> {
  for (let attempt = 0; attempt < 900; attempt += 1) {
    const response = await fetch(`${origin}/api/workflows/${encodeURIComponent(runId)}`, { headers })
    if (!response.ok) throw new Error(`HTTP workflow read failed: ${response.status}`)
    const workflow = await response.json() as { readonly status: string }
    if (['completed', 'completed_with_review', 'blocked', 'failed', 'cancelled'].includes(workflow.status)) return workflow
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 1000))
  }
  throw new Error('THESIS_CREATE_WORKFLOW_TIMEOUT')
}

async function postCreate(origin: string, headers: Record<string, string>, body: Record<string, unknown>): Promise<Response> {
  return fetch(`${origin}/api/production/thesis-lifecycle/create`, { method: 'POST', headers, body: JSON.stringify(body) })
}

async function main(): Promise<void> {
  tempRoot = await mkdtemp(join(tmpdir(), 'rhl-tl001-create-'))
  const kbRoot = join(tempRoot, 'kb')
  const cwd = join(tempRoot, 'runtime')
  const workspaceRoot = join(tempRoot, 'workspace')
  await Promise.all([mkdir(cwd), mkdir(workspaceRoot)])

  const acquisition = new OfficialDisclosureResearchPlugin(new CninfoOfficialDisclosureClient({ timeoutMs: 20_000 }))
  const discoveryAsOf = new Date().toISOString()
  let candidate: Awaited<ReturnType<typeof acquisition.discover>>[number] | undefined
  let normalized: Awaited<ReturnType<typeof acquisition.normalize>> | undefined
  try {
    const candidates = await acquisition.discover({ company: { symbol, name: companyName, exchange }, asOf: discoveryAsOf, limitPerKind: 20 })
    candidate = [...candidates].filter((item) => item.url && item.publishedAt && Date.parse(item.publishedAt) <= Date.parse(discoveryAsOf)).sort((left, right) => Date.parse(right.publishedAt!) - Date.parse(left.publishedAt!))[0]
    if (!candidate) throw new Error(`CNINFO_LIVE_DISCLOSURE_NOT_FOUND:${symbol}`)
    stages.originalPublisherDiscovery = { status: 'PASS', detail: `${candidate.provider}; official disclosure candidate published ${candidate.publishedAt}` }
  } catch (error) {
    stages.originalPublisherDiscovery = { status: 'BLOCKED', detail: safeError(error) }
    errors.push(`CNINFO_LIVE_DISCOVERY_BLOCKED:${safeError(error)}`)
    await writeArtifacts('NOT EXECUTED / BLOCKED', 1)
    return
  }
  try {
    const fetched = await acquisition.fetch(candidate)
    normalized = await acquisition.normalize(fetched)
    if (!normalized.rawBytes?.length || normalized.content.trim().length < 100) throw new Error('CNINFO_LIVE_DOCUMENT_CONTENT_UNAVAILABLE')
    sourceEvidence = {
      publisher: 'CNINFO', provider: candidate.provider, publishedAt: candidate.publishedAt!, retrievedAt: normalized.retrievedAt,
      rightsEligible: normalized.rights.accessScope === 'public' && normalized.rights.retentionAllowed && normalized.rights.aiProcessingAllowed && normalized.rights.derivativeKnowledgeAllowed,
      rawVerified: false, rawBytes: normalized.rawBytes.length, sourceBodyPersistedInEvidence: false,
    }
    if (!sourceEvidence.rightsEligible) throw new Error('CNINFO_SOURCE_RIGHTS_NOT_ADMITTED')
    stages.liveFetchNormalizeRights = { status: 'PASS', detail: `CNINFO original-publisher document normalized; ${normalized.rawBytes.length} raw bytes; admitted for retention, AI processing and derived knowledge` }
  } catch (error) {
    stages.liveFetchNormalizeRights = { status: 'BLOCKED', detail: safeError(error) }
    errors.push(`CNINFO_LIVE_FETCH_NORMALIZE_BLOCKED:${safeError(error)}`)
    await writeArtifacts('NOT EXECUTED / BLOCKED', 1)
    return
  }

  try {
    modelRuntime = await ModelRuntime.create({ authPath: join(getAgentDir(), 'auth.json'), modelsPath: join(getAgentDir(), 'models.json'), allowModelNetwork: true, refreshOnCreate: false })
    const model = selectProductionReasoningModel(modelRuntime) as Model<Api>
    modelProvider = model.provider
    modelName = model.id
    const executor = new PiReasoningExecutor({ modelRuntime, model, timeoutMs: 900_000, maxOutputChars: 400_000 })
    const extractionResponse = await executor.execute({
      operation: 'extractKnowledge',
      instruction: 'From this original-publisher document, extract one concise factual statement directly supported by the supplied text. Return that statement and one exact sourceSpan copied from the text. Do not infer or add context.',
      input: { sourceTitle: candidate.title, sourceUrl: candidate.url, publishedAt: candidate.publishedAt, content: normalized.content.slice(0, 24_000) },
      outputContract: { type: 'object', required: ['statement', 'sourceSpan'], properties: { statement: { type: 'string', minLength: 20, maxLength: 500 }, sourceSpan: { type: 'string', minLength: 20, maxLength: 800 } }, additionalProperties: false },
    })
    operations.push('extractKnowledge')
    const output = jsonObject(extractionResponse.output)
    const statement = typeof output?.statement === 'string' ? normalizedText(output.statement).slice(0, 500) : ''
    const sourceSpan = typeof output?.sourceSpan === 'string' ? normalizedText(output.sourceSpan) : ''
    if (statement.length < 20 || sourceSpan.length < 20 || !normalizedText(normalized.content).includes(sourceSpan)) throw new Error('LIVE_SOURCE_EXTRACTION_NOT_VERIFIABLE')
    exactSourceSpanVerified = true
    stages.configuredPiSourceExtraction = { status: 'PASS', detail: `${model.provider}/${model.id}; exact returned sourceSpan matched normalized live source text (content omitted)` }

    const asOf = new Date().toISOString()
    if (Date.parse(candidate.publishedAt!) > Date.parse(asOf)) throw new Error('LIVE_SOURCE_PUBLICATION_OUTSIDE_ASOF')
    await createFreshKnowledgeBaseV04(kbRoot, { knowledgeBaseId: `kb-tl001-create-${Date.now()}`, name: 'Disposable TL-001 CREATE acceptance Knowledge Base', now: asOf })
    const registry = new KnowledgeBaseRegistry()
    const seeded = await new KnowledgeProductionGateway(registry).submit({
      handle: await registry.mount(kbRoot), producerType: 'tl001_create_acceptance_setup', producerRunId: `tl001-create-seed-${Date.now()}`,
      schemaProfile: { schemaVersion: '0.4', storageFormatVersion: '1', requiresRawProvenance: true },
      entity: { localKey: 'issuer', entityType: 'company', name: companyName, aliases: [symbol], semanticFields: { ticker: symbol, exchange } },
      proposals: [{ proposalId: 'cninfo-canonical-evidence', kind: 'claim', claimType: 'fact', subjectKey: 'issuer', statement, sourceCandidateIds: [candidate.candidateId] }],
      evidenceBindings: [{ localSourceId: candidate.candidateId, source: normalized }], asOf,
    })
    if (seeded.status !== 'committed') throw new Error(`ISOLATED_SOURCE_EVIDENCE_SETUP_FAILED:${seeded.errors.join('; ')}`)
    const companyRef = seeded.entityRefsByLocalKey.issuer
    const sourceRef = seeded.sourceRefsByLocalId[candidate.candidateId]
    const evidenceClaimRef = seeded.claimRefsByProposalId['cninfo-canonical-evidence']
    if (!companyRef || !sourceRef || !evidenceClaimRef) throw new Error('ISOLATED_SOURCE_EVIDENCE_SETUP_RESULT_INCOMPLETE')
    const baseline = await readCanonicalV04Assets(kbRoot)
    const raw = baseline.objects.find((item) => item.kind === 'source' && item.value.id === sourceRef)?.value as { rawRefs?: readonly string[]; rights?: { accessScope?: string; retentionAllowed?: boolean; aiProcessingAllowed?: boolean; derivativeKnowledgeAllowed?: boolean }; publishedAt?: string } | undefined
    const rawRef = raw?.rawRefs?.[0]
    const evidenceClaim = baseline.objects.find((item) => item.kind === 'claim' && item.value.id === evidenceClaimRef)?.value as { subjectRefs?: readonly string[]; sourceRefs?: readonly string[]; provenance?: readonly { sourceRef: string; rawRef: string }[] } | undefined
    if (!rawRef || !raw || raw.publishedAt !== candidate.publishedAt || raw.rights?.accessScope !== 'public' || raw.rights.retentionAllowed !== true || raw.rights.aiProcessingAllowed !== true || raw.rights.derivativeKnowledgeAllowed !== true || !evidenceClaim?.subjectRefs?.includes(companyRef) || !evidenceClaim.sourceRefs?.includes(sourceRef) || !evidenceClaim.provenance?.some((item) => item.sourceRef === sourceRef && item.rawRef === rawRef)) throw new Error('CANONICAL_SOURCE_EVIDENCE_BINDING_INVALID')
    const seededHandle = await registry.refresh(kbRoot)
    await verifyRaw(seededHandle, rawRef as `raw-sha256-${string}`)
    sourceEvidence = { ...sourceEvidence!, rawVerified: true }
    const initialRevision = seededHandle.revision
    const initialCounts = Object.fromEntries(['entity', 'source', 'claim', 'thesis', 'reasoning_edge'].map((kind) => [kind, baseline.objects.filter((item) => item.kind === kind).length]))
    if (initialCounts.entity !== 1 || initialCounts.source !== 1 || initialCounts.claim !== 1 || initialCounts.thesis !== 0 || initialCounts.reasoning_edge !== 0) throw new Error('SETUP_SEED_EXCEEDS_SOURCE_AND_CANONICAL_EVIDENCE_SCOPE')
    seedEvidence = { knowledgeBaseId: seededHandle.knowledgeBaseId, revision: initialRevision, companyRef, sourceRef, rawRef, evidenceClaimRef, seededAssetCounts: initialCounts }
    stages.disposableGatewayEvidenceSeed = { status: 'PASS', detail: `Gateway seed has 1 company scope Entity, 1 CNINFO Source/Raw and 1 source-bound canonical evidence Claim; zero Thesis/proposition Claims/edges before CREATE` }
    stages.pitRightsAndRawProof = { status: 'PASS', detail: `publishedAt ${candidate.publishedAt} <= asOf ${asOf}; source rights admitted and archived Raw verified` }

    const observedExecutor = {
      capabilities: () => executor.capabilities(),
      execute: async (request: Parameters<typeof executor.execute>[0]) => {
        operations.push(request.operation)
        const response = await executor.execute(request)
        if (request.operation === 'thesis_formalize_semantic') formalization = 'real_model'
        return response
      },
    }
    appRuntime = await createResearchHubApplicationRuntime({ cwd, agentDir: getAgentDir(), mountedKnowledgeBaseRoot: kbRoot, workspaceRoot, modelRuntime, model: model as Model<Api>, reasoningExecutor: observedExecutor })
    server = new ResearchHubRuntimeServer({ runtime: appRuntime, clientRoot: join(tempRoot, 'missing-client'), port: 0 })
    const serverInfo = await server.start()
    const headers = { origin: serverInfo.origin, 'x-researchhub-runtime-token': serverInfo.runtimeToken, 'content-type': 'application/json' }
    const workflowRunId = `tl001-create-${Date.now()}`
    let observedCreateOutcome: { readonly status: string; readonly diagnostics: readonly string[]; readonly thesisRef?: string; readonly baseRevision?: number; readonly committedRevision?: number; readonly writerRunId?: string } | undefined
    let observedCreatePromise: Promise<unknown> | undefined
    const researchService = appRuntime.services.researchService
    if (!researchService) throw new Error('NORMAL_CREATE_RESEARCH_SERVICE_MISSING')
    const startCreate = researchService.startThesisLifecycleCreate.bind(researchService)
    researchService.startThesisLifecycleCreate = (input, callerSignal) => {
      const started = startCreate(input, callerSignal)
      if (input.workflowRunId === workflowRunId) {
        observedCreatePromise = started.completion.then((result) => {
          observedCreateOutcome = {
            status: result.status,
            diagnostics: result.diagnostics.slice(0, 20).map((item) => /^[A-Za-z0-9_:-]{1,120}$/u.test(item) ? item : 'non_code_diagnostic_omitted'),
            ...(result.thesisRef === undefined ? {} : { thesisRef: result.thesisRef }),
            ...(result.baseRevision === undefined ? {} : { baseRevision: result.baseRevision }),
            ...(result.committedRevision === undefined ? {} : { committedRevision: result.committedRevision }),
            ...(result.writerRunId === undefined ? {} : { writerRunId: result.writerRunId }),
          }
          return result
        })
      }
      return started
    }
    const createInput = {
      workflowRunId, companyRef, thesisTitle: `CNINFO-backed lifecycle acceptance ${symbol}`,
      narrative: `Using only the single supplied evidence Claim, create exactly one falsifiable proposition about ${companyName} that states a fact directly supported by that Claim and cites its evidence refs. Do not add dependsOn or supporting proposition links. Put any inference or unsupported conclusion in researchGaps instead of creating another proposition; do not invent evidence or facts.`,
      evidenceRefs: [evidenceClaimRef], asOf,
    }
    const start = await postCreate(serverInfo.origin, headers, createInput)
    if (start.status !== 202) throw new Error(`NORMAL_CREATE_HTTP_START_FAILED:${start.status}`)
    const accepted = await start.json() as { accepted?: boolean; runId?: string }
    if (accepted.accepted !== true || accepted.runId !== workflowRunId) throw new Error('NORMAL_CREATE_HTTP_START_NOT_ACCEPTED')
    const workflow = await waitForWorkflow(serverInfo.origin, workflowRunId, headers)
    await observedCreatePromise
    if (workflow.status !== 'completed') {
      const diagnostics = observedCreateOutcome?.diagnostics ?? []
      createEvidence = {
        workflowRunId, workflowStatus: workflow.status, ...(observedCreateOutcome?.status === undefined ? {} : { serviceStatus: observedCreateOutcome.status }),
        ...(diagnostics.length === 0 ? {} : { diagnostics }), propositionRefs: [], membershipEdgeRefs: [],
        ...(observedCreateOutcome?.baseRevision === undefined ? {} : { baseRevision: observedCreateOutcome.baseRevision }),
        ...(observedCreateOutcome?.committedRevision === undefined ? {} : { committedRevision: observedCreateOutcome.committedRevision }),
        ...(observedCreateOutcome?.writerRunId === undefined ? {} : { writerRunId: observedCreateOutcome.writerRunId }),
        identicalReplay: false, changedInputConflict: false,
      }
      stages.normalHttpCreateWithPi = { status: 'FAIL', detail: `workflow=${workflow.status}; service=${observedCreateOutcome?.status ?? 'unavailable'}; diagnostic codes=${diagnostics.join(', ') || 'unavailable'}` }
      errors.push(`NORMAL_CREATE_WORKFLOW_NOT_COMPLETED:${workflow.status}:${diagnostics.join(',') || 'DIAGNOSTICS_UNAVAILABLE'}`)
      await writeArtifacts('EXECUTED / GATE_NOT_MET', 1)
      process.exitCode = 1
      return
    }
    if (!operations.includes('thesis_formalize_semantic') || formalization !== 'real_model') throw new Error('CONFIGURED_PI_FORMALIZATION_NOT_CALLED')

    const finalAssets = await readCanonicalV04Assets(kbRoot)
    const finalHandle = await registry.refresh(kbRoot)
    const baseIds = new Set(baseline.objects.map((item) => item.value.id))
    const createdTheses = finalAssets.objects.filter((item) => item.kind === 'thesis' && !baseIds.has(item.value.id))
    const createdClaims = finalAssets.objects.filter((item) => item.kind === 'claim' && !baseIds.has(item.value.id))
    const createdEdges = finalAssets.objects.filter((item) => item.kind === 'reasoning_edge' && !baseIds.has(item.value.id))
    if (createdTheses.length !== 1 || createdClaims.length < 1 || createdEdges.length !== createdClaims.length) throw new Error(`CANONICAL_CREATE_SHAPE_INVALID:thesis=${createdTheses.length},claims=${createdClaims.length},edges=${createdEdges.length}`)
    const thesis = createdTheses[0]!.value as { id: string; subjectRefs: readonly string[]; status: string }
    if (!thesis.subjectRefs.includes(companyRef) || thesis.status !== 'active') throw new Error('CREATED_THESIS_SUBJECT_OR_STATUS_INVALID')
    for (const item of createdClaims) {
      const claim = item.value as { sourceRefs: readonly string[]; lifecycle: { status: string } }
      if (claim.lifecycle.status !== 'active' || !claim.sourceRefs.includes(sourceRef)) throw new Error(`CREATED_PROPOSITION_NOT_ACTIVE_OR_SOURCE_BOUND:${item.value.id}`)
      if (!createdEdges.some((edge) => { const value = edge.value as { type: string; sourceRef: string; targetRef: string; lifecycle: { status: string } }; return value.type === 'qualifies' && value.sourceRef === item.value.id && value.targetRef === thesis.id && value.lifecycle.status === 'active' })) throw new Error(`CREATED_PROPOSITION_MEMBERSHIP_MISSING:${item.value.id}`)
    }
    if (finalHandle.revision !== initialRevision + 1) throw new Error(`CREATE_CANONICAL_REVISION_INVALID:${initialRevision}->${finalHandle.revision}`)

    const reportId = `thesis-lifecycle-${workflowRunId}`
    const report = await appRuntime.services.researchService?.getResearchReport(reportId)
    if (!observedCreateOutcome?.writerRunId) throw new Error('CREATE_WRITER_RUN_ID_UNAVAILABLE')
    const reportExpectations: CreateReportExpectations = {
      reportId, workflowRunId, companyRef, asOf, thesisRef: thesis.id, knowledgeBaseId: finalHandle.knowledgeBaseId,
      baseRevision: initialRevision, committedRevision: finalHandle.revision, writerRunId: observedCreateOutcome.writerRunId, sourceRef, rawRef,
      evidenceClaimRef, propositionRefs: createdClaims.map((item) => item.value.id),
    }
    assertCreateReport(report, 'SERVICE_REPORT', reportExpectations)
    const diskReport = await readResearchReport(join(cwd, 'runtime-data', 'reports', `${reportId}.md.json`))
    assertCreateReport(diskReport, 'DISK_REPORT', reportExpectations)
    stages.normalHttpCreateWithPi = { status: 'PASS', detail: `POST /api/production/thesis-lifecycle/create completed workflow ${workflowRunId}; configured Pi executed thesis_formalize_semantic` }
    stages.canonicalThesisClaimsAndMembership = { status: 'PASS', detail: `fresh reload contains Thesis ${thesis.id}, ${createdClaims.length} new active source-bound Claim(s), and one active qualifies edge per proposition` }
    stages.gatewayWriterRevision = { status: 'PASS', detail: `Gateway/Writer advanced revision ${initialRevision} -> ${finalHandle.revision}; workflow run ${workflowRunId}` }
    stages.durableReport = { status: 'PASS', detail: `thesis_lifecycle report ${reportId} validated via service and reloaded from its persisted JSON file` }

    const operationsBeforeReplay = operations.length
    const replayResponse = await postCreate(serverInfo.origin, headers, createInput)
    if (replayResponse.status !== 202) throw new Error(`IDENTICAL_CREATE_REPLAY_NOT_ACCEPTED:${replayResponse.status}`)
    const replayStart = await replayResponse.json() as { accepted?: boolean; runId?: string }
    const replayWorkflow = await waitForWorkflow(serverInfo.origin, workflowRunId, headers)
    if (replayStart.accepted !== true || replayStart.runId !== workflowRunId || replayWorkflow.status !== 'completed') throw new Error('IDENTICAL_CREATE_REPLAY_RESULT_INVALID')
    const replayHandle = await registry.refresh(kbRoot)
    const replayReport = await appRuntime.services.researchService?.getResearchReport(reportId)
    if (replayHandle.revision !== finalHandle.revision || fingerprint(await readCanonicalV04Assets(kbRoot)) !== fingerprint(finalAssets) || !replayReport || replayReport.reportId !== reportId) throw new Error('IDENTICAL_CREATE_REPLAY_MUTATED_CANONICAL_OR_REPORT')
    if (operations.length !== operationsBeforeReplay) throw new Error('IDENTICAL_CREATE_REPLAY_RERAN_PI_FORMALIZATION')

    const changedResponse = await postCreate(serverInfo.origin, headers, { ...createInput, narrative: `${createInput.narrative} Add an explicitly different scenario.` })
    const changedPayload = await changedResponse.json() as { code?: unknown; error?: string }
    if (changedResponse.status !== 409) throw new Error(`CHANGED_CREATE_INPUT_HTTP_STATUS_INVALID:${changedResponse.status}`)
    if (changedPayload.code !== 'conflict') {
      const diagnosticCode = typeof changedPayload.code === 'string' && /^[A-Za-z0-9_:-]{1,120}$/u.test(changedPayload.code) ? changedPayload.code : 'missing_or_invalid'
      throw new Error(`CHANGED_CREATE_INPUT_ERROR_CODE_INVALID:${diagnosticCode}`)
    }
    const afterConflictHandle = await registry.refresh(kbRoot)
    if (afterConflictHandle.revision !== finalHandle.revision || fingerprint(await readCanonicalV04Assets(kbRoot)) !== fingerprint(finalAssets)) throw new Error('CHANGED_CREATE_INPUT_CONFLICT_MUTATED_CANONICAL')
    createEvidence = {
      workflowRunId, workflowStatus: workflow.status, thesisRef: thesis.id,
      propositionRefs: createdClaims.map((item) => item.value.id), membershipEdgeRefs: createdEdges.map((item) => item.value.id),
      baseRevision: initialRevision, committedRevision: finalHandle.revision, writerRunId: workflowRunId,
      identicalReplay: true, changedInputConflict: true, revisionAfterReplay: replayHandle.revision,
    }
    stages.identicalReplay = { status: 'PASS', detail: 'same run ID and identical input returned the completed result; no second Pi call or canonical revision change' }
    stages.changedInputConflict = { status: 'PASS', detail: 'same run ID with a changed narrative returned HTTP 409 and left canonical state unchanged' }

    const required = ['originalPublisherDiscovery', 'liveFetchNormalizeRights', 'configuredPiSourceExtraction', 'disposableGatewayEvidenceSeed', 'pitRightsAndRawProof', 'normalHttpCreateWithPi', 'canonicalThesisClaimsAndMembership', 'gatewayWriterRevision', 'durableReport', 'identicalReplay', 'changedInputConflict']
    const pass = required.every((key) => stages[key]?.status === 'PASS')
    await writeArtifacts(pass ? 'EXECUTED / PASS GATE' : 'EXECUTED / GATE_NOT_MET', pass ? 0 : 1)
    if (!pass) process.exitCode = 1
  } catch (error) {
    errors.push(safeError(error))
    stages.createAcceptance = { status: 'FAIL', detail: safeError(error) }
    await writeArtifacts('EXECUTED / GATE_NOT_MET', 1)
    process.exitCode = 1
  }
}

try {
  await main()
} catch (error) {
  errors.push(safeError(error))
  stages.acceptanceSetup = { status: 'BLOCKED', detail: safeError(error) }
  await writeArtifacts('NOT EXECUTED / BLOCKED', 1)
  process.exitCode = 1
} finally {
  await Promise.resolve((server as unknown as { close?: () => void | Promise<void> } | undefined)?.close?.()).catch(() => undefined)
  await Promise.resolve(appRuntime?.close()).catch(() => undefined)
  await Promise.resolve((modelRuntime as unknown as { dispose?: () => void | Promise<void> } | undefined)?.dispose?.()).catch(() => undefined)
  if (tempRoot !== undefined) await removeVerifiedMkdtemp(tempRoot, 'rhl-tl001-create-').catch((error) => console.error(`TEMP_CLEANUP_RETAINED:${safeError(error)}`))
}
