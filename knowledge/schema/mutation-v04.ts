import type { KnowledgeAssetV04, KnowledgeAssetKindV04 } from './domain-v04.ts'
export type KnowledgeOperationV04 = { readonly operationId: string; readonly type: 'create'; readonly object: KnowledgeAssetV04 } | { readonly operationId: string; readonly type: 'update'; readonly knowledgeId: string; readonly expectedBeforeHash: string; readonly object: KnowledgeAssetV04 }
export interface KnowledgeChangeSetV04 { readonly changeSetId: string; readonly workflowRunId: string; readonly knowledgeBaseId: string; readonly schemaVersion: '0.4'; readonly storageFormatVersion: '1'; readonly expectedBaseRevision: number; readonly operations: readonly KnowledgeOperationV04[]; readonly ingestionContext?: Readonly<Record<string, unknown>> }
export interface ValidatedKnowledgeChangeSetV04 {
  readonly changeSet: KnowledgeChangeSetV04
  readonly knowledgeBaseId: string
  readonly schemaVersion: '0.4'
  readonly baseRevision: number
  readonly changeSetId: string
  readonly changeSetHash: string
  readonly validatedAt: string
}
export interface KnowledgeWriteResultV04 { readonly status: 'committed' | 'already_committed' | 'no_changes' | 'rejected' | 'failed'; readonly knowledgeBaseId: string; readonly changeSetId: string; readonly baseRevision: number; readonly committedRevision: number; readonly createdIds: readonly string[]; readonly updatedIds: readonly string[]; readonly error?: { readonly code: string; readonly message: string } }
export type KnowledgeAssetTypeV04 = KnowledgeAssetKindV04
