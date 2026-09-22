import assert from 'node:assert/strict'
import test from 'node:test'
import type { ReasoningCapabilities, ReasoningExecutor, ReasoningRequest, ReasoningResult } from '../../plugins/reasoning/contracts.ts'
import type { ExchangeQAPair, ManagementCommunicationDocument } from '../../workflows/management-communication-acquisition/contracts.ts'
import type { NormalizedResearchSource } from '../../plugins/research-acquisition/contracts.ts'
import { runManagementCommunicationExtraction } from '../../workflows/management-communication-extraction/workflow.ts'
import { resolveFiscalPeriod } from '../../workflows/management-communication-extraction/period-normalization.ts'

const capabilities: ReasoningCapabilities = { maxContextTokens: 4_000, maxOutputTokens: 2_000, structuredOutputSupport: true, maxConcurrency: 1 }
const asOf = '2026-09-22T00:00:00.000Z'

class SequenceExecutor implements ReasoningExecutor {
  readonly calls: ReasoningRequest[] = []
  private index = 0
  constructor(private readonly outputs: readonly unknown[], private readonly executorCapabilities: ReasoningCapabilities = capabilities) {}
  capabilities(): ReasoningCapabilities { return this.executorCapabilities }
  async execute(request: ReasoningRequest): Promise<ReasoningResult> {
    this.calls.push(request)
    const output = this.outputs[Math.min(this.index++, this.outputs.length - 1)]
    return { operation: request.operation, operationId: request.metadata?.executionId, output }
  }
}

function document(content: string, publishedAt = '2026-09-20T00:00:00.000Z'): ManagementCommunicationDocument {
  return { id: 'ir-doc-1', ticker: '600519', documentType: 'INVESTOR_RELATIONS_RECORD', publishedAt, retrievedAt: '2026-09-20T01:00:00.000Z', title: 'IR fixture', content, source: { originPublisher: 'Fixture Company', hostPlatform: 'CNINFO', retrievalProvider: 'fixture', authority: 'S1_OFFICIAL', disclosureClass: 'OFFICIAL_IR' } }
}

function pair(question: string, answer: string, publishedAt = '2026-09-20T00:00:00.000Z'): ExchangeQAPair {
  return { id: 'qa-1', ticker: '600519', question, answer, answeredAt: publishedAt, publishedAt, retrievedAt: '2026-09-20T01:00:00.000Z', platform: 'SZSE_HUDONGYI', source: { originPublisher: 'Fixture Exchange', hostPlatform: 'SZSE', retrievalProvider: 'fixture', authority: 'S1_OFFICIAL', disclosureClass: 'EXCHANGE_INTERACTION' } }
}

function statutory(content: string, publishedAt = '2026-09-20T00:00:00.000Z'): NormalizedResearchSource {
  return { candidate: { candidateId: 'stat-1', kind: 'official_disclosure', tier: 1, title: 'Statutory fixture', provider: 'cninfo', publishedAt, metadata: { companySymbol: '600519' } }, retrievedAt: '2026-09-20T01:00:00.000Z', title: 'Statutory fixture', content, contentHash: 'a'.repeat(64), publisher: 'cninfo', rights: { accessScope: 'public', retentionAllowed: true, aiProcessingAllowed: true, derivativeKnowledgeAllowed: true, redistributionAllowed: false } }
}

test('statutory Formal Guidance projects to existing GuidanceRange with code-owned midpoint', async () => {
  const content = '2026年全年净利润预计10-12亿元。'
  const executor = new SequenceExecutor([{ formalGuidanceCandidates: [{ candidateId: 'model-must-be-ignored', publishedAt: '2099-01-01T00:00:00.000Z', metric: 'net_profit', rawFiscalPeriodText: '2026年全年', guidanceType: 'range', rawLow: '10', rawHigh: '12', rawUnit: '亿元', qualifiers: [], evidence: { sourceObjectId: 'stat-1', exactText: content } }], managementOutlookCandidates: [], kpiCandidates: [], structuredQaCandidates: [] }])
  const result = await runManagementCommunicationExtraction({ analysisAsOf: asOf, source: { lane: 'statutory_disclosure', source: statutory(content) }, reasoningExecutor: executor })
  assert.equal(result.status, 'COMPLETE')
  assert.equal(result.guidance.length, 1)
  assert.deepEqual(result.guidance[0], { guidanceId: result.guidance[0]!.guidanceId, metric: 'net_profit', fiscalPeriod: '2026-FY', low: 1_000_000_000, high: 1_200_000_000, midpoint: 1_100_000_000, unit: 'CNY', guidanceType: 'range', publishedAt: '2026-09-20T00:00:00.000Z', sourceCandidateIds: ['stat-1'], qualifiers: [] })
  assert.equal(result.formalGuidanceCandidates[0]?.publishedAt, '2026-09-20T00:00:00.000Z')
  assert.equal(result.formalGuidanceCandidates[0]?.sourceAuthority, 'S0_STATUTORY')
  assert.equal(result.formalGuidanceCandidates[0]?.candidateId.startsWith('model-must'), false)
})

test('management IR Formal Guidance is deterministically rejected while outlook remains lower authority', async () => {
  const content = '预计下半年需求改善。'
  const executor = new SequenceExecutor([{ formalGuidanceCandidates: [{ metric: 'demand', guidanceType: 'qualitative', qualifiers: ['改善'], evidence: { sourceObjectId: 'ir-doc-1', exactText: content } }], managementOutlookCandidates: [{ topic: 'demand', direction: 'improve', rawTimeHorizon: '下半年', evidence: { sourceObjectId: 'ir-doc-1', exactText: content } }], kpiCandidates: [], structuredQaCandidates: [] }])
  const result = await runManagementCommunicationExtraction({ analysisAsOf: asOf, source: { lane: 'management_document', source: document(content) }, reasoningExecutor: executor })
  assert.equal(result.status, 'PARTIAL')
  assert.equal(result.guidance.length, 0)
  assert.equal(result.formalGuidanceCandidates.length, 0)
  assert.equal(result.managementOutlookCandidates.length, 1)
  assert.ok(result.diagnostics.some((item) => item.includes('FORBIDDEN_FAMILY:formalGuidance')))
})

test('explicit IR KPI projects to existing SegmentKpiPoint only through supplied deterministic segment identity', async () => {
  const content = '2026年上半年汽车电子收入约12.3亿元，同比增长28%。'
  const evidence = '2026年上半年汽车电子收入约12.3亿元'
  const executor = new SequenceExecutor([{ formalGuidanceCandidates: [], managementOutlookCandidates: [], kpiCandidates: [{ rawSegmentLabel: '汽车电子', metric: 'revenue', rawFiscalPeriodText: '2026年上半年', rawValue: '约12.3', rawUnit: '亿元', evidence: { sourceObjectId: 'ir-doc-1', exactText: evidence } }], structuredQaCandidates: [] }])
  const result = await runManagementCommunicationExtraction({ analysisAsOf: asOf, source: { lane: 'management_document', source: document(content) }, reasoningExecutor: executor, segmentIdentityMap: { '汽车电子': 'segment:auto-electronics' } })
  assert.equal(result.status, 'COMPLETE')
  assert.deepEqual(result.segmentKpis, [{ segmentKey: 'segment:auto-electronics', metric: 'revenue', fiscalPeriod: '2026-H1', value: 1_230_000_000, unit: 'CNY', sourceCandidateIds: ['ir-doc-1'] }])
})

test('missing segment identity and unknown unit retain KPI candidate but block final projection', async () => {
  const content = '2026年上半年汽车电子收入12.3 widgets。'
  const executor = new SequenceExecutor([{ formalGuidanceCandidates: [], managementOutlookCandidates: [], kpiCandidates: [{ rawSegmentLabel: '汽车电子', metric: 'revenue', rawFiscalPeriodText: '2026年上半年', rawValue: '12.3', rawUnit: 'widgets', evidence: { sourceObjectId: 'ir-doc-1', exactText: content } }], structuredQaCandidates: [] }])
  const result = await runManagementCommunicationExtraction({ analysisAsOf: asOf, source: { lane: 'management_document', source: document(content) }, reasoningExecutor: executor })
  assert.equal(result.status, 'PARTIAL')
  assert.equal(result.kpiCandidates.length, 1)
  assert.equal(result.segmentKpis.length, 0)
  assert.ok(result.diagnostics.some((item) => item.includes('UNKNOWN_UNIT')))
})

test('Q&A semantic additions preserve source-owned pair identity and fields', async () => {
  const source = pair('公司如何看待海外需求？', '管理层表示海外订单保持增长，未给出量化预测。')
  const answer = source.answer
  const executor = new SequenceExecutor([{ formalGuidanceCandidates: [], managementOutlookCandidates: [{ topic: 'international', direction: 'increase', evidence: { sourceObjectId: 'qa-1', exactText: answer } }], kpiCandidates: [], structuredQaCandidates: [{ pairId: 'qa-1', topicTags: ['international', 'orders'], claimSpans: [{ sourceObjectId: 'qa-1', exactText: answer }], managementStatementSpans: [], rawReferencedProductOrSegment: 'overseas', explicitlyStatedMetrics: [] }] }])
  const result = await runManagementCommunicationExtraction({ analysisAsOf: asOf, source: { lane: 'exchange_qa', sources: [source] }, reasoningExecutor: executor })
  assert.equal(result.status, 'COMPLETE')
  assert.equal(result.structuredQaCandidates[0]?.pairId, 'qa-1')
  assert.equal(result.structuredQaCandidates[0]?.question, source.question)
  assert.equal(result.structuredQaCandidates[0]?.answer, source.answer)
  assert.equal(result.structuredQaCandidates[0]?.platform, source.platform)
  assert.equal(result.structuredQaCandidates[0]?.publishedAt, source.publishedAt)
  assert.equal(result.structuredQaCandidates[0]?.candidateId.startsWith('qa-1'), false)
})

test('evidence validation rejects invented numbers, wrong source IDs, and future sources', async () => {
  const content = '预计收入增长。'
  const executor = new SequenceExecutor([{ formalGuidanceCandidates: [], managementOutlookCandidates: [], kpiCandidates: [{ metric: 'revenue', rawValue: '20', rawUnit: '%', evidence: { sourceObjectId: 'wrong-source', exactText: '20%' } }], structuredQaCandidates: [] }])
  const wrongSource = await runManagementCommunicationExtraction({ analysisAsOf: asOf, source: { lane: 'management_document', source: document(content) }, reasoningExecutor: executor })
  assert.equal(wrongSource.kpiCandidates.length, 0)
  assert.ok(wrongSource.diagnostics.some((item) => item.includes('SOURCE_OBJECT_NOT_IN_REQUEST')))

  const futureExecutor = new SequenceExecutor([{ formalGuidanceCandidates: [], managementOutlookCandidates: [{ topic: 'demand', rawNumericValue: '20%', evidence: { sourceObjectId: 'ir-doc-1', exactText: content } }], kpiCandidates: [], structuredQaCandidates: [] }])
  const future = await runManagementCommunicationExtraction({ analysisAsOf: asOf, source: { lane: 'management_document', source: document(content, '2026-09-23T00:00:00.000Z') }, reasoningExecutor: futureExecutor })
  assert.equal(future.status, 'UNAVAILABLE')
  assert.ok(future.diagnostics.some((item) => item.includes('FUTURE_SOURCE_REJECTED')))
})

test('offset and exactText evidence rules are fail-closed', async () => {
  const content = '产能达到10万吨。'
  const executor = new SequenceExecutor([{ formalGuidanceCandidates: [], managementOutlookCandidates: [], kpiCandidates: [{ metric: 'capacity', rawValue: '10', rawUnit: '万吨', evidence: { sourceObjectId: 'ir-doc-1', startOffset: 0, endOffset: 2, exactText: '错误' } }], structuredQaCandidates: [] }])
  const result = await runManagementCommunicationExtraction({ analysisAsOf: asOf, source: { lane: 'management_document', source: document(content) }, reasoningExecutor: executor })
  assert.equal(result.kpiCandidates.length, 0)
  assert.ok(result.diagnostics.some((item) => item.includes('EVIDENCE_EXACT_TEXT_MISMATCH')))
})

test('chunk-local evidence translates to absolute offsets and exactText lookup is slice-scoped', async () => {
  const repeated = '汽车电子收入12亿元。'
  const content = `${repeated}${'前文。'.repeat(4_500)}${repeated}`
  const executor = new class implements ReasoningExecutor {
    readonly calls: ReasoningRequest[] = []
    capabilities(): ReasoningCapabilities { return capabilities }
    async execute(request: ReasoningRequest): Promise<ReasoningResult> {
      this.calls.push(request)
      const source = (request.input as { readonly sourceObjects: readonly [{ readonly sourceText: string; readonly absoluteStartOffset: number }] }).sourceObjects[0]!
      if (source.absoluteStartOffset === 0) return { operation: request.operation, output: { formalGuidanceCandidates: [], managementOutlookCandidates: [], kpiCandidates: [], structuredQaCandidates: [] } }
      const localStart = source.sourceText.indexOf(repeated)
      return { operation: request.operation, output: { formalGuidanceCandidates: [], managementOutlookCandidates: [], kpiCandidates: [{ rawSegmentLabel: '汽车电子', metric: 'revenue', rawFiscalPeriodText: '2026年全年', rawValue: '12', rawUnit: '亿元', evidence: { sourceObjectId: 'ir-doc-1', startOffset: localStart, endOffset: localStart + repeated.length, exactText: repeated } }], structuredQaCandidates: [] } }
    }
  }()
  const result = await runManagementCommunicationExtraction({ analysisAsOf: asOf, source: { lane: 'management_document', source: document(content) }, reasoningExecutor: executor, segmentIdentityMap: { '汽车电子': 'segment:auto-electronics' } })
  const candidate = result.kpiCandidates[0]!
  const expectedAbsolute = content.lastIndexOf(repeated)
  assert.equal(result.status, 'COMPLETE')
  assert.notEqual(candidate.evidenceSpan.startOffset, executor.calls[1] === undefined ? -1 : ((executor.calls[1].input as { readonly sourceObjects: readonly [{ readonly absoluteStartOffset: number }] }).sourceObjects[0]!.absoluteStartOffset))
  assert.equal(candidate.evidenceSpan.startOffset, expectedAbsolute)
  assert.equal(candidate.evidenceSpan.endOffset, expectedAbsolute + repeated.length)
  assert.equal(result.segmentKpis.length, 1)
})

test('exactText-only evidence resolves inside the model slice before translating to the full source', async () => {
  const repeated = '订单增长20%。'
  const content = `${repeated}${'背景。'.repeat(4_500)}${repeated}`
  const executor = new class implements ReasoningExecutor {
    readonly calls: ReasoningRequest[] = []
    capabilities(): ReasoningCapabilities { return capabilities }
    async execute(request: ReasoningRequest): Promise<ReasoningResult> {
      this.calls.push(request)
      const source = (request.input as { readonly sourceObjects: readonly [{ readonly absoluteStartOffset: number }] }).sourceObjects[0]!
      return { operation: request.operation, output: source.absoluteStartOffset === 0 ? { formalGuidanceCandidates: [], managementOutlookCandidates: [], kpiCandidates: [], structuredQaCandidates: [] } : { formalGuidanceCandidates: [], managementOutlookCandidates: [{ topic: 'orders', rawNumericValue: '20%', evidence: { sourceObjectId: 'ir-doc-1', exactText: repeated } }], kpiCandidates: [], structuredQaCandidates: [] } }
    }
  }()
  const result = await runManagementCommunicationExtraction({ analysisAsOf: asOf, source: { lane: 'management_document', source: document(content) }, reasoningExecutor: executor })
  assert.equal(result.managementOutlookCandidates[0]?.evidenceSpan.startOffset, content.lastIndexOf(repeated))
  assert.equal(result.managementOutlookCandidates[0]?.evidenceSpan.exactText, repeated)
})

test('oversized single Q&A pair is skipped before reasoning without truncation', async () => {
  const oversized = pair('Q', '回答'.repeat(400))
  const executor = new SequenceExecutor([], { ...capabilities, maxContextTokens: 4 })
  const result = await runManagementCommunicationExtraction({ analysisAsOf: asOf, source: { lane: 'exchange_qa', sources: [oversized] }, reasoningExecutor: executor })
  assert.equal(result.status, 'UNAVAILABLE')
  assert.equal(executor.calls.length, 0)
  assert.ok(result.diagnostics.some((item) => item.startsWith('QA_PAIR_EXCEEDS_CONTEXT_BOUND:qa-1')))
})

test('numeric ranges require one attributable range expression', async () => {
  const unrelated = '收入20亿元，净利润30亿元。'
  const guidance = await runManagementCommunicationExtraction({ analysisAsOf: asOf, source: { lane: 'statutory_disclosure', source: statutory(unrelated) }, reasoningExecutor: new SequenceExecutor([{ formalGuidanceCandidates: [{ metric: 'revenue', guidanceType: 'range', rawLow: '20', rawHigh: '30', rawUnit: '亿元', qualifiers: [], evidence: { sourceObjectId: 'stat-1', exactText: unrelated } }], managementOutlookCandidates: [], kpiCandidates: [], structuredQaCandidates: [] }]) })
  assert.equal(guidance.formalGuidanceCandidates.length, 0)
  assert.ok(guidance.diagnostics.some((item) => item.includes('GUIDANCE_RANGE_EXPRESSION_NOT_FOUND')))

  const outlook = await runManagementCommunicationExtraction({ analysisAsOf: asOf, source: { lane: 'management_document', source: document(unrelated) }, reasoningExecutor: new SequenceExecutor([{ formalGuidanceCandidates: [], managementOutlookCandidates: [{ topic: 'revenue', rawNumericRange: '20-30', rawUnit: '亿元', evidence: { sourceObjectId: 'ir-doc-1', exactText: unrelated } }], kpiCandidates: [], structuredQaCandidates: [] }]) })
  assert.equal(outlook.managementOutlookCandidates.length, 0)
  assert.ok(outlook.diagnostics.some((item) => item.includes('OUTLOOK_RANGE_EXPRESSION_NOT_FOUND')))

  const ranged = '收入20亿元至30亿元。'
  const accepted = await runManagementCommunicationExtraction({ analysisAsOf: asOf, source: { lane: 'statutory_disclosure', source: statutory(ranged) }, reasoningExecutor: new SequenceExecutor([{ formalGuidanceCandidates: [{ metric: 'revenue', guidanceType: 'range', rawLow: '20', rawHigh: '30', rawUnit: '亿元', qualifiers: [], evidence: { sourceObjectId: 'stat-1', exactText: ranged } }], managementOutlookCandidates: [], kpiCandidates: [], structuredQaCandidates: [] }]) })
  assert.equal(accepted.formalGuidanceCandidates.length, 1)

  const kpiRange = '销量10-12万台。'
  const kpi = await runManagementCommunicationExtraction({ analysisAsOf: asOf, source: { lane: 'management_document', source: document(kpiRange) }, reasoningExecutor: new SequenceExecutor([{ formalGuidanceCandidates: [], managementOutlookCandidates: [], kpiCandidates: [{ rawSegmentLabel: '汽车', metric: 'shipments', rawFiscalPeriodText: '2026年全年', rawValue: '10-12', rawUnit: '万台', evidence: { sourceObjectId: 'ir-doc-1', exactText: kpiRange } }], structuredQaCandidates: [] }]), segmentIdentityMap: { '汽车': 'segment:auto' } })
  assert.equal(kpi.kpiCandidates.length, 1)
  assert.equal(kpi.segmentKpis.length, 0)
  assert.ok(kpi.diagnostics.some((item) => item.includes('KPI_RANGE_NOT_PROJECTABLE')))
})

test('same-span KPI metrics survive while genuinely conflicting semantic values are excluded from projection', async () => {
  const content = '汽车电子收入12亿元，出货量30万台。'
  const output = { formalGuidanceCandidates: [], managementOutlookCandidates: [], kpiCandidates: [
    { rawSegmentLabel: '汽车电子', metric: 'revenue', rawFiscalPeriodText: '2026年全年', rawValue: '12', rawUnit: '亿元', evidence: { sourceObjectId: 'ir-doc-1', exactText: content } },
    { rawSegmentLabel: '汽车电子', metric: 'shipments', rawFiscalPeriodText: '2026年全年', rawValue: '30', rawUnit: '万台', evidence: { sourceObjectId: 'ir-doc-1', exactText: content } },
  ], structuredQaCandidates: [] }
  const distinct = await runManagementCommunicationExtraction({ analysisAsOf: asOf, source: { lane: 'management_document', source: document(content) }, reasoningExecutor: new SequenceExecutor([output]), segmentIdentityMap: { '汽车电子': 'segment:auto-electronics' } })
  assert.equal(distinct.kpiCandidates.length, 2)
  assert.equal(distinct.segmentKpis.length, 2)

  const conflictContent = '汽车电子收入12亿元或13亿元。'
  const conflictEvidence = { sourceObjectId: 'ir-doc-1', exactText: conflictContent }
  const conflictingOutput = { ...output, kpiCandidates: [{ ...output.kpiCandidates[0]!, evidence: conflictEvidence }, { ...output.kpiCandidates[0]!, rawValue: '13', evidence: conflictEvidence }] }
  const conflicting = await runManagementCommunicationExtraction({ analysisAsOf: asOf, source: { lane: 'management_document', source: document(conflictContent) }, reasoningExecutor: new SequenceExecutor([conflictingOutput]), segmentIdentityMap: { '汽车电子': 'segment:auto-electronics' } })
  assert.equal(conflicting.kpiCandidates.length, 2)
  assert.equal(conflicting.segmentKpis.length, 0)
  assert.ok(conflicting.diagnostics.some((item) => item.includes('CONFLICTING_CANDIDATES:kpi:')))
})

test('candidate identity canonicalizes qualifier and topic-tag order but changes with semantic values', async () => {
  const formal = '公司预计稳健增长。'
  const runFormal = (qualifiers: readonly string[]) => runManagementCommunicationExtraction({ analysisAsOf: asOf, source: { lane: 'statutory_disclosure', source: statutory(formal) }, reasoningExecutor: new SequenceExecutor([{ formalGuidanceCandidates: [{ metric: 'outlook', guidanceType: 'qualitative', qualifiers, evidence: { sourceObjectId: 'stat-1', exactText: formal } }], managementOutlookCandidates: [], kpiCandidates: [], structuredQaCandidates: [] }]) })
  const firstFormal = await runFormal([' demand ', 'capacity', 'demand'])
  const reorderedFormal = await runFormal(['capacity', 'demand'])
  const changedFormal = await runFormal(['capacity', 'pricing'])
  assert.equal(firstFormal.formalGuidanceCandidates[0]?.candidateId, reorderedFormal.formalGuidanceCandidates[0]?.candidateId)
  assert.notEqual(firstFormal.formalGuidanceCandidates[0]?.candidateId, changedFormal.formalGuidanceCandidates[0]?.candidateId)

  const source = pair('Q', '订单保持增长。')
  const runQa = (topicTags: readonly string[]) => runManagementCommunicationExtraction({ analysisAsOf: asOf, source: { lane: 'exchange_qa', sources: [source] }, reasoningExecutor: new SequenceExecutor([{ formalGuidanceCandidates: [], managementOutlookCandidates: [], kpiCandidates: [], structuredQaCandidates: [{ pairId: 'qa-1', topicTags, claimSpans: [{ sourceObjectId: 'qa-1', exactText: source.answer }], managementStatementSpans: [], explicitlyStatedMetrics: ['orders'] }] }]) })
  const firstQa = await runQa(['orders', 'international'])
  const reorderedQa = await runQa(['international', 'orders'])
  assert.equal(firstQa.structuredQaCandidates[0]?.candidateId, reorderedQa.structuredQaCandidates[0]?.candidateId)
})

test('candidate IDs are stable, batch-order independent, and exact duplicates are deduped', async () => {
  const sourceA = pair('Q1', 'A1')
  const sourceB = { ...pair('Q2', 'A2'), id: 'qa-2' }
  const output = (id: string, text: string) => ({ formalGuidanceCandidates: [], managementOutlookCandidates: [], kpiCandidates: [], structuredQaCandidates: [{ pairId: id, topicTags: ['topic'], claimSpans: [{ sourceObjectId: id, exactText: text }], managementStatementSpans: [], explicitlyStatedMetrics: [] }] })
  const first = await runManagementCommunicationExtraction({ analysisAsOf: asOf, source: { lane: 'exchange_qa', sources: [sourceA, sourceB] }, maxQAPairsPerBatch: 1, reasoningExecutor: new SequenceExecutor([output('qa-1', sourceA.answer), output('qa-2', sourceB.answer)]) })
  const second = await runManagementCommunicationExtraction({ analysisAsOf: asOf, source: { lane: 'exchange_qa', sources: [sourceB, sourceA] }, maxQAPairsPerBatch: 1, reasoningExecutor: new SequenceExecutor([output('qa-2', sourceB.answer), output('qa-1', sourceA.answer)]) })
  assert.deepEqual(first.structuredQaCandidates.map((item) => item.candidateId).sort(), second.structuredQaCandidates.map((item) => item.candidateId).sort())
  const duplicateOutput = output('qa-1', sourceA.answer)
  const duplicate = await runManagementCommunicationExtraction({ analysisAsOf: asOf, source: { lane: 'exchange_qa', sources: [sourceA] }, reasoningExecutor: new SequenceExecutor([{ ...duplicateOutput, structuredQaCandidates: [...duplicateOutput.structuredQaCandidates, ...duplicateOutput.structuredQaCandidates] }]) })
  assert.equal(duplicate.structuredQaCandidates.length, 1)
  assert.ok(duplicate.diagnostics.some((item) => item.includes('DUPLICATE_CANDIDATE')))
})

test('schema-invalid output gets exactly one bounded repair and semantic mismatch gets no repair', async () => {
  const content = '预计收入增长。'
  const valid = { formalGuidanceCandidates: [], managementOutlookCandidates: [{ topic: 'demand', direction: 'improve', evidence: { sourceObjectId: 'ir-doc-1', exactText: content } }], kpiCandidates: [], structuredQaCandidates: [] }
  const repairExecutor = new SequenceExecutor([{ malformed: true }, valid])
  const repaired = await runManagementCommunicationExtraction({ analysisAsOf: asOf, source: { lane: 'management_document', source: document(content) }, reasoningExecutor: repairExecutor })
  assert.equal(repairExecutor.calls.length, 2)
  assert.equal(repaired.telemetry.repairCalls, 1)
  assert.equal(repaired.managementOutlookCandidates.length, 1)

  const semanticExecutor = new SequenceExecutor([{ formalGuidanceCandidates: [], managementOutlookCandidates: [{ topic: 'demand', evidence: { sourceObjectId: 'missing', exactText: content } }], kpiCandidates: [], structuredQaCandidates: [] }])
  const semantic = await runManagementCommunicationExtraction({ analysisAsOf: asOf, source: { lane: 'management_document', source: document(content) }, reasoningExecutor: semanticExecutor })
  assert.equal(semanticExecutor.calls.length, 1)
  assert.equal(semantic.telemetry.repairCalls, 0)
})

test('partial candidates survive sibling rejection and absent reasoning fails closed', async () => {
  const good = '订单增长20%。'
  const executor = new SequenceExecutor([{ formalGuidanceCandidates: [], managementOutlookCandidates: [{ topic: 'orders', rawNumericValue: '20%', evidence: { sourceObjectId: 'ir-doc-1', exactText: good } }, { topic: 'orders', rawNumericValue: '999%', evidence: { sourceObjectId: 'ir-doc-1', exactText: '不存在' } }], kpiCandidates: [], structuredQaCandidates: [] }])
  const partial = await runManagementCommunicationExtraction({ analysisAsOf: asOf, source: { lane: 'management_document', source: document(good) }, reasoningExecutor: executor })
  assert.equal(partial.status, 'PARTIAL')
  assert.equal(partial.managementOutlookCandidates.length, 1)
  const unavailable = await runManagementCommunicationExtraction({ analysisAsOf: asOf, source: { lane: 'management_document', source: document(good) } })
  assert.equal(unavailable.status, 'UNAVAILABLE')
  assert.ok(unavailable.diagnostics.includes('STRUCTURED_EXTRACTION_UNAVAILABLE'))
})

test('fiscal period normalization reuses existing Earnings convention and blocks unsupported relative periods', () => {
  assert.deepEqual(resolveFiscalPeriod('2026年全年'), { fiscalPeriod: '2026-FY' })
  assert.deepEqual(resolveFiscalPeriod('2026年上半年'), { fiscalPeriod: '2026-H1' })
  assert.deepEqual(resolveFiscalPeriod('2026年第三季度'), { fiscalPeriod: '2026-Q3' })
  assert.equal(resolveFiscalPeriod('今年').fiscalPeriod, undefined)
  assert.equal(resolveFiscalPeriod('今年').diagnostic, 'FISCAL_PERIOD_NOT_EXPLICIT')
})
