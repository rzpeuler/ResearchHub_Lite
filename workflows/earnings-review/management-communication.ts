import { createHash } from 'node:crypto'
import { runExchangeQa, runManagementCommunicationDocuments, type ExchangeQAPair, type ManagementCommunicationAcquisitionSources, type ManagementCommunicationDocument } from '../management-communication-acquisition/index.ts'
import { runManagementCommunicationExtraction, type ManagementCommunicationExtractionResult } from '../management-communication-extraction/index.ts'
import type { ManagementOutlookCandidate, StructuredQAEvidence } from '../../skills/management-communication-extraction/contracts.ts'
import type { GuidanceRange, SegmentKpiDeltaInput, SegmentKpiPoint } from '../../skills/earnings-review/expectations/contracts.ts'
import type { EarningsReviewSection } from '../../skills/earnings-review/contracts.ts'
import type { NormalizedResearchSource, ResearchCompanyIdentity } from '../../plugins/research-acquisition/contracts.ts'
import type { ReasoningExecutor } from '../../plugins/reasoning/contracts.ts'
import { assessManagementExecution, type ManagementCommitment, type ManagementExecutionResult, type ManagementOutcome } from '../../skills/management_execution/index.ts'
import type { EarningsPeriod } from '../../skills/earnings-review/index.ts'
import { parseNumericRange, parseNumericToken } from '../management-communication-extraction/numeric-parsing.ts'
import { resolveUnit } from '../management-communication-extraction/unit-normalization.ts'
import { resolveFiscalPeriod } from '../management-communication-extraction/period-normalization.ts'

export interface ManagementCommunicationResearchInput {
  readonly extraction?: ManagementCommunicationExtractionResult
  readonly executionOutcomes?: readonly ManagementOutcome[]
}

export interface ManagementCommunicationResearchResult {
  readonly status: 'available' | 'partial' | 'unavailable' | 'failed'
  readonly extraction?: ManagementCommunicationExtractionResult
  readonly sourceObjects: readonly NormalizedResearchSource[]
  readonly guidance?: readonly GuidanceRange[]
  readonly currentGuidanceIds?: readonly string[]
  readonly segmentKpiComparisons?: readonly SegmentKpiDeltaInput[]
  readonly commentaryDeltas: readonly ManagementCommentaryDelta[]
  readonly qaClusters: readonly QAQuestionCluster[]
  readonly execution: ManagementExecutionResult
  readonly diagnostics: readonly string[]
  readonly telemetry: ManagementCommunicationTelemetry
}

export interface ManagementCommunicationTelemetry {
  readonly acquisitionAttempted: boolean
  readonly acquisitionDocumentCount: number
  readonly acquisitionQaCount: number
  readonly extractionCalls: number
  readonly extractedOutlookCount: number
  readonly extractedQaCount: number
  readonly commentaryDeltaCount: number
  readonly qaClusterCount: number
  readonly executionAssessmentCount: number
}

export type ManagementCommentaryDeltaStatus = 'new' | 'unchanged' | 'strengthened' | 'reversed' | 'inconclusive'

export interface ManagementCommentaryDelta {
  readonly key: string
  readonly topic: string
  readonly metric?: string
  readonly timeHorizon?: string
  readonly status: ManagementCommentaryDeltaStatus
  readonly currentCandidateId?: string
  readonly priorCandidateId?: string
  readonly currentDirection?: string
  readonly priorDirection?: string
  readonly numericChange?: { readonly current?: number; readonly prior?: number; readonly absoluteDelta?: number; readonly unit?: string }
  readonly sourceCandidateIds: readonly string[]
  readonly diagnostics: readonly string[]
}

export interface QAResponseAssessment {
  readonly status: 'direct' | 'partial' | 'non_answer' | 'inconclusive'
  readonly diagnostics: readonly string[]
  readonly sourceCandidateIds: readonly string[]
}

export interface QAQuestionClusterMember {
  readonly pairId: string
  readonly question: string
  readonly answer: string
  readonly sourceObjectId: string
  readonly topicTags: readonly string[]
  readonly response: QAResponseAssessment
}

export interface QAQuestionCluster {
  readonly clusterId: string
  readonly key: string
  readonly topicTags: readonly string[]
  readonly referencedProductOrSegment?: string
  readonly members: readonly QAQuestionClusterMember[]
  readonly sourceCandidateIds: readonly string[]
}

export interface ResolveManagementCommunicationInput {
  readonly company: ResearchCompanyIdentity
  readonly analysisAsOf: string
  readonly fiscalYear: number
  readonly period: EarningsPeriod
  readonly signal?: AbortSignal
  readonly now?: () => string
  readonly reasoningExecutor?: ReasoningExecutor
  readonly officialSources: readonly NormalizedResearchSource[]
  readonly caller?: ManagementCommunicationResearchInput
  readonly sources?: ManagementCommunicationAcquisitionSources
  readonly lookbackDays?: number
}

const text = (value: unknown): value is string => typeof value === 'string' && value.trim() !== ''
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)
const unique = (values: readonly string[]): readonly string[] => [...new Set(values.filter(text).map((value) => value.trim()))].sort((left, right) => left.localeCompare(right))
const normalized = (value: string): string => value.normalize('NFKC').replace(/\s+/g, '').toLocaleLowerCase()

function sourceFromDocument(document: ManagementCommunicationDocument): NormalizedResearchSource {
  const candidate = { candidateId: document.id, kind: 'official_disclosure' as const, tier: 1 as const, title: document.title ?? document.id, provider: document.source.retrievalProvider ?? 'management-communication', publishedAt: document.publishedAt, url: document.source.sourceUrl, metadata: { companySymbol: document.ticker, d2Lane: 'management_document' } }
  return { candidate, retrievedAt: document.retrievedAt, title: candidate.title, content: document.content, contentHash: createHash('sha256').update(document.content).digest('hex'), publisher: document.source.originPublisher, canonicalUrl: document.source.sourceUrl, rights: { accessScope: 'public', retentionAllowed: true, aiProcessingAllowed: true, derivativeKnowledgeAllowed: true, redistributionAllowed: false } }
}

function sourceFromQa(pair: ExchangeQAPair): NormalizedResearchSource {
  const content = `Question: ${pair.question}\nAnswer: ${pair.answer}`
  const candidate = { candidateId: pair.id, kind: 'structured_data' as const, tier: 2 as const, title: `Management Q&A ${pair.id}`, provider: pair.source.retrievalProvider ?? 'management-communication', publishedAt: pair.publishedAt, url: pair.source.sourceUrl, metadata: { companySymbol: pair.ticker, d2Lane: 'exchange_qa', platform: pair.platform } }
  return { candidate, retrievedAt: pair.retrievedAt, title: candidate.title, content, contentHash: createHash('sha256').update(content).digest('hex'), publisher: pair.source.originPublisher, canonicalUrl: pair.source.sourceUrl, rights: { accessScope: 'public', retentionAllowed: true, aiProcessingAllowed: true, derivativeKnowledgeAllowed: true, redistributionAllowed: false } }
}

function sourceObjectsFromExtraction(extraction: ManagementCommunicationExtractionResult): readonly NormalizedResearchSource[] {
  const ids = unique([
    ...extraction.formalGuidanceCandidates.map((item) => item.sourceObjectId),
    ...extraction.managementOutlookCandidates.map((item) => item.sourceObjectId),
    ...extraction.kpiCandidates.map((item) => item.sourceObjectId),
    ...extraction.structuredQaCandidates.map((item) => item.sourceObjectId),
    ...extraction.guidance.flatMap((item) => item.sourceCandidateIds),
    ...extraction.segmentKpis.flatMap((item) => item.sourceCandidateIds),
  ])
  return ids.map((id) => {
    const content = extraction.managementOutlookCandidates.find((item) => item.sourceObjectId === id)?.evidenceSpan.exactText
      ?? extraction.structuredQaCandidates.find((item) => item.sourceObjectId === id)?.evidenceSpan.exactText
      ?? 'caller-supplied validated management evidence'
    return { candidate: { candidateId: id, kind: 'structured_data' as const, tier: 2 as const, title: `Caller management evidence ${id}`, provider: 'caller', metadata: { d2Validated: true } }, retrievedAt: new Date(0).toISOString(), title: `Caller management evidence ${id}`, content, contentHash: createHash('sha256').update(content).digest('hex'), publisher: 'caller', rights: { accessScope: 'unknown' as const, retentionAllowed: false, aiProcessingAllowed: true, derivativeKnowledgeAllowed: false, redistributionAllowed: false } }
  })
}

function mergeExtractions(values: readonly ManagementCommunicationExtractionResult[], diagnostics: string[]): ManagementCommunicationExtractionResult | undefined {
  if (values.length === 0) return undefined
  const first = values[0]!
  return {
    status: values.every((item) => item.status === 'COMPLETE') ? 'COMPLETE' : values.some((item) => item.status !== 'UNAVAILABLE') ? 'PARTIAL' : 'UNAVAILABLE',
    formalGuidanceCandidates: values.flatMap((item) => item.formalGuidanceCandidates),
    managementOutlookCandidates: values.flatMap((item) => item.managementOutlookCandidates),
    kpiCandidates: values.flatMap((item) => item.kpiCandidates),
    structuredQaCandidates: values.flatMap((item) => item.structuredQaCandidates),
    guidance: values.flatMap((item) => item.guidance),
    segmentKpis: values.flatMap((item) => item.segmentKpis),
    diagnostics: unique([...diagnostics, ...values.flatMap((item) => item.diagnostics)]),
    telemetry: {
      ...first.telemetry,
      calls: values.reduce((sum, item) => sum + item.telemetry.calls, 0),
      repairCalls: values.reduce((sum, item) => sum + item.telemetry.repairCalls, 0),
      inputUnits: values.reduce((sum, item) => sum + item.telemetry.inputUnits, 0),
      rawCandidateCount: values.reduce((sum, item) => sum + item.telemetry.rawCandidateCount, 0),
      validatedCandidateCount: values.reduce((sum, item) => sum + item.telemetry.validatedCandidateCount, 0),
      rejectedCandidateCount: values.reduce((sum, item) => sum + item.telemetry.rejectedCandidateCount, 0),
      projectedGuidanceCount: values.reduce((sum, item) => sum + item.telemetry.projectedGuidanceCount, 0),
      projectedSegmentKpiCount: values.reduce((sum, item) => sum + item.telemetry.projectedSegmentKpiCount, 0),
    },
  }
}

async function automaticallyExtract(input: ResolveManagementCommunicationInput, diagnostics: string[]): Promise<{ readonly extraction?: ManagementCommunicationExtractionResult; readonly sources: readonly NormalizedResearchSource[]; readonly documentCount: number; readonly qaCount: number; readonly attempted: boolean }> {
  if (input.sources === undefined) return { sources: [], documentCount: 0, qaCount: 0, attempted: false }
  const request = { ticker: input.company.symbol, companyName: input.company.name, exchange: input.company.exchange as 'SSE' | 'SZSE' | 'BSE' | undefined, asOf: input.analysisAsOf, lookbackDays: input.lookbackDays }
  const [documents, qa] = await Promise.all([
    runManagementCommunicationDocuments({ request, sources: input.sources, now: input.now }),
    runExchangeQa({ request, sources: input.sources, now: input.now }),
  ])
  diagnostics.push(...documents.diagnostics, ...qa.diagnostics)
  const sourceObjects = [...documents.data.map(sourceFromDocument), ...qa.data.map(sourceFromQa), ...input.officialSources]
  const extractions: ManagementCommunicationExtractionResult[] = []
  if (input.reasoningExecutor !== undefined) {
    for (const document of documents.data) extractions.push(await runManagementCommunicationExtraction({ analysisAsOf: input.analysisAsOf, source: { lane: 'management_document', source: document }, reasoningExecutor: input.reasoningExecutor, signal: input.signal }))
    if (qa.data.length > 0) extractions.push(await runManagementCommunicationExtraction({ analysisAsOf: input.analysisAsOf, source: { lane: 'exchange_qa', sources: qa.data }, reasoningExecutor: input.reasoningExecutor, signal: input.signal }))
    for (const source of input.officialSources) extractions.push(await runManagementCommunicationExtraction({ analysisAsOf: input.analysisAsOf, source: { lane: 'statutory_disclosure', source }, reasoningExecutor: input.reasoningExecutor, signal: input.signal }))
  } else diagnostics.push('MANAGEMENT_COMMUNICATION_REASONING_EXECUTOR_UNAVAILABLE')
  return { extraction: mergeExtractions(extractions, diagnostics), sources: sourceObjects, documentCount: documents.data.length, qaCount: qa.data.length, attempted: true }
}

function outlookKey(candidate: ManagementOutlookCandidate): string { return [normalized(candidate.topic), normalized(candidate.metric ?? ''), normalized(candidate.timeHorizon ?? '')].join('|') }
function directionSign(value: string | undefined): -1 | 0 | 1 | undefined { if (value === 'increase' || value === 'improve') return 1; if (value === 'decrease' || value === 'deteriorate') return -1; if (value === 'stable') return 0; return undefined }
function outlookNumber(candidate: ManagementOutlookCandidate): { readonly value?: number; readonly unit?: string } { const unit = resolveUnit(candidate.rawUnit, candidate.evidenceSpan.exactText ?? ''); const range = parseNumericRange(candidate.rawNumericRange); const token = range === undefined ? parseNumericToken(candidate.rawNumericValue) : undefined; return token === undefined || unit === undefined ? {} : { value: token.value * unit.factor, unit: unit.canonical } }

function buildCommentary(outlooks: readonly ManagementOutlookCandidate[]): readonly ManagementCommentaryDelta[] {
  const groups = new Map<string, ManagementOutlookCandidate[]>()
  for (const candidate of outlooks) groups.set(outlookKey(candidate), [...(groups.get(outlookKey(candidate)) ?? []), candidate])
  const output: ManagementCommentaryDelta[] = []
  for (const [key, values] of [...groups.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    const ordered = values.slice().sort((left, right) => right.publishedAt.localeCompare(left.publishedAt) || right.candidateId.localeCompare(left.candidateId)); const current = ordered[0]!; const prior = ordered[1]
    const currentNumber = outlookNumber(current); const priorNumber = prior === undefined ? {} : outlookNumber(prior); const currentSign = directionSign(current.direction); const priorSign = directionSign(prior?.direction); const diagnostics: string[] = []; let status: ManagementCommentaryDeltaStatus = 'new'
    if (prior !== undefined) {
      const comparableNumeric = finite(currentNumber.value) && finite(priorNumber.value) && currentNumber.unit === priorNumber.unit
      if (currentSign !== undefined && priorSign !== undefined && currentSign !== 0 && priorSign !== 0 && currentSign !== priorSign) status = 'reversed'
      else if (current.direction === prior.direction && (!comparableNumeric || currentNumber.value === priorNumber.value)) status = 'unchanged'
      else if (current.direction === prior.direction && comparableNumeric) status = 'strengthened'
      else status = 'inconclusive'
      if (finite(currentNumber.value) !== finite(priorNumber.value) || (finite(currentNumber.value) && finite(priorNumber.value) && currentNumber.unit !== priorNumber.unit)) diagnostics.push('COMMENTARY_NUMERIC_COMPARISON_INCOMPATIBLE')
    }
    output.push({ key, topic: current.topic, ...(current.metric === undefined ? {} : { metric: current.metric }), ...(current.timeHorizon === undefined ? {} : { timeHorizon: current.timeHorizon }), status, currentCandidateId: current.candidateId, ...(prior === undefined ? {} : { priorCandidateId: prior.candidateId }), ...(current.direction === undefined ? {} : { currentDirection: current.direction }), ...(prior?.direction === undefined ? {} : { priorDirection: prior.direction }), ...(finite(currentNumber.value) && finite(priorNumber.value) && currentNumber.unit === priorNumber.unit ? { numericChange: { current: currentNumber.value, prior: priorNumber.value, absoluteDelta: currentNumber.value - priorNumber.value, unit: currentNumber.unit } } : {}), sourceCandidateIds: unique([current.sourceObjectId, ...(prior === undefined ? [] : [prior.sourceObjectId])]), diagnostics })
    void priorSign
  }
  return output
}

function assessResponse(item: StructuredQAEvidence): QAResponseAssessment {
  const answer = item.answer.trim(); const sourceCandidateIds = unique([item.sourceObjectId, ...item.claimSpans.map((span) => span.sourceObjectId), ...item.managementStatementSpans.map((span) => span.sourceObjectId)])
  if (!answer || /^(不便透露|无法回答|暂无|无可奉告|n\/a|na)$/iu.test(answer)) return { status: 'non_answer', diagnostics: ['QA_RESPONSE_NON_ANSWER'], sourceCandidateIds }
  const questionTokens = normalized(item.question).split(/[，。！？、；：\s]+/u).filter((token) => token.length >= 2); const direct = item.explicitlyStatedMetrics.length > 0 || item.managementStatementSpans.length > 0 || questionTokens.some((token) => normalized(answer).includes(token))
  if (direct) return { status: 'direct', diagnostics: [], sourceCandidateIds }
  if (item.claimSpans.length > 0 || answer.length > 0) return { status: 'partial', diagnostics: ['QA_RESPONSE_PARTIAL_COVERAGE'], sourceCandidateIds }
  return { status: 'inconclusive', diagnostics: ['QA_RESPONSE_EVIDENCE_INSUFFICIENT'], sourceCandidateIds }
}

function qaKey(item: StructuredQAEvidence): string { const tags = unique(item.topicTags).map(normalized).join('|'); const product = normalized(item.referencedProductOrSegment ?? ''); return tags !== '' || product !== '' ? [tags, product].join('|') : normalized(item.question).slice(0, 120) }
function buildQaClusters(values: readonly StructuredQAEvidence[]): readonly QAQuestionCluster[] {
  const groups = new Map<string, StructuredQAEvidence[]>(); for (const item of values) groups.set(qaKey(item), [...(groups.get(qaKey(item)) ?? []), item])
  return [...groups.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([key, members]) => { const ordered = members.slice().sort((left, right) => left.candidateId.localeCompare(right.candidateId)); const first = ordered[0]!; const clusterId = `qa-cluster-${createHash('sha256').update(key).digest('hex').slice(0, 16)}`; return { clusterId, key, topicTags: unique(ordered.flatMap((item) => item.topicTags)), ...(first.referencedProductOrSegment === undefined ? {} : { referencedProductOrSegment: first.referencedProductOrSegment }), members: ordered.map((item): QAQuestionClusterMember => ({ pairId: item.pairId, question: item.question, answer: item.answer, sourceObjectId: item.sourceObjectId, topicTags: unique(item.topicTags), response: assessResponse(item) })), sourceCandidateIds: unique(ordered.flatMap((item) => [item.sourceObjectId, ...item.claimSpans.map((span) => span.sourceObjectId), ...item.managementStatementSpans.map((span) => span.sourceObjectId)])) } })
}

function periodEnd(period: string | undefined): string | undefined { const match = /^(\d{4})-(FY|Q1|H1|Q3)$/u.exec(period ?? ''); if (!match) return undefined; const month = match[2] === 'Q1' ? '03-31' : match[2] === 'H1' ? '06-30' : match[2] === 'Q3' ? '09-30' : '12-31'; return `${match[1]}-${month}` }
function buildExecution(company: ResearchCompanyIdentity, asOf: string, outlooks: readonly ManagementOutlookCandidate[], kpis: readonly SegmentKpiPoint[], suppliedOutcomes: readonly ManagementOutcome[]): ManagementExecutionResult {
  const commitments: ManagementCommitment[] = outlooks.flatMap((candidate): readonly ManagementCommitment[] => { const unit = resolveUnit(candidate.rawUnit, candidate.evidenceSpan.exactText ?? ''); const range = parseNumericRange(candidate.rawNumericRange); const token = range === undefined ? parseNumericToken(candidate.rawNumericValue) : undefined; const period = resolveFiscalPeriod(candidate.rawFiscalPeriodText).fiscalPeriod; if (unit === undefined || period === undefined || !text(candidate.evidenceSpan.exactText)) return []; if (range !== undefined) return [{ id: candidate.candidateId, statement: candidate.evidenceSpan.exactText, speaker: 'management', publishedAt: candidate.publishedAt, targetMetric: candidate.metric ?? candidate.topic, targetPeriod: period, targetEndDate: periodEnd(period), targetType: 'numeric_range', targetUnit: unit.canonical, targetLow: range[0].value * unit.factor, targetHigh: range[1].value * unit.factor, sourceRefs: [candidate.sourceObjectId] }]; if (token === undefined || !['increase', 'improve', 'decrease', 'deteriorate'].includes(candidate.direction ?? '')) return []; const value = token.value * unit.factor; return [{ id: candidate.candidateId, statement: candidate.evidenceSpan.exactText, speaker: 'management', publishedAt: candidate.publishedAt, targetMetric: candidate.metric ?? candidate.topic, targetPeriod: period, targetEndDate: periodEnd(period), targetType: candidate.direction === 'increase' || candidate.direction === 'improve' ? 'numeric_at_least' : 'numeric_at_most', targetUnit: unit.canonical, ...(candidate.direction === 'increase' || candidate.direction === 'improve' ? { targetLow: value } : { targetHigh: value }), sourceRefs: [candidate.sourceObjectId] }] })
  const derivedOutcomes: ManagementOutcome[] = kpis.flatMap((point) => commitments.filter((commitment) => commitment.targetMetric === point.metric && commitment.targetPeriod === point.fiscalPeriod && commitment.targetUnit === point.unit).map((commitment) => ({ commitmentId: commitment.id, period: point.fiscalPeriod, observedAt: asOf, value: point.value, unit: point.unit, statement: `Observed ${point.metric} for ${point.segmentKey}`, sourceRefs: [...point.sourceCandidateIds] })))
  return assessManagementExecution({ companyRef: company.symbol, commitments, outcomes: [...suppliedOutcomes, ...derivedOutcomes], asOf })
}

function expectationInputs(extraction: ManagementCommunicationExtractionResult | undefined, fiscalYear: number, period: EarningsPeriod): Pick<ManagementCommunicationResearchResult, 'guidance' | 'currentGuidanceIds' | 'segmentKpiComparisons'> {
  if (extraction === undefined) return {}; const targetPeriod = `${fiscalYear}-${period}`; const guidances = extraction.guidance.filter((item) => item.fiscalPeriod === targetPeriod); const latestByKey = new Map<string, GuidanceRange>(); for (const item of guidances) { const key = `${item.metric}|${item.fiscalPeriod}`; const prior = latestByKey.get(key); if (prior === undefined || item.publishedAt > prior.publishedAt) latestByKey.set(key, item) }; const current = [...latestByKey.values()].sort((left, right) => left.guidanceId.localeCompare(right.guidanceId)); const kpis = extraction.segmentKpis.filter((item) => item.fiscalPeriod === targetPeriod); const segmentKpiComparisons: SegmentKpiDeltaInput[] = kpis.map((currentPoint) => { const prior = extraction.segmentKpis.filter((item) => item.segmentKey === currentPoint.segmentKey && item.metric === currentPoint.metric && item.unit === currentPoint.unit && item.fiscalPeriod !== currentPoint.fiscalPeriod).sort((left, right) => right.fiscalPeriod.localeCompare(left.fiscalPeriod))[0]; return prior === undefined ? { current: currentPoint } : { current: currentPoint, priorComparable: prior } }); return { guidance: extraction.guidance, currentGuidanceIds: current.map((item) => item.guidanceId), segmentKpiComparisons }
}

export async function resolveManagementCommunication(input: ResolveManagementCommunicationInput): Promise<ManagementCommunicationResearchResult> {
  const diagnostics: string[] = []; const callerExtraction = input.caller?.extraction; const automatic = callerExtraction === undefined ? await automaticallyExtract(input, diagnostics) : { extraction: undefined, sources: [], documentCount: 0, qaCount: 0, attempted: false }; const extraction = callerExtraction ?? automatic.extraction; if (extraction === undefined) diagnostics.push(input.sources === undefined ? 'MANAGEMENT_COMMUNICATION_INPUT_UNAVAILABLE' : 'MANAGEMENT_COMMUNICATION_EXTRACTION_UNAVAILABLE'); const comments = buildCommentary(extraction?.managementOutlookCandidates ?? []); const qaClusters = buildQaClusters(extraction?.structuredQaCandidates ?? []); const execution = buildExecution(input.company, input.analysisAsOf, extraction?.managementOutlookCandidates ?? [], extraction?.segmentKpis ?? [], input.caller?.executionOutcomes ?? []); const expectations = expectationInputs(extraction, input.fiscalYear, input.period); if (extraction?.diagnostics) diagnostics.push(...extraction.diagnostics); const status: ManagementCommunicationResearchResult['status'] = extraction === undefined ? automatic.attempted ? 'partial' : 'unavailable' : extraction.status === 'COMPLETE' && diagnostics.length === 0 ? 'available' : 'partial'; return { status, ...(extraction === undefined ? {} : { extraction }), sourceObjects: callerExtraction === undefined ? automatic.sources : sourceObjectsFromExtraction(callerExtraction), ...expectations, commentaryDeltas: comments, qaClusters, execution, diagnostics: unique(diagnostics), telemetry: { acquisitionAttempted: automatic.attempted, acquisitionDocumentCount: automatic.documentCount, acquisitionQaCount: automatic.qaCount, extractionCalls: extraction?.telemetry.calls ?? 0, extractedOutlookCount: extraction?.managementOutlookCandidates.length ?? 0, extractedQaCount: extraction?.structuredQaCandidates.length ?? 0, commentaryDeltaCount: comments.length, qaClusterCount: qaClusters.length, executionAssessmentCount: execution.assessments.length } }
}

function append(section: EarningsReviewSection, markdown: string, sourceCandidateIds: readonly string[]): EarningsReviewSection { return { ...section, markdown: `${section.markdown}${section.markdown.endsWith('\n') ? '' : '\n\n'}${markdown}`, sourceCandidateIds: unique([...section.sourceCandidateIds, ...sourceCandidateIds]) } }
function line(item: ManagementCommentaryDelta): string { return `${item.topic}${item.metric === undefined ? '' : ` (${item.metric})`}: ${item.status}${item.currentDirection === undefined ? '' : `; current=${item.currentDirection}`}${item.priorDirection === undefined ? '' : `; prior=${item.priorDirection}`}` }
export function enrichEarningsReviewSectionsWithManagementCommunication(sections: readonly EarningsReviewSection[], result: ManagementCommunicationResearchResult): readonly EarningsReviewSection[] {
  const commentary = result.commentaryDeltas.map(line); const qa = result.qaClusters.map((cluster) => `${cluster.topicTags.join(', ') || cluster.key}: ${cluster.members.map((member) => `${member.pairId}=${member.response.status}`).join(', ')}`); const execution = result.execution.assessments.map((item) => `${item.targetMetric} ${item.targetPeriod}: ${item.assessment}`).concat(result.execution.diagnostics.map((item) => `execution diagnostic: ${item}`)); const sourceIds = unique([...result.sourceObjects.map((source) => source.candidate.candidateId), ...result.commentaryDeltas.flatMap((item) => item.sourceCandidateIds), ...result.qaClusters.flatMap((item) => item.sourceCandidateIds), ...result.execution.assessments.flatMap((item) => item.sourceRefs)])
  return sections.map((section) => { if (section.title === 'Management Guidance' && commentary.length > 0) return append(section, `### Management commentary delta\n${commentary.map((item) => `- ${item}`).join('\n')}`, sourceIds); if (section.title === 'Changes vs Prior Research' && commentary.length > 0) return append(section, `### Management commentary changes\n${commentary.map((item) => `- ${item}`).join('\n')}`, sourceIds); if (section.title === 'Research Gaps / Monitoring' && (qa.length > 0 || execution.length > 0 || result.status !== 'available')) return append(section, `### Management communication monitoring\n${qa.length > 0 ? `${qa.map((item) => `- Q&A cluster: ${item}`).join('\n')}\n` : ''}${execution.length > 0 ? `${execution.map((item) => `- ${item}`).join('\n')}\n` : ''}${result.diagnostics.map((item) => `- diagnostic: ${item}`).join('\n')}`, sourceIds); return section })
}
