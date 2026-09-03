import type { DocumentInputRef, StructuredDocument } from '../../plugins/document/contracts.ts'
import type { KnowledgeBaseHandle } from '../../knowledge/storage/handle.ts'
import type { KnowledgeCurationSkill } from '../../skills/knowledge-curation/skill.ts'
import type { ReconcileKnowledgeOutput, ReportMap, ProposedExtractionUnit, ValidatedExtractKnowledgeResult, ReconciliationDecision, DocumentContentRef } from '../../skills/knowledge-curation/contracts.ts'
import type { ValidationReport } from '../../knowledge/validation/types.ts'
import type { KnowledgeWriteResult } from '../../knowledge/schema/mutation.ts'

export interface IngestionWorkflowConfig {
  readonly maxExtractionUnits?: number
  readonly maxExtractionAttempts?: number
  readonly maxConcurrency?: number
  readonly maxContextTokens?: number
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
  readonly error?: string
}
export interface EntityResolution {
  readonly candidateId: string
  readonly status: 'existing' | 'created' | 'review' | 'rejected'
  readonly canonicalId?: string
}
export type ReviewCategory = 'invalid_reference' | 'invalid_semantics' | 'relation_cardinality' | 'schema_gap' | 'theme_creation' | 'theme_ambiguity' | 'reconciliation_review' | 'other'
export type ReviewOrigin = 'extraction_rejection' | 'consolidation' | 'consolidation_mirror' | 'reconciliation' | 'reconciliation_mirror' | 'planner' | 'dependency_isolation'
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
  readonly unitSummaries: readonly ExtractionUnitSummary[]
  readonly candidateCounts: Readonly<Record<string, number>>
  readonly rejectedCandidates: readonly unknown[]
  readonly reviewItems: readonly ReviewItem[]
  readonly reviewSummary: ReviewSummary
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
  readonly reconciliation: ReconcileKnowledgeOutput
}

export interface CandidateDecisionIndex { readonly decisions: ReadonlyMap<string, ReconciliationDecision> }
export type { DocumentContentRef, StructuredDocument }
