import assert from 'node:assert/strict'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { TradingCalendarService } from '../../plugins/daily-intelligence/calendar.ts'
import { DailyBriefScheduler } from '../../plugins/daily-intelligence/scheduler.ts'
test('scheduler is weekend-aware and restart-safe', async () => { const root = await mkdtemp(join(tmpdir(), 'rhl-scheduler-')); const calls: string[] = []; const calendar = new TradingCalendarService({ cachePath: join(root, 'calendar.json') }); const scheduler = new DailyBriefScheduler({ statePath: join(root, 'state.json'), calendar, run: async (type, date) => { calls.push(`${type}:${date}`); return { status: 'completed' } } }); assert.deepEqual(await scheduler.tick('2026-09-06'), []); assert.equal((await scheduler.tick('2026-09-07')).length, 2); assert.equal((await scheduler.tick('2026-09-07')).every((item) => item.status === 'already_completed'), true); assert.equal(calls.length, 2) })
