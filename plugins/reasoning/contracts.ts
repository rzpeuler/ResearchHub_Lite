export const REASONING_OPERATIONS = [
  'understandAndPlan',
  'extractKnowledge',
  'reconcileKnowledge',
] as const

export type ReasoningOperation = (typeof REASONING_OPERATIONS)[number]

export interface ReasoningCapabilities {
  readonly maxContextTokens: number
  readonly maxOutputTokens: number
  readonly structuredOutputSupport: boolean
  readonly maxConcurrency: number
}

export interface ReasoningRequest {
  readonly operation: ReasoningOperation
  readonly instruction: string
  readonly input: unknown
  readonly outputContract: unknown
  readonly metadata?: Readonly<Record<string, string>>
}

export interface ReasoningResult {
  readonly operation: ReasoningOperation
  readonly operationId?: string
  readonly output: unknown
  readonly rawOutput?: string
  readonly durationMs?: number
  readonly exitCode?: number
}

export interface ReasoningExecutor {
  capabilities(): ReasoningCapabilities
  execute(request: ReasoningRequest): Promise<ReasoningResult>
}
