import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import test from 'node:test'
import { DoclingDocumentParser } from '../../plugins/document/docling/parser.ts'
import { DocumentPluginError } from '../../plugins/document/errors.ts'

test('Docling bridge output normalizes headings, tables, captions, pages, and stats', async () => {
  const bridgePath = fileURLToPath(new URL('./fixtures/structured-bridge-fixture.py', import.meta.url))
  const result = await new DoclingDocumentParser({ bridgePath, pythonExecutable: 'python', artifactsPath: 'fixture-artifacts' }).parse({ bytes: new Uint8Array([37, 80, 68, 70]), filename: 'fixture.pdf', mediaType: 'application/pdf' })
  assert.equal(result.parser.id, 'docling-local')
  assert.equal(result.parser.version, 'fixture')
  assert.equal(result.sections[0]?.blockRefs.length, 3)
  assert.equal(result.blocks[1]?.type, 'table')
  assert.equal(result.blocks[1]?.structuredContent?.kind, 'table')
  assert.equal(result.blocks[2]?.type, 'caption')
  assert.equal(result.stats.pageCount, 2)
})

test('selected Docling parser reports explicit environment-not-ready errors', async () => {
  const missingPython = join(process.cwd(), 'missing-docling-python.exe')
  await assert.rejects(() => new DoclingDocumentParser({ pythonExecutable: missingPython }).parse({ bytes: new Uint8Array([37, 80, 68, 70]), filename: 'fixture.pdf', mediaType: 'application/pdf' }), (error: unknown) => error instanceof DocumentPluginError && error.code === 'document_parser_environment_not_ready')
})
