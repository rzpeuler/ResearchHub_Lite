import { calculateEarningsFinancialQualitySummary } from '../earnings-review/financial-quality/summary.ts'
import type { FinancialQualityAnalysisInput, FinancialQualityAnalysisResult } from './contracts.ts'

const unique = (values: readonly string[]): string[] => [...new Set(values.filter((value) => value.trim() !== ''))]

export function calculateFinancialQualityAnalysis(input: FinancialQualityAnalysisInput): FinancialQualityAnalysisResult {
  const summary = calculateEarningsFinancialQualitySummary(input.data, input.revenueRecognitionDivergenceThreshold)
  const unavailableFields = unique([
    ...summary.workingCapital.unavailableFields,
    ...summary.accrualQuality.unavailableFields,
    ...summary.cashConversion.unavailableFields,
    ...summary.revenueRecognition.unavailableComparisons,
  ])
  const diagnostics = unique(summary.diagnostics)
  const availableComponentCount = [summary.workingCapital, summary.accrualQuality, summary.cashConversion, summary.revenueRecognition].filter((item) => {
    if ('unavailableFields' in item) return item.unavailableFields.length === 0
    return item.unavailableComparisons.length === 0
  }).length
  const status: FinancialQualityAnalysisResult['status'] = availableComponentCount === 0 ? 'unavailable' : unavailableFields.length === 0 ? 'complete' : 'partial'
  return { status, period: summary.period, sourceCandidateId: summary.sourceCandidateId, summary, unavailableFields, diagnostics }
}
