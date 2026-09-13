import { sha256 } from './hash.ts'
import { DocumentInputResolver } from '../document/input-resolver.ts'
import type { NormalizedResearchSource, ResearchAcquisitionPlugin, ResearchAcquisitionRequest, ResearchFetchedSource, ResearchSourceCandidate } from './contracts.ts'

export interface CpcaIndustryResearchPluginOptions {
  readonly fetchImpl?: typeof fetch
  readonly now?: () => string
  readonly timeoutMs?: number
  readonly maxListPayloadBytes?: number
  readonly maxDocumentPayloadBytes?: number
  readonly documentResolver?: Pick<DocumentInputResolver, 'parse'>
  readonly routes?: readonly string[]
}

const PROVIDER = 'cpca'
const NAME = 'cpca-industry-research-acquisition'
const PUBLISHER = 'China Printed Circuit Association'
export const CPCA_INDUSTRY_ROUTES = ['https://www.cpca.org.cn/industry-287.html', 'https://www.cpca.org.cn/industry-279.html', 'https://www.cpca.org.cn/industry.html'] as const
const MAX_ROUTES = 3
const MAX_PAGES = 2
const MAX_CANDIDATES = 8
const TRACKING = new Set(['spm', 'from', 'source', 'share', 'utm_source', 'utm_medium', 'utm_campaign'])
const RESTRICTED = /登录|会员|购买|订阅|付费|验证码|captcha|subscription|member.?login|sign.?in|purchase/i
const GENERIC = new Set(['industry', 'manufacturing', '行业', '产业', '制造业'])

const clean = (value: string, max = 1200) => value.normalize('NFKC').replace(/\s+/g, ' ').trim().slice(0, max)
const terms = (request: Extract<ResearchAcquisitionRequest, { industry: unknown }>) => [...new Set([request.industry.name, ...(request.industry.aliases ?? []), ...request.industry.searchTerms].map((x) => clean(x)).filter(Boolean))].filter((x) => !GENERIC.has(x.toLocaleLowerCase()))
const canonical = (value: string) => { const url = new URL(value); url.hash = ''; for (const key of [...url.searchParams.keys()]) if (TRACKING.has(key.toLocaleLowerCase())) url.searchParams.delete(key); return url.toString() }
export const validCpcaUrl = (value: unknown): value is string => { try { const url = new URL(String(value)); return url.protocol === 'https:' && (url.hostname === 'cpca.org.cn' || url.hostname === 'www.cpca.org.cn') } catch { return false } }
const dateValue = (value: string) => { const match = value.match(/20\d{2}(?:年|[-/.])\d{1,2}(?:月|[-/.])\d{1,2}日?/); if (!match) return undefined; const parsed = new Date(match[0].replace(/年|月|日/g, '-').replace(/[/.]/g, '-').replace(/-+$/, '')); return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString() }
const score = (title: string, snippet: string | undefined, searchTerms: readonly string[]) => searchTerms.reduce((n, term) => n + (title.toLocaleLowerCase().includes(term.toLocaleLowerCase()) ? 3 : 0) + (snippet?.toLocaleLowerCase().includes(term.toLocaleLowerCase()) ? 1 : 0), 0)
const attachment = (url: string) => /\.(pdf|docx?|xlsx?|pptx?)($|[?#])/i.test(url)

type Row = { title: string; url: string; snippet?: string; publishedAt?: string; isAttachment: boolean }
function parseList(html: string, baseUrl: string): { rows: Row[]; next: string[] } {
  const rows: Row[] = []; const next: string[] = []; const re = /<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi; let match: RegExpExecArray | null
  while ((match = re.exec(html))) {
    const title = clean(match[2]!.replace(/<[^>]+>/g, '')); let url: string
    try { url = canonical(new URL(match[1]!.trim(), baseUrl).toString()) } catch { continue }
    if (!title || !validCpcaUrl(url)) continue
    const context = clean(html.slice(Math.max(0, match.index - 260), Math.min(html.length, re.lastIndex + 260)))
    if (/下一页|下页|next|page\s*2|page=2/i.test(`${title} ${match[1]}`)) next.push(url)
    else rows.push({ title, url, snippet: context, publishedAt: dateValue(context), isAttachment: attachment(url) })
  }
  return { rows, next }
}

async function bounded(response: Response, maximum: number): Promise<Uint8Array> {
  if (!response.body) { const bytes = new TextEncoder().encode(await response.text()); if (bytes.byteLength > maximum) throw new Error('CPCA payload exceeds bound'); return bytes }
  const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let size = 0
  while (true) { const part = await reader.read(); if (part.done) break; size += part.value.byteLength; if (size > maximum) { await reader.cancel(); throw new Error('CPCA payload exceeds bound') } chunks.push(part.value) }
  const bytes = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength } return bytes
}

export class CpcaIndustryResearchPlugin implements ResearchAcquisitionPlugin {
  readonly name = NAME
  private readonly fetchImpl: typeof fetch
  private readonly now: () => string
  private readonly timeoutMs: number
  private readonly listMax: number
  private readonly documentMax: number
  private readonly resolver: Pick<DocumentInputResolver, 'parse'>
  private readonly routes: readonly string[]
  constructor(options: CpcaIndustryResearchPluginOptions = {}) { this.fetchImpl = options.fetchImpl ?? fetch; this.now = options.now ?? (() => new Date().toISOString()); this.timeoutMs = Math.min(20_000, Math.max(1, options.timeoutMs ?? 15_000)); this.listMax = Math.min(2 * 1024 * 1024, options.maxListPayloadBytes ?? 2 * 1024 * 1024); this.documentMax = Math.min(8 * 1024 * 1024, options.maxDocumentPayloadBytes ?? 8 * 1024 * 1024); this.resolver = options.documentResolver ?? new DocumentInputResolver(); this.routes = (options.routes ?? CPCA_INDUSTRY_ROUTES).slice(0, MAX_ROUTES).filter(validCpcaUrl) }
  private async request(url: string, maximum: number, accept: string) { if (!validCpcaUrl(url)) throw new Error('CPCA URL is outside the allowed domain'); const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), this.timeoutMs); try { const response = await this.fetchImpl(url, { signal: controller.signal, headers: { accept } }); const finalUrl = canonical(response.url || url); if (!validCpcaUrl(finalUrl)) throw new Error('CPCA redirect crossed domain boundary'); if (!response.ok) throw new Error(`CPCA request failed with HTTP ${response.status}`); return { response, finalUrl, bytes: await bounded(response, maximum) } } finally { clearTimeout(timer) } }
  async discover(request: ResearchAcquisitionRequest): Promise<readonly ResearchSourceCandidate[]> {
    if ('company' in request) return []
    const searchTerms = terms(request); if (!searchTerms.length) return []
    const found = new Map<string, ResearchSourceCandidate>()
    for (const route of this.routes) { let page = route; const visited = new Set<string>(); const routeHost = new URL(route).hostname
      for (let pageIndex = 0; pageIndex < MAX_PAGES && page; pageIndex++) { if (visited.has(page)) break; visited.add(page); const result = await this.request(page, this.listMax, 'text/html,application/xhtml+xml'); const parsed = parseList(new TextDecoder().decode(result.bytes), result.finalUrl)
        for (const row of parsed.rows) { const relevance = score(row.title, row.snippet, searchTerms); if (!relevance || (row.publishedAt && request.asOf && row.publishedAt > new Date(request.asOf).toISOString())) continue; const candidate: ResearchSourceCandidate = { candidateId: `${PROVIDER}-${sha256(row.url)}`, kind: 'web_article', tier: 4, title: row.title, url: row.url, provider: PROVIDER, ...(row.publishedAt ? { publishedAt: row.publishedAt } : {}), snippet: row.snippet, metadata: { discoveryRoute: new URL(route).pathname, relevanceTerms: searchTerms.filter((term) => `${row.title} ${row.snippet ?? ''}`.toLocaleLowerCase().includes(term.toLocaleLowerCase())), isAttachment: row.isAttachment } }; found.set(row.url, candidate) }
        page = parsed.next.find((value) => validCpcaUrl(value) && new URL(value).hostname === routeHost) ?? ''
      }
    }
    return [...found.values()].sort((a, b) => score(b.title, b.snippet, searchTerms) - score(a.title, a.snippet, searchTerms) || (b.publishedAt ?? '').localeCompare(a.publishedAt ?? '') || (a.url ?? '').localeCompare(b.url ?? '')).slice(0, Math.min(MAX_CANDIDATES, Math.max(0, request.limitPerKind ?? 6)))
  }
  async fetch(candidate: ResearchSourceCandidate): Promise<ResearchFetchedSource> {
    if (candidate.provider !== PROVIDER || candidate.tier !== 4 || !candidate.url || !validCpcaUrl(candidate.url) || candidate.candidateId !== `${PROVIDER}-${sha256(canonical(candidate.url))}`) throw new Error('candidate does not belong to CPCA')
    const result = await this.request(canonical(candidate.url), this.documentMax, 'text/html,application/xhtml+xml,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document')
    const contentType = (result.response.headers.get('content-type') ?? '').split(';')[0].toLocaleLowerCase(); const isPdf = contentType === 'application/pdf' || result.finalUrl.toLocaleLowerCase().includes('.pdf'); const allowed = isPdf || ['text/html', 'application/xhtml+xml', 'application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', ''].includes(contentType); if (!allowed) throw new Error(`CPCA unsupported content type: ${contentType}`)
    const content = new TextDecoder().decode(result.bytes); if (RESTRICTED.test(content.slice(0, 120_000)) || RESTRICTED.test(candidate.title)) throw new Error('CPCA content is restricted or teaser-only')
    return { candidate: { ...candidate, url: result.finalUrl }, retrievedAt: this.now(), content, contentType, mediaType: isPdf ? 'application/pdf' : contentType || 'text/html', rawBytes: result.bytes, contentHash: sha256(result.bytes) }
  }
  async normalize(source: ResearchFetchedSource): Promise<NormalizedResearchSource> {
    if (source.candidate.provider !== PROVIDER || source.candidate.tier !== 4 || !source.rawBytes?.byteLength || !source.candidate.url || !validCpcaUrl(source.candidate.url)) throw new Error('source does not belong to CPCA')
    const mediaType = source.mediaType ?? source.contentType ?? 'text/html'; const filename = mediaType === 'application/pdf' ? 'cpca-document.pdf' : mediaType === 'text/html' || mediaType === 'application/xhtml+xml' ? 'cpca-document.html' : 'cpca-document.bin'; const document = await this.resolver.parse({ bytes: source.rawBytes, filename, mediaType }); if (!document.normalizedText.trim() || RESTRICTED.test(document.normalizedText.slice(0, 120_000))) throw new Error('CPCA normalized content is restricted or teaser-only')
    return { candidate: source.candidate, retrievedAt: source.retrievedAt, title: source.candidate.title, content: document.normalizedText, canonicalUrl: canonical(source.candidate.url), contentHash: source.contentHash ?? sha256(source.rawBytes), rawBytes: Uint8Array.from(source.rawBytes), publisher: PUBLISHER, rights: { accessScope: 'public', retentionAllowed: true, aiProcessingAllowed: true, derivativeKnowledgeAllowed: true, redistributionAllowed: false, policyBasis: 'personal_noncommercial_research' } }
  }
}
