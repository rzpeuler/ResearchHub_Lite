import assert from 'node:assert/strict'
import test from 'node:test'
import { assessManagementExecution } from '../../skills/management_execution/index.ts'

const refs = (name: string): readonly string[] => [`source:${name}`]
const commitment = (overrides: Record<string, unknown> = {}) => ({ id: 'margin-target', statement: 'Reach an operating margin of at least 20%.', speaker: 'CFO', publishedAt: '2025-03-01T00:00:00.000Z', targetMetric: 'operating_margin', targetPeriod: '2026-FY', targetEndDate: '2026-12-31T00:00:00.000Z', targetType: 'numeric_at_least' as const, targetUnit: 'percent', targetLow: 20, sourceRefs: refs('commitment'), ...overrides })

test('numeric commitment is assessed against an exact-period observable outcome', () => {
  const result = assessManagementExecution({ companyRef: 'entity:company', asOf: '2027-01-01T00:00:00.000Z', commitments: [commitment()], outcomes: [{ commitmentId: 'margin-target', period: '2026-FY', observedAt: '2027-01-01T00:00:00.000Z', value: 22, unit: 'percent', statement: 'Reported operating margin was 22%.', sourceRefs: refs('outcome') }] })
  assert.equal(result.status, 'complete')
  assert.equal(result.assessments[0]?.assessment, 'met')
})

test('missing future outcome is not treated as a miss', () => {
  const result = assessManagementExecution({ companyRef: 'entity:company', asOf: '2026-06-01T00:00:00.000Z', commitments: [commitment()], outcomes: [] })
  assert.equal(result.assessments[0]?.assessment, 'not_yet_observable')
})

test('qualitative execution uses an explicit evidence result and never a personality score', () => {
  const result = assessManagementExecution({ companyRef: 'entity:company', asOf: '2027-01-01T00:00:00.000Z', commitments: [commitment({ id: 'launch', targetMetric: 'product_launch', targetPeriod: '2026-FY', targetType: 'qualitative', targetLow: undefined, qualitativeCondition: 'Product launch completed by year end.' })], outcomes: [{ commitmentId: 'launch', period: '2026-FY', observedAt: '2026-12-20T00:00:00.000Z', qualitativeResult: 'partially_met', statement: 'Launch occurred late in the target period.', sourceRefs: refs('launch-outcome') }] })
  const serialized = JSON.stringify(result)
  assert.equal(result.assessments[0]?.assessment, 'inconclusive')
  assert.ok(result.assessments[0]?.diagnostics.some((item) => item.includes('non-authoritative')))
  assert.doesNotMatch(serialized, /honesty|personality|score/i)
})

test('numeric range and maximum commitments remain deterministic', () => {
  const result = assessManagementExecution({ companyRef: 'entity:company', asOf: '2027-01-01T00:00:00.000Z', commitments: [commitment({ id: 'range', targetType: 'numeric_range', targetLow: 10, targetHigh: 20 }), commitment({ id: 'max', targetType: 'numeric_at_most', targetHigh: 5 })], outcomes: [{ commitmentId: 'range', period: '2026-FY', observedAt: '2027-01-01T00:00:00.000Z', value: 15, unit: 'percent', sourceRefs: refs('range-outcome') }, { commitmentId: 'max', period: '2026-FY', observedAt: '2027-01-01T00:00:00.000Z', value: 7, unit: 'percent', sourceRefs: refs('max-outcome') }] })
  assert.equal(result.assessments.find((item) => item.commitmentId === 'range')?.assessment, 'met')
  assert.equal(result.assessments.find((item) => item.commitmentId === 'max')?.assessment, 'not_met')
})

test('qualitative narrative without a deterministic predicate is inconclusive', () => {
  const result = assessManagementExecution({ companyRef: 'entity:company', asOf: '2027-01-01T00:00:00.000Z', commitments: [commitment({ id: 'quality', targetMetric: 'customer_experience', targetPeriod: '2026-FY', targetType: 'qualitative', targetLow: undefined, qualitativeCondition: 'Improve customer experience.' })], outcomes: [{ commitmentId: 'quality', period: '2026-FY', observedAt: '2027-01-01T00:00:00.000Z', statement: 'Customer experience improved.', sourceRefs: refs('quality-outcome') }] })
  assert.equal(result.assessments[0]?.assessment, 'inconclusive')
  assert.ok(result.assessments[0]?.diagnostics.some((item) => item.includes('deterministic predicate')))
})

test('unit mismatch and missing source refs fail closed', () => {
  const result = assessManagementExecution({ companyRef: 'entity:company', asOf: '2027-01-01T00:00:00.000Z', commitments: [commitment({ targetUnit: 'CNY', sourceRefs: [] })], outcomes: [{ commitmentId: 'margin-target', period: '2026-FY', observedAt: '2027-01-01T00:00:00.000Z', value: 22, unit: 'percent', sourceRefs: refs('outcome') }] })
  assert.equal(result.assessments[0]?.assessment, 'inconclusive')
  assert.ok(result.diagnostics.some((item) => item.includes('attributable publication evidence')))
  assert.ok(result.assessments[0]?.diagnostics.some((item) => item.includes('unit')))
})

test('invalid numeric range is unavailable rather than repaired by assumption', () => {
  const result = assessManagementExecution({ companyRef: 'entity:company', asOf: '2027-01-01T00:00:00.000Z', commitments: [commitment({ targetType: 'numeric_range', targetLow: 30, targetHigh: 20 })], outcomes: [] })
  assert.equal(result.status, 'unavailable')
  assert.ok(result.diagnostics.some((item) => item.includes('invalid numeric range')))
})
