import type { RawEvidenceLocator, RawExtractionOutput, RawFormalGuidanceCandidate, RawKpiCandidate, RawManagementOutlookCandidate, RawStructuredQAEvidence, RawGuidanceType, OutlookDirection } from '../../skills/management-communication-extraction/contracts.ts'

export interface RawSchemaResult {
  readonly output?: RawExtractionOutput
  readonly diagnostics: readonly string[]
}

export function parseRawExtractionOutput(value: unknown): RawSchemaResult {
  if (!isRecord(value)) return { diagnostics: ['RAW_OUTPUT_NOT_OBJECT'] }
  const diagnostics: string[] = []
  const formalGuidanceCandidates = parseArray(value.formalGuidanceCandidates, 'formalGuidanceCandidates', parseFormalGuidance, diagnostics)
  const managementOutlookCandidates = parseArray(value.managementOutlookCandidates, 'managementOutlookCandidates', parseManagementOutlook, diagnostics)
  const kpiCandidates = parseArray(value.kpiCandidates, 'kpiCandidates', parseKpi, diagnostics)
  const structuredQaCandidates = parseArray(value.structuredQaCandidates, 'structuredQaCandidates', parseStructuredQa, diagnostics)
  if (diagnostics.length > 0) return { diagnostics: [...new Set(diagnostics)] }
  return { output: { formalGuidanceCandidates, managementOutlookCandidates, kpiCandidates, structuredQaCandidates }, diagnostics: [] }
}

function parseArray<T>(value: unknown, name: string, parser: (value: unknown, index: number) => { value?: T; diagnostic?: string }, diagnostics: string[]): readonly T[] {
  if (!Array.isArray(value)) {
    diagnostics.push(`${name}_MUST_BE_ARRAY`)
    return []
  }
  const result: T[] = []
  for (let index = 0; index < value.length; index += 1) {
    const parsed = parser(value[index], index)
    if (parsed.value === undefined) diagnostics.push(parsed.diagnostic ?? `${name}_${index}_INVALID`)
    else result.push(parsed.value)
  }
  return result
}

function parseFormalGuidance(value: unknown, index: number): { value?: RawFormalGuidanceCandidate; diagnostic?: string } {
  if (!isRecord(value) || !nonEmpty(value.metric) || !isGuidanceType(value.guidanceType) || !Array.isArray(value.qualifiers)) return { diagnostic: `formalGuidanceCandidates_${index}_SHAPE_INVALID` }
  const evidence = parseEvidence(value.evidence)
  if (evidence === undefined || value.qualifiers.some((item) => typeof item !== 'string')) return { diagnostic: `formalGuidanceCandidates_${index}_SHAPE_INVALID` }
  return { value: { metric: value.metric, guidanceType: value.guidanceType, qualifiers: value.qualifiers, evidence, ...optionalString(value, 'rawFiscalPeriodText'), ...optionalString(value, 'rawLow'), ...optionalString(value, 'rawHigh'), ...optionalString(value, 'rawPoint'), ...optionalString(value, 'rawUnit') } }
}

function parseManagementOutlook(value: unknown, index: number): { value?: RawManagementOutlookCandidate; diagnostic?: string } {
  if (!isRecord(value) || !nonEmpty(value.topic)) return { diagnostic: `managementOutlookCandidates_${index}_SHAPE_INVALID` }
  const evidence = parseEvidence(value.evidence)
  if (evidence === undefined || (value.direction !== undefined && !isDirection(value.direction))) return { diagnostic: `managementOutlookCandidates_${index}_SHAPE_INVALID` }
  return { value: { topic: value.topic, evidence, ...(value.direction === undefined ? {} : { direction: value.direction }), ...optionalString(value, 'metric'), ...optionalString(value, 'rawTimeHorizon'), ...optionalString(value, 'rawNumericValue'), ...optionalString(value, 'rawNumericRange'), ...optionalString(value, 'rawUnit'), ...optionalString(value, 'rawFiscalPeriodText') } }
}

function parseKpi(value: unknown, index: number): { value?: RawKpiCandidate; diagnostic?: string } {
  if (!isRecord(value) || !nonEmpty(value.metric) || !nonEmpty(value.rawValue)) return { diagnostic: `kpiCandidates_${index}_SHAPE_INVALID` }
  const evidence = parseEvidence(value.evidence)
  if (evidence === undefined) return { diagnostic: `kpiCandidates_${index}_SHAPE_INVALID` }
  return { value: { metric: value.metric, rawValue: value.rawValue, evidence, ...optionalString(value, 'rawSegmentLabel'), ...optionalString(value, 'rawProductLabel'), ...optionalString(value, 'rawFiscalPeriodText'), ...optionalString(value, 'rawUnit') } }
}

function parseStructuredQa(value: unknown, index: number): { value?: RawStructuredQAEvidence; diagnostic?: string } {
  if (!isRecord(value) || !nonEmpty(value.pairId) || !stringArray(value.topicTags) || !stringArray(value.explicitlyStatedMetrics)) return { diagnostic: `structuredQaCandidates_${index}_SHAPE_INVALID` }
  const claimSpans = locatorArray(value.claimSpans)
  const managementStatementSpans = locatorArray(value.managementStatementSpans)
  if (claimSpans === undefined || managementStatementSpans === undefined) return { diagnostic: `structuredQaCandidates_${index}_SHAPE_INVALID` }
  return { value: { pairId: value.pairId, topicTags: value.topicTags, claimSpans, managementStatementSpans, explicitlyStatedMetrics: value.explicitlyStatedMetrics, ...optionalString(value, 'rawReferencedProductOrSegment') } }
}

function parseEvidence(value: unknown): RawEvidenceLocator | undefined {
  if (!isRecord(value) || !nonEmpty(value.sourceObjectId)) return undefined
  const startOffset = value.startOffset
  const endOffset = value.endOffset
  if (startOffset !== undefined && (typeof startOffset !== 'number' || !Number.isInteger(startOffset) || startOffset < 0)) return undefined
  if (endOffset !== undefined && (typeof endOffset !== 'number' || !Number.isInteger(endOffset) || endOffset < 0)) return undefined
  if (value.exactText !== undefined && !nonEmpty(value.exactText)) return undefined
  return { sourceObjectId: value.sourceObjectId, ...(startOffset === undefined ? {} : { startOffset }), ...(endOffset === undefined ? {} : { endOffset }), ...optionalString(value, 'exactText') }
}

function locatorArray(value: unknown): readonly RawEvidenceLocator[] | undefined {
  if (!Array.isArray(value)) return undefined
  const result: RawEvidenceLocator[] = []
  for (const item of value) {
    const locator = parseEvidence(item)
    if (locator === undefined) return undefined
    result.push(locator)
  }
  return result
}

function optionalString(value: Readonly<Record<string, unknown>>, key: string): Readonly<Record<string, string>> { return value[key] === undefined ? {} : typeof value[key] === 'string' && value[key].trim() !== '' ? { [key]: value[key] } : {} }
function nonEmpty(value: unknown): value is string { return typeof value === 'string' && value.trim() !== '' }
function stringArray(value: unknown): value is readonly string[] { return Array.isArray(value) && value.every((item) => typeof item === 'string') }
function isRecord(value: unknown): value is Readonly<Record<string, unknown>> { return typeof value === 'object' && value !== null && !Array.isArray(value) }
function isGuidanceType(value: unknown): value is RawGuidanceType { return value === 'range' || value === 'minimum' || value === 'maximum' || value === 'point' || value === 'qualitative' }
function isDirection(value: unknown): value is OutlookDirection { return value === 'increase' || value === 'decrease' || value === 'stable' || value === 'improve' || value === 'deteriorate' || value === 'uncertain' }
