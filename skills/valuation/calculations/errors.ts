export const VALUATION_CALCULATION_ERROR_CODES = [
  'NON_FINITE_INPUT',
  'NON_FINITE_RESULT',
  'INVALID_TAX_RATE',
  'NEGATIVE_EQUITY_RISK_PREMIUM',
  'NEGATIVE_PRETAX_COST_OF_DEBT',
  'INVALID_CAPITAL_STRUCTURE',
  'EMPTY_FCFF_FORECAST',
  'INVALID_DISCOUNT_RATE',
  'INVALID_TERMINAL_GROWTH',
  'DISCOUNT_RATE_NOT_ABOVE_TERMINAL_GROWTH',
  'NON_POSITIVE_TERMINAL_FCFF',
  'INVALID_DILUTED_SHARES',
  'INVALID_BALANCE_SHEET_ADJUSTMENT',
  'REVERSE_DCF_NO_POSITIVE_TERMINAL_VALUE',
  'INVALID_STEADY_STATE_FCFF_MARGIN',
  'INVALID_CURRENT_REVENUE',
  'INVALID_COMPARABLE_INPUT',
  'INVALID_FISCAL_YEAR',
  'INVALID_FCFF_INPUT',
] as const

export type ValuationCalculationErrorCode = (typeof VALUATION_CALCULATION_ERROR_CODES)[number] | string

export class ValuationCalculationError extends Error {
  readonly code: string

  constructor(code: string, message: string) {
    super(message)
    this.name = 'ValuationCalculationError'
    this.code = code
  }
}

export function calculationError(code: string, message: string): never {
  throw new ValuationCalculationError(code, message)
}

export function finiteInput(value: number, label: string): number {
  if (!Number.isFinite(value)) calculationError('NON_FINITE_INPUT', `${label} must be finite`)
  return value
}

export function finiteResult(value: number, label: string): number {
  if (!Number.isFinite(value)) calculationError('NON_FINITE_RESULT', `${label} is not finite`)
  return value
}

export function nonNegative(value: number, label: string, code = 'INVALID_BALANCE_SHEET_ADJUSTMENT'): number {
  finiteInput(value, label)
  if (value < 0) calculationError(code, `${label} must be non-negative`)
  return value
}

export function boundedTaxRate(value: number): number {
  finiteInput(value, 'tax rate')
  if (value < 0 || value >= 1) calculationError('INVALID_TAX_RATE', 'tax rate must be at least zero and below one')
  return value
}
