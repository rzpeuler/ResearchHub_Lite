import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { GovCnIndustryResearchPlugin } from '../../plugins/research-acquisition/govcn-industry.ts'
import { sha256 } from '../../plugins/research-acquisition/hash.ts'
import { TARGET } from './govcn-industry-production-acquisition.ts'

export const TASK_ID = 'RHL-M3B-3B-DIAG-019-GOVCN-QUERY-COVERAGE'
export const BASE_COMMIT = '9ffe341df5f41fdee437b3b68b7b154d912b5dd2'
export const ENDPOINT = 'https://sousuo.www.gov.cn/search-gov/data'
const CATEGORY = 'zhengcelibrary_gw_bm_gb'
const SEARCH_FIELDS = 'title:content:summary'
const PAGE_SIZE = 10
const PAYLOAD_LIMIT = 2 * 1024 * 1024
const TARGET_VOCABULARY = [TARGET.name, TARGET.alias, ...TARGET.searchTerms]

export type CoverageClassification = 'QUERY_SELECTION_GAP' | 'SOURCE_COVERAGE_GAP' | 'PRODUCTION_SELECTION_ALREADY_COVERS_HIT' | 'LIVE_SOURCE_INCONCLUSIVE'
export type ProbeOutcome = { termHash: string; termId: string; requestCount: number; httpOutcome: string; parseOutcome: string; boundedResultCount: number; httpsGovCnCandidateCount: number; pcbTargetMatchCount: number; productionSelected: boolean }

type Row = { title?: string; snippet?: string; url?: string }
const object = (value: unknown): Record<string, unknown> | undefined => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined
const stringValue = (value: unknown, maximum = 2048) => typeof value === 'string' && value.trim() ? value.normalize('NFKC').replace(/\s+/g, ' ').trim().slice(0, maximum) : undefined
const pick = (row: Record<string, unknown>, names: readonly string[]) => names.map((name) => row[name]).find((value) => value !== undefined)
const validGovUrl = (value: unknown): value is string => { try { const url = new URL(String(value)); return url.protocol === 'https:' && (url.hostname === 'gov.cn' || url.hostname.endsWith('.gov.cn')) } catch { return false } }
const vocabularyMatch = (row: Row) => TARGET_VOCABULARY.some((term) => `${row.title ?? ''} ${row.snippet ?? ''}`.toLocaleLowerCase().includes(term.toLocaleLowerCase()))

export function classifyCoverage(probes: readonly Pick<ProbeOutcome, 'productionSelected' | 'pcbTargetMatchCount'>[], liveSourceInconclusive = false): CoverageClassification {
  if (liveSourceInconclusive) return 'LIVE_SOURCE_INCONCLUSIVE'
  if (probes.some((probe) => probe.productionSelected && probe.pcbTargetMatchCount > 0)) return 'PRODUCTION_SELECTION_ALREADY_COVERS_HIT'
  if (probes.some((probe) => !probe.productionSelected && probe.pcbTargetMatchCount > 0)) return 'QUERY_SELECTION_GAP'
  return 'SOURCE_COVERAGE_GAP'
}

export function aggregateCoverage(probes: readonly ProbeOutcome[]): { classification: CoverageClassification; selectedHitCount: number; omittedHitCount: number } {
  return { classification: classifyCoverage(probes), selectedHitCount: probes.filter((probe) => probe.productionSelected && probe.pcbTargetMatchCount > 0).length, omittedHitCount: probes.filter((probe) => !probe.productionSelected && probe.pcbTargetMatchCount > 0).length }
}

function requestUrl(query: string): URL { const url = new URL(ENDPOINT); for (const [key, value] of Object.entries({ t: CATEGORY, searchfield: SEARCH_FIELDS, orderBy: 'RELEVANCE', q: query, pageNum: '1', pageSize: String(PAGE_SIZE) })) url.searchParams.set(key, value); return url }
async function boundedJson(response: Response): Promise<unknown> {
  const bytes = new Uint8Array(await response.arrayBuffer()); if (bytes.byteLength > PAYLOAD_LIMIT) throw new Error('payload exceeds bound'); return JSON.parse(new TextDecoder().decode(bytes))
}
function rows(payload: unknown): Row[] {
  const root = object(payload); const data = object(root?.data); const searchVO = object(root?.searchVO); const catMap = object(searchVO?.catMap); const gongbao = object(catMap?.gongbao)
  const container = [data?.list, data?.results, data?.items, root?.list, root?.results, gongbao?.listVO].find(Array.isArray)
  if (!container) { if ((Array.isArray(root?.data) && root.data.length === 0) || (data && (Object.keys(data).length === 0 || data.code === '0' || data.total === 0 || data.totalCount === 0))) return []; throw new Error('no bounded result array') }
  return (container as unknown[]).slice(0, PAGE_SIZE).flatMap((item) => { const row = object(item); const title = stringValue(row ? pick(row, ['title', 'Title']) : undefined, 1000); const url = stringValue(row ? pick(row, ['url', 'URL', 'link', 'docUrl']) : undefined); const snippet = stringValue(row ? pick(row, ['summary', 'content', 'snippet', 'description']) : undefined, 1000); return row && title && url ? [{ title, url, snippet }] : [] })
}

export async function runDiagnostic(): Promise<Record<string, unknown>> {
  const selectedQueries = new Set<string>(); let productionRequestCount = 0; let productionFailure: string | null = null
  const targetRequest = { industry: { name: TARGET.name, aliases: [TARGET.alias], searchTerms: [...TARGET.searchTerms] }, asOf: TARGET.asOf, limitPerKind: 8 } as const
  try { await new GovCnIndustryResearchPlugin({ fetchImpl: async (input, init) => { productionRequestCount++; const url = new URL(String(input)); const query = url.searchParams.get('q'); if (query) selectedQueries.add(query); return fetch(input, init) } }).discover(targetRequest) } catch (error) { productionFailure = error instanceof Error ? error.message.slice(0, 160) : 'production discovery failed' }
  const probes: ProbeOutcome[] = []; let inconclusive = Boolean(productionFailure)
  for (const term of TARGET.searchTerms) {
    const termHash = sha256(term).slice(0, 16); const termId = `pcb-term-${String(TARGET.searchTerms.indexOf(term) + 1).padStart(2, '0')}`; let httpOutcome = 'NOT_ATTEMPTED'; let parseOutcome = 'NOT_ATTEMPTED'; let boundedResultCount = 0; let httpsGovCnCandidateCount = 0; let pcbTargetMatchCount = 0
    try { const response = await fetch(requestUrl(term)); httpOutcome = `HTTP_${response.status}`; if (!response.ok) { inconclusive = true; parseOutcome = 'SKIPPED_HTTP_FAILURE' } else { const parsed = rows(await boundedJson(response)); parseOutcome = 'PARSED'; boundedResultCount = parsed.length; httpsGovCnCandidateCount = parsed.filter((row) => validGovUrl(row.url)).length; pcbTargetMatchCount = parsed.filter((row) => validGovUrl(row.url) && vocabularyMatch(row)).length } } catch (error) { inconclusive = true; parseOutcome = error instanceof Error && /JSON|result array|payload/.test(error.message) ? 'PARSE_FAILURE' : 'TRANSPORT_FAILURE' }
    probes.push({ termHash, termId, requestCount: 1, httpOutcome, parseOutcome, boundedResultCount, httpsGovCnCandidateCount, pcbTargetMatchCount, productionSelected: selectedQueries.has(term) })
  }
  const classification = classifyCoverage(probes, inconclusive)
  const evidence = { taskId: TASK_ID, baseCommit: BASE_COMMIT, generatedAt: new Date().toISOString(), endpoint: ENDPOINT, requestPolicy: { category: CATEGORY, searchFields: SEARCH_FIELDS, orderBy: 'RELEVANCE', pageSize: PAGE_SIZE, payloadBytesCap: PAYLOAD_LIMIT, protocol: 'HTTPS gov.cn only', nativeFetchOnly: true, alternateProviders: false, retries: false }, target: { nameHash: sha256(TARGET.name).slice(0, 16), searchTermCount: TARGET.searchTerms.length, searchTermsHash: sha256(JSON.stringify(TARGET.searchTerms)) }, productionSelection: { requestCount: productionRequestCount, selectedQueryCount: selectedQueries.size, exactSelectedQueries: [...selectedQueries].map((query) => query.slice(0, 120)), selectedTermIds: TARGET.searchTerms.map((term, index) => selectedQueries.has(term) ? `pcb-term-${String(index + 1).padStart(2, '0')}` : null).filter(Boolean), productionFailure }, probes, classification, recommendation: classification === 'QUERY_SELECTION_GAP' ? 'Narrow production query-selection change may be justified; do not implement from this diagnostic.' : classification === 'SOURCE_COVERAGE_GAP' ? 'Do not broaden query selection; the approved source produced no valid PCB-target hit for any frozen term.' : classification === 'PRODUCTION_SELECTION_ALREADY_COVERS_HIT' ? 'Next task should isolate parser/ranking/filter behavior; do not change query selection.' : 'Repeat the same bounded diagnostic after service stability is restored; do not infer coverage.', mutation: { productionCodeMutation: false, modelCalls: 0, knowledgeMutation: false, gatewaySubmitCount: 0, writerCommitCount: 0 }, privacy: { rawResponseBodies: false, completeDocumentText: false, cookies: false, credentials: false, authorizationHeaders: false, privateAbsolutePaths: false, reasoningTraces: false } }
  const outputPath = join(process.cwd(), 'tests', 'validation', 'evidence', 'RHL_M3B_GOVCN_QUERY_COVERAGE.json'); await mkdir(join(process.cwd(), 'tests', 'validation', 'evidence'), { recursive: true }); await writeFile(outputPath, JSON.stringify(evidence, null, 2) + '\n', 'utf8'); console.log(JSON.stringify(evidence, null, 2)); return evidence
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await runDiagnostic()
