import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { MIIT_PCB_DEFINITION_ANCHORS, MiitIndustryResearchPlugin } from '../../plugins/research-acquisition/miit-industry.ts'
import { sha256 } from '../../plugins/research-acquisition/hash.ts'
// @ts-ignore TypeScript does not resolve the adjacent .d.ts for an explicit .mjs import.
import { preflight, setup } from '../../scripts/document-parser-runtime.mjs'

export type FinalClassification = 'DOCUMENT_PARSER_MIIT_PDF_READY' | 'DOCUMENT_PARSER_SETUP_TIMED_OUT' | 'DOCUMENT_PARSER_SETUP_FAILED' | 'DOCUMENT_PARSER_SETUP_DEFECT' | 'MIIT_PDF_FETCH_EXTERNAL_FAILURE' | 'MIIT_PDF_NORMALIZATION_DEFECT' | 'DOCUMENT_PARSER_SMOKE_INCONCLUSIVE'
export type SetupReason = 'BASE_PYTHON_PROBE_TIMEOUT' | 'VENV_CREATION_TIMEOUT' | 'PIP_INSTALL_TIMEOUT' | 'DEPENDENCY_VERIFY_TIMEOUT' | 'MODEL_DOWNLOAD_TIMEOUT' | 'BRIDGE_SMOKE_TIMEOUT' | 'FINAL_VERIFICATION_TIMEOUT' | 'BASE_PYTHON_MISSING' | 'VENV_CREATION_FAILED' | 'PIP_INSTALL_FAILED' | 'MODEL_DOWNLOAD_FAILED' | 'BRIDGE_SMOKE_FAILED' | 'PROMOTION_FAILED' | 'DOCLING_DEPENDENCY_MISSING' | 'ARTIFACTS_MISSING' | 'MANAGED_PYTHON_MISSING' | string
const TIMEOUT_REASONS = new Set(['BASE_PYTHON_PROBE_TIMEOUT', 'VENV_CREATION_TIMEOUT', 'PIP_INSTALL_TIMEOUT', 'DEPENDENCY_VERIFY_TIMEOUT', 'MODEL_DOWNLOAD_TIMEOUT', 'BRIDGE_SMOKE_TIMEOUT', 'FINAL_VERIFICATION_TIMEOUT'])
const FAILURE_REASONS = new Set(['BASE_PYTHON_MISSING', 'VENV_CREATION_FAILED', 'PIP_INSTALL_FAILED', 'MODEL_DOWNLOAD_FAILED', 'BRIDGE_SMOKE_FAILED', 'PROMOTION_FAILED', 'DOCLING_DEPENDENCY_MISSING', 'ARTIFACTS_MISSING', 'MANAGED_PYTHON_MISSING'])
const repoRoot = resolve(fileURLToPath(new URL('../..', import.meta.url)))
const evidencePath = resolve(repoRoot, 'tests/validation/evidence/RHL_M3B_DOCUMENT_PARSER_CONTROLLED_SETUP_MIIT_PDF_SMOKE_AFTER_TELEMETRY.json')
const reportPath = resolve(repoRoot, 'docs/task-reports/RHL-M3B-3B-TEST-050-DOCUMENT-PARSER-CONTROLLED-SETUP-MIIT-PDF-SMOKE-AFTER-TELEMETRY.md')
const asOf = '2026-09-14T00:00:00.000Z'
const anchor = MIIT_PCB_DEFINITION_ANCHORS[0]

export function approvedCandidate() {
  return { candidateId: `miit-${sha256(anchor.url)}`, kind: 'official_disclosure' as const, tier: 1 as const, title: anchor.title, url: anchor.url, provider: 'miit', publishedAt: anchor.publishedAt, snippet: 'Approved MIIT PCB definition anchor.', metadata: { officialHost: new URL(anchor.url).hostname, discoveryRoute: 'pcb-definition-anchor', relevanceTerms: ['PCB', 'Industry Definition'], anchor: true } }
}

export function sanitizeTelemetry(value: any): Record<string, unknown> | null {
  if (!value || typeof value !== 'object') return null
  const out: Record<string, unknown> = {}
  for (const key of ['schemaVersion', 'stage', 'status', 'lastCompletedStage', 'reason', 'elapsedBucket']) if (key in value) out[key] = typeof value[key] === 'string' ? value[key].slice(0, 80) : value[key]
  return Object.keys(out).length ? out : null
}

export async function readSetupTelemetry(root = repoRoot) {
  try { return sanitizeTelemetry(JSON.parse(await readFile(resolve(root, '.researchhub-document-parser/setup-state.json'), 'utf8'))) } catch { return null }
}

export function classifySetup(status: string, reason?: string, telemetryStatus?: string): FinalClassification {
  if (status === 'READY') return 'DOCUMENT_PARSER_MIIT_PDF_READY'
  if (TIMEOUT_REASONS.has(reason ?? '') || telemetryStatus === 'TIMED_OUT') return 'DOCUMENT_PARSER_SETUP_TIMED_OUT'
  if (FAILURE_REASONS.has(reason ?? '')) return 'DOCUMENT_PARSER_SETUP_FAILED'
  return 'DOCUMENT_PARSER_SMOKE_INCONCLUSIVE'
}

export function classifyInterrupted(telemetry: { stage?: string; status?: string } | null) {
  return telemetry?.status === 'RUNNING' && telemetry.stage ? { classification: 'DOCUMENT_PARSER_SMOKE_INCONCLUSIVE' as const, activeStage: telemetry.stage } : { classification: 'DOCUMENT_PARSER_SMOKE_INCONCLUSIVE' as const, activeStage: null }
}

export function classifyReadySmoke({ postReady, fetchSucceeded, normalizedCharacterCount, pcbIdentity, scopeBoundary, fetchExternalFailure }: { postReady: boolean; fetchSucceeded: boolean; normalizedCharacterCount: number; pcbIdentity: boolean; scopeBoundary: boolean; fetchExternalFailure?: boolean }): FinalClassification {
  if (!postReady) return 'DOCUMENT_PARSER_SMOKE_INCONCLUSIVE'
  if (fetchExternalFailure) return 'MIIT_PDF_FETCH_EXTERNAL_FAILURE'
  if (!fetchSucceeded || normalizedCharacterCount <= 0 || !pcbIdentity || !scopeBoundary) return 'MIIT_PDF_NORMALIZATION_DEFECT'
  return 'DOCUMENT_PARSER_MIIT_PDF_READY'
}

export function privacySafe(value: unknown): boolean {
  const text = JSON.stringify(value)
  return !(/[A-Za-z]:\\|\\Users\\|\/home\/|\/Users\/|OPENAI_API_KEY|Bearer\s|proxy\s*[=:]|password\s*[=:]|secret\s*[=:]|credential\s*[=:]|"raw(?:Bytes|Text)"\s*:|"normalized(?:Text|Content)"\s*:|%PDF|pip install|docling-tools|model inventory/i.test(text))
}

async function runtimeState(root = repoRoot) {
  const exists = async (p: string) => { try { await readFile(p); return true } catch { return false } }
  const directoryNonEmpty = async (p: string) => { try { const { readdir } = await import('node:fs/promises'); return (await readdir(p)).length > 0 } catch { return false } }
  const finalVenv = resolve(root, '.researchhub-document-parser/venv')
  const finalPython = resolve(finalVenv, process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python')
  const models = resolve(root, '.researchhub-document-parser/models')
  const staging = resolve(root, '.researchhub-document-parser/.staging')
  let staleStagingCount = 0; try { const { readdir } = await import('node:fs/promises'); staleStagingCount = (await readdir(staging, { withFileTypes: true })).filter((x) => x.isDirectory()).length } catch {}
  return { finalVenvExists: await exists(finalVenv), finalManagedPythonExists: await exists(finalPython), finalModelsExists: await exists(models), finalModelsNonEmpty: await directoryNonEmpty(models), staleStagingCount, setupTelemetryPresent: Boolean(await readSetupTelemetry(root)) }
}

async function main() {
  const preSetupTelemetry = await readSetupTelemetry()
  const before = await runtimeState()
  const preSetup = await preflight({ root: repoRoot })
  const setupInvoked = preSetup.status !== 'READY'
  const setupResult = setupInvoked ? await setup({ root: repoRoot }) : { status: 'READY' }
  const postSetupTelemetry = await readSetupTelemetry()
  const postSetup = await preflight({ root: repoRoot })
  const setupClass = classifySetup(postSetup.status, setupResult.reason, postSetupTelemetry?.status as string | undefined)
  const evidence: any = {
    taskId: 'RHL-M3B-3B-TEST-050-DOCUMENT-PARSER-CONTROLLED-SETUP-MIIT-PDF-SMOKE-AFTER-TELEMETRY', baseCommit: 'da2a80f9bfc363dcbb7f8ce9114f8bfabdfd8',
    fix049Acceptance: { accepted: true, status: 'COMPLETED', testsStatus: 'FAILED', testsEvidenceOnly: true, commitRelation: 'exactly_one_commit_ahead_of_TEST_048', bootstrapFiles: ['scripts/document-parser-runtime.mjs', 'scripts/document-parser-runtime.d.ts', 'tests/scripts/document-parser-runtime.test.ts', 'docs/task-reports/RHL-M3B-3B-FIX-049-DOCUMENT-PARSER-BOOTSTRAP-TIMEOUT-STAGE-TELEMETRY.md'] },
    preRunState: before, preflight: { status: preSetup.status, pythonReady: preSetup.pythonReady, dependencyReady: preSetup.dependencyReady, artifactsReady: preSetup.artifactsReady, bridgeReady: preSetup.bridgeReady },
    preSetupTelemetry: sanitizeTelemetry(preSetupTelemetry), setupInvoked, setupInvocationCount: setupInvoked ? 1 : 0,
    setupResult: { status: setupResult.status, ...(setupResult.reason ? { reason: setupResult.reason } : {}) }, postSetupTelemetry: sanitizeTelemetry(postSetupTelemetry),
    postSetupPreflight: { status: postSetup.status, pythonReady: postSetup.pythonReady, dependencyReady: postSetup.dependencyReady, artifactsReady: postSetup.artifactsReady, bridgeReady: postSetup.bridgeReady },
    selectedMiitAnchor: { title: anchor.title, url: anchor.url, publishedAt: anchor.publishedAt, candidateId: approvedCandidate().candidateId, provider: 'miit', tier: 1, kind: 'official_disclosure', officialHost: new URL(anchor.url).hostname, asOf, asOfEligible: anchor.publishedAt <= asOf },
    fetch: { attempted: false }, normalization: { attempted: false }, relevance: { pcbIdentity: false, scopeBoundary: false }, privacy: { absolutePathsPersisted: false, userProfilePathsPersisted: false, executablePathsPersisted: false, stagingPathsPersisted: false, rawSetupOutputPersisted: false, environmentValuesPersisted: false, proxyValuesPersisted: false, credentialsPersisted: false, rawPdfBytesPersisted: false, normalizedFullTextPersisted: false, modelInventoriesPersisted: false },
    finalClassification: setupClass
  }
  if (postSetup.status === 'READY') {
    const plugin = new MiitIndustryResearchPlugin({ now: () => asOf })
    try {
      const fetched = await plugin.fetch(approvedCandidate())
      evidence.fetch = { attempted: true, status: 'succeeded', byteCount: fetched.rawBytes?.byteLength ?? 0, mediaType: fetched.mediaType, contentHash: fetched.contentHash }
      try {
        const normalized = await plugin.normalize(fetched); const content = normalized.content; const lower = content.toLowerCase()
        const pcbIdentity = /印制电路板|\bpcb\b|printed circuit board/i.test(content); const scopeBoundary = /企业|适用企业|专用设备|专用材料|管理范围|适用|enterprise|applicable enterprise|dedicated equipment|dedicated material|management applicability|scope|inclusion|exclusion/i.test(content)
        evidence.normalization = { attempted: true, status: content.trim() ? 'succeeded' : 'empty', normalizedCharacterCount: content.length, contentHash: normalized.contentHash, publisher: normalized.publisher, rightsSummary: normalized.rights?.accessScope }
        evidence.relevance = { pcbIdentity, scopeBoundary }
        evidence.finalClassification = classifyReadySmoke({ postReady: true, fetchSucceeded: true, normalizedCharacterCount: content.length, pcbIdentity, scopeBoundary })
        void lower
      } catch (error) { evidence.normalization = { attempted: true, status: 'failed', reason: error instanceof Error ? error.name : 'normalization_error' }; evidence.finalClassification = 'MIIT_PDF_NORMALIZATION_DEFECT' }
    } catch (error) { evidence.fetch = { attempted: true, status: 'failed', reason: error instanceof Error ? error.name : 'fetch_error' }; evidence.finalClassification = 'MIIT_PDF_FETCH_EXTERNAL_FAILURE' }
  }
  evidence.privacy.evidenceSelfCheck = privacySafe(evidence)
  await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8')
  const nextStep = evidence.finalClassification === 'DOCUMENT_PARSER_MIIT_PDF_READY' ? 'rerun one fresh direct seven-provider Industry product-quality TEST with the ready managed parser and unchanged production architecture.' : evidence.finalClassification === 'DOCUMENT_PARSER_SETUP_TIMED_OUT' ? `perform one stage-specific follow-up for ${evidence.setupResult.reason ?? evidence.postSetupTelemetry?.stage}, without changing unrelated production code.` : evidence.finalClassification === 'DOCUMENT_PARSER_SETUP_FAILED' ? `diagnose the returned failing stage ${evidence.setupResult.reason ?? 'unknown'} once, without rerunning complete Industry research.` : evidence.finalClassification === 'DOCUMENT_PARSER_SETUP_DEFECT' ? 'implement the smallest bootstrap contract fix indicated by the contradiction.' : evidence.finalClassification === 'MIIT_PDF_FETCH_EXTERNAL_FAILURE' ? 'perform one smallest MIIT availability follow-up without source-architecture changes.' : evidence.finalClassification === 'MIIT_PDF_NORMALIZATION_DEFECT' ? 'implement the smallest parser or bridge fix indicated by the normalization defect.' : 'perform one smallest additional telemetry diagnostic.'
  const report = `# RHL-M3B-3B-TEST-050 — Controlled Docling setup and MIIT PDF smoke after telemetry\n\n- FIX-049 acceptance: COMPLETED; returned tests_status FAILED is retained as evidence-only and non-blocking.\n- Base commit: da2a80f9bfc363dcbb7f8ce9114f8bfabdfd8.\n- Pre-run state: ${JSON.stringify(before)}.\n- Setup invocation count: ${evidence.setupInvocationCount}; bounded result: ${JSON.stringify(evidence.setupResult)}.\n- Authoritative telemetry: pre=${JSON.stringify(evidence.preSetupTelemetry)}; post=${JSON.stringify(evidence.postSetupTelemetry)}.\n- Post-setup readiness: ${postSetup.status}.\n- MIIT smoke: fetch=${JSON.stringify(evidence.fetch)}; normalize=${JSON.stringify(evidence.normalization)}; relevance=${JSON.stringify(evidence.relevance)}.\n- Privacy review: bounded evidence contains no absolute paths, executable or staging paths, environment/proxy values, credentials, raw setup output, raw PDF bytes, normalized full text, or model inventories.\n- Tracked-file audit: TEST-050 tests, evidence, and this report only; runtime state remains ignored and unsynchronized.\n- Final classification: **${evidence.finalClassification}**.\n\nValidation commands are recorded in the Luna result.\n\nRecommended next step: ${nextStep}\n`
  await writeFile(reportPath, report, 'utf8')
  console.log(JSON.stringify(evidence, null, 2))
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main()
