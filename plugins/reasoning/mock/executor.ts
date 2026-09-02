import { validateReasoningCapabilities } from '../capabilities.ts'
import { ReasoningExecutorError } from '../errors.ts'
import type { ReasoningExecutor, ReasoningOperation, ReasoningRequest, ReasoningResult, ReasoningCapabilities } from '../contracts.ts'

export interface MockReasoningExecutorOptions {
  readonly capabilities: ReasoningCapabilities
  readonly responses?: Partial<Record<ReasoningOperation, unknown>>
  readonly failures?: Partial<Record<ReasoningOperation, ReasoningExecutorError | Error | string>>
}

export class MockReasoningExecutor implements ReasoningExecutor {
  readonly calls: ReasoningRequest[] = []
  private readonly configuredCapabilities: ReasoningCapabilities
  private readonly responses: Partial<Record<ReasoningOperation, unknown>>
  private readonly failures: Partial<Record<ReasoningOperation, ReasoningExecutorError | Error | string>>

  constructor(options: MockReasoningExecutorOptions) {
    this.configuredCapabilities = validateReasoningCapabilities(options?.capabilities)
    this.responses = options.responses ?? {}
    this.failures = options.failures ?? {}
  }

  capabilities(): ReasoningCapabilities {
    return this.configuredCapabilities
  }

  async execute(request: ReasoningRequest): Promise<ReasoningResult> {
    this.calls.push(structuredClone(request))
    const failure = this.failures[request.operation]
    if (failure !== undefined) {
      if (failure instanceof ReasoningExecutorError) throw failure
      if (failure instanceof Error) throw new ReasoningExecutorError('reasoning_execution_failed', failure.message, { operation: request.operation, cause: failure })
      throw new ReasoningExecutorError('reasoning_execution_failed', failure, { operation: request.operation })
    }
    if (!(request.operation in this.responses)) throw new ReasoningExecutorError('reasoning_execution_failed', `No mock response configured for ${request.operation}`, { operation: request.operation })
    return { operation: request.operation, operationId: request.metadata?.executionId, output: structuredClone(this.responses[request.operation]), durationMs: 0 }
  }
}
