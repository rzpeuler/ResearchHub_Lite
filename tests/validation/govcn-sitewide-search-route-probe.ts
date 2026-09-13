import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { sha256 } from '../../plugins/research-acquisition/hash.ts'
import { TARGET } from './govcn-industry-production-acquisition.ts'

export const TASK_ID = 'RHL-M3B-3B-DIAG-021-GOVCN-SITEWIDE-SEARCH-ROUTE-PROBE'
export const BASE_COMMIT = '26dae86de8b9cce02c2d2ca1b4906b9936433f5a'
export const DISCOVERY_ROOT = 'https://sousuo.www.gov.cn/'
export const SEARCH_PAGE = 'https://sousuo.www.gov.cn/sousuo/search.shtml'
export const CLASSIFICATIONS = ['SITEWIDE_OFFICIAL_ROUTE_PROVEN', 'SITEWIDE_ROUTE_REACHABLE_NO_PCB_MATCH', 'SITEWIDE_ROUTE_CONTRACT_UNRESOLVED', 'LIVE_SOURCE_INCONCLUSIVE'] as const
export type Classification = typeof CLASSIFICATIONS[number]
export const MAX_REQUESTS = 24
export const MAX_DOCUMENT_REQUESTS = 2
const MAX_ASSETS = 6
const MAX_ROWS = 20
const MAX_BYTES = 2 * 1024 * 1024
const DOCUMENT_BYTES = 8 * 1024 * 1024
const terms = [...TARGET.searchTerms]

type Contract = { action: string; method: 'GET' | 'POST'; queryParameter: string; fixedParameters: Record<string, string>; source: string }
type Candidate = { title: string; url: string; snippet?: string; host: string; queryHash: string }
export type Probe = { termHash: string; requestCount: number; httpOutcome: string; parseOutcome: string; boundedResultCount: number; officialCandidateCount: number; pcbMatchCount: number }

const text = (value: unknown, limit = 1200) => typeof value === 'string' && value.trim() ? value.normalize('NFKC').replace(/\s+/g, ' ').trim().slice(0, limit) : undefined
export const officialHttps = (value: unknown): value is string => { try { const url = new URL(String(value)); return url.protocol === 'https:' && (url.hostname === 'gov.cn' || url.hostname.endsWith('.gov.cn')) } catch { return false } }
const sameHostOrGov = (value: string) => { try { const url = new URL(value, DISCOVERY_ROOT); return officialHttps(url.href) && (url.hostname === 'sousuo.www.gov.cn' || url.hostname.endsWith('.gov.cn')) } catch { return false } }
const targetMatch = (candidate: Pick<Candidate, 'title' | 'snippet'>) => [TARGET.name, TARGET.alias, ...terms].some((term) => `${candidate.title} ${candidate.snippet ?? ''}`.toLocaleLowerCase().includes(term.toLocaleLowerCase()))
const attr = (tag: string, name: string) => new RegExp(`\\b${name}\\s*=\\s*["']([^"']*)["']`, 'i').exec(tag)?.[1]

export function extractContract(html: string, pageUrl = SEARCH_PAGE): Contract | undefined {
  const form = /<form\b[^>]*>([\s\S]*?)<\/form>/i.exec(html)
  if (!form) return undefined
  const formTag = /<form\b[^>]*>/i.exec(form[0])?.[0] ?? ''
  const action = new URL(attr(formTag, 'action') || pageUrl, pageUrl)
  if (!officialHttps(action.href) || !sameHostOrGov(action.href)) return undefined
  const method = (attr(formTag, 'method') || 'get').toUpperCase() === 'POST' ? 'POST' : 'GET'
  const fixedParameters: Record<string, string> = {}
  let queryParameter: string | undefined
  for (const match of form[1].matchAll(/<(input|textarea|select)\b[^>]*>/gi)) {
    const tag = match[0]; const name = attr(tag, 'name'); if (!name) continue
    const value = text(attr(tag, 'value') ?? '')
    const type = (attr(tag, 'type') || '').toLowerCase()
    if (!queryParameter && (type === 'search' || type === 'text' || /search|query|keyword|word|content|title/i.test(name))) queryParameter = name
    else if (value !== undefined && type !== 'submit' && type !== 'button') fixedParameters[name] = value
  }
  return queryParameter ? { action: action.href, method, queryParameter, fixedParameters, source: 'official search form' } : undefined
}

export function filterOfficialUrls(values: readonly string[]): string[] { return [...new Set(values.filter((value) => sameHostOrGov(value)).map((value) => new URL(value, DISCOVERY_ROOT).href))] }

function links(html: string): string[] { return [...html.matchAll(/\b(?:href|src)\s*=\s*["']([^"']+)["']/gi)].map((match) => match[1]) }
function rows(html: string, queryHash: string): Candidate[] {
  const output: Candidate[] = []; const anchor = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi
  for (const match of html.matchAll(anchor)) { const url = new URL(match[1], SEARCH_PAGE); const title = text(match[2].replace(/<[^>]+>/g, '')); if (title && officialHttps(url.href)) output.push({ title, url: url.href, host: url.hostname, queryHash }) }
  return output.slice(0, MAX_ROWS)
}
async function bounded(response: Response, limit: number): Promise<string> { const bytes = new Uint8Array(await response.arrayBuffer()); if (bytes.byteLength > limit) throw new Error('payload exceeds bound'); return new TextDecoder().decode(bytes) }
function normalizeDocument(value: string): string { return value.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() }

export function classifySitewide(probes: readonly Pick<Probe, 'parseOutcome' | 'pcbMatchCount'>[], contract: Contract | undefined, normalizedCount: number, liveInconclusive: boolean): Classification {
  if (liveInconclusive || probes.some((probe) => ['TRANSPORT_FAILURE', 'HTTP_FAILURE', 'UNSTABLE_HTTP'].includes(probe.parseOutcome))) return 'LIVE_SOURCE_INCONCLUSIVE'
  if (!contract || probes.some((probe) => probe.parseOutcome === 'UNKNOWN_STRUCTURE')) return 'SITEWIDE_ROUTE_CONTRACT_UNRESOLVED'
  if (probes.some((probe) => probe.pcbMatchCount > 0) && normalizedCount > 0) return 'SITEWIDE_OFFICIAL_ROUTE_PROVEN'
  return 'SITEWIDE_ROUTE_REACHABLE_NO_PCB_MATCH'
}

async function live(): Promise<Record<string, unknown>> {
  let requestCount = 0; let documentFetches = 0; let inconclusive = false; const outcomes: Record<string, string> = {}; const assets: Record<string, unknown>[] = []
  const fetchPage = async (url: string) => { requestCount++; const response = await fetch(url); const body = await bounded(response, MAX_BYTES); outcomes[url] = `HTTP_${response.status}`; return { response, body } }
  let rootBody = ''; let pageBody = ''; let rootHttp = 'NOT_ATTEMPTED'; let pageHttp = 'NOT_ATTEMPTED'
  try { const result = await fetchPage(DISCOVERY_ROOT); rootBody = result.body; rootHttp = outcomes[DISCOVERY_ROOT] } catch { inconclusive = true; rootHttp = 'TRANSPORT_FAILURE' }
  try { const result = await fetchPage(SEARCH_PAGE); pageBody = result.body; pageHttp = outcomes[SEARCH_PAGE] } catch { inconclusive = true; pageHttp = 'TRANSPORT_FAILURE' }
  const publicRefs = filterOfficialUrls([...links(rootBody), ...links(pageBody)]).filter((url) => url !== DISCOVERY_ROOT && url !== SEARCH_PAGE).slice(0, MAX_ASSETS)
  for (const url of publicRefs) { if (requestCount >= MAX_REQUESTS) break; try { const result = await fetchPage(url); assets.push({ host: new URL(url).hostname, path: new URL(url).pathname, kind: /\.js(?:$|\?)/i.test(url) ? 'javascript' : 'static', httpOutcome: outcomes[url], bodyHash: sha256(result.body), extractedRouteHints: filterOfficialUrls([...result.body.matchAll(/https:\/\/[^"'\s<>]+/g)].map((match) => match[0])).slice(0, 5).map((value) => new URL(value).pathname) }) } catch { assets.push({ host: new URL(url).hostname, path: new URL(url).pathname, httpOutcome: 'FETCH_FAILURE' }) } }
  const contract = extractContract(pageBody); const probes: Probe[] = []; const candidates: Candidate[] = []
  if (rootHttp !== 'HTTP_200' || pageHttp !== 'HTTP_200') inconclusive = true
  if (contract) for (const term of terms) { if (requestCount >= MAX_REQUESTS) { inconclusive = true; break } const termHash = sha256(term).slice(0, 16); let httpOutcome = 'NOT_ATTEMPTED'; let parseOutcome = 'NOT_ATTEMPTED'; let resultRows: Candidate[] = []; try { const url = new URL(contract.action); for (const [key, value] of Object.entries(contract.fixedParameters)) url.searchParams.set(key, value); url.searchParams.set(contract.queryParameter, term); requestCount++; const response = await fetch(url, contract.method === 'POST' ? { method: 'POST', body: new URLSearchParams(url.searchParams) } : undefined); httpOutcome = `HTTP_${response.status}`; if (!response.ok) { parseOutcome = response.status >= 500 ? 'UNSTABLE_HTTP' : 'HTTP_FAILURE'; inconclusive = true } else { const body = await bounded(response, MAX_BYTES); resultRows = rows(body, termHash); parseOutcome = 'PARSED' } } catch (error) { parseOutcome = error instanceof Error && /payload/.test(error.message) ? 'UNKNOWN_STRUCTURE' : 'TRANSPORT_FAILURE'; inconclusive = true } const official = resultRows.filter((candidate) => officialHttps(candidate.url)); const hits = official.filter(targetMatch); candidates.push(...hits); probes.push({ termHash, requestCount: 1, httpOutcome, parseOutcome, boundedResultCount: resultRows.length, officialCandidateCount: official.length, pcbMatchCount: hits.length }) }
  const normalized: Record<string, unknown>[] = []
  for (const candidate of candidates.slice(0, MAX_DOCUMENT_REQUESTS)) { if (requestCount >= MAX_REQUESTS) { inconclusive = true; break } requestCount++; documentFetches++; try { const response = await fetch(candidate.url); const body = await bounded(response, DOCUMENT_BYTES); const normalizedText = normalizeDocument(body); if (!response.ok || !normalizedText) throw new Error('document normalization failed'); normalized.push({ host: candidate.host, path: new URL(candidate.url).pathname, httpOutcome: `HTTP_${response.status}`, normalization: 'NORMALIZED', normalizedTextBytes: Buffer.byteLength(normalizedText), contentHash: sha256(body) }) } catch { normalized.push({ host: candidate.host, path: new URL(candidate.url).pathname, normalization: 'FAILED' }) } }
  const classification = classifySitewide(probes, contract, normalized.filter((item) => item.normalization === 'NORMALIZED').length, inconclusive)
  const evidence = { taskId: TASK_ID, baseCommit: BASE_COMMIT, generatedAt: new Date().toISOString(), target: { nameHash: sha256(TARGET.name).slice(0, 16), aliasHash: sha256(TARGET.alias).slice(0, 16), asOf: TARGET.asOf, searchTermCount: terms.length, searchTermsHash: sha256(JSON.stringify(terms)) }, officialRoutes: { discoveryRoot: { host: new URL(DISCOVERY_ROOT).hostname, path: new URL(DISCOVERY_ROOT).pathname, httpOutcome: rootHttp }, searchPage: { host: new URL(SEARCH_PAGE).hostname, path: new URL(SEARCH_PAGE).pathname, httpOutcome: pageHttp }, routeFamily: 'sousuo.www.gov.cn/sousuo/search.shtml' }, discoveredContract: contract ? { actionHost: new URL(contract.action).hostname, actionPath: new URL(contract.action).pathname, method: contract.method, queryParameter: contract.queryParameter, fixedParameterNames: Object.keys(contract.fixedParameters), fixedParameterValueHashes: Object.fromEntries(Object.entries(contract.fixedParameters).map(([key, value]) => [key, sha256(value).slice(0, 16)])), derivation: contract.source } : null, discoveryEvidence: { sourceHashes: [sha256(rootBody), sha256(pageBody)].filter(Boolean), referencedAssetCount: publicRefs.length, assets }, probes, boundedResultSummary: { candidateCount: candidates.length, officialCandidateCount: candidates.length, pcbMatchCount: candidates.length, normalizedDocumentCount: normalized.filter((item) => item.normalization === 'NORMALIZED').length }, documentNormalization: normalized, requestBudget: { totalRequests: requestCount, maximumRequests: MAX_REQUESTS, documentFetches, maximumDocumentFetches: MAX_DOCUMENT_REQUESTS, retries: 0 }, classification, recommendation: classification === 'SITEWIDE_OFFICIAL_ROUTE_PROVEN' ? 'Evaluate the smallest ResearchAcquisitionPlugin route/parser change for this proven official family; do not implement it in this diagnostic.' : 'No production change is authorized; retain the existing ResearchAcquisitionPlugin route and scope any follow-up separately.', mutation: { productionCodeMutation: false, knowledgeMutation: false, modelCalls: 0, gatewaySubmitCount: 0, writerCommitCount: 0 }, privacy: { rawResponseBodies: false, fullHtmlOrJavaScript: false, fullDocumentText: false, cookies: false, credentials: false, authorizationHeaders: false, privateAbsolutePaths: false, reasoningTraces: false, thirdPartySearchEngines: false, browserAutomation: false, antiBotBypass: false } }
  const outputPath = join(process.cwd(), 'tests', 'validation', 'evidence', 'RHL_M3B_GOVCN_SITEWIDE_SEARCH_ROUTE_PROBE.json'); await mkdir(join(process.cwd(), 'tests', 'validation', 'evidence'), { recursive: true }); await writeFile(outputPath, JSON.stringify(evidence, null, 2) + '\n', 'utf8'); console.log(JSON.stringify(evidence, null, 2)); return evidence
}

export async function runDiagnostic() { return live() }
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await live()
