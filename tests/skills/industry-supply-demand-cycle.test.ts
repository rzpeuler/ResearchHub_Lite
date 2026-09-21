import assert from 'node:assert/strict'
import test from 'node:test'
import { analyzeIndustrySupplyDemandCycle, type IndustrySupplyDemandCycleInput } from '../../skills/industry_supply_demand_cycle/index.ts'

const refs = (name: string): readonly string[] => [`source:${name}`]
const base = (overrides: Partial<IndustrySupplyDemandCycleInput> = {}): IndustrySupplyDemandCycleInput => ({ industryRef: 'industry:semiconductor', asOf: '2026-09-21T00:00:00.000Z', demand: [{ id: 'orders', kind: 'orders', direction: 'down', period: '2026-H1', sourceRefs: refs('orders'), confidence: 'high', availability: 'reported' }], capacity: [{ id: 'effective-capacity', state: 'effective', change: 'up', value: 120, unit: 'wafers', period: '2026-H1', sourceRefs: refs('capacity') }], utilization: { period: '2026-H1', reportedValue: 0.5, unit: 'ratio', sourceRefs: refs('utilization') }, inventory: [{ id: 'channel', kind: 'channel_inventory', direction: 'up', level: 120, unit: 'days', period: '2026-H1', hasHistory: true, sourceRefs: refs('inventory') }], pricing: [{ id: 'spot', kind: 'spot_price', direction: 'down', currentValue: 90, priorValue: 100, unit: 'USD/unit', period: '2026-H1', priorPeriod: '2025-H1', sourceRefs: refs('price') }], ...overrides })

test('oversupply requires explicit demand, effective capacity, inventory, utilization, and price evidence', () => {
  const result = analyzeIndustrySupplyDemandCycle(base())
  assert.equal(result.status, 'complete')
  assert.equal(result.state, 'oversupply')
  assert.equal(result.inflection, 'confirmed_inflection')
  assert.equal(result.effectiveCapacity?.value, 120)
  assert.equal(result.priceDeltas[0]?.delta, -10)
})

test('destocking is distinct from oversupply when inventory falls with weak demand', () => {
  const result = analyzeIndustrySupplyDemandCycle(base({ demand: [{ id: 'end-demand', kind: 'end_demand', direction: 'flat', period: '2026-H1', sourceRefs: refs('demand'), confidence: 'medium', availability: 'reported' }], capacity: [{ id: 'effective', state: 'effective', change: 'flat', value: 100, unit: 'units', period: '2026-H1', sourceRefs: refs('capacity') }], inventory: [{ id: 'producer', kind: 'producer_inventory', direction: 'down', level: 80, unit: 'days', period: '2026-H1', hasHistory: true, sourceRefs: refs('inventory') }], pricing: [{ id: 'asp', kind: 'ASP', direction: 'down', currentValue: 90, priorValue: 100, unit: 'CNY/unit', period: '2026-H1', priorPeriod: '2025-H1', sourceRefs: refs('price') }] }))
  assert.equal(result.state, 'destocking')
})

test('tightening requires demand and price improvement without effective supply growth', () => {
  const result = analyzeIndustrySupplyDemandCycle(base({ demand: [{ id: 'demand', kind: 'end_demand', direction: 'up', period: '2026-H1', sourceRefs: refs('demand'), confidence: 'high', availability: 'reported' }], capacity: [{ id: 'effective', state: 'effective', change: 'flat', value: 100, unit: 'units', period: '2026-H1', sourceRefs: refs('capacity') }], utilization: { period: '2026-H1', reportedValue: 0.85, unit: 'ratio', sourceRefs: refs('utilization') }, inventory: [{ id: 'customer', kind: 'customer_inventory', direction: 'down', level: 30, unit: 'days', period: '2026-H1', hasHistory: true, sourceRefs: refs('inventory') }], pricing: [{ id: 'contract', kind: 'contract_price', direction: 'up', currentValue: 110, priorValue: 100, unit: 'CNY/unit', period: '2026-H1', priorPeriod: '2025-H1', sourceRefs: refs('price') }] }))
  assert.equal(result.state, 'tightening')
})

test('contradictory indicators remain visible and prevent a confident cycle state', () => {
  const result = analyzeIndustrySupplyDemandCycle(base({ inventory: [{ id: 'channel', kind: 'channel_inventory', direction: 'down', level: 80, unit: 'days', period: '2026-H1', hasHistory: true, sourceRefs: refs('inventory') }] }))
  assert.equal(result.state, 'unknown')
  assert.equal(result.inflection, 'insufficient_data')
  assert.ok(result.contradictingIndicators.length > 0)
  assert.equal(result.status, 'partial')
})

test('announced capacity is not promoted to effective capacity', () => {
  const result = analyzeIndustrySupplyDemandCycle(base({ capacity: [{ id: 'announced', state: 'announced', change: 'up', value: 500, unit: 'units', period: '2026-H1', sourceRefs: refs('announced') }] }))
  assert.equal(result.effectiveCapacity, undefined)
  assert.ok(result.missingIndicators.includes('effective_capacity'))
  assert.notEqual(result.state, 'oversupply')
})

test('inventory without history and missing utilization fail closed', () => {
  const result = analyzeIndustrySupplyDemandCycle(base({ utilization: undefined, inventory: [{ id: 'producer', kind: 'producer_inventory', direction: 'down', level: 100, unit: 'days', period: '2026-H1', hasHistory: false, sourceRefs: refs('inventory') }] }))
  assert.equal(result.status, 'partial')
  assert.ok(result.missingIndicators.includes('utilization'))
  assert.ok(result.diagnostics.some((item) => item.includes('inventory producer')))
})

test('price unit mismatch is explicit and does not reconcile by conversion', () => {
  const result = analyzeIndustrySupplyDemandCycle(base({ pricing: [
    { id: 'spot-cny', kind: 'spot_price', direction: 'down', currentValue: 90, priorValue: 100, unit: 'CNY/unit', period: '2026-H1', priorPeriod: '2025-H1', sourceRefs: refs('cny') },
    { id: 'spot-usd', kind: 'spot_price', direction: 'down', currentValue: 90, priorValue: 100, unit: 'USD/unit', period: '2026-H1', priorPeriod: '2025-H1', sourceRefs: refs('usd') },
  ] }))
  assert.ok(result.diagnostics.includes('pricing unit mismatch'))
  assert.equal(result.status, 'partial')
})

test('insufficient evidence has no synthetic cycle state', () => {
  const result = analyzeIndustrySupplyDemandCycle({ industryRef: 'industry:unknown', asOf: '2026-09-21T00:00:00.000Z', demand: [], capacity: [], inventory: [], pricing: [] })
  assert.equal(result.status, 'unavailable')
  assert.equal(result.state, 'unknown')
  assert.equal(result.inflection, 'no_evidence')
})
