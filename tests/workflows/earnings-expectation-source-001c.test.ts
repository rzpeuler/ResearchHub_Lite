import assert from 'node:assert/strict'
import test from 'node:test'
import { assembleAutomaticEarningsExpectations } from '../../workflows/earnings-review/automatic-expectations.ts'
import { buildEarningsExpectationAnalysis } from '../../workflows/earnings-review/expectations-integration.ts'
import type { EastmoneyEstimateProjectionResult } from '../../workflows/earnings-review/expectation-source-eastmoney.ts'
import type { NormalizedResearchSource } from '../../plugins/research-acquisition/contracts.ts'
import type { EstimatePoint } from '../../skills/earnings-review/expectations/contracts.ts'
import { sha256 } from '../../plugins/research-acquisition/hash.ts'

const AS_OF = '2026-09-20T00:00:00.000Z'
const RESULT = '2026-08-30T00:00:00.000Z'
const RIGHTS = { accessScope: 'public' as const, retentionAllowed: true, aiProcessingAllowed: true, derivativeKnowledgeAllowed: true, redistributionAllowed: false }

function source(id: string, publishedAt = '2026-08-01T00:00:00.000Z'): NormalizedResearchSource {
  const content = `captured expectation source ${id}`
  return { candidate: { candidateId: id, kind: 'structured_data', tier: 2, title: id, provider: 'eastmoney-reportapi', publishedAt }, retrievedAt: AS_OF, title: id, content, contentHash: sha256(content), publisher: 'eastmoney-reportapi', rights: RIGHTS }
}

function estimate(id: string, institutionKey: string, value: number, publishedAt: string, sourceId: string): EstimatePoint {
  return { estimateId: id, metric: 'eps', fiscalPeriod: '2026-FY', value, unit: 'CNY_per_share', institutionKey, publishedAt, sourceCandidateIds: [sourceId] }
}

function projection(): EastmoneyEstimateProjectionResult {
  return {
    sources: [source('s1'), source('s2')],
    estimates: [
      estimate('a-old', 'institution:a', 5, '2026-07-01T00:00:00.000Z', 's1'),
      estimate('a-new', 'institution:a', 6, '2026-08-20T00:00:00.000Z', 's1'),
      estimate('b-old', 'institution:b', 5.5, '2026-07-10T00:00:00.000Z', 's2'),
      estimate('b-new', 'institution:b', 6.5, '2026-08-21T00:00:00.000Z', 's2'),
    ],
    institutions: [
      { institutionKey: 'institution:a', name: 'A', providerCode: 'A' },
      { institutionKey: 'institution:b', name: 'B', providerCode: 'B' },
    ],
    diagnostics: [],
    providerOutcome: { provider: 'eastmoney-reportapi', providerAttempted: true, providerSucceeded: true, providerEmpty: false, providerFailed: false, usableSourceCount: 2 },
    forecastBaseYear: 2026,
    truncated: false,
  }
}

function semantic(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(semantic).sort().join(',')}]`
  if (value && typeof value === 'object') return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${key}:${semantic(item)}`).join('|')}}`
  return JSON.stringify(value)
}

test('001C automatic PIT assembly is invariant to reversed provider order', () => {
  const input = { projection: projection(), targetFiscalYear: 2026, analysisAsOf: AS_OF, resultPublishedAt: RESULT }
  const forward = assembleAutomaticEarningsExpectations(input)
  const reversed = assembleAutomaticEarningsExpectations({ ...input, projection: { ...input.projection, sources: [...input.projection.sources].reverse(), estimates: [...input.projection.estimates].reverse(), institutions: [...input.projection.institutions].reverse() } })
  assert.ok(forward.bundle)
  assert.equal(forward.bundle?.consensusSnapshots?.length, 1)
  assert.equal(forward.revisionLinkCount, 2)
  assert.equal(semantic(forward), semantic(reversed))
})

test('001C annual consensus never compares to a H1 actual', () => {
  const assembled = assembleAutomaticEarningsExpectations({ projection: projection(), targetFiscalYear: 2026, analysisAsOf: AS_OF, resultPublishedAt: RESULT })
  assert.ok(assembled.bundle)
  const analysis = buildEarningsExpectationAnalysis({
    expectations: assembled.bundle,
    analysisAsOf: AS_OF,
    resultPublishedAt: RESULT,
    actualMetrics: [{ metric: 'eps', period: '2026-H1', value: 3, unit: 'CNY_per_share', comparator: 'eq', calculation: 'observed', sourceCandidateIds: ['actual'] }],
  })
  assert.equal(analysis.actualVsConsensus.length, 0)
  assert.equal(analysis.actualVsPriorEstimate.length, 0)
  assert.equal(analysis.consensusStatus, 'unavailable')
})

test('001C rolling provider horizon leaves historical FY2025 expectations unavailable', () => {
  const assembled = assembleAutomaticEarningsExpectations({ projection: { ...projection(), diagnostics: ['eastmoney_unsupported_target_fiscal_year:2025'], forecastBaseYear: 2026 }, targetFiscalYear: 2025, analysisAsOf: AS_OF, resultPublishedAt: RESULT })
  assert.equal(assembled.bundle, undefined)
  assert.equal(assembled.estimateCount, 0)
  assert.ok(assembled.diagnostics.some((item) => item.includes('unsupported_target_fiscal_year')))
})

test('001C injected provider failure remains a truthful unavailable expectation state', () => {
  const diagnostics = ['automatic_expectation_source_exception:001C injected Eastmoney failure']
  const providerOutcome = { provider: 'eastmoney-reportapi', providerAttempted: true, providerSucceeded: false, providerEmpty: false, providerFailed: true, usableSourceCount: 0 }
  assert.equal(providerOutcome.providerFailed, true)
  assert.match(diagnostics[0]!, /Eastmoney failure/)
  assert.doesNotMatch('Expectation source unavailable; no consensus or valuation delta was produced.', /automatically acquired Eastmoney report-level consensus/)
})

test('001C audit values remain finite', () => {
  const assembled = assembleAutomaticEarningsExpectations({ projection: projection(), targetFiscalYear: 2026, analysisAsOf: AS_OF, resultPublishedAt: RESULT })
  const values = [assembled.estimateCount, assembled.institutionCount, assembled.consensusSnapshotCount, assembled.revisionLinkCount, ...(assembled.bundle?.consensusSnapshots?.flatMap((item) => [item.mean, item.median, item.high, item.low, item.dispersion ?? 0]) ?? [])]
  assert.ok(values.every(Number.isFinite))
})
