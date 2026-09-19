import type { ConsensusSnapshot, GuidanceConsensusComparisonInput, GuidanceConsensusRelationship, GuidanceRange, GuidanceRevisionInput, GuidanceRevisionResult, NumericRevision, PriorGuidanceSelectionInput, PriorGuidanceSelectionResult } from './contracts.ts'

const GUIDANCE_TYPES = new Set(['range', 'minimum', 'maximum', 'point', 'qualitative'])
const hasOwn = (value: object, key: string): boolean => Object.prototype.hasOwnProperty.call(value, key)
const text = (value: unknown): value is string => typeof value === 'string' && value.trim() !== ''
const timestamp = (value: unknown): number | undefined => typeof value === 'string' && Number.isFinite(Date.parse(value)) ? Date.parse(value) : undefined
const uniqueSorted = (values: readonly string[]): readonly string[] => [...new Set(values)].sort()
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)

function finiteMidpoint(low: number, high: number): number | undefined {
  const midpoint = (low >= 0 && high >= 0) || (low <= 0 && high <= 0)
    ? low + (high - low) / 2
    : low / 2 + high / 2
  return finite(midpoint) ? midpoint : undefined
}

function finiteDifference(left: number, right: number): number | undefined {
  const difference = left - right
  return finite(difference) ? difference : undefined
}

function normalizedText(value: unknown): unknown { return typeof value === 'string' ? value.trim() : value }

function normalizeGuidanceStrings(guidance: GuidanceRange): GuidanceRange {
  const sourceCandidateIds = Array.isArray(guidance.sourceCandidateIds) ? guidance.sourceCandidateIds.filter((value): value is string => typeof value === 'string').map((value) => value.trim()) : []
  const qualifiers = Array.isArray(guidance.qualifiers) ? guidance.qualifiers.filter((value): value is string => typeof value === 'string').map((value) => value.trim()) : []
  return {
    ...guidance,
    guidanceId: normalizedText(guidance.guidanceId) as string,
    metric: normalizedText(guidance.metric) as string,
    fiscalPeriod: normalizedText(guidance.fiscalPeriod) as string,
    ...(guidance.unit === undefined ? {} : { unit: normalizedText(guidance.unit) as string }),
    publishedAt: normalizedText(guidance.publishedAt) as string,
    sourceCandidateIds: uniqueSorted(sourceCandidateIds),
    qualifiers: uniqueSorted(qualifiers),
  }
}

function guidanceDiagnostics(guidance: GuidanceRange, analysisAsOf?: string): readonly string[] {
  const normalized = normalizeGuidanceStrings(guidance)
  const diagnostics: string[] = []
  if (!text(normalized.guidanceId)) diagnostics.push('guidanceId_required')
  if (!text(normalized.metric)) diagnostics.push('metric_required')
  if (!text(normalized.fiscalPeriod)) diagnostics.push('fiscalPeriod_required')
  if (!GUIDANCE_TYPES.has(normalized.guidanceType)) diagnostics.push('guidanceType_invalid')
  if (!Array.isArray(guidance.sourceCandidateIds) || normalized.sourceCandidateIds.length === 0 || guidance.sourceCandidateIds.some((value) => !text(value))) diagnostics.push('source_evidence_required')
  if (!Array.isArray(guidance.qualifiers) || guidance.qualifiers.some((value) => !text(value))) diagnostics.push('qualifiers_invalid')
  const published = timestamp(normalized.publishedAt)
  if (published === undefined) diagnostics.push('publishedAt_must_be_valid')
  let cutoff: number | undefined
  if (analysisAsOf !== undefined) {
    cutoff = timestamp(analysisAsOf)
    if (cutoff === undefined) diagnostics.push('analysisAsOf_must_be_valid')
    else if (published !== undefined && published > cutoff) diagnostics.push('publishedAt_after_analysisAsOf')
  }
  if (normalized.unit !== undefined && !text(normalized.unit)) diagnostics.push('unit_must_be_non_empty')
  for (const [name, value] of [['low', normalized.low], ['high', normalized.high], ['midpoint', normalized.midpoint]] as const) {
    if (hasOwn(guidance, name) && value !== undefined && !finite(value)) diagnostics.push(`${name}_must_be_finite`)
  }
  if (normalized.guidanceType === 'qualitative') {
    if (hasOwn(guidance, 'low') && guidance.low !== undefined || hasOwn(guidance, 'high') && guidance.high !== undefined || hasOwn(guidance, 'midpoint') && guidance.midpoint !== undefined) diagnostics.push('qualitative_must_not_contain_numeric_fields')
    if (normalized.qualifiers.length === 0) diagnostics.push('qualitative_qualifier_required')
  } else if (normalized.guidanceType === 'range') {
    if (!finite(normalized.low)) diagnostics.push('range_low_required')
    if (!finite(normalized.high)) diagnostics.push('range_high_required')
    if (!text(normalized.unit)) diagnostics.push('numeric_unit_required')
    if (finite(normalized.low) && finite(normalized.high) && normalized.low > normalized.high) diagnostics.push('range_low_must_not_exceed_high')
    if (finite(normalized.low) && finite(normalized.high)) {
      const midpoint = finiteMidpoint(normalized.low, normalized.high)
      if (midpoint === undefined) diagnostics.push('range_midpoint_not_finite')
      else if (normalized.midpoint !== undefined && finite(normalized.midpoint) && Math.abs(normalized.midpoint - midpoint) > 1e-12 * Math.max(1, Math.abs(midpoint))) diagnostics.push('range_midpoint_mismatch')
    }
  } else if (normalized.guidanceType === 'minimum') {
    if (!finite(normalized.low)) diagnostics.push('minimum_low_required')
    if (hasOwn(guidance, 'high') && guidance.high !== undefined) diagnostics.push('minimum_high_forbidden')
    if (hasOwn(guidance, 'midpoint') && guidance.midpoint !== undefined) diagnostics.push('minimum_midpoint_forbidden')
    if (!text(normalized.unit)) diagnostics.push('numeric_unit_required')
  } else if (normalized.guidanceType === 'maximum') {
    if (!finite(normalized.high)) diagnostics.push('maximum_high_required')
    if (hasOwn(guidance, 'low') && guidance.low !== undefined) diagnostics.push('maximum_low_forbidden')
    if (hasOwn(guidance, 'midpoint') && guidance.midpoint !== undefined) diagnostics.push('maximum_midpoint_forbidden')
    if (!text(normalized.unit)) diagnostics.push('numeric_unit_required')
  } else if (normalized.guidanceType === 'point') {
    if (!finite(normalized.midpoint)) diagnostics.push('point_midpoint_required')
    if (hasOwn(guidance, 'low') && guidance.low !== undefined) diagnostics.push('point_low_forbidden')
    if (hasOwn(guidance, 'high') && guidance.high !== undefined) diagnostics.push('point_high_forbidden')
    if (!text(normalized.unit)) diagnostics.push('numeric_unit_required')
  }
  return [...new Set(diagnostics)]
}

/** Validate one report-level Guidance object without inventing or repairing semantics. */
export function validateGuidanceRange(guidance: GuidanceRange, analysisAsOf: string): readonly string[] {
  return guidanceDiagnostics(guidance, analysisAsOf)
}

/** Normalize unordered Guidance collections and calculate range midpoint in code. */
export function normalizeGuidanceRange(guidance: GuidanceRange, analysisAsOf?: string): GuidanceRange | undefined {
  const normalized = normalizeGuidanceStrings(guidance)
  if (guidanceDiagnostics(normalized, analysisAsOf).length > 0) return undefined
  if (normalized.guidanceType === 'range') {
    const midpoint = finiteMidpoint(normalized.low!, normalized.high!)
    return midpoint === undefined ? undefined : { ...normalized, midpoint }
  }
  return normalized
}

function semanticGuidanceKey(guidance: GuidanceRange): string { return JSON.stringify(normalizeGuidanceRange(guidance)) }

function normalizedGuidances(guidances: readonly GuidanceRange[], analysisAsOf: string, diagnostics: string[]): readonly GuidanceRange[] {
  const byId = new Map<string, GuidanceRange[]>()
  for (const guidance of guidances) {
    const normalized = normalizeGuidanceRange(guidance)
    const validation = validateGuidanceRange(guidance, analysisAsOf)
    diagnostics.push(...validation.map((item) => `${guidance.guidanceId || 'unknown'}:${item}`))
    if (validation.length > 0 || normalized === undefined) continue
    byId.set(normalized.guidanceId, [...(byId.get(normalized.guidanceId) ?? []), normalized])
  }
  const result: GuidanceRange[] = []
  for (const [guidanceId, values] of [...byId.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    const unique = [...new Map(values.map((value) => [semanticGuidanceKey(value), value])).values()]
    if (unique.length > 1) { diagnostics.push(`duplicate_guidance_id:${guidanceId}`); continue }
    result.push(unique[0]!)
  }
  return result
}

/** Select the latest strictly earlier, point-in-time-compatible Guidance revision. */
export function selectPriorGuidance(input: PriorGuidanceSelectionInput): PriorGuidanceSelectionResult {
  const diagnostics: string[] = []
  const before = timestamp(input.beforePublishedAt)
  if (before === undefined) diagnostics.push('beforePublishedAt_must_be_valid')
  const candidates = normalizedGuidances(input.guidances, input.analysisAsOf, diagnostics).filter((guidance) => {
    const published = timestamp(guidance.publishedAt)
    return guidance.metric === input.metric && guidance.fiscalPeriod === input.fiscalPeriod && before !== undefined && published !== undefined && published < before
  })
  if (candidates.length === 0) return { diagnostics: [...new Set(diagnostics)].sort() }
  const latestTimestamp = Math.max(...candidates.map((guidance) => timestamp(guidance.publishedAt)!))
  const latest = candidates.filter((guidance) => timestamp(guidance.publishedAt) === latestTimestamp).sort((left, right) => semanticGuidanceKey(left).localeCompare(semanticGuidanceKey(right)))
  if (latest.length > 1) return { diagnostics: [...new Set([...diagnostics, 'ambiguous_prior_guidance'])].sort() }
  return { selected: latest[0], diagnostics: [...new Set(diagnostics)].sort() }
}

function revision(oldValue: number, newValue: number): NumericRevision | undefined {
  if (!finite(oldValue) || !finite(newValue)) return undefined
  const absoluteRevision = newValue - oldValue
  if (!Number.isFinite(absoluteRevision)) return undefined
  const relativeRevision = oldValue === 0 ? undefined : absoluteRevision / Math.abs(oldValue)
  if (relativeRevision !== undefined && !Number.isFinite(relativeRevision)) return undefined
  return { oldValue, newValue, absoluteRevision, ...(relativeRevision === undefined ? {} : { relativeRevision }) }
}

function midpointComparable(oldGuidance: GuidanceRange, newGuidance: GuidanceRange): boolean {
  return (oldGuidance.guidanceType === 'range' || oldGuidance.guidanceType === 'point') && (newGuidance.guidanceType === 'range' || newGuidance.guidanceType === 'point')
}

/** Compare compatible numeric Guidance revisions while preserving each shared dimension. */
export function buildGuidanceRevisionBridge(input: GuidanceRevisionInput): GuidanceRevisionResult | undefined {
  const oldGuidance = normalizeGuidanceRange(input.oldGuidance)
  const newGuidance = normalizeGuidanceRange(input.newGuidance)
  if (oldGuidance === undefined || newGuidance === undefined || oldGuidance.guidanceType === 'qualitative' || newGuidance.guidanceType === 'qualitative') return undefined
  const oldPublished = timestamp(oldGuidance.publishedAt)
  const newPublished = timestamp(newGuidance.publishedAt)
  if (oldPublished === undefined || newPublished === undefined || newPublished <= oldPublished || oldGuidance.metric !== newGuidance.metric || oldGuidance.fiscalPeriod !== newGuidance.fiscalPeriod || oldGuidance.unit !== newGuidance.unit) return undefined
  const lowEndRevision = oldGuidance.low !== undefined && newGuidance.low !== undefined ? revision(oldGuidance.low, newGuidance.low) : undefined
  const highEndRevision = oldGuidance.high !== undefined && newGuidance.high !== undefined ? revision(oldGuidance.high, newGuidance.high) : undefined
  const midpointRevision = midpointComparable(oldGuidance, newGuidance) && oldGuidance.midpoint !== undefined && newGuidance.midpoint !== undefined ? revision(oldGuidance.midpoint, newGuidance.midpoint) : undefined
  const oldWidth = oldGuidance.low !== undefined && oldGuidance.high !== undefined ? finiteDifference(oldGuidance.high, oldGuidance.low) : undefined
  const newWidth = newGuidance.low !== undefined && newGuidance.high !== undefined ? finiteDifference(newGuidance.high, newGuidance.low) : undefined
  const rangeWidthChange = oldWidth !== undefined && newWidth !== undefined ? revision(oldWidth, newWidth) : undefined
  if (lowEndRevision === undefined && highEndRevision === undefined && midpointRevision === undefined && rangeWidthChange === undefined) return undefined
  return { metric: newGuidance.metric, fiscalPeriod: newGuidance.fiscalPeriod, unit: newGuidance.unit!, oldGuidanceId: oldGuidance.guidanceId, newGuidanceId: newGuidance.guidanceId, oldGuidanceType: oldGuidance.guidanceType, newGuidanceType: newGuidance.guidanceType, oldPublishedAt: oldGuidance.publishedAt, newPublishedAt: newGuidance.publishedAt, ...(lowEndRevision === undefined ? {} : { lowEndRevision }), ...(highEndRevision === undefined ? {} : { highEndRevision }), ...(midpointRevision === undefined ? {} : { midpointRevision }), ...(rangeWidthChange === undefined ? {} : { rangeWidthChange }) }
}

function validConsensus(consensus: ConsensusSnapshot, analysisAsOf: string): boolean {
  const cutoff = timestamp(analysisAsOf)
  const asOf = timestamp(consensus.asOf)
  return text(consensus.metric) && text(consensus.fiscalPeriod) && text(consensus.unit) && asOf !== undefined && cutoff !== undefined && asOf <= cutoff && finite(consensus.mean) && finite(consensus.median) && finite(consensus.high) && finite(consensus.low) && (consensus.dispersion === undefined || finite(consensus.dispersion)) && Number.isInteger(consensus.count) && consensus.count >= 2 && Array.isArray(consensus.contributingEstimateIds) && consensus.contributingEstimateIds.length === consensus.count && new Set(consensus.contributingEstimateIds).size === consensus.count && consensus.contributingEstimateIds.every(text)
}

function relationship(guidance: GuidanceRange, mean: number): GuidanceConsensusRelationship | undefined {
  if (guidance.guidanceType === 'range') return mean < guidance.low! ? 'below_range' : mean > guidance.high! ? 'above_range' : 'inside_range'
  if (guidance.guidanceType === 'minimum') return mean < guidance.low! ? 'below_minimum' : 'at_or_above_minimum'
  if (guidance.guidanceType === 'maximum') return mean <= guidance.high! ? 'at_or_below_maximum' : 'above_maximum'
  if (guidance.guidanceType === 'point') return mean < guidance.midpoint! ? 'below_point' : mean > guidance.midpoint! ? 'above_point' : 'at_point'
  return undefined
}

/** Compare numeric Guidance with a point-in-time-compatible Consensus mean. */
export function compareGuidanceVsConsensus(input: GuidanceConsensusComparisonInput): import('./contracts.ts').GuidanceVsConsensusResult | undefined
export function compareGuidanceVsConsensus(guidance: GuidanceRange, consensus: ConsensusSnapshot, analysisAsOf: string): import('./contracts.ts').GuidanceVsConsensusResult | undefined
export function compareGuidanceVsConsensus(first: GuidanceConsensusComparisonInput | GuidanceRange, second?: ConsensusSnapshot, third?: string): import('./contracts.ts').GuidanceVsConsensusResult | undefined {
  const input = 'guidance' in first ? first : { guidance: first, consensus: second!, analysisAsOf: third! }
  const guidance = normalizeGuidanceRange(input.guidance)
  if (guidance === undefined || guidance.guidanceType === 'qualitative' || validateGuidanceRange(guidance, input.analysisAsOf).length > 0 || !validConsensus(input.consensus, input.analysisAsOf)) return undefined
  const guidancePublished = timestamp(guidance.publishedAt)!
  const consensusAsOf = timestamp(input.consensus.asOf)!
  if (consensusAsOf > guidancePublished || guidance.metric !== input.consensus.metric || guidance.fiscalPeriod !== input.consensus.fiscalPeriod || guidance.unit !== input.consensus.unit) return undefined
  const relation = relationship(guidance, input.consensus.mean)
  if (relation === undefined) return undefined
  const midpoint = guidance.guidanceType === 'range' || guidance.guidanceType === 'point' ? guidance.midpoint : undefined
  const absoluteDelta = midpoint === undefined ? undefined : midpoint - input.consensus.mean
  if (absoluteDelta !== undefined && !finite(absoluteDelta)) return undefined
  const relativeDelta = absoluteDelta === undefined || input.consensus.mean === 0 ? undefined : absoluteDelta / Math.abs(input.consensus.mean)
  if (relativeDelta !== undefined && !Number.isFinite(relativeDelta)) return undefined
  const direction = absoluteDelta === undefined ? undefined : absoluteDelta > 0 ? 'above' : absoluteDelta < 0 ? 'below' : 'in_line'
  return { metric: guidance.metric, fiscalPeriod: guidance.fiscalPeriod, unit: guidance.unit!, guidanceId: guidance.guidanceId, guidanceType: guidance.guidanceType, guidancePublishedAt: guidance.publishedAt, consensusAsOf: input.consensus.asOf, consensusMean: input.consensus.mean, relationship: relation, ...(midpoint === undefined ? {} : { guidanceMidpoint: midpoint }), ...(absoluteDelta === undefined ? {} : { absoluteDelta }), ...(relativeDelta === undefined ? {} : { relativeDelta }), ...(direction === undefined ? {} : { direction }) }
}

export const findPriorGuidance = selectPriorGuidance
export const selectPreviousGuidance = selectPriorGuidance
export const calculateGuidanceRevision = buildGuidanceRevisionBridge
export const guidanceRevisionBridge = buildGuidanceRevisionBridge
export const compareGuidanceRevision = buildGuidanceRevisionBridge
