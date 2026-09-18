import assert from 'node:assert/strict'
import test from 'node:test'
import { actualMetricPointFromVerifiedMetric, buildEstimateRevisionBridge, compareActualToExpectation, compareActualVsConsensus, compareActualVsPriorEstimate } from '../../../skills/earnings-review/expectations/actual-vs-expectation.ts'
import { buildConsensusSnapshot } from '../../../skills/earnings-review/expectations/consensus.ts'
import { filterPointInTimeEstimates, selectLatestEstimatesPerInstitution, selectPriorEstimate, validateEstimatePoint } from '../../../skills/earnings-review/expectations/matching.ts'
import type { ActualMetricPoint, ConsensusSnapshot, EstimatePoint } from '../../../skills/earnings-review/expectations/contracts.ts'

function estimate(overrides: Partial<EstimatePoint> = {}): EstimatePoint {
  return { estimateId: 'estimate-a-1', metric: 'revenue', fiscalPeriod: '2026-FY', value: 100, unit: 'CNY', institutionKey: 'house-a', publishedAt: '2026-07-01T00:00:00.000Z', sourceCandidateIds: ['source-a'], ...overrides }
}

function actual(overrides: Partial<ActualMetricPoint> = {}): ActualMetricPoint {
  return { metric: 'revenue', fiscalPeriod: '2026-FY', value: 110, unit: 'CNY', sourceCandidateIds: ['actual-source'], ...overrides }
}

test('estimate validation and point-in-time filtering exclude malformed and future data', () => {
  const valid = estimate()
  assert.deepEqual(validateEstimatePoint(valid), [])
  assert.ok(validateEstimatePoint({ ...valid, value: Number.NaN }).includes('value_must_be_finite'))
  assert.ok(validateEstimatePoint({ ...valid, sourceCandidateIds: [] }).includes('source_evidence_required'))
  const filtered = filterPointInTimeEstimates([
    estimate({ estimateId: 'future', publishedAt: '2026-09-01T00:00:00.000Z' }),
    valid,
    estimate({ estimateId: 'invalid', sourceCandidateIds: [] }),
  ], '2026-08-01T00:00:00.000Z')
  assert.deepEqual(filtered.map((item) => item.estimateId), ['estimate-a-1'])
})

test('latest-per-institution selection is point-in-time and independent of input order', () => {
  const estimates = [
    estimate({ estimateId: 'a-old', value: 100, publishedAt: '2026-07-01T00:00:00.000Z' }),
    estimate({ estimateId: 'a-new', value: 110, publishedAt: '2026-07-15T00:00:00.000Z' }),
    estimate({ estimateId: 'b-new', value: 90, institutionKey: 'house-b', publishedAt: '2026-07-10T00:00:00.000Z' }),
    estimate({ estimateId: 'future', institutionKey: 'house-c', publishedAt: '2026-09-01T00:00:00.000Z' }),
    estimate({ estimateId: 'wrong-period', fiscalPeriod: '2027-FY' }),
  ]
  const input = { estimates, metric: 'revenue' as const, fiscalPeriod: '2026-FY', asOf: '2026-08-01T00:00:00.000Z' }
  const first = selectLatestEstimatesPerInstitution(input)
  const second = selectLatestEstimatesPerInstitution({ ...input, estimates: [...estimates].reverse() })
  assert.deepEqual(first.selected.map((item) => item.estimateId), ['a-new', 'b-new'])
  assert.deepEqual(second.selected.map((item) => item.estimateId), first.selected.map((item) => item.estimateId))
  assert.ok(first.excludedEstimateIds.includes('a-old'))
  assert.ok(first.excludedEstimateIds.includes('future'))
  assert.ok(first.excludedEstimateIds.includes('wrong-period'))
})

test('consensus uses one latest estimate per institution and deterministic population dispersion', () => {
  const result = buildConsensusSnapshot({
    estimates: [
      estimate({ estimateId: 'a-old', value: 100, publishedAt: '2026-07-01T00:00:00.000Z' }),
      estimate({ estimateId: 'a-new', value: 110, publishedAt: '2026-07-15T00:00:00.000Z' }),
      estimate({ estimateId: 'b-new', value: 90, institutionKey: 'house-b', publishedAt: '2026-07-10T00:00:00.000Z' }),
    ], metric: 'revenue', fiscalPeriod: '2026-FY', asOf: '2026-08-01T00:00:00.000Z', minimumCount: 2,
  })
  assert.ok(result.snapshot)
  assert.deepEqual(result.snapshot?.contributingEstimateIds, ['a-new', 'b-new'])
  assert.equal(result.snapshot?.count, 2)
  assert.equal(result.snapshot?.mean, 100)
  assert.equal(result.snapshot?.median, 100)
  assert.equal(result.snapshot?.low, 90)
  assert.equal(result.snapshot?.high, 110)
  assert.equal(result.snapshot?.dispersion, 10)
  const insufficient = buildConsensusSnapshot({ estimates: [estimate()], metric: 'revenue', fiscalPeriod: '2026-FY', asOf: '2026-08-01T00:00:00.000Z', minimumCount: 2 })
  assert.equal(insufficient.snapshot, undefined)
  assert.ok(insufficient.diagnostics.includes('consensus_minimum_count_not_met'))
  const oneAllowed = buildConsensusSnapshot({ estimates: [estimate(), estimate({ estimateId: 'b', institutionKey: 'house-b' })], metric: 'revenue', fiscalPeriod: '2026-FY', asOf: '2026-08-01T00:00:00.000Z', minimumCount: 1 })
  assert.equal(oneAllowed.snapshot, undefined)
  assert.ok(oneAllowed.diagnostics.includes('minimumCount_must_be_at_least_2'))
  const mixedUnits = buildConsensusSnapshot({ estimates: [estimate(), estimate({ estimateId: 'eps', institutionKey: 'house-b', unit: 'CNY_per_share' })], metric: 'revenue', fiscalPeriod: '2026-FY', asOf: '2026-08-01T00:00:00.000Z', minimumCount: 2 })
  assert.equal(mixedUnits.snapshot, undefined)
  assert.ok(mixedUnits.diagnostics.includes('consensus_units_must_match'))
})

test('actual metric adapter and actual-vs-expectation comparison are deterministic and unit-safe', () => {
  const point = actualMetricPointFromVerifiedMetric({ metric: 'revenue', value: 110, unit: 'CNY', period: '2026-FY', comparator: 'eq', calculation: 'observed', sourceCandidateIds: ['actual-source'] })
  assert.deepEqual(point, actual())
  const result = compareActualToExpectation({ actual: actual(), benchmark: { metric: 'revenue', fiscalPeriod: '2026-FY', value: 100, unit: 'CNY', benchmarkType: 'consensus' } })
  assert.deepEqual(result, { metric: 'revenue', fiscalPeriod: '2026-FY', actual: 110, benchmark: 100, absoluteDelta: 10, relativeDelta: 0.1, direction: 'above', benchmarkType: 'consensus' })
  const zero = compareActualToExpectation({ actual: actual({ value: 0 }), benchmark: { metric: 'revenue', fiscalPeriod: '2026-FY', value: 0, unit: 'CNY', benchmarkType: 'prior_estimate' } })
  assert.equal(zero?.direction, 'in_line')
  assert.equal(zero?.relativeDelta, undefined)
  assert.equal(compareActualToExpectation({ actual: actual(), benchmark: { metric: 'revenue', fiscalPeriod: '2026-FY', value: 100, unit: 'CNY_per_share', benchmarkType: 'consensus' } }), undefined)
  assert.equal(compareActualToExpectation({ actual: actual(), benchmark: { metric: 'eps', fiscalPeriod: '2026-FY', value: 100, unit: 'CNY', benchmarkType: 'consensus' } }), undefined)
})

test('actual-vs-consensus and actual-vs-prior-estimate preserve metric and institution matching', () => {
  const consensus: ConsensusSnapshot = { metric: 'revenue', fiscalPeriod: '2026-FY', asOf: '2026-08-01T00:00:00.000Z', mean: 100, median: 100, high: 110, low: 90, count: 2, dispersion: 10, contributingEstimateIds: ['a', 'b'] }
  assert.equal(compareActualVsConsensus(actual(), consensus)?.relativeDelta, 0.1)
  const estimates = [
    estimate({ estimateId: 'a-old', value: 90, publishedAt: '2026-07-01T00:00:00.000Z' }),
    estimate({ estimateId: 'a-mid', value: 95, publishedAt: '2026-07-15T00:00:00.000Z' }),
    estimate({ estimateId: 'b-old', value: 200, institutionKey: 'house-b', publishedAt: '2026-07-20T00:00:00.000Z' }),
  ]
  const prior = compareActualVsPriorEstimate({ actual: actual(), estimates, institutionKey: 'house-a', comparisonCutoff: '2026-08-01T00:00:00.000Z' })
  assert.equal(prior?.benchmark, 95)
  assert.equal(prior?.absoluteDelta, 15)
  assert.equal(selectPriorEstimate({ estimates, metric: 'revenue', fiscalPeriod: '2026-FY', institutionKey: 'house-a', beforePublishedAt: '2026-07-10T00:00:00.000Z', analysisAsOf: '2026-08-01T00:00:00.000Z' })?.estimateId, 'a-old')
  assert.equal(compareActualVsPriorEstimate({ actual: actual(), estimates, institutionKey: 'house-c', comparisonCutoff: '2026-08-01T00:00:00.000Z' }), undefined)
  assert.equal(compareActualVsPriorEstimate({ actual: actual(), estimates, institutionKey: 'house-a', comparisonCutoff: '2026-06-01T00:00:00.000Z' }), undefined)
})

test('estimate revision bridge enforces same identity and chronological publication', () => {
  const result = buildEstimateRevisionBridge({ oldEstimate: estimate({ estimateId: 'old', value: 90, publishedAt: '2026-07-01T00:00:00.000Z' }), newEstimate: estimate({ estimateId: 'new', value: 95, publishedAt: '2026-07-15T00:00:00.000Z' }) })
  assert.deepEqual(result, { metric: 'revenue', fiscalPeriod: '2026-FY', institutionKey: 'house-a', oldValue: 90, newValue: 95, absoluteRevision: 5, relativeRevision: 5 / 90, oldPublishedAt: '2026-07-01T00:00:00.000Z', newPublishedAt: '2026-07-15T00:00:00.000Z' })
  assert.equal(buildEstimateRevisionBridge({ oldEstimate: estimate({ publishedAt: '2026-07-15T00:00:00.000Z' }), newEstimate: estimate({ publishedAt: '2026-07-01T00:00:00.000Z' }) }), undefined)
  assert.equal(buildEstimateRevisionBridge({ oldEstimate: estimate({ institutionKey: 'house-a' }), newEstimate: estimate({ institutionKey: 'house-b', publishedAt: '2026-07-15T00:00:00.000Z' }) }), undefined)
  const zero = buildEstimateRevisionBridge({ oldEstimate: estimate({ value: 0 }), newEstimate: estimate({ value: 5, publishedAt: '2026-07-15T00:00:00.000Z' }) })
  assert.equal(zero?.absoluteRevision, 5)
  assert.equal(zero?.relativeRevision, undefined)
})

test('expectations calculation outputs contain no NaN or Infinity', () => {
  const consensus = buildConsensusSnapshot({ estimates: [estimate({ value: 100 }), estimate({ estimateId: 'b', institutionKey: 'house-b', value: 120 })], metric: 'revenue', fiscalPeriod: '2026-FY', asOf: '2026-08-01T00:00:00.000Z', minimumCount: 2 }).snapshot!
  const comparison = compareActualVsConsensus(actual(), consensus)
  const revision = buildEstimateRevisionBridge({ oldEstimate: estimate({ value: 100 }), newEstimate: estimate({ value: 120, publishedAt: '2026-07-15T00:00:00.000Z' }) })
  const serialized = JSON.stringify({ consensus, comparison, revision })
  assert.equal(/NaN|Infinity/.test(serialized), false)
})
