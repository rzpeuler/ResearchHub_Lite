import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { GovCnIndustryResearchPlugin } from '../../plugins/research-acquisition/govcn-industry.ts'
import { sha256 } from '../../plugins/research-acquisition/hash.ts'
import type { ResearchSourceCandidate } from '../../plugins/research-acquisition/contracts.ts'

export const TARGET = { name: 'PCB Manufacturing', alias: 'Printed Circuit Board', asOf: '2026-09-12T00:00:00.000Z', searchTerms: ['PCB 印制电路板', 'AI服务器 PCB HDI', '深南电路 PCB', '沪电股份 PCB', '胜宏科技 PCB', '生益科技 PCB CCL', 'PCB 产业链', 'PCB 行业 产能'] } as const
export const CLASSIFICATIONS = ['GOVCN_INDUSTRY_ACQUISITION_VALIDATED', 'GOVCN_TARGET_MATCH_NOT_PROVEN', 'GOVCN_DISCOVERY_EMPTY', 'GOVCN_SEARCH_HTTP_FAILURE', 'GOVCN_SEARCH_INVALID_RESPONSE', 'GOVCN_DOCUMENT_FETCH_FAILED', 'GOVCN_DOCUMENT_NORMALIZATION_FAILED', 'GOVCN_NO_SUBSTANTIVE_INDUSTRY_CONTEXT'] as const
export type GovCnClassification = typeof CLASSIFICATIONS[number]
const contextGroups = { industryDefinitionContext: ['行业定义', '产业定义', '定义', 'industry definition'], policyOrStandardContext: ['政策', '标准', '规范', 'policy', 'standard'], technologyOrProductContext: ['技术', '产品', 'technology', 'product'], capacityOrProductionContext: ['产能', '产量', '生产', 'capacity', 'production'], companyQualificationContext: ['企业', '公司', 'enterprise', 'qualification'] } as const
export function contextCategories(value: string): Record<keyof typeof contextGroups, boolean> { const bounded = value.normalize('NFKC').slice(0, 200_000).toLocaleLowerCase(); return Object.fromEntries(Object.entries(contextGroups).map(([key, terms]) => [key, terms.some((term) => bounded.includes(term.toLocaleLowerCase()))])) as Record<keyof typeof contextGroups, boolean> }
export function substantive(categories: Record<keyof typeof contextGroups, boolean>): boolean { return Object.entries(categories).some(([key, value]) => value && key !== 'companyQualificationContext') }
export function safeEvidence(value: Record<string, unknown>): Record<string, unknown> { return JSON.parse(JSON.stringify(value)) }

const outputPath = join(process.cwd(), 'tests', 'validation', 'evidence', 'RHL_M3B_GOVCN_INDUSTRY_PRODUCTION_ACQUISITION.json')
const targetRequest = { industry: { name: TARGET.name, aliases: [TARGET.alias], searchTerms: [...TARGET.searchTerms] }, asOf: TARGET.asOf, limitPerKind: 8 } as const
const errorText = (error: unknown) => error instanceof Error ? error.message : String(error)
const main = async () => {
  let searchRequests = 0; let documentRequests = 0; let candidates: readonly ResearchSourceCandidate[] = []; const selected: Record<string, unknown>[] = []; let classification: GovCnClassification = 'GOVCN_TARGET_MATCH_NOT_PROVEN'; let failure: string | null = null
  const plugin = new GovCnIndustryResearchPlugin({ fetchImpl: async (input, init) => { const url = String(input); if (url.includes('/search-gov/data')) searchRequests++; else documentRequests++; return fetch(input, init) } })
  try {
    candidates = await plugin.discover(targetRequest)
    if (candidates.length === 0) classification = 'GOVCN_DISCOVERY_EMPTY'
    else {
      const relevant = candidates.filter((candidate) => /pcb|printed\s+circuit\s+board|印制电路板|电路板/i.test(`${candidate.title} ${candidate.snippet ?? ''}`)).slice(0, 2)
      if (relevant.length === 0) classification = 'GOVCN_TARGET_MATCH_NOT_PROVEN'
      else {
        for (const candidate of relevant) {
          try { const normalized = await plugin.normalize(await plugin.fetch(candidate)); const categories = contextCategories(normalized.content); selected.push({ candidateId: candidate.candidateId, title: candidate.title, host: new URL(normalized.canonicalUrl!).hostname, publisher: normalized.publisher, ...(candidate.publishedAt === undefined ? {} : { publishedAt: candidate.publishedAt }), contentHash: normalized.contentHash, normalizedTextBytes: Buffer.byteLength(normalized.content, 'utf8'), ...categories }) }
          catch (error) { failure = errorText(error); classification = failure.includes('normalized') || failure.includes('parser') ? 'GOVCN_DOCUMENT_NORMALIZATION_FAILED' : 'GOVCN_DOCUMENT_FETCH_FAILED'; break }
        }
        if (classification === 'GOVCN_TARGET_MATCH_NOT_PROVEN') classification = selected.some((item) => substantive(item as never)) ? 'GOVCN_INDUSTRY_ACQUISITION_VALIDATED' : 'GOVCN_NO_SUBSTANTIVE_INDUSTRY_CONTEXT'
      }
    }
  } catch (error) { failure = errorText(error); classification = /HTTP/.test(failure) ? 'GOVCN_SEARCH_HTTP_FAILURE' : 'GOVCN_SEARCH_INVALID_RESPONSE' }
  const evidence = safeEvidence({ taskId: 'RHL-M3B-3B-FIX-017-GOVCN-OFFICIAL-INDUSTRY-EVIDENCE', baseCommit: '312e2c8f36da3e0bcbc0ed5b46993cb45c838bab', generatedAt: new Date().toISOString(), diag016Acceptance: { accepted: true, commit: '312e2c8f36da3e0bcbc0ed5b46993cb45c838bab', productionReasoning: 'codex-cli / gpt-5.6-luna / medium', automaticFallbackCalls: 0, designCalls: 1, moduleCalls: 8, moduleParserValidatorPasses: 8, finalModuleStatuses: 'unavailable', synthesisRequested: false, knowledgeRevision: 0, acquisition: { cninfo: 'empty', gdelt: 'failed', eastmoney: 'failed', akshare: 'failed', normalizedSourceCount: 0 }, interpretation: 'Immediate blocker was zero live Industry evidence availability; Eastmoney board membership is insufficient alone for official Industry definition, policy, technology and industrial-chain context.' }, endpointConfiguration: { endpoint: 'https://sousuo.www.gov.cn/search-gov/data', category: 'zhengcelibrary_gw_bm_gb', searchfield: 'title:content:summary', sorting: 'RELEVANCE', nativeFetchOnly: true, searchPageCap: 2, pageSize: 10, searchPayloadBytesCap: 2097152, documentPayloadBytesCap: 8388608, documentResolver: 'DocumentInputResolver', noRetries: true, noAlternateHosts: true }, target: { name: TARGET.name, alias: TARGET.alias, asOf: TARGET.asOf, searchTermsHash: sha256(JSON.stringify(TARGET.searchTerms)), searchTermCount: TARGET.searchTerms.length }, realHttp: { searchRequestCount: searchRequests, documentRequestCount: documentRequests, discoveryCallCount: 1, selectedDocumentCount: selected.length }, candidates: candidates.slice(0, 8).map((candidate) => ({ candidateId: candidate.candidateId, title: candidate.title, host: candidate.url ? new URL(candidate.url).hostname : null, publisher: candidate.metadata?.publicationOrganization ?? null, publishedAt: candidate.publishedAt ?? null, relevanceTerms: candidate.metadata?.relevanceTerms ?? [] })), selectedNormalizedDocuments: selected, finalClassification: classification, livePcbModuleRerunAuthorized: classification === 'GOVCN_INDUSTRY_ACQUISITION_VALIDATED', mutation: { modelCallCount: 0, knowledgeMutation: false, gatewaySubmitCount: 0, writerCommitCount: 0, productionCodeMutation: true, sourceContractsMutated: false }, privacy: { rawPrompts: false, completeSearchPayloads: false, completeDocumentText: false, credentials: false, cookies: false, authorizationHeaders: false, privateAbsolutePaths: false, reasoningTraces: false }, ...(failure ? { failure: failure.slice(0, 300) } : {}) })
  await mkdir(join(process.cwd(), 'tests', 'validation', 'evidence'), { recursive: true }); await writeFile(outputPath, JSON.stringify(evidence, null, 2) + '\n', 'utf8'); console.log(JSON.stringify(evidence, null, 2)); return classification
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main()
