import test from 'node:test'
import assert from 'node:assert/strict'
import { evaluateFreeResearchOracle, FreeResearchOracleError, type FreeResearchOracleEvent, type FreeResearchPersistedMessage } from './free-research-oracle.ts'

const conversationId = 'conversation-001'
const requestNonce = 'RHL_FREE_RESEARCH_E2E_nonce-001'
const persisted: FreeResearchPersistedMessage[] = [
  { role: 'user', content: `Respond briefly. Request ID: ${requestNonce}` },
  { role: 'assistant', content: 'A real assistant response.' },
]

function events(overrides: Partial<Record<'terminalStatus' | 'assistantText' | 'includeError' | 'includeRaw' | 'rawField', unknown>> = {}): FreeResearchOracleEvent[] {
  const assistantText = typeof overrides.assistantText === 'string' ? overrides.assistantText : 'A real assistant response.'
  const split = assistantText.length > 1 ? [assistantText.slice(0, 1), assistantText.slice(1)] : [assistantText]
  return [
    { type: 'agent.started', conversationId },
    ...split.map((summary) => ({ type: 'message.delta', role: 'assistant', conversationId, summary })),
    ...(overrides.includeError === true ? [{ type: 'error', conversationId, summary: 'Agent request failed' }] : []),
    { type: 'agent.completed', conversationId, status: overrides.terminalStatus ?? 'completed' },
    ...(overrides.includeRaw === true ? [{ type: 'message.delta', role: 'assistant', conversationId, summary: 'must be rejected', [typeof overrides.rawField === 'string' ? overrides.rawField : 'thinking']: 'raw reasoning/tool payload must be rejected' }] : []),
  ]
}

function rejects(code: string, eventList: FreeResearchOracleEvent[] = events(), messages = persisted): void {
  assert.throws(() => evaluateFreeResearchOracle({ conversationId, requestNonce, events: eventList, persistedMessages: messages, normalizedEvents: true }), (error: unknown) => error instanceof FreeResearchOracleError && error.code === code)
}

test('Free Research oracle accepts marker or nonce split across assistant deltas', () => {
  const result = evaluateFreeResearchOracle({ conversationId, requestNonce, events: events({ assistantText: 'RHL_FREE_RESEARCH_E2E_OK' }), persistedMessages: persisted, normalizedEvents: true })
  assert.equal(result.assistantDeltaNonEmpty, true)
  assert.equal(result.terminalStatus, 'completed')
})

test('Free Research oracle does not require assistant output to contain the request nonce', () => {
  const result = evaluateFreeResearchOracle({ conversationId, requestNonce, events: events({ assistantText: 'Different natural language response.' }), persistedMessages: persisted, normalizedEvents: true })
  assert.equal(result.persistedAssistantMessageFound, true)
})

test('Free Research oracle rejects failed and aborted agent completion', () => {
  rejects('agent_terminal_failed', events({ terminalStatus: 'failed' }))
  rejects('agent_terminal_failed', events({ terminalStatus: 'aborted' }))
})

test('Free Research oracle rejects client error events', () => rejects('client_error_event', events({ includeError: true })))
test('Free Research oracle rejects empty assistant deltas', () => rejects('assistant_delta_empty', events({ assistantText: '' })))
test('Free Research oracle rejects missing or empty persisted assistant messages', () => rejects('persisted_assistant_missing', events(), [{ role: 'user', content: `Request ${requestNonce}` }]))
test('Free Research oracle rejects a persisted user message without the current nonce', () => rejects('persisted_user_missing', events(), [{ role: 'user', content: 'A different request' }, { role: 'assistant', content: 'response' }]))
test('Free Research oracle rejects raw reasoning or tool payload fields', () => {
  for (const rawField of ['thinking', 'arguments', 'result', 'rawOutput']) rejects('unsafe_normalized_events', events({ includeRaw: true, rawField }))
})
