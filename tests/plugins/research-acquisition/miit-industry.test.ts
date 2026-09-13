import assert from 'node:assert/strict'
import test from 'node:test'
import { MiitIndustryResearchPlugin, MIIT_INDUSTRY_ROUTES } from '../../../plugins/research-acquisition/miit-industry.ts'
import { sha256 } from '../../../plugins/research-acquisition/hash.ts'

const req = { industry: { name: 'PCB Manufacturing', aliases: ['Printed Circuit Board', '印制电路板'], searchTerms: ['PCB', '电子信息制造业'] }, asOf: '2026-09-14T00:00:00.000Z', limitPerKind: 8 }
const html = (title: string, url: string, date = '2026-01-02') => `<a href="${url}">${title}</a><span>${date}</span>`
const resolver = { async parse(source: { bytes: Uint8Array }) { return { documentId: 'fixture', parser: 'fixture', metadata: {}, sections: [], blocks: [], normalizedText: new TextDecoder().decode(source.bytes).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(), warnings: [] } } } as any
const response = (body: string, type = 'text/html', url = '') => { const r = new Response(body, { headers: { 'content-type': type } }); if (url) Object.defineProperty(r, 'url', { value: url }); return r }

test('discovers bounded authorized MIIT list pages, ranks, dates and suppresses duplicates', async () => {
  const calls: string[] = []; const plugin = new MiitIndustryResearchPlugin({ documentResolver: resolver, fetchImpl: async (input) => { const url = String(input); calls.push(url); return response(html('PCB policy', 'https://www.miit.gov.cn/a.htm') + html('generic', 'https://www.miit.gov.cn/g.htm') + html('PCB recent', 'https://www.miit.gov.cn/b.htm', '2025-04-01') + '<a href="https://www.miit.gov.cn/jgsj/dzs/wjfb/?page=2">下一页</a>') } })
  const items = await plugin.discover(req); assert.equal(calls.length, 6); assert.ok(calls.every((x) => new URL(x).hostname.endsWith('miit.gov.cn'))); assert.deepEqual(items.map((x) => x.url), ['https://www.miit.gov.cn/a.htm', 'https://www.miit.gov.cn/b.htm']); assert.equal(items[1]!.publishedAt, '2026-01-02T00:00:00.000Z')
})
test('Company is isolated and empty discovery is safe', async () => { let calls = 0; const p = new MiitIndustryResearchPlugin({ fetchImpl: async () => { calls++; throw new Error('network') } }); assert.deepEqual(await p.discover({ company: { symbol: '600519' } }), []); assert.equal(calls, 0); assert.deepEqual(await p.discover({ ...req, industry: { name: 'industry', searchTerms: [] } }), []) })
test('fetch and normalize HTML and directly linked PDF with provenance and rights', async () => {
  const p = new MiitIndustryResearchPlugin({ documentResolver: resolver, fetchImpl: async (input) => { const url = String(input); return response(url.endsWith('.pdf') ? '%PDF official PCB' : '<html><body>official PCB policy</body></html>', url.endsWith('.pdf') ? 'application/pdf' : 'text/html') }, now: () => '2026-09-14T01:00:00.000Z' })
  for (const url of ['https://www.miit.gov.cn/a.htm', 'https://www.miit.gov.cn/file.pdf']) { const c = { candidateId: `miit-${sha256(url)}`, kind: 'web_article' as const, tier: 1 as const, title: 'PCB', provider: 'miit', url }; const n = await p.normalize(await p.fetch(c)); assert.equal(n.publisher, 'Ministry of Industry and Information Technology'); assert.equal(n.contentHash, sha256(n.rawBytes!)); assert.equal(n.rights.redistributionAllowed, false) }
})
test('rejects off-domain candidates, redirects and unsupported or oversized payloads', async () => {
  const evil = new MiitIndustryResearchPlugin({ fetchImpl: async () => response('x', 'text/html', 'https://evil.example/a') }); const url = 'https://www.miit.gov.cn/a.htm'; const c = { candidateId: `miit-${sha256(url)}`, kind: 'web_article' as const, tier: 1 as const, title: 'PCB', provider: 'miit', url }; await assert.rejects(() => evil.fetch(c), /redirect/) ; const bad = new MiitIndustryResearchPlugin({ fetchImpl: async () => response('x', 'application/zip') }); await assert.rejects(() => bad.fetch(c), /unsupported/); const large = new MiitIndustryResearchPlugin({ maxDocumentPayloadBytes: 10, fetchImpl: async () => response('x'.repeat(100)) }); await assert.rejects(() => large.fetch(c), /exceeds bound/); await assert.rejects(() => evil.fetch({ ...c, url: 'https://example.com/a', candidateId: `miit-${sha256('https://example.com/a')}` }), /candidate|MIIT/)
})
test('route families are fixed and candidate contract is compatible', () => { assert.equal(MIIT_INDUSTRY_ROUTES.length, 3); const p = new MiitIndustryResearchPlugin({ routes: ['https://evil.example/'] }); assert.equal(p.name, 'miit-industry-research-acquisition') })
