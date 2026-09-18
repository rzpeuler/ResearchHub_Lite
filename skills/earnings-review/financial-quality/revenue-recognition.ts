import type { FinancialQualityPeriodFacts, RevenueRecognitionAnalysisInput, RevenueRecognitionAnalysisResult, RevenueRecognitionFlag } from './contracts.ts'

function finite(value: number | undefined): value is number { return value !== undefined && Number.isFinite(value) }

function growth(current: number | undefined, prior: number | undefined, label: string, unavailable: string[], diagnostics: string[], positiveCurrentRequired = false): number | undefined {
  if (!finite(current) || !finite(prior)) { unavailable.push(`${label}_growth`); return undefined }
  if (prior <= 0 || current < 0 || (positiveCurrentRequired && current <= 0)) {
    unavailable.push(`${label}_growth`)
    diagnostics.push(`${label} growth comparison requires a positive prior and non-negative current value${positiveCurrentRequired ? ' and positive current CFO' : ''}`)
    return undefined
  }
  const result = (current - prior) / prior
  if (!Number.isFinite(result)) { unavailable.push(`${label}_growth`); diagnostics.push(`${label} growth comparison is non-finite`); return undefined }
  return result
}

function flag(code: RevenueRecognitionFlag['code'], spread: number, threshold: number, current: FinancialQualityPeriodFacts, prior: FinancialQualityPeriodFacts, explanation: string): RevenueRecognitionFlag | undefined {
  const exceeds = Number.isFinite(spread) && spread - threshold > 1e-12
  return exceeds ? { code, thresholdUsed: threshold, observedSpreadOrDifference: spread, currentPeriod: current, priorPeriod: prior, explanation } : undefined
}

/** Emit bounded research follow-up flags from explicit current/prior series. */
export function analyzeRevenueRecognition(input: RevenueRecognitionAnalysisInput): RevenueRecognitionAnalysisResult {
  if (!Number.isFinite(input.threshold) || input.threshold < 0) throw new TypeError('revenue-recognition threshold must be a finite non-negative number')
  const unavailableComparisons: string[] = []
  const diagnostics: string[] = []
  const revenueGrowth = growth(input.current.revenue, input.priorComparable.revenue, 'revenue', unavailableComparisons, diagnostics)
  const receivablesGrowth = growth(input.current.receivables, input.priorComparable.receivables, 'receivables', unavailableComparisons, diagnostics)
  const contractAssetsGrowth = growth(input.current.contractAssets, input.priorComparable.contractAssets, 'contract_assets', unavailableComparisons, diagnostics)
  const cfoGrowth = growth(input.current.cashFromOperations, input.priorComparable.cashFromOperations, 'cfo', unavailableComparisons, diagnostics, true)
  const deferredRevenueGrowth = growth(input.current.deferredRevenue, input.priorComparable.deferredRevenue, 'deferred_revenue', unavailableComparisons, diagnostics)
  const flags: RevenueRecognitionFlag[] = []
  if (revenueGrowth !== undefined && receivablesGrowth !== undefined) {
    const item = flag('receivables_outgrowing_sales', receivablesGrowth - revenueGrowth, input.threshold, input.current, input.priorComparable, 'Receivables growth exceeds sales growth by more than the explicit threshold; this is a research follow-up flag requiring contextual review.')
    if (item) flags.push(item)
  }
  if (revenueGrowth !== undefined && contractAssetsGrowth !== undefined) {
    const item = flag('contract_assets_outgrowing_sales', contractAssetsGrowth - revenueGrowth, input.threshold, input.current, input.priorComparable, 'Contract-assets growth exceeds sales growth by more than the explicit threshold; this is a research follow-up flag requiring contextual review.')
    if (item) flags.push(item)
  }
  if (revenueGrowth !== undefined && cfoGrowth !== undefined) {
    const item = flag('sales_outgrowing_cfo', revenueGrowth - cfoGrowth, input.threshold, input.current, input.priorComparable, 'Sales growth exceeds CFO growth by more than the explicit threshold; this is a research follow-up flag requiring contextual review.')
    if (item) flags.push(item)
  }
  if (revenueGrowth !== undefined && deferredRevenueGrowth !== undefined) {
    const item = flag('context_dependent_deferred_revenue_divergence', revenueGrowth - deferredRevenueGrowth, input.threshold, input.current, input.priorComparable, 'Deferred-revenue divergence is context-dependent and requires follow-up contextual review.')
    if (item) flags.push(item)
  }
  return { period: input.current.period, thresholdUsed: input.threshold, flags, unavailableComparisons: [...new Set(unavailableComparisons)], diagnostics: [...new Set(diagnostics)] }
}
