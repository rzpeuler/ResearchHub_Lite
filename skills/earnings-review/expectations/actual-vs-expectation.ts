import type { VerifiedFinancialMetric } from '../financials.ts'
import { selectPriorEstimate, validateEstimatePoint } from './matching.ts'
import type { ActualMetricPoint, ActualVsExpectationResult, ActualVsPriorEstimateInput, ConsensusSnapshot, EstimateRevisionInput, EstimateRevisionResult, ExpectationBenchmark, ExpectationDirection } from './contracts.ts'

function validActual(point: ActualMetricPoint): boolean {
  return typeof point.metric === 'string' && point.metric.trim() !== '' && typeof point.fiscalPeriod === 'string' && point.fiscalPeriod.trim() !== '' && Number.isFinite(point.value) && typeof point.unit === 'string' && point.unit.trim() !== '' && Array.isArray(point.sourceCandidateIds) && point.sourceCandidateIds.length > 0 && point.sourceCandidateIds.every((item) => typeof item === 'string' && item.trim() !== '')
}

function validBenchmark(benchmark: ExpectationBenchmark): boolean {
  return typeof benchmark.metric === 'string' && benchmark.metric.trim() !== '' && typeof benchmark.fiscalPeriod === 'string' && benchmark.fiscalPeriod.trim() !== '' && Number.isFinite(benchmark.value) && typeof benchmark.unit === 'string' && benchmark.unit.trim() !== ''
}

function direction(delta: number): ExpectationDirection { return delta > 0 ? 'above' : delta < 0 ? 'below' : 'in_line' }

/** Compare an actual metric to an explicitly typed, unit-compatible benchmark. */
export function compareActualToExpectation(input: { readonly actual: ActualMetricPoint; readonly benchmark: ExpectationBenchmark }): ActualVsExpectationResult | undefined {
  if (!validActual(input.actual) || !validBenchmark(input.benchmark)) return undefined
  if (input.actual.metric !== input.benchmark.metric || input.actual.fiscalPeriod !== input.benchmark.fiscalPeriod || input.actual.unit !== input.benchmark.unit) return undefined
  const absoluteDelta = input.actual.value - input.benchmark.value
  if (!Number.isFinite(absoluteDelta)) return undefined
  const relativeDelta = input.benchmark.value === 0 ? undefined : absoluteDelta / Math.abs(input.benchmark.value)
  if (relativeDelta !== undefined && !Number.isFinite(relativeDelta)) return undefined
  return { metric: input.actual.metric, fiscalPeriod: input.actual.fiscalPeriod, actual: input.actual.value, benchmark: input.benchmark.value, absoluteDelta, ...(relativeDelta === undefined ? {} : { relativeDelta }), direction: direction(absoluteDelta), benchmarkType: input.benchmark.benchmarkType }
}

/** Adapt the existing deterministic Earnings metric into the expectations view. */
export function actualMetricPointFromVerifiedMetric(metric: VerifiedFinancialMetric): ActualMetricPoint | undefined {
  if (!Number.isFinite(metric.value) || metric.sourceCandidateIds.length === 0 || metric.sourceCandidateIds.some((item) => typeof item !== 'string' || item.trim() === '')) return undefined
  return { metric: metric.metric, fiscalPeriod: metric.period, value: metric.value, unit: metric.unit, sourceCandidateIds: metric.sourceCandidateIds }
}

export function compareActualVsConsensus(actual: ActualMetricPoint, consensus: ConsensusSnapshot): ActualVsExpectationResult | undefined {
  return compareActualToExpectation({ actual, benchmark: { metric: consensus.metric, fiscalPeriod: consensus.fiscalPeriod, value: consensus.mean, unit: consensus.unit, benchmarkType: 'consensus' } })
}

/** Compare actual results with the explicitly selected institution's prior estimate. */
export function compareActualVsPriorEstimate(input: ActualVsPriorEstimateInput): ActualVsExpectationResult | undefined {
  if (!validActual(input.actual) || input.institutionKey.trim() === '') return undefined
  const prior = selectPriorEstimate({ estimates: input.estimates, metric: input.actual.metric, fiscalPeriod: input.actual.fiscalPeriod, institutionKey: input.institutionKey, beforePublishedAt: input.comparisonCutoff, analysisAsOf: input.comparisonCutoff })
  if (prior === undefined) return undefined
  return compareActualToExpectation({ actual: input.actual, benchmark: { metric: prior.metric, fiscalPeriod: prior.fiscalPeriod, value: prior.value, unit: prior.unit, benchmarkType: 'prior_estimate' } })
}

function timestamp(value: string): number | undefined { const parsed = Date.parse(value); return Number.isFinite(parsed) ? parsed : undefined }

/** Build a report-level estimate revision bridge from two attributable points. */
export function buildEstimateRevisionBridge(input: EstimateRevisionInput): EstimateRevisionResult | undefined {
  const oldEstimate = input.oldEstimate
  const newEstimate = input.newEstimate
  if (validateEstimatePoint(oldEstimate).length > 0 || validateEstimatePoint(newEstimate).length > 0) return undefined
  const oldPublishedAt = timestamp(oldEstimate.publishedAt)
  const newPublishedAt = timestamp(newEstimate.publishedAt)
  if (oldEstimate.institutionKey !== newEstimate.institutionKey || oldEstimate.metric !== newEstimate.metric || oldEstimate.fiscalPeriod !== newEstimate.fiscalPeriod || oldEstimate.unit !== newEstimate.unit || oldPublishedAt === undefined || newPublishedAt === undefined || newPublishedAt <= oldPublishedAt) return undefined
  const absoluteRevision = newEstimate.value - oldEstimate.value
  if (!Number.isFinite(absoluteRevision)) return undefined
  const relativeRevision = oldEstimate.value === 0 ? undefined : absoluteRevision / Math.abs(oldEstimate.value)
  if (relativeRevision !== undefined && !Number.isFinite(relativeRevision)) return undefined
  return { metric: newEstimate.metric, fiscalPeriod: newEstimate.fiscalPeriod, institutionKey: newEstimate.institutionKey, oldValue: oldEstimate.value, newValue: newEstimate.value, absoluteRevision, ...(relativeRevision === undefined ? {} : { relativeRevision }), oldPublishedAt: oldEstimate.publishedAt, newPublishedAt: newEstimate.publishedAt }
}

export const actualVsExpectation = compareActualToExpectation
export const actualVsConsensus = compareActualVsConsensus
export const actualVsPriorEstimate = compareActualVsPriorEstimate
export const calculateEstimateRevision = buildEstimateRevisionBridge
export const estimateRevisionBridge = buildEstimateRevisionBridge
export const adaptVerifiedFinancialMetric = actualMetricPointFromVerifiedMetric
