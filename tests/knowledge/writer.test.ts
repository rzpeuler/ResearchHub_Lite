import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import test from 'node:test'
import { KnowledgeBaseLoaderV03 } from '../../knowledge/storage/loader.ts'
import { KnowledgeBaseRegistry } from '../../knowledge/registry/registry.ts'
import { hashKnowledgeObject } from '../../knowledge/storage/canonical-hash.ts'
import { writeKnowledgeBaseV03 } from '../../knowledge/writer/writer-v03.ts'
import type { KnowledgeChangeSetV03, ValidatedKnowledgeChangeSetV03 } from '../../knowledge/schema/mutation.ts'
import { createKnowledgeBase, readManifest, removeKnowledgeBase } from './helpers.ts'

function changeSet(knowledgeBaseId: string, revision: number, id: string, operations: KnowledgeChangeSetV03['knowledgeOperations'] = []): KnowledgeChangeSetV03 {
  return { changeSetId: id, workflowRunId: `run-${id}`, knowledgeBaseId, schemaVersion: '0.3', storageFormatVersion: '1', expectedBaseRevision: revision, requiresRawProvenance: false, sourceOperations: [], knowledgeOperations: operations }
}
function receipt(changeSetValue: KnowledgeChangeSetV03): ValidatedKnowledgeChangeSetV03 {
  return { changeSet: changeSetValue, knowledgeBaseId: changeSetValue.knowledgeBaseId, schemaVersion: '0.3', baseRevision: changeSetValue.expectedBaseRevision, changeSetId: changeSetValue.changeSetId, changeSetHash: hashKnowledgeObject(changeSetValue), validatedAt: '2026-09-03T00:00:00.000Z' }
}

async function writerFixture() {
  const root = await createKnowledgeBase()
  const registry = new KnowledgeBaseRegistry()
  const handle = await registry.mount(root)
  return { root, registry, handle }
}

test('Writer requires staged validation, commits once, logs, and reloads', async () => {
  const { root, registry, handle } = await writerFixture()
  try {
    const request = changeSet(handle.knowledgeBaseId, 0, 'create-acme', [{ operationId: 'create-acme', type: 'create', object: { id: 'entity:acme', type: 'company', name: 'Acme', lifecycle: { status: 'active' } } }])
    const missingValidator = await writeKnowledgeBaseV03(handle, { receipt: receipt(request), registry, clock: () => '2026-09-03T01:00:00.000Z' })
    assert.equal(missingValidator.status, 'rejected')
    const committed = await writeKnowledgeBaseV03(handle, { receipt: receipt(request), registry, clock: () => '2026-09-03T01:00:00.000Z', stagedStateValidator: async (stagedRoot) => { await new KnowledgeBaseLoaderV03().load(await new KnowledgeBaseLoaderV03().mount(stagedRoot)) } })
    assert.equal(committed.status, 'committed')
    assert.equal(committed.committedRevision, 1)
    assert.equal((await readManifest(root)).revision, 1)
    assert.match(await readFile(join(root, 'logs', 'ingestion', 'run-create-acme.yaml'), 'utf8'), /committedRevision/)
    const reloaded = await new KnowledgeBaseLoaderV03(registry).mount(root)
    assert.equal(reloaded.revision, 1)
    assert.equal((await new KnowledgeBaseLoaderV03(registry).load(reloaded)).entities[0]?.value.id, 'entity:acme')
    const replay = await writeKnowledgeBaseV03(handle, { receipt: receipt(request), registry, clock: () => '2026-09-03T02:00:00.000Z', stagedStateValidator: async () => undefined })
    assert.equal(replay.status, 'already_committed')
  } finally { await removeKnowledgeBase(root) }
})

test('Writer rejects idempotency conflicts, stale revisions, stale hashes, and unsupported KBs', async () => {
  const { root, registry, handle } = await writerFixture()
  try {
    const first = changeSet(handle.knowledgeBaseId, 0, 'same-id', [{ operationId: 'create-one', type: 'create', object: { id: 'entity:one', type: 'company', name: 'One', lifecycle: { status: 'active' } } }])
    const validator = { stagedStateValidator: async () => undefined }
    assert.equal((await writeKnowledgeBaseV03(handle, { receipt: receipt(first), registry, clock: () => '2026-09-03T01:00:00.000Z', ...validator })).status, 'committed')
    const different = changeSet(handle.knowledgeBaseId, 0, 'same-id', [{ operationId: 'create-two', type: 'create', object: { id: 'entity:two', type: 'company', name: 'Two', lifecycle: { status: 'active' } } }])
    assert.equal((await writeKnowledgeBaseV03(handle, { receipt: receipt(different), registry, clock: () => '2026-09-03T01:00:00.000Z', ...validator })).error?.code, 'idempotency_conflict')
    const staleRevision = changeSet(handle.knowledgeBaseId, 0, 'new-id', [])
    assert.equal((await writeKnowledgeBaseV03(handle, { receipt: receipt(staleRevision), registry, clock: () => '2026-09-03T01:00:00.000Z', ...validator })).error?.code, 'stale_base_revision')
    const current = (await new KnowledgeBaseLoaderV03(registry).load(await registry.mount(root))).entities[0]!.value
    const staleHash = changeSet(handle.knowledgeBaseId, 1, 'stale-hash', [{ operationId: 'update-one', type: 'update', knowledgeId: 'entity:one', expectedBeforeHash: hashKnowledgeObject({ id: 'entity:one', type: 'company', name: 'changed', lifecycle: { status: 'active' } }), object: { ...current, name: 'Updated' } }])
    assert.equal((await writeKnowledgeBaseV03(await registry.mount(root), { receipt: receipt(staleHash), registry, clock: () => '2026-09-03T01:00:00.000Z', ...validator })).error?.code, 'stale_target_state')
    const unsupportedRoot = await createKnowledgeBase({ schemaVersion: '0.2' })
    try { await assert.rejects(() => registry.mount(unsupportedRoot)); } finally { await removeKnowledgeBase(unsupportedRoot) }
  } finally { await removeKnowledgeBase(root) }
})

test('no-op semantic mutation does not increment revision', async () => {
  const { root, registry, handle } = await writerFixture()
  try {
    const object = { id: 'entity:stable' as const, type: 'company' as const, name: 'Stable', lifecycle: { status: 'active' as const } }
    const create = changeSet(handle.knowledgeBaseId, 0, 'create-stable', [{ operationId: 'create-stable', type: 'create', object }])
    await writeKnowledgeBaseV03(handle, { receipt: receipt(create), registry, clock: () => '2026-09-03T01:00:00.000Z', stagedStateValidator: async () => undefined })
    const currentHandle = await registry.mount(root)
    const noOp = changeSet(handle.knowledgeBaseId, 1, 'noop', [{ operationId: 'noop', type: 'update', knowledgeId: object.id, expectedBeforeHash: hashKnowledgeObject(object), object }])
    const result = await writeKnowledgeBaseV03(currentHandle, { receipt: receipt(noOp), registry, clock: () => '2026-09-03T02:00:00.000Z', stagedStateValidator: async () => undefined })
    assert.equal(result.status, 'no_changes')
    assert.equal(result.committedRevision, 1)
  } finally { await removeKnowledgeBase(root) }
})
