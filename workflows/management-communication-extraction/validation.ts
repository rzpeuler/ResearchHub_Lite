import type { ExchangeQAPair, ManagementCommunicationDocument } from '../management-communication-acquisition/contracts.ts'
import { sha256 } from '../../plugins/research-acquisition/hash.ts'
import type { RawEvidenceLocator, RawExtractionOutput, RawFormalGuidanceCandidate, RawKpiCandidate, RawManagementOutlookCandidate, RawStructuredQAEvidence, EvidenceSpan, FormalGuidanceCandidate, KpiCandidate, ManagementOutlookCandidate, StructuredQAEvidence, CandidateFamily, ExtractionLane, SourceAuthority } from '../../skills/management-communication-extraction/contracts.ts'
import { resolveFiscalPeriod } from './period-normalization.ts'
import { numericTokenInText, parseNumericRange, parseNumericToken } from './numeric-parsing.ts'
import { findUnit, resolveUnit } from './unit-normalization.ts'
import type { ExtractionSource } from './contracts.ts'

export interface SourceContext {
  readonly sourceObjectId: string
  readonly sourceText: string
  readonly publishedAt: string
  readonly authority: SourceAuthority
  readonly lane: ExtractionLane
  readonly pair?: ExchangeQAPair
}

export interface SourceContextResult {
  readonly contexts: readonly SourceContext[]
  readonly diagnostics: readonly string[]
}

export interface CandidateValidationResult<T> {
  readonly candidate?: T
  readonly diagnostics: readonly string[]
}

export function buildSourceContexts(source: ExtractionSource): SourceContextResult {
  if (source.lane === 'management_document') return managementDocumentContext(source.source)
  if (source.lane === 'statutory_disclosure') return statutoryContext(source.source)
  return exchangeQaContexts(source.sources)
}

export function validateFormalGuidance(raw: RawFormalGuidanceCandidate, context: ReadonlyMap<string, SourceContext>, analysisAsOf: string): CandidateValidationResult<FormalGuidanceCandidate> {
  const source = context.get(raw.evidence.sourceObjectId)
  if (source === undefined) return rejected('SOURCE_OBJECT_NOT_IN_REQUEST')
  if (source.lane !== 'statutory_disclosure' || source.authority !== 'S0_STATUTORY') return rejected('FORMAL_GUIDANCE_REQUIRES_STATUTORY_SOURCE')
  const span = resolveEvidence(raw.evidence, source, context)
  if (span.error !== undefined) return rejected(span.error)
  const diagnostics = [...sourcePitDiagnostics(source, analysisAsOf)]
  if (diagnostics.length > 0) return rejected(...diagnostics)
  const period = resolveFiscalPeriod(raw.rawFiscalPeriodText)
  if (period.diagnostic !== undefined) diagnostics.push(period.diagnostic)
  const numeric = guidanceNumeric(raw, span.value!.exactText!, diagnostics)
  if (!numeric.valid) return rejected(...diagnostics, numeric.diagnostic ?? 'GUIDANCE_NUMERIC_INVALID')
  const unit = numeric.numeric ? resolveUnit(raw.rawUnit, span.value!.exactText!) : undefined
  if (numeric.numeric && raw.rawUnit !== undefined && !span.value!.exactText!.includes(raw.rawUnit)) return rejected(...diagnostics, 'UNIT_TOKEN_NOT_IN_EVIDENCE')
  if (numeric.numeric && unit === undefined) diagnostics.push('UNIT_UNAVAILABLE_FOR_PROJECTION')
  const candidateId = stableCandidateId('formalGuidance', raw, span.value!, period.fiscalPeriod)
  return { candidate: { candidateId, sourceObjectId: source.sourceObjectId, publishedAt: source.publishedAt, sourceAuthority: source.authority, extractionContractVersion: 'management-communication-extraction-v0.1', reasoningOperation: 'management_communication_extract', evidenceSpan: span.value!, validationDiagnostics: uniqueSorted(diagnostics), metric: raw.metric.trim(), fiscalPeriod: period.fiscalPeriod, rawFiscalPeriodText: raw.rawFiscalPeriodText, guidanceType: raw.guidanceType, rawLow: raw.rawLow, rawHigh: raw.rawHigh, rawPoint: raw.rawPoint, rawUnit: unit?.source ?? raw.rawUnit, qualifiers: raw.qualifiers.map((item) => item.trim()).filter(Boolean) }, diagnostics: uniqueSorted(diagnostics) }
}

export function validateManagementOutlook(raw: RawManagementOutlookCandidate, context: ReadonlyMap<string, SourceContext>, analysisAsOf: string): CandidateValidationResult<ManagementOutlookCandidate> {
  const source = context.get(raw.evidence.sourceObjectId)
  if (source === undefined) return rejected('SOURCE_OBJECT_NOT_IN_REQUEST')
  if (source.lane === 'statutory_disclosure') return rejected('OUTLOOK_SOURCE_LANE_INVALID')
  const span = resolveEvidence(raw.evidence, source, context)
  if (span.error !== undefined) return rejected(span.error)
  const diagnostics = [...sourcePitDiagnostics(source, analysisAsOf)]
  if (diagnostics.length > 0) return rejected(...diagnostics)
  for (const value of [raw.rawNumericValue, raw.rawNumericRange]) if (value !== undefined && !numericTokenInText(value, span.value!.exactText!)) return rejected(...diagnostics, 'NUMERIC_TOKEN_NOT_IN_EVIDENCE')
  if (raw.rawUnit !== undefined && !span.value!.exactText!.includes(raw.rawUnit)) return rejected(...diagnostics, 'UNIT_TOKEN_NOT_IN_EVIDENCE')
  const period = raw.rawFiscalPeriodText === undefined ? {} : resolveFiscalPeriod(raw.rawFiscalPeriodText)
  if (period.diagnostic !== undefined) diagnostics.push(period.diagnostic)
  const candidateId = stableCandidateId('managementOutlook', raw, span.value!, period.fiscalPeriod)
  return { candidate: { candidateId, sourceObjectId: source.sourceObjectId, publishedAt: source.publishedAt, sourceAuthority: source.authority, extractionContractVersion: 'management-communication-extraction-v0.1', reasoningOperation: 'management_communication_extract', evidenceSpan: span.value!, validationDiagnostics: uniqueSorted(diagnostics), topic: raw.topic.trim(), metric: raw.metric?.trim(), direction: raw.direction, timeHorizon: raw.rawTimeHorizon, rawNumericValue: raw.rawNumericValue, rawNumericRange: raw.rawNumericRange, rawUnit: raw.rawUnit, rawFiscalPeriodText: raw.rawFiscalPeriodText }, diagnostics: uniqueSorted(diagnostics) }
}

export function validateKpi(raw: RawKpiCandidate, context: ReadonlyMap<string, SourceContext>, analysisAsOf: string): CandidateValidationResult<KpiCandidate> {
  const source = context.get(raw.evidence.sourceObjectId)
  if (source === undefined) return rejected('SOURCE_OBJECT_NOT_IN_REQUEST')
  const span = resolveEvidence(raw.evidence, source, context)
  if (span.error !== undefined) return rejected(span.error)
  const diagnostics = [...sourcePitDiagnostics(source, analysisAsOf)]
  if (diagnostics.length > 0) return rejected(...diagnostics)
  if (!numericTokenInText(raw.rawValue, span.value!.exactText!)) return rejected(...diagnostics, 'NUMERIC_TOKEN_NOT_IN_EVIDENCE')
  if (parseNumericToken(raw.rawValue) === undefined) return rejected(...diagnostics, 'NUMERIC_VALUE_INVALID')
  if (parseNumericRange(raw.rawValue) !== undefined) diagnostics.push('KPI_RANGE_NOT_PROJECTABLE')
  if (raw.rawUnit !== undefined && !span.value!.exactText!.includes(raw.rawUnit)) return rejected(...diagnostics, 'UNIT_TOKEN_NOT_IN_EVIDENCE')
  if (raw.rawUnit !== undefined && findUnit(raw.rawUnit) === undefined) diagnostics.push('UNKNOWN_UNIT')
  else if (raw.rawUnit === undefined && resolveUnit(undefined, span.value!.exactText!) === undefined) diagnostics.push('UNIT_UNAVAILABLE_FOR_PROJECTION')
  const period = raw.rawFiscalPeriodText === undefined ? {} : resolveFiscalPeriod(raw.rawFiscalPeriodText)
  if (period.diagnostic !== undefined) diagnostics.push(period.diagnostic)
  const candidateId = stableCandidateId('kpi', raw, span.value!, period.fiscalPeriod)
  return { candidate: { candidateId, sourceObjectId: source.sourceObjectId, publishedAt: source.publishedAt, sourceAuthority: source.authority, extractionContractVersion: 'management-communication-extraction-v0.1', reasoningOperation: 'management_communication_extract', evidenceSpan: span.value!, validationDiagnostics: uniqueSorted(diagnostics), rawSegmentLabel: raw.rawSegmentLabel, rawProductLabel: raw.rawProductLabel, metric: raw.metric.trim(), fiscalPeriod: period.fiscalPeriod, rawFiscalPeriodText: raw.rawFiscalPeriodText, rawValue: raw.rawValue, rawUnit: raw.rawUnit }, diagnostics: uniqueSorted(diagnostics) }
}

export function validateStructuredQa(raw: RawStructuredQAEvidence, context: ReadonlyMap<string, SourceContext>, analysisAsOf: string): CandidateValidationResult<StructuredQAEvidence> {
  const source = context.get(raw.pairId)
  if (source === undefined || source.pair === undefined || source.lane !== 'exchange_qa') return rejected('Q_AND_A_PAIR_NOT_IN_REQUEST')
  const locators = [...raw.claimSpans, ...raw.managementStatementSpans]
  if (locators.length === 0) return rejected('QA_EVIDENCE_SPAN_REQUIRED')
  const spans: EvidenceSpan[] = []
  const diagnostics = [...sourcePitDiagnostics(source, analysisAsOf)]
  if (diagnostics.length > 0) return rejected(...diagnostics)
  for (const locator of locators) {
    if (locator.sourceObjectId !== raw.pairId) return rejected(...diagnostics, 'QA_PAIR_ID_SPAN_MISMATCH')
    const resolved = resolveEvidence(locator, source, context)
    if (resolved.error !== undefined) return rejected(...diagnostics, resolved.error)
    spans.push(resolved.value!)
  }
  const claimCount = raw.claimSpans.length
  const candidateId = stableCandidateId('structuredQa', raw, spans[0]!, undefined)
  return { candidate: { candidateId, sourceObjectId: source.sourceObjectId, publishedAt: source.publishedAt, sourceAuthority: source.authority, extractionContractVersion: 'management-communication-extraction-v0.1', reasoningOperation: 'management_communication_extract', evidenceSpan: spans[0]!, validationDiagnostics: uniqueSorted(diagnostics), pairId: raw.pairId, question: source.pair.question, answer: source.pair.answer, platform: source.pair.platform, topicTags: raw.topicTags.map((item) => item.trim()).filter(Boolean), claimSpans: spans.slice(0, claimCount), managementStatementSpans: spans.slice(claimCount), referencedProductOrSegment: raw.rawReferencedProductOrSegment, explicitlyStatedMetrics: raw.explicitlyStatedMetrics.map((item) => item.trim()).filter(Boolean) }, diagnostics: uniqueSorted(diagnostics) }
}

export function validateRawOutput(output: RawExtractionOutput, lane: ExtractionLane, contexts: ReadonlyMap<string, SourceContext>, analysisAsOf: string): { readonly candidates: { readonly formalGuidanceCandidates: readonly FormalGuidanceCandidate[]; readonly managementOutlookCandidates: readonly ManagementOutlookCandidate[]; readonly kpiCandidates: readonly KpiCandidate[]; readonly structuredQaCandidates: readonly StructuredQAEvidence[] }; readonly diagnostics: readonly string[]; readonly rejectedCount: number } {
  const formalGuidanceCandidates: FormalGuidanceCandidate[] = []; const managementOutlookCandidates: ManagementOutlookCandidate[] = []; const kpiCandidates: KpiCandidate[] = []; const structuredQaCandidates: StructuredQAEvidence[] = []; const diagnostics: string[] = []; let rejectedCount = 0
  const accept = <T>(family: CandidateFamily, raw: T, validator: (value: T) => CandidateValidationResult<unknown>, target: unknown[]): void => {
    const allowed = lane === 'statutory_disclosure' ? family === 'formalGuidance' || family === 'kpi' : lane === 'management_document' ? family === 'managementOutlook' || family === 'kpi' : family !== 'formalGuidance'
    if (!allowed) { diagnostics.push(`FORBIDDEN_FAMILY:${family}`); rejectedCount += 1; return }
    const result = validator(raw)
    if (result.candidate === undefined) { diagnostics.push(...result.diagnostics.map((item) => `${family}:${item}`)); rejectedCount += 1; return }
    target.push(result.candidate); diagnostics.push(...result.diagnostics.map((item) => `${family}:${item}`))
  }
  for (const raw of output.formalGuidanceCandidates) accept('formalGuidance', raw, (value) => validateFormalGuidance(value, contexts, analysisAsOf), formalGuidanceCandidates)
  for (const raw of output.managementOutlookCandidates) accept('managementOutlook', raw, (value) => validateManagementOutlook(value, contexts, analysisAsOf), managementOutlookCandidates)
  for (const raw of output.kpiCandidates) accept('kpi', raw, (value) => validateKpi(value, contexts, analysisAsOf), kpiCandidates)
  for (const raw of output.structuredQaCandidates) accept('structuredQa', raw, (value) => validateStructuredQa(value, contexts, analysisAsOf), structuredQaCandidates)
  return { candidates: { formalGuidanceCandidates, managementOutlookCandidates, kpiCandidates, structuredQaCandidates }, diagnostics: uniqueSorted(diagnostics), rejectedCount }
}

function managementDocumentContext(document: ManagementCommunicationDocument): SourceContextResult {
  return validContext([{ sourceObjectId: document.id, sourceText: document.content, publishedAt: document.publishedAt, authority: document.source.authority, lane: 'management_document' }])
}

function statutoryContext(source: { readonly candidate: { readonly candidateId: string; readonly kind: string; readonly tier: number; readonly publishedAt?: string; readonly metadata?: Readonly<Record<string, unknown>> }; readonly content: string }): SourceContextResult {
  const diagnostics: string[] = []
  if (source.candidate.kind !== 'official_disclosure' || source.candidate.tier !== 1) diagnostics.push('STATUTORY_SOURCE_MUST_BE_OFFICIAL_TIER_1')
  if (source.candidate.publishedAt === undefined) diagnostics.push('STATUTORY_SOURCE_PUBLISHED_AT_REQUIRED')
  const metadata = source.candidate.metadata
  if (typeof metadata?.companySymbol !== 'string' && typeof metadata?.issuer !== 'string') diagnostics.push('STATUTORY_SOURCE_COMPANY_ATTRIBUTION_REQUIRED')
  if (diagnostics.length > 0) return { contexts: [], diagnostics }
  return validContext([{ sourceObjectId: source.candidate.candidateId, sourceText: source.content, publishedAt: source.candidate.publishedAt!, authority: 'S0_STATUTORY', lane: 'statutory_disclosure' }])
}

function exchangeQaContexts(pairs: readonly ExchangeQAPair[]): SourceContextResult {
  const contexts: SourceContext[] = []; const seen = new Set<string>(); const diagnostics: string[] = []
  for (const pair of pairs) {
    if (seen.has(pair.id)) { diagnostics.push(`DUPLICATE_QA_PAIR_ID:${pair.id}`); continue }
    seen.add(pair.id); contexts.push({ sourceObjectId: pair.id, sourceText: `${pair.question}\n${pair.answer}`, publishedAt: pair.publishedAt, authority: pair.source.authority, lane: 'exchange_qa', pair })
  }
  const valid = validContext(contexts)
  return { contexts: valid.contexts, diagnostics: uniqueSorted([...diagnostics, ...valid.diagnostics]) }
}

function validContext(contexts: readonly SourceContext[]): SourceContextResult {
  const diagnostics: string[] = []
  for (const source of contexts) {
    if (source.sourceText.trim() === '') diagnostics.push(`SOURCE_TEXT_EMPTY:${source.sourceObjectId}`)
    if (!Number.isFinite(Date.parse(source.publishedAt))) diagnostics.push(`SOURCE_PUBLISHED_AT_INVALID:${source.sourceObjectId}`)
  }
  return { contexts: diagnostics.some((item) => item.includes('SOURCE_TEXT_EMPTY') || item.includes('SOURCE_PUBLISHED_AT_INVALID')) ? [] : contexts, diagnostics }
}

function sourcePitDiagnostics(source: SourceContext, analysisAsOf: string): readonly string[] {
  const published = Date.parse(source.publishedAt); const cutoff = Date.parse(analysisAsOf)
  if (!Number.isFinite(published)) return ['PUBLISHED_AT_INVALID']
  if (!Number.isFinite(cutoff)) return ['ANALYSIS_AS_OF_INVALID']
  return published > cutoff ? ['FUTURE_SOURCE_REJECTED'] : []
}

function resolveEvidence(locator: RawEvidenceLocator, source: SourceContext, all: ReadonlyMap<string, SourceContext>): { readonly value?: EvidenceSpan; readonly error?: string } {
  if (all.get(locator.sourceObjectId) !== source) return { error: 'SOURCE_BINDING_MISMATCH' }
  const hasStart = locator.startOffset !== undefined; const hasEnd = locator.endOffset !== undefined
  if (hasStart !== hasEnd) return { error: 'EVIDENCE_OFFSETS_INCOMPLETE' }
  let start: number; let end: number
  if (hasStart && hasEnd) {
    start = locator.startOffset!; end = locator.endOffset!
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start || end > source.sourceText.length) return { error: 'EVIDENCE_OFFSETS_OUT_OF_RANGE' }
    if (locator.exactText !== undefined && source.sourceText.slice(start, end) !== locator.exactText) return { error: 'EVIDENCE_EXACT_TEXT_MISMATCH' }
  } else {
    if (locator.exactText === undefined) return { error: 'EVIDENCE_LOCATOR_REQUIRED' }
    start = source.sourceText.indexOf(locator.exactText); end = start + locator.exactText.length
    if (start < 0) return { error: 'EVIDENCE_EXACT_TEXT_NOT_FOUND' }
    if (source.sourceText.indexOf(locator.exactText, start + 1) >= 0) return { error: 'EVIDENCE_EXACT_TEXT_AMBIGUOUS' }
  }
  if (start === end) return { error: 'EVIDENCE_SPAN_EMPTY' }
  return { value: { sourceObjectId: source.sourceObjectId, startOffset: start, endOffset: end, exactText: source.sourceText.slice(start, end) } }
}

function guidanceNumeric(raw: RawFormalGuidanceCandidate, text: string, diagnostics: string[]): { readonly valid: boolean; readonly numeric: boolean; readonly diagnostic?: string } {
  if (raw.guidanceType === 'qualitative') return { valid: raw.qualifiers.length > 0, numeric: false, diagnostic: raw.qualifiers.length === 0 ? 'QUALITATIVE_QUALIFIER_REQUIRED' : undefined }
  const value = raw.guidanceType === 'range' ? [raw.rawLow, raw.rawHigh] : raw.guidanceType === 'minimum' ? [raw.rawLow] : raw.guidanceType === 'maximum' ? [raw.rawHigh] : [raw.rawPoint]
  if (value.some((item) => item === undefined || parseNumericToken(item) === undefined)) return { valid: false, numeric: true, diagnostic: 'GUIDANCE_NUMERIC_ENDPOINT_REQUIRED' }
  if (value.some((item) => !numericTokenInText(item, text))) return { valid: false, numeric: true, diagnostic: 'NUMERIC_TOKEN_NOT_IN_EVIDENCE' }
  if (raw.guidanceType === 'range' && parseNumericRange(`${raw.rawLow}-${raw.rawHigh}`) === undefined) diagnostics.push('GUIDANCE_RANGE_PARSE_DEFERRED_TO_PROJECTION')
  return { valid: true, numeric: true }
}

function stableCandidateId(family: CandidateFamily, raw: object, span: EvidenceSpan, period: string | undefined): string {
  return `d2-002-${family}-${sha256(JSON.stringify({ version: 'management-communication-extraction-v0.1', family, raw, span: [span.sourceObjectId, span.startOffset, span.endOffset], period })) .slice(0, 32)}`
}

function rejected<T>(...diagnostics: string[]): CandidateValidationResult<T> { return { diagnostics: uniqueSorted(diagnostics) } }
function uniqueSorted(values: readonly string[]): readonly string[] { return [...new Set(values.filter((value) => value.trim() !== ''))].sort() }
