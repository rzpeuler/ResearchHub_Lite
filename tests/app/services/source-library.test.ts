import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createFreshKnowledgeBaseV04 } from '../../../knowledge/storage/create-v04.ts'
import { KnowledgeBaseRegistry } from '../../../knowledge/registry/registry.ts'
import { archiveRaw } from '../../../knowledge/raw/raw-archive.ts'
import { SourceLibraryService } from '../../../app/services/source-library.ts'

test('Source Library is rebuildable from Raw and preserves raw provenance', async () => {
  const root = await mkdtemp(join(tmpdir(), 'rhl-source-library-'))
  const indexRoot = await mkdtemp(join(tmpdir(), 'rhl-source-library-index-'))
  try {
    await createFreshKnowledgeBaseV04(root, { knowledgeBaseId: 'kb-source-library' })
    const handle = await new KnowledgeBaseRegistry().mount(root)
    const archived = await archiveRaw(handle, { bytes: new TextEncoder().encode('PCB supply chain capacity expansion and inventory cycle.'), originalFilename: 'pcb-note.txt', mediaType: 'text/plain', suppliedMetadata: { title: 'PCB note', sourceUrl: 'https://example.test/pcb' } })
    const service = new SourceLibraryService(indexRoot)
    const first = await service.search(handle, { query: 'PCB capacity' })
    assert.equal(first.length, 1)
    assert.equal(first[0]?.rawRef, archived.manifest.rawRef)
    assert.equal(first[0]?.provenance.rawRef, archived.manifest.rawRef)
    const rebuilt = await service.rebuild(handle)
    assert.equal(rebuilt.sourceCount, 1)
    assert.equal((await service.search(handle, { query: 'inventory' }))[0]?.title, 'PCB note')
  } finally { await rm(root, { recursive: true, force: true }); await rm(indexRoot, { recursive: true, force: true }) }
})

test('Source Library returns no hits for an empty query', async () => {
  const root = await mkdtemp(join(tmpdir(), 'rhl-source-library-empty-'))
  const indexRoot = await mkdtemp(join(tmpdir(), 'rhl-source-library-empty-index-'))
  try { await createFreshKnowledgeBaseV04(root, { knowledgeBaseId: 'kb-source-library-empty' }); const handle = await new KnowledgeBaseRegistry().mount(root); assert.deepEqual(await new SourceLibraryService(indexRoot).search(handle, { query: '   ' }), []) } finally { await rm(root, { recursive: true, force: true }); await rm(indexRoot, { recursive: true, force: true }) }
})
