export interface FreeResearchOracleEvent {
  readonly type?: unknown
  readonly role?: unknown
  readonly status?: unknown
  readonly conversationId?: unknown
  readonly summary?: unknown
  readonly [key: string]: unknown
}

export interface FreeResearchPersistedMessage {
  readonly role?: unknown
  readonly content?: unknown
  readonly [key: string]: unknown
}

export interface FreeResearchOracleInput {
  readonly conversationId: string
  readonly requestNonce: string
  readonly events: readonly FreeResearchOracleEvent[]
  readonly persistedMessages: readonly FreeResearchPersistedMessage[]
  readonly normalizedEvents: boolean
}

export interface FreeResearchOracleResult {
  readonly assistantDeltas: string
  readonly assistantDeltaNonEmpty: true
  readonly terminalStatus: 'completed'
  readonly clientErrorCount: 0
  readonly persistedUserMessageFound: true
  readonly persistedAssistantMessageFound: true
  readonly requestNonceInUserMessage: true
  readonly normalizedSafe: true
}

export class FreeResearchOracleError extends Error {
  readonly code: string

  constructor(code: string, message: string) {
    super(message)
    this.name = 'FreeResearchOracleError'
    this.code = code
  }
}

function isNonEmptyString(value: unknown): value is string { return typeof value === 'string' && value.trim().length > 0 }
function isCurrentConversation(value: unknown, conversationId: string): boolean { return value === undefined || value === conversationId }

export function evaluateFreeResearchOracle(input: FreeResearchOracleInput): FreeResearchOracleResult {
  if (!input.normalizedEvents) throw new FreeResearchOracleError('unsafe_normalized_events', 'Free Research SSE projection exposed a prohibited raw field')
  const prohibited = input.events.some((event) => Object.keys(event).some((key) => ['thinking', 'arguments', 'result', 'rawOutput'].includes(key)))
  if (prohibited) throw new FreeResearchOracleError('unsafe_normalized_events', 'Free Research SSE projection exposed a prohibited raw field')
  const conversationMismatch = input.events.some((event) => !isCurrentConversation(event.conversationId, input.conversationId))
  if (conversationMismatch) throw new FreeResearchOracleError('conversation_mismatch', 'Free Research SSE event belongs to another conversation')
  const errors = input.events.filter((event) => event.type === 'error')
  if (errors.length > 0) throw new FreeResearchOracleError('client_error_event', 'Free Research emitted a client error event')
  const terminal = input.events.find((event) => event.type === 'agent.completed')
  if (terminal === undefined) throw new FreeResearchOracleError('agent_terminal_missing', 'Free Research did not emit agent.completed')
  if (terminal.status !== 'completed') throw new FreeResearchOracleError('agent_terminal_failed', `Free Research terminal status was ${String(terminal.status ?? 'missing')}`)
  const started = input.events.some((event) => event.type === 'agent.started' && isCurrentConversation(event.conversationId, input.conversationId))
  if (!started) throw new FreeResearchOracleError('agent_started_missing', 'Free Research did not emit agent.started')
  const assistantDeltas = input.events.filter((event) => event.type === 'message.delta' && event.role === 'assistant').map((event) => typeof event.summary === 'string' ? event.summary : '').join('')
  if (assistantDeltas.trim().length === 0) throw new FreeResearchOracleError('assistant_delta_empty', 'Free Research assistant message.delta stream was empty')
  const persistedUserMessageFound = input.persistedMessages.some((message) => message.role === 'user' && typeof message.content === 'string' && message.content.includes(input.requestNonce))
  if (!persistedUserMessageFound) throw new FreeResearchOracleError('persisted_user_missing', 'Persisted conversation does not contain the current request nonce in a user message')
  const persistedAssistantMessageFound = input.persistedMessages.some((message) => message.role === 'assistant' && isNonEmptyString(message.content))
  if (!persistedAssistantMessageFound) throw new FreeResearchOracleError('persisted_assistant_missing', 'Persisted conversation does not contain a non-empty assistant message')
  return { assistantDeltas, assistantDeltaNonEmpty: true, terminalStatus: 'completed', clientErrorCount: 0, persistedUserMessageFound: true, persistedAssistantMessageFound: true, requestNonceInUserMessage: true, normalizedSafe: true }
}
