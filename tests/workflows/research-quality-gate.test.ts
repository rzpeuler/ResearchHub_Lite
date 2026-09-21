import assert from 'node:assert/strict'
import test from 'node:test'
import { runResearchQualityGate, type ResearchQualityGateInput } from '../../workflows/research-quality-gate.ts'

const normalized = (candidateId: string, publishedAt = '2026-09-01T00:00:00.000Z') => ({ candidate: { candidateId, kind: 'official_disclosure' as const, tier: 1 as const, title: candidateId, provider: 'fixture', publishedAt }, retrievedAt: '2026-09-02T00:00:00.000Z', title: candidateId, content: 'fixture', contentHash: candidateId, publisher: 'fixture', rights: { accessScope: 'public' as const, retentionAllowed: true, aiProcessingAllowed: true, derivativeKnowledgeAllowed: true, redistributionAllowed: false } })
const base = (overrides: Partial<ResearchQualityGateInput> = {}): ResearchQualityGateInput => ({ profile: 'valuation', asOf: '2026-09-03T00:00:00.000Z', sources: [normalized('source-1'), normalized('source-2')], referencedSourceCandidateIds: ['source-1'], ...overrides })

test('clean composed result passes and remains Gateway-eligible', () => {
  const result = runResearchQualityGate(base())
  assert.equal(result.status, 'PASS')
  assert.equal(result.eligibleForGateway, true)
  assert.deepEqual(result.diagnostics, [])
})

test('optional unavailable section is nonfatal warning/info', () => {
  const result = runResearchQualityGate(base({ optionalUnavailableSections: ['DCF'] }))
  assert.equal(result.status, 'PASS')
  assert.equal(result.eligibleForGateway, true)
  assert.equal(result.diagnostics[0]?.code, 'OPTIONAL_SECTION_UNAVAILABLE')
})

test('future source, dangling source, period, and unit mismatch fail closed', () => {
  const result = runResearchQualityGate(base({ sources: [normalized('source-1', '2026-09-04T00:00:00.000Z')], referencedSourceCandidateIds: ['source-1', 'forged'], comparisons: [{ comparisonRef: 'comparison-1', kind: 'period', left: { period: 'FY2025', unit: 'CNY_m' }, right: { period: 'FY2026', unit: 'CNY_bn' } }] }))
  assert.equal(result.status, 'FAIL')
  assert.equal(result.eligibleForGateway, false)
  assert.ok(result.diagnostics.some((item) => item.code === 'FUTURE_SOURCE_REFERENCE'))
  assert.ok(result.diagnostics.some((item) => item.code === 'DANGLING_SOURCE_REF'))
  assert.ok(result.diagnostics.some((item) => item.code === 'PERIOD_MISMATCH'))
  assert.ok(result.diagnostics.some((item) => item.code === 'UNIT_MISMATCH'))
})

test('expectation-to-thesis and thesis-to-catalyst contradictions are explicit', () => {
  const result = runResearchQualityGate({ ...base({ profile: 'thesis_lifecycle' }), expectation: { status: 'NO_MATERIAL_GAP', propositionRefs: ['gap-1'] }, thesisStates: [{ claimRef: 'claim-thesis', expectationStatus: 'MATERIAL_GAP' }], validPropositionRefs: ['gap-1'], catalysts: [{ catalystRef: 'catalyst-1', targetPropositionRefs: ['missing-proposition'] }] })
  assert.equal(result.status, 'FAIL')
  assert.ok(result.diagnostics.some((item) => item.code === 'EXPECTATION_THESIS_CONTRADICTION'))
  assert.ok(result.diagnostics.some((item) => item.code === 'DANGLING_CATALYST_PROPOSITION'))
})

test('scenario-adjusted forecast basis is diagnostic but does not block', () => {
  const result = runResearchQualityGate(base({ forecastValuationRefs: [{ forecastRef: 'forecast-1', forecastMetric: 'revenue', forecastPeriod: 'FY2026', valuationMetric: 'revenue', valuationPeriod: 'FY2027', scenarioAdjustment: true }] }))
  assert.equal(result.status, 'PASS_WITH_WARNINGS')
  assert.equal(result.eligibleForGateway, true)
  assert.equal(result.diagnostics[0]?.code, 'FORECAST_VALUATION_SCENARIO_ADJUSTMENT')
})

