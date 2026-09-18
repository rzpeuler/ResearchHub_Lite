import assert from 'node:assert/strict'
import test from 'node:test'
import {
  ValuationCalculationError,
  calculateAfterTaxCostOfDebt,
  calculateCapm,
  calculateComparableCompany,
  calculateComparableSet,
  calculateDcfSensitivity,
  calculateEnterpriseToEquity,
  calculateFcffPeriod,
  calculateForwardDcf,
  calculateImpliedEquityFromEvMultiple,
  calculateReverseDcf,
  calculateWacc,
  evaluateValuationQc,
} from '../../../skills/valuation/calculations/index.ts'

const TOLERANCE = 1e-10

function close(actual: number, expected: number, tolerance = TOLERANCE): void {
  assert.ok(Math.abs(actual - expected) <= tolerance, `expected ${actual} to be within ${tolerance} of ${expected}`)
}

function throwsCode(fn: () => unknown, code: string): void {
  assert.throws(fn, (error: unknown) => error instanceof ValuationCalculationError && error.code === code)
}

function assertFiniteDeep(value: unknown): void {
  if (typeof value === 'number') assert.ok(Number.isFinite(value), `non-finite number: ${value}`)
  else if (Array.isArray(value)) value.forEach(assertFiniteDeep)
  else if (value !== null && typeof value === 'object') Object.values(value).forEach(assertFiniteDeep)
}

test('CAPM computes cost of equity from explicit inputs', () => {
  close(calculateCapm({ riskFreeRate: 0.03, beta: 1.2, equityRiskPremium: 0.05 }).costOfEquity, 0.09)
})

test('CAPM validates finite inputs and non-negative equity risk premium', () => {
  throwsCode(() => calculateCapm({ riskFreeRate: Number.NaN, beta: 1.2, equityRiskPremium: 0.05 }), 'NON_FINITE_INPUT')
  throwsCode(() => calculateCapm({ riskFreeRate: 0.03, beta: 1.2, equityRiskPremium: -0.01 }), 'NEGATIVE_EQUITY_RISK_PREMIUM')
})

test('after-tax cost of debt applies the supplied tax rate and bounds tax inputs', () => {
  close(calculateAfterTaxCostOfDebt({ pretaxCostOfDebt: 0.05, taxRate: 0.25 }).afterTaxCostOfDebt, 0.0375)
  throwsCode(() => calculateAfterTaxCostOfDebt({ pretaxCostOfDebt: 0.05, taxRate: -0.01 }), 'INVALID_TAX_RATE')
  throwsCode(() => calculateAfterTaxCostOfDebt({ pretaxCostOfDebt: 0.05, taxRate: 1 }), 'INVALID_TAX_RATE')
  throwsCode(() => calculateAfterTaxCostOfDebt({ pretaxCostOfDebt: -0.01, taxRate: 0.25 }), 'NEGATIVE_PRETAX_COST_OF_DEBT')
})

test('WACC uses market equity and gross debt weights', () => {
  const result = calculateWacc({ marketValueEquity: 900, grossDebt: 100, costOfEquity: 0.09, pretaxCostOfDebt: 0.05, taxRate: 0.25 })
  close(result.equityWeight, 0.9)
  close(result.debtWeight, 0.1)
  close(result.afterTaxCostOfDebt, 0.0375)
  close(result.wacc, 0.08475)
  close(result.equityWeight + result.debtWeight, 1)
})

test('WACC handles zero gross debt and net-cash economics without negative weights', () => {
  const netCash = calculateWacc({ marketValueEquity: 1000, grossDebt: 50, costOfEquity: 0.09, pretaxCostOfDebt: 0.05, taxRate: 0.25 })
  close(netCash.debtWeight, 50 / 1050)
  assert.ok(netCash.debtWeight >= 0)
  const zeroDebt = calculateWacc({ marketValueEquity: 1000, grossDebt: 0, costOfEquity: 0.09, pretaxCostOfDebt: 0.05, taxRate: 0.25 })
  close(zeroDebt.debtWeight, 0)
  close(zeroDebt.wacc, zeroDebt.costOfEquity)
  throwsCode(() => calculateWacc({ marketValueEquity: 1000, grossDebt: -1, costOfEquity: 0.09, pretaxCostOfDebt: 0.05, taxRate: 0.25 }), 'INVALID_CAPITAL_STRUCTURE')
})

test('FCFF constructs deterministic per-period results and allows negative change in NWC', () => {
  const result = calculateFcffPeriod({ fiscalYear: 2026, revenue: 1000, ebitMargin: 0.2, taxRate: 0.25, depreciationAndAmortization: 50, capex: 60, changeInNwc: 20 })
  close(result.ebit, 200)
  close(result.nopat, 150)
  close(result.fcff, 120)
  const release = calculateFcffPeriod({ fiscalYear: 2026, revenue: 1000, ebitMargin: 0.2, taxRate: 0.25, depreciationAndAmortization: 50, capex: 60, changeInNwc: -20 })
  close(release.fcff, 160)
  throwsCode(() => calculateFcffPeriod({ fiscalYear: 2026.5, revenue: 1000, ebitMargin: 0.2, taxRate: 0.25, depreciationAndAmortization: 50, capex: 60, changeInNwc: 20 }), 'INVALID_FISCAL_YEAR')
})

const DCF_FIXTURE = [80, 90, 100, 110, 120] as const

test('forward DCF matches annual and mid-year known-value fixtures', () => {
  const annual = calculateForwardDcf({ fcff: DCF_FIXTURE, discountRate: 0.09, terminalGrowthRate: 0.03 })
  close(annual.pvExplicitFcff, 382.2825823859139)
  close(annual.terminalValueAtHorizon, 2060)
  close(annual.pvTerminalValue, 1338.8586557745912)
  close(annual.enterpriseValue, 1721.141238160505)
  close(annual.terminalValueShare, 0.7778900569516979)
  close(annual.terminalImpliedPriceToFcff!, 17.166666666666668)
  assert.deepEqual(annual.discountPeriods, [1, 2, 3, 4, 5])
  const midYear = calculateForwardDcf({ fcff: DCF_FIXTURE, discountRate: 0.09, terminalGrowthRate: 0.03, midYearConvention: true })
  close(midYear.enterpriseValue, 1796.9242071521485)
  assert.deepEqual(midYear.discountPeriods, [0.5, 1.5, 2.5, 3.5, 4.5])
})

test('forward DCF rejects invalid forecast and discount relationships', () => {
  throwsCode(() => calculateForwardDcf({ fcff: [], discountRate: 0.09, terminalGrowthRate: 0.03 }), 'EMPTY_FCFF_FORECAST')
  throwsCode(() => calculateForwardDcf({ fcff: DCF_FIXTURE, discountRate: 0.03, terminalGrowthRate: 0.03 }), 'DISCOUNT_RATE_NOT_ABOVE_TERMINAL_GROWTH')
  throwsCode(() => calculateForwardDcf({ fcff: [80, 90, 100, 110, 0], discountRate: 0.09, terminalGrowthRate: 0.03 }), 'NON_POSITIVE_TERMINAL_FCFF')
})

test('EV-to-equity bridge keeps cash separate from WACC', () => {
  const result = calculateEnterpriseToEquity({ enterpriseValue: 1050, grossDebt: 100, cashAndEquivalents: 50, dilutedShares: 100 })
  close(result.equityValue, 1000)
  close(result.valuePerShare!, 10)
  const netCash = calculateEnterpriseToEquity({ enterpriseValue: 1000, grossDebt: 50, cashAndEquivalents: 200 })
  close(netCash.equityValue, 1150)
  throwsCode(() => calculateEnterpriseToEquity({ enterpriseValue: 1000, grossDebt: 50, cashAndEquivalents: 200, dilutedShares: 0 }), 'INVALID_DILUTED_SHARES')
})

test('reverse DCF round-trips terminal FCFF and can decode revenue expectations', () => {
  const forward = calculateForwardDcf({ fcff: DCF_FIXTURE, discountRate: 0.09, terminalGrowthRate: 0.03 })
  const reverse = calculateReverseDcf({ currentEnterpriseValue: forward.enterpriseValue, explicitFcff: DCF_FIXTURE, discountRate: 0.09, terminalGrowthRate: 0.03, currentRevenue: 700, steadyStateFcffMargin: 0.12 })
  close(reverse.impliedTerminalFcff, 120, 1e-9)
  close(reverse.impliedTerminalRevenue!, 1000, 1e-9)
  close(reverse.impliedRevenueCagr!, 0.07394092378577932, 1e-10)
  throwsCode(() => calculateReverseDcf({ currentEnterpriseValue: 1, explicitFcff: DCF_FIXTURE, discountRate: 0.09, terminalGrowthRate: 0.03 }), 'REVERSE_DCF_NO_POSITIVE_TERMINAL_VALUE')
  throwsCode(() => calculateReverseDcf({ currentEnterpriseValue: forward.enterpriseValue, explicitFcff: DCF_FIXTURE, discountRate: 0.09, terminalGrowthRate: 0.03, steadyStateFcffMargin: 0 }), 'INVALID_STEADY_STATE_FCFF_MARGIN')
  throwsCode(() => calculateReverseDcf({ currentEnterpriseValue: forward.enterpriseValue, explicitFcff: DCF_FIXTURE, discountRate: 0.09, terminalGrowthRate: 0.03, currentRevenue: 0, steadyStateFcffMargin: 0.12 }), 'INVALID_CURRENT_REVENUE')
})

test('comparable-company calculations omit invalid denominator multiples', () => {
  const result = calculateComparableCompany({ id: 'fixture', marketCap: 1000, grossDebt: 100, cash: 50, revenue: 500, ebitda: 100, netIncome: 80, bookEquity: 400, freeCashFlow: 70, preferredStock: 0, minorityInterest: 0 })
  close(result.enterpriseValue, 1050)
  close(result.evRevenue!, 2.1)
  close(result.evEbitda!, 10.5)
  close(result.pe!, 12.5)
  close(result.pb!, 2.5)
  close(result.fcfYield!, 0.07)
  const invalid = calculateComparableCompany({ id: 'invalid', marketCap: 1000, grossDebt: 0, cash: 0, revenue: 500, ebitda: 0, netIncome: 0, bookEquity: 0, freeCashFlow: -50 })
  assert.equal('evEbitda' in invalid, false)
  assert.equal('pe' in invalid, false)
  close(invalid.fcfYield!, -0.05)
  assert.ok(invalid.invalidReasons.length >= 3)
})

test('peer set summaries use deterministic counts and odd/even medians without synthetic peers', () => {
  const peers = [
    { id: 'a', marketCap: 100, grossDebt: 0, cash: 0, revenue: 100 },
    { id: 'b', marketCap: 200, grossDebt: 0, cash: 0, revenue: 100 },
    { id: 'c', marketCap: 300, grossDebt: 0, cash: 0, revenue: 100 },
    { id: 'rejected', marketCap: 0, grossDebt: 0, cash: 0 },
  ]
  const result = calculateComparableSet(peers)
  assert.equal(result.validPeerCount, 3)
  assert.equal(result.rejectedPeerCount, 1)
  const summary = result.summaries.find((item) => item.kind === 'EV_REVENUE')!
  assert.equal(summary.validCount, 3)
  assert.equal(summary.rejectedCount, 1)
  close(summary.min, 1)
  close(summary.median, 2)
  close(summary.max, 3)
  const even = calculateComparableSet([{ id: 'one', marketCap: 100, grossDebt: 0, cash: 0, revenue: 100 }, { id: 'two', marketCap: 200, grossDebt: 0, cash: 0, revenue: 100 }])
  close(even.summaries.find((item) => item.kind === 'EV_REVENUE')!.median, 1.5)
  const empty = calculateComparableSet([])
  assert.equal(empty.peers.length, 0)
  assert.equal(empty.validPeerCount, 0)
  assert.equal(empty.rejectedPeerCount, 0)
})

test('implied equity from selected EV multiple is deterministic', () => {
  const result = calculateImpliedEquityFromEvMultiple({ metric: 100, selectedMultiple: 10, grossDebt: 100, cash: 200, dilutedShares: 100 })
  close(result.impliedEnterpriseValue, 1000)
  close(result.equityValue, 1100)
  close(result.valuePerShare, 11)
  throwsCode(() => calculateImpliedEquityFromEvMultiple({ metric: 100, selectedMultiple: 10, grossDebt: 100, cash: 200, dilutedShares: 0 }), 'INVALID_DILUTED_SHARES')
})

test('DCF sensitivity fully recalculates valid cells and exposes invalid cells', () => {
  const grid = calculateDcfSensitivity({ fcff: DCF_FIXTURE, discountRates: [0.08, 0.09, 0.1], terminalGrowthRates: [0.03, 0.08, 0.1] })
  assert.equal(grid.cells.length, 9)
  const direct = calculateForwardDcf({ fcff: DCF_FIXTURE, discountRate: 0.09, terminalGrowthRate: 0.03 }).enterpriseValue
  const cell = grid.cells.find((item) => item.discountRate === 0.09 && item.terminalGrowthRate === 0.03)!
  assert.equal(cell.status, 'available')
  close(cell.enterpriseValue!, direct)
  const invalid = grid.cells.find((item) => item.discountRate === 0.08 && item.terminalGrowthRate === 0.08)!
  assert.equal(invalid.status, 'unavailable')
  assert.equal(invalid.errorCode, 'DISCOUNT_RATE_NOT_ABOVE_TERMINAL_GROWTH')
  throwsCode(() => calculateDcfSensitivity({ fcff: DCF_FIXTURE, discountRates: [Number.NaN], terminalGrowthRates: [0.03] }), 'NON_FINITE_INPUT')
})

test('valuation QC reports terminal concentration and invalid discount/g relationships', () => {
  const warning = evaluateValuationQc({ discountRate: 0.09, terminalGrowthRate: 0.03, terminalValueShare: 0.81 })
  assert.ok(warning.some((issue) => issue.code === 'HIGH_TERMINAL_VALUE_CONCENTRATION' && issue.severity === 'warning'))
  const critical = evaluateValuationQc({ discountRate: 0.03, terminalGrowthRate: 0.03, terminalValueShare: -0.1, values: [1, Number.POSITIVE_INFINITY] })
  assert.ok(critical.some((issue) => issue.code === 'NON_FINITE_VALUES' && issue.severity === 'critical'))
  assert.ok(critical.some((issue) => issue.code === 'DISCOUNT_RATE_NOT_ABOVE_TERMINAL_GROWTH' && issue.severity === 'critical'))
  assert.ok(critical.some((issue) => issue.code === 'NEGATIVE_TERMINAL_VALUE_SHARE' && issue.severity === 'critical'))
})

test('calculation fixtures contain no NaN or Infinity', () => {
  const values = [
    calculateCapm({ riskFreeRate: 0.03, beta: 1.2, equityRiskPremium: 0.05 }),
    calculateAfterTaxCostOfDebt({ pretaxCostOfDebt: 0.05, taxRate: 0.25 }),
    calculateWacc({ marketValueEquity: 900, grossDebt: 100, costOfEquity: 0.09, pretaxCostOfDebt: 0.05, taxRate: 0.25 }),
    calculateFcffPeriod({ fiscalYear: 2026, revenue: 1000, ebitMargin: 0.2, taxRate: 0.25, depreciationAndAmortization: 50, capex: 60, changeInNwc: 20 }),
    calculateForwardDcf({ fcff: DCF_FIXTURE, discountRate: 0.09, terminalGrowthRate: 0.03 }),
    calculateReverseDcf({ currentEnterpriseValue: 1721.141238160505, explicitFcff: DCF_FIXTURE, discountRate: 0.09, terminalGrowthRate: 0.03 }),
    calculateComparableCompany({ id: 'finite', marketCap: 1000, grossDebt: 100, cash: 50, revenue: 500, ebitda: 100, netIncome: 80, bookEquity: 400, freeCashFlow: 70 }),
  ]
  values.forEach(assertFiniteDeep)
})
