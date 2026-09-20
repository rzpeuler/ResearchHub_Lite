import type { ActualVsExpectationResult, EstimateRevisionResult, GuidanceRange, GuidanceRevisionResult, GuidanceVsConsensusResult, SegmentKpiDeltaResult } from '../../skills/earnings-review/expectations/contracts.ts'

export interface SourcedActualExpectationComparison { readonly result: ActualVsExpectationResult; readonly sourceCandidateIds: readonly string[]; readonly institutionKey?: string }
export interface SourcedEstimateRevision { readonly result: EstimateRevisionResult; readonly sourceCandidateIds: readonly string[] }
export interface SourcedGuidanceRevision { readonly result: GuidanceRevisionResult; readonly sourceCandidateIds: readonly string[] }
export interface SourcedGuidanceConsensusComparison { readonly result: GuidanceVsConsensusResult; readonly sourceCandidateIds: readonly string[] }
export interface SourcedSegmentKpiDelta { readonly result: SegmentKpiDeltaResult; readonly sourceCandidateIds: readonly string[] }

export interface EarningsExpectationAnalysis {
  readonly consensusStatus: 'available' | 'unavailable'
  readonly actualVsConsensus: readonly SourcedActualExpectationComparison[]
  readonly actualVsPriorEstimate: readonly SourcedActualExpectationComparison[]
  readonly estimateRevisions: readonly SourcedEstimateRevision[]
  readonly guidanceRevisions: readonly SourcedGuidanceRevision[]
  readonly guidanceVsConsensus: readonly SourcedGuidanceConsensusComparison[]
  readonly segmentKpiDeltas: readonly SourcedSegmentKpiDelta[]
  readonly currentGuidance: readonly GuidanceRange[]
  readonly diagnostics: readonly string[]
}

export interface EarningsExpectationIntegrationInput {
  readonly analysisAsOf: string
  readonly resultPublishedAt?: string
  readonly actualMetrics: readonly import('../../skills/earnings-review/financials.ts').VerifiedFinancialMetric[]
  readonly expectations?: import('./contracts.ts').EarningsReviewExpectationsBundle
}

export interface ExpectationReportEnrichmentInput {
  readonly sections: readonly import('../../skills/earnings-review/contracts.ts').EarningsReviewSection[]
  readonly analysis: EarningsExpectationAnalysis
}
