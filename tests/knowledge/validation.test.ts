import test from 'node:test'
import assert from 'node:assert/strict'
import { createKnowledgeBase, removeKnowledgeBase } from './helpers.ts'
import { KnowledgeBaseRegistry } from '../../knowledge/registry/registry.ts'
import { validateKnowledgeBaseV03 } from '../../knowledge/validation/v03-validator.ts'
import { validateKnowledgeChangeSetV03 } from '../../knowledge/validation/v03-change-set-validator.ts'
import { validateV03CanonicalObject, validateRelationAttributesV03 } from '../../knowledge/validation/v03-validation-core.ts'
import type { ValidationDiagnostic } from '../../knowledge/validation/types.ts'

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

test('ChangeSet runtime guards return a failed report instead of throwing', async () => {
  const root = await createKnowledgeBase()
  try {
    const handle = await new KnowledgeBaseRegistry().mount(root)
    const result = await validateKnowledgeChangeSetV03(handle, null as never)
    assert.equal(result.report.status, 'failed')
    assert.ok(result.report.errors.some((item) => item.code === 'V03_CHANGESET_INVALID'))
  } finally { await removeKnowledgeBase(root) }
})

test('requiresRawProvenance rejects an affected Source without valid RawRefs', async () => {
  const root = await createKnowledgeBase()
  try {
    const handle = await new KnowledgeBaseRegistry().mount(root)
    const result = await validateKnowledgeChangeSetV03(handle, {
      changeSetId: 'changeset-source-provenance', workflowRunId: 'run-source-provenance', knowledgeBaseId: handle.knowledgeBaseId,
      schemaVersion: '0.3', storageFormatVersion: '1', expectedBaseRevision: 0, requiresRawProvenance: true,
      sourceOperations: [{ operationId: 'source-create-001', type: 'source_create', source: { id: 'source:missing-raw', title: 'Missing raw', sourceType: 'unknown', rawRefs: [], lifecycle: { status: 'active' } } }], knowledgeOperations: [],
    })
    assert.equal(result.report.status, 'failed')
    assert.ok(result.report.errors.some((item) => item.code === 'V03_RAW_PROVENANCE_REQUIRED'))
  } finally { await removeKnowledgeBase(root) }
})

function coreContext(objects: Record<string, unknown>[] = []): { objects: Map<string, { kind: 'entity' | 'relation' | 'source' | 'claim' | 'module' | 'theme_group'; object: Record<string, unknown> }>; rawRefs: Set<string>; taxonomyRefs: Set<string> } {
  return { objects: new Map(objects.map((object) => [String(object.id), { kind: String(object.id).startsWith('entity:') ? 'entity' : String(object.id).startsWith('source:') ? 'source' : 'claim', object }] as const)), rawRefs: new Set(), taxonomyRefs: new Set() }
}

test('Schema 0.3 validation locks financial contribution and Module/Claim shapes', () => {
  const company = { id: 'entity:company', type: 'company', name: 'Company', lifecycle: { status: 'active' } }
  const industry = { id: 'entity:industry', type: 'industry', name: 'Industry', lifecycle: { status: 'active' } }
  const cases = [
    { object: { id: 'relation:financial-range', type: 'business_exposure', sourceRef: company.id, targetRef: industry.id, attributes: { financialContribution: { revenueShare: 1.1 } }, lifecycle: { status: 'active' } }, code: 'V03_RELATION_ATTRIBUTE_INVALID' },
    { object: { id: 'relation:financial-boolean', type: 'business_exposure', sourceRef: company.id, targetRef: industry.id, attributes: { financialContribution: { separatelyReported: 'yes' } }, lifecycle: { status: 'active' } }, code: 'V03_RELATION_ATTRIBUTE_INVALID' },
    { object: { id: 'module:bad-schema', type: 'table', schemaId: 7 }, code: 'V03_FIELD_TYPE' },
    { object: { id: 'claim:bad-metric', claimType: 'fact', statement: 'x', subjectRefs: [company.id], sourceRefs: [], structuredValue: { metric: '', value: 1, unit: 'USD', comparator: null }, lifecycle: { status: 'active' } }, code: 'V03_STRUCTURED_VALUE_INVALID' },
  ] as const
  for (const item of cases) { const diagnostics: ValidationDiagnostic[] = []; validateV03CanonicalObject({ kind: item.object.id.startsWith('relation:') ? 'relation' : item.object.id.startsWith('module:') ? 'module' : 'claim', object: item.object }, coreContext([company, industry]), diagnostics); assert.ok(diagnostics.some((diagnostic) => diagnostic.code === item.code)) }
})

test('shared Relation attribute authority stays in parity with canonical validation', () => {
  const company = { id: 'entity:company', type: 'company', name: 'Company', lifecycle: { status: 'active' } }
  const industry = { id: 'entity:industry', type: 'industry', name: 'Industry', lifecycle: { status: 'active' } }
  const cases = [
    { type: 'theme_exposure', attributes: { importance: 'core' }, valid: true },
    { type: 'theme_exposure', attributes: { importance: 'important' }, valid: false },
    { type: 'offers_product', attributes: { importance: 'core' }, valid: false },
    { type: 'business_exposure', attributes: { financialContribution: { revenueShare: 0.5 } }, valid: true },
    { type: 'business_exposure', attributes: { financialContribution: { revenueShare: 2 } }, valid: false },
  ] as const
  for (const item of cases) {
    const shared = validateRelationAttributesV03(item.type, item.attributes)
    assert.equal(shared.valid, item.valid)
    const diagnostics: ValidationDiagnostic[] = []
    validateV03CanonicalObject({ kind: 'relation', object: { id: `relation:${item.type}-${item.valid}`, type: item.type, sourceRef: company.id, targetRef: industry.id, attributes: item.attributes, lifecycle: { status: 'active' } } }, coreContext([company, industry]), diagnostics)
    assert.equal(diagnostics.some((diagnostic) => diagnostic.code === 'V03_RELATION_ATTRIBUTE_INVALID' || diagnostic.code === 'V03_NUMERIC_CONSTRAINT'), !item.valid)
  }
})

test('commit validation rejects an inactive Knowledge Base and duplicate mutation targets', async () => {
  const root = await createKnowledgeBase({ status: 'archived' })
  try {
    const handle = await new KnowledgeBaseRegistry().mount(root)
    const inactive = await validateKnowledgeChangeSetV03(handle, { changeSetId: 'changeset-inactive', workflowRunId: 'run-inactive', knowledgeBaseId: handle.knowledgeBaseId, schemaVersion: '0.3', storageFormatVersion: '1', expectedBaseRevision: 0, requiresRawProvenance: false, sourceOperations: [], knowledgeOperations: [] })
    assert.equal(inactive.validatedChangeSet, undefined)
    const duplicate = await validateKnowledgeChangeSetV03({ ...handle, status: 'active', writable: true } as never, { changeSetId: 'changeset-duplicate-target', workflowRunId: 'run-duplicate-target', knowledgeBaseId: handle.knowledgeBaseId, schemaVersion: '0.3', storageFormatVersion: '1', expectedBaseRevision: 0, requiresRawProvenance: false, sourceOperations: [{ operationId: 'source-merge-a', type: 'source_merge', sourceId: 'source:missing', expectedBeforeHash: 'sha256:' + '0'.repeat(64) }, { operationId: 'source-merge-b', type: 'source_merge', sourceId: 'source:missing', expectedBeforeHash: 'sha256:' + '0'.repeat(64) }], knowledgeOperations: [] })
    assert.ok(duplicate.report.errors.some((item) => item.code === 'V03_DUPLICATE_TARGET_MUTATION'))
  } finally { await removeKnowledgeBase(root) }
})
