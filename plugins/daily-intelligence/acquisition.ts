import { sha256 } from '../research-acquisition/hash.ts'
import type { ResearchAcquisitionPlugin, ResearchAcquisitionRequest, ResearchFetchedSource, ResearchSourceCandidate, NormalizedResearchSource } from '../research-acquisition/contracts.ts'

export interface WebResearchAcquisitionOptions { readonly provider: string; readonly urls: readonly string[]; readonly tier?: 1 | 2 | 3 | 4 | 5; readonly kind?: 'news' | 'rss' | 'web_article'; readonly fetchImpl?: typeof fetch; readonly now?: () => string }

/** Narrow public-page acquisition for configured research sources; it is intentionally not a crawler. */
export class WebResearchAcquisition implements ResearchAcquisitionPlugin {
  readonly name: string
  private readonly fetchImpl: typeof fetch
  private readonly now: () => string
  constructor(private readonly options: WebResearchAcquisitionOptions) { this.name = `web-research-${options.provider}`; this.fetchImpl = options.fetchImpl ?? fetch; this.now = options.now ?? (() => new Date().toISOString()) }
  async discover(request: ResearchAcquisitionRequest): Promise<readonly ResearchSourceCandidate[]> {
    return this.options.urls.slice(0, Math.max(1, Math.min(request.limitPerKind ?? 5, 10))).map((url) => ({ candidateId: `${this.options.provider}-${sha256(url).slice(0, 16)}`, kind: this.options.kind ?? 'web_article', tier: this.options.tier ?? 3, title: `${this.options.provider} public source`, url, provider: this.options.provider, publishedAt: request.asOf, metadata: { companySymbol: request.company.symbol, acquisitionMode: 'static_html' } }))
  }
  async fetch(candidate: ResearchSourceCandidate): Promise<ResearchFetchedSource> { if (!candidate.url) throw new Error('public source candidate has no URL'); const response = await this.fetchImpl(candidate.url, { headers: { accept: 'text/html, application/rss+xml, text/plain' } }); if (!response.ok) throw new Error(`${this.options.provider} request failed with HTTP ${response.status}`); const content = await response.text(); return { candidate, retrievedAt: this.now(), content, contentType: response.headers.get('content-type') ?? undefined, contentHash: sha256(content) } }
  async normalize(source: ResearchFetchedSource): Promise<NormalizedResearchSource> { return { candidate: source.candidate, retrievedAt: source.retrievedAt, title: source.candidate.title, content: source.content.replace(/<script\b[\s\S]*?<\/script>/gi, ' ').replace(/<style\b[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(), canonicalUrl: source.candidate.url, contentHash: source.contentHash ?? sha256(source.content), publisher: this.options.provider, rights: { accessScope: 'public', retentionAllowed: true, aiProcessingAllowed: true, derivativeKnowledgeAllowed: true, redistributionAllowed: false } } }
}

export class PublicInstitutionalViewAcquisition extends WebResearchAcquisition { constructor(options: Omit<WebResearchAcquisitionOptions, 'kind'>) { super({ ...options, kind: 'web_article' }) } }
export class CommunitySignalAcquisition extends WebResearchAcquisition { constructor(options: Omit<WebResearchAcquisitionOptions, 'kind'>) { super({ ...options, kind: 'web_article' }) } }
