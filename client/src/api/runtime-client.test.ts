import { describe, expect, it, vi } from 'vitest'
import { RuntimeClient, RuntimeClientError, parseClientEvent } from './runtime-client'

function json(body: unknown, status = 200): Response { return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }) }
const bootstrap = { runtime: { origin: 'http://127.0.0.1:1234', runtimeToken: 'a'.repeat(64) }, origin: 'http://127.0.0.1:1234', session: { conversationId: 'c1', isStreaming: false, isIdle: true, pendingMessageCount: 0, thinkingLevel: 'off' }, conversations: [] }

describe('RuntimeClient', () => {
  it('keeps the bootstrap token in the client and adds it only to mutations', async () => {
    const calls: RequestInit[] = []
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => { calls.push(init ?? {}); return calls.length === 1 ? json(bootstrap) : json({ accepted: true, aborted: true }) })
    const client = new RuntimeClient(fetchMock)
    await client.bootstrap()
    await client.abort()
    expect(new Headers(calls[1]?.headers).get('X-ResearchHub-Runtime-Token')).toBe('a'.repeat(64))
    expect(JSON.stringify(document.body)).not.toContain('a'.repeat(64))
  })

  it('projects only normalized SSE event fields and ignores raw payloads', () => {
    const event = parseClientEvent(JSON.stringify({ eventId: 'e1', conversationId: 'c1', timestamp: 'now', type: 'tool.updated', name: 'search_knowledge', summary: 'Knowledge search', args: { secret: 'hidden' }, result: 'raw' }))
    expect(event).toEqual({ eventId: 'e1', conversationId: 'c1', timestamp: 'now', type: 'tool.updated', name: 'search_knowledge', summary: 'Knowledge search' })
    expect(parseClientEvent(JSON.stringify({ eventId: 'e2', conversationId: 'c1', timestamp: 'now', type: 'raw.pi.event', args: 'secret' }))).toBeUndefined()
  })

  it('subscribes to named normalized SSE events and reconnects through the resync hook', async () => {
    const listeners = new Map<string, (event: MessageEvent<string>) => void>()
    const source = { onopen: null as ((event: Event) => void) | null, onerror: null as ((event: Event) => void) | null, close: vi.fn(), addEventListener: (type: string, listener: (event: MessageEvent<string>) => void) => { listeners.set(type, listener) }, removeEventListener: (type: string) => { listeners.delete(type) } }
    const client = new RuntimeClient(async () => json(bootstrap)); await client.bootstrap()
    const received: string[] = []; const resync = vi.fn(); const dispose = client.openEvents((event) => received.push(event.type), resync, () => source)
    source.onopen?.(new Event('open')); listeners.get('message.delta')?.({ data: JSON.stringify({ eventId: 'e1', conversationId: 'c1', timestamp: 'now', type: 'message.delta', role: 'assistant', summary: 'safe' }) } as MessageEvent<string>)
    expect(resync).toHaveBeenCalledOnce(); expect(received).toEqual(['message.delta']); dispose(); expect(source.close).toHaveBeenCalledOnce(); expect(listeners.size).toBe(0)
  })

  it('uses explicit command endpoints and the safe authorization message', async () => {
    const paths: string[] = []
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => { paths.push(String(input)); return paths.length === 1 ? json(bootstrap) : json({ accepted: true, conversationId: 'c1', run: { runId: 'r1', operation: 'follow_up' } }, 202) })
    const client = new RuntimeClient(fetchMock)
    await client.bootstrap()
    await client.command('follow_up', 'continue')
    expect(paths[1]).toBe('/api/conversations/follow_up')

    const unauthorized = new RuntimeClient(async () => json({ code: 'unauthorized_runtime_token', error: 'unsafe detail' }, 401))
    await expect(unauthorized.bootstrap()).rejects.toBeInstanceOf(RuntimeClientError)
    await expect(unauthorized.bootstrap()).rejects.toMatchObject({ message: 'ResearchHub Runtime authorization expired. Reload the page.' })
  })
})
