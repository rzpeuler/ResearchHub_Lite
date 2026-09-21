import assert from 'node:assert/strict'
import test from 'node:test'
import { calculateUnitEconomics, type UnitEconomicsInput, type UnitDefinitionInput, type UnitMetricObservation } from '../../skills/unit_economics/index.ts'

const refs = (name: string): readonly string[] => [`source:${name}`]
const metric = (overrides: Partial<UnitMetricObservation> = {}): UnitMetricObservation => ({ metric: 'revenue', unit: 'CNY', currentValue: 1_200, priorValue: 1_000, currentPeriod: '2026-H1', priorPeriod: '2025-H1', sourceRefs: refs('revenue'), availability: 'reported', ...overrides })
const unit = (overrides: Partial<UnitDefinitionInput> = {}): UnitDefinitionInput => ({ id: 'shipment', name: 'Shipped unit', unitType: 'shipment', scope: 'industrial segment', countUnit: 'units', currentCount: 120, priorCount: 100, currentCountSourceRefs: refs('count-current'), priorCountSourceRefs: refs('count-prior'), metrics: [metric()], ...overrides })
const base = (overrides: Partial<UnitEconomicsInput> = {}): UnitEconomicsInput => ({ companyRef: 'entity:company', archetype: 'manufacturing', currentPeriod: '2026-H1', priorPeriod: '2025-H1', units: [unit()], asOf: '2026-09-21T00:00:00.000Z', ...overrides })

test('industrial shipment economics calculates revenue and gross profit per unit', () => {
  const result = calculateUnitEconomics(base({ units: [unit({ metrics: [metric(), metric({ metric: 'gross_profit', currentValue: 360, priorValue: 250, unit: 'CNY' })] })] }))
  assert.equal(result.status, 'complete')
  const shipment = result.units[0]!
  assert.equal(shipment.metrics.find((item) => item.metric === 'revenue')?.currentPerUnit, 10)
  assert.equal(shipment.metrics.find((item) => item.metric === 'gross_profit')?.priorPerUnit, 2.5)
})

test('subscription/customer economics generalizes beyond manufacturing', () => {
  const result = calculateUnitEconomics(base({ archetype: 'software_saas', units: [unit({ id: 'customer', name: 'Active customer', unitType: 'customer', countUnit: 'customers', currentCount: 1_200, priorCount: 1_000, metrics: [metric({ unit: 'USD', currentValue: 14_400, priorValue: 10_000 })] })] }))
  assert.equal(result.status, 'complete')
  assert.equal(result.units[0]?.metrics[0]?.currentPerUnit, 12)
})

test('missing denominator data fails closed without an inferred unit', () => {
  const result = calculateUnitEconomics(base({ units: [unit({ currentCount: undefined, priorCount: undefined })] }))
  assert.equal(result.status, 'unavailable')
  assert.equal(result.units.length, 0)
  assert.ok(result.diagnostics.some((item) => item.includes('positive current denominator')))
})

test('wrong period and wrong numerator unit remain unavailable', () => {
  const period = calculateUnitEconomics(base({ units: [unit({ metrics: [metric({ currentPeriod: '2025-FY' })] })] }))
  assert.equal(period.units[0]?.metrics[0]?.status, 'unavailable')
  assert.ok(period.units[0]?.diagnostics.some((item) => item.includes('period mismatch')))
  const unitMismatch = calculateUnitEconomics(base({ units: [unit({ metrics: [metric({ unit: 'units' })] })] }))
  assert.equal(unitMismatch.units[0]?.metrics[0]?.status, 'unavailable')
  assert.ok(unitMismatch.units[0]?.diagnostics.some((item) => item.includes('units are not distinguishable')))
})

test('negative or zero denominators are rejected', () => {
  const result = calculateUnitEconomics(base({ units: [unit({ currentCount: 0 }), unit({ id: 'negative', currentCount: -1 })] }))
  assert.equal(result.status, 'unavailable')
  assert.equal(result.units.length, 0)
})

test('volume-price growth decomposition is code-owned and partial data stays partial', () => {
  const complete = calculateUnitEconomics(base({ growthDecompositions: [{ unitId: 'shipment', revenueUnit: 'CNY', currentRevenue: 1_320, priorRevenue: 1_000, currentSourceRefs: refs('revenue-current'), priorSourceRefs: refs('revenue-prior'), components: [{ kind: 'volume', unit: 'units', currentValue: 120, priorValue: 100, sourceRefs: refs('volume'), availability: 'reported' }, { kind: 'price', unit: 'CNY/unit', currentValue: 11, priorValue: 10, sourceRefs: refs('price'), availability: 'reported' }] }] }))
  assert.equal(complete.growthDecompositions[0]?.status, 'complete')
  assert.deepEqual(complete.growthDecompositions[0]?.components.map((item) => item.amount), [200, 120])
  assert.equal(complete.growthDecompositions[0]?.residual, 0)
  const partial = calculateUnitEconomics(base({ growthDecompositions: [{ unitId: 'shipment', revenueUnit: 'CNY', currentRevenue: 1_200, priorRevenue: 1_000, currentSourceRefs: refs('revenue-current'), priorSourceRefs: refs('revenue-prior'), components: [{ kind: 'volume', unit: 'units', currentValue: 120, priorValue: 100, sourceRefs: refs('volume'), availability: 'reported' }] }] }))
  assert.equal(partial.growthDecompositions[0]?.status, 'unavailable')
  assert.equal(partial.growthDecompositions[0]?.residual, 200)
})

test('multi-segment unit definitions remain separately scoped', () => {
  const result = calculateUnitEconomics(base({ units: [unit(), unit({ id: 'service', name: 'Service customer', unitType: 'customer', countUnit: 'customers', currentCount: 200, priorCount: 100, metrics: [metric({ unit: 'CNY', currentValue: 800, priorValue: 300 })] })] }))
  assert.equal(result.status, 'complete')
  assert.deepEqual(result.units.map((item) => item.id), ['shipment', 'service'])
  assert.equal(result.units[1]?.metrics[0]?.currentPerUnit, 4)
})

test('operating leverage computes incremental margins only from explicit outcomes', () => {
  const result = calculateUnitEconomics(base({ operatingLeverage: { currentRevenue: 1_320, priorRevenue: 1_000, currentGrossProfit: 500, priorGrossProfit: 350, currentOperatingProfit: 200, priorOperatingProfit: 100, unit: 'CNY', currentSourceRefs: refs('leverage-current'), priorSourceRefs: refs('leverage-prior') } }))
  assert.equal(result.operatingLeverage?.status, 'complete')
  assert.equal(result.operatingLeverage?.incrementalGrossMargin, 150 / 320)
  assert.equal(result.operatingLeverage?.incrementalOperatingMargin, 100 / 320)
})
