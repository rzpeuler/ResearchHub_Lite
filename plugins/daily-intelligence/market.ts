import { sha256 } from '../research-acquisition/hash.ts'
import type { AkshareDataClient } from '../research-acquisition/akshare.ts'
import { cninfoShanghaiCalendarDate } from '../research-acquisition/official.ts'
import type { ResearchAcquisitionPlugin, ResearchAcquisitionRequest, ResearchFetchedSource, ResearchSourceCandidate, NormalizedResearchSource } from '../research-acquisition/contracts.ts'

type Row = Record<string, unknown>
interface IndexEndpoint { readonly indexCode: string; readonly providerSymbol: string; readonly name: string }
const INDEXES: readonly IndexEndpoint[] = [
  { indexCode: '000001', providerSymbol: 'sh000001', name: 'SSE Composite Index' },
  { indexCode: '399001', providerSymbol: 'sz399001', name: 'SZSE Component Index' },
  { indexCode: '399006', providerSymbol: 'sz399006', name: 'ChiNext Index' },
  { indexCode: '000688', providerSymbol: 'sh000688', name: 'STAR Market Index' },
]
const INDEX_BY_CODE = new Map(INDEXES.map((item) => [item.indexCode, item]))

function rows(value: unknown): readonly Row[] { if (Array.isArray(value)) return value.filter((item): item is Row => typeof item === 'object' && item !== null && !Array.isArray(item)); if (typeof value === 'object' && value !== null && Array.isArray((value as Row).data)) return rows((value as Row).data); return [] }
function text(value: unknown): string | undefined { if (typeof value !== 'string' && typeof value !== 'number') return undefined; const result = String(value).trim(); return result || undefined }
function dateOnly(row: Row): string | undefined { for (const key of ['date', '日期', 'trade_date', '交易日期', 'datetime', '时间']) { const raw = text(row[key]); if (!raw) continue; const compact = /^(\d{4})(\d{2})(\d{2})$/.exec(raw); if (compact) return `${compact[1]}-${compact[2]}-${compact[3]}`; const match = /^(\d{4}-\d{2}-\d{2})/.exec(raw.replace(/\//g, '-')); if (match) return match[1]; if (/^\d{10,13}$/.test(raw)) { const parsedEpoch = new Date(Number(raw.length === 10 ? `${raw}000` : raw)); if (!Number.isNaN(parsedEpoch.getTime())) return cninfoShanghaiCalendarDate(parsedEpoch.toISOString()) } const parsed = new Date(raw); if (!Number.isNaN(parsed.getTime())) return cninfoShanghaiCalendarDate(parsed.toISOString()) } return undefined }
function finite(value: unknown): number | undefined { if (typeof value === 'number') return Number.isFinite(value) ? value : undefined; if (typeof value !== 'string' || value.trim() === '') return undefined; const parsed = Number(value.replace(/,/g, '').trim()); return Number.isFinite(parsed) ? parsed : undefined }
function closeValue(row: Row): number | undefined { for (const key of ['close', '收盘', '收盘价', 'value', '值']) { const value = finite(row[key]); if (value !== undefined) return value } return undefined }
function stable(value: unknown): string { if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`; if (typeof value === 'object' && value !== null) return `{${Object.keys(value as Row).sort().map((key) => `${JSON.stringify(key)}:${stable((value as Row)[key])}`).join(',')}}`; return JSON.stringify(value) }
function shanghaiParts(asOf: string): { readonly date: string; readonly minutes: number } | undefined {
  const instant = new Date(asOf)
  if (Number.isNaN(instant.getTime())) return undefined
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(instant)
  const value = Object.fromEntries(parts.filter((item) => item.type !== 'literal').map((item) => [item.type, item.value]))
  const date = `${value.year}-${value.month}-${value.day}`
  const hour = Number(value.hour); const minute = Number(value.minute)
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isInteger(hour) && Number.isInteger(minute) ? { date, minutes: hour * 60 + minute } : undefined
}
export function marketSameDayCloseEligible(asOf: string): boolean {
  const cutoff = shanghaiParts(asOf)
  return cutoff !== undefined && cutoff.minutes >= 15 * 60
}
export function marketShanghaiCalendarDate(asOf: string): string | undefined { return shanghaiParts(asOf)?.date }
function tradeDateEligible(tradeDate: string, asOf: string): boolean {
  const cutoff = shanghaiParts(asOf)
  if (!cutoff) return false
  return tradeDate < cutoff.date || (tradeDate === cutoff.date && marketSameDayCloseEligible(asOf))
}
function selectedIndexRow(value: unknown, asOf: string): { readonly date: string; readonly close: number; readonly raw: Row } {
  const eligible = rows(value).flatMap((row) => { const date = dateOnly(row); const close = closeValue(row); return date !== undefined && close !== undefined && tradeDateEligible(date, asOf) ? [{ date, close, raw: row }] : [] })
  if (!eligible.length) { if (rows(value).some((row) => dateOnly(row) === undefined)) throw new Error('MARKET_TRADE_DATE_MISSING'); throw new Error('MARKET_NO_ELIGIBLE_TRADE_DATE') }
  return eligible.sort((left, right) => right.date.localeCompare(left.date) || stable(left.raw).localeCompare(stable(right.raw)))[0]!
}
function candidateFor(symbol: string, selected: { readonly date: string; readonly close: number; readonly raw: Row }, dataKind: string, asOf: string): ResearchSourceCandidate {
  const endpoint = INDEX_BY_CODE.get(symbol); const metric = dataKind === 'company-daily' ? 'security_close' : 'index_close'; const identity = `akshare:${dataKind}:${symbol}:${metric}:${selected.date}:${selected.close}`
  return { candidateId: `akshare-market-${sha256(identity).slice(0, 24)}`, kind: 'structured_data', tier: 2, title: `${endpoint?.name ?? symbol} daily close ${selected.date}`, provider: 'akshare', metadata: { endpoint: symbol, indexCode: endpoint?.indexCode, providerSymbol: endpoint?.providerSymbol ?? symbol, dataKind, metric, value: selected.close, unit: 'index_points', observationDate: selected.date, analysisAsOf: asOf, sameDayCloseEligible: marketSameDayCloseEligible(asOf), providerObjectId: identity, dailySignalKind: 'market', dailySignalCategory: 'market', originPublisher: 'Sina Finance', sourceAuthority: 'S3_AGGREGATOR', retrievalProvider: 'AKShare' } }
}

export class AkshareDailyMarketAcquisition implements ResearchAcquisitionPlugin {
  readonly name = 'akshare-daily-market-acquisition'; readonly dailyScope = 'broad' as const
  constructor(private readonly client: AkshareDataClient, private readonly now: () => string = () => new Date().toISOString()) {}
  async discover(request: ResearchAcquisitionRequest): Promise<readonly ResearchSourceCandidate[]> { if (!request.company || request.asOf === undefined) return []; const endpoints = request.company.symbol === 'BROAD_SCOPE' ? INDEXES : [{ indexCode: request.company.symbol, providerSymbol: request.company.symbol, name: request.company.symbol }]; return endpoints.map((endpoint) => ({ candidateId: `akshare-market-request-${sha256(endpoint.indexCode).slice(0, 16)}`, kind: 'structured_data' as const, tier: 2 as const, title: `${endpoint.name} daily observation`, provider: 'akshare', metadata: { endpoint: endpoint.indexCode, indexCode: endpoint.indexCode, providerSymbol: endpoint.providerSymbol, dataKind: request.company?.symbol === 'BROAD_SCOPE' ? 'index-daily' : 'company-daily', asOf: request.asOf } })) }
  async fetch(candidate: ResearchSourceCandidate): Promise<ResearchFetchedSource> {
    const symbol = String(candidate.metadata?.endpoint ?? ''); const asOf = String(candidate.metadata?.asOf ?? '')
    const providerEndDate = marketShanghaiCalendarDate(asOf)
    if (providerEndDate === undefined) throw new Error('MARKET_REQUEST_INVALID')
    const dataKind = String(candidate.metadata?.dataKind ?? 'index-daily'); const operation = dataKind === 'company-daily' ? this.client.historicalMarketData : this.client.indexDaily
    if (operation === undefined) throw new Error(dataKind === 'company-daily' ? 'AKSHARE_HISTORICAL_MARKET_UNAVAILABLE' : 'AKSHARE_INDEX_DAILY_UNAVAILABLE')
    const providerSymbol = String(candidate.metadata?.providerSymbol ?? symbol); const value = await operation.call(this.client, { symbol: providerSymbol, endDate: providerEndDate }); const selected = selectedIndexRow(value, asOf); const sourceCandidate = candidateFor(symbol, selected, dataKind, asOf)
    const metric = dataKind === 'company-daily' ? 'security_close' : 'index_close'; const content = JSON.stringify({ endpoint: symbol, providerSymbol, metric, value: selected.close, unit: 'index_points', observationDate: selected.date, raw: selected.raw })
    return { candidate: sourceCandidate, retrievedAt: this.now(), content, rawBytes: new TextEncoder().encode(content), mediaType: 'application/json', contentType: 'application/json', contentHash: sha256(content) }
  }
  async normalize(source: ResearchFetchedSource): Promise<NormalizedResearchSource> { return { candidate: source.candidate, retrievedAt: source.retrievedAt, title: source.candidate.title, content: source.content, canonicalUrl: undefined, contentHash: source.contentHash ?? sha256(source.content), rawBytes: source.rawBytes, publisher: 'Sina Finance', rights: { accessScope: 'public', retentionAllowed: true, aiProcessingAllowed: true, derivativeKnowledgeAllowed: true, redistributionAllowed: false, policyBasis: 'personal_noncommercial_research' } } }
}
