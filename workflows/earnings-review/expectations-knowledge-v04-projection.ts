import type { EstimatePoint, ConsensusSnapshot } from '../../skills/earnings-review/expectations/contracts.ts'
import { buildConsensusSnapshot } from '../../skills/earnings-review/expectations/consensus.ts'
import { buildEstimateRevisionBridge } from '../../skills/earnings-review/expectations/actual-vs-expectation.ts'
import { validateEstimatePoint } from '../../skills/earnings-review/expectations/matching.ts'
import { getMetricDefinitionV04 } from '../../knowledge/schema/metric-registry.ts'
import type { SemanticProductionProposal } from '../../knowledge/production/contracts.ts'

export interface ExpectationPartyBinding {
  readonly key: string
  readonly name: string
  readonly kind: 'institution' | 'analyst'
}

export interface EstimateRevisionProjectionLink {
  readonly oldEstimateId: string
  readonly newEstimateId: string
}

export interface ExpectationsKnowledgeV04ProjectionInput {
  readonly subjectKey: string
  readonly analysisAsOf: string
  readonly estimates: readonly EstimatePoint[]
  readonly consensusSnapshots: readonly ConsensusSnapshot[]
  readonly parties: readonly ExpectationPartyBinding[]
  readonly revisionLinks?: readonly EstimateRevisionProjectionLink[]
}

export interface ExpectationsKnowledgeV04ProjectionResult {
  readonly proposals: readonly SemanticProductionProposal[]
  readonly diagnostics: readonly string[]
}

const SAFE_LOCAL_KEY = /^[A-Za-z0-9][A-Za-z0-9._-]*$/

function uniqueSorted(values: readonly string[]): readonly string[] { return [...new Set(values)].sort() }
function timestamp(value: string): number | undefined { const parsed = Date.parse(value); return Number.isFinite(parsed) ? parsed : undefined }
function token(value: string): string { return [...value].map((char) => char.charCodeAt(0).toString(16).padStart(4, '0')).join('') || 'empty' }
function estimateProposalId(estimateId: string): string { return `estimate-${token(estimateId)}` }
function consensusProposalId(snapshot: ConsensusSnapshot): string { return `consensus-${token(`${snapshot.metric}|${snapshot.fiscalPeriod}|${snapshot.asOf}|${[...snapshot.contributingEstimateIds].sort().join('|')}`)}` }
function partyProposalId(party: ExpectationPartyBinding): string { return `party-${token(`${party.kind}|${party.key}`)}` }
function metricRef(metric: string): string | undefined { const ref = `metric:${metric}`; return getMetricDefinitionV04(ref) === undefined ? undefined : ref }
function sameNumber(left: number | null | undefined, right: number | null | undefined): boolean { return left === right || (left !== undefined && left !== null && right !== undefined && right !== null && Object.is(left, right)) }
function estimateSort(left: EstimatePoint, right: EstimatePoint): number { return (timestamp(left.publishedAt) ?? 0) - (timestamp(right.publishedAt) ?? 0) || left.institutionKey.localeCompare(right.institutionKey) || (left.analystKey ?? '').localeCompare(right.analystKey ?? '') || left.estimateId.localeCompare(right.estimateId) }
function snapshotSort(left: ConsensusSnapshot, right: ConsensusSnapshot): number { return left.metric.localeCompare(right.metric) || left.fiscalPeriod.localeCompare(right.fiscalPeriod) || left.asOf.localeCompare(right.asOf) || [...left.contributingEstimateIds].sort().join('|').localeCompare([...right.contributingEstimateIds].sort().join('|')) }

function partyMap(parties: readonly ExpectationPartyBinding[], diagnostics: string[]): Map<string, ExpectationPartyBinding> {
  const result = new Map<string, ExpectationPartyBinding>()
  const ambiguous = new Set<string>()
  for (const party of [...parties].sort((left, right) => left.kind.localeCompare(right.kind) || left.key.localeCompare(right.key) || left.name.localeCompare(right.name))) {
    if (!SAFE_LOCAL_KEY.test(party.key) || party.name.trim() === '') { diagnostics.push(`invalid_party_binding:${party.kind}:${party.key}`); continue }
    const identity = `${party.kind}:${party.key}`
    if (ambiguous.has(identity)) continue
    const prior = result.get(identity)
    if (prior !== undefined && (prior.name !== party.name || prior.kind !== party.kind)) { diagnostics.push(`ambiguous_party_binding:${identity}`); result.delete(identity); ambiguous.add(identity) }
    else result.set(identity, party)
  }
  return result
}

function validateConsensusSnapshot(snapshot: ConsensusSnapshot, input: ExpectationsKnowledgeV04ProjectionInput, estimatesById: ReadonlyMap<string, EstimatePoint>, projectedEstimateIds: ReadonlySet<string>, diagnostics: string[]): boolean {
  const analysisAsOf = timestamp(input.analysisAsOf)
  const snapshotAsOf = timestamp(snapshot.asOf)
  const ref = metricRef(snapshot.metric)
  if (analysisAsOf === undefined || snapshotAsOf === undefined || snapshotAsOf > analysisAsOf) { diagnostics.push(`consensus_outside_analysis_asOf:${snapshot.asOf}`); return false }
  if (ref === undefined) { diagnostics.push(`unregistered_metric:${snapshot.metric}`); return false }
  if (!Number.isInteger(snapshot.count) || snapshot.count < 2) { diagnostics.push(`consensus_invalid_count:${snapshot.metric}:${snapshot.fiscalPeriod}`); return false }
  if (new Set(snapshot.contributingEstimateIds).size !== snapshot.contributingEstimateIds.length || snapshot.contributingEstimateIds.length !== snapshot.count) { diagnostics.push(`consensus_contributors_invalid:${snapshot.metric}:${snapshot.fiscalPeriod}:${snapshot.asOf}`); return false }
  const contributors = snapshot.contributingEstimateIds.map((id) => estimatesById.get(id))
  if (contributors.some((estimate) => estimate === undefined)) { diagnostics.push(`consensus_contributor_missing:${snapshot.metric}:${snapshot.fiscalPeriod}:${snapshot.asOf}`); return false }
  if (contributors.some((estimate) => !projectedEstimateIds.has(estimate!.estimateId))) { diagnostics.push(`consensus_contributor_not_projected:${snapshot.metric}:${snapshot.fiscalPeriod}:${snapshot.asOf}`); return false }
  const resolved = contributors as EstimatePoint[]
  if (resolved.some((estimate) => estimate.metric !== snapshot.metric || estimate.fiscalPeriod !== snapshot.fiscalPeriod || estimate.unit !== snapshot.unit || (timestamp(estimate.publishedAt) ?? Number.POSITIVE_INFINITY) > snapshotAsOf)) { diagnostics.push(`consensus_contributor_semantics_invalid:${snapshot.metric}:${snapshot.fiscalPeriod}:${snapshot.asOf}`); return false }
  const recalculated = buildConsensusSnapshot({ estimates: resolved, metric: snapshot.metric, fiscalPeriod: snapshot.fiscalPeriod, asOf: snapshot.asOf, minimumCount: snapshot.count })
  const expected = recalculated.snapshot
  if (expected === undefined || [...expected.contributingEstimateIds].sort().join('|') !== [...snapshot.contributingEstimateIds].sort().join('|') || expected.unit !== snapshot.unit || expected.count !== snapshot.count || !sameNumber(expected.mean, snapshot.mean) || !sameNumber(expected.median, snapshot.median) || !sameNumber(expected.high, snapshot.high) || !sameNumber(expected.low, snapshot.low) || !sameNumber(expected.dispersion, snapshot.dispersion)) { diagnostics.push(`consensus_snapshot_inconsistent:${snapshot.metric}:${snapshot.fiscalPeriod}:${snapshot.asOf}`); return false }
  return true
}

export function projectExpectationsKnowledgeV04(input: ExpectationsKnowledgeV04ProjectionInput): ExpectationsKnowledgeV04ProjectionResult {
  const diagnostics: string[] = []
  const analysisAsOf = timestamp(input.analysisAsOf)
  if (!SAFE_LOCAL_KEY.test(input.subjectKey)) diagnostics.push(`invalid_subject_key:${input.subjectKey}`)
  if (analysisAsOf === undefined) diagnostics.push('analysisAsOf_must_be_valid')
  const parties = partyMap(input.parties, diagnostics)
  const partyProposals: SemanticProductionProposal[] = [...parties.values()].sort((left, right) => left.kind.localeCompare(right.kind) || left.key.localeCompare(right.key)).map((party) => ({ proposalId: partyProposalId(party), kind: 'entity', subjectKey: party.key, entityType: party.kind === 'institution' ? 'institution' : 'person', entityName: party.name }))
  const idCounts = new Map<string, number>()
  for (const estimate of input.estimates) idCounts.set(estimate.estimateId, (idCounts.get(estimate.estimateId) ?? 0) + 1)
  const estimatesById = new Map<string, EstimatePoint>()
  const validEstimates: EstimatePoint[] = []
  for (const estimate of input.estimates) {
    if ((idCounts.get(estimate.estimateId) ?? 0) > 1) { diagnostics.push(`duplicate_estimateId:${estimate.estimateId}`); continue }
    const validation = validateEstimatePoint(estimate)
    if (validation.length > 0) { diagnostics.push(...validation.map((item) => `estimate:${estimate.estimateId}:${item}`)); continue }
    const publishedAt = timestamp(estimate.publishedAt)
    if (analysisAsOf === undefined || publishedAt === undefined || publishedAt > analysisAsOf) { diagnostics.push(`estimate_outside_analysisAsOf:${estimate.estimateId}`); continue }
    if (metricRef(estimate.metric) === undefined) { diagnostics.push(`unregistered_metric:${estimate.metric}`); continue }
    if (parties.get(`institution:${estimate.institutionKey}`) === undefined) { diagnostics.push(`institution_binding_missing:${estimate.estimateId}:${estimate.institutionKey}`); continue }
    if (estimate.analystKey !== undefined && parties.get(`analyst:${estimate.analystKey}`) === undefined) { diagnostics.push(`analyst_binding_missing:${estimate.estimateId}:${estimate.analystKey}`); continue }
    estimatesById.set(estimate.estimateId, estimate)
    validEstimates.push(estimate)
  }
  const orderedEstimates = validEstimates.sort(estimateSort)
  const projectedEstimateIds = new Set(orderedEstimates.map((estimate) => estimate.estimateId))
  const revisionTargets = new Map<string, string>()
  for (const link of [...(input.revisionLinks ?? [])].sort((left, right) => left.oldEstimateId.localeCompare(right.oldEstimateId) || left.newEstimateId.localeCompare(right.newEstimateId))) {
    const oldEstimate = estimatesById.get(link.oldEstimateId)
    const newEstimate = estimatesById.get(link.newEstimateId)
    const revision = oldEstimate === undefined || newEstimate === undefined ? undefined : buildEstimateRevisionBridge({ oldEstimate, newEstimate })
    if (revision === undefined || revisionTargets.has(link.newEstimateId)) diagnostics.push(`invalid_revision_link:${link.oldEstimateId}->${link.newEstimateId}`)
    else revisionTargets.set(link.newEstimateId, link.oldEstimateId)
  }
  const estimateProposals: SemanticProductionProposal[] = orderedEstimates.map((estimate) => ({ proposalId: estimateProposalId(estimate.estimateId), kind: 'observation', observationType: 'estimate', subjectKey: input.subjectKey, metricRef: metricRef(estimate.metric)!, fiscalPeriod: estimate.fiscalPeriod, estimateValue: estimate.value, unit: estimate.unit, institutionKey: estimate.institutionKey, ...(estimate.analystKey === undefined ? {} : { analystKey: estimate.analystKey }), publishedAt: estimate.publishedAt, ...(estimate.estimateHorizon === undefined ? {} : { estimateHorizon: estimate.estimateHorizon }), ...(revisionTargets.has(estimate.estimateId) ? { revisionOfProposalId: estimateProposalId(revisionTargets.get(estimate.estimateId)!) } : {}), sourceCandidateIds: [...estimate.sourceCandidateIds] }))
  const consensusProposals: SemanticProductionProposal[] = []
  for (const snapshot of [...input.consensusSnapshots].sort(snapshotSort)) if (validateConsensusSnapshot(snapshot, input, estimatesById, projectedEstimateIds, diagnostics)) consensusProposals.push({ proposalId: consensusProposalId(snapshot), kind: 'observation', observationType: 'consensus', subjectKey: input.subjectKey, metricRef: metricRef(snapshot.metric)!, fiscalPeriod: snapshot.fiscalPeriod, unit: snapshot.unit, value: snapshot.mean, consensusAsOf: snapshot.asOf, consensusMean: snapshot.mean, consensusMedian: snapshot.median, consensusHigh: snapshot.high, consensusLow: snapshot.low, consensusCount: snapshot.count, consensusDispersion: snapshot.dispersion ?? null, contributingProposalIds: [...snapshot.contributingEstimateIds].sort().map(estimateProposalId) })
  return { proposals: [...partyProposals, ...estimateProposals, ...consensusProposals], diagnostics: uniqueSorted(diagnostics) }
}
