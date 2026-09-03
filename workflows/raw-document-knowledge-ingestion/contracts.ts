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
export interface ReviewItem { readonly candidateId: string; readonly kind: string; readonly rationale: string; readonly dependentCandidateIds: readonly string[] }
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
