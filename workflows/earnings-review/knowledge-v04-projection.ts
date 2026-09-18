import type { ExternalIdentifierV04 } from '../../knowledge/schema/domain-v04.ts'
import type { SemanticProductionProposal } from '../../knowledge/production/contracts.ts'
import type { NormalizedResearchSource } from '../../plugins/research-acquisition/contracts.ts'
import type { EarningsComputation, EarningsPeriodSpec } from '../../skills/earnings-review/financials.ts'
import type { EarningsImpactAssessment, EarningsReviewProposal } from '../../skills/earnings-review/contracts.ts'

export interface EarningsKnowledgeV04ProjectionInput {
  readonly company: { readonly symbol: string; readonly name?: string; readonly exchange?: string }
  readonly period: EarningsPeriodSpec
  readonly asOf: string
  readonly officialSources: readonly NormalizedResearchSource[]
  readonly structuredSource?: NormalizedResearchSource
  readonly computation: EarningsComputation
  readonly acceptedProposals: readonly EarningsReviewProposal[]
  readonly assessments: readonly EarningsImpactAssessment[]
  readonly existingTheses: readonly Record<string, unknown>[]
  readonly externalIdentifiers?: readonly ExternalIdentifierV04[]
}

export interface EarningsKnowledgeV04Projection {
  readonly proposals: readonly SemanticProductionProposal[]
  readonly reportProposals: readonly EarningsReviewProposal[]
  readonly externalIdentifiers?: readonly ExternalIdentifierV04[]
}

function sourceIds(source: NormalizedResearchSource | undefined): readonly string[] { return source === undefined ? [] : [source.candidate.candidateId] }
function assessmentFor(proposal: EarningsReviewProposal, assessments: readonly EarningsImpactAssessment[]): EarningsImpactAssessment | undefined { return proposal.assessmentRefs.map((id) => assessments.find((item) => item.assessmentId === id)).find((item): item is EarningsImpactAssessment => item !== undefined) }

/**
 * Convert verified Earnings inputs into existing Gateway proposals. This is a
 * projection only: canonical identity allocation and persistence remain in
 * KnowledgeProductionGateway and the shared Writer.
 */
export function projectEarningsKnowledgeV04(input: EarningsKnowledgeV04ProjectionInput): EarningsKnowledgeV04Projection {
  const proposals: SemanticProductionProposal[] = []
  const officialIds = input.officialSources.map((source) => source.candidate.candidateId)
  if (officialIds.length > 0) {
    const release = input.officialSources[0]!
    proposals.push({ proposalId: `event-earnings-${input.period.key}`, kind: 'event', subjectKey: 'company', eventType: 'earnings_release', statement: release.title || `${input.company.name ?? input.company.symbol} ${input.period.key} earnings release`, sourceCandidateIds: officialIds, temporal: { announcedAt: release.candidate.publishedAt ?? input.asOf, occurredAt: input.period.endDate, period: input.period.key, fiscalPeriod: input.period.key } })
  }

  for (const metric of input.computation.metrics) {
    if (!['revenue', 'net_profit', 'gross_margin', 'eps'].includes(metric.metric)) continue
    const structuredSource = input.structuredSource ?? input.officialSources.find((source) => source.candidate.candidateId === metric.sourceCandidateIds[0])
    const ids = metric.sourceCandidateIds.length > 0 ? metric.sourceCandidateIds : sourceIds(structuredSource)
    if (ids.length === 0) continue
    proposals.push({ proposalId: `observation-${metric.metric}-${input.period.key}`, kind: 'observation', subjectKey: 'company', observationType: 'metric', metricRef: `metric:${metric.metric}`, value: metric.value, unit: metric.unit, period: metric.period, sourceCandidateIds: ids, temporal: { reportedAt: input.officialSources[0]?.candidate.publishedAt ?? input.asOf, period: input.period.key, fiscalPeriod: input.period.key } })
  }

  const canonicalClaims: EarningsReviewProposal[] = []
  const thesisProposals: { readonly thesis: SemanticProductionProposal; readonly evidenceClaim: EarningsReviewProposal }[] = []
  for (const proposal of input.acceptedProposals) {
    if (proposal.claimType !== 'thesis') {
      canonicalClaims.push(proposal)
      continue
    }
    const assessment = assessmentFor(proposal, input.assessments)
    if (assessment?.disposition !== 'affects_thesis') continue
    const evidenceClaim: EarningsReviewProposal = { ...proposal, proposalId: `${proposal.proposalId}-evidence`, claimType: 'viewpoint', assessmentRefs: proposal.assessmentRefs }
    canonicalClaims.push(evidenceClaim)
    const existing = input.existingTheses[0]
    const title = typeof existing?.title === 'string' && existing.title.trim() !== '' ? existing.title : `Earnings thesis ${input.company.symbol}`
    thesisProposals.push({ evidenceClaim, thesis: { proposalId: `thesis-${proposal.proposalId}`, kind: 'thesis', subjectKey: 'company', thesisTitle: title, statement: proposal.statement, thesisStatus: 'active', sourceCandidateIds: proposal.sourceCandidateIds } })
  }

  const firstClaim = canonicalClaims[0]
  for (const proposal of proposals.filter((item) => item.kind === 'observation')) {
    if (!firstClaim) break
    proposals.push({ proposalId: `edge-${proposal.proposalId}-claim`, kind: 'reasoning_edge', subjectKey: proposal.proposalId, sourceProposalId: proposal.proposalId, targetKey: firstClaim.proposalId, edgeType: 'supports', sourceCandidateIds: proposal.sourceCandidateIds })
  }
  for (const item of thesisProposals) {
    proposals.push(item.thesis)
    proposals.push({ proposalId: `edge-${item.evidenceClaim.proposalId}-thesis`, kind: 'reasoning_edge', subjectKey: item.evidenceClaim.proposalId, sourceProposalId: item.evidenceClaim.proposalId, targetKey: item.thesis.proposalId, edgeType: 'supports', sourceCandidateIds: item.evidenceClaim.sourceCandidateIds })
  }
  proposals.push(...canonicalClaims.map(({ assessmentRefs: _assessmentRefs, ...proposal }) => proposal))
  return { proposals, reportProposals: canonicalClaims, ...(input.externalIdentifiers === undefined ? {} : { externalIdentifiers: input.externalIdentifiers }) }
}
