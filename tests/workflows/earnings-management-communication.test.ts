import assert from 'node:assert/strict'
import test from 'node:test'
import type { ReasoningCapabilities, ReasoningExecutor, ReasoningRequest, ReasoningResult } from '../../plugins/reasoning/contracts.ts'
import type { ManagementCommunicationExtractionResult } from '../../workflows/management-communication-extraction/contracts.ts'
import type { ManagementCommunicationAcquisitionSources } from '../../workflows/management-communication-acquisition/contracts.ts'
import { enrichEarningsReviewSectionsWithManagementCommunication, resolveManagementCommunication } from '../../workflows/earnings-review/management-communication.ts'

const AS_OF = '2026-09-22T00:00:00.000Z'
const capabilities: ReasoningCapabilities = { maxContextTokens: 4_000, maxOutputTokens: 2_000, structuredOutputSupport: true, maxConcurrency: 1 }

function metadata(candidateId: string, sourceObjectId: string, publishedAt: string) {
  return { candidateId, sourceObjectId, publishedAt, sourceAuthority: 'S1_OFFICIAL' as const, extractionContractVersion: 'management-communication-extraction-v0.1' as const, reasoningOperation: 'management_communication_extract' as const, evidenceSpan: { sourceObjectId, startOffset: 0, endOffset: 20, exactText: 'bounded management evidence' }, validationDiagnostics: [] }
}

function extraction(): ManagementCommunicationExtractionResult {
  const current = metadata('outlook-current', 'source-current', '2026-09-20T00:00:00.000Z')
  const prior = metadata('outlook-prior', 'source-prior', '2026-08-20T00:00:00.000Z')
  const qa = metadata('qa-evidence', 'qa-source', '2026-09-19T00:00:00.000Z')
  const guidance = { guidanceId: 'guidance-current', metric: 'revenue', fiscalPeriod: '2026-FY', low: 100, high: 120, midpoint: 110, unit: 'CNY', guidanceType: 'range' as const, publishedAt: '2026-09-20T00:00:00.000Z', sourceCandidateIds: ['source-current'], qualifiers: [] }
  const currentKpi = { segmentKey: 'segment-a', metric: 'revenue', fiscalPeriod: '2026-FY', value: 120, unit: 'CNY', sourceCandidateIds: ['source-current'] }
  const priorKpi = { segmentKey: 'segment-a', metric: 'revenue', fiscalPeriod: '2025-FY', value: 100, unit: 'CNY', sourceCandidateIds: ['source-prior'] }
  return {
    status: 'COMPLETE',
    formalGuidanceCandidates: [],
    managementOutlookCandidates: [
      { ...prior, topic: 'demand', metric: 'revenue', direction: 'decrease', timeHorizon: 'FY', rawNumericValue: '10', rawUnit: '元', rawFiscalPeriodText: '2026-FY' },
      { ...current, topic: 'demand', metric: 'revenue', direction: 'increase', timeHorizon: 'FY', rawNumericValue: '12', rawUnit: '元', rawFiscalPeriodText: '2026-FY' },
    ],
    kpiCandidates: [],
    structuredQaCandidates: [{ ...qa, pairId: 'pair-1', question: 'What is revenue demand?', answer: 'Revenue demand is improving.', platform: 'SSE_EINTERACTION', topicTags: ['demand'], claimSpans: [{ ...qa.evidenceSpan }], managementStatementSpans: [{ ...qa.evidenceSpan }], explicitlyStatedMetrics: ['revenue'] }],
    guidance: [guidance],
    segmentKpis: [currentKpi, priorKpi],
    diagnostics: [],
    telemetry: { operation: 'management_communication_extract', calls: 1, repairCalls: 0, inputUnits: 1, rawCandidateCount: 3, validatedCandidateCount: 3, rejectedCandidateCount: 0, projectedGuidanceCount: 1, projectedSegmentKpiCount: 2 },
  }
}

class FixtureExecutor implements ReasoningExecutor {
  readonly calls: ReasoningRequest[] = []
  capabilities(): ReasoningCapabilities { return capabilities }
  async execute(request: ReasoningRequest): Promise<ReasoningResult> { this.calls.push(request); return { operation: request.operation, output: { formalGuidanceCandidates: [], managementOutlookCandidates: [], kpiCandidates: [], structuredQaCandidates: [] } } }
}

test('caller-owned D2-002 input drives all management capability adapters and report enrichment', async () => {
  const result = await resolveManagementCommunication({ company: { symbol: '600519', exchange: 'SSE' }, analysisAsOf: AS_OF, fiscalYear: 2026, period: 'FY', officialSources: [], caller: { extraction: extraction(), executionOutcomes: [] } })
  assert.equal(result.status, 'available')
  assert.deepEqual(result.currentGuidanceIds, ['guidance-current'])
  assert.equal(result.segmentKpiComparisons?.[0]?.priorComparable?.value, 100)
  assert.equal(result.commentaryDeltas[0]?.status, 'reversed')
  assert.equal(result.qaClusters.length, 1)
  assert.equal(result.qaClusters[0]?.members[0]?.response.status, 'direct')
  assert.ok(result.execution.assessments.some((item) => item.assessment === 'met'))
  const sections = enrichEarningsReviewSectionsWithManagementCommunication([
    { id: 'management-guidance', title: 'Management Guidance', markdown: 'base', sourceCandidateIds: [], assessmentRefs: [] },
    { id: 'changes', title: 'Changes vs Prior Research', markdown: 'base', sourceCandidateIds: [], assessmentRefs: [] },
    { id: 'gaps', title: 'Research Gaps / Monitoring', markdown: 'base', sourceCandidateIds: [], assessmentRefs: [] },
  ], result)
  assert.ok(sections.every((section) => section.markdown.includes('Management') || section.title === 'Research Gaps / Monitoring'))
})

test('caller-owned extraction suppresses automatic D2-001 calls', async () => {
  const calls: string[] = []
  const result = await resolveManagementCommunication({ company: { symbol: '600519', exchange: 'SSE' }, analysisAsOf: AS_OF, fiscalYear: 2026, period: 'FY', officialSources: [], reasoningExecutor: new FixtureExecutor(), sources: { cninfoIr: async () => { calls.push('document'); return [] }, exchangeQaSzse: async () => { calls.push('szse'); return [] }, exchangeQaSse: async () => { calls.push('sse'); return [] } }, caller: { extraction: extraction() } })
  assert.equal(result.status, 'available')
  assert.deepEqual(calls, [])
  assert.equal(result.telemetry.acquisitionAttempted, false)
})

test('unconfigured management dependencies fail soft without fabricating findings', async () => {
  const result = await resolveManagementCommunication({ company: { symbol: '600519', exchange: 'SSE' }, analysisAsOf: AS_OF, fiscalYear: 2026, period: 'FY', officialSources: [] })
  assert.equal(result.status, 'unavailable')
  assert.equal(result.commentaryDeltas.length, 0)
  assert.equal(result.qaClusters.length, 0)
  assert.equal(result.execution.status, 'unavailable')
  assert.ok(result.diagnostics.includes('MANAGEMENT_COMMUNICATION_INPUT_UNAVAILABLE'))
})

test('configured Earnings path automatically runs D2-001 acquisition and D2-002 extraction', async () => {
  const calls: string[] = []
  const sources: ManagementCommunicationAcquisitionSources = {
    cninfoIr: async () => [{ ticker: '600519', title: '投资者关系活动记录表', publishedAt: '2026-09-20T00:00:00.000Z', retrievedAt: '2026-09-20T01:00:00.000Z', content: 'revenue 12元 increase', sourceUrl: 'https://static.cninfo.com.cn/finalpage/2026-09-20/fixture.PDF', originPublisher: 'Fixture Company' }],
    exchangeQaSzse: async () => [],
    exchangeQaSse: async () => [{ 股票代码: '600519', 提问: 'What is revenue demand?', 回答: 'Revenue demand is improving.', 提问时间: '2026-09-19 09:00:00', 回答时间: '2026-09-19 10:00:00', attachedId: 'pair-1' }],
  }
  const executor: ReasoningExecutor = { capabilities: () => capabilities, execute: async (request) => { const input = request.input as { readonly lane: string; readonly sourceObjects: readonly Record<string, unknown>[] }; calls.push(input.lane); const source = input.sourceObjects[0]!; const sourceObjectId = String(source.sourceObjectId); if (input.lane === 'exchange_qa') return { operation: request.operation, output: { formalGuidanceCandidates: [], managementOutlookCandidates: [], kpiCandidates: [], structuredQaCandidates: [{ pairId: sourceObjectId, topicTags: ['demand'], claimSpans: [{ sourceObjectId, exactText: 'What is revenue demand?' }], managementStatementSpans: [{ sourceObjectId, exactText: 'Revenue demand is improving.' }], explicitlyStatedMetrics: ['revenue'] }] } }; return { operation: request.operation, output: { formalGuidanceCandidates: [], managementOutlookCandidates: [{ topic: 'demand', metric: 'revenue', direction: 'increase', rawTimeHorizon: 'FY', rawNumericValue: '12', rawUnit: '元', rawFiscalPeriodText: '2026-FY', evidence: { sourceObjectId, startOffset: 0, endOffset: 20, exactText: 'revenue 12元 increase' } }], kpiCandidates: [], structuredQaCandidates: [] } } } }
  const result = await resolveManagementCommunication({ company: { symbol: '600519', exchange: 'SSE' }, analysisAsOf: AS_OF, fiscalYear: 2026, period: 'FY', officialSources: [], reasoningExecutor: executor, sources })
  assert.equal(result.telemetry.acquisitionAttempted, true)
  assert.equal(result.telemetry.acquisitionDocumentCount, 1)
  assert.equal(result.telemetry.acquisitionQaCount, 1)
  assert.deepEqual(calls.sort(), ['exchange_qa', 'management_document'])
  assert.equal(result.commentaryDeltas.length, 1)
  assert.equal(result.qaClusters.length, 1)
})
