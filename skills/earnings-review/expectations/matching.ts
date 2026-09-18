import type { EstimatePoint, EstimateSelectionInput, EstimateSelectionResult, PriorEstimateSelectionInput } from './contracts.ts'

function text(value: unknown): value is string { return typeof value === 'string' && value.trim() !== '' }
function timestamp(value: string): number | undefined { const parsed = Date.parse(value); return Number.isFinite(parsed) ? parsed : undefined }
function estimateOrder(left: EstimatePoint, right: EstimatePoint): number {
  return left.institutionKey.localeCompare(right.institutionKey) || timestamp(right.publishedAt)! - timestamp(left.publishedAt)! || right.estimateId.localeCompare(left.estimateId)
}

/** Return safe structural diagnostics without allocating canonical IDs. */
export function validateEstimatePoint(point: EstimatePoint): readonly string[] {
  const diagnostics: string[] = []
  if (!text(point.estimateId)) diagnostics.push('estimateId_required')
  if (!text(point.metric)) diagnostics.push('metric_required')
  if (!text(point.fiscalPeriod)) diagnostics.push('fiscalPeriod_required')
  if (!Number.isFinite(point.value)) diagnostics.push('value_must_be_finite')
  if (!text(point.unit)) diagnostics.push('unit_required')
  if (!text(point.institutionKey)) diagnostics.push('institution_required')
  if (!text(point.publishedAt) || timestamp(point.publishedAt) === undefined) diagnostics.push('publishedAt_must_be_valid')
  if (!Array.isArray(point.sourceCandidateIds) || point.sourceCandidateIds.length === 0 || point.sourceCandidateIds.some((item) => !text(item))) diagnostics.push('source_evidence_required')
  return diagnostics
}

function unique(values: readonly string[]): readonly string[] { return [...new Set(values)] }

/** Filter malformed and post-cutoff estimates while preserving deterministic order. */
export function filterPointInTimeEstimates(estimates: readonly EstimatePoint[], asOf: string): readonly EstimatePoint[] {
  const cutoff = timestamp(asOf)
  if (cutoff === undefined) return []
  return estimates.filter((estimate) => {
    const diagnostics = validateEstimatePoint(estimate)
    const published = timestamp(estimate.publishedAt)
    return diagnostics.length === 0 && published !== undefined && published <= cutoff
  }).slice().sort(estimateOrder)
}

/** Select one latest, point-in-time estimate per institution for one metric/period. */
export function selectLatestEstimatesPerInstitution(input: EstimateSelectionInput): EstimateSelectionResult {
  const diagnostics: string[] = []
  const excluded: string[] = []
  const cutoff = timestamp(input.asOf)
  if (cutoff === undefined) return { selected: [], excludedEstimateIds: input.estimates.map((estimate) => estimate.estimateId), diagnostics: ['asOf_must_be_valid'] }
  const candidates: EstimatePoint[] = []
  const seenIds = new Set<string>()
  for (const estimate of input.estimates) {
    const validation = validateEstimatePoint(estimate)
    if (validation.length > 0) { diagnostics.push(...validation.map((item) => `${estimate.estimateId || 'unknown'}:${item}`)); if (text(estimate.estimateId)) excluded.push(estimate.estimateId); continue }
    if (seenIds.has(estimate.estimateId)) { diagnostics.push(`${estimate.estimateId}:duplicate_estimateId`); excluded.push(estimate.estimateId); continue }
    seenIds.add(estimate.estimateId)
    const published = timestamp(estimate.publishedAt)!
    if (published > cutoff) { diagnostics.push(`${estimate.estimateId}:published_after_asOf`); excluded.push(estimate.estimateId); continue }
    if (estimate.metric !== input.metric || estimate.fiscalPeriod !== input.fiscalPeriod) { excluded.push(estimate.estimateId); continue }
    candidates.push(estimate)
  }
  const latest = new Map<string, EstimatePoint>()
  for (const estimate of candidates.sort(estimateOrder)) {
    const prior = latest.get(estimate.institutionKey)
    if (prior === undefined || estimateOrder(estimate, prior) < 0) latest.set(estimate.institutionKey, estimate)
    else excluded.push(estimate.estimateId)
  }
  return { selected: [...latest.values()].sort(estimateOrder), excludedEstimateIds: unique(excluded), diagnostics: unique(diagnostics) }
}

/** Select the latest estimate strictly before a named institution's comparison point. */
export function selectPriorEstimate(input: PriorEstimateSelectionInput): EstimatePoint | undefined {
  const before = timestamp(input.beforePublishedAt)
  const cutoff = timestamp(input.analysisAsOf)
  if (before === undefined || cutoff === undefined || !text(input.institutionKey)) return undefined
  return input.estimates.filter((estimate) => {
    const published = timestamp(estimate.publishedAt)
    return validateEstimatePoint(estimate).length === 0 && estimate.metric === input.metric && estimate.fiscalPeriod === input.fiscalPeriod && estimate.institutionKey === input.institutionKey && published !== undefined && published <= cutoff && published < before
  }).slice().sort(estimateOrder)[0]
}

export const selectLatestInstitutionEstimates = selectLatestEstimatesPerInstitution
export const findPriorEstimate = selectPriorEstimate
