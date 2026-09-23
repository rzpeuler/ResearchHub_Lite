import assert from 'node:assert/strict'
import test from 'node:test'
import { executeEquityMultipleComps, type AutomaticComparablePeer, type AutomaticEquityCompsInput } from '../../skills/comps_valuation/index.ts'

const peer = (ticker: string, overrides: Partial<AutomaticComparablePeer> = {}): AutomaticComparablePeer => ({ identity: { companyId: `${ticker}.SZ`, ticker, exchange: 'SZ' }, cohortFamilyCount: 2, cohortMembership: [], scale: { marketCap: 100 }, growth: { revenueGrowth3Y: 0.1 }, marketPrice: 100, eps: 10, bvps: 20, multipleBasisFiscalYear: 2025, sourceRefs: [`peer-${ticker}`], diagnostics: [], ...overrides })
const input = (peers: readonly AutomaticComparablePeer[], selectedMethod: 'PE' | 'PB' = 'PE'): AutomaticEquityCompsInput => ({ subject: { identity: { companyId: '600519.SH', ticker: '600519', exchange: 'SH' }, sourceRefs: ['target'] }, selectedMethod, multipleBasisFiscalYear: 2025, targetFiscalYear: 2026, valuationDate: '2026-09-09T00:00:00.000Z', targetForecastMetric: selectedMethod === 'PE' ? 12 : 24, peers })

test('automatic PE and PB are independent and use exact positive denominators', () => {
  const result = executeEquityMultipleComps(input([peer('000001', { marketPrice: 100, eps: 10, bvps: undefined }), peer('000002', { marketPrice: 120, eps: 10, bvps: 20 }), peer('000003', { marketPrice: 140, eps: 10, bvps: 28 })]))
  assert.equal(result.multipleSummaries.find((item) => item.method === 'PE')?.median, 12)
  assert.equal(result.multipleSummaries.find((item) => item.method === 'PB')?.validCount, 2)
  assert.equal(result.selectedMedian, 12)
  assert.equal(result.impliedTargetPrice, 144)
  assert.equal(result.availability, 'available')
})

test('automatic selected PB remains independently available when PE is insufficient', () => {
  const result = executeEquityMultipleComps(input([peer('000001', { eps: undefined, bvps: 10 }), peer('000002', { eps: undefined, bvps: 12 }), peer('000003', { eps: undefined, bvps: 14 })], 'PB'))
  assert.equal(result.selectedMethod, 'PB')
  assert.equal(result.multipleSummaries.find((item) => item.method === 'PE')?.validCount, 0)
  assert.equal(result.multipleSummaries.find((item) => item.method === 'PB')?.validCount, 3)
  assert.equal(result.impliedTargetPrice, 200)
  assert.equal(result.availability, 'available')
})

test('automatic comps use at most eight calculation peers and require three valid peers', () => {
  const result = executeEquityMultipleComps(input(Array.from({ length: 10 }, (_, index) => peer(`00000${index + 1}`, { marketPrice: 100 + index }))))
  assert.equal(result.validPeers.length, 8)
  assert.equal(result.multipleSummaries.find((item) => item.method === 'PE')?.validCount, 8)
  const insufficient = executeEquityMultipleComps(input([peer('000001'), peer('000002')]))
  assert.equal(insufficient.availability, 'insufficient_data')
  assert.ok(insufficient.diagnostics.includes('INSUFFICIENT_VALID_PEERS'))
})
