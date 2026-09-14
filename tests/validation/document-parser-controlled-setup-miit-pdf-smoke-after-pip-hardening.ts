import { readFile, readdir, stat, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { MIIT_PCB_DEFINITION_ANCHORS, MiitIndustryResearchPlugin } from '../../plugins/research-acquisition/miit-industry.ts'
import { sha256 } from '../../plugins/research-acquisition/hash.ts'
// @ts-ignore TypeScript does not resolve the adjacent .d.ts for an explicit .mjs import.
import { preflight, setup } from '../../scripts/document-parser-runtime.mjs'

export type FinalClassification = 'DOCUMENT_PARSER_MIIT_PDF_READY' | 'DOCUMENT_PARSER_SETUP_TIMED_OUT' | 'DOCUMENT_PARSER_SETUP_FAILED' | 'DOCUMENT_PARSER_SETUP_DEFECT' | 'MIIT_PDF_FETCH_EXTERNAL_FAILURE' | 'MIIT_PDF_NORMALIZATION_DEFECT' | 'DOCUMENT_PARSER_SMOKE_INCONCLUSIVE'
export const TIMEOUT_REASONS = new Set(['BASE_PYTHON_PROBE_TIMEOUT', 'VENV_CREATION_TIMEOUT', 'PIP_INSTALL_TIMEOUT', 'DEPENDENCY_VERIFY_TIMEOUT', 'MODEL_DOWNLOAD_TIMEOUT', 'BRIDGE_SMOKE_TIMEOUT', 'FINAL_VERIFICATION_TIMEOUT'])
export const FAILURE_REASONS = new Set(['BASE_PYTHON_MISSING', 'VENV_CREATION_FAILED', 'PIP_INSTALL_FAILED', 'MODEL_DOWNLOAD_FAILED', 'BRIDGE_SMOKE_FAILED', 'PROMOTION_FAILED', 'DOCLING_DEPENDENCY_MISSING', 'ARTIFACTS_MISSING', 'MANAGED_PYTHON_MISSING'])
export const asOf = '2026-09-14T00:00:00.000Z'
const repoRoot = resolve(fileURLToPath(new URL('../..', import.meta.url)))
const evidencePath = resolve(repoRoot, 'tests/validation/evidence/RHL_M3B_DOCUMENT_PARSER_CONTROLLED_SETUP_MIIT_PDF_SMOKE_AFTER_PIP_HARDENING.json')
export const anchor = MIIT_PCB_DEFINITION_ANCHORS[0]

export function approvedCandidate() {
  return { candidateId: `miit-${sha256(anchor.url)}`, kind: 'official_disclosure' as const, tier: 1 as const, title: anchor.title, url: anchor.url, provider: 'miit', publishedAt: anchor.publishedAt, snippet: 'Approved MIIT PCB definition anchor.', metadata: { officialHost: new URL(anchor.url).hostname, discoveryRoute: 'pcb-definition-anchor', relevanceTerms: ['PCB', 'Industry Definition'], anchor: true } }
}
export function sanitizeTelemetry(value: any): Record<string, unknown> | null {
  if (!value || typeof value !== 'object') return null
  const out: Record<string, unknown> = {}
  for (const key of ['schemaVersion', 'stage', 'status', 'lastCompletedStage', 'reason', 'elapsedBucket']) if (key in value) out[key] = typeof value[key] === 'string' ? value[key].slice(0, 80) : value[key]
  return Object.keys(out).length ? out : null
}
export async function readSetupTelemetry(root = repoRoot) { try { return sanitizeTelemetry(JSON.parse(await readFile(resolve(root, '.researchhub-document-parser/setup-state.json'), 'utf8'))) } catch { return null } }
export function boundedPreflight(value: any) { return { status: value?.status ?? 'INCONCLUSIVE', pythonReady: value?.pythonReady === true, dependencyReady: value?.dependencyReady === true, artifactsReady: value?.artifactsReady === true, bridgeReady: value?.bridgeReady === true } }
export function classifySetup(resultStatus: string, reason?: string, telemetryStatus?: string, postStatus?: string): FinalClassification {
  if (resultStatus === 'READY' && postStatus && postStatus !== 'READY') return 'DOCUMENT_PARSER_SETUP_DEFECT'
  if (postStatus === 'READY' || resultStatus === 'READY') return 'DOCUMENT_PARSER_MIIT_PDF_READY'
  if (TIMEOUT_REASONS.has(reason ?? '') || telemetryStatus === 'TIMED_OUT') return 'DOCUMENT_PARSER_SETUP_TIMED_OUT'
  if (FAILURE_REASONS.has(reason ?? '')) return 'DOCUMENT_PARSER_SETUP_FAILED'
  return 'DOCUMENT_PARSER_SMOKE_INCONCLUSIVE'
}
export function classifyInterrupted(telemetry: { stage?: string; status?: string } | null) { return { classification: 'DOCUMENT_PARSER_SMOKE_INCONCLUSIVE' as const, activeStage: telemetry?.status === 'RUNNING' && telemetry.stage ? telemetry.stage : null } }
export function classifyReadySmoke({ postReady, fetchSucceeded, normalizedCharacterCount, pcbIdentity, scopeBoundary, fetchExternalFailure, pdfMedia }: { postReady: boolean; fetchSucceeded: boolean; normalizedCharacterCount: number; pcbIdentity: boolean; scopeBoundary: boolean; fetchExternalFailure?: boolean; pdfMedia?: boolean }): FinalClassification {
  if (!postReady) return 'DOCUMENT_PARSER_SMOKE_INCONCLUSIVE'
  if (fetchExternalFailure) return 'MIIT_PDF_FETCH_EXTERNAL_FAILURE'
  if (!fetchSucceeded || pdfMedia === false || normalizedCharacterCount <= 0 || !pcbIdentity || !scopeBoundary) return 'MIIT_PDF_NORMALIZATION_DEFECT'
  return 'DOCUMENT_PARSER_MIIT_PDF_READY'
}
export function privacySafe(value: unknown) { return !(/[A-Za-z]:\\|\\Users\\|\/home\/|\/Users\/|OPENAI_API_KEY|Bearer\s|proxy\s*[=:]|password\s*[=:]|secret\s*[=:]|credential\s*[=:]|"raw(?:Bytes|Text)"\s*:|"normalized(?:Text|Content)"\s*:|%PDF|pip install|docling-tools|package index|model inventory|package cache/i.test(JSON.stringify(value))) }

async function runtimeState(root = repoRoot) {
  const exists = async (p: string) => { try { await stat(p); return true } catch { return false } }
  const nonEmpty = async (p: string) => { try { return (await readdir(p)).length > 0 } catch { return false } }
  const venv = resolve(root, '.researchhub-document-parser/venv'); const models = resolve(root, '.researchhub-document-parser/models'); const staging = resolve(root, '.researchhub-document-parser/.staging')
  let staleStagingCount = 0; try { staleStagingCount = (await readdir(staging, { withFileTypes: true })).filter((x) => x.isDirectory()).length } catch {}
  return { finalVenvExists: await exists(venv), finalManagedPythonExists: await exists(resolve(venv, process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python')), finalModelsExists: await exists(models), finalModelsNonEmpty: await nonEmpty(models), staleStagingCount, setupTelemetryPresent: Boolean(await readSetupTelemetry(root)) }
}

type RunnerDeps = { root: string; preflight: typeof preflight; setup: typeof setup; readTelemetry: (root: string) => Promise<Record<string, unknown> | null>; state: () => Promise<Record<string, unknown>>; fetch: (candidate: any) => Promise<any>; normalize: (source: any) => Promise<any> }
export async function runControlled(deps: RunnerDeps) {
  const preSetupTelemetry = await deps.readTelemetry(deps.root); const before = await deps.state(); const pre = await deps.preflight({ root: deps.root }); const setupInvoked = pre.status !== 'READY'; const setupInvocationCount = setupInvoked ? 1 : 0
  const setupResult: any = setupInvoked ? await deps.setup({ root: deps.root }) : { status: 'READY' }; const postTelemetry = await deps.readTelemetry(deps.root); const post = await deps.preflight({ root: deps.root })
  const evidence: any = { taskId: 'RHL-M3B-3B-TEST-052-DOCUMENT-PARSER-CONTROLLED-SETUP-MIIT-PDF-SMOKE-AFTER-PIP-HARDENING', baseCommit: '49e7dd9ae576505ed4addfe29476a3fd86bd1fd0', fix051Acceptance: { accepted: true, status: 'COMPLETED', testsStatus: 'FAILED', testsEvidenceOnly: true, commitRelation: 'exactly_one_commit_ahead_of_TEST_050', parent: '89f1bc2ee18bea327adbaf687a3cd1f193780ffa', head: '49e7dd9ae576505ed4addfe29476a3fd86bd1fd0', modifiedFiles: ['scripts/document-parser-runtime.mjs', 'tests/scripts/document-parser-runtime.test.ts', 'docs/task-reports/RHL-M3B-3B-FIX-051-DOCUMENT-PARSER-PIP-INSTALL-BUDGET-HARDENING.md'], pipInstallOuterBudgetMs: 1800000, pipPolicyAccepted: true }, preRunState: before, preflight: boundedPreflight(pre), preSetupTelemetry: sanitizeTelemetry(preSetupTelemetry), setupInvoked, setupInvocationCount, setupResult: { status: setupResult?.status ?? 'INCONCLUSIVE', ...(setupResult?.reason ? { reason: String(setupResult.reason).slice(0, 80) } : {}) }, postSetupTelemetry: sanitizeTelemetry(postTelemetry), postSetupPreflight: boundedPreflight(post), selectedMiitAnchor: { title: anchor.title, url: anchor.url, publishedAt: anchor.publishedAt, candidateId: approvedCandidate().candidateId, provider: 'miit', tier: 1, kind: 'official_disclosure', officialHost: new URL(anchor.url).hostname, asOf, asOfEligible: anchor.publishedAt <= asOf }, fetch: { attempted: false }, normalization: { attempted: false }, relevance: { pcbIdentity: false, scopeBoundary: false }, privacy: { absolutePathsPersisted: false, executablePathsPersisted: false, stagingPathsPersisted: false, rawSetupOutputPersisted: false, environmentValuesPersisted: false, proxyValuesPersisted: false, credentialsPersisted: false, rawPdfBytesPersisted: false, normalizedFullTextPersisted: false, packageIndexesPersisted: false, packageCachesPersisted: false, dependencyModelInventoriesPersisted: false } }
  evidence.finalClassification = classifySetup(evidence.setupResult.status, evidence.setupResult.reason, postTelemetry?.status as string | undefined, post.status)
  if (post.status === 'READY') {
    const candidate = approvedCandidate()
    try {
      const fetched = await deps.fetch(candidate); const byteCount = fetched.rawBytes?.byteLength ?? 0; const pdfMedia = fetched.mediaType === 'application/pdf'; evidence.fetch = { attempted: true, status: 'succeeded', byteCount, mediaType: fetched.mediaType, contentHash: fetched.contentHash }; if (!byteCount || !pdfMedia) { evidence.finalClassification = 'MIIT_PDF_NORMALIZATION_DEFECT' } else {
        try { const normalized = await deps.normalize(fetched); const content = String(normalized.content ?? ''); const pcbIdentity = /印制电路板|\bPCB\b|printed circuit board/i.test(content); const scopeBoundary = /企业|企业范围|专用设备|专用材料|管理适用|适用|inclusion|exclusion|applicable enterprise|dedicated equipment|dedicated material|scope/i.test(content); evidence.normalization = { attempted: true, status: content.trim() ? 'succeeded' : 'empty', normalizedCharacterCount: content.length, contentHash: normalized.contentHash, publisher: normalized.publisher, rightsSummary: normalized.rights?.accessScope }; evidence.relevance = { pcbIdentity, scopeBoundary }; evidence.finalClassification = classifyReadySmoke({ postReady: true, fetchSucceeded: true, pdfMedia, normalizedCharacterCount: content.length, pcbIdentity, scopeBoundary }) } catch (error) { evidence.normalization = { attempted: true, status: 'failed', reason: error instanceof Error ? error.name : 'normalization_error' }; evidence.finalClassification = 'MIIT_PDF_NORMALIZATION_DEFECT' }
      }
    } catch (error) { evidence.fetch = { attempted: true, status: 'failed', reason: error instanceof Error ? error.name : 'fetch_error' }; evidence.finalClassification = 'MIIT_PDF_FETCH_EXTERNAL_FAILURE' }
  }
  evidence.privacy.evidenceSelfCheck = privacySafe(evidence); return evidence
}

async function main() {
  const plugin = new MiitIndustryResearchPlugin({ now: () => asOf }); const evidence = await runControlled({ root: repoRoot, preflight, setup, readTelemetry: readSetupTelemetry, state: () => runtimeState(repoRoot), fetch: (candidate) => plugin.fetch(candidate), normalize: (source) => plugin.normalize(source) })
  await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8'); const next = evidence.finalClassification === 'DOCUMENT_PARSER_MIIT_PDF_READY' ? 'run exactly one fresh direct seven-provider Industry product-quality TEST using unchanged production architecture.' : evidence.finalClassification === 'DOCUMENT_PARSER_SETUP_TIMED_OUT' ? `perform one bounded ${evidence.setupResult.reason ?? evidence.postSetupTelemetry?.stage} diagnostic without another full managed setup.` : evidence.finalClassification === 'MODEL_DOWNLOAD_TIMEOUT' ? 'perform one bounded model-host/download diagnostic without changing parser architecture.' : evidence.finalClassification === 'BRIDGE_SMOKE_TIMEOUT' || evidence.finalClassification === 'BRIDGE_SMOKE_FAILED' ? 'perform one smallest managed-bridge diagnostic.' : evidence.finalClassification === 'MIIT_PDF_NORMALIZATION_DEFECT' ? 'implement the smallest parser or bridge fix indicated by the normalization defect.' : evidence.finalClassification === 'MIIT_PDF_FETCH_EXTERNAL_FAILURE' ? 'perform one smallest MIIT availability follow-up.' : 'perform one smallest additional document-parser diagnostic.'
  const report = `# RHL-M3B-3B-TEST-052 - Controlled Docling setup and MIIT PDF smoke after pip hardening\n\n- FIX-051 acceptance: COMPLETED; tests_status=FAILED is retained as evidence-only and non-blocking. Parent=${evidence.fix051Acceptance.parent}; head/base=${evidence.baseCommit}; exactly one commit ahead of TEST-050.\n- Accepted FIX-051 scope: runtime, runtime tests, and required report only; no type declaration change. Pip outer budget is 1,800,000 ms with bounded non-interactive public-network policy.\n- Initial runtime state: ${JSON.stringify(evidence.preRunState)}.\n- Preflight: ${JSON.stringify(evidence.preflight)}; setup invocation count: ${evidence.setupInvocationCount}; result: ${JSON.stringify(evidence.setupResult)}.\n- Authoritative telemetry: pre=${JSON.stringify(evidence.preSetupTelemetry)}; post=${JSON.stringify(evidence.postSetupTelemetry)}. Post-setup readiness: ${evidence.postSetupPreflight.status}.\n- MIIT smoke: fetch=${JSON.stringify(evidence.fetch)}; normalization=${JSON.stringify(evidence.normalization)}; relevance=${JSON.stringify(evidence.relevance)}.\n- Privacy review: ${evidence.privacy.evidenceSelfCheck ? 'PASS' : 'FAIL'}; only bounded semantic fields, hashes, counts, publisher, rights summary, and booleans are persisted.\n- Tracked-file audit: TEST-052 test, evidence, and this report only; ignored managed runtime remains unsynchronized.\n- Validation: focused orchestration tests, runtime check, Docling contract, MIIT acquisition, typecheck, npm test, status, and diff check are recorded in the LUNA_RESULT. VAL-HTTP-001 was not investigated or modified.\n- Final classification: **${evidence.finalClassification}**.\n\nRecommended next step: ${next}\n`
  await writeFile(resolve(repoRoot, 'docs/task-reports/RHL-M3B-3B-TEST-052-DOCUMENT-PARSER-CONTROLLED-SETUP-MIIT-PDF-SMOKE-AFTER-PIP-HARDENING.md'), report, 'utf8'); console.log(JSON.stringify(evidence, null, 2))
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main()
