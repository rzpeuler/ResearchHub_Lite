import test from 'node:test'
import assert from 'node:assert/strict'
import { classifyRouteIsolation, officialHttps, ROUTES } from './govcn-official-source-route-isolation.ts'

test('classification is fail-closed and uses only the four task values', () => {
  assert.equal(classifyRouteIsolation([{ routeId: 'alternate-www-search-html', parseOutcome: 'PARSED', pcbTargetMatchCount: 1 }], 1, false), 'ALTERNATE_OFFICIAL_ROUTE_PROVEN')
  assert.equal(classifyRouteIsolation([{ routeId: 'control', parseOutcome: 'PARSED', pcbTargetMatchCount: 0 }], 0, false), 'OFFICIAL_SOURCE_COVERAGE_GAP')
  assert.equal(classifyRouteIsolation([{ routeId: 'alternate-www-search-html', parseOutcome: 'PARSED', pcbTargetMatchCount: 1 }], 0, false), 'OFFICIAL_SOURCE_COVERAGE_GAP')
  assert.equal(classifyRouteIsolation([{ routeId: 'alternate-www-search-html', parseOutcome: 'UNKNOWN_STRUCTURE', pcbTargetMatchCount: 1 }], 0, false), 'LIVE_SOURCE_INCONCLUSIVE')
  assert.equal(classifyRouteIsolation([{ routeId: 'alternate-www-search-html', parseOutcome: 'PARSED', pcbTargetMatchCount: 0 }], 0, true), 'LIVE_SOURCE_INCONCLUSIVE')
})

test('route catalog is HTTPS government-only and bounded', () => {
  assert.ok(ROUTES.length <= 3)
  for (const route of ROUTES) assert.equal(officialHttps(route.url), true)
})

test('offline classification does not require network access', () => {
  assert.equal(classifyRouteIsolation([], 0, false), 'OFFICIAL_SOURCE_COVERAGE_GAP')
})
