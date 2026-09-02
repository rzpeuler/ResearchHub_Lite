import type { ReasoningOperation } from './contracts.ts'

export const REASONING_ERROR_CODES = [
  'reasoning_host_unavailable',
  'reasoning_configuration_invalid',
  'reasoning_execution_failed',
  'reasoning_timeout',
  'reasoning_output_invalid',
  'reasoning_output_too_large',
] as const

export type ReasoningErrorCode = (typeof REASONING_ERROR_CODES)[number]

export class ReasoningExecutorError extends Error {
  readonly code: ReasoningErrorCode
  readonly operation?: ReasoningOperation
  readonly operationId?: string
  readonly exitCode?: number
  readonly stderr?: string

  constructor(
    code: ReasoningErrorCode,
    message: string,
    details: {
      operation?: ReasoningOperation
      operationId?: string
      exitCode?: number
      stderr?: string
      cause?: unknown
    } = {},
  ) {
    super(message, details.cause === undefined ? undefined : { cause: details.cause })
    this.name = 'ReasoningExecutorError'
    this.code = code
    this.operation = details.operation
    this.operationId = details.operationId
    this.exitCode = details.exitCode
    this.stderr = details.stderr
  }
}
