import assert from 'node:assert/strict'
import { writeFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import test from 'node:test'
import { DocumentInputResolver } from '../../plugins/document/input-resolver.ts'
import { DocumentPluginError } from '../../plugins/document/errors.ts'

test('text input preserves raw bytes and produces Sections/Blocks, not the retired model', async () => {
  const input = 'Heading\r\n\r\nFirst paragraph.\r\n\r\nSecond paragraph.'
  const result = await new DocumentInputResolver().resolve({ type: 'text', text: input, originalFilename: 'report.txt' })
  assert.deepEqual([...result.rawBytes], [...new TextEncoder().encode(input)])
  assert.equal(result.document.parser.id, 'plain-text')
  assert.equal(result.document.blocks.length, 3)
  assert.equal('chunks' in result.document, false)
  assert.deepEqual(result.document.blocks.map((block) => block.order), [1, 2, 3])
})

test('document acquisition and parsing are independently callable', async () => {
  const resolver = new DocumentInputResolver()
  const acquired = await resolver.acquire({ type: 'text', text: 'Acquired text', originalFilename: 'acquired.txt', documentId: 'doc-acquired' })
  assert.equal(acquired.filename, 'acquired.txt')
  assert.equal(acquired.documentId, 'doc-acquired')
  const document = await resolver.parse(acquired)
  assert.equal(document.documentId, 'doc-acquired')
  assert.equal(document.normalizedText, 'Acquired text')
})

test('file input resolves media type and missing references use Document Plugin errors', async () => {
  const path = join(process.cwd(), 'tests', 'document', 'resolver-fixture.md')
  await writeFile(path, '# Title\n\nBody')
  try {
    const result = await new DocumentInputResolver().resolve({ type: 'file', reference: path })
    assert.equal(result.mediaType, 'text/markdown')
    assert.equal(result.originalFilename, 'resolver-fixture.md')
  } finally { await rm(path, { force: true }) }
  await assert.rejects(() => new DocumentInputResolver().resolve({ type: 'file', reference: 'missing-document.pdf' }), (error: unknown) => error instanceof DocumentPluginError && error.code === 'document_read_failed')
})
