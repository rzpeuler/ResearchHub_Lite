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
