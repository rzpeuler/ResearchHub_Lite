import assert from 'node:assert/strict'
import { access, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import test from 'node:test'
import { KnowledgeBaseLoaderV03 } from '../../knowledge/storage/loader.ts'
import { KnowledgeMutationLockError, withKnowledgeBaseMutationLock } from '../../knowledge/storage/mutation-lock.ts'
import { recoverKnowledgeBaseRoot, runKnowledgeRootTransaction } from '../../knowledge/storage/root-transaction.ts'
import { createKnowledgeBase, readManifest, removeKnowledgeBase } from './helpers.ts'

test('mutation lock serializes ownership and transaction validation prevents partial state', async () => {
  const root = await createKnowledgeBase()
  try {
    let active = 0
    let maximum = 0
    await Promise.all([1, 2].map(() => withKnowledgeBaseMutationLock(root, async () => { active += 1; maximum = Math.max(maximum, active); await new Promise((resolve) => setTimeout(resolve, 5)); active -= 1 })))
    assert.equal(maximum, 1)
    assert.equal(KnowledgeMutationLockError.prototype instanceof Error, true)
    await assert.rejects(() => runKnowledgeRootTransaction({ rootRef: root, transactionId: 'invalid-stage', transactionKind: 'write', knowledgeBaseId: 'kb-test', previousRevision: 0, nextRevision: 1, targetSchemaVersion: '0.3', targetStorageFormatVersion: '1', prepare: async (staged) => { await readFile(join(staged, 'manifest.yaml')) }, validate: async () => { throw new Error('invalid staged state') } }))
    assert.equal((await readManifest(root)).revision, 0)
    await access(`${root}.recovery.json`).then(() => assert.fail('recovery marker should be removed')).catch(() => undefined)
  } finally { await removeKnowledgeBase(root) }
})

test('root transaction can recover a switch interrupted after the root is moved', async () => {
  const root = await createKnowledgeBase()
  try {
    await assert.rejects(() => runKnowledgeRootTransaction({ rootRef: root, transactionId: 'recoverable', transactionKind: 'write', knowledgeBaseId: 'kb-test', previousRevision: 0, nextRevision: 1, targetSchemaVersion: '0.3', targetStorageFormatVersion: '1', prepare: async (staged) => { const manifest = JSON.parse(await readFile(join(staged, 'manifest.yaml'), 'utf8')) as Record<string, unknown>; manifest.revision = 1; await import('node:fs/promises').then(({ writeFile }) => writeFile(join(staged, 'manifest.yaml'), JSON.stringify(manifest) + '\n')) }, validate: async (staged) => { await new KnowledgeBaseLoaderV03().load(await new KnowledgeBaseLoaderV03().mount(staged)) }, failpoint: (point) => { if (point === 'during_switch') throw new Error('interrupt') } }))
    await assert.rejects(() => readFile(join(root, 'manifest.yaml')))
    assert.equal(await recoverKnowledgeBaseRoot(root), 'recovered')
    assert.equal((await readManifest(root)).revision, 1)
  } finally { await removeKnowledgeBase(root); await import('node:fs/promises').then(({ rm }) => rm(`${root}.recovery.json`, { force: true })) }
})
