import type { AccrualQualityInput, AccrualQualityResult } from './contracts.ts'

function finite(value: number | undefined): value is number { return value !== undefined && Number.isFinite(value) }

/** Calculate the screening accrual ratio; this does not assess manipulation or fraud. */
export function calculateAccrualQuality(input: AccrualQualityInput): AccrualQualityResult {
  const missing: string[] = []
  const diagnostics: string[] = []
  const current = input.current
  const opening = input.opening
  if (!finite(opening.totalAssets)) missing.push('opening.totalAssets')
  if (!finite(current.totalAssets)) missing.push('current.totalAssets')
  if (!finite(current.netIncome)) missing.push('current.netIncome')
  if (!finite(current.cashFromOperations)) missing.push('current.cashFromOperations')
  if (finite(opening.totalAssets) && opening.totalAssets <= 0) diagnostics.push('opening total assets must be greater than zero')
  if (finite(current.totalAssets) && current.totalAssets <= 0) diagnostics.push('current total assets must be greater than zero')
  if (missing.length > 0 || diagnostics.length > 0) return { period: current.period, unavailableFields: [...new Set(missing)], unavailableReason: diagnostics[0] ?? 'Required accrual-quality inputs are unavailable', diagnostics }
  const averageTotalAssets = (opening.totalAssets! + current.totalAssets!) / 2
  if (!Number.isFinite(averageTotalAssets) || averageTotalAssets <= 0) return { period: current.period, unavailableFields: ['averageTotalAssets'], unavailableReason: 'Average total assets must be greater than zero', diagnostics: ['average total assets must be greater than zero'] }
  const accrualRatio = (current.netIncome! - current.cashFromOperations!) / averageTotalAssets
  if (!Number.isFinite(accrualRatio)) return { period: current.period, unavailableFields: ['accrualRatio'], unavailableReason: 'Accrual ratio is non-finite', diagnostics: ['accrual ratio must be finite'] }
  return { period: current.period, accrualRatio, unavailableFields: [], diagnostics: [] }
}

export function unavailableAccrualQuality(period: string, fields: readonly string[], diagnostics: readonly string[] = []): AccrualQualityResult {
  return { period, unavailableFields: fields, unavailableReason: 'Required accrual-quality inputs are unavailable', diagnostics }
}
