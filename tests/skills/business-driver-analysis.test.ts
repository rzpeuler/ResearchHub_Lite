import assert from 'node:assert/strict'
import test from 'node:test'
import { calculateBusinessDriverAnalysis, type BusinessDriverAnalysisInput, type DriverObservation } from '../../skills/business_driver_analysis/index.ts'

const refs = (name: string): readonly string[] => [`source:${name}`]
const base = (overrides: Partial<BusinessDriverAnalysisInput> = {}): BusinessDriverAnalysisInput => ({ companyRef: 'entity:company-manufacturing', archetype: 'manufacturing', currentPeriod: '2026-H1', priorPeriod: '2025-H1', asOf: '2026-09-21T00:00:00.000Z', segments: [], ...overrides })
const driver = (overrides: Partial<DriverObservation> = {}): DriverObservation => ({ id: 'volume-main', name: 'Units shipped', driverType: 'volume', segment: 'main', metric: 'revenue', relationshipType: 'multiplicative', unit: 'units', period: '2026-H1', priorPeriod: '2025-H1', currentValue: 120, priorValue: 100, sourceRefs: refs('volume'), availability: 'reported', confidence: 'high', ...overrides })

test('manufacturing volume-price bridge is deterministic and source-linked', () => {
  const result = calculateBusinessDriverAnalysis(base({ segments: [{ id: 'main', name: 'Industrial products', outcomes: [{ metric: 'revenue', unit: 'CNY', currentValue: 1_320, priorValue: 1_000, currentSourceRefs: refs('revenue-current'), priorSourceRefs: refs('revenue-prior') }], drivers: [driver(), driver({ id: 'asp-main', name: 'ASP', driverType: 'price', unit: 'CNY/unit', currentValue: 11, priorValue: 10, sourceRefs: refs('price') })] }] }))
  const revenue = result.metrics.find((item) => item.metric === 'revenue')!
  assert.equal(result.status, 'complete')
  assert.deepEqual(revenue.contributions.map((item) => item.amount), [200, 120])
  assert.equal(revenue.delta, 320)
  assert.equal(revenue.residual, 0)
  assert.ok(revenue.contributions.every((item) => item.sourceRefs.length > 0))
})

test('software customer-ARPU drivers work without manufacturing assumptions', () => {
  const result = calculateBusinessDriverAnalysis(base({ companyRef: 'entity:company-saas', archetype: 'software_saas', segments: [{ id: 'subscription', name: 'Subscription', outcomes: [{ metric: 'revenue', unit: 'USD', currentValue: 14_400, priorValue: 10_000, currentSourceRefs: refs('saas-revenue-current'), priorSourceRefs: refs('saas-revenue-prior') }], drivers: [driver({ id: 'customers', name: 'Customers', driverType: 'customers', unit: 'customers', currentValue: 1_200, priorValue: 1_000, sourceRefs: refs('customers') }), driver({ id: 'arpu', name: 'ARPU', driverType: 'ARPU', unit: 'USD/customer', currentValue: 12, priorValue: 10, sourceRefs: refs('arpu') })] }] }))
  const revenue = result.metrics.find((item) => item.metric === 'revenue')!
  assert.equal(result.archetype, 'software_saas')
  assert.equal(revenue.status, 'complete')
  assert.deepEqual(revenue.contributions.map((item) => item.amount), [2_000, 2_400])
  assert.equal(revenue.residual, 0)
})

test('multi-segment totals preserve segment-specific drivers and periods', () => {
  const outcome = (currentValue: number, priorValue: number, id: string) => ({ metric: 'revenue' as const, unit: 'CNY', currentValue, priorValue, currentSourceRefs: refs(`${id}-current`), priorSourceRefs: refs(`${id}-prior`) })
  const result = calculateBusinessDriverAnalysis(base({ segments: [
    { id: 'a', name: 'Hardware', outcomes: [outcome(700, 500, 'a')], drivers: [driver({ id: 'a-volume', segment: 'a', currentValue: 70, priorValue: 50, sourceRefs: refs('a-volume') })] },
    { id: 'b', name: 'Services', outcomes: [outcome(450, 400, 'b')], drivers: [driver({ id: 'b-volume', segment: 'b', currentValue: 45, priorValue: 40, sourceRefs: refs('b-volume') })] },
  ] }))
  assert.equal(result.segments.length, 2)
  assert.equal(result.metrics.find((item) => item.metric === 'revenue')?.currentValue, 1_150)
  assert.equal(result.metrics.find((item) => item.metric === 'revenue')?.priorValue, 900)
})

test('missing driver data remains unavailable and leaves an explicit residual', () => {
  const result = calculateBusinessDriverAnalysis(base({ segments: [{ id: 'main', name: 'Main', outcomes: [{ metric: 'revenue', unit: 'CNY', currentValue: 110, priorValue: 100, currentSourceRefs: refs('current'), priorSourceRefs: refs('prior') }], drivers: [driver({ currentValue: undefined, priorValue: undefined, availability: 'unavailable', qualitativeExplanation: 'Management described demand as stronger.' })] }] }))
  const revenue = result.metrics.find((item) => item.metric === 'revenue')!
  assert.equal(result.status, 'partial')
  assert.deepEqual(revenue.contributions, [])
  assert.equal(revenue.residual, 10)
  assert.deepEqual(result.unresolvedDrivers, ['volume-main'])
})

test('qualitative-only relationships never become numeric contributions', () => {
  const result = calculateBusinessDriverAnalysis(base({ segments: [{ id: 'main', name: 'Main', outcomes: [{ metric: 'operating_profit', unit: 'CNY', currentValue: 12, priorValue: 10, currentSourceRefs: refs('profit-current'), priorSourceRefs: refs('profit-prior') }], drivers: [driver({ id: 'mix', name: 'Product mix', driverType: 'mix', metric: 'operating_profit', relationshipType: 'qualitative_dependency', unit: 'n/a', currentValue: undefined, priorValue: undefined, qualitativeExplanation: 'Higher-value products were emphasized.' })] }] }))
  const metric = result.metrics.find((item) => item.metric === 'operating_profit')!
  assert.deepEqual(metric.contributions, [])
  assert.equal(metric.residual, 2)
})

test('period and unit mismatches fail closed instead of aligning by assumption', () => {
  const result = calculateBusinessDriverAnalysis(base({ segments: [{ id: 'main', name: 'Main', outcomes: [{ metric: 'revenue', unit: 'CNY', currentValue: 120, priorValue: 100, currentSourceRefs: refs('current'), priorSourceRefs: refs('prior') }], drivers: [driver(), driver({ id: 'price', name: 'Price', driverType: 'price', unit: 'units', currentValue: 2, priorValue: 1, sourceRefs: refs('price') }), driver({ id: 'bad-period', name: 'Bad period', driverType: 'mix', relationshipType: 'additive', unit: 'CNY', period: '2025-H1', currentValue: 3, priorValue: 1, sourceRefs: refs('bad-period') })] }] }))
  const metric = result.metrics.find((item) => item.metric === 'revenue')!
  assert.equal(metric.status, 'partial')
  assert.deepEqual(metric.contributions, [])
  assert.ok(metric.diagnostics.some((item) => item.includes('period aligned')))
  assert.ok(metric.diagnostics.some((item) => item.includes('distinct')))
})

test('conflicting source values are retained as a diagnostic and excluded from arithmetic', () => {
  const result = calculateBusinessDriverAnalysis(base({ segments: [{ id: 'main', name: 'Main', outcomes: [{ metric: 'revenue', unit: 'CNY', currentValue: 120, priorValue: 100, currentSourceRefs: refs('current'), priorSourceRefs: refs('prior') }], drivers: [driver({ currentValue: 120, sourceRefs: refs('source-a') }), driver({ currentValue: 130, sourceRefs: refs('source-b') })] }] }))
  const metric = result.metrics.find((item) => item.metric === 'revenue')!
  assert.equal(metric.contributions.length, 0)
  assert.ok(metric.diagnostics.some((item) => item.includes('Conflicting source values')))
  assert.ok(metric.unavailableDrivers.includes('volume-main'))
})
