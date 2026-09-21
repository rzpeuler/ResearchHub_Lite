import assert from 'node:assert/strict'
import test from 'node:test'
import { assessCapitalAllocation } from '../../skills/capital_allocation_review/index.ts'

const refs = (name: string): readonly string[] => [`source:${name}`]
const base = { companyRef: 'entity:company', period: '2026-FY', asOf: '2027-01-01T00:00:00.000Z' }

test('capital metrics use explicit denominators and preserve action provenance', () => {
  const result = assessCapitalAllocation({ ...base, context: { currentRevenue: 1_000, currentNetIncome: 200, marketCapitalization: 2_000, sourceRefs: refs('context') }, actions: [
    { id: 'capex', actionType: 'organic_capex', date: '2026-12-31T00:00:00.000Z', period: '2026-FY', amount: 100, unit: 'CNY', sourceRefs: refs('capex') },
    { id: 'dividend', actionType: 'dividend', date: '2026-12-31T00:00:00.000Z', period: '2026-FY', amount: 50, unit: 'CNY', sourceRefs: refs('dividend') },
    { id: 'buyback', actionType: 'buyback', date: '2026-12-31T00:00:00.000Z', period: '2026-FY', amount: 80, unit: 'CNY', sourceRefs: refs('buyback'), sharesBefore: 110, sharesAfter: 100 },
  ] })
  assert.equal(result.status, 'complete')
  assert.equal(result.actions[0]?.metrics[0]?.value, 0.1)
  assert.equal(result.actions[1]?.metrics[0]?.value, 0.25)
  assert.equal(result.actions[2]?.metrics.find((item) => item.metric === 'buyback_yield')?.value, 0.04)
  assert.equal(result.actions[2]?.valueAssessment, 'inconclusive')
})

test('explicit return and hurdle are the only route to value assessment', () => {
  const supported = assessCapitalAllocation({ ...base, actions: [{ id: 'acq', actionType: 'acquisition', date: '2026-06-01T00:00:00.000Z', period: '2026-FY', amount: 500, unit: 'CNY', sourceRefs: refs('acq'), returnOnIncrementalCapital: 0.18, hurdleRate: 0.12, subsequentOutcome: { metric: 'operating_profit', value: 100, unit: 'CNY', sourceRefs: refs('outcome') } }] })
  assert.equal(supported.actions[0]?.valueAssessment, 'value_supported')
  const destroyed = assessCapitalAllocation({ ...base, actions: [{ id: 'acq', actionType: 'acquisition', date: '2026-06-01T00:00:00.000Z', period: '2026-FY', amount: 500, unit: 'CNY', sourceRefs: refs('acq'), returnOnIncrementalCapital: 0.04, hurdleRate: 0.12, subsequentOutcome: { metric: 'operating_profit', value: 10, unit: 'CNY', sourceRefs: refs('outcome') } }] })
  assert.equal(destroyed.actions[0]?.valueAssessment, 'value_destroyed')
})

test('missing denominator and future action are unavailable without synthetic ratios', () => {
  const result = assessCapitalAllocation({ ...base, context: { currentRevenue: undefined, sourceRefs: refs('context') }, actions: [{ id: 'capex', actionType: 'organic_capex', date: '2028-01-01T00:00:00.000Z', period: '2026-FY', amount: 100, unit: 'CNY', sourceRefs: refs('capex') }] })
  assert.equal(result.status, 'unavailable')
  assert.equal(result.actions[0]?.metrics[0]?.value, undefined)
  assert.ok(result.diagnostics.some((item) => item.includes('as-of boundary')))
})

test('negative action amounts, duplicate IDs, and absent references fail closed', () => {
  const result = assessCapitalAllocation({ ...base, actions: [
    { id: 'bad', actionType: 'dividend', date: '2026-01-01T00:00:00.000Z', period: '2026-FY', amount: -1, unit: 'CNY', sourceRefs: [] },
    { id: 'bad', actionType: 'dividend', date: '2026-01-02T00:00:00.000Z', period: '2026-FY', amount: 1, unit: 'CNY', sourceRefs: refs('duplicate') },
  ] })
  assert.equal(result.status, 'unavailable')
  assert.ok(result.diagnostics.some((item) => item.includes('duplicate capital action')))
})
