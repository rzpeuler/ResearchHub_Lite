import type { DcfInput, DcfResult, DcfSensitivityResult, EnterpriseToEquityInput, EnterpriseToEquityResult, ReverseDcfInput, ReverseDcfResult } from './contracts.ts'
import { ValuationCalculationError, calculationError, finiteInput, finiteResult, nonNegative } from './errors.ts'

interface ValidatedDcfInput {
  readonly fcff: readonly number[]
  readonly discountRate: number
  readonly terminalGrowthRate: number
  readonly discountPeriods: readonly number[]
}

function validateDcfInput(input: DcfInput): ValidatedDcfInput {
  if (input.fcff.length === 0) calculationError('EMPTY_FCFF_FORECAST', 'FCFF forecast must not be empty')
  const fcff = input.fcff.map((value) => finiteInput(value, 'FCFF'))
  const discountRate = finiteInput(input.discountRate, 'discount rate')
  if (discountRate <= 0) calculationError('INVALID_DISCOUNT_RATE', 'discount rate must be positive')
  const terminalGrowthRate = finiteInput(input.terminalGrowthRate, 'terminal growth rate')
  if (terminalGrowthRate <= -1) calculationError('INVALID_TERMINAL_GROWTH', 'terminal growth rate must be greater than negative one')
  if (discountRate <= terminalGrowthRate) calculationError('DISCOUNT_RATE_NOT_ABOVE_TERMINAL_GROWTH', 'discount rate must exceed terminal growth rate')
  if (fcff[fcff.length - 1]! <= 0) calculationError('NON_POSITIVE_TERMINAL_FCFF', 'terminal FCFF must be positive')
  const midYearConvention = input.midYearConvention === true
  const discountPeriods = fcff.map((_, index) => midYearConvention ? index + 0.5 : index + 1)
  return { fcff, discountRate, terminalGrowthRate, discountPeriods }
}

export function calculateForwardDcf(input: DcfInput): DcfResult {
  const validated = validateDcfInput(input)
  const { fcff, discountRate, terminalGrowthRate, discountPeriods } = validated
  const pvExplicitFcff = finiteResult(fcff.reduce((sum, value, index) => sum + value / Math.pow(1 + discountRate, discountPeriods[index]!), 0), 'PV of explicit FCFF')
  const terminalValueAtHorizon = finiteResult(fcff[fcff.length - 1]! * (1 + terminalGrowthRate) / (discountRate - terminalGrowthRate), 'terminal value')
  const terminalDiscountPeriod = discountPeriods[discountPeriods.length - 1]!
  const pvTerminalValue = finiteResult(terminalValueAtHorizon / Math.pow(1 + discountRate, terminalDiscountPeriod), 'PV of terminal value')
  const enterpriseValue = finiteResult(pvExplicitFcff + pvTerminalValue, 'enterprise value')
  const terminalValueShare = finiteResult(pvTerminalValue / enterpriseValue, 'terminal value share')
  const terminalImpliedPriceToFcff = finiteResult(terminalValueAtHorizon / fcff[fcff.length - 1]!, 'terminal implied price to FCFF')
  return { enterpriseValue, pvExplicitFcff, terminalValueAtHorizon, pvTerminalValue, terminalValueShare, terminalImpliedPriceToFcff, discountPeriods }
}

export function calculateEnterpriseToEquity(input: EnterpriseToEquityInput): EnterpriseToEquityResult {
  const enterpriseValue = finiteInput(input.enterpriseValue, 'enterprise value')
  const grossDebt = nonNegative(input.grossDebt, 'gross debt')
  const cashAndEquivalents = nonNegative(input.cashAndEquivalents, 'cash and equivalents')
  const nonOperatingAssets = input.nonOperatingAssets === undefined ? 0 : nonNegative(input.nonOperatingAssets, 'non-operating assets')
  const preferredStock = input.preferredStock === undefined ? 0 : nonNegative(input.preferredStock, 'preferred stock')
  const minorityInterest = input.minorityInterest === undefined ? 0 : nonNegative(input.minorityInterest, 'minority interest')
  const unfundedPension = input.unfundedPension === undefined ? 0 : nonNegative(input.unfundedPension, 'unfunded pension')
  const equityValue = finiteResult(enterpriseValue - grossDebt + cashAndEquivalents + nonOperatingAssets - preferredStock - minorityInterest - unfundedPension, 'equity value')
  if (input.dilutedShares === undefined) return { equityValue }
  const dilutedShares = finiteInput(input.dilutedShares, 'diluted shares')
  if (dilutedShares <= 0) calculationError('INVALID_DILUTED_SHARES', 'diluted shares must be positive')
  return { equityValue, valuePerShare: finiteResult(equityValue / dilutedShares, 'value per share') }
}

export function calculateReverseDcf(input: ReverseDcfInput): ReverseDcfResult {
  const currentEnterpriseValue = finiteInput(input.currentEnterpriseValue, 'current enterprise value')
  const validated = validateDcfInput({ fcff: input.explicitFcff, discountRate: input.discountRate, terminalGrowthRate: input.terminalGrowthRate })
  const { fcff, discountRate, terminalGrowthRate, discountPeriods } = validated
  const pvExplicitFcff = finiteResult(fcff.reduce((sum, value, index) => sum + value / Math.pow(1 + discountRate, discountPeriods[index]!), 0), 'PV of explicit FCFF')
  const pvTerminalValueRequired = currentEnterpriseValue - pvExplicitFcff
  if (!Number.isFinite(pvTerminalValueRequired)) calculationError('NON_FINITE_RESULT', 'required PV of terminal value is not finite')
  if (pvTerminalValueRequired <= 0) calculationError('REVERSE_DCF_NO_POSITIVE_TERMINAL_VALUE', 'current enterprise value does not imply a positive terminal value')
  const horizon = fcff.length
  const terminalValueAtHorizon = finiteResult(pvTerminalValueRequired * Math.pow(1 + discountRate, horizon), 'implied terminal value')
  const terminalFcffNext = finiteResult(terminalValueAtHorizon * (discountRate - terminalGrowthRate), 'implied next-period terminal FCFF')
  const impliedTerminalFcff = finiteResult(terminalFcffNext / (1 + terminalGrowthRate), 'implied terminal FCFF')
  if (input.steadyStateFcffMargin !== undefined) {
    const steadyStateFcffMargin = finiteInput(input.steadyStateFcffMargin, 'steady-state FCFF margin')
    if (steadyStateFcffMargin <= 0) calculationError('INVALID_STEADY_STATE_FCFF_MARGIN', 'steady-state FCFF margin must be positive')
    const impliedTerminalRevenue = finiteResult(impliedTerminalFcff / steadyStateFcffMargin, 'implied terminal revenue')
    if (input.currentRevenue === undefined) return { impliedTerminalFcff, impliedTerminalRevenue }
    const currentRevenue = finiteInput(input.currentRevenue, 'current revenue')
    if (currentRevenue <= 0) calculationError('INVALID_CURRENT_REVENUE', 'current revenue must be positive')
    return { impliedTerminalFcff, impliedTerminalRevenue, impliedRevenueCagr: finiteResult(Math.pow(impliedTerminalRevenue / currentRevenue, 1 / horizon) - 1, 'implied revenue CAGR') }
  }
  if (input.currentRevenue !== undefined) {
    const currentRevenue = finiteInput(input.currentRevenue, 'current revenue')
    if (currentRevenue <= 0) calculationError('INVALID_CURRENT_REVENUE', 'current revenue must be positive')
  }
  return { impliedTerminalFcff }
}

export function calculateDcfSensitivity(input: { readonly fcff: readonly number[]; readonly discountRates: readonly number[]; readonly terminalGrowthRates: readonly number[]; readonly midYearConvention?: boolean }): DcfSensitivityResult {
  const discountRates = input.discountRates.map((value) => finiteInput(value, 'sensitivity discount rate'))
  const terminalGrowthRates = input.terminalGrowthRates.map((value) => finiteInput(value, 'sensitivity terminal growth rate'))
  const cells = discountRates.flatMap((discountRate) => terminalGrowthRates.map((terminalGrowthRate) => {
    try {
      const result = calculateForwardDcf({ fcff: input.fcff, discountRate, terminalGrowthRate, ...(input.midYearConvention === undefined ? {} : { midYearConvention: input.midYearConvention }) })
      return { discountRate, terminalGrowthRate, status: 'available' as const, enterpriseValue: result.enterpriseValue }
    } catch (error) {
      const errorCode = error instanceof ValuationCalculationError ? error.code : 'NON_FINITE_RESULT'
      return { discountRate, terminalGrowthRate, status: 'unavailable' as const, errorCode }
    }
  }))
  return { discountRates, terminalGrowthRates, cells }
}

export const calculateDcf = calculateForwardDcf
