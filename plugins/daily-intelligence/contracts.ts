import type { ResearchAcquisitionPlugin, ResearchCompanyIdentity, ResearchSourceCandidate } from '../research-acquisition/contracts.ts'

export type DailyBriefType = 'morning' | 'evening'
export type DailySignalKind = 'news' | 'announcement' | 'institutional_view' | 'market' | 'community' | 'social_attention'
export type DailySignalCategory = 'announcement' | 'earnings' | 'performance_forecast' | 'investor_relations' | 'institutional_research' | 'management_guidance' | 'macro' | 'market' | 'community' | 'technology' | 'industry' | 'news'
export type DailyProviderStatus = 'succeeded' | 'empty' | 'blocked' | 'failed'
export type DailyCatalogRole = 'identity' | 'active_feed' | 'discovery_source' | 'reference_only'
export type DailyOperationalStatus = 'active' | 'blocked' | 'metadata_only' | 'experimental'

export interface DailySourceAccount {
  readonly platform: string
  readonly accountId: string
  readonly displayName: string
  readonly category: 'official' | 'institution' | 'analyst' | 'industry_expert' | 'professional_media' | 'community'
  readonly focusTags: readonly string[]
  readonly reliabilityTier: 1 | 2 | 3 | 4 | 5
  readonly signalQuality: 'high' | 'medium' | 'low'
  readonly acquisitionMode: string
  readonly evidenceUrl: string
  readonly enabled: boolean
  readonly notes: string
  readonly catalogRole: DailyCatalogRole
  readonly operationalStatus: DailyOperationalStatus
  readonly discoveryUrl?: string
}

export interface DailyWatchlistCompany extends ResearchCompanyIdentity { readonly focusTags?: readonly string[] }
export interface DailyWatchlist { readonly companies: readonly DailyWatchlistCompany[]; readonly themes: readonly string[]; readonly industries: readonly string[] }

export interface DailyProviderOutcome {
  readonly provider: string
  readonly status: DailyProviderStatus
  readonly attempted: boolean
  readonly succeeded: boolean
  readonly empty: boolean
  readonly blocked: boolean
  readonly failed: boolean
  readonly usable: number
  readonly diagnostics: readonly string[]
  readonly discoveredCount: number
  readonly fetchSucceededCount: number
  readonly normalizeSucceededCount: number
  readonly emptyCount: number
  readonly blockedCount: number
  readonly failedCount: number
}

export interface DailyResearchSignal {
  readonly signalId: string
  readonly kind: DailySignalKind
  readonly category: DailySignalCategory
  readonly provider: string
  readonly sourceAccountRef?: string
  readonly source: ResearchSourceCandidate
  readonly publishedAt?: string
  readonly discoveredAt: string
  readonly entities: readonly string[]
  readonly themes: readonly string[]
  readonly title: string
  readonly contentRef?: string
  readonly contentHash: string
  readonly excerpt?: string
  readonly narrative?: string
  readonly relevance: number
  readonly novelty: number
  readonly sentiment?: number
  readonly importance: number
  readonly engagement?: Readonly<Record<string, number>>
  readonly sourceTier: 1 | 2 | 3 | 4 | 5
  readonly rawRef?: string
  readonly clusterKey?: string
  readonly score?: number
  readonly scoreReasons?: readonly string[]
  readonly temporalConfidence?: 'source' | 'discovery' | 'unknown'
}

export interface DailySignalStore {
  appendMany(signals: readonly DailyResearchSignal[]): Promise<{ readonly appended: number; readonly skipped: number }>
  listWindow(from: string, to: string, limit?: number): Promise<readonly DailyResearchSignal[]>
  getById(signalId: string): Promise<DailyResearchSignal | undefined>
}

export interface DailySignalCluster {
  readonly clusterId: string
  readonly representativeSignal: string
  readonly signalRefs: readonly string[]
  readonly entities: readonly string[]
  readonly themes: readonly string[]
  readonly firstSeen: string
  readonly lastSeen: string
  readonly sourceDiversity: number
  readonly importance: number
  readonly title: string
  readonly signals: readonly DailyResearchSignal[]
}

export type ResearchChangeDisposition = 'new' | 'supports' | 'contradicts' | 'changes_assumption' | 'affects_thesis' | 'catalyst' | 'risk' | 'noise'
export interface ResearchChangeAssessment {
  readonly clusterId: string
  readonly subjectKey?: string
  readonly disposition: ResearchChangeDisposition
  readonly rationale: string
  readonly relatedKnowledgeRefs: readonly string[]
  readonly durableCandidate: boolean
}

export interface DailyBriefItem {
  readonly itemId: string
  readonly headline: string
  readonly markdown: string
  readonly signalRefs: readonly string[]
  readonly sourceRefs: readonly string[]
  readonly evidenceLinks?: readonly string[]
  readonly assessmentRefs?: readonly string[]
  readonly kind: 'signal' | 'gap' | 'interpretation'
  readonly rank: number
}
export interface DailyBriefSection { readonly id: string; readonly title: string; readonly items: readonly DailyBriefItem[]; readonly unavailable?: boolean }
export interface DailyQualityTelemetry {
  readonly inputSignalCount: number
  readonly dedupSignalCount: number
  readonly clusterCount: number
  readonly rankedCount: number
  readonly topCount: number
  readonly claimCount: number
  readonly claimWithSourceCount: number
  readonly claimWithRawProvenanceCount: number
  readonly sourceCount: number
  readonly uniqueSourceCount: number
  readonly unsupportedProposalCount: number
  readonly reportItemWithSourceRatio: number
  readonly durableChangeCount: number
  readonly reviewCount: number
  readonly storedSignalCount: number
  readonly reportItemCount: number
  readonly semanticProposalCount: number
  readonly committedClaimCount: number
  readonly supportedProposalCount?: number
  readonly gatewaySubmittedProposalCount?: number
  readonly boundExistingClaimCount?: number
  readonly createdClaimCount?: number
  readonly updatedClaimCount?: number
  readonly canonicalSourceCreatedCount?: number
  readonly canonicalRawReferencedCount?: number
  readonly enrichmentReasoningUsed?: boolean
  readonly enrichmentAppliedCount?: number
  readonly enrichmentFallbackCount?: number
  readonly changeAssessmentReasoningUsed?: boolean
  readonly changeAssessmentAppliedCount?: number
  readonly changeAssessmentFallbackCount?: number
  readonly briefFallbackCount?: number
  readonly reasoningDiagnostics?: readonly string[]
}
export interface DailyBriefReport {
  readonly reportId: string
  readonly briefType: DailyBriefType
  readonly tradeDate: string
  readonly asOf: string
  readonly timezone: string
  readonly revision: number
  readonly workflowRunId: string
  readonly generatedAt: string
  readonly sections: readonly DailyBriefSection[]
  readonly topSignals: readonly DailyResearchSignal[]
  readonly providerOutcomes: readonly DailyProviderOutcome[]
  readonly quality: DailyQualityTelemetry
  readonly consensusStatement: string
  readonly knowledgeBaseRevision?: number
  readonly committedKnowledgeRefs: readonly string[]
  readonly reviewCaseCount: number
  readonly calendarConfidence: 'provider' | 'cache' | 'manual' | 'fallback'
  readonly modelDerivedItemCount?: number
  readonly enrichmentReasoningUsed?: boolean
  readonly enrichmentAppliedCount?: number
  readonly enrichmentFallbackCount?: number
  readonly changeAssessmentReasoningUsed?: boolean
  readonly changeAssessmentAppliedCount?: number
  readonly changeAssessmentFallbackCount?: number
  readonly briefFallbackCount?: number
  readonly briefReasoningUsed?: boolean
  readonly reasoningDiagnostics?: Readonly<Record<string, readonly string[]>>
}

export interface DailyIntelligenceInput {
  readonly workflowRunId: string
  readonly briefType: DailyBriefType
  readonly tradeDate: string
  readonly asOf?: string
  readonly watchlist: DailyWatchlist
  readonly providers: readonly ResearchAcquisitionPlugin[]
  readonly signalStore: DailySignalStore
  readonly briefRoot: string
  readonly reportRoot: string
  readonly knowledgeBaseRoot?: string
  readonly maxSignals?: number
  readonly topLimit?: number
  readonly forceRefresh?: boolean
  readonly signal?: AbortSignal
  readonly now?: () => string
  readonly reasoningExecutor?: import('../reasoning/contracts.ts').ReasoningExecutor
  readonly calendarConfidence?: 'provider' | 'cache' | 'manual' | 'fallback'
  readonly calendar?: import('./calendar.ts').TradingCalendarService
  readonly maxDurableKnowledgeProposals?: number
}

export interface DailyIntelligenceResult {
  readonly workflowRunId: string
  readonly status: 'completed' | 'blocked' | 'cancelled' | 'failed' | 'already_completed'
  readonly brief?: DailyBriefReport
  readonly reportPath?: string
  readonly signals: readonly DailyResearchSignal[]
  readonly clusters: readonly DailySignalCluster[]
  readonly assessments: readonly ResearchChangeAssessment[]
  readonly providerOutcomes: readonly DailyProviderOutcome[]
  readonly proposalCount: number
  readonly committedKnowledgeRefs: readonly string[]
  readonly reviewCaseCount: number
  readonly errors: readonly string[]
  readonly enrichmentReasoningUsed?: boolean
  readonly enrichmentAppliedCount?: number
  readonly enrichmentFallbackCount?: number
  readonly changeAssessmentReasoningUsed?: boolean
  readonly changeAssessmentAppliedCount?: number
  readonly changeAssessmentFallbackCount?: number
  readonly briefReasoningUsed?: boolean
  readonly briefFallbackCount?: number
  readonly modelDerivedItemCount?: number
  readonly reasoningDiagnostics?: Readonly<Record<string, readonly string[]>>
}
