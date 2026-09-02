import assert from 'node:assert/strict'
import test from 'node:test'
import { DocumentPluginError } from '../../plugins/document/errors.ts'
import { validateStructuredDocument } from '../../plugins/document/validation.ts'
import type { StructuredDocument } from '../../plugins/document/contracts.ts'

function documentFixture(): StructuredDocument {
  return {
    documentId: 'document-test', parser: { id: 'fixture', version: '1' }, metadata: { originalFilename: 'test.txt', mediaType: 'text/plain' }, normalizedText: 'Heading\n\nBody',
    sections: [{ sectionId: 'section-1', title: 'Heading', level: 1, parentSectionRef: null, blockRefs: ['block-1', 'block-2'], pageStart: null, pageEnd: null }],
    blocks: [
      { blockId: 'block-1', type: 'heading', text: 'Heading', sectionRef: 'section-1', page: null, locator: { page: null, parserItemRef: '1' }, order: 1 },
      { blockId: 'block-2', type: 'paragraph', text: 'Body', sectionRef: 'section-1', page: null, locator: { page: null, parserItemRef: '2' }, order: 2 },
    ],
    stats: { pageCount: null, sectionCount: 1, blockCount: 2, normalizedCharacters: 13, tableCount: 0, headingCount: 1, listCount: 0, captionCount: 0 }, warnings: [],
  }
}

test('valid StructuredDocument validates with deterministic block order', () => {
  const document = validateStructuredDocument(documentFixture())
  assert.deepEqual(document.blocks.map((block) => block.blockId), ['block-1', 'block-2'])
})

for (const [name, mutate] of [
  ['duplicate section ID', (value: StructuredDocument) => ({ ...value, sections: [...value.sections, { ...value.sections[0]! }] })],
  ['duplicate block ID', (value: StructuredDocument) => ({ ...value, blocks: [...value.blocks, { ...value.blocks[0]!, order: 3 }] })],
  ['dangling section ref', (value: StructuredDocument) => ({ ...value, blocks: value.blocks.map((block, index) => index === 0 ? { ...block, sectionRef: 'missing' } : block) })],
  ['dangling block ref', (value: StructuredDocument) => ({ ...value, sections: value.sections.map((section) => ({ ...section, blockRefs: ['missing'] })) })],
  ['cyclic section hierarchy', (value: StructuredDocument) => ({ ...value, sections: [{ ...value.sections[0]!, parentSectionRef: 'section-1' }] })],
  ['unsupported block type', (value: StructuredDocument) => ({ ...value, blocks: value.blocks.map((block, index) => index === 0 ? { ...block, type: 'unknown' } : block) })],
] as const) {
  test(`${name} is rejected`, () => assert.throws(() => validateStructuredDocument(mutate(documentFixture()) as StructuredDocument), (error: unknown) => error instanceof DocumentPluginError && error.code === 'document_structure_invalid'))
}
