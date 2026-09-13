import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { createHash } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import type { ResearchAcquisitionRequest } from '../../plugins/research-acquisition/contracts.ts'
import { OfficialDisclosureResearchPlugin } from '../../plugins/research-acquisition/official.ts'
import { GdeltResearchPlugin } from '../../plugins/research-acquisition/gdelt.ts'
import { AkshareDataAdapter } from '../../plugins/research-acquisition/akshare.ts'
import { AkshareIndustryResearchPlugin } from '../../plugins/research-acquisition/industry.ts'

export const TASK_ID = 'RHL-M3B-3B-DIAG-009-INDUSTRY-ACQUISITION-FAILURE-ISOLATION'
export const BASE_COMMIT = 'af6d7bba9daa568c5a2003b985e6335117c6a93c'
export const AS_OF = '2026-09-12T00:00:00.000Z'
export const SEARCH_TERMS = ['PCB 印制电路板', 'AI服务器 PCB HDI', '深南电路 PCB', '沪电股份 PCB', '胜宏科技 PCB', '生益科技 PCB CCL', 'PCB 产业链', 'PCB 行业 产能'] as const
export const INDUSTRY = { name: 'PCB Manufacturing', aliases: ['Printed Circuit Board'], searchTerms: SEARCH_TERMS } as const
export const REQUEST: ResearchAcquisitionRequest = { industry: INDUSTRY, asOf: AS_OF, limitPerKind: 24 }
const execFileAsync = promisify(execFile)
const hash = (value: unknown) => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex').slice(0, 16)
const safe = (error: unknown) => String(error instanceof Error ? error.message : error).replace(/[A-Za-z]:\\[^\s;,]*/g, '<path>').replace(/(authorization|cookie|api[-_]?key|token|secret)\s*[:=]\s*[^,;\s]+/gi, '$1=<redacted>').slice(0, 240)

export type GdeltClass = 'DISCOVERY_SUCCEEDED_WITH_RESULTS' | 'DISCOVERY_SUCCEEDED_EMPTY' | 'HTTP_RATE_LIMITED' | 'HTTP_CLIENT_ERROR' | 'HTTP_SERVER_ERROR' | 'DNS_OR_CONNECT_FAILURE' | 'TLS_FAILURE' | 'TIMEOUT' | 'INVALID_RESPONSE' | 'PROVIDER_RUNTIME_ERROR' | 'UNKNOWN_DISCOVERY_FAILURE'
export type AkshareClass = 'DISCOVERY_SUCCEEDED_WITH_RESULTS' | 'SECTOR_DATA_EMPTY' | 'EXACT_NAME_MISMATCH_WITH_RELEVANT_BOARD_CANDIDATES' | 'NO_RELEVANT_BOARD_CANDIDATE' | 'PYTHON_EXECUTABLE_UNAVAILABLE' | 'AKSHARE_PACKAGE_UNAVAILABLE' | 'AKSHARE_RUNTIME_FAILURE' | 'AKSHARE_NETWORK_OR_UPSTREAM_FAILURE' | 'UNKNOWN_AKSHARE_FAILURE'
export type AggregateClass = 'CURRENT_INDUSTRY_ACQUISITION_PATHS_INSUFFICIENT' | 'AKSHARE_MATCHING_RULE_BLOCKER_PROVEN' | 'AKSHARE_EXTERNAL_SETUP_BLOCKER' | 'GDELT_RUNTIME_BLOCKER' | 'CURRENT_PROVIDER_DISCOVERY_SUFFICIENT' | 'MIXED_ACQUISITION_BLOCKERS'
export type NextAction = 'IMPLEMENT_BOUNDED_AKSHARE_INDUSTRY_ALIAS_MATCHING' | 'EXTERNAL_AKSHARE_SETUP_OR_REMOVE_RUNTIME_DEPENDENCY' | 'DESIGN_ADDITIONAL_FREE_INDUSTRY_ACQUISITION_PROVIDER' | 'RERUN_M3B_REAL_PI_GATE_WITHOUT_PRODUCTION_CHANGE'

export function classifyGdeltError(error: unknown): GdeltClass {
  const message = safe(error).toLowerCase()
  const status = /http\s+(\d{3})/.exec(message)?.[1]
  if (status === '429' || /rate.?limit/.test(message)) return 'HTTP_RATE_LIMITED'
  if (status && /^4/.test(status)) return 'HTTP_CLIENT_ERROR'
  if (status && /^5/.test(status)) return 'HTTP_SERVER_ERROR'
  if (/timeout|timed out|abort/.test(message)) return 'TIMEOUT'
  if (/certificate|tls|ssl/.test(message)) return 'TLS_FAILURE'
  if (/dns|enotfound|eai_again|econnrefused|econnreset|fetch failed|network/.test(message)) return 'DNS_OR_CONNECT_FAILURE'
  if (/json|parse|invalid response/.test(message)) return 'INVALID_RESPONSE'
  if (/runtime|not a function/.test(message)) return 'PROVIDER_RUNTIME_ERROR'
  return 'UNKNOWN_DISCOVERY_FAILURE'
}

const rowName = (row: Record<string, unknown>) => ['板块名称', '行业名称', 'name', 'sectorName'].map((key) => row[key]).find((value): value is string => typeof value === 'string' && value.trim() !== '')?.trim()
const normalized = (value: string) => value.trim().toLocaleLowerCase().replace(/[\s\-_（）()]/g, '')
export function rankRelevantBoardNames(names: readonly string[], target = INDUSTRY.name, aliases = INDUSTRY.aliases, terms = SEARCH_TERMS): string[] {
  const needles = [target, ...aliases, ...terms].map(normalized).filter(Boolean)
  return [...new Set(names.filter(Boolean))].map((name) => {
    const candidate = normalized(name); const exact = needles.includes(candidate) ? 100 : 0; const contains = needles.some((needle) => candidate.includes(needle) || needle.includes(candidate)) ? 30 : 0; const overlap = new Set(candidate.match(/[a-z]+|[\u4e00-\u9fff]{1,4}/gi) ?? []).size && needles.some((needle) => (needle.match(/[a-z]+|[\u4e00-\u9fff]{1,4}/gi) ?? []).some((token) => token.length > 1 && candidate.includes(token))) ? 10 : 0
    return { name, score: exact + contains + overlap }
  }).filter((item) => item.score > 0).sort((a, b) => b.score - a.score || a.name.localeCompare(b.name)).slice(0, 20).map((item) => item.name)
}

export function classifyAggregate(input: { cninfoIntentionalAbsence: boolean; gdelt: { attempted: boolean; candidateCount: number; classification?: GdeltClass }; akshare: { classification: AkshareClass; candidateCount: number; relevantBoardCandidates: number } }): { classification: AggregateClass; nextActionCategory: NextAction } {
  if (input.akshare.classification === 'EXACT_NAME_MISMATCH_WITH_RELEVANT_BOARD_CANDIDATES' && input.akshare.relevantBoardCandidates > 0) return { classification: 'AKSHARE_MATCHING_RULE_BLOCKER_PROVEN', nextActionCategory: 'IMPLEMENT_BOUNDED_AKSHARE_INDUSTRY_ALIAS_MATCHING' }
  if (input.akshare.classification === 'PYTHON_EXECUTABLE_UNAVAILABLE' || input.akshare.classification === 'AKSHARE_PACKAGE_UNAVAILABLE') return { classification: 'AKSHARE_EXTERNAL_SETUP_BLOCKER', nextActionCategory: 'EXTERNAL_AKSHARE_SETUP_OR_REMOVE_RUNTIME_DEPENDENCY' }
  if (input.akshare.candidateCount > 0 || input.gdelt.candidateCount > 0) return { classification: 'CURRENT_PROVIDER_DISCOVERY_SUFFICIENT', nextActionCategory: 'RERUN_M3B_REAL_PI_GATE_WITHOUT_PRODUCTION_CHANGE' }
  const gdeltBlocked = input.gdelt.attempted && input.gdelt.classification !== 'DISCOVERY_SUCCEEDED_EMPTY'
  const akshareBlocked = input.akshare.classification !== 'SECTOR_DATA_EMPTY' && input.akshare.classification !== 'NO_RELEVANT_BOARD_CANDIDATE'
  if (gdeltBlocked && !akshareBlocked && input.akshare.classification === 'DISCOVERY_SUCCEEDED_WITH_RESULTS') return { classification: 'GDELT_RUNTIME_BLOCKER', nextActionCategory: 'RERUN_M3B_REAL_PI_GATE_WITHOUT_PRODUCTION_CHANGE' }
  if (gdeltBlocked && akshareBlocked) return { classification: 'MIXED_ACQUISITION_BLOCKERS', nextActionCategory: 'DESIGN_ADDITIONAL_FREE_INDUSTRY_ACQUISITION_PROVIDER' }
  return { classification: 'CURRENT_INDUSTRY_ACQUISITION_PATHS_INSUFFICIENT', nextActionCategory: 'DESIGN_ADDITIONAL_FREE_INDUSTRY_ACQUISITION_PROVIDER' }
}

function classifyAkshareRuntime(error: unknown): AkshareClass {
  const detail = error && typeof error === 'object' ? String((error as { stderr?: unknown }).stderr ?? '') : ''
  const message = `${safe(error)} ${detail}`.toLowerCase()
  if (/no such file|not found|cannot find|winerror 2|enoent/.test(message)) return 'PYTHON_EXECUTABLE_UNAVAILABLE'
  if (/no module named ['"]?akshare|modulenotfounderror/.test(message)) return 'AKSHARE_PACKAGE_UNAVAILABLE'
  if (/timeout|connection|network|upstream|remote|http/.test(message)) return 'AKSHARE_NETWORK_OR_UPSTREAM_FAILURE'
  return 'AKSHARE_RUNTIME_FAILURE'
}

async function probeAkshare(request: ResearchAcquisitionRequest) {
  let pythonExecutableDiscovered = false; let importSucceeded = false; let importVersion: string | null = null
  try { const result = await execFileAsync('python', ['-c', "import akshare as ak; print(getattr(ak, '__version__', 'unknown'))"], { timeout: 15000 }); pythonExecutableDiscovered = true; importSucceeded = true; importVersion = result.stdout.trim().slice(0, 40) || 'unknown' } catch (error) {
    const message = safe(error).toLowerCase(); pythonExecutableDiscovered = !/no such file|not found|winerror 2|enoent/.test(message)
    return { attempted: true, pythonExecutableDiscovered, importSucceeded, importVersion, classification: pythonExecutableDiscovered ? 'AKSHARE_PACKAGE_UNAVAILABLE' as AkshareClass : 'PYTHON_EXECUTABLE_UNAVAILABLE' as AkshareClass, sectorRowCount: 0, boardNameSamples: [], rawRowsHash: null, candidateCount: 0, relevantBoardCandidates: 0, failure: 'python_or_import_failure' }
  }
  const adapter = new AkshareDataAdapter()
  try {
    const rows = await adapter.sectorPerformance({ symbol: '', startDate: request.asOf, endDate: request.asOf }); const list = Array.isArray(rows) ? rows : []; const names = list.flatMap((row) => row && typeof row === 'object' ? [rowName(row as Record<string, unknown>)].filter((name): name is string => Boolean(name)) : []); const plugin = new AkshareIndustryResearchPlugin(adapter); const candidates = await plugin.discover(request); const relevant = rankRelevantBoardNames(names)
    const classification: AkshareClass = candidates.length > 0 ? 'DISCOVERY_SUCCEEDED_WITH_RESULTS' : relevant.length > 0 ? 'EXACT_NAME_MISMATCH_WITH_RELEVANT_BOARD_CANDIDATES' : list.length === 0 ? 'SECTOR_DATA_EMPTY' : 'NO_RELEVANT_BOARD_CANDIDATE'
    return { attempted: true, pythonExecutableDiscovered, importSucceeded, importVersion, classification, sectorRowCount: list.length, boardNameSamples: relevant, rawRowsHash: hash(list), candidateCount: candidates.length, relevantBoardCandidates: relevant.length, failure: null }
  } catch (error) { return { attempted: true, pythonExecutableDiscovered, importSucceeded, importVersion, classification: classifyAkshareRuntime(error), sectorRowCount: 0, boardNameSamples: [], rawRowsHash: null, candidateCount: 0, relevantBoardCandidates: 0, failure: 'sector_performance_failure' } }
}

export async function main(): Promise<void> {
  const root = resolve(import.meta.dirname, '../..'); const evidencePath = resolve(root, 'tests/validation/evidence/RHL_M3B_INDUSTRY_ACQUISITION_FAILURE_ISOLATION.json'); const generatedAt = new Date().toISOString()
  let cninfoClientCalls = 0; const cninfo = new OfficialDisclosureResearchPlugin({ list: async () => { cninfoClientCalls++; throw new Error('fake CNINFO client must not be called') }, fetch: async () => '' }); const cninfoCandidates = await cninfo.discover(REQUEST); const cninfoProbe = { provider: 'CNINFO_INDUSTRY_CAPABILITY', attempted: true, returnedCandidateCount: cninfoCandidates.length, clientMethodCallCount: cninfoClientCalls, classification: cninfoCandidates.length === 0 && cninfoClientCalls === 0 ? 'INTENTIONAL_CAPABILITY_ABSENCE' : 'UNEXPECTED_CNINFO_OUTCOME' }
  let gdeltProbe: Record<string, unknown> = { provider: 'GDELT_INDUSTRY_DISCOVERY', attempted: true, requestTermCount: 10, endpointHost: 'api.gdeltproject.org', processOrNetworkReached: null, httpStatusCategory: null, candidateCount: 0, candidateMetadataHashes: [], classification: 'UNKNOWN_DISCOVERY_FAILURE' as GdeltClass, failure: null }
  try { const candidates = await new GdeltResearchPlugin().discover(REQUEST); gdeltProbe = { ...gdeltProbe, processOrNetworkReached: true, candidateCount: candidates.length, candidateMetadataHashes: candidates.slice(0, 20).map((candidate) => hash({ urlHost: candidate.url ? new URL(candidate.url).host : null, title: candidate.title, provider: candidate.provider })), classification: candidates.length > 0 ? 'DISCOVERY_SUCCEEDED_WITH_RESULTS' : 'DISCOVERY_SUCCEEDED_EMPTY' } } catch (error) { gdeltProbe = { ...gdeltProbe, processOrNetworkReached: !/fetch failed|dns|enotfound|eai_again|connection/i.test(safe(error)), classification: classifyGdeltError(error), failure: safe(error) } }
  const akshareProbe = await probeAkshare(REQUEST); const aggregate = classifyAggregate({ cninfoIntentionalAbsence: cninfoProbe.classification === 'INTENTIONAL_CAPABILITY_ABSENCE', gdelt: { attempted: true, candidateCount: Number(gdeltProbe.candidateCount), classification: gdeltProbe.classification as GdeltClass }, akshare: akshareProbe });
  const evidence = { taskId: TASK_ID, baseCommit: BASE_COMMIT, generatedAt, test008Acceptance: { finalGateClassification: 'REAL_MODEL_CONTRACT_BLOCKED', firstRunRevision: 0, gatewaySubmitCount: 0, writerCommitCount: 0, reportObjects: 0, graphObjects: 0, canonicalObjects: 0, acquisitionOutcomes: { cninfo: 'empty', gdelt: 'discovery_failed', akshare: 'discovery_failed' }, reasoning: { runtimeProvider: 'pi-coding-agent', completionBackend: 'codex-cli', model: 'gpt-5.6-luna', effort: 'medium', structuredOutputEnabled: true, automaticFallbackCalls: 0, designCalls: 1, boundedModuleCalls: true } }, request: { targetName: INDUSTRY.name, aliases: INDUSTRY.aliases, asOf: AS_OF, searchTermCount: SEARCH_TERMS.length, searchTermsHash: hash(SEARCH_TERMS), targetHash: hash(INDUSTRY), limitPerKind: REQUEST.limitPerKind }, probes: { cninfo: cninfoProbe, gdelt: gdeltProbe, akshare: akshareProbe, staticAkshareInterface: { exposesSectorPerformance: true, bridgeFunction: 'stock_board_industry_name_em' } }, realExternalCallCounts: { cninfoClientList: cninfoClientCalls, gdeltDiscovery: 1, gdeltFetch: 0, gdeltNormalize: 0, akshareImportChecks: 1, akshareSectorPerformance: akshareProbe.importSucceeded ? 1 : 0, modelCalls: 0 }, aggregate, mutation: { knowledgeMutation: false, productionCodeMutation: false, gatewaySubmitCount: 0, writerCommitCount: 0, reportCreated: false, graphCreated: false, canonicalObjectsCreated: false }, privacy: { credentials: false, authFiles: false, cookies: false, privateAbsolutePaths: false, rawProviderBodies: false, completeArticleBodies: false, fullAkshareRows: false, modelInvocations: false }, constraints: { noRetries: true, noProviderFallback: true, noProductionChange: true } }
  await mkdir(resolve(root, 'tests/validation/evidence'), { recursive: true }); await writeFile(evidencePath, JSON.stringify(evidence, null, 2) + '\n', 'utf8'); console.log(JSON.stringify(evidence, null, 2))
}

if (process.argv[1]?.endsWith('industry-acquisition-failure-isolation.ts')) await main()
