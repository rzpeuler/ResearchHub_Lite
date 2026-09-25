import { lstat, mkdir, mkdtemp, readdir, realpath, rm, writeFile } from 'node:fs/promises'
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { tmpdir } from 'node:os'
import { createHash } from 'node:crypto'
import { ModelRuntime, getAgentDir } from '@earendil-works/pi-coding-agent'
import type { Api, Model } from '@earendil-works/pi-ai'
import { createFreshKnowledgeBaseV04, readCanonicalV04Assets } from '../knowledge/storage/index.ts'
import { KnowledgeBaseRegistry } from '../knowledge/registry/registry.ts'
import { KnowledgeProductionGateway } from '../knowledge/production/gateway.ts'
import { verifyRaw } from '../knowledge/raw/raw-archive.ts'
import { hashKnowledgeObject } from '../knowledge/storage/canonical-hash.ts'
import { CninfoOfficialDisclosureClient, OfficialDisclosureResearchPlugin } from '../plugins/research-acquisition/official.ts'
import { selectProductionReasoningModel } from '../app/pi/model-selection.ts'
import { PiReasoningExecutor } from '../plugins/reasoning/pi/executor.ts'
import { createResearchHubApplicationRuntime } from '../app/runtime/application-runtime.ts'
import { ResearchHubRuntimeServer } from '../app/runtime/server.ts'

const repoRoot = resolve(import.meta.dirname, '..')
const evidencePath = resolve(repoRoot, 'tests/validation/evidence/RHL_TL001_THESIS_LIFECYCLE_REAL_E2E.json')
const symbol = process.env.RHL_TL001_SYMBOL ?? '600519'
const companyName = process.env.RHL_TL001_COMPANY_NAME ?? '贵州茅台'
const exchange = process.env.RHL_TL001_EXCHANGE ?? 'SSE'
const safeError = (error: unknown): string => String(error instanceof Error ? error.message : error)
  .replace(/[A-Za-z]:\\[^\s;,]*/gu, '<path>')
  .replace(/(authorization|cookie|api[-_]?key|token|secret)\s*[:=]\s*[^,;\s]+/giu, '$1=<redacted>')
  .slice(0, 300)
const objectHash = (assets: Awaited<ReturnType<typeof readCanonicalV04Assets>>) => assets.objects.map((item) => [item.value.id, hashKnowledgeObject(item.value)]).sort(([a], [b]) => String(a).localeCompare(String(b)))
const canonicalFingerprint = (assets: Awaited<ReturnType<typeof readCanonicalV04Assets>>) => createHash('sha256').update(JSON.stringify(objectHash(assets))).digest('hex')
const jsonObject = (value: unknown): Record<string, unknown> | undefined => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined
const normalizedText = (value: string): string => value.normalize('NFKC').replace(/\s+/gu, ' ').trim()
const samePath = (left: string, right: string): boolean => process.platform === 'win32' ? left.toLocaleLowerCase('en-US') === right.toLocaleLowerCase('en-US') : left === right

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

interface Stage { readonly status: 'PASS' | 'BLOCKED' | 'FAIL'; readonly detail?: string }
interface EvidenceRecord {
  readonly generatedAt: string
  readonly classification: 'NOT_EXECUTED / BLOCKED' | 'EXECUTED / GATE_NOT_MET' | 'EXECUTED / PASS GATE'
  readonly processExitCode: number
  readonly taskId: 'RHL-TL-001'
  readonly implementationState: 'working-tree'
  readonly pathClassification: 'isolated_v04_seed_plus_normal_application_http_refresh_and_decision'
  readonly userKnowledgeBaseTouched: false
  readonly seedIsProductCreateE2E: false
  readonly reasoning: { readonly provider: string; readonly model: string; readonly executor: 'PiReasoningExecutor'; readonly operations: readonly string[]; readonly extraction: 'real_model' | 'not_completed'; readonly refresh: 'real_model' | 'not_completed' }
  readonly source?: { readonly publisher: 'CNINFO'; readonly provider: string; readonly title: string; readonly url: string; readonly publishedAt: string; readonly retrievedAt: string; readonly rightsEligible: boolean; readonly rawVerified: boolean; readonly rawBytes: number; readonly rawContentPersistedInEvidence: false }
  readonly stages: Readonly<Record<string, Stage>>
  readonly thesis?: { readonly thesisRef: string; readonly affectedClaimRef: string; readonly unchangedClaimRef: string; readonly evidenceClaimRef: string; readonly baselineRevision: number; readonly refreshedRevision?: number; readonly revisionAfterDefer?: number; readonly committedRevision?: number; readonly revisionAfterReplay?: number; readonly fingerprintBeforeDefer?: string; readonly fingerprintAfterDefer?: string; readonly finalStatus?: string; readonly refreshTransition?: string; readonly unchangedRefs?: readonly string[]; readonly deltas?: readonly { readonly propositionRef: string; readonly candidateStatus: string; readonly relation?: string }[]; readonly decisionState?: string; readonly replay?: boolean }
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
let sourceEvidence: EvidenceRecord['source']
let thesisEvidence: EvidenceRecord['thesis']
let extraction: 'real_model' | 'not_completed' = 'not_completed'
let refreshReasoning: 'real_model' | 'not_completed' = 'not_completed'

async function writeEvidence(classification: EvidenceRecord['classification'], exitCode: number): Promise<void> {
  const evidence: EvidenceRecord = {
    generatedAt: new Date().toISOString(), classification, processExitCode: exitCode, taskId: 'RHL-TL-001', implementationState: 'working-tree',
    pathClassification: 'isolated_v04_seed_plus_normal_application_http_refresh_and_decision', userKnowledgeBaseTouched: false, seedIsProductCreateE2E: false,
    reasoning: { provider: modelProvider, model: modelName, executor: 'PiReasoningExecutor', operations, extraction, refresh: refreshReasoning },
    ...(sourceEvidence === undefined ? {} : { source: sourceEvidence }), ...(thesisEvidence === undefined ? {} : { thesis: thesisEvidence }),
    stages: { ...stages }, errors: [...new Set(errors)].slice(0, 20), secretsIncluded: false, sourceBodyIncluded: false,
  }
  await mkdir(join(repoRoot, 'tests/validation/evidence'), { recursive: true })
  await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8')
  console.log(JSON.stringify(evidence, null, 2))
}

async function waitForWorkflow(origin: string, runId: string, headers: Record<string, string>): Promise<{ readonly status: string }> {
  for (let attempt = 0; attempt < 900; attempt += 1) {
    const response = await fetch(`${origin}/api/workflows/${encodeURIComponent(runId)}`, { headers })
    if (!response.ok) throw new Error(`HTTP workflow read failed: ${response.status}`)
    const workflow = await response.json() as { readonly status: string }
    if (['completed', 'completed_with_review', 'blocked', 'failed', 'cancelled'].includes(workflow.status)) return workflow
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 1000))
  }
  throw new Error(`THESIS_REFRESH_WORKFLOW_TIMEOUT:${runId}`)
}

async function main(): Promise<void> {
  const asOf = new Date().toISOString()
  tempRoot = await mkdtemp(join(tmpdir(), 'rhl-tl001-real-'))
  const kbRoot = join(tempRoot, 'kb')
  const cwd = join(tempRoot, 'runtime')
  const workspaceRoot = join(tempRoot, 'workspace')
  const agentDir = getAgentDir()
  await Promise.all([mkdir(cwd), mkdir(workspaceRoot)])

  const officialClient = new CninfoOfficialDisclosureClient({ timeoutMs: 20_000 })
  const officialPlugin = new OfficialDisclosureResearchPlugin(officialClient)
  let candidate: Awaited<ReturnType<OfficialDisclosureResearchPlugin['discover']>>[number] | undefined
  let fetched: Awaited<ReturnType<OfficialDisclosureResearchPlugin['fetch']>> | undefined
  let normalized: Awaited<ReturnType<OfficialDisclosureResearchPlugin['normalize']>> | undefined
  try {
    const candidates = await officialPlugin.discover({ company: { symbol, name: companyName, exchange }, asOf, limitPerKind: 20 })
    candidate = [...candidates].filter((item) => item.url && item.publishedAt && Date.parse(item.publishedAt) <= Date.parse(asOf)).sort((left, right) => Date.parse(right.publishedAt!) - Date.parse(left.publishedAt!))[0]
    if (!candidate) throw new Error(`CNINFO_LIVE_DISCLOSURE_NOT_FOUND:${symbol}`)
    stages.originalPublisherDiscovery = { status: 'PASS', detail: `${candidate.provider}; canonical HTTPS source on ${new URL(candidate.url!).hostname}; publishedAt ${candidate.publishedAt}` }
  } catch (error) {
    stages.originalPublisherDiscovery = { status: 'BLOCKED', detail: safeError(error) }
    errors.push(`CNINFO_LIVE_DISCOVERY_BLOCKED:${safeError(error)}`)
    await writeEvidence('NOT_EXECUTED / BLOCKED', 1)
    return
  }
  try {
    fetched = await officialPlugin.fetch(candidate)
    normalized = await officialPlugin.normalize(fetched)
    if (!normalized.rawBytes || normalized.rawBytes.length === 0 || normalized.content.trim().length < 100) throw new Error('CNINFO_LIVE_DOCUMENT_CONTENT_UNAVAILABLE')
    sourceEvidence = { publisher: 'CNINFO', provider: candidate.provider, title: candidate.title.slice(0, 300), url: candidate.url!, publishedAt: candidate.publishedAt!, retrievedAt: normalized.retrievedAt, rightsEligible: normalized.rights.accessScope === 'public' && normalized.rights.retentionAllowed && normalized.rights.aiProcessingAllowed && normalized.rights.derivativeKnowledgeAllowed, rawVerified: false, rawBytes: normalized.rawBytes.length, rawContentPersistedInEvidence: false }
    stages.liveFetchAndNormalize = { status: 'PASS', detail: `${normalized.mediaType ?? fetched.mediaType ?? 'unknown media type'}; ${normalized.rawBytes.length} raw bytes; normalized source text ${normalized.content.length} chars` }
  } catch (error) {
    stages.liveFetchAndNormalize = { status: 'BLOCKED', detail: safeError(error) }
    errors.push(`CNINFO_LIVE_FETCH_NORMALIZE_BLOCKED:${safeError(error)}`)
    await writeEvidence('NOT_EXECUTED / BLOCKED', 1)
    return
  }

  try {
    modelRuntime = await ModelRuntime.create({ authPath: join(agentDir, 'auth.json'), modelsPath: join(agentDir, 'models.json'), allowModelNetwork: true, refreshOnCreate: false })
    const model = selectProductionReasoningModel(modelRuntime) as Model<Api>
    modelProvider = model.provider
    modelName = model.id
    const executor = new PiReasoningExecutor({ modelRuntime, model, timeoutMs: 900_000, maxOutputChars: 400_000 })
    const extractResponse = await executor.execute({
      operation: 'extractKnowledge',
      instruction: 'From this original-publisher document, extract one short, directly verifiable factual statement from the supplied text. The statement must correspond to the quoted sourceSpan exactly in meaning. Do not infer, add context, or invent a date, metric, or figure. Return one statement and one exact sourceSpan copied from the supplied document.',
      input: { sourceTitle: candidate.title, sourceUrl: candidate.url, publishedAt: candidate.publishedAt, content: normalized.content.slice(0, 24_000) },
      outputContract: { type: 'object', required: ['statement', 'sourceSpan'], properties: { statement: { type: 'string', minLength: 20, maxLength: 500 }, sourceSpan: { type: 'string', minLength: 20, maxLength: 800 } }, additionalProperties: false },
    })
    operations.push('extractKnowledge')
    const extracted = jsonObject(extractResponse.output)
    const statement = typeof extracted?.statement === 'string' ? normalizedText(extracted.statement).slice(0, 500) : ''
    const sourceSpan = typeof extracted?.sourceSpan === 'string' ? normalizedText(extracted.sourceSpan) : ''
    if (statement.length < 20 || sourceSpan.length < 20 || !normalizedText(normalized.content).includes(sourceSpan)) throw new Error('LIVE_SOURCE_EXTRACTION_NOT_VERIFIABLE')
    extraction = 'real_model'
    stages.configuredPi = { status: 'PASS', detail: `${model.provider}/${model.id}; PiReasoningExecutor with configured ModelRuntime` }
    stages.liveSourceExtraction = { status: 'PASS', detail: 'Pi output included an exact sourceSpan verified against normalized live publisher text; text withheld from evidence artifact' }

    const publicationMs = Date.parse(candidate.publishedAt!)
    const baseDate = new Date(publicationMs - 1000).toISOString()
    if (!Number.isFinite(publicationMs) || Date.parse(asOf) <= publicationMs) throw new Error('LIVE_SOURCE_PUBLICATION_OUTSIDE_ASOF')
    await createFreshKnowledgeBaseV04(kbRoot, { knowledgeBaseId: `kb-tl001-real-${Date.now()}`, now: baseDate })
    const registry = new KnowledgeBaseRegistry()
    const seeded = await new KnowledgeProductionGateway(registry).submit({
      handle: await registry.mount(kbRoot), producerType: 'tl001_acceptance_setup', producerRunId: 'tl001-live-evidence-seed',
      schemaProfile: { schemaVersion: '0.4', storageFormatVersion: '1', requiresRawProvenance: true },
      entity: { localKey: 'issuer', entityType: 'company', name: companyName, aliases: [symbol], semanticFields: { ticker: symbol, exchange } },
      proposals: [
        { proposalId: 'challenged-proposition', kind: 'claim', claimType: 'assumption', subjectKey: 'issuer', statement: `The selected CNINFO document does not state that: ${statement}`, sourceCandidateIds: [candidate.candidateId] },
        { proposalId: 'unchanged-proposition', kind: 'claim', claimType: 'viewpoint', subjectKey: 'issuer', statement: `${companyName} has operated as a listed issuer on ${exchange}.`, sourceCandidateIds: [candidate.candidateId] },
        { proposalId: 'live-evidence', kind: 'claim', claimType: 'fact', subjectKey: 'issuer', statement: `CNINFO disclosure dated ${candidate.publishedAt}: ${statement}`, sourceCandidateIds: [candidate.candidateId] },
        { proposalId: 'thesis', kind: 'thesis', subjectKey: 'issuer', thesisTitle: `TL-001 isolated acceptance harness ${symbol}`, statement: 'A temporary acceptance Thesis that checks persisted source evidence and a reviewed proposition delta.', thesisStatus: 'active' },
        { proposalId: 'qualifies-challenged', kind: 'reasoning_edge', sourceProposalId: 'challenged-proposition', targetKey: 'thesis', edgeType: 'qualifies' },
        { proposalId: 'qualifies-unchanged', kind: 'reasoning_edge', sourceProposalId: 'unchanged-proposition', targetKey: 'thesis', edgeType: 'qualifies' },
      ],
      evidenceBindings: [{ localSourceId: candidate.candidateId, source: normalized }], asOf, now: () => baseDate,
    })
    if (seeded.status !== 'committed') throw new Error(`ISOLATED_GATEWAY_SEED_FAILED:${seeded.errors.join('; ')}`)
    const thesisRef = seeded.thesisRefsByProposalId?.thesis
    const affectedClaimRef = seeded.claimRefsByProposalId['challenged-proposition']
    const unchangedClaimRef = seeded.claimRefsByProposalId['unchanged-proposition']
    const evidenceClaimRef = seeded.claimRefsByProposalId['live-evidence']
    if (!thesisRef || !affectedClaimRef || !unchangedClaimRef || !evidenceClaimRef) throw new Error('ISOLATED_GATEWAY_SEED_RESULT_INCOMPLETE')
    const seededAssets = await readCanonicalV04Assets(kbRoot)
    const sourceAsset = seededAssets.objects.find((item) => item.kind === 'source' && item.value.id === seeded.sourceRefsByLocalId?.[candidate!.candidateId])?.value as { id: string; rawRefs?: readonly string[]; rights: { accessScope: string; retentionAllowed: boolean; aiProcessingAllowed: boolean; derivativeKnowledgeAllowed: boolean }; publishedAt?: string } | undefined
    const rawRef = sourceAsset?.rawRefs?.[0]
    if (!sourceAsset || !rawRef || sourceAsset.publishedAt !== candidate.publishedAt || sourceAsset.rights.accessScope !== 'public' || !sourceAsset.rights.retentionAllowed || !sourceAsset.rights.aiProcessingAllowed || !sourceAsset.rights.derivativeKnowledgeAllowed) throw new Error('PERSISTED_SOURCE_RIGHTS_PIT_OR_RAW_BINDING_INVALID')
    await verifyRaw(await registry.mount(kbRoot), rawRef as `raw-sha256-${string}`)
    sourceEvidence = { ...sourceEvidence!, rawVerified: true }
    const initialRevision = (await registry.mount(kbRoot)).revision
    const initialFingerprint = canonicalFingerprint(seededAssets)
    thesisEvidence = { thesisRef, affectedClaimRef, unchangedClaimRef, evidenceClaimRef, baselineRevision: initialRevision, fingerprintBeforeDefer: initialFingerprint }

    const reasoningCalls: string[] = []
    const observedExecutor = { capabilities: () => executor.capabilities(), execute: async (request: Parameters<typeof executor.execute>[0]) => { reasoningCalls.push(request.operation); operations.push(request.operation); const response = await executor.execute(request); if (request.operation === 'thesis_refresh_semantic') refreshReasoning = 'real_model'; return response } }
    appRuntime = await createResearchHubApplicationRuntime({ cwd, agentDir, mountedKnowledgeBaseRoot: kbRoot, workspaceRoot, modelRuntime, model: model as Model<Api>, reasoningExecutor: observedExecutor })
    server = new ResearchHubRuntimeServer({ runtime: appRuntime, clientRoot: join(tempRoot, 'missing-client'), port: 0 })
    const serverInfo = await server.start()
    const headers = { origin: serverInfo.origin, 'x-researchhub-runtime-token': serverInfo.runtimeToken, 'content-type': 'application/json' }
    const launchResponse = await fetch(`${serverInfo.origin}/api/production/thesis-lifecycle/refresh`, { method: 'POST', headers, body: JSON.stringify({ thesisRef, asOf, evidenceRefs: [evidenceClaimRef] }) })
    if (launchResponse.status !== 202) throw new Error(`REFRESH_HTTP_START_FAILED:${launchResponse.status}`)
    const launch = await launchResponse.json() as { accepted: boolean; runId: string }
    if (!launch.accepted || !launch.runId) throw new Error('REFRESH_HTTP_START_NOT_ACCEPTED')
    const workflow = await waitForWorkflow(serverInfo.origin, launch.runId, headers)
    if (workflow.status !== 'completed_with_review') throw new Error(`REFRESH_WORKFLOW_DID_NOT_CREATE_REVIEW:${workflow.status}`)
    if (!reasoningCalls.includes('thesis_refresh_semantic')) throw new Error('REAL_PI_REFRESH_REASONING_NOT_CALLED')
    const reviewListResponse = await fetch(`${serverInfo.origin}/api/review-cases?producerRunId=${encodeURIComponent(launch.runId)}`, { headers })
    const reviewList = await reviewListResponse.json() as { cases: readonly { reviewCaseId: string }[] }
    if (!reviewListResponse.ok || reviewList.cases.length !== 1) throw new Error(`THESIS_REVIEW_CASE_COUNT_INVALID:${reviewList.cases.length}`)
    const reviewCaseId = reviewList.cases[0]!.reviewCaseId
    const detailResponse = await fetch(`${serverInfo.origin}/api/review-cases/${encodeURIComponent(reviewCaseId)}`, { headers })
    const detail = await detailResponse.json() as { thesisScope?: { affectedClaimRefs: readonly string[]; reviewedEvidence: readonly { evidenceRef: string; relation: string; targetClaimRefs: readonly string[] }[] } }
    if (!detailResponse.ok || !detail.thesisScope) throw new Error('PERSISTED_THESIS_REVIEW_CASE_UNAVAILABLE')
    if (!detail.thesisScope.affectedClaimRefs.includes(affectedClaimRef) || !detail.thesisScope.reviewedEvidence.some((item) => item.evidenceRef === evidenceClaimRef && item.targetClaimRefs.includes(affectedClaimRef))) throw new Error('REAL_EVIDENCE_REVIEW_SCOPE_BINDING_INVALID')
    if (!detail.thesisScope.reviewedEvidence.some((item) => item.relation === 'weakens' || item.relation === 'contradicts')) throw new Error('REAL_PI_DID_NOT_CLASSIFY_A_WEAKENING_OR_CHALLENGE')
    const afterRefreshAssets = await readCanonicalV04Assets(kbRoot)
    const afterRefreshRevision = (await registry.mount(kbRoot)).revision
    if (afterRefreshRevision !== initialRevision) throw new Error('REFRESH_CHANGED_CANONICAL_REVISION_BEFORE_DECISION')
    const refresh = appRuntime.services.researchService ? await appRuntime.services.researchService.getResearchReport(`thesis-lifecycle-${launch.runId}`) : undefined
    const unchangedSection = refresh?.sections.find((section) => section.id === 'unchanged')?.markdown ?? ''
    const refreshText = refresh?.sections.map((section) => section.markdown).join('\n') ?? ''
    if (!unchangedSection.includes(unchangedClaimRef)) throw new Error('REFRESH_REPORT_DID_NOT_PRESERVE_UNCHANGED_PROPOSITION')
    stages.isolatedGatewaySetup = { status: 'PASS', detail: 'Temporary v0.4 Knowledge Base seeded through Gateway with live CNINFO Source/Raw; not represented as CREATE product-path E2E' }
    stages.pitRightsProvenance = { status: 'PASS', detail: `publishedAt ${candidate.publishedAt}; source has public access and explicit retention/AI/derived-knowledge rights; archived Raw verified` }
    stages.normalHttpRefresh = { status: 'PASS', detail: `run ${launch.runId}; real Pi thesis_refresh_semantic; durable Thesis-scoped ReviewCase ${reviewCaseId}` }
    stages.unchangedAndChangedPropositions = { status: 'PASS', detail: `unchanged ${unchangedClaimRef}; reviewed evidence relation ${detail.thesisScope.reviewedEvidence.map((item) => item.relation).join(', ')}` }
    thesisEvidence = { ...thesisEvidence!, refreshedRevision: afterRefreshRevision, refreshTransition: refreshText.match(/Candidate transition\s*([^\n]+)/)?.[1]?.trim(), unchangedRefs: [unchangedClaimRef] }

    const deferResponse = await fetch(`${serverInfo.origin}/api/review-cases/${encodeURIComponent(reviewCaseId)}/decision`, { method: 'POST', headers, body: JSON.stringify({ decision: 'DEFER', note: 'Capture no-write DEFER before reconsideration.' }) })
    const deferred = await deferResponse.json() as { status: string; decisionState: string }
    const afterDeferAssets = await readCanonicalV04Assets(kbRoot)
    const afterDeferRevision = (await registry.mount(kbRoot)).revision
    const afterDeferFingerprint = canonicalFingerprint(afterDeferAssets)
    if (!deferResponse.ok || deferred.status !== 'deferred' || deferred.decisionState !== 'DEFERRED' || afterDeferRevision !== initialRevision || afterDeferFingerprint !== canonicalFingerprint(afterRefreshAssets)) throw new Error('DEFER_NO_CANONICAL_MUTATION_GATE_FAILED')
    thesisEvidence = { ...thesisEvidence!, revisionAfterDefer: afterDeferRevision, fingerprintAfterDefer: afterDeferFingerprint }
    stages.deferNoWrite = { status: 'PASS', detail: 'DEFER was recorded durably; canonical revision and all canonical object hashes remained unchanged' }

    const acceptNote = 'Apply the current-revalidated live-evidence challenge.'
    const acceptResponse = await fetch(`${serverInfo.origin}/api/review-cases/${encodeURIComponent(reviewCaseId)}/decision`, { method: 'POST', headers, body: JSON.stringify({ decision: 'ACCEPT', note: acceptNote }) })
    const accepted = await acceptResponse.json() as { status: string; decisionState: string; writerRunId?: string; committedRevision?: number; reportUpdate?: { status: string } }
    if (!acceptResponse.ok || accepted.status !== 'accepted' || accepted.decisionState !== 'ACCEPTED' || !accepted.writerRunId || !accepted.committedRevision || accepted.reportUpdate?.status !== 'updated') throw new Error(`ACCEPT_GATE_FAILED:${JSON.stringify(accepted)}`)
    const afterAcceptAssets = await readCanonicalV04Assets(kbRoot)
    const afterAcceptHandle = await new KnowledgeBaseRegistry().mount(kbRoot)
    const impactEdges = afterAcceptAssets.objects.filter((item) => item.kind === 'reasoning_edge' && !afterDeferAssets.objects.some((old) => old.value.id === item.value.id))
    if (impactEdges.length !== detail.thesisScope.reviewedEvidence.length) throw new Error('ACCEPT_REVIEWED_EDGE_COUNT_MISMATCH')
    for (const item of detail.thesisScope.reviewedEvidence) {
      const expectedType = item.relation === 'weakens' ? 'challenges' : item.relation === 'contradicts' ? 'contradicts' : undefined
      if (!expectedType || !item.targetClaimRefs.every((targetClaimRef) => impactEdges.some((edge) => (edge.value as { type?: string; sourceRef?: string; targetRef?: string }).type === expectedType && (edge.value as { sourceRef?: string }).sourceRef === evidenceClaimRef && (edge.value as { targetRef?: string }).targetRef === targetClaimRef))) throw new Error('ACCEPTED_CANONICAL_EDGE_DIFFERS_FROM_REVIEWED_SCOPE')
    }
    const thesisAsset = afterAcceptAssets.objects.find((item) => item.kind === 'thesis' && item.value.id === thesisRef)?.value as { status?: string } | undefined
    if (!thesisAsset || !['weakening', 'challenged'].includes(thesisAsset.status ?? '')) throw new Error('ACCEPTED_THESIS_STATUS_NOT_RELOADED')
    const replayResponse = await fetch(`${serverInfo.origin}/api/review-cases/${encodeURIComponent(reviewCaseId)}/decision`, { method: 'POST', headers, body: JSON.stringify({ decision: 'ACCEPT', note: acceptNote }) })
    const replay = await replayResponse.json() as { status: string; decisionState: string; replay?: boolean; writerRunId?: string }
    if (!replayResponse.ok || replay.status !== 'accepted' || replay.decisionState !== 'ACCEPTED' || replay.replay !== true || replay.writerRunId !== accepted.writerRunId || (await new KnowledgeBaseRegistry().mount(kbRoot)).revision !== afterAcceptHandle.revision) throw new Error('ACCEPT_REPLAY_IDEMPOTENCY_GATE_FAILED')
    const finalReport = appRuntime.services.researchService ? await appRuntime.services.researchService.getResearchReport(`thesis-lifecycle-${launch.runId}`) : undefined
    if (!finalReport || !finalReport.sections.find((section) => section.id === 'review-state')?.markdown.includes('ACCEPTED')) throw new Error('DECISION_REPORT_DID_NOT_PERSIST_ACCEPTED_STATE')
    const actionableAfterAccept = await fetch(`${serverInfo.origin}/api/review-cases?producerRunId=${encodeURIComponent(launch.runId)}`, { headers }).then((response) => response.json()) as { cases: readonly unknown[] }
    if (actionableAfterAccept.cases.length !== 0) throw new Error('ACCEPTED_CASE_REMAINS_ACTIONABLE')
    thesisEvidence = { ...thesisEvidence!, committedRevision: accepted.committedRevision, revisionAfterReplay: afterAcceptHandle.revision, finalStatus: thesisAsset.status, decisionState: accepted.decisionState, replay: replay.replay }
    stages.acceptWriterReloadReplay = { status: 'PASS', detail: `DEFER -> ACCEPT via HTTP; Writer run ${accepted.writerRunId}; reload revision ${afterAcceptHandle.revision}; reviewed edge/status verified; identical replay did not advance revision` }
    stages.decisionReportAndActionability = { status: 'PASS', detail: 'report reflects ACCEPTED and the case is absent from the actionable HTTP listing' }
    const required = ['originalPublisherDiscovery', 'liveFetchAndNormalize', 'configuredPi', 'liveSourceExtraction', 'isolatedGatewaySetup', 'pitRightsProvenance', 'normalHttpRefresh', 'unchangedAndChangedPropositions', 'deferNoWrite', 'acceptWriterReloadReplay', 'decisionReportAndActionability']
    const passed = required.every((key) => stages[key]?.status === 'PASS') && refreshReasoning === 'real_model' && canonicalFingerprint(await readCanonicalV04Assets(kbRoot)) !== afterDeferFingerprint
    await writeEvidence(passed ? 'EXECUTED / PASS GATE' : 'EXECUTED / GATE_NOT_MET', passed ? 0 : 1)
    if (!passed) process.exitCode = 1
  } catch (error) {
    errors.push(safeError(error))
    stages.lifecycleAttempt = { status: 'FAIL', detail: safeError(error) }
    await writeEvidence('EXECUTED / GATE_NOT_MET', 1)
    process.exitCode = 1
  }
}

try {
  await main()
} catch (error) {
  errors.push(safeError(error))
  stages.realPathSetup = { status: 'BLOCKED', detail: safeError(error) }
  await writeEvidence('NOT_EXECUTED / BLOCKED', 1)
  process.exitCode = 1
} finally {
  await Promise.resolve((server as unknown as { close?: () => void | Promise<void> } | undefined)?.close?.()).catch(() => undefined)
  await Promise.resolve(appRuntime?.close()).catch(() => undefined)
  await Promise.resolve((modelRuntime as unknown as { dispose?: () => void | Promise<void> } | undefined)?.dispose?.()).catch(() => undefined)
  if (tempRoot !== undefined) await removeVerifiedMkdtemp(tempRoot, 'rhl-tl001-real-').catch((error) => console.error(`TEMP_CLEANUP_RETAINED:${safeError(error)}`))
}
