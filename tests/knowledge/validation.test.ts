import test from 'node:test'
import assert from 'node:assert/strict'
import { createKnowledgeBase, removeKnowledgeBase } from './helpers.ts'
import { KnowledgeBaseRegistry } from '../../knowledge/registry/registry.ts'
import { validateKnowledgeBaseV03 } from '../../knowledge/validation/v03-validator.ts'
import { validateKnowledgeChangeSetV03 } from '../../knowledge/validation/v03-change-set-validator.ts'

test('deterministic v0.3 validator accepts an empty fixture and rejects undeclared ChangeSet objects', async () => {
  const root = await createKnowledgeBase()
  try {
    assert.equal((await validateKnowledgeBaseV03(root)).status, 'passed')
    const handle = await new KnowledgeBaseRegistry().mount(root)
    const result = await validateKnowledgeChangeSetV03(handle, {
      changeSetId: 'changeset-invalid', workflowRunId: 'run-invalid', knowledgeBaseId: handle.knowledgeBaseId,
      schemaVersion: '0.3', storageFormatVersion: '1', expectedBaseRevision: 0, requiresRawProvenance: false,
      sourceOperations: [], knowledgeOperations: [{ operationId: 'create-001', type: 'create', object: { id: 'entity:bad', type: 'company', name: 'Bad', lifecycle: { status: 'active' }, arbitrary: true } as never }],
    })
    assert.equal(result.report.status, 'failed')
    assert.ok(result.report.errors.some((item) => item.code === 'V03_UNDECLARED_FIELD'))
  } finally { await removeKnowledgeBase(root) }
})

