import { sha256 } from '../research-acquisition/hash.ts'
import type { AkshareDataClient } from '../research-acquisition/akshare.ts'
import type { ResearchAcquisitionPlugin, ResearchAcquisitionRequest, ResearchFetchedSource, ResearchSourceCandidate, NormalizedResearchSource } from '../research-acquisition/contracts.ts'

type Row = Record<string, unknown>
const INDEXES = ['000001', '399001', '399006', '000688'] as const
const INDEX_NAMES: Readonly<Record<string, string>> = { '000001': 'SSE Composite Index', '399001': 'SZSE Component Index', '399006': 'ChiNext Index', '000688': 'STAR Market Index' }

function rows(value: unknown): readonly Row[] { if (Array.isArray(value)) return value.filter((item): item is Row => typeof item === 'object' && item !== null && !Array.isArray(item)); if (typeof value === 'object' && value !== null && Array.isArray((value as Row).data)) return rows((value as Row).data); return [] }
function text(value: unknown): string | undefined { if (typeof value !== 'string' && typeof value !== 'number') return undefined; const result = String(value).trim(); return result || undefined }
function dateOnly(row: Row): string | undefined { for (const key of ['date', '日期', 'trade_date', '交易日期', 'datetime', '时间']) { const raw = text(row[key]); if (!raw) continue; const match = /^(\d{4}-\d{2}-\d{2})/.exec(raw.replace(/\//g, '-')); if (match) return match[1]; const parsed = new Date(raw); if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10) } return undefined }
function finite(value: unknown): number | undefined { if (typeof value === 'number') return Number.isFinite(value) ? value : undefined; if (typeof value !== 'string' || value.trim() === '') return undefined; const parsed = Number(value.replace(/,/g, '').trim()); return Number.isFinite(parsed) ? parsed : undefined }
function closeValue(row: Row): number | undefined { for (const key of ['close', '收盘', '收盘价', 'value', '值']) { const value = finite(row[key]); if (value !== undefined) return value } return undefined }
function stable(value: unknown): string { if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`; if (typeof value === 'object' && value !== null) return `{${Object.keys(value as Row).sort().map((key) => `${JSON.stringify(key)}:${stable((value as Row)[key])}`).join(',')}}`; return JSON.stringify(value) }
function selectedIndexRow(value: unknown, asOf: string): { readonly date: string; readonly close: number; readonly raw: Row } {
  const cutoff = asOf.slice(0, 10); const eligible = rows(value).flatMap((row) => { const date = dateOnly(row); const close = closeValue(row); return date !== undefined && close !== undefined && date <= cutoff ? [{ date, close, raw: row }] : [] })
  if (!eligible.length) { if (rows(value).some((row) => dateOnly(row) === undefined)) throw new Error('MARKET_TRADE_DATE_MISSING'); throw new Error('MARKET_NO_ELIGIBLE_TRADE_DATE') }
  return eligible.sort((left, right) => right.date.localeCompare(left.date) || stable(left.raw).localeCompare(stable(right.raw)))[0]!
}
function candidateFor(symbol: string, selected: { readonly date: string; readonly close: number; readonly raw: Row }, dataKind: string): ResearchSourceCandidate {
  const metric = dataKind === 'company-daily' ? 'security_close' : 'index_close'; const identity = `akshare:${dataKind}:${symbol}:close:${selected.date}:${selected.close}`
  return { candidateId: `akshare-market-${sha256(identity).slice(0, 24)}`, kind: 'structured_data', tier: 2, title: `${INDEX_NAMES[symbol] ?? symbol} daily close ${selected.date}`, provider: 'akshare', metadata: { endpoint: symbol, dataKind, metric, value: selected.close, unit: 'index_points', observationDate: selected.date, providerObjectId: identity, dailySignalKind: 'market', dailySignalCategory: 'market', originPublisher: 'AKShare public data interface', sourceAuthority: 'S3_AGGREGATOR', retrievalProvider: 'AKShare' } }
}

export class AkshareDailyMarketAcquisition implements ResearchAcquisitionPlugin {
  readonly name = 'akshare-daily-market-acquisition'; readonly dailyScope = 'broad' as const
  constructor(private readonly client: AkshareDataClient, private readonly now: () => string = () => new Date().toISOString()) {}
  async discover(request: ResearchAcquisitionRequest): Promise<readonly ResearchSourceCandidate[]> { if (!request.company || request.asOf === undefined) return []; const symbols = request.company.symbol === 'BROAD_SCOPE' ? INDEXES : [request.company.symbol]; return symbols.map((symbol) => ({ candidateId: `akshare-market-request-${sha256(symbol).slice(0, 16)}`, kind: 'structured_data' as const, tier: 2 as const, title: `${INDEX_NAMES[symbol] ?? symbol} daily observation`, provider: 'akshare', metadata: { endpoint: symbol, dataKind: symbol === 'BROAD_SCOPE' ? 'index-daily' : request.company?.symbol === 'BROAD_SCOPE' ? 'index-daily' : 'company-daily', asOf: request.asOf } })) }
  async fetch(candidate: ResearchSourceCandidate): Promise<ResearchFetchedSource> {
    const symbol = String(candidate.metadata?.endpoint ?? ''); const asOf = String(candidate.metadata?.asOf ?? '')
    if (!/^\d{4}-\d{2}-\d{2}/.test(asOf)) throw new Error('MARKET_REQUEST_INVALID')
    const dataKind = String(candidate.metadata?.dataKind ?? 'index-daily'); const operation = dataKind === 'company-daily' ? this.client.historicalMarketData : this.client.indexDaily
    if (operation === undefined) throw new Error(dataKind === 'company-daily' ? 'AKSHARE_HISTORICAL_MARKET_UNAVAILABLE' : 'AKSHARE_INDEX_DAILY_UNAVAILABLE')
    const value = await operation.call(this.client, { symbol, endDate: asOf.slice(0, 10) }); const selected = selectedIndexRow(value, asOf); const sourceCandidate = candidateFor(symbol, selected, dataKind)
    const metric = dataKind === 'company-daily' ? 'security_close' : 'index_close'; const content = JSON.stringify({ endpoint: symbol, metric, value: selected.close, unit: 'index_points', observationDate: selected.date, raw: selected.raw })
    return { candidate: sourceCandidate, retrievedAt: this.now(), content, rawBytes: new TextEncoder().encode(content), mediaType: 'application/json', contentType: 'application/json', contentHash: sha256(content) }
  }
  async normalize(source: ResearchFetchedSource): Promise<NormalizedResearchSource> { return { candidate: source.candidate, retrievedAt: source.retrievedAt, title: source.candidate.title, content: source.content, canonicalUrl: undefined, contentHash: source.contentHash ?? sha256(source.content), rawBytes: source.rawBytes, publisher: 'AKShare public data interface', rights: { accessScope: 'public', retentionAllowed: true, aiProcessingAllowed: true, derivativeKnowledgeAllowed: true, redistributionAllowed: false, policyBasis: 'personal_noncommercial_research' } } }
}
