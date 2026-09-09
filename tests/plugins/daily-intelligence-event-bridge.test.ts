import { mkdtemp } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import test from 'node:test'
import assert from 'node:assert/strict'
import { FileDailySignalStore } from '../../plugins/daily-intelligence/signal-store.ts'
import { isEventResearchSignalStore, type DailyResearchSignal, type DailySignalStore, type EventResearchSignalStore } from '../../plugins/daily-intelligence/contracts.ts'

function signal(signalId: string, publishedAt = '2026-09-08T00:00:00.000Z'): DailyResearchSignal {
  return {
    signalId,
    kind: 'news',
    category: 'news',
    provider: 'fixture',
    source: { candidateId: signalId, kind: 'news', tier: 3, title: signalId, provider: 'fixture' },
    publishedAt,
    discoveredAt: publishedAt,
    entities: ['600519'],
    themes: [],
    title: signalId,
    contentHash: signalId,
    relevance: 0.8,
    novelty: 0.5,
    importance: 0.5,
    sourceTier: 3,
  }
}

test('Daily Signal bridge performs exact lookup and preserves append/list behavior', async () => {
  const root = await mkdtemp(join(tmpdir(), 'rhl-event-bridge-'))
  const store: EventResearchSignalStore = new FileDailySignalStore(join(root, 'signals.jsonl'))
  const selected = signal('signal-event-1')
  const outsideWindow = signal('signal-event-2', '2026-09-07T00:00:00.000Z')

  assert.deepEqual(await store.appendMany([selected, outsideWindow, selected]), { appended: 2, skipped: 1 })
  assert.deepEqual(await store.getById(selected.signalId), selected)
  assert.equal(await store.getById('signal-event'), undefined)
  assert.equal(await store.getById('missing'), undefined)
  assert.deepEqual(await store.listWindow('2026-09-08T00:00:00.000Z', '2026-09-08T23:59:59.000Z'), [selected])
})

test('legacy append/list-only Daily Signal stores remain compatible and fail the event capability check', async () => {
  const legacyStore: DailySignalStore = {
    async appendMany(signals) { return { appended: signals.length, skipped: 0 } },
    async listWindow() { return [] },
  }

  assert.equal(isEventResearchSignalStore(legacyStore), false)
  assert.deepEqual(await legacyStore.appendMany([signal('legacy')]), { appended: 1, skipped: 0 })
  assert.deepEqual(await legacyStore.listWindow('2026-09-08T00:00:00.000Z', '2026-09-08T23:59:59.000Z'), [])
})
