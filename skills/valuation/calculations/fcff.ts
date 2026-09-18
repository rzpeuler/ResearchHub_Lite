import type { FcffForecastPeriodInput, FcffForecastPeriodResult } from './contracts.ts'
import { boundedTaxRate, calculationError, finiteInput, finiteResult, nonNegative } from './errors.ts'

export function calculateFcffPeriod(input: FcffForecastPeriodInput): FcffForecastPeriodResult {
  const fiscalYear = finiteInput(input.fiscalYear, 'fiscal year')
  if (!Number.isInteger(fiscalYear)) calculationError('INVALID_FISCAL_YEAR', 'fiscal year must be an integer')
  const revenue = nonNegative(input.revenue, 'revenue', 'INVALID_FCFF_INPUT')
  const ebitMargin = finiteInput(input.ebitMargin, 'EBIT margin')
  const taxRate = boundedTaxRate(input.taxRate)
  const depreciationAndAmortization = nonNegative(input.depreciationAndAmortization, 'depreciation and amortization', 'INVALID_FCFF_INPUT')
  const capex = nonNegative(input.capex, 'capex', 'INVALID_FCFF_INPUT')
  const changeInNwc = finiteInput(input.changeInNwc, 'change in NWC')
  const ebit = finiteResult(revenue * ebitMargin, 'EBIT')
  const nopat = finiteResult(ebit * (1 - taxRate), 'NOPAT')
  const fcff = finiteResult(nopat + depreciationAndAmortization - capex - changeInNwc, 'FCFF')
  return { ...input, ebit, nopat, fcff }
}

export function calculateFcffForecast(inputs: readonly FcffForecastPeriodInput[]): readonly FcffForecastPeriodResult[] {
  return inputs.map(calculateFcffPeriod)
}

export const calculateFcff = calculateFcffPeriod
