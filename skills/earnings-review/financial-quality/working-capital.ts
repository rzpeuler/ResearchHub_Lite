import type { FinancialQualityPeriodFacts, WorkingCapitalAnalysisInput, WorkingCapitalQualityResult } from './contracts.ts'

function finite(value: number | undefined): value is number { return value !== undefined && Number.isFinite(value) }
function addMissing(missing: string[], condition: boolean, field: string): void { if (!condition && !missing.includes(field)) missing.push(field) }
function average(opening: number | undefined, current: number | undefined, field: string, missing: string[], diagnostics: string[]): number | undefined {
  addMissing(missing, finite(opening), `opening.${field}`)
  addMissing(missing, finite(current), `current.${field}`)
  if (!finite(opening) || !finite(current)) return undefined
  if (opening < 0 || current < 0) { diagnostics.push(`${field} balances must be non-negative`); return undefined }
  const result = (opening + current) / 2
  return Number.isFinite(result) ? result : undefined
}

function days(current: FinancialQualityPeriodFacts, missing: string[], diagnostics: string[]): number | undefined {
  if (!finite(current.daysInPeriod) || current.daysInPeriod <= 0) { addMissing(missing, false, 'daysInPeriod'); diagnostics.push('daysInPeriod must be greater than zero'); return undefined }
  return current.daysInPeriod
}

/** Calculate DSO, DIO, DPO, and CCC from explicit current/opening balances. */
export function calculateWorkingCapital(input: WorkingCapitalAnalysisInput): WorkingCapitalQualityResult {
  const missing: string[] = []
  const diagnostics: string[] = []
  const current = input.current
  const opening = input.opening
  const periodDays = days(current, missing, diagnostics)
  const averageReceivables = average(opening.receivables, current.receivables, 'receivables', missing, diagnostics)
  const averageInventory = average(opening.inventory, current.inventory, 'inventory', missing, diagnostics)
  const averagePayables = average(opening.payables, current.payables, 'payables', missing, diagnostics)
  const result: { dso?: number; dio?: number; dpo?: number } = {}

  if (periodDays !== undefined && averageReceivables !== undefined && finite(current.revenue) && current.revenue > 0) { const value = averageReceivables / current.revenue * periodDays; if (Number.isFinite(value)) result.dso = value; else { missing.push('dso'); diagnostics.push('DSO must be finite') } }
  else { addMissing(missing, finite(current.revenue) && current.revenue > 0, 'current.revenue'); if (finite(current.revenue) && current.revenue <= 0) diagnostics.push('revenue must be greater than zero for DSO') }
  if (periodDays !== undefined && averageInventory !== undefined && finite(current.cogs) && current.cogs > 0) { const value = averageInventory / current.cogs * periodDays; if (Number.isFinite(value)) result.dio = value; else { missing.push('dio'); diagnostics.push('DIO must be finite') } }
  else { addMissing(missing, finite(current.cogs) && current.cogs > 0, 'current.cogs'); if (finite(current.cogs) && current.cogs <= 0) diagnostics.push('COGS must be greater than zero for DIO') }
  if (periodDays !== undefined && averagePayables !== undefined && finite(current.cogs) && current.cogs > 0) { const value = averagePayables / current.cogs * periodDays; if (Number.isFinite(value)) result.dpo = value; else { missing.push('dpo'); diagnostics.push('DPO must be finite') } }
  else { addMissing(missing, finite(current.cogs) && current.cogs > 0, 'current.cogs'); if (finite(current.cogs) && current.cogs <= 0) diagnostics.push('COGS must be greater than zero for DPO') }

  const rawCashConversionCycle = result.dso !== undefined && result.dio !== undefined && result.dpo !== undefined ? result.dso + result.dio - result.dpo : undefined
  const cashConversionCycle = rawCashConversionCycle !== undefined && Number.isFinite(rawCashConversionCycle) ? rawCashConversionCycle : undefined
  if (cashConversionCycle === undefined) missing.push('cashConversionCycle')
  const output: WorkingCapitalQualityResult = { period: current.period, ...result, ...(cashConversionCycle === undefined ? {} : { cashConversionCycle }), unavailableFields: [...new Set(missing)], diagnostics: [...new Set(diagnostics)] }
  return output
}
