import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'

function json(body: unknown, status = 200): Response { return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }) }

describe('Homepage shell', () => {
  const originalFetch = globalThis.fetch
  const originalEventSource = globalThis.EventSource
  beforeEach(() => {
    window.history.replaceState({}, '', '/')
    const FakeEventSource = class { onopen: ((event: Event) => void) | null = null; onerror: ((event: Event) => void) | null = null; close = vi.fn(); addEventListener = vi.fn(); removeEventListener = vi.fn() }
    globalThis.EventSource = FakeEventSource as unknown as typeof EventSource
    Object.defineProperty(window, 'EventSource', { configurable: true, value: FakeEventSource })
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const path = String(input)
      if (path === '/api/bootstrap') return json({ runtime: { origin: 'http://127.0.0.1:1234', runtimeToken: 'b'.repeat(64) }, origin: 'http://127.0.0.1:1234', session: { conversationId: 'c1', isStreaming: false, isIdle: true, pendingMessageCount: 0, thinkingLevel: 'off' }, conversations: [], knowledgeError: { code: 'no_kb_mounted', error: 'not mounted' } })
      if (path === '/api/research/workflows') return json({ workflows: [{ id: 'earnings_review', label: 'Earnings Review', intentDescription: 'Review earnings', inputSchema: {}, requiredInputs: ['symbol', 'fiscalYear', 'period'], outputContract: 'ResearchReport', knowledgeEffects: ['Claim'] }] })
      if (path === '/api/conversations/current') return json({ conversationId: 'c1', isStreaming: false, isIdle: true, pendingMessageCount: 0, thinkingLevel: 'off' })
      if (path === '/api/conversations/messages') return json({ conversationId: 'c1', messages: [] })
      if (path === '/api/conversations') return json({ conversations: [] })
      if (path === '/api/daily-briefs?limit=20') return json({ briefs: [] })
      if (path === '/api/research-reports?limit=20') return json({ reports: [] })
      return json({ code: 'not_found', error: 'not found' }, 404)
    }) as typeof fetch
  })
  afterEach(() => { cleanup(); window.history.replaceState({}, '', '/'); globalThis.fetch = originalFetch; globalThis.EventSource = originalEventSource; Object.defineProperty(window, 'EventSource', { configurable: true, value: originalEventSource }) })

  it('loads conversation UI in no-KB mode without rendering the runtime token', async () => {
    render(<App />)
    expect(await screen.findByText('Research conversation')).toBeTruthy()
    expect(screen.getByText('No Knowledge Base mounted')).toBeTruthy()
    expect(document.body.textContent).not.toContain('b'.repeat(64))
  })

  it('renders registry-backed Workflow and safe research policy defaults', async () => {
    render(<App />)
    expect(await screen.findByRole('combobox', { name: 'Workflow' })).toBeTruthy()
    expect(screen.getByRole('option', { name: 'Free Research' })).toBeTruthy()
    expect(screen.getByRole('option', { name: 'Earnings Review' })).toBeTruthy()
    expect((screen.getByRole('checkbox', { name: 'Query Knowledge' }) as HTMLInputElement).checked).toBe(true)
    expect((screen.getByRole('checkbox', { name: 'Search Source Library' }) as HTMLInputElement).checked).toBe(true)
    expect((screen.getByRole('checkbox', { name: 'Write Knowledge' }) as HTMLInputElement).checked).toBe(false)
    fireEvent.click(screen.getByRole('checkbox', { name: 'Write Knowledge' }))
    expect((screen.getByRole('checkbox', { name: 'Write Knowledge' }) as HTMLInputElement).checked).toBe(true)
  })

  it('keeps Review read-only and does not render decision controls', async () => {
    render(<App />)
    await waitFor(() => expect(screen.getByText('Research conversation')).toBeTruthy())
    expect(screen.queryByText('Resolve')).toBeNull()
    expect(screen.queryByText('Approve')).toBeNull()
    expect(screen.queryByText('Reject')).toBeNull()
  })

  it('exposes the six product destinations and keeps Knowledge Graph safe in no-KB mode', async () => {
    render(<App />)
    await waitFor(() => expect(screen.getByRole('link', { name: 'Research' }).getAttribute('aria-current')).toBe('page'))
    expect(screen.getByRole('link', { name: 'Knowledge Graph' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Daily Briefs' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Reports' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Run Research' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Reviews' })).toBeTruthy()
    fireEvent.click(screen.getByRole('link', { name: 'Knowledge Graph' }))
    expect(await screen.findByRole('heading', { name: 'Knowledge Graph' })).toBeTruthy()
    expect(screen.getByText('Mount a canonical Knowledge Base to browse the Directory and explore a rooted graph.')).toBeTruthy()
    expect(screen.queryByRole('canvas')).toBeNull()
    expect(screen.queryByText('Search Knowledge')).toBeNull()
  })

  it('renders the governed Research launcher route', async () => {
    render(<App />)
    await waitFor(() => expect(screen.getByRole('link', { name: 'Run Research' })).toBeTruthy())
    fireEvent.click(screen.getByRole('link', { name: 'Run Research' }))
    expect(await screen.findByRole('heading', { name: 'Run Research' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Start Company' })).toBeTruthy()
    expect(screen.getByText('The runtime creates the Workflow ID and tracks completion in Research.')).toBeTruthy()
  })

  it('renders the Research Report catalog as a read-only route', async () => {
    render(<App />)
    await waitFor(() => expect(screen.getByRole('link', { name: 'Reports' })).toBeTruthy())
    fireEvent.click(screen.getByRole('link', { name: 'Reports' }))
    expect(await screen.findByRole('heading', { name: 'Research Reports' })).toBeTruthy()
    expect(screen.getByText('No persisted Research Reports')).toBeTruthy()
  })

  it('renders the Daily Brief reader as a read-only route', async () => {
    render(<App />)
    await waitFor(() => expect(screen.getByRole('link', { name: 'Daily Briefs' })).toBeTruthy())
    fireEvent.click(screen.getByRole('link', { name: 'Daily Briefs' }))
    expect(await screen.findByRole('heading', { name: 'Daily Briefs' })).toBeTruthy()
    expect(screen.getByText('No persisted Daily Briefs')).toBeTruthy()
  })

  it('renders Reviews as a separate read-only page in no-KB mode', async () => {
    render(<App />)
    await waitFor(() => expect(screen.getByRole('link', { name: 'Reviews' })).toBeTruthy())
    fireEvent.click(screen.getByRole('link', { name: 'Reviews' }))
    expect(await screen.findByRole('heading', { name: 'Review Inbox' })).toBeTruthy()
    expect(screen.getByText('Read-only')).toBeTruthy()
    expect(screen.getByText('No Knowledge Base mounted')).toBeTruthy()
    expect(screen.queryByText('Resolve')).toBeNull()
    expect(screen.queryByText('Approve')).toBeNull()
    expect(screen.queryByText('Reject')).toBeNull()
  })
})
