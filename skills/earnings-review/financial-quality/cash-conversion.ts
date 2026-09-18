import type { CashConversionAnalysisInput, CashConversionQualityResult } from './contracts.ts'

function finite(value: number | undefined): value is number { return value !== undefined && Number.isFinite(value) }

/** Calculate CFO conversion and explicit-capex free-cash-flow ratios. */
export function calculateCashConversion(input: CashConversionAnalysisInput): CashConversionQualityResult {
  const current = input.current
  const unavailableFields: string[] = []
  const diagnostics: string[] = []
  if (!finite(current.cashFromOperations)) unavailableFields.push('current.cashFromOperations')
  if (!finite(current.netIncome)) unavailableFields.push('current.netIncome')
  const cfoToNetIncome = finite(current.cashFromOperations) && finite(current.netIncome) && current.netIncome !== 0 ? current.cashFromOperations / current.netIncome : undefined
  if (finite(current.netIncome) && current.netIncome === 0) diagnostics.push('net income must be non-zero for conversion ratios')
  if (cfoToNetIncome !== undefined && !Number.isFinite(cfoToNetIncome)) { unavailableFields.push('cfoToNetIncome'); diagnostics.push('CFO / Net Income must be finite') }
  let freeCashFlow: number | undefined
  if (finite(current.capex) && current.capex >= 0 && finite(current.cashFromOperations)) {
    freeCashFlow = current.cashFromOperations - current.capex
    if (!Number.isFinite(freeCashFlow)) { freeCashFlow = undefined; unavailableFields.push('freeCashFlow'); diagnostics.push('FCF must be finite') }
  } else if (current.capex !== undefined && (!finite(current.capex) || current.capex < 0)) {
    unavailableFields.push('current.capex')
    diagnostics.push('CapEx must be a non-negative explicit amount')
  } else unavailableFields.push('current.capex')
  const fcfToNetIncome = freeCashFlow !== undefined && finite(current.netIncome) && current.netIncome !== 0 ? freeCashFlow / current.netIncome : undefined
  if (fcfToNetIncome !== undefined && !Number.isFinite(fcfToNetIncome)) { unavailableFields.push('fcfToNetIncome'); diagnostics.push('FCF / Net Income must be finite') }
  return { period: current.period, ...(cfoToNetIncome !== undefined && Number.isFinite(cfoToNetIncome) ? { cfoToNetIncome } : {}), ...(freeCashFlow !== undefined ? { freeCashFlow } : {}), ...(fcfToNetIncome !== undefined && Number.isFinite(fcfToNetIncome) ? { fcfToNetIncome } : {}), unavailableFields: [...new Set(unavailableFields)], diagnostics: [...new Set(diagnostics)] }
}

export function unavailableCashConversion(period: string, fields: readonly string[], diagnostics: readonly string[] = []): CashConversionQualityResult {
  return { period, unavailableFields: fields, diagnostics }
}
