import type { DocumentInputRef, StructuredDocument } from '../../plugins/document/contracts.ts'
import type { KnowledgeBaseHandle } from '../../knowledge/storage/handle.ts'
import type { KnowledgeCurationSkill } from '../../skills/knowledge-curation/skill.ts'
import type { ReportMap, ProposedExtractionUnit, ValidatedExtractKnowledgeResult, DocumentContentRef, PlanValidationCode } from '../../skills/knowledge-curation/contracts.ts'
import type { ValidationReport } from '../../knowledge/validation/types.ts'
import type { KnowledgeWriteResult } from '../../knowledge/schema/mutation.ts'

export interface IngestionWorkflowConfig {
  readonly maxExtractionUnits?: number
  readonly maxPlanAttempts?: number
  readonly maxExtractionAttempts?: number
  readonly maxConcurrency?: number
  readonly maxContextTokens?: number
  readonly maxResolutionAttempts?: number
  readonly maxResolutionCases?: number
  readonly maxEntityBindingCandidates?: number
}

export interface PlanAttemptSummary {
  readonly attempt: number
  readonly status: 'proposed' | 'accepted' | 'repairable_invalid' | 'terminal_invalid'
  readonly validationCode?: PlanValidationCode
  readonly uncoveredCount?: number
  readonly overlapCount?: number
  readonly affectedUnitId?: string
  readonly estimatedTokens?: number
  readonly allowedTokens?: number
  readonly unitCount?: number
  readonly maxUnits?: number
}

export interface RawDocumentKnowledgeIngestionInput {
  readonly handle: KnowledgeBaseHandle
  readonly documentInput: DocumentInputRef
  readonly skill: KnowledgeCurationSkill
  readonly workflowRunId: string
  readonly instructions?: string
  readonly sourceMetadata?: { title?: string | null; institution?: string | null; author?: string | null; publishedAt?: string | null; sourceUrl?: string | null }
  readonly config?: IngestionWorkflowConfig
  readonly clock?: () => string
}

export type IngestionWorkflowStatus = 'completed' | 'completed_with_review' | 'blocked'
export interface AcceptedExtractionUnit extends ProposedExtractionUnit {
  readonly unitId: string
  readonly primaryBlockIds: readonly string[]
  readonly contextBlockIds: readonly string[]
}
export interface AcceptedExtractionPlan {
  readonly units: readonly AcceptedExtractionUnit[]
  readonly excludedBlockIds: readonly string[]
  readonly estimatedContextTokens: Readonly<Record<string, number>>
}
export interface ExtractionUnitSummary {
  readonly unitId: string
  readonly proposedUnitId: string
  readonly attempts: number
  readonly status: 'completed' | 'failed'
  readonly candidateCounts: Readonly<Record<string, number>>
  readonly rejectedCount: number
  readonly allRejectedAttempts?: number
  readonly lastRejectionCodeCounts?: Readonly<Record<string, number>>
  readonly error?: string
}
export interface EntityResolution {
  readonly candidateId: string
  readonly status: 'existing' | 'created' | 'review' | 'rejected'
  readonly canonicalId?: string
  readonly rationale?: string
}
export type ThemeCoverageOutcome = 'matches_existing' | 'ambiguous_existing' | 'potential_new'
export type ThemeRecommendation = 'recommend' | 'do_not_recommend'
export interface PotentialInvestmentThemeSupport {
  readonly supportingCandidateCount: number
  readonly supportingUnitCount: number
  readonly supportingPrimaryBlockCount: number
  readonly supportingSectionCount: number
  readonly evidenceBlockRefs: readonly string[]
}
export interface PotentialInvestmentThemeAssessment {
  readonly candidateId: string
  readonly name: string
  readonly aliases: readonly string[]
  readonly description?: string | null
  readonly noveltyState: 'potential_new'
  readonly support: PotentialInvestmentThemeSupport
  readonly recommendation: ThemeRecommendation
  readonly recommendationReason: string
  readonly evidenceBlockRefs: readonly string[]
}
export type ReviewCategory = 'invalid_reference' | 'invalid_semantics' | 'relation_cardinality' | 'schema_gap' | 'theme_creation' | 'theme_ambiguity' | 'reconciliation_review' | 'other'
export type ReviewOrigin = 'extraction_rejection' | 'consolidation' | 'consolidation_mirror' | 'knowledge_resolution' | 'semantic_case' | 'planner' | 'dependency_isolation'
export interface ConsolidationReviewConstraint {
  readonly candidateId: string
  readonly reason: string
  readonly conflictingFields: readonly string[]
  readonly blocking: boolean
  readonly category: ReviewCategory
  readonly reviewKey: string
}
export interface ReviewItem { readonly candidateId: string; readonly kind: string; readonly rationale: string; readonly dependentCandidateIds: readonly string[]; readonly stage?: string; readonly category?: ReviewCategory; readonly dependency?: boolean; readonly origin?: ReviewOrigin; readonly reviewKey?: string }
export interface ReviewSample { readonly candidateId?: string; readonly kind: 'entity' | 'relation' | 'claim' | 'workflow_level'; readonly stage: string; readonly category: ReviewCategory; readonly rationale: string; readonly dependentCandidateIds: readonly string[]; readonly dependency?: boolean; readonly origin?: ReviewOrigin; readonly reviewKey?: string }
export interface ReviewSummary { readonly total: number; readonly rootCount: number; readonly dependencyCount: number; readonly byCategory: Readonly<Record<ReviewCategory, number>>; readonly byCandidateKind: Readonly<Record<'entity' | 'relation' | 'claim' | 'workflow_level', number>>; readonly samplesByCategory: Readonly<Record<ReviewCategory, readonly ReviewSample[]>> }
export interface IngestionWorkflowResult {
  readonly workflowRunId: string
  readonly knowledgeBaseId: string
  readonly rawRef?: string
  readonly documentId?: string
  readonly status: IngestionWorkflowStatus
  readonly acceptedPlan?: AcceptedExtractionPlan
  readonly planAttempts?: readonly PlanAttemptSummary[]
  readonly unitSummaries: readonly ExtractionUnitSummary[]
  readonly candidateCounts: Readonly<Record<string, number>>
  readonly rejectedCandidates: readonly unknown[]
  readonly reviewItems: readonly ReviewItem[]
  readonly reviewSummary: ReviewSummary
  readonly resolutionSummary?: Readonly<Record<string, number>>
  readonly potentialNewInvestmentThemes?: readonly PotentialInvestmentThemeAssessment[]
  readonly recommendedNewInvestmentThemes?: readonly PotentialInvestmentThemeAssessment[]
  /** Historical validation telemetry field; new production flow uses resolutionSummary. */
  readonly reconciliationSummary?: Readonly<Record<string, number>>
  readonly changeSetId?: string
  readonly writeStatus?: KnowledgeWriteResult['status']
  readonly baseRevision?: number
  readonly committedRevision?: number
  readonly validationSummary?: ValidationReport
  readonly extractionConcurrency?: number
  readonly peakExtractionConcurrency?: number
  readonly errors: readonly string[]
}

export interface WorkflowStageContext {
  readonly document: StructuredDocument
  readonly reportMap: ReportMap
  readonly sourceAssessment: ReportMap['sourceAssessment']
  readonly acceptedPlan: AcceptedExtractionPlan
  readonly extractions: readonly { readonly unit: AcceptedExtractionUnit; readonly result: ValidatedExtractKnowledgeResult }[]
}
export type { DocumentContentRef, StructuredDocument }
