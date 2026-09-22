import { normalizeGuidanceRange, validateGuidanceRange } from '../../skills/earnings-review/expectations/guidance.ts'
import { validateSegmentKpiPoint } from '../../skills/earnings-review/expectations/segment-kpi.ts'
import type { GuidanceRange, SegmentKpiPoint } from '../../skills/earnings-review/expectations/contracts.ts'
import type { FormalGuidanceCandidate, KpiCandidate } from '../../skills/management-communication-extraction/contracts.ts'
import { parseNumericRange, parseNumericToken } from './numeric-parsing.ts'
import { resolveUnit } from './unit-normalization.ts'

export interface ProjectionResult {
  readonly guidance: readonly GuidanceRange[]
  readonly segmentKpis: readonly SegmentKpiPoint[]
  readonly diagnostics: readonly string[]
}

export function projectValidatedCandidates(
  guidances: readonly FormalGuidanceCandidate[],
  kpis: readonly KpiCandidate[],
  analysisAsOf: string,
  segmentIdentityMap: Readonly<Record<string, string>> = {},
): ProjectionResult {
  const guidance: GuidanceRange[] = []; const segmentKpis: SegmentKpiPoint[] = []; const diagnostics: string[] = []
  for (const candidate of guidances) {
    const result = projectGuidance(candidate, analysisAsOf)
    if (result.value === undefined) diagnostics.push(`${candidate.candidateId}:${result.diagnostic}`)
    else guidance.push(result.value)
  }
  for (const candidate of kpis) {
    const result = projectKpi(candidate, segmentIdentityMap)
    if (result.value === undefined) diagnostics.push(`${candidate.candidateId}:${result.diagnostic}`)
    else segmentKpis.push(result.value)
  }
  return { guidance: dedupeGuidance(guidance), segmentKpis: dedupeKpis(segmentKpis), diagnostics: [...new Set(diagnostics)].sort() }
}

function projectGuidance(candidate: FormalGuidanceCandidate, analysisAsOf: string): { readonly value?: GuidanceRange; readonly diagnostic?: string } {
  if (candidate.sourceAuthority !== 'S0_STATUTORY') return { diagnostic: 'FORMAL_GUIDANCE_AUTHORITY_INVALID' }
  if (candidate.fiscalPeriod === undefined) return { diagnostic: 'FORMAL_GUIDANCE_PERIOD_UNAVAILABLE' }
  if (candidate.guidanceType === 'qualitative') {
    const qualitative: GuidanceRange = { guidanceId: candidate.candidateId, metric: candidate.metric, fiscalPeriod: candidate.fiscalPeriod, guidanceType: 'qualitative', publishedAt: candidate.publishedAt, sourceCandidateIds: [candidate.sourceObjectId], qualifiers: candidate.qualifiers }
    const errors = validateGuidanceRange(qualitative, analysisAsOf)
    return errors.length === 0 ? { value: qualitative } : { diagnostic: errors.join('|') }
  }
  const text = candidate.evidenceSpan.exactText ?? ''
  const unit = resolveUnit(candidate.rawUnit, text)
  if (unit === undefined) return { diagnostic: 'GUIDANCE_UNIT_UNAVAILABLE' }
  const low = candidate.guidanceType === 'range' || candidate.guidanceType === 'minimum' ? parseNumericToken(candidate.rawLow) : undefined
  const high = candidate.guidanceType === 'range' || candidate.guidanceType === 'maximum' ? parseNumericToken(candidate.rawHigh) : undefined
  const point = candidate.guidanceType === 'point' ? parseNumericToken(candidate.rawPoint) : undefined
  if (candidate.guidanceType === 'range' && (low === undefined || high === undefined || parseNumericRange(`${candidate.rawLow}-${candidate.rawHigh}`) === undefined)) return { diagnostic: 'GUIDANCE_RANGE_INVALID' }
  if (candidate.guidanceType === 'minimum' && low === undefined) return { diagnostic: 'GUIDANCE_MINIMUM_INVALID' }
  if (candidate.guidanceType === 'maximum' && high === undefined) return { diagnostic: 'GUIDANCE_MAXIMUM_INVALID' }
  if (candidate.guidanceType === 'point' && point === undefined) return { diagnostic: 'GUIDANCE_POINT_INVALID' }
  const lowValue = low === undefined ? undefined : low.value * unit.factor
  const highValue = high === undefined ? undefined : high.value * unit.factor
  const pointValue = point === undefined ? undefined : point.value * unit.factor
  const midpoint = candidate.guidanceType === 'range' ? finiteMidpoint(lowValue!, highValue!) : pointValue
  const projected: GuidanceRange = { guidanceId: candidate.candidateId, metric: candidate.metric, fiscalPeriod: candidate.fiscalPeriod, ...(lowValue === undefined ? {} : { low: lowValue }), ...(highValue === undefined ? {} : { high: highValue }), ...(midpoint === undefined ? {} : { midpoint }), unit: unit.canonical, guidanceType: candidate.guidanceType, publishedAt: candidate.publishedAt, sourceCandidateIds: [candidate.sourceObjectId], qualifiers: candidate.qualifiers }
  const errors = validateGuidanceRange(projected, analysisAsOf)
  return errors.length === 0 ? { value: normalizeGuidanceRange(projected, analysisAsOf) } : { diagnostic: errors.join('|') }
}

function projectKpi(candidate: KpiCandidate, segmentIdentityMap: Readonly<Record<string, string>>): { readonly value?: SegmentKpiPoint; readonly diagnostic?: string } {
  if (candidate.rawSegmentLabel === undefined) return { diagnostic: 'KPI_SEGMENT_IDENTITY_UNAVAILABLE' }
  const segmentKey = segmentIdentityMap[normalizeLabel(candidate.rawSegmentLabel)]
  if (segmentKey === undefined || segmentKey.trim() === '') return { diagnostic: 'KPI_SEGMENT_IDENTITY_UNAVAILABLE' }
  if (candidate.fiscalPeriod === undefined) return { diagnostic: 'KPI_PERIOD_UNAVAILABLE' }
  const numeric = parseNumericToken(candidate.rawValue)
  if (numeric === undefined || parseNumericRange(candidate.rawValue) !== undefined) return { diagnostic: 'KPI_VALUE_NOT_SINGLE_CANONICAL_NUMBER' }
  const unit = resolveUnit(candidate.rawUnit, candidate.evidenceSpan.exactText ?? '')
  if (unit === undefined) return { diagnostic: 'KPI_UNIT_UNAVAILABLE' }
  const point: SegmentKpiPoint = { segmentKey: segmentKey.trim(), metric: candidate.metric, fiscalPeriod: candidate.fiscalPeriod, value: numeric.value * unit.factor, unit: unit.canonical, sourceCandidateIds: [candidate.sourceObjectId] }
  const errors = validateSegmentKpiPoint(point)
  return errors.length === 0 ? { value: point } : { diagnostic: errors.join('|') }
}

function normalizeLabel(value: string): string { return value.normalize('NFKC').replace(/\s+/g, '').trim().toLowerCase() }
function finiteMidpoint(low: number, high: number): number | undefined { const midpoint = (low >= 0 && high >= 0) || (low <= 0 && high <= 0) ? low + (high - low) / 2 : low / 2 + high / 2; return Number.isFinite(midpoint) ? midpoint : undefined }
function dedupeGuidance(values: readonly GuidanceRange[]): readonly GuidanceRange[] { return [...new Map(values.map((value) => [value.guidanceId, value])).values()].sort((left, right) => left.guidanceId.localeCompare(right.guidanceId)) }
function dedupeKpis(values: readonly SegmentKpiPoint[]): readonly SegmentKpiPoint[] { return [...new Map(values.map((value) => [JSON.stringify([value.segmentKey, value.metric, value.fiscalPeriod, value.unit, value.sourceCandidateIds]), value])).values()].sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right))) }
