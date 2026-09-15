import assert from 'node:assert/strict'
import test from 'node:test'
import { CninfoOfficialDisclosureClient } from '../../../plugins/research-acquisition/official.ts'

test('CNINFO PDF fetch preserves bytes and obtains normalized text only through the Document seam', async () => {
  const bytes = Uint8Array.from([37, 80, 68, 70, 45, 49, 46, 55])
  let parsedBytes: Uint8Array | undefined
  const response = new Response(bytes, { status: 200, headers: { 'content-type': 'application/pdf' } })
  Object.defineProperty(response, 'text', { value: () => { throw new Error('PDF response.text() must not be used') } })
  const client = new CninfoOfficialDisclosureClient({ fetchImpl: async () => response, documentResolver: { parse: async (input) => { parsedBytes = input.bytes; return { documentId: 'doc-fixture', normalizedText: 'Document seam text', sections: [], blocks: [], parser: 'fixture', stats: {}, warnings: [] } as never } } })
  const result = await client.fetchDocument({ title: 'fixture', url: 'https://static.cninfo.com.cn/fixture.pdf', publishedAt: '2026-09-08' })
  assert.deepEqual([...result.bytes], [...bytes])
  assert.deepEqual([...parsedBytes!], [...bytes])
  assert.equal(result.content, 'Document seam text')
  assert.equal(result.mediaType, 'application/pdf')
})

test('CNINFO Industry discovery uses bounded public full-text disclosure search', async () => {
  const requests: string[] = []
  const response = new Response(JSON.stringify({ announcements: [
    { announcementTitle: '印制电路板扩产项目公告', adjunctUrl: '/finalpage/2026-06-01/123.PDF', announcementTime: 1780272000000, secName: '示例电子' },
    { announcementTitle: '未来日期公告', adjunctUrl: '/finalpage/2026-12-01/456.PDF', announcementTime: 1796083200000 },
  ] }), { status: 200, headers: { 'content-type': 'application/json' } })
  const client = new CninfoOfficialDisclosureClient({ fetchImpl: async (input) => { requests.push(String(input)); return response.clone() } })
  const result = await client.listIndustry({ industry: { name: 'PCB Manufacturing', aliases: ['印制电路板'], searchTerms: ['PCB capacity'] }, asOf: '2026-09-14T00:00:00.000Z' })
  assert.equal(result.length, 1)
  assert.equal(result[0]?.title, '印制电路板扩产项目公告')
  assert.match(result[0]?.url ?? '', /^https:\/\/static\.cninfo\.com\.cn\//)
  assert.equal(requests.length, 6)
})

test('CNINFO Company discovery falls back to bounded public name search when stock lookup is empty', async () => {
  const bodies: string[] = []
  const responses = [
    new Response(JSON.stringify({ announcements: [] }), { status: 200 }),
    new Response(JSON.stringify({ announcements: [{ announcementTitle: '贵州茅台年度报告', adjunctUrl: '/finalpage/2026-04-01/789.PDF', announcementTime: 1775001600000 }] }), { status: 200 }),
  ]
  const client = new CninfoOfficialDisclosureClient({ fetchImpl: async (_input, init) => { bodies.push(String(init?.body)); return responses.shift()! } })
  const result = await client.list({ company: { symbol: '600519', name: '贵州茅台', exchange: 'SSE' }, asOf: '2026-09-14T00:00:00.000Z', limitPerKind: 3 })
  assert.equal(result.length, 1)
  assert.match(bodies[0]!, /stock=600519/)
  assert.match(bodies[1]!, /searchkey=%E8%B4%B5%E5%B7%9E%E8%8C%85%E5%8F%B0/)
})
