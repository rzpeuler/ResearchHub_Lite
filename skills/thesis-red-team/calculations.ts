import { KILL_CRITERION_OPERATORS, type RedTeamEvidenceStrength, type ThesisDependencyProjection, type ThesisFragilityAssessment, type ThesisInvalidationCondition } from './contracts.ts'

const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)
const text = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0
const refs = (values: readonly string[] | undefined): readonly string[] => [...new Set((values ?? []).filter((value): value is string => text(value)))].sort()

export function assessThesisFragility(projection: ThesisDependencyProjection): readonly ThesisFragilityAssessment[] {
  const downstream = new Map<string, number>(projection.claims.map((claim) => [claim.canonicalRef, 0]))
  for (const claim of projection.claims) for (const ref of [...(claim.dependsOnClaimRefs ?? []), ...(claim.supportsClaimRefs ?? [])]) downstream.set(ref, (downstream.get(ref) ?? 0) + 1)
  const assumptions = projection.criticalAssumptions.length ? projection.criticalAssumptions : projection.claims.filter((claim) => claim.claimType === 'assumption')
  return assumptions.map((assumption) => {
    const downstreamClaimCount = downstream.get(assumption.canonicalRef) ?? 0
    const evidenceStrength: RedTeamEvidenceStrength | 'unknown' = assumption.sourceRefs?.length ? (assumption.confidence !== undefined && assumption.confidence >= 0.8 ? 'high' : assumption.confidence !== undefined && assumption.confidence >= 0.5 ? 'medium' : 'low') : 'unknown'
    const level = evidenceStrength === 'unknown' ? 'insufficient_evidence' : downstreamClaimCount >= 3 && evidenceStrength === 'low' ? 'critical' : downstreamClaimCount >= 2 ? 'high' : downstreamClaimCount > 0 ? 'medium' : 'low'
    return { assumptionRef: assumption.canonicalRef, level, downstreamClaimCount, evidenceStrength, rationale: `${downstreamClaimCount} downstream claim(s); evidence strength is ${evidenceStrength}.` }
  })
}

export interface KillCriterionObservation { readonly metric: string; readonly value: number; readonly period?: string; readonly sourceRefs: readonly string[]; readonly observedAt?: string }
export interface KillCriterionEvaluation { readonly conditionId: string; readonly status: 'not_yet_observable'|'not_met'|'met'|'inconclusive'|'threshold_pending_evidence'; readonly evidenceRefs: readonly string[]; readonly rationale: string }

export function evaluateThesisKillCriterion(condition: ThesisInvalidationCondition, observations: readonly KillCriterionObservation[], currentAsOf?: string): KillCriterionEvaluation {
  const evidenceRefs = refs(condition.thresholdSourceRefs)
  if (condition.deadline !== undefined && currentAsOf !== undefined && Date.parse(currentAsOf) < Date.parse(condition.deadline) && observations.length === 0) return { conditionId: condition.conditionId, status: 'not_yet_observable', evidenceRefs, rationale: 'The criterion deadline has not arrived and no observation is available.' }
  if (condition.observableMetric === undefined || condition.operator === undefined || condition.threshold === undefined || !KILL_CRITERION_OPERATORS.includes(condition.operator) || !finite(condition.threshold)) return { conditionId: condition.conditionId, status: 'threshold_pending_evidence', evidenceRefs, rationale: 'No complete evidence-backed numeric predicate is available.' }
  const observation = observations.find((item) => item.metric === condition.observableMetric && (condition.period === undefined || item.period === condition.period) && finite(item.value))
  if (!observation) return { conditionId: condition.conditionId, status: 'inconclusive', evidenceRefs, rationale: 'No matching finite observation is available.' }
  const met = condition.operator === 'eq' ? observation.value === condition.threshold : condition.operator === 'gt' ? observation.value > condition.threshold : condition.operator === 'gte' ? observation.value >= condition.threshold : condition.operator === 'lt' ? observation.value < condition.threshold : observation.value <= condition.threshold
  return { conditionId: condition.conditionId, status: met ? 'met' : 'not_met', evidenceRefs: refs([...evidenceRefs, ...observation.sourceRefs]), rationale: `Observed ${observation.value} ${condition.operator} ${condition.threshold}.` }
}

export function validateKillCriterionShape(condition: ThesisInvalidationCondition): void {
  if (condition.threshold !== undefined && (!finite(condition.threshold) || condition.observableMetric === undefined || condition.operator === undefined || !refs(condition.thresholdSourceRefs).length)) throw new Error('KILL_CRITERION_THRESHOLD_PROVENANCE_INVALID')
  if (condition.operator !== undefined && !KILL_CRITERION_OPERATORS.includes(condition.operator)) throw new Error('KILL_CRITERION_OPERATOR_INVALID')
}
