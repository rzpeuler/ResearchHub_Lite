import type { KnowledgeBaseHandle } from '../storage/handle.ts'
import type { KnowledgeWriteResult, ValidatedKnowledgeChangeSetV03 } from '../schema/mutation.ts'
import { ValidatedKnowledgeChangeSetV04, type KnowledgeWriteResultV04 } from '../schema/mutation-v04.ts'
import { writeKnowledgeBaseV03 } from './writer-v03.ts'
import { writeKnowledgeBaseV04 } from './writer-v04.ts'
import type { KnowledgeBaseRegistry } from '../registry/registry.ts'
import type { KnowledgeRootTransactionFailpoint } from '../storage/root-transaction.ts'

export type ValidatedKnowledgeChangeSet = ValidatedKnowledgeChangeSetV03 | ValidatedKnowledgeChangeSetV04
export type KnowledgeWriteResultAny = KnowledgeWriteResult | KnowledgeWriteResultV04

export interface KnowledgeWriterOptions {
  readonly registry: KnowledgeBaseRegistry
  readonly clock: () => string
  readonly stagedStateValidator?: (rootRef: string, manifest: unknown) => Promise<void>
  readonly failpoint?: KnowledgeRootTransactionFailpoint
}

/** The only producer-facing Writer boundary. Schema-specific writers remain internal dispatches. */
export async function writeKnowledgeBase(handle: KnowledgeBaseHandle, receipt: ValidatedKnowledgeChangeSet, options: KnowledgeWriterOptions): Promise<KnowledgeWriteResultAny> {
  if (handle.schemaVersion === '0.4') return writeKnowledgeBaseV04(handle, receipt as ValidatedKnowledgeChangeSetV04, options.registry, options.clock)
  return writeKnowledgeBaseV03(handle, { receipt: receipt as ValidatedKnowledgeChangeSetV03, registry: options.registry, clock: options.clock, stagedStateValidator: options.stagedStateValidator, failpoint: options.failpoint })
}
