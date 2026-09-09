export const REASONING_OPERATIONS = [
  'understandAndPlan',
  'extractKnowledge',
  'resolveSemanticCase',
  'company_research_synthesis',
  'daily_signal_enrichment',
  'daily_change_assessment',
  'daily_brief_synthesis',
  'earnings_review_synthesis',
  'valuation_assumption_design',
  'valuation_synthesis',
  'event_evidence_assessment',
  'event_research_synthesis',
  'thesis_attack_design',
  'thesis_red_team_synthesis',
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
