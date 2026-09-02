import assert from 'node:assert/strict'
import test from 'node:test'
import { DocumentPluginError } from '../../plugins/document/errors.ts'
import { DocumentParserRegistry } from '../../plugins/document/parser-registry.ts'
import { PlainTextDocumentParser } from '../../plugins/document/text-parser.ts'

test('parser registry selects explicitly and rejects unsupported providers without fallback', () => {
  const parser = new PlainTextDocumentParser()
  const registry = new DocumentParserRegistry([parser])
  assert.deepEqual(registry.providerIds, ['plain-text'])
  assert.equal(registry.select({ filename: 'note.txt', mediaType: 'text/plain' }, 'plain-text'), parser)
  assert.throws(() => registry.select({ filename: 'note.txt', mediaType: 'text/plain' }, 'docling-local'), (error: unknown) => error instanceof DocumentPluginError && error.code === 'document_parser_unavailable')
  assert.throws(() => registry.select({ filename: 'note.pdf', mediaType: 'application/pdf' }), (error: unknown) => error instanceof DocumentPluginError && error.code === 'document_parser_unsupported')
  assert.throws(() => new DocumentParserRegistry([parser, parser]), /Duplicate document parser ID/)
})
