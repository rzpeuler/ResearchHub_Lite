import type { CurationOperation } from './contracts.ts'

export type KnowledgeCurationErrorCode = 'invalid_model_output' | 'invalid_reference' | 'invalid_semantics' | 'invalid_confidence' | 'ungrounded_candidate' | 'reasoning_failed'
export class KnowledgeCurationError extends Error {
  readonly code: KnowledgeCurationErrorCode
  readonly operation?: CurationOperation
  constructor(code: KnowledgeCurationErrorCode, message: string, operation?: CurationOperation, options?: { cause?: unknown }) {
    super(message, options)
    this.name = 'KnowledgeCurationError'
    this.code = code
    this.operation = operation
  }
}
