import type { EntityTypeV03, RelationTypeV03 } from '../../knowledge/schema/domain.ts'

export type ApplicationErrorCode = 'not_found' | 'invalid_input' | 'cancelled' | 'failed' | 'conflict' | 'no_kb_mounted' | 'unauthorized_runtime_token'

export class ApplicationServiceError extends Error {
  readonly code: ApplicationErrorCode
  constructor(code: ApplicationErrorCode, message: string, options?: { readonly cause?: unknown }) {
    super(message, options)
    this.name = 'ApplicationServiceError'
    this.code = code
  }
}

export type ApplicationKnowledgeKind = 'ThemeGroup' | 'Entity' | 'Relation' | 'Claim' | 'Source' | 'Module'
export interface ApplicationLimit { readonly limit: number; readonly total: number; readonly truncated: boolean }

export interface KnowledgeSearchInput {
  readonly query: string
  readonly entityType?: EntityTypeV03
  readonly limit?: number
}
export interface ApplicationKnowledgeSearchResult {
  readonly ref: string
  readonly kind: ApplicationKnowledgeKind
  readonly semanticType?: string
  readonly displayName?: string
  readonly summary?: string
}
export interface KnowledgeSearchResult {
  readonly results: readonly ApplicationKnowledgeSearchResult[]
  readonly total: number
  readonly limit: number
  readonly truncated: boolean
}

export interface KnowledgeBaseStatusView {
  readonly knowledgeBaseId: string
  readonly rootRef: string
  readonly revision: number
  readonly status: string
  readonly schemaVersion: string
  readonly storageFormatVersion: string
  readonly counts: Readonly<Record<string, number>>
}
export interface KnowledgeObjectView {
  readonly ref: string
  readonly kind: ApplicationKnowledgeKind
  readonly object: unknown
  readonly relatedRelations?: readonly unknown[]
  readonly relatedClaims?: readonly unknown[]
  readonly supportingSources?: readonly unknown[]
  readonly relatedEntities?: readonly unknown[]
  readonly truncation?: Readonly<Record<string, ApplicationLimit>>
}

export type KnowledgeGraphEntityType = 'investment_theme' | 'industry' | 'company' | 'product' | 'technology'
export type KnowledgeGraphProfile = 'theme_context' | 'industry_context' | 'company_context' | 'product_context' | 'technology_context'
export interface KnowledgeGraphProjectionInput { readonly rootRef: string; readonly depth?: 1 | 2; readonly maxNodes?: number; readonly maxEdges?: number }
export interface KnowledgeGraphNode { readonly ref: string; readonly entityType: KnowledgeGraphEntityType; readonly label: string; readonly secondaryLabel?: string; readonly lifecycleStatus: string; readonly isRoot: boolean }
export interface KnowledgeGraphEdge { readonly ref: string; readonly relationType: RelationTypeV03; readonly sourceRef: string; readonly targetRef: string; readonly label: string }
export interface KnowledgeGraphProjection {
  readonly rootRef: string
  readonly profile: KnowledgeGraphProfile
  readonly depth: 1 | 2
  readonly nodes: readonly KnowledgeGraphNode[]
  readonly edges: readonly KnowledgeGraphEdge[]
  readonly nodeTotal: number
  readonly edgeTotal: number
  readonly nodeLimit: number
  readonly edgeLimit: number
  readonly truncated: boolean
}
export interface KnowledgeDirectoryItem { readonly ref: string; readonly name: string }
export interface KnowledgeDirectorySection { readonly items: readonly KnowledgeDirectoryItem[]; readonly total: number; readonly limit: number; readonly truncated: boolean }
export interface KnowledgeDirectoryThemeGroup { readonly ref: string; readonly name: string; readonly themes: readonly KnowledgeDirectoryItem[] }
export interface KnowledgeDirectoryProjection {
  readonly themeGroups: readonly KnowledgeDirectoryThemeGroup[]
  readonly industries: KnowledgeDirectorySection
  readonly companies: KnowledgeDirectorySection
  readonly products: KnowledgeDirectorySection
  readonly technologies: KnowledgeDirectorySection
}

export type WorkflowStatus = 'pending' | 'running' | 'completed' | 'completed_with_review' | 'blocked' | 'cancelled' | 'failed'
export type TerminalWorkflowStatus = Exclude<WorkflowStatus, 'pending' | 'running'>
export interface WorkflowRunView {
  readonly runId: string
  readonly workflowType: string
  readonly objective: string
  readonly status: WorkflowStatus
  readonly currentStage?: string
  readonly progressSummary?: string
  readonly startedAt: string
  readonly updatedAt: string
  readonly completedAt?: string
  readonly reviewCount?: number
  readonly errorSummary?: string
}
export interface WorkflowCancelResult {
  readonly runId: string
  readonly status: WorkflowStatus
  readonly cancelled: boolean
  readonly reason?: 'cancelled' | 'not_running' | 'already_terminal'
}

export interface ReviewCaseListInput {
  readonly limit?: number
  readonly actionability?: 'knowledge_decision' | 'research_followup' | 'schema_design'
  readonly category?: string
  readonly producerRunId?: string
}
export interface ReviewCaseSummary {
  readonly reviewCaseId: string
  readonly producerRunId: string
  readonly producerType: string
  readonly createdAt: string
  readonly category: string
  readonly actionability: string
  readonly origin: string
  readonly rationale: string
  readonly proposalKind: string
  readonly semanticType: string
  readonly dependentProposalCount: number
  readonly suggestedNextAction?: string
  readonly status: string
}
export interface ReviewCaseListResult {
  readonly cases: readonly ReviewCaseSummary[]
  readonly total: number
  readonly limit: number
  readonly truncated: boolean
}
export interface ReviewCaseDetail {
  readonly reviewCaseId: string
  readonly producerRunId: string
  readonly producerType: string
  readonly createdAt: string
  readonly classification: unknown
  readonly rootProposal: unknown
  readonly evidenceBindings: readonly unknown[]
  readonly existingKnowledgeProjections: readonly unknown[]
  readonly impact: unknown
  readonly advisory?: unknown
  readonly state: unknown
  readonly totalDependentProposals: number
  readonly dependentProposalSamples: readonly unknown[]
  readonly dependentProposals: readonly unknown[]
  readonly dependentsTruncated: boolean
}

export interface IngestDocumentInput {
  readonly workflowRunId: string
  readonly text?: string
  readonly workspaceFile?: string
  readonly originalFilename?: string
  readonly mediaType?: string
  readonly instructions?: string
  readonly sourceMetadata?: { readonly title?: string | null; readonly institution?: string | null; readonly author?: string | null; readonly publishedAt?: string | null; readonly sourceUrl?: string | null }
}
export interface ApplicationProductionResult {
  readonly runId: string
  readonly status: WorkflowStatus
  readonly knowledgeBaseId?: string
  readonly rawRef?: string
  readonly documentId?: string
  readonly changeSetId?: string
  readonly baseRevision?: number
  readonly committedRevision?: number
  readonly reviewCount: number
  readonly reviewCaseIds: readonly string[]
  readonly summary: string
  readonly errorSummary?: string
}
