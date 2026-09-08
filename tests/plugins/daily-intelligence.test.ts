import assert from 'node:assert/strict'
import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { FileDailySignalStore } from '../../plugins/daily-intelligence/signal-store.ts'
import { clusterDailySignals, deduplicateDailySignals, rankDailySignals } from '../../plugins/daily-intelligence/signal-intelligence.ts'
import type { DailyResearchSignal } from '../../plugins/daily-intelligence/contracts.ts'

function signal(id: string, url = `https://example.test/${id}`): DailyResearchSignal { return { signalId: id, kind: 'news', category: 'news', provider: 'fixture', source: { candidateId: id, kind: 'news', tier: 3, title: `Signal ${id}`, url, provider: 'fixture' }, discoveredAt: '2026-09-08T01:00:00.000Z', publishedAt: '2026-09-08T00:00:00.000Z', entities: ['600519'], themes: ['AI'], title: `Signal ${id}`, contentHash: id, relevance: 0.8, novelty: 0.5, importance: 0.5, sourceTier: 3 } }
test('daily signals are append-safe, deduplicated, clustered, and ranked deterministically', async () => { const root = await mkdtemp(join(tmpdir(), 'rhl-daily-')); const store = new FileDailySignalStore(join(root, 'signals.jsonl')); const one = signal('one'); const duplicate = signal('two', one.source.url); assert.deepEqual(await store.appendMany([one, one]), { appended: 1, skipped: 1 }); assert.deepEqual(deduplicateDailySignals([one, duplicate]).map((item) => item.signalId), ['one']); const clusters = clusterDailySignals([one, signal('three')]); assert.equal(clusters.length, 2); assert.equal(rankDailySignals([one], '2026-09-08T02:00:00.000Z', 5)[0]?.signalId, 'one'); assert.equal((await store.listWindow('2026-09-08T00:00:00.000Z', '2026-09-08T23:59:59.000Z')).length, 1); assert.match(await readFile(join(root, 'signals.jsonl'), 'utf8'), /"signalId":"one"/) })
