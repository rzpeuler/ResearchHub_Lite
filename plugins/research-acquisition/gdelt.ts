import { sha256 } from './hash.ts'
import type { ResearchAcquisitionPlugin, ResearchAcquisitionRequest, ResearchFetchedSource, ResearchSourceCandidate, NormalizedResearchSource } from './contracts.ts'
import { DocumentInputResolver } from '../document/input-resolver.ts'

export interface GdeltResearchPluginOptions { readonly endpoint?: string; readonly fetchImpl?: typeof fetch; readonly now?: () => string }
export class GdeltResearchPlugin implements ResearchAcquisitionPlugin {
  readonly name = 'gdelt-research-acquisition'
  private readonly endpoint: string
  private readonly fetchImpl: typeof fetch
  private readonly now: () => string
  private readonly resolver = new DocumentInputResolver()
  constructor(options: GdeltResearchPluginOptions = {}) { this.endpoint = options.endpoint ?? 'https://api.gdeltproject.org/api/v2/doc/doc'; this.fetchImpl = options.fetchImpl ?? fetch; this.now = options.now ?? (() => new Date().toISOString()) }
  async discover(request: ResearchAcquisitionRequest): Promise<readonly ResearchSourceCandidate[]> {
    const url = new URL(this.endpoint); url.searchParams.set('query', `"${request.company.name ?? request.company.symbol}"`); url.searchParams.set('mode', 'artlist'); url.searchParams.set('format', 'json'); url.searchParams.set('maxrecords', String(request.limitPerKind ?? 5)); url.searchParams.set('sort', 'datedesc')
    const response = await this.fetchImpl(url); if (!response.ok) throw new Error(`GDELT request failed with HTTP ${response.status}`)
    const payload = await response.json() as { articles?: readonly Record<string, unknown>[] }; if (!Array.isArray(payload.articles)) return []
    return payload.articles.flatMap((article, index) => { const articleUrl = typeof article.url === 'string' ? article.url : undefined; const title = typeof article.title === 'string' ? article.title : undefined; if (!articleUrl || !title) return []; return [{ candidateId: `gdelt-${sha256(articleUrl).slice(0, 16)}`, kind: 'news', tier: 3, title, url: articleUrl, provider: 'gdelt', publishedAt: normalizeDate(article.seendate), snippet: typeof article.seendate === 'string' ? article.seendate : undefined, metadata: { index, companySymbol: request.company.symbol } }] })
  }
  async fetch(candidate: ResearchSourceCandidate): Promise<ResearchFetchedSource> { if (!candidate.url) throw new Error('GDELT candidate has no URL'); const response = await this.fetchImpl(candidate.url); if (!response.ok) throw new Error(`Article request failed with HTTP ${response.status}`); const rawBytes = new Uint8Array(await response.arrayBuffer()); const content = new TextDecoder().decode(rawBytes); return { candidate, retrievedAt: this.now(), content, rawBytes, contentType: response.headers.get('content-type') ?? undefined, contentHash: sha256(content) } }
  async normalize(source: ResearchFetchedSource): Promise<NormalizedResearchSource> { const bytes = source.rawBytes ?? new TextEncoder().encode(source.content); const document = await this.resolver.parse({ bytes, filename: 'gdelt-article.html', mediaType: 'text/html' }); return { candidate: source.candidate, retrievedAt: source.retrievedAt, title: source.candidate.title, content: document.normalizedText, canonicalUrl: source.candidate.url, contentHash: source.contentHash ?? sha256(source.content), rawBytes: bytes, publisher: source.candidate.provider, rights: { accessScope: 'public', retentionAllowed: true, aiProcessingAllowed: true, derivativeKnowledgeAllowed: true, redistributionAllowed: false } } }
}
function normalizeDate(value: unknown): string | undefined { if (typeof value !== 'string') return undefined; const match = /^(\d{4})(\d{2})(\d{2})/.exec(value); return match ? `${match[1]}-${match[2]}-${match[3]}T00:00:00.000Z` : undefined }
