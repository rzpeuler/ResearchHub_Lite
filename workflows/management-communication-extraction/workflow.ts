import type { ReasoningExecutor, ReasoningRequest } from '../../plugins/reasoning/contracts.ts'
import { EXTRACTION_CONTRACT_VERSION, EXTRACTION_OPERATION, RAW_EXTRACTION_OUTPUT_CONTRACT, extractionInstruction, type ExtractionLane, type RawExtractionOutput, type FormalGuidanceCandidate, type ManagementOutlookCandidate, type KpiCandidate, type StructuredQAEvidence } from '../../skills/management-communication-extraction/contracts.ts'
import { parseRawExtractionOutput } from './schema.ts'
import { buildSourceContexts, validateRawOutput, type ReasoningSourceSlice, type SourceContext } from './validation.ts'
import { projectValidatedCandidates } from './projection.ts'
import { parseNumericRange, parseNumericToken } from './numeric-parsing.ts'
import { resolveUnit } from './unit-normalization.ts'
import type { ExtractionSource, ManagementCommunicationExtractionInput, ManagementCommunicationExtractionResult, ExtractionTelemetry } from './contracts.ts'

interface InputUnit {
  readonly unitId: string
  readonly sourceIds: readonly string[]
  readonly slices: readonly ReasoningSourceSlice[]
  readonly modelInput: Readonly<Record<string, unknown>>
}

interface InputUnitBuildResult {
  readonly units: readonly InputUnit[]
  readonly diagnostics: readonly string[]
}

interface UnitExecutionResult {
  readonly output?: RawExtractionOutput
  readonly diagnostics: readonly string[]
  readonly rawCandidateCount: number
  readonly repairCalls: number
  readonly rejectedCount: number
  readonly candidates: ReturnType<typeof validateRawOutput>['candidates']
}

interface MutableCandidates {
  readonly formalGuidanceCandidates: FormalGuidanceCandidate[]
  readonly managementOutlookCandidates: ManagementOutlookCandidate[]
  readonly kpiCandidates: KpiCandidate[]
  readonly structuredQaCandidates: StructuredQAEvidence[]
}

const DEFAULT_QA_BATCH_SIZE = 5
const MAX_INPUT_CHARS_FALLBACK = 6_000

export async function runManagementCommunicationExtraction(input: ManagementCommunicationExtractionInput): Promise<ManagementCommunicationExtractionResult> {
  const contextsResult = buildSourceContexts(input.source)
  const diagnostics = [...contextsResult.diagnostics]
  const telemetryBase: ExtractionTelemetry = { operation: EXTRACTION_OPERATION, calls: 0, repairCalls: 0, inputUnits: 0, rawCandidateCount: 0, validatedCandidateCount: 0, rejectedCandidateCount: 0, projectedGuidanceCount: 0, projectedSegmentKpiCount: 0 }
  if (contextsResult.contexts.length === 0) return unavailable(diagnostics.length > 0 ? diagnostics : ['SOURCE_INPUT_UNAVAILABLE'], telemetryBase)
  if (!isValidTimestamp(input.analysisAsOf)) return unavailable([...diagnostics, 'ANALYSIS_AS_OF_INVALID'], telemetryBase)
  if (input.reasoningExecutor === undefined) return unavailable([...diagnostics, 'STRUCTURED_EXTRACTION_UNAVAILABLE'], telemetryBase)
  if (!input.reasoningExecutor.capabilities().structuredOutputSupport) return unavailable([...diagnostics, 'STRUCTURED_OUTPUT_UNSUPPORTED'], telemetryBase)
  const builtUnits = buildInputUnits(input.source, contextsResult.contexts, input.reasoningExecutor.capabilities().maxContextTokens, input.maxQAPairsPerBatch)
  diagnostics.push(...builtUnits.diagnostics)
  const units = builtUnits.units
  if (units.length === 0) return unavailable([...diagnostics, 'NO_EXTRACTION_INPUT_UNITS'], { ...telemetryBase, inputUnits: 0 })
  const contextMap = new Map(contextsResult.contexts.map((context) => [context.sourceObjectId, context]))
  const allCandidates: MutableCandidates = { formalGuidanceCandidates: [], managementOutlookCandidates: [], kpiCandidates: [], structuredQaCandidates: [] }
  let calls = 0; let repairCalls = 0; let rawCandidateCount = 0; let rejectedCount = 0
  for (const unit of units) {
    if (input.signal?.aborted) { diagnostics.push('EXTRACTION_CANCELLED'); break }
    const unitContexts = new Map(unit.sourceIds.map((sourceId) => [sourceId, contextMap.get(sourceId)]).filter((entry): entry is [string, SourceContext] => entry[1] !== undefined))
    const result = await executeUnit(input.reasoningExecutor, input.source.lane, input.analysisAsOf, unit, unitContexts, input.signal)
    calls += result.repairCalls + (result.output === undefined && result.diagnostics.some((item) => item === 'REASONING_EXECUTION_FAILED') ? 1 : 1)
    repairCalls += result.repairCalls; rawCandidateCount += result.rawCandidateCount; rejectedCount += result.rejectedCount; diagnostics.push(...result.diagnostics)
    allCandidates.formalGuidanceCandidates.push(...result.candidates.formalGuidanceCandidates)
    allCandidates.managementOutlookCandidates.push(...result.candidates.managementOutlookCandidates)
    allCandidates.kpiCandidates.push(...result.candidates.kpiCandidates)
    allCandidates.structuredQaCandidates.push(...result.candidates.structuredQaCandidates)
  }
  const deduped = dedupeCandidates(allCandidates, diagnostics)
  const projectionCandidates = removeConflicts(deduped, diagnostics)
  const projection = projectValidatedCandidates(projectionCandidates.formalGuidanceCandidates, projectionCandidates.kpiCandidates, input.analysisAsOf, input.segmentIdentityMap)
  diagnostics.push(...projection.diagnostics)
  const validatedCandidateCount = deduped.formalGuidanceCandidates.length + deduped.managementOutlookCandidates.length + deduped.kpiCandidates.length + deduped.structuredQaCandidates.length
  const telemetry: ExtractionTelemetry = { operation: EXTRACTION_OPERATION, calls, repairCalls, inputUnits: units.length, rawCandidateCount, validatedCandidateCount, rejectedCandidateCount: rejectedCount, projectedGuidanceCount: projection.guidance.length, projectedSegmentKpiCount: projection.segmentKpis.length }
  const hasValid = validatedCandidateCount > 0
  const hasFailure = rejectedCount > 0 || diagnostics.some((item) => item.includes('INVALID') || item.includes('REJECTED') || item.includes('UNAVAILABLE') || item.includes('BLOCKED') || item.includes('CONFLICT') || item.includes('FAILED') || item.includes('NOT_') || item.includes('EXCEEDS_CONTEXT_BOUND'))
  return { status: hasFailure ? (hasValid ? 'PARTIAL' : 'UNAVAILABLE') : 'COMPLETE', formalGuidanceCandidates: deduped.formalGuidanceCandidates, managementOutlookCandidates: deduped.managementOutlookCandidates, kpiCandidates: deduped.kpiCandidates, structuredQaCandidates: deduped.structuredQaCandidates, guidance: projection.guidance, segmentKpis: projection.segmentKpis, diagnostics: [...new Set(diagnostics)].sort(), telemetry }
}

export const runManagementCommunicationExtractionWorkflow = runManagementCommunicationExtraction

async function executeUnit(executor: ReasoningExecutor, lane: ExtractionLane, analysisAsOf: string, unit: InputUnit, contexts: ReadonlyMap<string, SourceContext>, signal?: AbortSignal): Promise<UnitExecutionResult> {
  const request: ReasoningRequest = { operation: EXTRACTION_OPERATION, instruction: extractionInstruction(lane), input: { analysisAsOf, lane, ...unit.modelInput }, outputContract: RAW_EXTRACTION_OUTPUT_CONTRACT, metadata: { executionId: `d2-002-${unit.unitId}`, extractionContractVersion: EXTRACTION_CONTRACT_VERSION, sourceLane: lane } }
  let first: Awaited<ReturnType<ReasoningExecutor['execute']>>
  try { first = await executor.execute({ ...request, ...(signal === undefined ? {} : { metadata: { ...request.metadata, signal: signal.aborted ? 'aborted' : 'active' } }) }) } catch (error) { return emptyUnit(['REASONING_EXECUTION_FAILED', safeReason(error)], 0, 0) }
  let parsed = parseRawExtractionOutput(first.output)
  let repairCalls = 0
  if (parsed.output === undefined) {
    repairCalls = 1
    let repaired: Awaited<ReturnType<ReasoningExecutor['execute']>>
    try {
      repaired = await executor.execute({ ...request, instruction: `${request.instruction}\nThe prior output failed shape validation. Return the same semantic result with the exact required arrays and raw fields only. Do not repair semantic or evidence facts.`, input: { ...unit.modelInput, invalidOutput: truncate(first.rawOutput ?? first.output) }, metadata: { ...request.metadata, executionId: `d2-002-${unit.unitId}-repair`, repair: 'format' } })
    } catch (error) { return emptyUnit(['RAW_OUTPUT_SCHEMA_INVALID', ...parsed.diagnostics, 'REPAIR_EXECUTION_FAILED', safeReason(error)], 0, repairCalls) }
    parsed = parseRawExtractionOutput(repaired.output)
  }
  if (parsed.output === undefined) return emptyUnit(['RAW_OUTPUT_SCHEMA_INVALID', ...parsed.diagnostics], 0, repairCalls)
  const rawCandidateCount = countRaw(parsed.output)
  const validated = validateRawOutput(parsed.output, lane, contexts, analysisAsOf, new Map(unit.slices.map((slice) => [slice.sourceObjectId, slice])))
  return { output: parsed.output, diagnostics: validated.diagnostics, rawCandidateCount, repairCalls, rejectedCount: validated.rejectedCount, candidates: validated.candidates }
}

function buildInputUnits(source: ExtractionSource, contexts: readonly SourceContext[], maxContextTokens: number, maxQAPairsPerBatch = DEFAULT_QA_BATCH_SIZE): InputUnitBuildResult {
  const maxChars = Math.max(512, Math.min(MAX_INPUT_CHARS_FALLBACK * 10, Math.floor(Math.max(1, maxContextTokens) * 3)))
  if (source.lane === 'management_document' || source.lane === 'statutory_disclosure') {
    const context = contexts[0]
    if (context === undefined) return { units: [], diagnostics: [] }
    const units: InputUnit[] = []; const chunkSize = Math.max(1, maxChars)
    for (let start = 0, ordinal = 0; start < context.sourceText.length; start += chunkSize, ordinal += 1) {
      const text = context.sourceText.slice(start, Math.min(context.sourceText.length, start + chunkSize))
      const slice: ReasoningSourceSlice = { sourceObjectId: context.sourceObjectId, sourceText: text, absoluteStartOffset: start }
      units.push({ unitId: `${context.sourceObjectId}-${ordinal}`, sourceIds: [context.sourceObjectId], slices: [slice], modelInput: { sourceObjects: [{ sourceObjectId: context.sourceObjectId, sourceText: text, absoluteStartOffset: start, publishedAt: context.publishedAt, authority: context.authority }] } })
    }
    return { units, diagnostics: [] }
  }
  const configuredMaxItems = Number.isFinite(maxQAPairsPerBatch) ? maxQAPairsPerBatch : DEFAULT_QA_BATCH_SIZE
  const maxItems = Math.min(50, Math.max(1, Math.floor(configuredMaxItems)))
  const units: InputUnit[] = []; const diagnostics: string[] = []; let current: SourceContext[] = []; let currentChars = 0; let ordinal = 0
  const flush = () => {
    if (current.length === 0) return
    const slices = current.map((item): ReasoningSourceSlice => ({ sourceObjectId: item.sourceObjectId, sourceText: item.sourceText, absoluteStartOffset: 0 }))
    units.push({ unitId: `qa-batch-${ordinal++}`, sourceIds: current.map((item) => item.sourceObjectId), slices, modelInput: { sourceObjects: current.map((item) => ({ sourceObjectId: item.sourceObjectId, sourceText: item.sourceText, absoluteStartOffset: 0, publishedAt: item.publishedAt, authority: item.authority, pairId: item.pair?.id, platform: item.pair?.platform })) } })
    current = []; currentChars = 0
  }
  for (const context of contexts) {
    if (context.sourceText.length > maxChars) { flush(); diagnostics.push(`QA_PAIR_EXCEEDS_CONTEXT_BOUND:${context.sourceObjectId}`); continue }
    const nextChars = currentChars + context.sourceText.length
    if (current.length > 0 && (current.length >= maxItems || nextChars > maxChars)) flush()
    current.push(context); currentChars += context.sourceText.length
  }
  flush()
  return { units, diagnostics }
}

function dedupeCandidates(candidates: ReturnType<typeof validateRawOutput>['candidates'], diagnostics: string[]): ReturnType<typeof validateRawOutput>['candidates'] {
  const dedupe = <T extends { readonly candidateId: string }>(family: string, values: readonly T[]): readonly T[] => {
    const map = new Map<string, T>()
    for (const value of values) { if (map.has(value.candidateId)) diagnostics.push(`DUPLICATE_CANDIDATE:${family}:${value.candidateId}`); else map.set(value.candidateId, value) }
    return [...map.values()].sort((left, right) => left.candidateId.localeCompare(right.candidateId))
  }
  return { formalGuidanceCandidates: dedupe('formalGuidance', candidates.formalGuidanceCandidates), managementOutlookCandidates: dedupe('managementOutlook', candidates.managementOutlookCandidates), kpiCandidates: dedupe('kpi', candidates.kpiCandidates), structuredQaCandidates: dedupe('structuredQa', candidates.structuredQaCandidates) }
}

function removeConflicts(candidates: ReturnType<typeof validateRawOutput>['candidates'], diagnostics: string[]): ReturnType<typeof validateRawOutput>['candidates'] {
  const result = { formalGuidanceCandidates: [...candidates.formalGuidanceCandidates], managementOutlookCandidates: [...candidates.managementOutlookCandidates], kpiCandidates: [...candidates.kpiCandidates], structuredQaCandidates: [...candidates.structuredQaCandidates] }
  const bySemanticKey = new Map<string, { readonly candidateId: string; readonly value: string }[]>()
  const all = [
    ...result.formalGuidanceCandidates.map((item) => ({ family: 'formalGuidance', item })),
    ...result.managementOutlookCandidates.map((item) => ({ family: 'managementOutlook', item })),
    ...result.kpiCandidates.map((item) => ({ family: 'kpi', item })),
    ...result.structuredQaCandidates.map((item) => ({ family: 'structuredQa', item })),
  ]
  for (const { family, item } of all) {
    const key = semanticConflictKey(family, item)
    if (key === undefined) continue
    const value = semanticValueSignature(family, item)
    bySemanticKey.set(key, [...(bySemanticKey.get(key) ?? []), { candidateId: item.candidateId, value }])
  }
  const conflicts = new Set<string>()
  for (const [key, entries] of bySemanticKey) {
    const values = new Set(entries.map((entry) => entry.value))
    if (values.size > 1) { diagnostics.push(`CONFLICTING_CANDIDATES:${key}`); entries.forEach((entry) => conflicts.add(entry.candidateId)) }
  }
  return { formalGuidanceCandidates: result.formalGuidanceCandidates.filter((item) => !conflicts.has(item.candidateId)), managementOutlookCandidates: result.managementOutlookCandidates.filter((item) => !conflicts.has(item.candidateId)), kpiCandidates: result.kpiCandidates.filter((item) => !conflicts.has(item.candidateId)), structuredQaCandidates: result.structuredQaCandidates.filter((item) => !conflicts.has(item.candidateId)) }
}

function semanticConflictKey(family: string, item: FormalGuidanceCandidate | ManagementOutlookCandidate | KpiCandidate | StructuredQAEvidence): string | undefined {
  const span = `${item.evidenceSpan.sourceObjectId}:${item.evidenceSpan.startOffset}:${item.evidenceSpan.endOffset}`
  const text = (value: string | undefined): string => (value ?? '').trim().toLocaleLowerCase()
  const unit = (rawUnit: string | undefined, evidence: string | undefined): string => resolveUnit(rawUnit, evidence ?? '')?.canonical ?? text(rawUnit)
  if (family === 'formalGuidance') {
    const candidate = item as FormalGuidanceCandidate
    return `formalGuidance:${span}:${text(candidate.metric)}:${candidate.fiscalPeriod ?? text(candidate.rawFiscalPeriodText)}:${candidate.guidanceType}:${unit(candidate.rawUnit, candidate.evidenceSpan.exactText)}`
  }
  if (family === 'kpi') {
    const candidate = item as KpiCandidate
    return `kpi:${span}:${text(candidate.metric)}:${text(candidate.rawSegmentLabel)}:${text(candidate.rawProductLabel)}:${candidate.fiscalPeriod ?? text(candidate.rawFiscalPeriodText)}:${unit(candidate.rawUnit, candidate.evidenceSpan.exactText)}`
  }
  if (family === 'managementOutlook') {
    const candidate = item as ManagementOutlookCandidate
    return `managementOutlook:${span}:${text(candidate.topic)}:${text(candidate.metric)}:${text(candidate.timeHorizon)}`
  }
  return undefined
}

function semanticValueSignature(family: string, item: FormalGuidanceCandidate | ManagementOutlookCandidate | KpiCandidate | StructuredQAEvidence): string {
  const number = (raw: string | undefined, unitRaw: string | undefined, evidence: string | undefined): string => {
    const parsed = parseNumericToken(raw)
    if (parsed === undefined) return textValue(raw)
    const unit = resolveUnit(unitRaw, evidence ?? '')
    return `number:${parsed.value * (unit?.factor ?? 1)}`
  }
  const textValue = (value: string | undefined): string => (value ?? '').trim().toLocaleLowerCase()
  if (family === 'formalGuidance') {
    const candidate = item as FormalGuidanceCandidate
    if (candidate.guidanceType === 'range') return `range:${number(candidate.rawLow, candidate.rawUnit, candidate.evidenceSpan.exactText)}:${number(candidate.rawHigh, candidate.rawUnit, candidate.evidenceSpan.exactText)}`
    if (candidate.guidanceType === 'point') return number(candidate.rawPoint, candidate.rawUnit, candidate.evidenceSpan.exactText)
    if (candidate.guidanceType === 'minimum') return `minimum:${number(candidate.rawLow, candidate.rawUnit, candidate.evidenceSpan.exactText)}`
    if (candidate.guidanceType === 'maximum') return `maximum:${number(candidate.rawHigh, candidate.rawUnit, candidate.evidenceSpan.exactText)}`
    return `qualitative:${candidate.qualifiers.map(textValue).sort().join('|')}`
  }
  if (family === 'kpi') {
    const candidate = item as KpiCandidate
    const range = parseNumericRange(candidate.rawValue)
    return range === undefined ? number(candidate.rawValue, candidate.rawUnit, candidate.evidenceSpan.exactText) : `range:${number(range[0].rawToken, candidate.rawUnit, candidate.evidenceSpan.exactText)}:${number(range[1].rawToken, candidate.rawUnit, candidate.evidenceSpan.exactText)}`
  }
  if (family === 'managementOutlook') {
    const candidate = item as ManagementOutlookCandidate
    const range = parseNumericRange(candidate.rawNumericRange)
    const numeric = range === undefined ? number(candidate.rawNumericValue, candidate.rawUnit, candidate.evidenceSpan.exactText) : `range:${number(range[0].rawToken, candidate.rawUnit, candidate.evidenceSpan.exactText)}:${number(range[1].rawToken, candidate.rawUnit, candidate.evidenceSpan.exactText)}`
    return `${textValue(candidate.direction)}:${numeric}`
  }
  return ''
}

function countRaw(output: RawExtractionOutput): number { return output.formalGuidanceCandidates.length + output.managementOutlookCandidates.length + output.kpiCandidates.length + output.structuredQaCandidates.length }
function emptyUnit(diagnostics: readonly string[], rawCandidateCount: number, repairCalls: number): UnitExecutionResult { return { diagnostics, rawCandidateCount, repairCalls, rejectedCount: rawCandidateCount, candidates: { formalGuidanceCandidates: [], managementOutlookCandidates: [], kpiCandidates: [], structuredQaCandidates: [] } } }
function unavailable(diagnostics: readonly string[], telemetry: ExtractionTelemetry): ManagementCommunicationExtractionResult { return { status: 'UNAVAILABLE', formalGuidanceCandidates: [], managementOutlookCandidates: [], kpiCandidates: [], structuredQaCandidates: [], guidance: [], segmentKpis: [], diagnostics: [...new Set(diagnostics)].sort(), telemetry } }
function isValidTimestamp(value: string): boolean { return Number.isFinite(Date.parse(value)) }
function truncate(value: unknown): string { return String(value ?? '').slice(0, 50_000) }
function safeReason(error: unknown): string { return error instanceof Error ? error.message.slice(0, 240) : String(error).slice(0, 240) }
