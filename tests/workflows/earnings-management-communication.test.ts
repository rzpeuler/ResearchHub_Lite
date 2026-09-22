import assert from 'node:assert/strict'
import test from 'node:test'
import type { ReasoningCapabilities, ReasoningExecutor, ReasoningRequest, ReasoningResult } from '../../plugins/reasoning/contracts.ts'
import type { ManagementCommunicationExtractionResult } from '../../workflows/management-communication-extraction/contracts.ts'
import type { ManagementCommunicationAcquisitionSources } from '../../workflows/management-communication-acquisition/contracts.ts'
import type { KpiCandidate } from '../../skills/management-communication-extraction/contracts.ts'
import { enrichEarningsReviewSectionsWithManagementCommunication, resolveManagementCommunication } from '../../workflows/earnings-review/management-communication.ts'

const AS_OF = '2026-09-22T00:00:00.000Z'
const capabilities: ReasoningCapabilities = { maxContextTokens: 4_000, maxOutputTokens: 2_000, structuredOutputSupport: true, maxConcurrency: 1 }

function metadata(candidateId: string, sourceObjectId: string, publishedAt: string) {
  return { candidateId, sourceObjectId, publishedAt, sourceAuthority: 'S1_OFFICIAL' as const, extractionContractVersion: 'management-communication-extraction-v0.1' as const, reasoningOperation: 'management_communication_extract' as const, evidenceSpan: { sourceObjectId, startOffset: 0, endOffset: 20, exactText: 'bounded management evidence' }, validationDiagnostics: [] }
}

function kpiCandidate(candidateId: string, sourceObjectId: string, publishedAt: string, fiscalPeriod = '2026-FY', rawValue = '120', rawUnit = '元', rawSegmentLabel = 'segment-a'): KpiCandidate {
  return { ...metadata(candidateId, sourceObjectId, publishedAt), rawSegmentLabel, metric: 'revenue', fiscalPeriod, rawFiscalPeriodText: fiscalPeriod, rawValue, rawUnit }
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
  assert.ok(result.execution.assessments.some((item) => item.assessment === 'not_yet_observable'))
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

test('segment KPI prior selection uses exact comparable fiscal shape', async () => {
  const base = extraction()
  const mixed = { ...base, segmentKpis: [...base.segmentKpis, { ...base.segmentKpis[0]!, fiscalPeriod: '2026-Q3', sourceCandidateIds: ['q3-source'] }] }
  const fyResult = await resolveManagementCommunication({ company: { symbol: '600519', exchange: 'SSE' }, analysisAsOf: AS_OF, fiscalYear: 2026, period: 'FY', officialSources: [], caller: { extraction: mixed } })
  assert.equal(fyResult.segmentKpiComparisons?.[0]?.priorComparable?.fiscalPeriod, '2025-FY')

  const h1Current = { ...base.segmentKpis[0]!, fiscalPeriod: '2026-H1' }
  const h1Prior = { ...base.segmentKpis[1]!, fiscalPeriod: '2025-H1' }
  const h1Result = await resolveManagementCommunication({ company: { symbol: '600519', exchange: 'SSE' }, analysisAsOf: AS_OF, fiscalYear: 2026, period: 'H1', officialSources: [], caller: { extraction: { ...base, segmentKpis: [h1Current, { ...h1Current, fiscalPeriod: '2026-Q1' }] } } })
  assert.equal(h1Result.segmentKpiComparisons?.[0]?.priorComparable, undefined)
  assert.ok(h1Result.diagnostics.some((item) => item.startsWith('KPI_NO_COMPARABLE_PRIOR')))
  const h1Comparable = await resolveManagementCommunication({ company: { symbol: '600519', exchange: 'SSE' }, analysisAsOf: AS_OF, fiscalYear: 2026, period: 'H1', officialSources: [], caller: { extraction: { ...base, segmentKpis: [h1Current, h1Prior] } } })
  assert.equal(h1Comparable.segmentKpiComparisons?.[0]?.priorComparable?.fiscalPeriod, '2025-H1')

  const incompatible = await resolveManagementCommunication({ company: { symbol: '600519', exchange: 'SSE' }, analysisAsOf: AS_OF, fiscalYear: 2026, period: 'FY', officialSources: [], caller: { extraction: { ...base, segmentKpis: [base.segmentKpis[0]!, { ...base.segmentKpis[1]!, segmentKey: 'segment-b' }, { ...base.segmentKpis[1]!, unit: 'USD' }] } } })
  assert.equal(incompatible.segmentKpiComparisons?.[0]?.priorComparable, undefined)
})

test('management execution requires later independent KPI evidence and due date', async () => {
  const base = extraction()
  const outlook = { ...base.managementOutlookCandidates[1]!, evidenceSpan: { ...base.managementOutlookCandidates[1]!.evidenceSpan, exactText: 'segment-a revenue target 12元' } }
  const later = await resolveManagementCommunication({ company: { symbol: '600519', exchange: 'SSE' }, analysisAsOf: '2027-01-03T00:00:00.000Z', fiscalYear: 2026, period: 'FY', officialSources: [], caller: { extraction: { ...base, managementOutlookCandidates: [outlook], kpiCandidates: [kpiCandidate('kpi-later', 'source-later', '2027-01-02T00:00:00.000Z')] } } })
  assert.ok(later.execution.assessments.some((item) => item.assessment === 'met'))

  const sameSource = await resolveManagementCommunication({ company: { symbol: '600519', exchange: 'SSE' }, analysisAsOf: '2027-01-03T00:00:00.000Z', fiscalYear: 2026, period: 'FY', officialSources: [], caller: { extraction: { ...base, managementOutlookCandidates: [outlook], kpiCandidates: [kpiCandidate('kpi-same', 'source-current', '2027-01-02T00:00:00.000Z')] } } })
  assert.equal(sameSource.execution.assessments.some((item) => item.assessment === 'met'), false)
  assert.ok(sameSource.diagnostics.includes('EXECUTION_OUTCOME_NOT_INDEPENDENT'))

  const premature = await resolveManagementCommunication({ company: { symbol: '600519', exchange: 'SSE' }, analysisAsOf: AS_OF, fiscalYear: 2026, period: 'FY', officialSources: [], caller: { extraction: base, executionOutcomes: [{ commitmentId: outlook.candidateId, period: '2026-FY', observedAt: AS_OF, value: 120, unit: 'CNY', sourceRefs: ['later-source'] }] } })
  assert.ok(premature.execution.assessments.some((item) => item.assessment === 'not_yet_observable'))
  assert.equal(premature.execution.assessments.some((item) => item.assessment === 'met'), false)

  const future = await resolveManagementCommunication({ company: { symbol: '600519', exchange: 'SSE' }, analysisAsOf: '2027-01-03T00:00:00.000Z', fiscalYear: 2026, period: 'FY', officialSources: [], caller: { extraction: { ...base, managementOutlookCandidates: [outlook], kpiCandidates: [kpiCandidate('kpi-future', 'source-later', '2027-01-04T00:00:00.000Z')] } } })
  assert.equal(future.execution.assessments.some((item) => item.assessment === 'met'), false)
})

function scopedOutlook(scope: string, period = '2026-FY', sourceObjectId = `outlook-${scope}`, publishedAt = '2026-01-01T00:00:00.000Z') {
  const item = metadata(sourceObjectId, sourceObjectId, publishedAt)
  return { ...item, evidenceSpan: { ...item.evidenceSpan, exactText: `${scope}收入预计达到100亿元` }, topic: 'demand', metric: 'revenue', direction: 'increase' as const, timeHorizon: period.slice(5), rawNumericValue: '100', rawUnit: '亿元', rawFiscalPeriodText: period }
}

test('automatic execution requires attributable KPI scope and preserves caller outcomes', async () => {
  const base = extraction(); const commitment = scopedOutlook('汽车电子'); const extractionFor = (candidate: KpiCandidate) => ({ ...base, managementOutlookCandidates: [commitment], kpiCandidates: [candidate] })
  const compatible = await resolveManagementCommunication({ company: { symbol: '600519', exchange: 'SSE' }, analysisAsOf: '2027-01-03T00:00:00.000Z', fiscalYear: 2026, period: 'FY', officialSources: [], caller: { extraction: extractionFor(kpiCandidate('kpi-auto-scope', 'kpi-auto-source', '2027-01-02T00:00:00.000Z', '2026-FY', '100', '亿元', '汽车电子')) } })
  assert.ok(compatible.execution.assessments.some((item) => item.assessment === 'met'))
  const mismatch = await resolveManagementCommunication({ company: { symbol: '600519', exchange: 'SSE' }, analysisAsOf: '2027-01-03T00:00:00.000Z', fiscalYear: 2026, period: 'FY', officialSources: [], caller: { extraction: extractionFor(kpiCandidate('kpi-wrong-scope', 'kpi-wrong-source', '2027-01-02T00:00:00.000Z', '2026-FY', '100', '亿元', '消费电子')) } })
  assert.equal(mismatch.execution.assessments.some((item) => item.assessment === 'met'), false)
  assert.ok(mismatch.diagnostics.includes('EXECUTION_OUTCOME_SCOPE_MISMATCH'))
  const unresolved = await resolveManagementCommunication({ company: { symbol: '600519', exchange: 'SSE' }, analysisAsOf: '2027-01-03T00:00:00.000Z', fiscalYear: 2026, period: 'FY', officialSources: [], caller: { extraction: extractionFor(kpiCandidate('kpi-unscoped', 'kpi-unscoped-source', '2027-01-02T00:00:00.000Z', '2026-FY', '100', '亿元', '')) } })
  assert.equal(unresolved.execution.assessments.some((item) => item.assessment === 'met'), false)
  assert.ok(unresolved.diagnostics.includes('EXECUTION_OUTCOME_SCOPE_UNRESOLVED'))
  const callerOutcome = await resolveManagementCommunication({ company: { symbol: '600519', exchange: 'SSE' }, analysisAsOf: '2027-01-03T00:00:00.000Z', fiscalYear: 2026, period: 'FY', officialSources: [], caller: { extraction: { ...base, managementOutlookCandidates: [commitment], kpiCandidates: [] }, executionOutcomes: [{ commitmentId: commitment.candidateId, period: '2026-FY', observedAt: '2027-01-02T00:00:00.000Z', value: 10_000_000_000, unit: 'CNY', sourceRefs: ['caller-independent-source'] }] } })
  assert.ok(callerOutcome.execution.assessments.some((item) => item.assessment === 'met'))
})

test('target end uses Asia/Shanghai end-of-day for all Earnings periods', async () => {
  const base = extraction()
  const periods = [
    ['Q1', '2026-03-31T15:59:59.999Z'],
    ['H1', '2026-06-30T15:59:59.999Z'],
    ['Q3', '2026-09-30T15:59:59.999Z'],
    ['FY', '2026-12-31T15:59:59.999Z'],
  ] as const
  for (const [period, targetEndUtc] of periods) {
    const fiscalPeriod = `2026-${period}`
    const commitment = scopedOutlook('汽车电子', fiscalPeriod, `outlook-${period}`)
    const kpi = kpiCandidate(`kpi-${period}`, `source-${period}`, targetEndUtc, fiscalPeriod, '100', '亿元', '汽车电子')
    const early = await resolveManagementCommunication({ company: { symbol: '600519', exchange: 'SSE' }, analysisAsOf: period === 'FY' ? '2026-12-31T08:00:00+08:00' : targetEndUtc, fiscalYear: 2026, period, officialSources: [], caller: { extraction: { ...base, managementOutlookCandidates: [commitment], kpiCandidates: [kpi] } } })
    if (period === 'FY') assert.ok(early.execution.assessments.some((item) => item.assessment === 'not_yet_observable'))
    const dueAsOf = period === 'FY' ? '2026-12-31T23:59:59.999+08:00' : targetEndUtc
    const due = await resolveManagementCommunication({ company: { symbol: '600519', exchange: 'SSE' }, analysisAsOf: dueAsOf, fiscalYear: 2026, period, officialSources: [], caller: { extraction: { ...base, managementOutlookCandidates: [commitment], kpiCandidates: [kpi] } } })
    assert.ok(due.execution.assessments.some((item) => item.assessment === 'met'), period)
    if (period === 'FY') {
      const equivalentZ = await resolveManagementCommunication({ company: { symbol: '600519', exchange: 'SSE' }, analysisAsOf: targetEndUtc, fiscalYear: 2026, period, officialSources: [], caller: { extraction: { ...base, managementOutlookCandidates: [commitment], kpiCandidates: [kpi] } } })
      assert.ok(equivalentZ.execution.assessments.some((item) => item.assessment === 'met'))
    }
  }
})

test('Q&A response quality requires coverage of the question', async () => {
  const make = (question: string, answer: string, explicitlyStatedMetrics: string[] = ['revenue']) => ({ ...extraction(), structuredQaCandidates: [{ ...extraction().structuredQaCandidates[0]!, question, answer, explicitlyStatedMetrics }] })
  const direct = await resolveManagementCommunication({ company: { symbol: '600519', exchange: 'SSE' }, analysisAsOf: AS_OF, fiscalYear: 2026, period: 'FY', officialSources: [], caller: { extraction: make('revenue?', 'revenue increased 10%', ['revenue']) } })
  assert.equal(direct.qaClusters[0]?.members[0]?.response.status, 'direct')
  const unrelated = await resolveManagementCommunication({ company: { symbol: '600519', exchange: 'SSE' }, analysisAsOf: AS_OF, fiscalYear: 2026, period: 'FY', officialSources: [], caller: { extraction: make('new product launch?', 'revenue increased 10%', ['revenue']) } })
  assert.notEqual(unrelated.qaClusters[0]?.members[0]?.response.status, 'direct')
  const partial = await resolveManagementCommunication({ company: { symbol: '600519', exchange: 'SSE' }, analysisAsOf: AS_OF, fiscalYear: 2026, period: 'FY', officialSources: [], caller: { extraction: make('capacity timing?', '公司正在推进相关工作', []) } })
  assert.equal(partial.qaClusters[0]?.members[0]?.response.status, 'partial')
  const nonAnswer = await resolveManagementCommunication({ company: { symbol: '600519', exchange: 'SSE' }, analysisAsOf: AS_OF, fiscalYear: 2026, period: 'FY', officialSources: [], caller: { extraction: make('margin?', '不便透露', []) } })
  assert.equal(nonAnswer.qaClusters[0]?.members[0]?.response.status, 'non_answer')
})

test('Q&A clusters provide deduplicated multi-topic and product-aware membership', async () => {
  const makeExtraction = (topicTags: string[], referencedProductOrSegment?: string) => ({ ...extraction(), structuredQaCandidates: [{ ...extraction().structuredQaCandidates[0]!, topicTags, ...(referencedProductOrSegment === undefined ? {} : { referencedProductOrSegment }) }] })
  const multiTopic = await resolveManagementCommunication({ company: { symbol: '600519', exchange: 'SSE' }, analysisAsOf: AS_OF, fiscalYear: 2026, period: 'FY', officialSources: [], caller: { extraction: makeExtraction(['demand', 'pricing']) } })
  assert.deepEqual(multiTopic.qaClusters.map((item) => item.key).sort(), ['demand|', 'pricing|'])
  assert.ok(multiTopic.qaClusters.every((item) => item.members.map((member) => member.pairId).filter((pairId) => pairId === 'pair-1').length === 1))
  const duplicateTags = await resolveManagementCommunication({ company: { symbol: '600519', exchange: 'SSE' }, analysisAsOf: AS_OF, fiscalYear: 2026, period: 'FY', officialSources: [], caller: { extraction: makeExtraction(['demand', 'demand', 'Demand']) } })
  assert.equal(duplicateTags.qaClusters.length, 1)
  assert.equal(duplicateTags.qaClusters[0]?.members.filter((member) => member.pairId === 'pair-1').length, 1)
  const productAware = { ...extraction(), structuredQaCandidates: [
    { ...extraction().structuredQaCandidates[0]!, pairId: 'pair-automotive', candidateId: 'qa-automotive', referencedProductOrSegment: 'automotive', topicTags: ['demand'] },
    { ...extraction().structuredQaCandidates[0]!, pairId: 'pair-consumer', candidateId: 'qa-consumer', referencedProductOrSegment: 'consumer-electronics', topicTags: ['demand'] },
  ] }
  const productResult = await resolveManagementCommunication({ company: { symbol: '600519', exchange: 'SSE' }, analysisAsOf: AS_OF, fiscalYear: 2026, period: 'FY', officialSources: [], caller: { extraction: productAware } })
  assert.deepEqual(productResult.qaClusters.map((item) => item.key).sort(), ['demand|automotive', 'demand|consumer-electronics'])
  const noTags = await resolveManagementCommunication({ company: { symbol: '600519', exchange: 'SSE' }, analysisAsOf: AS_OF, fiscalYear: 2026, period: 'FY', officialSources: [], caller: { extraction: makeExtraction([]) } })
  assert.match(noTags.qaClusters[0]?.key ?? '', /^question\|/u)
})

function commentaryExtraction(current: { readonly candidateId: string; readonly sourceObjectId: string; readonly publishedAt: string; readonly direction: 'increase' | 'decrease'; readonly value: string; readonly evidence: string }, prior: { readonly candidateId: string; readonly sourceObjectId: string; readonly publishedAt: string; readonly direction: 'increase' | 'decrease'; readonly value: string; readonly evidence: string }) {
  const base = extraction(); const make = (item: typeof current) => ({ ...metadata(item.candidateId, item.sourceObjectId, item.publishedAt), evidenceSpan: { ...metadata(item.candidateId, item.sourceObjectId, item.publishedAt).evidenceSpan, exactText: item.evidence }, topic: 'demand', metric: 'revenue', direction: item.direction, timeHorizon: 'FY', rawNumericValue: item.value, rawUnit: '元', rawFiscalPeriodText: '2026-FY' as const })
  return { ...base, managementOutlookCandidates: [make(prior), make(current)] }
}

test('commentary is point-in-time and fail-closed for numeric semantics', async () => {
  const unchanged = await resolveManagementCommunication({ company: { symbol: '600519', exchange: 'SSE' }, analysisAsOf: AS_OF, fiscalYear: 2026, period: 'FY', officialSources: [], caller: { extraction: commentaryExtraction({ candidateId: 'current', sourceObjectId: 'current-source', publishedAt: '2026-09-20T00:00:00.000Z', direction: 'increase', value: '12', evidence: 'target revenue reaches 12元' }, { candidateId: 'prior', sourceObjectId: 'prior-source', publishedAt: '2026-08-20T00:00:00.000Z', direction: 'increase', value: '12', evidence: 'target revenue reaches 12元' }) } })
  assert.equal(unchanged.commentaryDeltas[0]?.status, 'unchanged')
  const strengthened = await resolveManagementCommunication({ company: { symbol: '600519', exchange: 'SSE' }, analysisAsOf: AS_OF, fiscalYear: 2026, period: 'FY', officialSources: [], caller: { extraction: commentaryExtraction({ candidateId: 'current', sourceObjectId: 'current-source', publishedAt: '2026-09-20T00:00:00.000Z', direction: 'increase', value: '12', evidence: 'target revenue reaches 12元' }, { candidateId: 'prior', sourceObjectId: 'prior-source', publishedAt: '2026-08-20T00:00:00.000Z', direction: 'increase', value: '10', evidence: 'target revenue reaches 10元' }) } })
  assert.equal(strengthened.commentaryDeltas[0]?.status, 'strengthened')
  const weakened = await resolveManagementCommunication({ company: { symbol: '600519', exchange: 'SSE' }, analysisAsOf: AS_OF, fiscalYear: 2026, period: 'FY', officialSources: [], caller: { extraction: commentaryExtraction({ candidateId: 'current', sourceObjectId: 'current-source', publishedAt: '2026-09-20T00:00:00.000Z', direction: 'increase', value: '8', evidence: 'target revenue reaches 8元' }, { candidateId: 'prior', sourceObjectId: 'prior-source', publishedAt: '2026-08-20T00:00:00.000Z', direction: 'increase', value: '10', evidence: 'target revenue reaches 10元' }) } })
  assert.equal(weakened.commentaryDeltas[0]?.status, 'weakened')
  const ambiguous = await resolveManagementCommunication({ company: { symbol: '600519', exchange: 'SSE' }, analysisAsOf: AS_OF, fiscalYear: 2026, period: 'FY', officialSources: [], caller: { extraction: commentaryExtraction({ candidateId: 'current', sourceObjectId: 'current-source', publishedAt: '2026-09-20T00:00:00.000Z', direction: 'increase', value: '12', evidence: 'revenue growth 12元' }, { candidateId: 'prior', sourceObjectId: 'prior-source', publishedAt: '2026-08-20T00:00:00.000Z', direction: 'increase', value: '10', evidence: 'revenue growth 10元' }) } })
  assert.equal(ambiguous.commentaryDeltas[0]?.status, 'inconclusive')
  const future = await resolveManagementCommunication({ company: { symbol: '600519', exchange: 'SSE' }, analysisAsOf: AS_OF, fiscalYear: 2026, period: 'FY', officialSources: [], caller: { extraction: commentaryExtraction({ candidateId: 'future', sourceObjectId: 'future-source', publishedAt: '2026-10-20T00:00:00.000Z', direction: 'increase', value: '14', evidence: 'target revenue reaches 14元' }, { candidateId: 'prior', sourceObjectId: 'prior-source', publishedAt: '2026-08-20T00:00:00.000Z', direction: 'increase', value: '10', evidence: 'target revenue reaches 10元' }) } })
  assert.equal(future.commentaryDeltas[0]?.currentCandidateId, 'prior')
})

test('commentary chronology excludes same-timestamp priors and conflicts', async () => {
  const base = commentaryExtraction({ candidateId: 'current', sourceObjectId: 'current-source', publishedAt: '2026-09-20T00:00:00.000Z', direction: 'increase', value: '12', evidence: 'target revenue reaches 12元' }, { candidateId: 'prior', sourceObjectId: 'prior-source', publishedAt: '2026-08-20T00:00:00.000Z', direction: 'increase', value: '10', evidence: 'target revenue reaches 10元' })
  const duplicate = { ...base, managementOutlookCandidates: [...base.managementOutlookCandidates, { ...base.managementOutlookCandidates[1]!, candidateId: 'current-duplicate', sourceObjectId: 'current-duplicate-source' }] }
  const duplicateResult = await resolveManagementCommunication({ company: { symbol: '600519', exchange: 'SSE' }, analysisAsOf: AS_OF, fiscalYear: 2026, period: 'FY', officialSources: [], caller: { extraction: duplicate } })
  assert.equal(duplicateResult.commentaryDeltas[0]?.status, 'strengthened')
  assert.equal(duplicateResult.commentaryDeltas[0]?.priorCandidateId, 'prior')
  const conflict = { ...base, managementOutlookCandidates: [...base.managementOutlookCandidates, { ...base.managementOutlookCandidates[1]!, candidateId: 'current-conflict', sourceObjectId: 'current-conflict-source', rawNumericValue: '14', evidenceSpan: { ...base.managementOutlookCandidates[1]!.evidenceSpan, sourceObjectId: 'current-conflict-source', exactText: 'target revenue reaches 14元' } }] }
  const conflictResult = await resolveManagementCommunication({ company: { symbol: '600519', exchange: 'SSE' }, analysisAsOf: AS_OF, fiscalYear: 2026, period: 'FY', officialSources: [], caller: { extraction: conflict } })
  assert.equal(conflictResult.commentaryDeltas[0]?.status, 'inconclusive')
  assert.ok(conflictResult.commentaryDeltas[0]?.diagnostics.includes('COMMENTARY_CURRENT_CONFLICT'))
})
