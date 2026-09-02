import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import test from 'node:test'
import { createHash } from 'node:crypto'
import { archiveRaw, deriveRawIdentity, getRaw, readRaw } from '../../knowledge/raw/index.ts'
import { KnowledgeBaseLoaderV03 } from '../../knowledge/storage/loader.ts'
import { KnowledgeError } from '../../knowledge/storage/errors.ts'
import { canonicalSerialize, hashKnowledgeObject } from '../../knowledge/storage/canonical-hash.ts'
import { KnowledgeBaseRegistry } from '../../knowledge/registry/registry.ts'
import { allocateEntityId, allocateSourceId } from '../../knowledge/registry/id-allocation.ts'
import { createKnowledgeBase, readManifest, removeKnowledgeBase } from './helpers.ts'

test('Raw identity is content-derived and archival is immutable/idempotent', async () => {
  const root = await createKnowledgeBase()
  try {
    const handle = await new KnowledgeBaseLoaderV03().mount(root)
    const first = await archiveRaw(handle, { bytes: Buffer.from('same'), originalFilename: 'first.txt', mediaType: 'text/plain', suppliedMetadata: { title: 'First' } }, { clock: () => '2026-09-03T01:00:00.000Z' })
    const replay = await archiveRaw(handle, { bytes: Buffer.from('same'), originalFilename: 'second.pdf', suppliedMetadata: { title: 'Second' } })
    const other = await archiveRaw(handle, { bytes: Buffer.from('different') })
    assert.equal(first.manifest.rawRef, deriveRawIdentity(Buffer.from('same')).rawRef)
    assert.equal(replay.reused, true)
    assert.deepEqual(replay.manifest, first.manifest)
    assert.notEqual(other.manifest.rawRef, first.manifest.rawRef)
    assert.equal((await readRaw(handle, first.manifest.rawRef)).toString(), 'same')
    assert.equal((await getRaw(handle, first.manifest.rawRef)).manifest.receivedAt, '2026-09-03T01:00:00.000Z')
    assert.equal((await readManifest(root)).revision, 0)
  } finally { await removeKnowledgeBase(root) }
})

test('canonical serialization orders keys and ID allocation is deterministic', () => {
  assert.equal(canonicalSerialize({ b: 2, a: 1 }), '{"a":1,"b":2}')
  assert.equal(hashKnowledgeObject({ a: 1, b: 2 }), 'sha256:' + createHash('sha256').update('{"a":1,"b":2}').digest('hex'))
  assert.equal(allocateEntityId('company', 'Acme'), allocateEntityId('company', 'Acme'))
  assert.equal(allocateSourceId({ rawRef: 'raw-sha256-' + 'a'.repeat(64) }), allocateSourceId({ rawRef: 'raw-sha256-' + 'a'.repeat(64) }))
})

test('v0.3 loader resolves registry assets and rejects unsupported or unsafe storage', async () => {
  const root = await createKnowledgeBase()
  try {
    await mkdir(join(root, 'entities', 'company'), { recursive: true })
    await writeFile(join(root, 'entities', 'company', 'acme.yaml'), JSON.stringify({ id: 'entity:acme', type: 'company', name: 'Acme', lifecycle: { status: 'active' } }) + '\n')
    await writeFile(join(root, 'registry', 'assets.yaml'), JSON.stringify({ 'entity:acme': { type: 'entity', storageRef: 'entities/company/acme.yaml' } }) + '\n')
    const registry = new KnowledgeBaseRegistry()
    const handle = await registry.mount(root)
    const assets = await new KnowledgeBaseLoaderV03(registry).load(handle)
    assert.equal(assets.entities[0]?.value.name, 'Acme')
    await writeFile(join(root, 'registry', 'assets.yaml'), JSON.stringify({ 'entity:acme': { type: 'entity', storageRef: '../outside.yaml' } }) + '\n')
    await assert.rejects(() => new KnowledgeBaseLoaderV03().mount(root).then((mounted) => new KnowledgeBaseLoaderV03().load(mounted)), (error: unknown) => error instanceof KnowledgeError && error.code === 'RegistryError')
  } finally { await removeKnowledgeBase(root) }
})
