import { sha256 } from '../research-acquisition/hash.ts'
import type { AkshareDataClient } from '../research-acquisition/akshare.ts'
import { cninfoShanghaiCalendarDate, cninfoShanghaiLookbackDate } from '../research-acquisition/official.ts'
import type { ResearchAcquisitionPlugin, ResearchAcquisitionRequest, ResearchFetchedSource, ResearchSourceCandidate, NormalizedResearchSource } from '../research-acquisition/contracts.ts'

type Row = Record<string, unknown>
export interface InstitutionalActivityTelemetry { readonly lookbackStart: string; readonly providerRequestDate: string; readonly rowsReturned: number; readonly rowsPitRejected: number; readonly rowsAccepted: number; readonly rowsLimitDropped: number }
function rows(value: unknown): readonly Row[] { if (Array.isArray(value)) return value.filter((item): item is Row => typeof item === 'object' && item !== null && !Array.isArray(item)); if (typeof value === 'object' && value !== null && Array.isArray((value as Row).data)) return rows((value as Row).data); return [] }
function text(row: Row, keys: readonly string[]): string | undefined { for (const key of keys) { const value = row[key]; if (typeof value !== 'string' && typeof value !== 'number') continue; const result = String(value).trim(); if (result) return result } return undefined }
function date(value: string | undefined): string | undefined { if (!value) return undefined; const compact = /^(\d{4})(\d{2})(\d{2})$/.exec(value); if (compact) return `${compact[1]}-${compact[2]}-${compact[3]}`; const match = /^(\d{4}-\d{2}-\d{2})/.exec(value.replace(/\//g, '-')); if (match) return match[1]; if (/^\d{10,13}$/.test(value)) { const parsedEpoch = new Date(Number(value.length === 10 ? `${value}000` : value)); return Number.isNaN(parsedEpoch.getTime()) ? undefined : cninfoShanghaiCalendarDate(parsedEpoch.toISOString()) } const parsed = new Date(value); return Number.isNaN(parsed.getTime()) ? undefined : cninfoShanghaiCalendarDate(parsed.toISOString()) }
function stable(value: unknown): string { if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`; if (typeof value === 'object' && value !== null) return `{${Object.keys(value as Row).sort().map((key) => `${JSON.stringify(key)}:${stable((value as Row)[key])}`).join(',')}}`; return JSON.stringify(value) }
function dateOnlyAsShanghai(value: string): string { return cninfoShanghaiCalendarDate(value) }
function publicationAtShanghaiEndOfDay(publicationDate: string): string { return new Date(`${publicationDate}T23:59:59.999+08:00`).toISOString() }
function candidateFor(row: Row, index: number, analysisAsOf: string): ResearchSourceCandidate | undefined {
  const symbol = text(row, ['证券代码', '股票代码', '代码', 'symbol', 'companySymbol']); const company = text(row, ['证券简称', '股票简称', '公司名称', '名称', '公司', 'companyName']); const institution = text(row, ['机构名称', '调研机构', '机构', 'institutionName', 'institution']); const eventDate = date(text(row, ['调研日期', '接待日期', '活动日期', '日期', 'eventDate']))
  if (!symbol && !company) return undefined
  if (!eventDate) return undefined
  const publicationDate = date(text(row, ['公告日期', '发布日期', '发布时间', 'publishedAt']))
  const cutoff = dateOnlyAsShanghai(analysisAsOf)
  if (eventDate > cutoff || (publicationDate !== undefined && Date.parse(publicationAtShanghaiEndOfDay(publicationDate)) > Date.parse(analysisAsOf))) return undefined
  const identity = `akshare:institutional:${symbol ?? company}:${institution ?? 'unknown'}:${eventDate}:${publicationDate ?? 'unknown'}:${sha256(stable(row)).slice(0, 16)}`
  return { candidateId: `institutional-activity-${sha256(identity).slice(0, 24)}`, kind: 'web_article', tier: 3, title: `${company ?? symbol ?? 'Company'} institutional activity ${eventDate}`, provider: 'akshare-institutional', ...(publicationDate === undefined ? {} : { publishedAt: publicationAtShanghaiEndOfDay(publicationDate) }), metadata: { companySymbol: symbol, companyName: company, institutionName: institution, eventDate, publicationDate, providerObjectId: identity, dailySignalKind: 'institutional_activity', dailySignalCategory: 'institutional_activity', originPublisher: 'EastMoney', sourceAuthority: 'S3_AGGREGATOR', retrievalProvider: 'AKShare', activityType: 'institutional_research_activity', rowIndex: index } }
}

export class AkshareInstitutionalActivityAcquisition implements ResearchAcquisitionPlugin {
  readonly name = 'akshare-institutional-activity'; readonly dailyScope = 'broad' as const
  lastTelemetry: InstitutionalActivityTelemetry | undefined
  private readonly cache = new Map<string, { readonly candidate: ResearchSourceCandidate; readonly content: string }>()
  constructor(private readonly client: AkshareDataClient, private readonly now: () => string = () => new Date().toISOString()) {}
  async discover(request: ResearchAcquisitionRequest): Promise<readonly ResearchSourceCandidate[]> {
    if (!request.company || request.company.symbol !== 'BROAD_SCOPE' || request.asOf === undefined) return []
    if (this.client.institutionalResearchDetail === undefined) throw new Error('INSTITUTIONAL_ACTIVITY_UNAVAILABLE')
    const lookbackStart = cninfoShanghaiLookbackDate(request.asOf, 7); const providerRequestDate = lookbackStart.replace(/-/g, ''); const value = await this.client.institutionalResearchDetail({ date: providerRequestDate }); const returnedRows = rows(value); const candidates: ResearchSourceCandidate[] = []; const seen = new Set<string>(); const limit = Math.min(request.limitPerKind ?? 30, 30); let rejected = 0; let limitDropped = 0
    for (const [index, row] of returnedRows.entries()) { const candidate = candidateFor(row, index, request.asOf); if (!candidate || seen.has(candidate.candidateId)) { rejected += 1; continue } if (candidates.length >= limit) { limitDropped += 1; continue } seen.add(candidate.candidateId); const content = JSON.stringify({ activity: 'institutional_research_activity', lookbackStart, providerRequestDate, row }); this.cache.set(candidate.candidateId, { candidate, content }); candidates.push(candidate) }
    this.lastTelemetry = { lookbackStart, providerRequestDate, rowsReturned: returnedRows.length, rowsPitRejected: rejected, rowsAccepted: candidates.length, rowsLimitDropped: limitDropped }
    return candidates
  }
  async fetch(candidate: ResearchSourceCandidate): Promise<ResearchFetchedSource> { const cached = this.cache.get(candidate.candidateId); if (!cached) throw new Error('INSTITUTIONAL_ACTIVITY_CANDIDATE_NOT_CACHED'); const rawBytes = new TextEncoder().encode(cached.content); return { candidate: cached.candidate, retrievedAt: this.now(), content: cached.content, rawBytes, mediaType: 'application/json', contentType: 'application/json', contentHash: sha256(cached.content) } }
  async normalize(source: ResearchFetchedSource): Promise<NormalizedResearchSource> { return { candidate: source.candidate, retrievedAt: source.retrievedAt, title: source.candidate.title, content: source.content, contentHash: source.contentHash ?? sha256(source.content), rawBytes: source.rawBytes, publisher: 'EastMoney', rights: { accessScope: 'public', retentionAllowed: true, aiProcessingAllowed: true, derivativeKnowledgeAllowed: true, redistributionAllowed: false, policyBasis: 'personal_noncommercial_research' } } }
}
