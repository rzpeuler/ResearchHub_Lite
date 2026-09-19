import assert from 'node:assert/strict'
import test from 'node:test'
import { buildGuidanceRevisionBridge, compareGuidanceVsConsensus, normalizeGuidanceRange, selectPriorGuidance, validateGuidanceRange } from '../../../skills/earnings-review/expectations/guidance.ts'
import { compareSegmentKpi, normalizeSegmentKpiPoint } from '../../../skills/earnings-review/expectations/segment-kpi.ts'
import type { ConsensusSnapshot, GuidanceRange, SegmentKpiPoint } from '../../../skills/earnings-review/expectations/contracts.ts'

const ANALYSIS_AS_OF = '2026-09-30T00:00:00.000Z'

function guidance(overrides: Partial<GuidanceRange> = {}): GuidanceRange {
  return { guidanceId: 'guidance-a', metric: 'revenue', fiscalPeriod: '2026-FY', low: 100, high: 120, unit: 'CNY', guidanceType: 'range', publishedAt: '2026-08-20T09:00:00.000Z', sourceCandidateIds: [' source-b ', 'source-a', 'source-a'], qualifiers: [' management expects demand to remain strong ', 'management expects demand to remain strong'], ...overrides }
}

function consensus(overrides: Partial<ConsensusSnapshot> = {}): ConsensusSnapshot {
  return { metric: 'revenue', fiscalPeriod: '2026-FY', unit: 'CNY', asOf: '2026-08-19T00:00:00.000Z', mean: 110, median: 110, high: 120, low: 100, count: 2, dispersion: 10, contributingEstimateIds: ['estimate-a', 'estimate-b'], ...overrides }
}

function segment(overrides: Partial<SegmentKpiPoint> = {}): SegmentKpiPoint {
  return { segmentKey: 'segment-a', metric: 'shipments', fiscalPeriod: '2026-FY', value: 100, unit: 'units', sourceCandidateIds: [' source-b ', 'source-a', 'source-a'], ...overrides }
}

function assertAllNumbersFinite(value: unknown): void {
  if (typeof value === 'number') {
    assert.equal(Number.isFinite(value), true)
    return
  }
  if (Array.isArray(value)) {
    for (const item of value) assertAllNumbersFinite(item)
    return
  }
  if (value !== null && typeof value === 'object') {
    for (const item of Object.values(value)) assertAllNumbersFinite(item)
  }
}

test('T1 valid range normalization calculates midpoint and normalizes collections', () => {
  const normalized = normalizeGuidanceRange(guidance())
  assert.deepEqual(normalized?.sourceCandidateIds, ['source-a', 'source-b'])
  assert.deepEqual(normalized?.qualifiers, ['management expects demand to remain strong'])
  assert.equal(normalized?.midpoint, 110)
  assert.deepEqual(validateGuidanceRange(guidance(), ANALYSIS_AS_OF), [])
})

test('T2 an agreeing supplied midpoint is accepted but code owns the normalized value', () => {
  const normalized = normalizeGuidanceRange(guidance({ midpoint: 110 }))
  assert.equal(normalized?.midpoint, (100 + 120) / 2)
})

test('T3 an inconsistent range midpoint is rejected', () => {
  assert.ok(validateGuidanceRange(guidance({ midpoint: 115 }), ANALYSIS_AS_OF).includes('range_midpoint_mismatch'))
  assert.equal(normalizeGuidanceRange(guidance({ midpoint: 115 })), undefined)
})

test('T4 malformed Guidance shapes fail closed', () => {
  const invalid = [
    guidance({ high: undefined }),
    guidance({ low: 130 }),
    guidance({ guidanceType: 'minimum', high: 120 }),
    guidance({ guidanceType: 'maximum', low: 100 }),
    guidance({ guidanceType: 'point', low: 100, high: 120 }),
    guidance({ unit: undefined }),
    guidance({ low: Number.NaN }),
    guidance({ high: Number.POSITIVE_INFINITY }),
  ]
  for (const item of invalid) assert.notDeepEqual(validateGuidanceRange(item, ANALYSIS_AS_OF), [])
})

test('T5 qualitative Guidance requires a qualifier and does not fabricate numeric fields or unit', () => {
  const qualitative = guidance({ guidanceType: 'qualitative', low: undefined, high: undefined, midpoint: undefined, unit: undefined, qualifiers: [' management expects demand to remain strong '] })
  assert.deepEqual(validateGuidanceRange(qualitative, ANALYSIS_AS_OF), [])
  const normalized = normalizeGuidanceRange(qualitative)
  assert.equal(normalized?.unit, undefined)
  assert.equal(normalized?.midpoint, undefined)
  assert.equal(normalizeGuidanceRange({ ...qualitative, qualifiers: [] }), undefined)
})

test('T6 future Guidance is rejected by the PIT validator', () => {
  assert.ok(validateGuidanceRange(guidance({ publishedAt: '2026-10-01T00:00:00.000Z' }), ANALYSIS_AS_OF).includes('publishedAt_after_analysisAsOf'))
})

test('T7 prior Guidance selects the latest strictly earlier eligible revision independent of array order', () => {
  const latest = guidance({ guidanceId: 'latest', publishedAt: '2026-08-19T00:00:00.000Z' })
  const older = guidance({ guidanceId: 'older', publishedAt: '2026-07-19T00:00:00.000Z' })
  const input = { guidances: [latest, older], metric: 'revenue', fiscalPeriod: '2026-FY', beforePublishedAt: '2026-08-20T00:00:00.000Z', analysisAsOf: ANALYSIS_AS_OF }
  const first = selectPriorGuidance(input)
  const second = selectPriorGuidance({ ...input, guidances: [...input.guidances].reverse() })
  assert.equal(first.selected?.guidanceId, 'latest')
  assert.deepEqual(second, first)
})

test('T8 conflicting duplicate Guidance IDs are excluded', () => {
  const result = selectPriorGuidance({ guidances: [guidance({ guidanceId: 'duplicate', low: 100 }), guidance({ guidanceId: 'duplicate', low: 105 })], metric: 'revenue', fiscalPeriod: '2026-FY', beforePublishedAt: '2026-08-20T00:00:00.000Z', analysisAsOf: ANALYSIS_AS_OF })
  assert.equal(result.selected, undefined)
  assert.ok(result.diagnostics.includes('duplicate_guidance_id:duplicate'))
})

test('T9 distinct same-timestamp prior Guidance is ambiguous', () => {
  const timestamp = '2026-08-19T00:00:00.000Z'
  const result = selectPriorGuidance({ guidances: [guidance({ guidanceId: 'a', publishedAt: timestamp }), guidance({ guidanceId: 'b', publishedAt: timestamp, low: 105, high: 125 })], metric: 'revenue', fiscalPeriod: '2026-FY', beforePublishedAt: '2026-08-20T00:00:00.000Z', analysisAsOf: ANALYSIS_AS_OF })
  assert.equal(result.selected, undefined)
  assert.ok(result.diagnostics.includes('ambiguous_prior_guidance'))
})

test('T10 range-to-range revision returns low, high, midpoint, and width changes', () => {
  const result = buildGuidanceRevisionBridge({ oldGuidance: guidance({ guidanceId: 'old', low: 100, high: 120, publishedAt: '2026-07-20T00:00:00.000Z' }), newGuidance: guidance({ guidanceId: 'new', low: 110, high: 130, publishedAt: '2026-08-20T00:00:00.000Z' }) })
  assert.equal(result?.lowEndRevision?.absoluteRevision, 10)
  assert.equal(result?.highEndRevision?.absoluteRevision, 10)
  assert.equal(result?.midpointRevision?.absoluteRevision, 10)
  assert.equal(result?.rangeWidthChange?.absoluteRevision, 0)
})

test('T11 asymmetric range revision preserves changed and unchanged dimensions', () => {
  const result = buildGuidanceRevisionBridge({ oldGuidance: guidance({ guidanceId: 'old', low: 100, high: 120, publishedAt: '2026-07-20T00:00:00.000Z' }), newGuidance: guidance({ guidanceId: 'new', low: 110, high: 120, publishedAt: '2026-08-20T00:00:00.000Z' }) })
  assert.equal(result?.lowEndRevision?.absoluteRevision, 10)
  assert.equal(result?.highEndRevision?.absoluteRevision, 0)
  assert.equal(result?.midpointRevision?.absoluteRevision, 5)
  assert.equal(result?.rangeWidthChange?.absoluteRevision, -10)
})

test('T12 minimum, maximum, point, and shared range dimensions compare only real dimensions', () => {
  const minimum = buildGuidanceRevisionBridge({ oldGuidance: guidance({ guidanceId: 'old-min', guidanceType: 'minimum', low: 100, high: undefined, midpoint: undefined, publishedAt: '2026-07-20T00:00:00.000Z' }), newGuidance: guidance({ guidanceId: 'new-min', guidanceType: 'minimum', low: 110, high: undefined, midpoint: undefined, publishedAt: '2026-08-20T00:00:00.000Z' }) })
  const maximum = buildGuidanceRevisionBridge({ oldGuidance: guidance({ guidanceId: 'old-max', guidanceType: 'maximum', low: undefined, high: 120, midpoint: undefined, publishedAt: '2026-07-20T00:00:00.000Z' }), newGuidance: guidance({ guidanceId: 'new-max', guidanceType: 'maximum', low: undefined, high: 130, midpoint: undefined, publishedAt: '2026-08-20T00:00:00.000Z' }) })
  const point = buildGuidanceRevisionBridge({ oldGuidance: guidance({ guidanceId: 'old-point', guidanceType: 'point', low: undefined, high: undefined, midpoint: 100, publishedAt: '2026-07-20T00:00:00.000Z' }), newGuidance: guidance({ guidanceId: 'new-point', guidanceType: 'point', low: undefined, high: undefined, midpoint: 110, publishedAt: '2026-08-20T00:00:00.000Z' }) })
  const rangeToMinimum = buildGuidanceRevisionBridge({ oldGuidance: guidance({ guidanceId: 'old-range', publishedAt: '2026-07-20T00:00:00.000Z' }), newGuidance: guidance({ guidanceId: 'new-minimum', guidanceType: 'minimum', low: 110, high: undefined, midpoint: undefined, publishedAt: '2026-08-20T00:00:00.000Z' }) })
  assert.equal(minimum?.lowEndRevision?.absoluteRevision, 10)
  assert.equal(minimum?.highEndRevision, undefined)
  assert.equal(maximum?.highEndRevision?.absoluteRevision, 10)
  assert.equal(point?.midpointRevision?.absoluteRevision, 10)
  assert.equal(rangeToMinimum?.lowEndRevision?.absoluteRevision, 10)
  assert.equal(rangeToMinimum?.highEndRevision, undefined)
  assert.equal(rangeToMinimum?.midpointRevision, undefined)
})

test('T13 Guidance revision rejects metric, period, and unit mismatch', () => {
  const oldGuidance = guidance({ publishedAt: '2026-07-20T00:00:00.000Z' })
  assert.equal(buildGuidanceRevisionBridge({ oldGuidance, newGuidance: guidance({ publishedAt: '2026-08-20T00:00:00.000Z', metric: 'eps' }) }), undefined)
  assert.equal(buildGuidanceRevisionBridge({ oldGuidance, newGuidance: guidance({ publishedAt: '2026-08-20T00:00:00.000Z', fiscalPeriod: '2027-FY' }) }), undefined)
  assert.equal(buildGuidanceRevisionBridge({ oldGuidance, newGuidance: guidance({ publishedAt: '2026-08-20T00:00:00.000Z', unit: 'CNY_million' }) }), undefined)
})

test('T14 zero old Guidance dimension has absolute but no relative revision', () => {
  const result = buildGuidanceRevisionBridge({ oldGuidance: guidance({ low: 0, high: 20, publishedAt: '2026-07-20T00:00:00.000Z' }), newGuidance: guidance({ low: 5, high: 25, publishedAt: '2026-08-20T00:00:00.000Z' }) })
  assert.equal(result?.lowEndRevision?.absoluteRevision, 5)
  assert.equal(result?.lowEndRevision?.relativeRevision, undefined)
})

test('T15 Guidance versus Consensus inside range returns midpoint delta', () => {
  const result = compareGuidanceVsConsensus({ guidance: guidance(), consensus: consensus({ mean: 110 }), analysisAsOf: ANALYSIS_AS_OF })
  assert.equal(result?.relationship, 'inside_range')
  assert.equal(result?.absoluteDelta, 0)
  assert.equal(result?.relativeDelta, 0)
  assert.equal(result?.direction, 'in_line')
})

test('T16 range boundaries are inside the range', () => {
  assert.equal(compareGuidanceVsConsensus(guidance(), consensus({ mean: 100 }), ANALYSIS_AS_OF)?.relationship, 'inside_range')
  assert.equal(compareGuidanceVsConsensus(guidance(), consensus({ mean: 120 }), ANALYSIS_AS_OF)?.relationship, 'inside_range')
})

test('T17 Guidance versus Consensus classifies below and above range', () => {
  assert.equal(compareGuidanceVsConsensus(guidance(), consensus({ mean: 99 }), ANALYSIS_AS_OF)?.relationship, 'below_range')
  assert.equal(compareGuidanceVsConsensus(guidance(), consensus({ mean: 121 }), ANALYSIS_AS_OF)?.relationship, 'above_range')
})

test('T18 minimum, maximum, and point relationship boundaries are deterministic', () => {
  assert.equal(compareGuidanceVsConsensus(guidance({ guidanceType: 'minimum', low: 100, high: undefined, midpoint: undefined }), consensus({ mean: 99 }), ANALYSIS_AS_OF)?.relationship, 'below_minimum')
  assert.equal(compareGuidanceVsConsensus(guidance({ guidanceType: 'minimum', low: 100, high: undefined, midpoint: undefined }), consensus({ mean: 100 }), ANALYSIS_AS_OF)?.relationship, 'at_or_above_minimum')
  assert.equal(compareGuidanceVsConsensus(guidance({ guidanceType: 'maximum', low: undefined, high: 120, midpoint: undefined }), consensus({ mean: 120 }), ANALYSIS_AS_OF)?.relationship, 'at_or_below_maximum')
  assert.equal(compareGuidanceVsConsensus(guidance({ guidanceType: 'maximum', low: undefined, high: 120, midpoint: undefined }), consensus({ mean: 121 }), ANALYSIS_AS_OF)?.relationship, 'above_maximum')
  assert.equal(compareGuidanceVsConsensus(guidance({ guidanceType: 'point', low: undefined, high: undefined, midpoint: 110 }), consensus({ mean: 110 }), ANALYSIS_AS_OF)?.relationship, 'at_point')
  assert.equal(compareGuidanceVsConsensus(guidance({ guidanceType: 'point', low: undefined, high: undefined, midpoint: 110 }), consensus({ mean: 109 }), ANALYSIS_AS_OF)?.relationship, 'below_point')
})

test('T19 qualitative Guidance has no numeric Consensus comparison', () => {
  assert.equal(compareGuidanceVsConsensus(guidance({ guidanceType: 'qualitative', low: undefined, high: undefined, midpoint: undefined, unit: undefined }), consensus(), ANALYSIS_AS_OF), undefined)
})

test('T20 Guidance versus Consensus rejects unit mismatch', () => {
  assert.equal(compareGuidanceVsConsensus(guidance(), consensus({ unit: 'CNY_million' }), ANALYSIS_AS_OF), undefined)
})

test('T21 Guidance versus Consensus rejects metric and period mismatch', () => {
  assert.equal(compareGuidanceVsConsensus(guidance(), consensus({ metric: 'eps' }), ANALYSIS_AS_OF), undefined)
  assert.equal(compareGuidanceVsConsensus(guidance(), consensus({ fiscalPeriod: '2027-FY' }), ANALYSIS_AS_OF), undefined)
})

test('T22 post-Guidance Consensus is rejected by the PIT cutoff', () => {
  assert.equal(compareGuidanceVsConsensus(guidance({ publishedAt: '2026-08-20T09:00:00.000Z' }), consensus({ asOf: '2026-08-21T00:00:00.000Z' }), ANALYSIS_AS_OF), undefined)
})

test('T23 historical Consensus at or before Guidance publication is accepted', () => {
  const result = compareGuidanceVsConsensus(guidance(), consensus({ asOf: '2026-08-20T08:59:59.000Z', mean: 115 }), ANALYSIS_AS_OF)
  assert.equal(result?.relationship, 'inside_range')
  assert.equal(result?.absoluteDelta, -5)
})

test('T24 Segment KPI prior comparison preserves explicit periods', () => {
  const result = compareSegmentKpi({ current: segment({ fiscalPeriod: '2026-FY', value: 120 }), priorComparable: segment({ fiscalPeriod: '2025-FY', value: 100 }) })
  assert.equal(result?.currentPeriod, '2026-FY')
  assert.equal(result?.priorPeriod, '2025-FY')
  assert.equal(result?.priorComparison?.absoluteDelta, 20)
  assert.equal(result?.priorComparison?.relativeDelta, 0.2)
})

test('T25 Segment KPI expectation comparison requires the current period', () => {
  const result = compareSegmentKpi({ current: segment({ value: 120 }), expectation: segment({ value: 110 }) })
  assert.equal(result?.expectationPeriod, '2026-FY')
  assert.equal(result?.expectationComparison?.absoluteDelta, 10)
  assert.equal(compareSegmentKpi({ current: segment(), expectation: segment({ fiscalPeriod: '2027-FY' }) }), undefined)
})

test('T26 Segment KPI supports valid prior and expectation comparisons together', () => {
  const result = compareSegmentKpi({ current: segment({ value: 120 }), priorComparable: segment({ fiscalPeriod: '2025-FY', value: 100 }), expectation: segment({ value: 110 }) })
  assert.equal(result?.priorComparison?.absoluteDelta, 20)
  assert.equal(result?.expectationComparison?.absoluteDelta, 10)
})

test('T27 incompatible Segment KPI comparators fail the whole request closed', () => {
  assert.equal(compareSegmentKpi({ current: segment(), priorComparable: segment({ segmentKey: 'segment-b', fiscalPeriod: '2025-FY' }) }), undefined)
  assert.equal(compareSegmentKpi({ current: segment(), priorComparable: segment({ metric: 'asp', fiscalPeriod: '2025-FY' }) }), undefined)
  assert.equal(compareSegmentKpi({ current: segment(), priorComparable: segment({ unit: 'CNY', fiscalPeriod: '2025-FY' }) }), undefined)
  assert.equal(compareSegmentKpi({ current: segment(), priorComparable: segment({ fiscalPeriod: '2025-FY' }), expectation: segment({ fiscalPeriod: '2027-FY' }) }), undefined)
})

test('T28 zero Segment KPI benchmark has absolute but no relative delta', () => {
  const result = compareSegmentKpi({ current: segment({ value: 5 }), expectation: segment({ value: 0 }) })
  assert.equal(result?.expectationComparison?.absoluteDelta, 5)
  assert.equal(result?.expectationComparison?.relativeDelta, undefined)
})

test('T29 Guidance and Segment KPI normalization is input-order independent', () => {
  const first = normalizeGuidanceRange(guidance({ sourceCandidateIds: ['source-a', 'source-b'], qualifiers: ['b', 'a'] }))
  const second = normalizeGuidanceRange(guidance({ sourceCandidateIds: ['source-b', 'source-a', 'source-a'], qualifiers: ['a', 'b', 'a'] }))
  assert.deepEqual(second, first)
  assert.deepEqual(normalizeSegmentKpiPoint(segment({ sourceCandidateIds: ['source-b', 'source-a'] })), normalizeSegmentKpiPoint(segment({ sourceCandidateIds: ['source-a', 'source-b', 'source-a'] })))
})

test('T30 Guidance and Segment KPI result families contain no NaN or Infinity', () => {
  const values = {
    guidance: normalizeGuidanceRange(guidance()),
    revision: buildGuidanceRevisionBridge({ oldGuidance: guidance({ publishedAt: '2026-07-20T00:00:00.000Z' }), newGuidance: guidance({ publishedAt: '2026-08-20T00:00:00.000Z' }) }),
    consensus: compareGuidanceVsConsensus(guidance(), consensus(), ANALYSIS_AS_OF),
    segment: compareSegmentKpi({ current: segment({ value: 120 }), priorComparable: segment({ fiscalPeriod: '2025-FY', value: 100 }), expectation: segment({ value: 110 }) }),
  }
  assertAllNumbersFinite(values)
})

test('T31 maximum finite equal range bounds retain a finite midpoint', () => {
  const normalized = normalizeGuidanceRange(guidance({ low: Number.MAX_VALUE, high: Number.MAX_VALUE }))
  assert.ok(normalized)
  assert.equal(normalized?.midpoint, Number.MAX_VALUE)
  assertAllNumbersFinite(normalized)
})

test('T32 large same-sign bounds use a finite midpoint without addition overflow', () => {
  const low = Number.MAX_VALUE / 2
  const high = Number.MAX_VALUE
  const normalized = normalizeGuidanceRange(guidance({ low, high }))
  assert.ok(normalized)
  assert.equal(normalized?.midpoint, low + (high - low) / 2)
  assert.ok(normalized!.midpoint! >= low && normalized!.midpoint! <= high)
  assertAllNumbersFinite(normalized)
})

test('T33 large opposite-sign bounds produce a finite zero midpoint', () => {
  const normalized = normalizeGuidanceRange(guidance({ low: -Number.MAX_VALUE, high: Number.MAX_VALUE }))
  assert.ok(normalized)
  assert.equal(normalized?.midpoint, 0)
  assertAllNumbersFinite(normalized)
})

test('T34 extreme supplied midpoint is validated against the safe code-owned midpoint', () => {
  const low = Number.MAX_VALUE / 2
  const high = Number.MAX_VALUE
  const midpoint = low + (high - low) / 2
  assert.deepEqual(validateGuidanceRange(guidance({ low, high, midpoint }), ANALYSIS_AS_OF), [])
  assert.equal(normalizeGuidanceRange(guidance({ low, high, midpoint }))?.midpoint, midpoint)
  assert.ok(validateGuidanceRange(guidance({ low, high, midpoint: Number.MAX_VALUE }), ANALYSIS_AS_OF).includes('range_midpoint_mismatch'))
})

test('T35 Guidance versus Consensus returns only finite numbers or unavailable', () => {
  const result = compareGuidanceVsConsensus(guidance({ low: Number.MAX_VALUE / 2, high: Number.MAX_VALUE }), consensus({ mean: -Number.MAX_VALUE / 2, median: -Number.MAX_VALUE / 2, low: -Number.MAX_VALUE / 2, high: -Number.MAX_VALUE / 2 }), ANALYSIS_AS_OF)
  if (result !== undefined) assertAllNumbersFinite(result)
})

test('T36 overflowing range width is omitted rather than leaking Infinity', () => {
  const result = buildGuidanceRevisionBridge({ oldGuidance: guidance({ low: -Number.MAX_VALUE, high: Number.MAX_VALUE, publishedAt: '2026-07-20T00:00:00.000Z' }), newGuidance: guidance({ low: -Number.MAX_VALUE / 2, high: Number.MAX_VALUE / 2, publishedAt: '2026-08-20T00:00:00.000Z' }) })
  assert.ok(result)
  assert.equal(result?.rangeWidthChange, undefined)
  assertAllNumbersFinite(result)
})

test('T37 recursive finiteness assertion directly inspects every W2-003 result family', () => {
  const values = [
    normalizeGuidanceRange(guidance({ low: -Number.MAX_VALUE, high: Number.MAX_VALUE })),
    buildGuidanceRevisionBridge({ oldGuidance: guidance({ low: -Number.MAX_VALUE, high: Number.MAX_VALUE, publishedAt: '2026-07-20T00:00:00.000Z' }), newGuidance: guidance({ low: -Number.MAX_VALUE / 2, high: Number.MAX_VALUE / 2, publishedAt: '2026-08-20T00:00:00.000Z' }) }),
    compareGuidanceVsConsensus(guidance({ low: -Number.MAX_VALUE, high: Number.MAX_VALUE }), consensus({ mean: 0 }), ANALYSIS_AS_OF),
    compareSegmentKpi({ current: segment({ value: Number.MAX_VALUE }), expectation: segment({ value: Number.MAX_VALUE / 2 }) }),
  ]
  assertAllNumbersFinite(values)
})
