import type { KnowledgeAssetV04, KnowledgeAssetKindV04 } from './domain-v04.ts'
export type KnowledgeOperationV04 = { readonly operationId: string; readonly type: 'create'; readonly object: KnowledgeAssetV04 } | { readonly operationId: string; readonly type: 'update'; readonly knowledgeId: string; readonly expectedBeforeHash: string; readonly object: KnowledgeAssetV04 }
export interface KnowledgeChangeSetV04 { readonly changeSetId: string; readonly workflowRunId: string; readonly knowledgeBaseId: string; readonly schemaVersion: '0.4'; readonly storageFormatVersion: '1'; readonly expectedBaseRevision: number; readonly operations: readonly KnowledgeOperationV04[]; readonly ingestionContext?: Readonly<Record<string, unknown>> }
export class ValidatedKnowledgeChangeSetV04 {
  readonly changeSet: KnowledgeChangeSetV04
  readonly knowledgeBaseId: string
  readonly schemaVersion = '0.4' as const
  readonly baseRevision: number
  readonly changeSetId: string
  readonly changeSetHash: string
  readonly validatedAt: string

  constructor(input: { readonly changeSet: KnowledgeChangeSetV04; readonly knowledgeBaseId: string; readonly baseRevision: number; readonly changeSetId: string; readonly changeSetHash: string; readonly validatedAt: string }) {
    this.changeSet = structuredClone(input.changeSet)
    this.knowledgeBaseId = input.knowledgeBaseId
    this.baseRevision = input.baseRevision
    this.changeSetId = input.changeSetId
    this.changeSetHash = input.changeSetHash
    this.validatedAt = input.validatedAt
    Object.freeze(this)
  }
}
export interface KnowledgeWriteResultV04 { readonly status: 'committed' | 'already_committed' | 'no_changes' | 'rejected' | 'failed'; readonly knowledgeBaseId: string; readonly changeSetId: string; readonly baseRevision: number; readonly committedRevision: number; readonly createdIds: readonly string[]; readonly updatedIds: readonly string[]; readonly error?: { readonly code: string; readonly message: string } }
export type KnowledgeAssetTypeV04 = KnowledgeAssetKindV04
