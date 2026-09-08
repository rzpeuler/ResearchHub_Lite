import assert from 'node:assert/strict'
import { test } from 'node:test'
import { loadSourceCatalog, loadDailyWatchlist } from '../../plugins/daily-intelligence/config.ts'
test('daily source catalog and explicit watchlist are bounded configuration', async () => { const catalog = await loadSourceCatalog('config/research-sources/catalog.yaml'); assert.ok(catalog.length >= 30); assert.ok(catalog.every((item) => item.platform && item.accountId && item.displayName && item.evidenceUrl && typeof item.enabled === 'boolean')); const watchlist = await loadDailyWatchlist(); assert.ok(watchlist.companies.length >= 1); assert.ok(watchlist.themes.length >= 1) })
