import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { KnowledgeGraphPage } from './KnowledgeGraphPage'
import type { RuntimeClient } from '../../api/runtime-client'

describe('KnowledgeGraphPage', () => {
  beforeEach(() => {
    window.history.replaceState({}, '', '/graph')
    Object.defineProperty(globalThis, 'ResizeObserver', { configurable: true, value: class { observe() {} unobserve() {} disconnect() {} } })
    Object.defineProperty(window, 'matchMedia', { configurable: true, value: () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent: () => false }) })
  })
  afterEach(() => cleanup())

  it('shows the empty root state and focuses a Directory entity into URL state', async () => {
    const client = {
      getKnowledgeDirectory: vi.fn().mockResolvedValue({ themeGroups: [], industries: { items: [{ ref: 'entity:industry', name: 'Semiconductors' }], total: 1, limit: 30, truncated: false }, companies: { items: [], total: 0, limit: 30, truncated: false }, products: { items: [], total: 0, limit: 30, truncated: false }, technologies: { items: [], total: 0, limit: 30, truncated: false } }),
      getKnowledgeGraph: vi.fn().mockResolvedValue({ rootRef: 'entity:industry', profile: 'industry_context', depth: 1, nodes: [{ ref: 'entity:industry', entityType: 'industry', label: 'Semiconductors', lifecycleStatus: 'active', isRoot: true }, { ref: 'entity:technology', entityType: 'technology', label: 'HBM', lifecycleStatus: 'active', isRoot: false }], edges: [{ ref: 'relation:industry-tech', relationType: 'depends_on', sourceRef: 'entity:industry', targetRef: 'entity:technology', label: 'depends on' }], nodeTotal: 2, edgeTotal: 1, nodeLimit: 60, edgeLimit: 120, truncated: false }),
      getKnowledgeObject: vi.fn(),
      searchKnowledge: vi.fn(),
    } as unknown as RuntimeClient
    render(<KnowledgeGraphPage knowledgeBase={{ knowledgeBaseId: 'kb' }} client={client} />)
    expect(await screen.findByText('Select a root to explore')).toBeTruthy()
    fireEvent.click(await screen.findByRole('button', { name: /Semiconductors/ }))
    await waitFor(() => expect(client.getKnowledgeGraph).toHaveBeenCalledWith({ rootRef: 'entity:industry', depth: 1 }))
    expect(window.location.search).toBe('?root=entity%3Aindustry')
    expect(await screen.findByText('2 nodes · 1 relations')).toBeTruthy()
    expect(screen.getByText('Read-only')).toBeTruthy()
    expect(screen.queryByText('Connect')).toBeNull()
  })
})
