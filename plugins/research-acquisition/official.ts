import type { ResearchAcquisitionPlugin, ResearchAcquisitionRequest, ResearchCompanyIdentity, ResearchFetchedSource, ResearchSourceCandidate, NormalizedResearchSource } from './contracts.ts'
import { sha256 } from './hash.ts'
import { DocumentInputResolver } from '../document/input-resolver.ts'

export interface OfficialDisclosureRecord { readonly title: string; readonly url: string; readonly publishedAt: string; readonly issuer?: string; readonly content?: string }
export interface OfficialDisclosureDocument { readonly content: string; readonly bytes: Uint8Array; readonly mediaType: string }
export interface OfficialDisclosureClient { list(request: ResearchAcquisitionRequest): Promise<readonly OfficialDisclosureRecord[]>; listManagementCommunication?(request: { readonly company: ResearchCompanyIdentity; readonly lookbackStartDate: string; readonly asOf: string }): Promise<readonly OfficialDisclosureRecord[]>; listIndustry?(request: Extract<ResearchAcquisitionRequest, { industry: unknown }>): Promise<readonly OfficialDisclosureRecord[]>; fetch(record: OfficialDisclosureRecord): Promise<string>; fetchDocument?(record: OfficialDisclosureRecord): Promise<OfficialDisclosureDocument> }
export interface CninfoOfficialDisclosureClientOptions { readonly fetchImpl?: typeof fetch; readonly endpoint?: string; readonly pageSize?: number; readonly industryPageSize?: number; readonly timeoutMs?: number; readonly documentResolver?: Pick<DocumentInputResolver, 'parse'> }
export class CninfoOfficialDisclosureClient implements OfficialDisclosureClient {
  private readonly fetchImpl: typeof fetch
  private readonly endpoint: string
  private readonly pageSize: number
  private readonly industryPageSize: number
  private readonly timeoutMs: number
  private readonly documentResolver: Pick<DocumentInputResolver, 'parse'>
  constructor(options: CninfoOfficialDisclosureClientOptions = {}) { this.fetchImpl = options.fetchImpl ?? fetch; this.endpoint = options.endpoint ?? 'https://www.cninfo.com.cn/new/hisAnnouncement/query'; this.pageSize = Math.min(100, Math.max(1, options.pageSize ?? 20)); this.industryPageSize = Math.min(30, Math.max(1, options.industryPageSize ?? 10)); this.timeoutMs = Math.min(20_000, Math.max(1, options.timeoutMs ?? 15_000)); this.documentResolver = options.documentResolver ?? new DocumentInputResolver() }
  private async request(input: string, init: RequestInit = {}): Promise<Response> { const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), this.timeoutMs); try { return await this.fetchImpl(input, { ...init, signal: controller.signal }) } finally { clearTimeout(timer) } }
  private static record(row: unknown): OfficialDisclosureRecord | undefined { if (!row || typeof row !== 'object') return undefined; const value = row as Record<string, unknown>; const title = typeof value.announcementTitle === 'string' ? value.announcementTitle.replace(/<[^>]+>/g, '').trim() : typeof value.title === 'string' ? value.title.trim() : ''; const adjunctUrl = typeof value.adjunctUrl === 'string' ? value.adjunctUrl : ''; const url = adjunctUrl.startsWith('http') ? adjunctUrl : adjunctUrl ? `https://static.cninfo.com.cn/${adjunctUrl.replace(/^\/+/, '')}` : ''; const rawDate = value.announcementTime; let date: Date | undefined; if (typeof rawDate === 'number' || (typeof rawDate === 'string' && /^\d{10,13}$/.test(rawDate))) { const timestamp = Number(rawDate); if (Number.isFinite(timestamp)) date = new Date(timestamp) } else if (typeof rawDate === 'string' && !Number.isNaN(Date.parse(rawDate))) date = new Date(rawDate); const parsedDate = date && !Number.isNaN(date.getTime()) ? date.toISOString() : ''; if (!title || !url || !parsedDate || !validCninfoUrl(url)) return undefined; return { title, url, publishedAt: parsedDate, issuer: typeof value.secName === 'string' ? value.secName : undefined } }
  async list(request: ResearchAcquisitionRequest): Promise<readonly OfficialDisclosureRecord[]> {
    if ('industry' in request) return []
    const exchange = request.company.exchange?.toLowerCase(); const column = exchange === 'sse' || exchange === 'szse' ? exchange : request.company.symbol.startsWith('6') ? 'sse' : 'szse'
    const exact = await this.queryAnnouncements({ stock: request.company.symbol, searchkey: '', pageNum: '1', pageSize: String(this.pageSize), tabName: 'fulltext', column }, request.asOf)
    if (exact.length > 0 || !request.company.name) return exact
    return this.queryAnnouncements({ stock: '', searchkey: request.company.name, pageNum: '1', pageSize: String(this.pageSize), tabName: 'fulltext', column }, request.asOf)
  }
  async listManagementCommunication(request: { readonly company: ResearchCompanyIdentity; readonly lookbackStartDate: string; readonly asOf: string }): Promise<readonly OfficialDisclosureRecord[]> {
    const exchange = request.company.exchange?.toLowerCase(); const column = exchange === 'sse' || exchange === 'szse' ? exchange : request.company.symbol.startsWith('6') ? 'sse' : 'szse'
    const terms = ['投资者关系活动记录', '业绩说明会召开情况', '业绩说明会活动记录', '业绩说明会投资者问答']
    const records = new Map<string, OfficialDisclosureRecord>()
    for (const searchkey of terms) {
      const matches = await this.queryAnnouncements({ stock: request.company.symbol, searchkey, pageNum: '1', pageSize: String(this.pageSize), tabName: 'fulltext', column, seDate: `${request.lookbackStartDate}~${request.asOf.slice(0, 10)}` }, request.asOf)
      for (const record of matches) records.set(record.url, record)
    }
    return [...records.values()].sort((left, right) => left.publishedAt.localeCompare(right.publishedAt) || left.url.localeCompare(right.url))
  }
  async listIndustry(request: Extract<ResearchAcquisitionRequest, { industry: unknown }>): Promise<readonly OfficialDisclosureRecord[]> {
    const terms = [...new Set([request.industry.name, ...(request.industry.aliases ?? []), ...request.industry.searchTerms].map((term) => term.normalize('NFKC').replace(/\s+/g, ' ').trim()).filter((term) => term.length >= 2))].slice(0, 4)
    const records = new Map<string, OfficialDisclosureRecord>()
    for (const column of ['szse', 'sse']) for (const term of terms) {
      const form = new URLSearchParams({ pageNum: '1', pageSize: String(this.industryPageSize), column, tabName: 'fulltext', plate: '', stock: '', searchkey: term, secid: '', category: '', trade: '', seDate: `2000-01-01~${(request.asOf ?? new Date().toISOString()).slice(0, 10)}`, sortName: '', sortType: '', isHLtitle: 'true' })
      const response = await this.request(this.endpoint, { method: 'POST', headers: { accept: 'application/json', 'content-type': 'application/x-www-form-urlencoded', 'user-agent': 'ResearchHub/PersonalResearchV1' }, body: form }); if (!response.ok) throw new Error(`CNINFO Industry request failed with HTTP ${response.status}`); const payload = await response.json() as Record<string, unknown>; for (const row of Array.isArray(payload.announcements) ? payload.announcements : []) { const record = CninfoOfficialDisclosureClient.record(row); if (!record || (request.asOf && Date.parse(record.publishedAt) > Date.parse(request.asOf))) continue; records.set(record.url, record) }
    }
    return [...records.values()].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt) || a.url.localeCompare(b.url)).slice(0, this.industryPageSize)
  }
  async fetch(record: OfficialDisclosureRecord): Promise<string> {
    if (record.content) return record.content
    return (await this.fetchDocument(record)).content
  }
  async fetchDocument(record: OfficialDisclosureRecord): Promise<OfficialDisclosureDocument> {
    if (record.content) return { content: record.content, bytes: new TextEncoder().encode(record.content), mediaType: 'text/plain' }
    if (!validCninfoUrl(record.url)) throw new Error('CNINFO disclosure URL is outside the allowed domain')
    const response = await this.request(record.url, { headers: { accept: 'text/html, application/pdf' } })
    if (!response.ok) throw new Error(`CNINFO disclosure fetch failed with HTTP ${response.status}`)
    const bytes = new Uint8Array(await response.arrayBuffer())
    const mediaType = response.headers.get('content-type')?.split(';', 1)[0] ?? (record.url.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'text/html')
    const filename = record.url.toLowerCase().endsWith('.pdf') ? 'cninfo-disclosure.pdf' : 'cninfo-disclosure.html'
    const document = await this.documentResolver.parse({ bytes, filename, mediaType })
    return { content: document.normalizedText, bytes, mediaType }
  }
  private async queryAnnouncements(parameters: Record<string, string>, asOf?: string): Promise<readonly OfficialDisclosureRecord[]> {
    const form = new URLSearchParams(parameters)
    const response = await this.request(this.endpoint, { method: 'POST', headers: { accept: 'application/json', 'content-type': 'application/x-www-form-urlencoded', 'user-agent': 'ResearchHub/PersonalResearchV1' }, body: form })
    if (!response.ok) throw new Error(`CNINFO request failed with HTTP ${response.status}`)
    const payload = await response.json() as Record<string, unknown>
    const rows = Array.isArray(payload.announcements) ? payload.announcements : []
    return rows.flatMap((row) => {
      const record = CninfoOfficialDisclosureClient.record(row)
      return record && (asOf === undefined || Date.parse(record.publishedAt) <= Date.parse(asOf)) ? [record] : []
    })
  }
}
const validCninfoUrl = (value: unknown): value is string => { try { const url = new URL(String(value)); return url.protocol === 'https:' && (url.hostname === 'www.cninfo.com.cn' || url.hostname === 'static.cninfo.com.cn') } catch { return false } }
export class OfficialDisclosureResearchPlugin implements ResearchAcquisitionPlugin {
  readonly name = 'official-disclosure-research-acquisition'
  constructor(private readonly client: OfficialDisclosureClient, private readonly now: () => string = () => new Date().toISOString()) {}
  async discover(request: ResearchAcquisitionRequest): Promise<readonly ResearchSourceCandidate[]> { const limit = Math.min(20, Math.max(0, request.limitPerKind ?? 5)); if (request.industry !== undefined) { if (!this.client.listIndustry) return []; return (await this.client.listIndustry(request)).slice(0, limit).map((record) => ({ candidateId: `official-${sha256(record.url).slice(0, 16)}`, kind: 'official_disclosure', tier: 1, title: record.title, url: record.url, provider: 'cninfo', publishedAt: record.publishedAt, metadata: { industryTarget: request.industry.name, sourceAccountRef: 'cninfo:official-industry-disclosure', issuer: record.issuer } })) } return (await this.client.list(request)).slice(0, limit).map((record) => ({ candidateId: `official-${sha256(record.url).slice(0, 16)}`, kind: 'official_disclosure', tier: 1, title: record.title, url: record.url, provider: 'cninfo', publishedAt: record.publishedAt, metadata: { companySymbol: request.company.symbol, sourceAccountRef: 'cninfo:official-disclosure', issuer: record.issuer } })) }
  async fetch(candidate: ResearchSourceCandidate): Promise<ResearchFetchedSource> { const record: OfficialDisclosureRecord = { title: candidate.title, url: candidate.url!, publishedAt: candidate.publishedAt ?? this.now() }; const document = this.client.fetchDocument ? await this.client.fetchDocument(record) : undefined; const content = document?.content ?? await this.client.fetch(record); return { candidate, retrievedAt: this.now(), content, contentHash: sha256(content), ...(document === undefined ? {} : { rawBytes: document.bytes, mediaType: document.mediaType }) } }
  async normalize(source: ResearchFetchedSource): Promise<NormalizedResearchSource> { return { candidate: source.candidate, retrievedAt: source.retrievedAt, title: source.candidate.title, content: source.content, contentHash: source.contentHash ?? sha256(source.content), ...(source.rawBytes === undefined ? {} : { rawBytes: Uint8Array.from(source.rawBytes) }), canonicalUrl: source.candidate.url, publisher: source.candidate.provider, rights: { accessScope: 'public', retentionAllowed: true, aiProcessingAllowed: true, derivativeKnowledgeAllowed: true, redistributionAllowed: false } } }
}
