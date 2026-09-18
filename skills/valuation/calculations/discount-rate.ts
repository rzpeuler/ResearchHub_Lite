import type { AfterTaxCostOfDebtInput, AfterTaxCostOfDebtResult, CapmInput, CapmResult, WaccInput, WaccResult } from './contracts.ts'
import { boundedTaxRate, calculationError, finiteInput, finiteResult, nonNegative } from './errors.ts'

export function calculateCapm(input: CapmInput): CapmResult {
  const riskFreeRate = finiteInput(input.riskFreeRate, 'risk-free rate')
  const beta = finiteInput(input.beta, 'beta')
  const equityRiskPremium = finiteInput(input.equityRiskPremium, 'equity risk premium')
  if (equityRiskPremium < 0) calculationError('NEGATIVE_EQUITY_RISK_PREMIUM', 'equity risk premium must be non-negative')
  return { costOfEquity: finiteResult(riskFreeRate + beta * equityRiskPremium, 'cost of equity') }
}

export function calculateAfterTaxCostOfDebt(input: AfterTaxCostOfDebtInput): AfterTaxCostOfDebtResult {
  const pretaxCostOfDebt = finiteInput(input.pretaxCostOfDebt, 'pretax cost of debt')
  if (pretaxCostOfDebt < 0) calculationError('NEGATIVE_PRETAX_COST_OF_DEBT', 'pretax cost of debt must be non-negative')
  const taxRate = boundedTaxRate(input.taxRate)
  return { afterTaxCostOfDebt: finiteResult(pretaxCostOfDebt * (1 - taxRate), 'after-tax cost of debt') }
}

export function calculateWacc(input: WaccInput): WaccResult {
  const marketValueEquity = finiteInput(input.marketValueEquity, 'market value equity')
  if (marketValueEquity <= 0) calculationError('INVALID_CAPITAL_STRUCTURE', 'market value equity must be positive')
  const grossDebt = nonNegative(input.grossDebt, 'gross debt', 'INVALID_CAPITAL_STRUCTURE')
  const costOfEquity = finiteInput(input.costOfEquity, 'cost of equity')
  const pretaxCostOfDebt = finiteInput(input.pretaxCostOfDebt, 'pretax cost of debt')
  if (pretaxCostOfDebt < 0) calculationError('NEGATIVE_PRETAX_COST_OF_DEBT', 'pretax cost of debt must be non-negative')
  const taxRate = boundedTaxRate(input.taxRate)
  const capital = finiteResult(marketValueEquity + grossDebt, 'total capital')
  if (capital <= 0) calculationError('INVALID_CAPITAL_STRUCTURE', 'total capital must be positive')
  const equityWeight = finiteResult(marketValueEquity / capital, 'equity weight')
  const debtWeight = finiteResult(grossDebt / capital, 'debt weight')
  if (equityWeight < 0 || equityWeight > 1 || debtWeight < 0 || debtWeight > 1 || Math.abs(equityWeight + debtWeight - 1) > 1e-12) calculationError('INVALID_CAPITAL_STRUCTURE', 'capital weights are invalid')
  const afterTaxCostOfDebt = finiteResult(pretaxCostOfDebt * (1 - taxRate), 'after-tax cost of debt')
  return { wacc: finiteResult(equityWeight * costOfEquity + debtWeight * afterTaxCostOfDebt, 'WACC'), equityWeight, debtWeight, costOfEquity, afterTaxCostOfDebt }
}
