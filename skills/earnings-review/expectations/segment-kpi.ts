import type { NumericDelta, SegmentKpiDeltaInput, SegmentKpiDeltaResult, SegmentKpiPoint } from './contracts.ts'

const text = (value: unknown): value is string => typeof value === 'string' && value.trim() !== ''
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)
const uniqueSorted = (values: readonly string[]): readonly string[] => [...new Set(values)].sort()

/** Return the exact prior fiscal period for the repository's Earnings period convention. */
export function comparableFiscalPeriod(period: string): string | undefined {
  const match = /^(\d{4})-(FY|H1|Q1|Q3)$/u.exec(period.trim())
  if (match === null) return undefined
  return `${Number(match[1]) - 1}-${match[2]}`
}

export function validateSegmentKpiPoint(point: SegmentKpiPoint): readonly string[] {
  const diagnostics: string[] = []
  if (!text(point.segmentKey)) diagnostics.push('segmentKey_required')
  if (!text(point.metric)) diagnostics.push('metric_required')
  if (!text(point.fiscalPeriod)) diagnostics.push('fiscalPeriod_required')
  if (!finite(point.value)) diagnostics.push('value_must_be_finite')
  if (!text(point.unit)) diagnostics.push('unit_required')
  if (!Array.isArray(point.sourceCandidateIds) || point.sourceCandidateIds.length === 0 || point.sourceCandidateIds.some((value) => !text(value))) diagnostics.push('source_evidence_required')
  return diagnostics
}

/** Normalize source identity without mutating the caller's Segment KPI point. */
export function normalizeSegmentKpiPoint(point: SegmentKpiPoint): SegmentKpiPoint | undefined {
  if (validateSegmentKpiPoint(point).length > 0) return undefined
  const sourceCandidateIds = point.sourceCandidateIds.filter((value): value is string => typeof value === 'string').map((value) => value.trim())
  return { segmentKey: point.segmentKey.trim(), metric: point.metric.trim(), fiscalPeriod: point.fiscalPeriod.trim(), value: point.value, unit: point.unit.trim(), sourceCandidateIds: uniqueSorted(sourceCandidateIds) }
}

function delta(benchmark: number, actual: number): NumericDelta | undefined {
  const absoluteDelta = actual - benchmark
  if (!Number.isFinite(absoluteDelta)) return undefined
  const relativeDelta = benchmark === 0 ? undefined : absoluteDelta / Math.abs(benchmark)
  if (relativeDelta !== undefined && !Number.isFinite(relativeDelta)) return undefined
  return { benchmark, actual, absoluteDelta, ...(relativeDelta === undefined ? {} : { relativeDelta }), direction: absoluteDelta > 0 ? 'above' : absoluteDelta < 0 ? 'below' : 'in_line' }
}

/** Compare a current Segment KPI to explicitly supplied prior and/or expectation points. */
export function compareSegmentKpi(input: SegmentKpiDeltaInput): SegmentKpiDeltaResult | undefined {
  const current = normalizeSegmentKpiPoint(input.current)
  const priorSupplied = input.priorComparable !== undefined
  const expectationSupplied = input.expectation !== undefined
  const prior = input.priorComparable === undefined ? undefined : normalizeSegmentKpiPoint(input.priorComparable)
  const expectation = input.expectation === undefined ? undefined : normalizeSegmentKpiPoint(input.expectation)
  if (current === undefined || (priorSupplied && prior === undefined) || (expectationSupplied && expectation === undefined) || (prior === undefined && expectation === undefined)) return undefined
  if (prior !== undefined && (prior.segmentKey !== current.segmentKey || prior.metric !== current.metric || prior.unit !== current.unit || comparableFiscalPeriod(current.fiscalPeriod) !== prior.fiscalPeriod)) return undefined
  if (expectation !== undefined && (expectation.segmentKey !== current.segmentKey || expectation.metric !== current.metric || expectation.unit !== current.unit || expectation.fiscalPeriod !== current.fiscalPeriod)) return undefined
  const priorComparison = prior === undefined ? undefined : delta(prior.value, current.value)
  const expectationComparison = expectation === undefined ? undefined : delta(expectation.value, current.value)
  if (prior !== undefined && priorComparison === undefined || expectation !== undefined && expectationComparison === undefined) return undefined
  return { segmentKey: current.segmentKey, metric: current.metric, unit: current.unit, currentPeriod: current.fiscalPeriod, currentValue: current.value, ...(prior === undefined ? {} : { priorPeriod: prior.fiscalPeriod, priorComparison }), ...(expectation === undefined ? {} : { expectationPeriod: expectation.fiscalPeriod, expectationComparison }) }
}

export const calculateSegmentKpiDelta = compareSegmentKpi
export const buildSegmentKpiDelta = compareSegmentKpi
