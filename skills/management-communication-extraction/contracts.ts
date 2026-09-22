import type { GuidanceRange, SegmentKpiPoint } from '../earnings-review/expectations/contracts.ts'

export const EXTRACTION_CONTRACT_VERSION = 'management-communication-extraction-v0.1' as const
export const EXTRACTION_OPERATION = 'management_communication_extract' as const

export type ExtractionLane = 'management_document' | 'exchange_qa' | 'statutory_disclosure'
export type CandidateFamily = 'formalGuidance' | 'managementOutlook' | 'kpi' | 'structuredQa'
export type SourceAuthority = 'S0_STATUTORY' | 'S1_OFFICIAL' | 'S2_PROFESSIONAL' | 'S3_AGGREGATOR' | 'S4_COMMUNITY'

export interface RawEvidenceLocator {
  readonly sourceObjectId: string
  readonly startOffset?: number
  readonly endOffset?: number
  readonly exactText?: string
}

export type RawGuidanceType = 'range' | 'minimum' | 'maximum' | 'point' | 'qualitative'

export interface RawFormalGuidanceCandidate {
  readonly metric: string
  readonly rawFiscalPeriodText?: string
  readonly guidanceType: RawGuidanceType
  readonly rawLow?: string
  readonly rawHigh?: string
  readonly rawPoint?: string
  readonly rawUnit?: string
  readonly qualifiers: readonly string[]
  readonly evidence: RawEvidenceLocator
}

export type OutlookDirection = 'increase' | 'decrease' | 'stable' | 'improve' | 'deteriorate' | 'uncertain'

export interface RawManagementOutlookCandidate {
  readonly topic: string
  readonly metric?: string
  readonly direction?: OutlookDirection
  readonly rawTimeHorizon?: string
  readonly rawNumericValue?: string
  readonly rawNumericRange?: string
  readonly rawUnit?: string
  readonly rawFiscalPeriodText?: string
  readonly evidence: RawEvidenceLocator
}

export interface RawKpiCandidate {
  readonly rawSegmentLabel?: string
  readonly rawProductLabel?: string
  readonly metric: string
  readonly rawFiscalPeriodText?: string
  readonly rawValue: string
  readonly rawUnit?: string
  readonly evidence: RawEvidenceLocator
}

export interface RawStructuredQAEvidence {
  readonly pairId: string
  readonly topicTags: readonly string[]
  readonly claimSpans: readonly RawEvidenceLocator[]
  readonly managementStatementSpans: readonly RawEvidenceLocator[]
  readonly rawReferencedProductOrSegment?: string
  readonly explicitlyStatedMetrics: readonly string[]
}

export interface RawExtractionOutput {
  readonly formalGuidanceCandidates: readonly RawFormalGuidanceCandidate[]
  readonly managementOutlookCandidates: readonly RawManagementOutlookCandidate[]
  readonly kpiCandidates: readonly RawKpiCandidate[]
  readonly structuredQaCandidates: readonly RawStructuredQAEvidence[]
}

export interface EvidenceSpan {
  readonly sourceObjectId: string
  readonly startOffset: number
  readonly endOffset: number
  readonly exactText?: string
}

export interface ValidatedCandidateMetadata {
  readonly candidateId: string
  readonly sourceObjectId: string
  readonly publishedAt: string
  readonly sourceAuthority: SourceAuthority
  readonly extractionContractVersion: typeof EXTRACTION_CONTRACT_VERSION
  readonly reasoningOperation: typeof EXTRACTION_OPERATION
  readonly evidenceSpan: EvidenceSpan
  readonly validationDiagnostics: readonly string[]
}

export interface FormalGuidanceCandidate extends ValidatedCandidateMetadata {
  readonly metric: string
  readonly fiscalPeriod?: string
  readonly rawFiscalPeriodText?: string
  readonly guidanceType: RawGuidanceType
  readonly rawLow?: string
  readonly rawHigh?: string
  readonly rawPoint?: string
  readonly rawUnit?: string
  readonly qualifiers: readonly string[]
}

export interface ManagementOutlookCandidate extends ValidatedCandidateMetadata {
  readonly topic: string
  readonly metric?: string
  readonly direction?: OutlookDirection
  readonly timeHorizon?: string
  readonly rawNumericValue?: string
  readonly rawNumericRange?: string
  readonly rawUnit?: string
  readonly rawFiscalPeriodText?: string
}

export interface KpiCandidate extends ValidatedCandidateMetadata {
  readonly rawSegmentLabel?: string
  readonly rawProductLabel?: string
  readonly metric: string
  readonly fiscalPeriod?: string
  readonly rawFiscalPeriodText?: string
  readonly rawValue: string
  readonly rawUnit?: string
}

export interface StructuredQAEvidence extends ValidatedCandidateMetadata {
  readonly pairId: string
  readonly question: string
  readonly answer: string
  readonly platform: 'SZSE_HUDONGYI' | 'SSE_EINTERACTION'
  readonly topicTags: readonly string[]
  readonly claimSpans: readonly EvidenceSpan[]
  readonly managementStatementSpans: readonly EvidenceSpan[]
  readonly referencedProductOrSegment?: string
  readonly explicitlyStatedMetrics: readonly string[]
}

export interface RawExtractionOutputContract {
  readonly type: 'object'
  readonly additionalProperties: false
  readonly required: readonly ['formalGuidanceCandidates', 'managementOutlookCandidates', 'kpiCandidates', 'structuredQaCandidates']
  readonly properties: Readonly<Record<string, unknown>>
}

export const RAW_EXTRACTION_OUTPUT_CONTRACT: RawExtractionOutputContract = {
  type: 'object',
  additionalProperties: false,
  required: ['formalGuidanceCandidates', 'managementOutlookCandidates', 'kpiCandidates', 'structuredQaCandidates'],
  properties: {
    formalGuidanceCandidates: { type: 'array', items: { type: 'object' } },
    managementOutlookCandidates: { type: 'array', items: { type: 'object' } },
    kpiCandidates: { type: 'array', items: { type: 'object' } },
    structuredQaCandidates: { type: 'array', items: { type: 'object' } },
  },
}

export interface ProjectedExtraction {
  readonly guidance: readonly GuidanceRange[]
  readonly segmentKpis: readonly SegmentKpiPoint[]
}

export const LANE_ALLOWED_FAMILIES: Readonly<Record<ExtractionLane, readonly CandidateFamily[]>> = {
  management_document: ['managementOutlook', 'kpi'],
  exchange_qa: ['managementOutlook', 'kpi', 'structuredQa'],
  statutory_disclosure: ['formalGuidance', 'kpi'],
}

export function extractionInstruction(lane: ExtractionLane): string {
  const allowed = LANE_ALLOWED_FAMILIES[lane].join(', ')
  return [
    'Identify only explicit semantic statements in the supplied source text.',
    `The source lane is ${lane}; allowed output families are: ${allowed}.`,
    'Never emit candidateId, publishedAt, authority, extraction version, canonical period, canonical unit, canonical value, segmentKey, productKey, midpoint, or echoed question/answer fields.',
    'Use sourceObjectId values from the supplied allowlist. Evidence offsets use JavaScript string indexing over the exact supplied sourceText; exactText must be bounded.',
    'Return exactly one JSON object with the four required arrays and no Markdown or explanatory text.',
  ].join('\n')
}
