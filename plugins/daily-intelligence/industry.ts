import { sha256 } from '../research-acquisition/hash.ts'
import type { IndustryOperatingObservation, IndustryOperatingObservationAcquisitionPort } from '../research-acquisition/industry-operating-observations.ts'
import type { ResearchAcquisitionPlugin, ResearchAcquisitionRequest, ResearchFetchedSource, ResearchSourceCandidate, NormalizedResearchSource } from '../research-acquisition/contracts.ts'

interface CachedObservation { readonly candidate: ResearchSourceCandidate; readonly source: NormalizedResearchSource }
function supported(name: string): boolean { const value = name.trim().replace(/\s+/g, ' ').toLowerCase(); return /^(?:锂电池|锂离子电池)(?:行业)?$/.test(value) || /^(?:lithium(?:-ion)? battery)(?: industry)?$/.test(value) || /^(?:家用空调器|家用空调|房间空气调节器)(?:行业)?$/.test(value) || /^(?:household air conditioner|room air conditioner|air conditioner)(?: industry)?$/.test(value) }
function classLabel(value: IndustryOperatingObservation['observationClass']): string { return value === 'PRODUCTION' ? 'industry_production' : value === 'PRICE' ? 'industry_price' : 'industry_trade' }
function observationCandidate(observation: IndustryOperatingObservation, source: NormalizedResearchSource, industryName: string): ResearchSourceCandidate {
  const identity = `d4:${observation.observationId}:${observation.value}:${observation.qualifier}`
  return { candidateId: `d4-daily-${sha256(identity).slice(0, 24)}`, kind: 'structured_data', tier: source.candidate.tier, title: `${industryName} ${classLabel(observation.observationClass)} ${observation.periodStart.slice(0, 10)}`, provider: 'd4-industry-observations', ...(observation.publishedAt ? { publishedAt: observation.publishedAt } : {}), url: source.canonicalUrl, metadata: { industryName, providerObjectId: identity, dailySignalKind: 'market', dailySignalCategory: 'industry', industryObservationClass: observation.observationClass, observationId: observation.observationId, metricKey: observation.metricKey, value: observation.value, qualifier: observation.qualifier, unit: observation.unit, originalValue: observation.originalValue, originalUnit: observation.originalUnit, periodStart: observation.periodStart, periodEnd: observation.periodEnd, frequency: observation.frequency, aggregation: observation.aggregation, observationDate: observation.periodEnd.slice(0, 10), originPublisher: observation.originPublisher, sourceAuthority: observation.sourceAuthority, retrievalProvider: observation.retrievalProvider, sourceCandidateId: observation.sourceCandidateId, sourceRef: observation.sourceRef, publicationPit: observation.publicationPit, valueVersionPit: observation.valueVersionPit, upstreamDataSource: observation.metadata.upstreamDataSource } }
}

export class DailyIndustryObservationAcquisition implements ResearchAcquisitionPlugin {
  readonly name = 'd4-daily-industry-observations'; readonly dailyScope = 'industry' as const
  private readonly cache = new Map<string, CachedObservation>()
  constructor(private readonly acquisition: IndustryOperatingObservationAcquisitionPort, private readonly now: () => string = () => new Date().toISOString()) {}
  async discover(request: ResearchAcquisitionRequest): Promise<readonly ResearchSourceCandidate[]> {
    if (request.industry === undefined || request.asOf === undefined || !supported(request.industry.name)) return []
    const result = await this.acquisition.acquire({ target: { name: request.industry.name, aliases: request.industry.aliases }, asOf: request.asOf, now: this.now })
    const bySource = new Map(result.sources.map((source) => [source.candidate.candidateId, source]))
    const candidates: ResearchSourceCandidate[] = []
    for (const observation of result.observations.slice(0, Math.min(request.limitPerKind ?? 12, 12))) { const source = bySource.get(observation.sourceCandidateId); if (!source) continue; const candidate = observationCandidate(observation, source, request.industry.name); this.cache.set(candidate.candidateId, { candidate, source: { ...source, candidate } }); candidates.push(candidate) }
    return candidates
  }
  async fetch(candidate: ResearchSourceCandidate): Promise<ResearchFetchedSource> { const cached = this.cache.get(candidate.candidateId); if (!cached) throw new Error('D4_CANDIDATE_NOT_CACHED'); const rawBytes = cached.source.rawBytes ?? new TextEncoder().encode(cached.source.content); return { candidate: cached.candidate, retrievedAt: cached.source.retrievedAt, content: cached.source.content, rawBytes, mediaType: 'text/plain', contentType: 'text/plain', contentHash: cached.source.contentHash } }
  async normalize(source: ResearchFetchedSource): Promise<NormalizedResearchSource> { const cached = this.cache.get(source.candidate.candidateId); return { candidate: source.candidate, retrievedAt: source.retrievedAt, title: source.candidate.title, content: source.content, canonicalUrl: cached?.source.canonicalUrl, contentHash: source.contentHash ?? sha256(source.content), rawBytes: source.rawBytes, publisher: cached?.source.publisher ?? 'D4 source', rights: cached?.source.rights ?? { accessScope: 'public', retentionAllowed: true, aiProcessingAllowed: true, derivativeKnowledgeAllowed: true, redistributionAllowed: false, policyBasis: 'personal_noncommercial_research' } } }
}
