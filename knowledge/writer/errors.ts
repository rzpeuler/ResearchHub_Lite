import type { KnowledgeWriteErrorCode } from '../schema/mutation.ts'

export class KnowledgeWriteInternalError extends Error {
  constructor(public readonly publicCode: KnowledgeWriteErrorCode, message: string) {
    super(message)
    this.name = 'KnowledgeWriteInternalError'
  }
}
