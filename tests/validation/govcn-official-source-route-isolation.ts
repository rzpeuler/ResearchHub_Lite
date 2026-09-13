import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { sha256 } from '../../plugins/research-acquisition/hash.ts'
import { TARGET } from './govcn-industry-production-acquisition.ts'

export const TASK_ID = 'RHL-M3B-3B-DIAG-020-OFFICIAL-INDUSTRY-SOURCE-ROUTE-ISOLATION'
export const CONTROL_ROUTE = 'https://sousuo.www.gov.cn/search-gov/data'
export const CLASSIFICATIONS = ['ALTERNATE_OFFICIAL_ROUTE_PROVEN', 'OFFICIAL_SOURCE_COVERAGE_GAP', 'PARSER_OR_ROUTE_COMPATIBILITY_GAP', 'LIVE_SOURCE_INCONCLUSIVE'] as const
export type Classification = typeof CLASSIFICATIONS[number]
export const MAX_SEARCH_REQUESTS = 30
export const MAX_DOCUMENT_REQUESTS = 2
const PAGE_SIZE = 10
const SEARCH_BYTES = 2 * 1024 * 1024
const DOCUMENT_BYTES = 8 * 1024 * 1024
const terms = [TARGET.name, TARGET.alias, ...TARGET.searchTerms]

type Candidate = { routeId: string; title: string; url: string; snippet?: string; host: string }
export type RouteProbe = { routeId: string; host: string; family: string; queryHash: string; requestCount: number; httpOutcome: string; parseOutcome: string; boundedResultCount: number; validOfficialCandidateCount: number; pcbTargetMatchCount: number; candidateHosts: string[] }

const record = (value: unknown): Record<string, unknown> | undefined => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined
const boundedText = (value: unknown, maximum = 1200) => typeof value === 'string' && value.trim() ? value.normalize('NFKC').replace(/\s+/g, ' ').trim().slice(0, maximum) : undefined
export const officialHttps = (value: unknown): value is string => { try { const url = new URL(String(value)); return url.protocol === 'https:' && (url.hostname === 'gov.cn' || url.hostname.endsWith('.gov.cn')) } catch { return false } }
const targetMatch = (candidate: Pick<Candidate, 'title' | 'snippet'>) => terms.some((term) => `${candidate.title} ${candidate.snippet ?? ''}`.toLocaleLowerCase().includes(term.toLocaleLowerCase()))
const queryUrl = (base: string, query: string) => { const url = new URL(base); url.searchParams.set('q', query); url.searchParams.set('searchWord', query); return url }

export const ROUTES = [
  { routeId: 'control-policy-json', family: 'sousuo-search-gov-data', url: CONTROL_ROUTE, format: 'json', derivation: 'DIAG-019 control route' },
  { routeId: 'alternate-www-search-html', family: 'www-gov-search', url: 'https://www.gov.cn/search.htm', format: 'html', derivation: 'public www.gov.cn search page family' },
  { routeId: 'alternate-sousuo-search-html', family: 'sousuo-search-page', url: 'https://sousuo.www.gov.cn/search-gov/search.htm', format: 'html', derivation: 'public sousuo.www.gov.cn search page family' },
] as const

function jsonRows(payload: unknown): Candidate[] {
  const root = record(payload); const data = record(root?.data); const searchVO = record(root?.searchVO); const catMap = record(searchVO?.catMap); const gongbao = record(catMap?.gongbao)
  const container = [data?.list, data?.results, data?.items, root?.list, root?.results, gongbao?.listVO].find(Array.isArray)
  if (!container) { if (Array.isArray(root?.data) && root.data.length === 0) return []; if (data && (data.code === '0' || data.total === 0 || data.totalCount === 0 || Object.keys(data).length === 0)) return []; throw new Error('unknown JSON result structure') }
  return (container as unknown[]).slice(0, PAGE_SIZE).flatMap((item) => { const row = record(item); const title = boundedText(row?.title ?? row?.Title); const url = boundedText(row?.url ?? row?.URL ?? row?.link ?? row?.docUrl, 2048); const snippet = boundedText(row?.summary ?? row?.content ?? row?.snippet ?? row?.description); return title && url && officialHttps(url) ? [{ routeId: '', title, url, snippet, host: new URL(url).hostname }] : [] })
}

function htmlRows(payload: string): Candidate[] {
  const rows: Candidate[] = []; const anchor = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi
  for (const match of payload.matchAll(anchor)) { const url = match[1]; const title = boundedText(match[2].replace(/<[^>]+>/g, '')); if (!title || !officialHttps(url)) continue; rows.push({ routeId: '', title, url, host: new URL(url).hostname }) }
  if (!rows.length && /<html|<!doctype/i.test(payload)) return []
  if (!rows.length) throw new Error('unknown HTML result structure')
  return rows.slice(0, PAGE_SIZE)
}

export function classifyRouteIsolation(probes: readonly Pick<RouteProbe, 'parseOutcome' | 'pcbTargetMatchCount' | 'routeId'>[], documentNormalizedCount: number, inconclusive: boolean): Classification {
  if (inconclusive || probes.some((probe) => probe.parseOutcome === 'UNKNOWN_STRUCTURE' || probe.parseOutcome === 'TRANSPORT_FAILURE' || probe.parseOutcome === 'HTTP_FAILURE')) return 'LIVE_SOURCE_INCONCLUSIVE'
  if (probes.some((probe) => probe.routeId.startsWith('alternate-') && probe.pcbTargetMatchCount > 0) && documentNormalizedCount > 0) return 'ALTERNATE_OFFICIAL_ROUTE_PROVEN'
  if (probes.some((probe) => probe.parseOutcome !== 'PARSED')) return 'PARSER_OR_ROUTE_COMPATIBILITY_GAP'
  return 'OFFICIAL_SOURCE_COVERAGE_GAP'
}

async function readBounded(response: Response, maximum: number): Promise<Uint8Array> { const bytes = new Uint8Array(await response.arrayBuffer()); if (bytes.byteLength > maximum) throw new Error('payload exceeds bound'); return bytes }
async function live(): Promise<Record<string, unknown>> {
  let searchRequests = 0; let documentRequests = 0; let inconclusive = false; const probes: RouteProbe[] = []; const validCandidates: Candidate[] = []; const normalized: Record<string, unknown>[] = []
  for (const route of ROUTES) for (const query of TARGET.searchTerms) {
    if (searchRequests >= MAX_SEARCH_REQUESTS) { inconclusive = true; break }
    searchRequests++; const queryHash = sha256(query).slice(0, 16); let httpOutcome = 'NOT_ATTEMPTED'; let parseOutcome = 'NOT_ATTEMPTED'; let rows: Candidate[] = []
    try { const response = await fetch(queryUrl(route.url, query)); httpOutcome = `HTTP_${response.status}`; if (!response.ok) { inconclusive = true; parseOutcome = 'HTTP_FAILURE' } else { const bytes = await readBounded(response, SEARCH_BYTES); rows = route.format === 'json' ? jsonRows(JSON.parse(new TextDecoder().decode(bytes))) : htmlRows(new TextDecoder().decode(bytes)); parseOutcome = 'PARSED' } } catch (error) { inconclusive = true; parseOutcome = error instanceof Error && /unknown|JSON|payload/.test(error.message) ? 'UNKNOWN_STRUCTURE' : 'TRANSPORT_FAILURE' }
    const candidates = rows.map((row) => ({ ...row, routeId: route.routeId })).filter((row) => officialHttps(row.url)); validCandidates.push(...candidates); const hits = candidates.filter(targetMatch)
    probes.push({ routeId: route.routeId, host: new URL(route.url).hostname, family: route.family, queryHash, requestCount: 1, httpOutcome, parseOutcome, boundedResultCount: rows.length, validOfficialCandidateCount: candidates.length, pcbTargetMatchCount: hits.length, candidateHosts: [...new Set(candidates.map((candidate) => candidate.host))].slice(0, 10) })
  }
  for (const candidate of validCandidates.filter(targetMatch).slice(0, MAX_DOCUMENT_REQUESTS)) { documentRequests++; try { const response = await fetch(candidate.url, { headers: { accept: 'text/html,application/xhtml+xml,application/pdf,text/plain' } }); const bytes = await readBounded(response, DOCUMENT_BYTES); const text = new TextDecoder().decode(bytes).replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(); if (!response.ok || !text) throw new Error('document normalization failed'); normalized.push({ routeId: candidate.routeId, host: candidate.host, httpOutcome: `HTTP_${response.status}`, normalization: 'NORMALIZED', normalizedTextBytes: Buffer.byteLength(text, 'utf8'), contentHash: sha256(bytes) }) } catch (error) { normalized.push({ routeId: candidate.routeId, host: candidate.host, httpOutcome: 'FETCH_OR_NORMALIZATION_FAILURE', normalization: 'FAILED', failure: error instanceof Error ? error.message.slice(0, 120) : 'unknown' }) } }
  const classification = classifyRouteIsolation(probes, normalized.filter((item) => item.normalization === 'NORMALIZED').length, inconclusive)
  const evidence = { taskId: TASK_ID, baseCommit: 'ad33be25273f73beb645b5ba3f6a7bb6e2e5e250', generatedAt: new Date().toISOString(), target: { nameHash: sha256(TARGET.name).slice(0, 16), aliasHash: sha256(TARGET.alias).slice(0, 16), asOf: TARGET.asOf, searchTermCount: TARGET.searchTerms.length, searchTermsHash: sha256(JSON.stringify(TARGET.searchTerms)) }, routes: ROUTES.map((route) => ({ routeId: route.routeId, family: route.family, host: new URL(route.url).hostname, path: new URL(route.url).pathname, format: route.format, derivation: route.derivation })), probes, validOfficialCandidates: validCandidates.slice(0, 20).map(({ title, url, host, routeId }) => ({ routeId, host, urlPath: new URL(url).pathname, titleHash: sha256(title).slice(0, 16), targetMatch: targetMatch({ title, snippet: undefined }) })), documentNormalization: normalized, requestBudget: { searchOrRouteDiscoveryRequests: searchRequests, maximumSearchOrRouteDiscoveryRequests: MAX_SEARCH_REQUESTS, documentFetches: documentRequests, maximumDocumentFetches: MAX_DOCUMENT_REQUESTS, retries: 0 }, classification, recommendation: classification === 'ALTERNATE_OFFICIAL_ROUTE_PROVEN' ? 'Evaluate the smallest ResearchAcquisitionPlugin routing/parser delta for the proven official route family; do not implement it in this diagnostic.' : 'No production change is authorized; retain the current ResearchAcquisitionPlugin route and authorize only a separately scoped follow-up if needed.', mutation: { productionCodeMutation: false, knowledgeMutation: false, modelCalls: 0, gatewaySubmitCount: 0, writerCommitCount: 0 }, privacy: { rawResponseBodies: false, fullDocumentText: false, cookies: false, credentials: false, authorizationHeaders: false, privateAbsolutePaths: false, reasoningTraces: false, thirdPartySearchEngines: false, browserAutomation: false, antiBotBypass: false } }
  const outputPath = join(process.cwd(), 'tests', 'validation', 'evidence', 'RHL_M3B_GOVCN_OFFICIAL_SOURCE_ROUTE_ISOLATION.json'); await mkdir(join(process.cwd(), 'tests', 'validation', 'evidence'), { recursive: true }); await writeFile(outputPath, JSON.stringify(evidence, null, 2) + '\n', 'utf8'); console.log(JSON.stringify(evidence, null, 2)); return evidence
}
export async function runDiagnostic() { return live() }
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await live()
