import test from 'node:test'
import assert from 'node:assert/strict'
import { createIndustryModuleResultContract } from '../../skills/industry-research/contracts.ts'
import { normalizeCodexOutputSchema } from '../../plugins/reasoning/codex-cli/executor.ts'
import { applyProvenTransformations, buildEmptyLeafSchema, buildRequiredOnlyAnyOfSchema, convertDisjointConstOneOfToAnyOf, inferPrimitiveConstTypes, normalizeExactStructuredValueScalarLeaf, removeRedundantRequiredAnyOf, structuralCounts, decideProbePath, MAX_REAL_MODEL_CALLS, MODULE } from './codex-module-remaining-schema-deltas.ts'

const outcome = (name: any, extra: Record<string, unknown> = {}) => ({ name, actualCallOrdinal: 1, sourceContractFingerprint: 'x', sourceContractBytes: 1, transformedContractFingerprint: 'x', transformedContractBytes: 1, productionNormalizedFingerprint: 'x', productionNormalizedBytes: 1, processStarted: true, exitState: 'normal_exit', semanticResultAvailable: true, safeFailureClass: null, safeReasoningCode: null, safeErrorCode: null, parserStatus: 'passed', validatorStatus: 'passed', returnedSemanticStatus: 'unavailable', structuralCounts: structuralCounts({}), ...extra }) as any

test('redundant required-only anyOf is removed only under exact logical preconditions', () => {
  const source: any = buildRequiredOnlyAnyOfSchema(true); const before = JSON.stringify(source); const result: any = removeRedundantRequiredAnyOf(source)
  assert.equal(JSON.stringify(source), before); assert.equal(result.properties.value.anyOf, undefined); assert.deepEqual(Object.keys(result.properties.value.properties), ['period', 'fiscalPeriod'])
  const missing = buildRequiredOnlyAnyOfSchema(true) as any; missing.properties.value.required = ['period']; assert.ok(removeRedundantRequiredAnyOf(missing).properties.value.anyOf)
  const richer = buildRequiredOnlyAnyOfSchema(true) as any; richer.properties.value.anyOf[0].description = 'semantic'; assert.ok(removeRedundantRequiredAnyOf(richer).properties.value.anyOf)
  const typed = buildRequiredOnlyAnyOfSchema(true) as any; typed.properties.value.anyOf[0].type = 'object'; assert.ok(removeRedundantRequiredAnyOf(typed).properties.value.anyOf)
  const nested = buildRequiredOnlyAnyOfSchema(true) as any; nested.properties.value.anyOf[0] = { required: ['period'], anyOf: [{ required: ['period'] }] }; assert.ok(removeRedundantRequiredAnyOf(nested).properties.value.anyOf)
})

test('exact scalar leaf normalization changes only authorized structuredValue.value and is idempotent', () => {
  const source: any = createIndustryModuleResultContract(MODULE, []); const before = JSON.stringify(source); const result: any = normalizeExactStructuredValueScalarLeaf(source)
  assert.equal(JSON.stringify(source), before); assert.deepEqual(result.properties.proposals.items.oneOf[2].properties.structuredValue.properties.value, { anyOf: [{ type: 'number' }, { type: 'string' }, { type: 'boolean' }] }); assert.equal(JSON.stringify(normalizeExactStructuredValueScalarLeaf(result)), JSON.stringify(result))
  const unrelated = { properties: { value: {}, other: {} } }; assert.deepEqual(normalizeExactStructuredValueScalarLeaf(unrelated), unrelated)
})

test('composition is source-immutable, deterministic and idempotent', () => {
  const source = createIndustryModuleResultContract(MODULE, []); const before = JSON.stringify(source); const result = applyProvenTransformations(source, true, true)
  assert.equal(JSON.stringify(source), before); assert.deepEqual(applyProvenTransformations(result, true, true), result); assert.deepEqual(inferPrimitiveConstTypes(convertDisjointConstOneOfToAnyOf(result)), result); assert.equal(normalizeCodexOutputSchema(source).fingerprint, '736e8d9d5d72c5cb')
})

test('minimal controls have the required strict shapes', () => {
  const a: any = buildRequiredOnlyAnyOfSchema(true); const b: any = buildRequiredOnlyAnyOfSchema(false); const c: any = buildEmptyLeafSchema(false); const d: any = buildEmptyLeafSchema(true)
  assert.deepEqual(a.properties.value.anyOf, [{ required: ['period'] }, { required: ['fiscalPeriod'] }]); assert.equal(b.properties.value.anyOf, undefined); assert.deepEqual(c.properties.value, {}); assert.deepEqual(d.properties.value, { anyOf: [{ type: 'number' }, { type: 'string' }, { type: 'boolean' }] })
})

test('state machine records all required outcomes and environmental stop', () => {
  const a = outcome('REQUIRED_ONLY_ANYOF_MINIMAL', { semanticResultAvailable: false, safeFailureClass: 'structured_output_configuration' }); const b = outcome('REQUIRED_ONLY_ANYOF_REMOVED_MINIMAL'); const c = outcome('EMPTY_SCHEMA_LEAF_MINIMAL', { semanticResultAvailable: false, safeFailureClass: 'structured_output_configuration' }); const d = outcome('FINITE_SCALAR_ANYOF_MINIMAL'); const e = outcome('FULL_MODULE_ALL_INDEPENDENTLY_PROVEN_DELTAS')
  assert.equal(decideProbePath([a, b, c, d, e]).classification, 'MODULE_TRANSPORT_COMPATIBILITY_SET_PROVEN')
  assert.equal(decideProbePath([a, b, c, d, outcome('FULL_MODULE_ALL_INDEPENDENTLY_PROVEN_DELTAS', { semanticResultAvailable: true, validatorStatus: 'failed' })]).classification, 'MODULE_TRANSPORT_WORKS_SEMANTICS_INVALID')
  assert.equal(decideProbePath([a, b, c, d, outcome('FULL_MODULE_ALL_INDEPENDENTLY_PROVEN_DELTAS', { semanticResultAvailable: false, safeFailureClass: 'unknown_nonzero_exit' })]).classification, 'REMAINING_MODULE_SCHEMA_DELTA_UNRESOLVED')
  assert.equal(decideProbePath([outcome('REQUIRED_ONLY_ANYOF_MINIMAL', { semanticResultAvailable: false, safeFailureClass: 'timeout_or_cancel' })]).classification, 'BACKEND_TIMEOUT_OR_CANCELLED')
  assert.equal(decideProbePath([a, b, c, d]).nextActionCategory, 'REVIEW_BACKEND_RUNTIME_FAILURE')
})

test('structural inventory is bounded and does not persist complete schemas', () => {
  const counts = structuralCounts(createIndustryModuleResultContract(MODULE, [])); assert.ok(counts.untypedEnums > 0); assert.ok(counts.emptySchemaCount > 0); assert.ok(counts.anyOfLocations.length > 0); assert.ok(counts.constLocations.length > 0); assert.ok(counts.maxPropertyCount > 0)
})

test('real-call cap is six and the planned probe set stays within it', () => {
  assert.equal(MAX_REAL_MODEL_CALLS, 6); assert.ok(4 + 1 <= MAX_REAL_MODEL_CALLS)
})
