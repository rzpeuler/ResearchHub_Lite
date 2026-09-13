import test from 'node:test'
import assert from 'node:assert/strict'
import { classifySitewide, extractContract, filterOfficialUrls, CLASSIFICATIONS, MAX_DOCUMENT_REQUESTS, MAX_REQUESTS, officialHttps } from './govcn-sitewide-search-route-probe.ts'

const page = `<form action="/sousuo/search.shtml" method="get"><input type="hidden" name="site" value="gov"><input type="text" name="keyword"></form>`

test('extracts only public route-contract fields from an official form', () => {
  assert.deepEqual(extractContract(page), { action: 'https://sousuo.www.gov.cn/sousuo/search.shtml', method: 'GET', queryParameter: 'keyword', fixedParameters: { site: 'gov' }, source: 'official search form' })
  assert.equal(extractContract('<html><body>client-only search</body></html>'), undefined)
})

test('official URL filtering is HTTPS gov.cn-only and deduplicated', () => {
  assert.equal(officialHttps('https://www.gov.cn/a'), true)
  assert.equal(officialHttps('http://www.gov.cn/a'), false)
  assert.deepEqual(filterOfficialUrls(['https://www.gov.cn/a', 'https://example.com/a', '/x', 'https://www.gov.cn/a']), ['https://www.gov.cn/a', 'https://sousuo.www.gov.cn/x'])
})

test('classification is fail-closed and exact', () => {
  assert.deepEqual(CLASSIFICATIONS, ['SITEWIDE_OFFICIAL_ROUTE_PROVEN', 'SITEWIDE_ROUTE_REACHABLE_NO_PCB_MATCH', 'SITEWIDE_ROUTE_CONTRACT_UNRESOLVED', 'LIVE_SOURCE_INCONCLUSIVE'])
  assert.equal(classifySitewide([{ parseOutcome: 'PARSED', pcbMatchCount: 1 }], extractContract(page), 1, false), 'SITEWIDE_OFFICIAL_ROUTE_PROVEN')
  assert.equal(classifySitewide([{ parseOutcome: 'PARSED', pcbMatchCount: 0 }], extractContract(page), 0, false), 'SITEWIDE_ROUTE_REACHABLE_NO_PCB_MATCH')
  assert.equal(classifySitewide([], undefined, 0, false), 'SITEWIDE_ROUTE_CONTRACT_UNRESOLVED')
  assert.equal(classifySitewide([{ parseOutcome: 'HTTP_FAILURE', pcbMatchCount: 0 }], extractContract(page), 0, true), 'LIVE_SOURCE_INCONCLUSIVE')
})

test('request limits are bounded by the task contract', () => { assert.equal(MAX_REQUESTS, 24); assert.equal(MAX_DOCUMENT_REQUESTS, 2) })
