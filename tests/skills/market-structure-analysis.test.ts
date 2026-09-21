import assert from 'node:assert/strict'
import test from 'node:test'
import { analyzeMarketStructure, type MarketStructureInput } from '../../skills/market_structure_analysis/index.ts'

const refs = (name: string): readonly string[] => [`source:${name}`]
const base = (overrides: Partial<MarketStructureInput> = {}): MarketStructureInput => ({ marketRef: 'industry:pcb', asOf: '2026-09-21T00:00:00.000Z', boundary: { marketName: 'PCB manufacturing', included: ['rigid printed circuit boards'], excluded: ['semiconductor fabrication'], edgeCases: ['flex-rigid products'], geography: 'China', period: '2026', unit: 'CNY', sourceRefs: refs('boundary') }, segmentation: { axis: 'technology', values: ['standard', 'HDI'], sourceRefs: refs('segmentation') }, estimates: [{ id: 'estimate-a', definition: 'Chinese rigid PCB manufacturer revenue', geography: 'China', period: '2025', unit: 'CNY', method: 'top_down', value: 100, sourceRefs: refs('estimate-a') }], valueChain: [{ id: 'upstream-copper', stage: 'upstream', name: 'Copper foil', role: 'Key input', sourceRefs: refs('copper') }], ...overrides })

test('market structure validates an explicit boundary and segmentation axis', () => {
  const result = analyzeMarketStructure(base())
  assert.equal(result.status, 'complete')
  assert.deepEqual(result.boundary.included, ['rigid printed circuit boards'])
  assert.equal(result.segmentation.axis, 'technology')
  assert.equal(result.valueChain[0]?.stage, 'upstream')
})

test('market estimates preserve different definitions instead of averaging', () => {
  const result = analyzeMarketStructure(base({ estimates: [
    { id: 'a', definition: 'China PCB revenue', geography: 'China', period: '2025', unit: 'CNY', method: 'top_down', value: 100, sourceRefs: refs('a') },
    { id: 'b', definition: 'Global PCB shipments', geography: 'Global', period: '2024', unit: 'USD', method: 'bottom_up', value: 200, sourceRefs: refs('b') },
  ] }))
  assert.equal(result.status, 'complete')
  assert.equal(result.estimates.length, 2)
  assert.equal(result.reconciliations[0]?.conclusion, 'preserve_separately')
  assert.deepEqual(result.reconciliations[0]?.differences, ['definition', 'geography', 'period', 'unit', 'method'])
})

test('same-basis conflicting estimates are retained as a conflict', () => {
  const result = analyzeMarketStructure(base({ estimates: [
    { id: 'a', definition: 'China PCB revenue', geography: 'China', period: '2025', unit: 'CNY', method: 'top_down', value: 100, sourceRefs: refs('a') },
    { id: 'b', definition: 'China PCB revenue', geography: 'China', period: '2025', unit: 'CNY', method: 'top_down', value: 110, sourceRefs: refs('b') },
  ] }))
  assert.equal(result.reconciliations[0]?.conclusion, 'same_basis_conflict')
  assert.equal(result.reconciliations[0]?.comparable, true)
})

test('missing market boundary or segmentation fails closed', () => {
  const noBoundary = analyzeMarketStructure(base({ boundary: { ...base().boundary, included: [] } }))
  assert.equal(noBoundary.status, 'unavailable')
  const noSegmentation = analyzeMarketStructure(base({ segmentation: { axis: '', values: [], sourceRefs: [] } }))
  assert.equal(noSegmentation.status, 'unavailable')
})

test('invalid and unattributed market estimates remain unavailable', () => {
  const result = analyzeMarketStructure(base({ estimates: [{ id: 'bad', definition: 'bad', geography: 'China', period: '2025', unit: 'CNY', method: 'top_down', value: Number.NaN, sourceRefs: [] }] }))
  assert.equal(result.status, 'partial')
  assert.ok(result.diagnostics.some((item) => item.includes('non-negative finite value')))
  assert.ok(result.diagnostics.some((item) => item.includes('source references')))
})
