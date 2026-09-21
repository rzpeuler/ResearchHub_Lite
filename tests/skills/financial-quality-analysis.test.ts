import assert from 'node:assert/strict'
import test from 'node:test'
import { calculateFinancialQualityAnalysis } from '../../skills/financial_quality_analysis/calculations.ts'
import type { FinancialQualityPeriodFacts, NormalizedFinancialQualityData } from '../../skills/earnings-review/financial-quality/contracts.ts'

const facts = (overrides: Partial<FinancialQualityPeriodFacts> = {}): FinancialQualityPeriodFacts => ({ period: '2026-H1', daysInPeriod: 181, revenue: 1_000, cogs: 500, netIncome: 100, cashFromOperations: 120, capex: 20, receivables: 300, inventory: 200, payables: 250, contractAssets: 140, deferredRevenue: 90, totalAssets: 2_000, ...overrides })
const data = (overrides: Partial<NormalizedFinancialQualityData> = {}): NormalizedFinancialQualityData => ({ sourceCandidateId: 'source:financial-quality', diagnostics: [], current: facts(), opening: facts({ period: '2025-FY', daysInPeriod: 365, receivables: 200, inventory: 100, payables: 150, totalAssets: 1_800 }), priorComparable: facts({ period: '2025-H1', revenue: 900, receivables: 200, contractAssets: 100, cashFromOperations: 100, deferredRevenue: 80 }), ...overrides })

test('canonical financial-quality binding returns the existing deterministic summary', () => {
  const result = calculateFinancialQualityAnalysis({ data: data(), revenueRecognitionDivergenceThreshold: 0.1 })
  assert.equal(result.status, 'complete')
  assert.equal(result.sourceCandidateId, 'source:financial-quality')
  assert.equal(result.summary.workingCapital.dso, 45.25)
  assert.equal(result.summary.cashConversion.cfoToNetIncome, 1.2)
  assert.equal(result.unavailableFields.length, 0)
})

test('canonical financial-quality binding preserves partial component availability', () => {
  const result = calculateFinancialQualityAnalysis({ data: data({ current: facts({ receivables: undefined, totalAssets: undefined }), opening: facts({ receivables: undefined, totalAssets: 1_800 }) }), revenueRecognitionDivergenceThreshold: 0.1 })
  assert.equal(result.status, 'partial')
  assert.ok(result.unavailableFields.some((item) => item.includes('receivables')))
  assert.ok(result.summary.cashConversion.freeCashFlow !== undefined)
})

test('financial-quality flags remain follow-up diagnostics rather than fraud findings', () => {
  const result = calculateFinancialQualityAnalysis({ data: data({ current: facts({ receivables: 500, cashFromOperations: 80 }) }), revenueRecognitionDivergenceThreshold: 0.1 })
  const serialized = JSON.stringify(result)
  assert.doesNotMatch(serialized, /fraud|manipulation confirmed/i)
  assert.ok(result.summary.revenueRecognition.flags.length > 0)
})

test('missing period facts fail closed without zero filling', () => {
  const result = calculateFinancialQualityAnalysis({ data: { sourceCandidateId: 'source:missing', diagnostics: ['raw data unavailable'] }, revenueRecognitionDivergenceThreshold: 0.1 })
  assert.equal(result.status, 'unavailable')
  assert.equal(result.summary.cashConversion.freeCashFlow, undefined)
  assert.ok(result.unavailableFields.length > 0)
})
