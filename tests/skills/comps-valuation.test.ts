import assert from 'node:assert/strict'
import test from 'node:test'
import { executeCompsValuation, type ComparablePeerCandidate, type CompsValuationInput } from '../../skills/comps_valuation/index.ts'

const source = (candidateId: string, publishedAt = '2026-09-01T00:00:00.000Z') => ({ candidate: { candidateId, publishedAt }, retrievedAt: '2026-09-02T00:00:00.000Z' })
const baseFinancials = { marketCap: 1_000, grossDebt: 100, cash: 50, revenue: 500, ebitda: 100, netIncome: 80, bookEquity: 400, freeCashFlow: 70, dilutedShares: 100 }
const peer = (companyId: string, sourceId: string, overrides: Partial<ComparablePeerCandidate> = {}): ComparablePeerCandidate => ({ companyId, ticker: companyId, exchange: 'SSE', name: companyId, retrievedAt: '2026-09-02T00:00:00.000Z', asOf: '2026-09-01T00:00:00.000Z', sourceRefs: [sourceId], period: { kind: 'FY', label: 'FY2025', fiscalYear: 2025 }, currency: 'CNY', metricUnits: { marketCap: 'CNY_m', revenue: 'CNY_m', ebitda: 'CNY_m', netIncome: 'CNY_m', bookEquity: 'CNY_m', freeCashFlow: 'CNY_m' }, shareBasis: 'diluted', comparabilityEvidence: ['business_model', 'economics'], financials: baseFinancials, ...overrides })
const input = (candidatePeers: readonly ComparablePeerCandidate[], selection: CompsValuationInput['selection'] = { method: 'EV_REVENUE', basis: 'peer_median' }): CompsValuationInput => ({ subject: { identity: { companyId: 'target', ticker: '600519', exchange: 'SSE', name: 'Target' }, period: { kind: 'FY', label: 'FY2025', fiscalYear: 2025 }, asOf: '2026-09-03T00:00:00.000Z', currency: 'CNY', metricUnits: { marketCap: 'CNY_m', revenue: 'CNY_m', ebitda: 'CNY_m', netIncome: 'CNY_m', bookEquity: 'CNY_m', freeCashFlow: 'CNY_m' }, shareBasis: 'diluted', financials: baseFinancials }, asOf: '2026-09-03T00:00:00.000Z', candidatePeers, sources: candidatePeers.flatMap((item) => item.sourceRefs.map((id) => source(id))), selection })

test('comps accepts attributable peers, exposes distribution, and calculates selected median value', () => {
  const result = executeCompsValuation(input([peer('a', 'source-a'), peer('b', 'source-b', { financials: { ...baseFinancials, marketCap: 2_000 } }), peer('c', 'source-c', { financials: { ...baseFinancials, marketCap: 3_000 } })]))
  assert.equal(result.acceptedPeers.length, 3)
  assert.equal(result.rejectedPeers.length, 0)
  assert.equal(result.multipleSummaries.find((item) => item.kind === 'EV_REVENUE')?.median, 4.1)
  assert.equal(result.selectedMultiple, 4.1)
  assert.equal(result.impliedValuation?.valuePerShare, 20)
  assert.equal(result.availability, 'available')
})

test('comps rejects unresolved, missing-source, future, period, currency, and weak-evidence peers explicitly', () => {
  const result = executeCompsValuation(input([
    peer('missing', 'missing-source', { sourceRefs: [] }),
    peer('future', 'future-source', { publishedAt: '2026-09-04T00:00:00.000Z' }),
    peer('period', 'period-source', { period: { kind: 'FY', label: 'FY2026', fiscalYear: 2026 } }),
    peer('currency', 'currency-source', { currency: 'USD' }),
    peer('weak', 'weak-source', { comparabilityEvidence: [] }),
  ], undefined))
  const reasons = new Map(result.rejectedPeers.map((item) => [item.identity.companyId, item.reasonCodes]))
  assert.ok(reasons.get('missing')?.includes('SOURCE_MISSING'))
  assert.ok(reasons.get('future')?.includes('POST_ASOF_DATA'))
  assert.ok(reasons.get('period')?.includes('PERIOD_MISMATCH'))
  assert.ok(reasons.get('currency')?.includes('CURRENCY_MISMATCH'))
  assert.ok(reasons.get('weak')?.includes('INSUFFICIENT_COMPARABILITY_EVIDENCE'))
})

test('negative EBITDA is metric-specific and remains usable for EV/Revenue', () => {
  const result = executeCompsValuation(input([peer('negative-ebitda', 'source-negative', { financials: { ...baseFinancials, ebitda: -10 } })], { method: 'EV_REVENUE', basis: 'peer_median' }))
  assert.equal(result.acceptedPeers.length, 1)
  assert.equal(result.acceptedPeers[0]?.metricDiagnostics.some((item) => item.method === 'EV_EBITDA' && item.reasonCode === 'NON_POSITIVE_DENOMINATOR'), true)
  assert.equal(result.multipleSummaries.some((item) => item.kind === 'EV_EBITDA'), false)
  assert.equal(result.multipleSummaries.some((item) => item.kind === 'EV_REVENUE'), true)
})

test('comps rejects insufficient selected-method peers without synthetic filling', () => {
  const result = executeCompsValuation(input([peer('one', 'source-one', { financials: { ...baseFinancials, ebitda: -1 } })], { method: 'EV_EBITDA', basis: 'peer_median' }))
  assert.equal(result.acceptedPeers.length, 1)
  assert.equal(result.multipleSummaries.some((item) => item.kind === 'EV_EBITDA'), false)
  assert.ok(result.diagnostics.includes('INSUFFICIENT_VALID_PEERS'))
  assert.equal(result.availability, 'insufficient_data')
})

test('comps keeps competitor context separate from valuation peer acceptance', () => {
  const result = executeCompsValuation(input([peer('competitor', 'source-competitor', { comparabilityEvidence: [] })]))
  assert.equal(result.acceptedPeers.length, 0)
  assert.equal(result.rejectedPeers[0]?.reasonCodes.includes('INSUFFICIENT_COMPARABILITY_EVIDENCE'), true)
})

test('comps rejects forged source references and incompatible metric units', () => {
  const result = executeCompsValuation({ ...input([peer('forged', 'not-in-sources', { metricUnits: { ...peer('unit', 'source-unit').metricUnits, revenue: 'CNY_k' } })]), sources: [] })
  assert.equal(result.acceptedPeers.length, 0)
  assert.ok(result.rejectedPeers[0]?.reasonCodes.includes('SOURCE_REF_DANGLING'))
  assert.ok(result.rejectedPeers[0]?.reasonCodes.includes('UNIT_MISMATCH'))
})
