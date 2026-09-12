import { sha256 } from './hash.ts'
import type { ResearchAcquisitionPlugin, ResearchAcquisitionRequest, ResearchFetchedSource, ResearchSourceCandidate, NormalizedResearchSource } from './contracts.ts'
import { DocumentInputResolver } from '../document/input-resolver.ts'

export interface RssResearchPluginOptions {
  readonly feedUrls: readonly string[]
  readonly fetchImpl?: typeof fetch
  readonly now?: () => string
}

export class RssResearchPlugin implements ResearchAcquisitionPlugin {
  readonly name = 'rss-research-acquisition'
  readonly dailyScope = 'broad' as const
  private readonly fetchImpl: typeof fetch
  private readonly now: () => string
  private readonly resolver = new DocumentInputResolver()
  constructor(private readonly options: RssResearchPluginOptions) { this.fetchImpl = options.fetchImpl ?? fetch; this.now = options.now ?? (() => new Date().toISOString()) }
  async discover(request: ResearchAcquisitionRequest): Promise<readonly ResearchSourceCandidate[]> {
    if ('industry' in request) return []
    const limit = request.limitPerKind ?? 5
    const result: ResearchSourceCandidate[] = []
    for (const feedUrl of this.options.feedUrls) {
      const response = await this.fetchImpl(feedUrl, { headers: { accept: 'application/rss+xml, application/atom+xml, text/xml' } })
      if (!response.ok) continue
      const xml = await response.text()
      const items = [...xml.matchAll(/<(?:item|entry)\b[^>]*>([\s\S]*?)<\/(?:item|entry)>/gi)].map((match) => match[1] ?? '')
      for (const item of items) {
        const title = textTag(item, 'title')
        const url = textTag(item, 'link') || /<link\b[^>]*href=["']([^"']+)/i.exec(item)?.[1]
        if (!title || !url) continue
        const candidate: ResearchSourceCandidate = { candidateId: `rss-${sha256(url).slice(0, 16)}`, kind: 'rss', tier: 3, title, url, provider: new URL(feedUrl).hostname, ...(normalizeDate(textTag(item, 'pubDate') || textTag(item, 'published')) ? { publishedAt: normalizeDate(textTag(item, 'pubDate') || textTag(item, 'published')) } : {}), snippet: textTag(item, 'description'), metadata: { feedUrl, providerObjectId: url } }
        result.push(candidate)
        if (result.length >= limit) return result
      }
    }
    return result
  }
  async fetch(candidate: ResearchSourceCandidate): Promise<ResearchFetchedSource> {
    if (!candidate.url) throw new Error('RSS candidate has no URL')
    const response = await this.fetchImpl(candidate.url)
    if (!response.ok) throw new Error(`RSS article request failed with HTTP ${response.status}`)
    const rawBytes = new Uint8Array(await response.arrayBuffer()); const content = new TextDecoder().decode(rawBytes)
    return { candidate, retrievedAt: this.now(), content, rawBytes, contentType: response.headers.get('content-type') ?? undefined, contentHash: sha256(content) }
  }
  async normalize(source: ResearchFetchedSource): Promise<NormalizedResearchSource> {
    const bytes = source.rawBytes ?? new TextEncoder().encode(source.content); const document = await this.resolver.parse({ bytes, filename: 'rss-item.html', mediaType: 'text/html' }); return { candidate: source.candidate, retrievedAt: source.retrievedAt, title: source.candidate.title, content: document.normalizedText, canonicalUrl: source.candidate.url, contentHash: source.contentHash ?? sha256(source.content), rawBytes: bytes, publisher: source.candidate.provider, rights: { accessScope: 'public', retentionAllowed: true, aiProcessingAllowed: true, derivativeKnowledgeAllowed: true, redistributionAllowed: false } }
  }
}
function textTag(value: string, tag: string): string | undefined { const match = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i').exec(value); return match?.[1]?.replace(/<!\[CDATA\[|\]\]>/g, '').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim() || undefined }
function normalizeDate(value: string | undefined): string | undefined { if (!value) return undefined; const date = new Date(value); return Number.isNaN(date.getTime()) ? undefined : date.toISOString() }
