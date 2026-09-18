import type { ValuationQcInput, ValuationQcIssue } from './contracts.ts'

export function evaluateValuationQc(input: ValuationQcInput): readonly ValuationQcIssue[] {
  const issues: ValuationQcIssue[] = []
  if (!Number.isFinite(input.discountRate) || !Number.isFinite(input.terminalGrowthRate) || input.values?.some((value) => !Number.isFinite(value))) {
    issues.push({ code: 'NON_FINITE_VALUES', severity: 'critical', message: 'Valuation inputs or outputs contain a non-finite value.' })
  }
  if (Number.isFinite(input.discountRate) && input.discountRate <= 0) issues.push({ code: 'INVALID_DISCOUNT_RATE', severity: 'critical', message: 'Discount rate must be positive.' })
  if (Number.isFinite(input.terminalGrowthRate) && input.terminalGrowthRate <= -1) issues.push({ code: 'INVALID_TERMINAL_GROWTH', severity: 'critical', message: 'Terminal growth rate must be greater than negative one.' })
  if (Number.isFinite(input.discountRate) && Number.isFinite(input.terminalGrowthRate) && input.discountRate <= input.terminalGrowthRate) issues.push({ code: 'DISCOUNT_RATE_NOT_ABOVE_TERMINAL_GROWTH', severity: 'critical', message: 'Discount rate must exceed terminal growth rate.' })
  if (input.terminalValueShare !== undefined) {
    if (!Number.isFinite(input.terminalValueShare)) issues.push({ code: 'NON_FINITE_TERMINAL_VALUE_SHARE', severity: 'critical', message: 'Terminal value share is not finite.' })
    else if (input.terminalValueShare < 0) issues.push({ code: 'NEGATIVE_TERMINAL_VALUE_SHARE', severity: 'critical', message: 'Terminal value share is negative.' })
    else if (input.terminalValueShare > 0.8) issues.push({ code: 'HIGH_TERMINAL_VALUE_CONCENTRATION', severity: 'warning', message: 'High terminal-value concentration indicates assumption sensitivity.' })
  }
  return issues
}

export const valuationQualityControl = evaluateValuationQc
