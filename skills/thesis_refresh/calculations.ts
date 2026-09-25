import { KILL_OPERATORS, REFRESH_EVIDENCE_RELATIONS, ThesisRefreshError, type KillCriterion, type KillCriterionAssessment, type RefreshEvidence, type PropositionRefreshDelta, type PriorThesisSnapshot, type ThesisRefreshInput, type ThesisRefreshResult, type ThesisRefreshTransition } from './contracts.ts'

const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,95}$/
const text = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)
const unique = (values: readonly string[]): readonly string[] => [...new Set(values)].sort((a, b) => a.localeCompare(b))
const refs = (values: readonly string[] | undefined): readonly string[] => unique((values ?? []).filter((value): value is string => text(value)))

function blocked(input: ThesisRefreshInput, diagnostics: readonly string[]): ThesisRefreshResult {
  return { status: 'blocked', currentAsOf: input.currentAsOf, propositionDeltas: [], unchangedPropositionRefs: [], killCriterionAssessments: [], candidateTransition: 'requires_review', diagnostics }
}

function validateEvidence(evidence: RefreshEvidence, propositionRefs: ReadonlySet<string>): void {
  if (!ID.test(evidence.evidenceId) || !text(evidence.publishedAt) || Number.isNaN(Date.parse(evidence.publishedAt)) || !REFRESH_EVIDENCE_RELATIONS.includes(evidence.relation)) throw new ThesisRefreshError('REFRESH_EVIDENCE_INVALID')
  if (refs(evidence.targetPropositionRefs).length === 0 && evidence.relation !== 'context' && evidence.relation !== 'irrelevant') throw new ThesisRefreshError('REFRESH_EVIDENCE_PROPOSITION_REF_INVALID')
  if (refs(evidence.targetPropositionRefs).some((ref) => !propositionRefs.has(ref))) throw new ThesisRefreshError('REFRESH_EVIDENCE_PROPOSITION_REF_INVALID')
  if (refs(evidence.sourceRefs).length === 0) throw new ThesisRefreshError('REFRESH_EVIDENCE_SOURCE_MISSING')
  if (evidence.value !== undefined && !finite(evidence.value)) throw new ThesisRefreshError('REFRESH_EVIDENCE_VALUE_INVALID')
}

function validateCriterion(criterion: KillCriterion, propositionRefs: ReadonlySet<string>): void {
  if (!ID.test(criterion.conditionId) || refs(criterion.targetPropositionRefs).length === 0 || refs(criterion.targetPropositionRefs).some((ref) => !propositionRefs.has(ref))) throw new ThesisRefreshError('KILL_CRITERION_REF_INVALID')
  if (criterion.operator !== undefined && !KILL_OPERATORS.includes(criterion.operator)) throw new ThesisRefreshError('KILL_CRITERION_OPERATOR_INVALID')
  if (criterion.threshold !== undefined && !finite(criterion.threshold)) throw new ThesisRefreshError('KILL_CRITERION_THRESHOLD_INVALID')
  if (criterion.deadline !== undefined && (Number.isNaN(Date.parse(criterion.deadline)) || !text(criterion.deadline))) throw new ThesisRefreshError('KILL_CRITERION_DEADLINE_INVALID')
  if (criterion.threshold !== undefined && (criterion.observableMetric === undefined || criterion.operator === undefined)) throw new ThesisRefreshError('KILL_CRITERION_PREDICATE_INCOMPLETE')
  if (criterion.threshold !== undefined && refs(criterion.thresholdSourceRefs).length === 0) throw new ThesisRefreshError('KILL_CRITERION_THRESHOLD_SOURCE_MISSING')
}

function evaluateCriterion(criterion: KillCriterion, evidence: readonly RefreshEvidence[], currentAsOf: string): KillCriterionAssessment {
  const targetRefs = new Set(refs(criterion.targetPropositionRefs))
  const candidates = evidence.filter((item) => refs(item.targetPropositionRefs).some((ref) => targetRefs.has(ref)) && (criterion.observableMetric === undefined || item.metric === criterion.observableMetric) && (criterion.period === undefined || item.period === criterion.period))
  if (criterion.deadline !== undefined && Date.parse(currentAsOf) < Date.parse(criterion.deadline) && candidates.length === 0) return { conditionId: criterion.conditionId, status: 'not_yet_observable', targetPropositionRefs: refs(criterion.targetPropositionRefs), evidenceRefs: [], rationale: 'The deadline has not arrived and no matching observation is available.' }
  if (criterion.threshold === undefined || criterion.operator === undefined || criterion.observableMetric === undefined) return { conditionId: criterion.conditionId, status: 'threshold_pending_evidence', targetPropositionRefs: refs(criterion.targetPropositionRefs), evidenceRefs: candidates.map((item) => item.evidenceId), rationale: 'No evidence-backed deterministic threshold was supplied.' }
  const observed = candidates.find((item) => finite(item.value))
  if (!observed) return { conditionId: criterion.conditionId, status: 'inconclusive', targetPropositionRefs: refs(criterion.targetPropositionRefs), evidenceRefs: candidates.map((item) => item.evidenceId), rationale: 'A matching source exists but no finite observation value is available.' }
  const value = observed.value!
  const threshold = criterion.threshold
  const met = criterion.operator === 'eq' ? value === threshold : criterion.operator === 'gt' ? value > threshold : criterion.operator === 'gte' ? value >= threshold : criterion.operator === 'lt' ? value < threshold : value <= threshold
  return { conditionId: criterion.conditionId, status: met ? 'met' : 'not_met', targetPropositionRefs: refs(criterion.targetPropositionRefs), evidenceRefs: [observed.evidenceId], rationale: `Observed ${value} ${criterion.operator} ${threshold} for ${criterion.observableMetric}.` }
}

function candidateForRelation(relation: RefreshEvidence['relation']): PropositionRefreshDelta['candidateStatus'] {
  if (relation === 'supports') return 'strengthened'
  if (relation === 'weakens') return 'weakened'
  if (relation === 'contradicts') return 'challenged'
  return 'unchanged'
}

export function refreshThesis(input: ThesisRefreshInput): ThesisRefreshResult {
  if (!input || !text(input.currentAsOf) || Number.isNaN(Date.parse(input.currentAsOf))) throw new ThesisRefreshError('REFRESH_ASOF_INVALID')
  if (!input.priorSnapshot) return blocked(input, ['prior_thesis_snapshot_required'])
  const prior: PriorThesisSnapshot = input.priorSnapshot
  if (!text(prior.thesisId) || !text(prior.priorAsOf) || Number.isNaN(Date.parse(prior.priorAsOf)) || !Array.isArray(prior.propositions) || prior.propositions.length === 0) return blocked(input, ['prior_thesis_snapshot_invalid'])
  if (Date.parse(prior.priorAsOf) >= Date.parse(input.currentAsOf)) return blocked(input, ['prior_as_of_must_precede_current_as_of'])
  const propositions = new Map(prior.propositions.map((item) => [item.propositionId, item]))
  if (propositions.size !== prior.propositions.length || [...propositions.keys()].some((ref) => !ID.test(ref))) throw new ThesisRefreshError('PRIOR_PROPOSITION_ID_INVALID')
  const diagnostics: string[] = []
  const validEvidence: RefreshEvidence[] = []
  for (const evidence of input.evidence.slice(0, 80)) {
    try { validateEvidence(evidence, new Set(propositions.keys())) }
    catch (error) { diagnostics.push(error instanceof ThesisRefreshError ? `${evidence.evidenceId}:${error.code}` : `${evidence.evidenceId}:REFRESH_EVIDENCE_INVALID`); continue }
    const published = Date.parse(evidence.publishedAt)
    if (published <= Date.parse(prior.priorAsOf)) { diagnostics.push(`${evidence.evidenceId}:old_evidence_ignored`); continue }
    if (published > Date.parse(input.currentAsOf)) { diagnostics.push(`${evidence.evidenceId}:future_evidence_rejected`); continue }
    validEvidence.push({ ...evidence, targetPropositionRefs: refs(evidence.targetPropositionRefs), sourceRefs: refs(evidence.sourceRefs) })
  }
  const criteria = input.killCriteria ?? []
  for (const criterion of criteria) validateCriterion(criterion, new Set(propositions.keys()))
  const criterionAssessments = criteria.map((criterion) => evaluateCriterion(criterion, validEvidence, input.currentAsOf))
  const deltas: PropositionRefreshDelta[] = []
  const changed = new Set<string>()
  for (const proposition of prior.propositions) {
    const evidence = validEvidence.filter((item) => refs(item.targetPropositionRefs).includes(proposition.propositionId) && item.relation !== 'context' && item.relation !== 'irrelevant')
    if (evidence.length === 0) continue
    const latest = evidence[evidence.length - 1]!
    const candidateStatus = latest.basis === 'hypothesis' ? 'insufficient_evidence' : candidateForRelation(latest.relation)
    if (candidateStatus !== 'unchanged') changed.add(proposition.propositionId)
    deltas.push({ propositionRef: proposition.propositionId, previousStatus: proposition.status ?? 'unknown', newEvidenceRelation: latest.relation, supportChange: candidateStatus, candidateStatus, sourceRefs: refs(evidence.flatMap((item) => item.sourceRefs)), rationale: latest.statement ?? `New evidence ${latest.relation} the proposition.` })
  }
  const killMet = criterionAssessments.some((item) => item.status === 'met')
  const changedDeltas = deltas.filter((item) => item.candidateStatus !== 'unchanged')
  let candidateTransition: ThesisRefreshTransition = killMet ? 'invalidation_condition_met' : changedDeltas.some((item) => item.candidateStatus === 'challenged') ? 'possible_invalidation' : changedDeltas.some((item) => item.candidateStatus === 'weakened') ? 'weakened' : changedDeltas.some((item) => item.candidateStatus === 'strengthened') ? 'strengthened' : 'unchanged'
  if (changedDeltas.some((item) => item.candidateStatus === 'insufficient_evidence') || criterionAssessments.some((item) => item.status === 'inconclusive' || item.status === 'threshold_pending_evidence')) candidateTransition = 'requires_review'
  if (diagnostics.some((item) => item.endsWith('future_evidence_rejected'))) diagnostics.push('future_evidence_was_not_applied')
  const status: ThesisRefreshResult['status'] = candidateTransition === 'unchanged' && diagnostics.length === 0 ? 'complete' : candidateTransition === 'requires_review' || diagnostics.length > 0 ? 'partial' : 'complete'
  return { status, thesisId: prior.thesisId, priorAsOf: prior.priorAsOf, currentAsOf: input.currentAsOf, propositionDeltas: deltas, unchangedPropositionRefs: prior.propositions.map((item) => item.propositionId).filter((ref) => !changed.has(ref)), killCriterionAssessments: criterionAssessments, candidateTransition, diagnostics }
}
