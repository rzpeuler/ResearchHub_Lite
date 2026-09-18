import { calculateAccrualQuality, unavailableAccrualQuality } from './accrual-quality.ts'
import { calculateCashConversion, unavailableCashConversion } from './cash-conversion.ts'
import { analyzeRevenueRecognition } from './revenue-recognition.ts'
import { calculateWorkingCapital } from './working-capital.ts'
import type { EarningsFinancialQualitySummary, NormalizedFinancialQualityData, RevenueRecognitionAnalysisResult, WorkingCapitalQualityResult } from './contracts.ts'

function unavailableWorkingCapital(period: string, fields: readonly string[], diagnostics: readonly string[] = []): WorkingCapitalQualityResult {
  return { period, unavailableFields: fields, diagnostics }
}

function unavailableRevenueRecognition(period: string, threshold: number, fields: readonly string[], diagnostics: readonly string[] = []): RevenueRecognitionAnalysisResult {
  return { period, thresholdUsed: threshold, flags: [], unavailableComparisons: fields, diagnostics }
}

function periodOf(data: NormalizedFinancialQualityData): string { return data.current?.period ?? 'unavailable' }

/** Compose all deterministic financial-quality results without creating Knowledge objects. */
export function calculateEarningsFinancialQualitySummary(data: NormalizedFinancialQualityData, revenueRecognitionDivergenceThreshold: number): EarningsFinancialQualitySummary {
  const period = periodOf(data)
  const workingCapital = data.current !== undefined && data.opening !== undefined
    ? calculateWorkingCapital({ current: data.current, opening: data.opening })
    : unavailableWorkingCapital(period, ['current', 'opening'], ['Current and opening facts are required for working-capital analysis'])
  const accrualQuality = data.current !== undefined && data.opening !== undefined
    ? calculateAccrualQuality({ current: data.current, opening: data.opening })
    : unavailableAccrualQuality(period, ['current', 'opening'], ['Current and opening facts are required for accrual analysis'])
  const cashConversion = data.current !== undefined
    ? calculateCashConversion({ current: data.current })
    : unavailableCashConversion(period, ['current'], ['Current facts are required for cash-conversion analysis'])
  const revenueRecognition = data.current !== undefined && data.priorComparable !== undefined
    ? analyzeRevenueRecognition({ current: data.current, priorComparable: data.priorComparable, threshold: revenueRecognitionDivergenceThreshold })
    : unavailableRevenueRecognition(period, revenueRecognitionDivergenceThreshold, ['current', 'priorComparable'], ['Current and prior-comparable facts are required for revenue-recognition comparisons'])
  const diagnostics = [...data.diagnostics, ...workingCapital.diagnostics, ...accrualQuality.diagnostics, ...cashConversion.diagnostics, ...revenueRecognition.diagnostics]
  return { period, sourceCandidateId: data.sourceCandidateId, workingCapital, accrualQuality, cashConversion, revenueRecognition, diagnostics: [...new Set(diagnostics)] }
}

function display(value: number | undefined, suffix = ''): string { return value === undefined || !Number.isFinite(value) ? 'unavailable' : `${Number(value.toFixed(3))}${suffix}` }
function unavailable(fields: readonly string[]): string { return fields.length === 0 ? 'unavailable' : `unavailable (${fields.join(', ')})` }
function line(label: string, value: string): string { return `- ${label}: ${value}` }

function workingCapitalMarkdown(summary: EarningsFinancialQualitySummary): string {
  const result = summary.workingCapital
  return [
    '### Deterministic financial-quality checks',
    line('DSO', display(result.dso, ' days')),
    line('DIO', display(result.dio, ' days')),
    line('DPO', display(result.dpo, ' days')),
    line('Cash Conversion Cycle', display(result.cashConversionCycle, ' days')),
    line('CFO / Net Income', display(summary.cashConversion.cfoToNetIncome)),
    line('FCF', display(summary.cashConversion.freeCashFlow)),
    line('FCF / Net Income', display(summary.cashConversion.fcfToNetIncome)),
    ...(result.unavailableFields.length === 0 && summary.cashConversion.unavailableFields.length === 0 ? [] : [line('Unavailable components', unavailable([...new Set([...result.unavailableFields, ...summary.cashConversion.unavailableFields])]))]),
  ].join('\n')
}

function earningsQualityMarkdown(summary: EarningsFinancialQualitySummary): string {
  const result = summary.revenueRecognition
  const flags = result.flags.map((item) => item.code)
  return [
    '### Deterministic financial-quality checks',
    line('Accrual ratio', display(summary.accrualQuality.accrualRatio)),
    line('Revenue-recognition follow-up flags', flags.length === 0 ? 'none' : flags.join(', ')),
    ...(summary.accrualQuality.unavailableFields.length === 0 && result.unavailableComparisons.length === 0 ? [] : [line('Unavailable components', unavailable([...new Set([...summary.accrualQuality.unavailableFields, ...result.unavailableComparisons])]))]),
    ...(flags.includes('context_dependent_deferred_revenue_divergence') ? [line('Flag semantics', 'context-dependent; follow-up required')] : []),
  ].join('\n')
}

interface ReportSectionLike {
  readonly title: string
  readonly markdown: string
  readonly sourceCandidateIds: readonly string[]
}

/** Add report-only checks to the two existing semantic sections while preserving the 14-section contract. */
export function enrichEarningsReviewSections<T extends ReportSectionLike>(sections: readonly T[], summary: EarningsFinancialQualitySummary): T[] {
  return sections.map((section) => {
    if (section.title !== 'Cash Flow / Working Capital' && section.title !== 'Earnings Quality') return section
    const qualityMarkdown = section.title === 'Cash Flow / Working Capital' ? workingCapitalMarkdown(summary) : earningsQualityMarkdown(summary)
    return { ...section, markdown: `${section.markdown}\n\n${qualityMarkdown}`, sourceCandidateIds: [...new Set([...section.sourceCandidateIds, summary.sourceCandidateId])] }
  })
}
