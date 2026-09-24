import { sha256 } from '../research-acquisition/hash.ts'
import type { EarningsExpectationAcquisitionResult, EarningsExpectationsAcquisitionSource } from '../../workflows/earnings-review/expectations-acquisition.ts'
import { buildEstimateRevisionBridge } from '../../skills/earnings-review/expectations/actual-vs-expectation.ts'
import type { EstimatePoint, EstimateRevisionResult } from '../../skills/earnings-review/expectations/contracts.ts'
import type { ResearchAcquisitionPlugin, ResearchAcquisitionRequest, ResearchFetchedSource, ResearchSourceCandidate, NormalizedResearchSource } from '../research-acquisition/contracts.ts'

interface CachedCandidate { readonly candidate: ResearchSourceCandidate; readonly content: string; readonly publisher: string; readonly sourceIds: readonly string[] }
function asCompany(request: ResearchAcquisitionRequest): request is Extract<ResearchAcquisitionRequest, { readonly company: unknown }> { return request.company !== undefined }
function groupKey(point: EstimatePoint): string { return `${point.institutionKey}|${point.metric}|${point.fiscalPeriod}|${point.unit}` }
function sourcePublisher(acquisition: EarningsExpectationAcquisitionResult, sourceIds: readonly string[]): string { return sourceIds.map((id) => acquisition.projection.sources.find((source) => source.candidate.candidateId === id)?.publisher).filter((value): value is string => Boolean(value)).sort().join(' / ') || 'D1 expectations source' }

export class DailyExpectationRevisionAcquisition implements ResearchAcquisitionPlugin {
  readonly name = 'd1-daily-expectation-revisions'; readonly dailyScope = 'company' as const
  private readonly cache = new Map<string, CachedCandidate>()
  constructor(private readonly source: EarningsExpectationsAcquisitionSource, private readonly now: () => string = () => new Date().toISOString()) {}
  async discover(request: ResearchAcquisitionRequest): Promise<readonly ResearchSourceCandidate[]> {
    if (!asCompany(request) || request.asOf === undefined) return []
    const acquisition = await this.source.acquire({ company: request.company, asOf: request.asOf, targetFiscalYear: Number(request.asOf.slice(0, 4)) })
    const estimates = acquisition.projection.estimates.filter((estimate) => Number.isFinite(Date.parse(estimate.publishedAt)) && Date.parse(estimate.publishedAt) <= Date.parse(request.asOf!))
    if (estimates.length === 0) throw new Error(`EXPECTATIONS_UNAVAILABLE:${acquisition.diagnostics.slice(0, 2).join('|') || acquisition.status}`)
    const byGroup = new Map<string, EstimatePoint[]>()
    for (const point of estimates) byGroup.set(groupKey(point), [...(byGroup.get(groupKey(point)) ?? []), point])
    const candidates: ResearchSourceCandidate[] = []
    for (const points of byGroup.values()) {
      const ordered = points.slice().sort((left, right) => Date.parse(left.publishedAt) - Date.parse(right.publishedAt) || left.estimateId.localeCompare(right.estimateId))
      const transitions: Array<{ readonly mode: 'snapshot' | 'revision'; readonly current: EstimatePoint; readonly prior?: EstimatePoint; readonly result?: EstimateRevisionResult }> = []
      for (let index = 0; index < ordered.length; index += 1) {
        const current = ordered[index]!; const prior = index === 0 ? undefined : ordered[index - 1]; const result = prior === undefined ? undefined : buildEstimateRevisionBridge({ oldEstimate: prior, newEstimate: current })
        if (prior === undefined || (result !== undefined && result.absoluteRevision !== 0)) transitions.push({ mode: result === undefined ? 'snapshot' : 'revision', current, ...(prior === undefined ? {} : { prior }), ...(result === undefined ? {} : { result }) })
      }
      const selected = transitions.at(-1); if (!selected) continue
      const sourceIds = [...new Set([...(selected.current.sourceCandidateIds), ...(selected.prior?.sourceCandidateIds ?? [])])].sort()
      const identity = `d1:expectation:${request.company.symbol}:${selected.current.metric}:${selected.current.fiscalPeriod}:${selected.current.institutionKey}:${selected.prior?.estimateId ?? 'snapshot'}:${selected.current.estimateId}:${selected.current.value}`
      const candidate: ResearchSourceCandidate = { candidateId: `d1-expectation-${sha256(identity).slice(0, 24)}`, kind: 'structured_data', tier: 3, title: selected.mode === 'revision' ? `Expectation revision ${selected.current.metric} ${selected.current.fiscalPeriod}` : `Expectation snapshot ${selected.current.metric} ${selected.current.fiscalPeriod}`, publishedAt: selected.current.publishedAt, provider: 'd1-expectations', metadata: { companySymbol: request.company.symbol, providerObjectId: identity, dailySignalKind: 'expectation', dailySignalCategory: 'expectation_revision', expectationMode: selected.mode, metric: selected.current.metric, fiscalPeriod: selected.current.fiscalPeriod, institutionKey: selected.current.institutionKey, value: selected.current.value, unit: selected.current.unit, observationDate: selected.current.publishedAt.slice(0, 10), sourceCandidateIds: sourceIds, originPublisher: sourcePublisher(acquisition, sourceIds), sourceAuthority: 'S3_AGGREGATOR', retrievalProvider: 'AKShare' } }
      const content = JSON.stringify({ mode: selected.mode, metric: selected.current.metric, fiscalPeriod: selected.current.fiscalPeriod, institutionKey: selected.current.institutionKey, current: selected.current, ...(selected.result === undefined ? {} : { revision: selected.result }), sourceCandidateIds: sourceIds })
      this.cache.set(candidate.candidateId, { candidate, content, publisher: sourcePublisher(acquisition, sourceIds), sourceIds }); candidates.push(candidate)
    }
    return candidates.sort((left, right) => left.candidateId.localeCompare(right.candidateId)).slice(0, Math.min(request.limitPerKind ?? 5, 5))
  }
  async fetch(candidate: ResearchSourceCandidate): Promise<ResearchFetchedSource> { const cached = this.cache.get(candidate.candidateId); if (!cached) throw new Error('EXPECTATIONS_CANDIDATE_NOT_CACHED'); const rawBytes = new TextEncoder().encode(cached.content); return { candidate: cached.candidate, retrievedAt: this.now(), content: cached.content, rawBytes, mediaType: 'application/json', contentType: 'application/json', contentHash: sha256(cached.content) } }
  async normalize(source: ResearchFetchedSource): Promise<NormalizedResearchSource> { const cached = this.cache.get(source.candidate.candidateId); return { candidate: source.candidate, retrievedAt: source.retrievedAt, title: source.candidate.title, content: source.content, contentHash: source.contentHash ?? sha256(source.content), rawBytes: source.rawBytes, publisher: cached?.publisher ?? 'D1 expectations source', rights: { accessScope: 'public', retentionAllowed: true, aiProcessingAllowed: true, derivativeKnowledgeAllowed: true, redistributionAllowed: false, policyBasis: 'personal_noncommercial_research' } } }
}
