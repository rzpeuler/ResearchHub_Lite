import type { ExecutionAssessment, ManagementCommitment, ManagementExecutionAssessment, ManagementExecutionInput, ManagementExecutionResult, ManagementOutcome } from './contracts.ts'

const finite = (value: number | undefined): value is number => value !== undefined && Number.isFinite(value)
const text = (value: string | undefined): boolean => typeof value === 'string' && value.trim() !== ''
const unique = (values: readonly string[]): string[] => [...new Set(values.filter((value) => value.trim() !== ''))]
const date = (value: string | undefined): boolean => text(value) && !Number.isNaN(Date.parse(value!))

function outcomeFor(commitment: ManagementCommitment, outcomes: readonly ManagementOutcome[]): ManagementOutcome | undefined {
  return outcomes.filter((item) => item.commitmentId === commitment.id).sort((a, b) => a.observedAt.localeCompare(b.observedAt)).find((item) => item.period === commitment.targetPeriod)
}

function assess(commitment: ManagementCommitment, outcome: ManagementOutcome | undefined, asOf: string): ManagementExecutionAssessment {
  const diagnostics: string[] = []
  const sourceRefs = unique([...commitment.sourceRefs, ...(outcome?.sourceRefs ?? [])])
  const target = { ...(commitment.targetLow === undefined ? {} : { low: commitment.targetLow }), ...(commitment.targetHigh === undefined ? {} : { high: commitment.targetHigh }), ...(commitment.targetUnit === undefined ? {} : { unit: commitment.targetUnit }) }
  const targetOutput = Object.keys(target).length === 0 ? undefined : target
  if (!date(commitment.publishedAt) || Date.parse(commitment.publishedAt) > Date.parse(asOf)) diagnostics.push('commitment publication is outside the as-of boundary')
  if (commitment.sourceRefs.length === 0) diagnostics.push('commitment requires source references')
  if (outcome === undefined) {
    const notYet = commitment.targetEndDate !== undefined && date(commitment.targetEndDate) && Date.parse(asOf) < Date.parse(commitment.targetEndDate)
    return { commitmentId: commitment.id, targetMetric: commitment.targetMetric, targetPeriod: commitment.targetPeriod, assessment: diagnostics.length > 0 ? 'inconclusive' : notYet ? 'not_yet_observable' : 'inconclusive', ...(targetOutput === undefined ? {} : { target: targetOutput }), sourceRefs, diagnostics: unique(diagnostics) }
  }
  if (outcome.observedAt && date(outcome.observedAt) && Date.parse(outcome.observedAt) > Date.parse(asOf)) diagnostics.push('outcome is after the as-of boundary')
  if (outcome.sourceRefs.length === 0) diagnostics.push('outcome requires source references')
  if (outcome.unit !== undefined && commitment.targetUnit !== undefined && outcome.unit !== commitment.targetUnit) diagnostics.push('outcome unit does not match commitment unit')
  if (diagnostics.length > 0) return { commitmentId: commitment.id, targetMetric: commitment.targetMetric, targetPeriod: commitment.targetPeriod, assessment: 'inconclusive', ...(targetOutput === undefined ? {} : { target: targetOutput }), outcome: { ...(outcome.value === undefined ? {} : { value: outcome.value }), ...(outcome.unit === undefined ? {} : { unit: outcome.unit }), ...(outcome.statement === undefined ? {} : { statement: outcome.statement }) }, sourceRefs, diagnostics: unique(diagnostics) }
  if (commitment.targetType === 'qualitative') {
    const qualitativeDiagnostic = outcome.qualitativeResult === undefined ? 'qualitative outcome lacks a deterministic predicate; semantic adjudication required' : 'caller-supplied qualitative result is non-authoritative; semantic adjudication required'
    return { commitmentId: commitment.id, targetMetric: commitment.targetMetric, targetPeriod: commitment.targetPeriod, assessment: 'inconclusive', ...(targetOutput === undefined ? {} : { target: targetOutput }), outcome: { ...(outcome.value === undefined ? {} : { value: outcome.value }), ...(outcome.unit === undefined ? {} : { unit: outcome.unit }), ...(outcome.statement === undefined ? {} : { statement: outcome.statement }) }, sourceRefs, diagnostics: [qualitativeDiagnostic] }
  }
  if (!finite(outcome.value)) return { commitmentId: commitment.id, targetMetric: commitment.targetMetric, targetPeriod: commitment.targetPeriod, assessment: 'inconclusive', ...(targetOutput === undefined ? {} : { target: targetOutput }), outcome: { ...(outcome.unit === undefined ? {} : { unit: outcome.unit }), ...(outcome.statement === undefined ? {} : { statement: outcome.statement }) }, sourceRefs, diagnostics: ['numeric outcome is unavailable'] }
  const value = outcome.value
  const assessment: ExecutionAssessment = commitment.targetType === 'numeric_range'
    ? finite(commitment.targetLow) && finite(commitment.targetHigh) ? value >= commitment.targetLow! && value <= commitment.targetHigh! ? 'met' : 'not_met' : 'inconclusive'
    : commitment.targetType === 'numeric_at_least'
      ? finite(commitment.targetLow) ? value >= commitment.targetLow! ? 'met' : 'not_met' : 'inconclusive'
      : finite(commitment.targetHigh) ? value <= commitment.targetHigh! ? 'met' : 'not_met' : 'inconclusive'
  return { commitmentId: commitment.id, targetMetric: commitment.targetMetric, targetPeriod: commitment.targetPeriod, assessment, ...(targetOutput === undefined ? {} : { target: targetOutput }), outcome: { value, ...(outcome.unit === undefined ? {} : { unit: outcome.unit }), ...(outcome.statement === undefined ? {} : { statement: outcome.statement }) }, sourceRefs, diagnostics: [] }
}

function validCommitment(item: ManagementCommitment): string[] {
  const diagnostics: string[] = []
  if (!text(item.id) || !text(item.statement) || !text(item.speaker) || !text(item.targetMetric) || !text(item.targetPeriod)) diagnostics.push(`commitment ${item.id} is missing required identity fields`)
  if (!date(item.publishedAt) || item.sourceRefs.length === 0) diagnostics.push(`commitment ${item.id} lacks attributable publication evidence`)
  if (item.targetType === 'numeric_range' && (!finite(item.targetLow) || !finite(item.targetHigh) || item.targetLow! > item.targetHigh!)) diagnostics.push(`commitment ${item.id} has an invalid numeric range`)
  if (item.targetType === 'numeric_at_least' && !finite(item.targetLow)) diagnostics.push(`commitment ${item.id} lacks a lower target bound`)
  if (item.targetType === 'numeric_at_most' && !finite(item.targetHigh)) diagnostics.push(`commitment ${item.id} lacks an upper target bound`)
  if (item.targetType === 'qualitative' && !text(item.qualitativeCondition)) diagnostics.push(`commitment ${item.id} lacks a qualitative condition`)
  return diagnostics
}

export function assessManagementExecution(input: ManagementExecutionInput): ManagementExecutionResult {
  const diagnostics: string[] = []
  if (!text(input.companyRef) || !date(input.asOf)) diagnostics.push('companyRef and ISO-compatible asOf are required')
  const ids = new Set<string>()
  for (const item of input.commitments) {
    if (ids.has(item.id)) diagnostics.push(`duplicate commitment ${item.id}`)
    ids.add(item.id)
    diagnostics.push(...validCommitment(item))
  }
  const assessments = input.commitments.map((item) => assess(item, outcomeFor(item, input.outcomes), input.asOf))
  const allDiagnostics = unique([...diagnostics, ...assessments.flatMap((item) => item.diagnostics)])
  const available = assessments.filter((item) => item.assessment !== 'inconclusive')
  const status: ManagementExecutionResult['status'] = available.length === 0 ? 'unavailable' : allDiagnostics.length === 0 && available.length === assessments.length ? 'complete' : 'partial'
  return { status, companyRef: input.companyRef, assessments, diagnostics: allDiagnostics, asOf: input.asOf }
}
