import { mkdir, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { EastmoneyIndustryResearchPlugin } from '../../plugins/research-acquisition/eastmoney-industry.ts'
import { sha256 } from '../../plugins/research-acquisition/hash.ts'

export const FROZEN_EASTMONEY_TARGET = { name: 'PCB Manufacturing', alias: 'Printed Circuit Board', searchTerms: ['PCB 印制电路板', 'AI服务器 PCB HDI', '深南电路 PCB', '沪电股份 PCB', '胜宏科技 PCB', '生益科技 PCB CCL', 'PCB 产业链', 'PCB 行业 产能'], asOf: '2026-09-12T00:00:00.000Z' }
const taskId = 'RHL-M3B-3B-FIX-010-EASTMONEY-DIRECT-INDUSTRY-ACQUISITION'
const evidencePath = 'tests/validation/evidence/RHL_M3B_EASTMONEY_INDUSTRY_PRODUCTION_ACQUISITION.json'
const classify = (error: unknown) => { const text = error instanceof Error ? error.message : String(error); if (/aborted|timeout/i.test(text)) return 'EASTMONEY_TIMEOUT'; if (/HTTP 5\d\d/.test(text)) return 'EASTMONEY_HTTP_SERVER_ERROR'; if (/HTTP 4\d\d/.test(text)) return 'EASTMONEY_HTTP_CLIENT_ERROR'; if (/JSON|payload|invalid/i.test(text)) return 'EASTMONEY_INVALID_RESPONSE'; if (/ENOTFOUND|fetch failed|connect|DNS/i.test(text)) return 'EASTMONEY_DNS_OR_CONNECT_FAILURE'; return 'EASTMONEY_RUNTIME_FAILURE' }
const safe = (error: unknown) => ({ classification: classify(error) })

export async function runEastmoneyIndustryProductionAcquisition() {
  let httpCalls = 0; let boardPages = 0; let constituentPages = 0; let candidates: readonly any[] = []; let selected: any; let normalized: any; let finalClassification: string
  const plugin = new EastmoneyIndustryResearchPlugin({ fetchImpl: async (input, init) => { httpCalls++; const url = new URL(String(input)); if (url.searchParams.get('fs')?.startsWith('b:')) constituentPages++; else boardPages++; return fetch(input, init) }, now: () => new Date().toISOString() })
  try {
    candidates = await plugin.discover({ industry: { name: FROZEN_EASTMONEY_TARGET.name, aliases: [FROZEN_EASTMONEY_TARGET.alias], searchTerms: FROZEN_EASTMONEY_TARGET.searchTerms }, asOf: FROZEN_EASTMONEY_TARGET.asOf, limitPerKind: 12 })
    selected = candidates[0]
    if (!selected || !/pcb|printed|印制电路板/i.test(String(selected.metadata?.boardName))) throw new Error('PCB target match not proven')
    normalized = await plugin.normalize(await plugin.fetch(selected))
    const parsed = JSON.parse(normalized.content) as { constituents?: readonly { stockCode?: string; companyName?: string }[]; board?: unknown }
    const validMember = parsed.constituents?.some((row) => /^\d{6}$/.test(row.stockCode ?? '') && Boolean(row.companyName?.trim()))
    if (normalized.candidate.kind !== 'structured_data' || normalized.candidate.tier !== 2 || normalized.publisher !== 'Eastmoney' || !normalized.contentHash || !validMember || !parsed.board || /f2|f3|price|fund.?flow/i.test(normalized.content)) throw new Error('normalized Eastmoney evidence failed bounded validation')
    finalClassification = 'EASTMONEY_INDUSTRY_ACQUISITION_VALIDATED'
  } catch (error) { finalClassification = classify(error) === 'EASTMONEY_RUNTIME_FAILURE' && /target match/i.test(error instanceof Error ? error.message : '') ? 'EASTMONEY_TARGET_MATCH_NOT_PROVEN' : classify(error) }
  const content = normalized?.content as string | undefined; const parsed = content ? JSON.parse(content) as { constituents?: readonly { stockCode: string; companyName: string }[]; board?: { boardCode: string; boardName: string; boardType: string } } : undefined
  const evidence = { taskId, baseCommit: '871e377da44880cad9411890e189c6029b304c0b', generatedAt: new Date().toISOString(), frozenTarget: { ...FROZEN_EASTMONEY_TARGET, searchTermsHash: sha256(JSON.stringify(FROZEN_EASTMONEY_TARGET.searchTerms)), searchTermCount: FROZEN_EASTMONEY_TARGET.searchTerms.length }, providerConfiguration: { providerName: plugin.name, endpointFamily: 'https://push2.eastmoney.com/api/qt/clist/get', nativeFetchOnly: true, boardPageCap: 6, constituentPageCap: 3, pageSize: 100 }, realHttp: { requestCount: httpCalls, boardListPageCount: boardPages, constituentPageCount: constituentPages }, discovery: { candidateCount: candidates.length, candidates: candidates.slice(0, 20).map((candidate) => ({ candidateId: candidate.candidateId, boardCode: candidate.metadata?.boardCode, boardName: candidate.metadata?.boardName, boardType: candidate.metadata?.boardType })) }, selectedCandidate: selected ? { candidateId: selected.candidateId, boardCode: selected.metadata?.boardCode, boardName: selected.metadata?.boardName, boardType: selected.metadata?.boardType } : null, normalizedSource: normalized ? { kind: normalized.candidate.kind, tier: normalized.candidate.tier, publisher: normalized.publisher, contentHash: normalized.contentHash, canonicalUrl: normalized.canonicalUrl, board: parsed?.board ?? null, constituentCount: parsed?.constituents?.length ?? 0, constituentSamples: (parsed?.constituents ?? []).slice(0, 20).map((row) => ({ stockCode: row.stockCode, companyName: row.companyName })) , rights: normalized.rights } : null, finalClassification, m3bGateRerunAuthorized: finalClassification === 'EASTMONEY_INDUSTRY_ACQUISITION_VALIDATED', mutation: { modelCallCount: 0, knowledgeMutation: false, gatewaySubmitCount: 0, writerCommitCount: 0, fullM3BGateRun: false }, privacy: { rawBodiesIncluded: false, completeDatasetIncluded: false, cookiesIncluded: false, credentialsIncluded: false, completeHeadersIncluded: false, absolutePathsIncluded: false }, failure: finalClassification.startsWith('EASTMONEY_INDUSTRY_ACQUISITION_VALIDATED') ? null : safe(new Error(finalClassification)) }
  await mkdir(dirname(evidencePath), { recursive: true }); await writeFile(evidencePath, JSON.stringify(evidence, null, 2) + '\n', 'utf8'); console.log(JSON.stringify(evidence))
  return evidence
}
if (process.argv[1]?.endsWith('eastmoney-industry-production-acquisition.ts')) await runEastmoneyIndustryProductionAcquisition()
