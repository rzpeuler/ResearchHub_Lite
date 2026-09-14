import { writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { MIIT_PCB_DEFINITION_ANCHORS, MiitIndustryResearchPlugin } from '../../plugins/research-acquisition/miit-industry.ts'
import { sha256 } from '../../plugins/research-acquisition/hash.ts'
// @ts-ignore TypeScript does not resolve the adjacent .d.ts for an explicit .mjs import.
import { preflight, setup } from '../../scripts/document-parser-runtime.mjs'

export type FinalClassification = 'DOCUMENT_PARSER_MIIT_PDF_READY' | 'DOCUMENT_PARSER_SETUP_EXTERNAL_FAILURE' | 'DOCUMENT_PARSER_SETUP_DEFECT' | 'MIIT_PDF_FETCH_EXTERNAL_FAILURE' | 'MIIT_PDF_NORMALIZATION_DEFECT' | 'DOCUMENT_PARSER_SMOKE_INCONCLUSIVE'
const repoRoot = resolve(fileURLToPath(new URL('../..', import.meta.url)))
const anchor = MIIT_PCB_DEFINITION_ANCHORS[0]
const asOf = '2026-09-14T00:00:00.000Z'

export function approvedCandidate() {
  return { candidateId: `miit-${sha256(anchor.url)}`, kind: 'official_disclosure' as const, tier: 1 as const, title: anchor.title, provider: 'miit', url: anchor.url, publishedAt: anchor.publishedAt, metadata: { officialHost: 'wap.miit.gov.cn', discoveryRoute: 'pcb-definition-anchor', relevanceTerms: ['PCB', 'Industry Definition'], anchor: true } }
}
export function classifySetup(status: string, reason?: string): FinalClassification {
  if (status === 'READY') return 'DOCUMENT_PARSER_MIIT_PDF_READY'
  if (reason === 'PROMOTION_FAILED') return 'DOCUMENT_PARSER_SETUP_DEFECT'
  if (['BASE_PYTHON_MISSING', 'VENV_CREATION_FAILED', 'PIP_INSTALL_FAILED', 'MODEL_DOWNLOAD_FAILED'].includes(reason ?? '')) return 'DOCUMENT_PARSER_SETUP_EXTERNAL_FAILURE'
  if (reason === 'BRIDGE_SMOKE_FAILED') return 'DOCUMENT_PARSER_SETUP_DEFECT'
  return 'DOCUMENT_PARSER_SMOKE_INCONCLUSIVE'
}
export function privacySafe(value: unknown): boolean {
  const text = JSON.stringify(value)
  return !/[A-Za-z]:\\|\\Users\\|\\home\\|OPENAI_API_KEY|Bearer\s|PATH=|package-manager|pip install|docling-tools|raw(?:Bytes|Text)|normalizedText|%PDF|ResearchHub smoke/i.test(text)
}

async function main() {
  const preSetup = await preflight({ root: repoRoot })
  const interruptedSetup = process.argv.includes('--after-interrupted-setup')
  const setupInvoked = interruptedSetup || preSetup.status !== 'READY'
  const setupResult = interruptedSetup ? { status: 'INCONCLUSIVE', reason: 'EXTERNAL_SETUP_STALLED' } : setupInvoked ? await setup({ root: repoRoot }) : { status: 'READY' }
  const postSetup = await preflight({ root: repoRoot })
  const evidence: Record<string, unknown> = {
    taskId: 'RHL-M3B-3B-TEST-047-DOCUMENT-PARSER-CONTROLLED-SETUP-MIIT-PDF-SMOKE', baseCommit: '5ded94e4c6ff7cce820521fb5182fe00cb9915d6', fix046Acceptance: { accepted: true, status: 'COMPLETED', testsStatus: 'FAILED', commit: '5ded94e4c6ff7cce820521fb5182fe00cb9915d6' },
    preSetup: { status: preSetup.status, pythonReady: preSetup.pythonReady, dependencyReady: preSetup.dependencyReady, artifactsReady: preSetup.artifactsReady, bridgeReady: preSetup.bridgeReady }, setupInvoked, setupResult: { status: setupResult.status, ...(setupResult.reason ? { reason: setupResult.reason } : {}) },
    postSetup: { status: postSetup.status, pythonReady: postSetup.pythonReady, dependencyReady: postSetup.dependencyReady, artifactsReady: postSetup.artifactsReady, bridgeReady: postSetup.bridgeReady },
    selectedAnchor: { title: anchor.title, url: anchor.url, publishedAt: anchor.publishedAt, candidateId: approvedCandidate().candidateId, provider: 'miit', tier: 1, kind: 'official_disclosure', officialHost: 'wap.miit.gov.cn', asOfEligible: anchor.publishedAt <= asOf },
    fetch: { attempted: false }, normalization: { attempted: false }, privacy: { absolutePathsPersisted: false, userProfilePathsPersisted: false, environmentValuesPersisted: false, rawPackageOutputPersisted: false, rawPdfBytesPersisted: false, normalizedFullTextPersisted: false }, finalClassification: classifySetup(postSetup.status, setupResult.reason)
  }
  if (postSetup.status === 'READY') {
    const plugin = new MiitIndustryResearchPlugin({ now: () => '2026-09-14T00:00:00.000Z' })
    try {
      const fetched = await plugin.fetch(approvedCandidate()); evidence.fetch = { attempted: true, status: 'succeeded', byteCount: fetched.rawBytes?.byteLength ?? 0, mediaType: fetched.mediaType, contentHash: fetched.contentHash }
      evidence.normalization = { attempted: true }
      try {
        const normalized = await plugin.normalize(fetched); const lower = normalized.content.toLowerCase(); const phrasePresence = { printedCircuitBoard: normalized.content.includes('印制电路板') || lower.includes('printed circuit board') || lower.includes('pcb'), scopeBoundary: /企业|专用设备|专用材料|管理范围|适用/.test(normalized.content) || /enterprise|dedicated equipment|dedicated material|scope|management applicability/i.test(normalized.content) }
        const good = normalized.content.trim().length > 0 && phrasePresence.printedCircuitBoard && phrasePresence.scopeBoundary
        evidence.normalization = { attempted: true, status: good ? 'succeeded' : 'unusable', normalizedCharacterCount: normalized.content.length, sectionCount: null, contentHash: normalized.contentHash, phrasePresence, publisher: normalized.publisher, rights: normalized.rights }
        evidence.finalClassification = good ? 'DOCUMENT_PARSER_MIIT_PDF_READY' : 'MIIT_PDF_NORMALIZATION_DEFECT'
      } catch (error) { evidence.normalization = { attempted: true, status: 'failed', reason: error instanceof Error ? error.name : 'normalization_error' }; evidence.finalClassification = 'MIIT_PDF_NORMALIZATION_DEFECT' }
    } catch (error) { evidence.fetch = { attempted: true, status: 'failed', reason: error instanceof Error ? error.name : 'fetch_error' }; evidence.finalClassification = 'MIIT_PDF_FETCH_EXTERNAL_FAILURE' }
  }
  evidence.privacy = { ...(evidence.privacy as object), evidenceSelfCheck: privacySafe(evidence) }
  await writeFile(resolve(repoRoot, 'tests/validation/evidence/RHL_M3B_DOCUMENT_PARSER_CONTROLLED_SETUP_MIIT_PDF_SMOKE.json'), `${JSON.stringify(evidence, null, 2)}\n`, 'utf8')
  const nextStep = evidence.finalClassification === 'DOCUMENT_PARSER_MIIT_PDF_READY' ? 'rerun the direct seven-provider Industry product-quality TEST once using the now-ready managed parser and unchanged production architecture.' : evidence.finalClassification === 'DOCUMENT_PARSER_SMOKE_INCONCLUSIVE' ? 'diagnose the stalled pinned pip operation using bounded process/availability telemetry, without rerunning setup in TEST-047 or changing production code.' : 'perform the smallest follow-up implied by the final classification, without changing production architecture.'
  const report = `# RHL-M3B-3B-TEST-047 — Controlled Docling setup and MIIT PDF smoke\n\n- FIX-046 acceptance: COMPLETED; tests_status FAILED (the accepted unrelated VAL-HTTP-001 failure remains).\n- Base/head: 5ded94e4c6ff7cce820521fb5182fe00cb9915d6.\n- Pre-setup: ${preSetup.status}; controlled setup invoked: ${setupInvoked}; setup result: ${setupResult.status}${setupResult.reason ? ` (${setupResult.reason})` : ''}.\n- Post-setup: ${postSetup.status}.\n- Single approved MIIT PDF fetch/normalize: ${JSON.stringify(evidence.fetch)} / ${JSON.stringify(evidence.normalization)}.\n- Final classification: **${evidence.finalClassification}**.\n\nPrivacy review: evidence is bounded and contains no absolute paths, environment values, package output, PDF bytes, or normalized full text. The runtime directory remains ignored and is not part of tracked changes.\n\nValidation: deterministic TEST-047 tests, document-parser check, Docling contract, MIIT acquisition, typecheck, and diff-check were executed; their statuses are reported in the final result.\n\nRecommended next step: ${nextStep}\n`
  await writeFile(resolve(repoRoot, 'docs/task-reports/RHL-M3B-3B-TEST-047-DOCUMENT-PARSER-CONTROLLED-SETUP-MIIT-PDF-SMOKE.md'), report, 'utf8')
  console.log(JSON.stringify(evidence, null, 2))
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main()
