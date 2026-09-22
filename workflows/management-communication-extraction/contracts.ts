import type { ExchangeQAPair, ManagementCommunicationDocument } from '../management-communication-acquisition/contracts.ts'
import type { NormalizedResearchSource } from '../../plugins/research-acquisition/contracts.ts'
import type { ReasoningExecutor } from '../../plugins/reasoning/contracts.ts'
import type { FormalGuidanceCandidate, KpiCandidate, ManagementOutlookCandidate, StructuredQAEvidence } from '../../skills/management-communication-extraction/contracts.ts'
import type { GuidanceRange, SegmentKpiPoint } from '../../skills/earnings-review/expectations/contracts.ts'

export type ExtractionSource =
  | { readonly lane: 'management_document'; readonly source: ManagementCommunicationDocument }
  | { readonly lane: 'exchange_qa'; readonly sources: readonly ExchangeQAPair[] }
  | { readonly lane: 'statutory_disclosure'; readonly source: NormalizedResearchSource }

export interface ManagementCommunicationExtractionInput {
  readonly analysisAsOf: string
  readonly source: ExtractionSource
  readonly reasoningExecutor?: ReasoningExecutor
  readonly maxQAPairsPerBatch?: number
  readonly segmentIdentityMap?: Readonly<Record<string, string>>
  readonly signal?: AbortSignal
}

export interface ExtractionTelemetry {
  readonly operation: 'management_communication_extract'
  readonly calls: number
  readonly repairCalls: number
  readonly inputUnits: number
  readonly rawCandidateCount: number
  readonly validatedCandidateCount: number
  readonly rejectedCandidateCount: number
  readonly projectedGuidanceCount: number
  readonly projectedSegmentKpiCount: number
}

export interface ManagementCommunicationExtractionResult {
  readonly status: 'COMPLETE' | 'PARTIAL' | 'UNAVAILABLE'
  readonly formalGuidanceCandidates: readonly FormalGuidanceCandidate[]
  readonly managementOutlookCandidates: readonly ManagementOutlookCandidate[]
  readonly kpiCandidates: readonly KpiCandidate[]
  readonly structuredQaCandidates: readonly StructuredQAEvidence[]
  readonly guidance: readonly GuidanceRange[]
  readonly segmentKpis: readonly SegmentKpiPoint[]
  readonly diagnostics: readonly string[]
  readonly telemetry: ExtractionTelemetry
}
