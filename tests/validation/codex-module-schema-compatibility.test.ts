import test from 'node:test'
import assert from 'node:assert/strict'
import { createIndustryModuleResultContract } from '../../skills/industry-research/contracts.ts'
import { normalizeCodexOutputSchema } from '../../plugins/reasoning/codex-cli/executor.ts'
import { convertDisjointConstOneOfToAnyOf, decideProbePath, inferPrimitiveConstTypes, normalizeStructuredValueLeaf, structuralCounts, buildMinimalConstSchema, buildNestedChoiceSchema, MODULE } from './codex-module-schema-compatibility.ts'

const outcome = (name: any, extra: Record<string, unknown> = {}) => ({ name, actualCallOrdinal: 1, contractFingerprint: 'x', contractBytes: 1, normalizedFingerprint: 'x', normalizedBytes: 1, processStarted: true, exitState: 'normal_exit', semanticResultAvailable: true, safeFailureClass: null, safeReasoningCode: null, safeErrorCode: null, parserStatus: 'passed', validatorStatus: 'passed', returnedSemanticStatus: 'unavailable', structuralCounts: structuralCounts({}), ...extra }) as any

test('primitive const inference covers scalar types and refuses compound values', () => {
  const source = { a: { const: 'x' }, b: { const: true }, c: { const: 2 }, d: { const: 2.5 }, e: { const: null }, f: { const: { x: 1 } }, g: { const: [1] }, h: { type: 'string', const: 'keep' } }
  const result: any = inferPrimitiveConstTypes(source)
  assert.deepEqual(result, { a: { const: 'x', type: 'string' }, b: { const: true, type: 'boolean' }, c: { const: 2, type: 'integer' }, d: { const: 2.5, type: 'number' }, e: { const: null, type: 'null' }, f: { const: { x: 1 } }, g: { const: [1] }, h: { type: 'string', const: 'keep' } })
  assert.deepEqual(source.a, { const: 'x' })
})

test('guarded oneOf conversion requires strict unique kind constants', () => {
  const converted: any = convertDisjointConstOneOfToAnyOf(buildNestedChoiceSchema('oneOf'))
  assert.ok(converted.properties.proposal.anyOf)
  assert.equal(converted.properties.proposal.oneOf, undefined)
  const overlap = buildNestedChoiceSchema('oneOf') as any
  overlap.properties.proposal.oneOf[1].properties.kind.const = 'a'
  assert.ok((convertDisjointConstOneOfToAnyOf(overlap) as any).properties.proposal.oneOf)
  const missing = buildNestedChoiceSchema('oneOf') as any
  delete missing.properties.proposal.oneOf[0].properties.kind.const
  assert.ok((convertDisjointConstOneOfToAnyOf(missing) as any).properties.proposal.oneOf)
  const nonStrict = buildNestedChoiceSchema('oneOf') as any
  nonStrict.properties.proposal.oneOf[0].additionalProperties = true
  assert.ok((convertDisjointConstOneOfToAnyOf(nonStrict) as any).properties.proposal.oneOf)
  const arbitrary = { oneOf: [{ type: 'object', additionalProperties: false, required: ['kind'], properties: { kind: { const: 'x' } } }, { type: 'object', additionalProperties: false, required: ['kind'], properties: { kind: { const: 'y' } } }] }
  assert.ok((convertDisjointConstOneOfToAnyOf(arbitrary) as any).oneOf)
})

test('structured value normalization changes only the exact empty value leaf', () => {
  const source: any = createIndustryModuleResultContract(MODULE, [])
  const before = JSON.stringify(source)
  const result: any = normalizeStructuredValueLeaf(source)
  assert.equal(JSON.stringify(source), before)
  assert.deepEqual(result.properties.proposals.items.oneOf[2].properties.structuredValue.properties.value, { anyOf: [{ type: 'number' }, { type: 'string' }, { type: 'boolean' }] })
  assert.equal(result.properties.gaps.items.properties.gapId.type, 'string')
  assert.equal(result.properties.gaps.items.properties.value, undefined)
  const unrelated = { properties: { other: {} } }
  assert.deepEqual(normalizeStructuredValueLeaf(unrelated), unrelated)
})

test('helpers are idempotent and normalized source is unchanged', () => {
  const source = createIndustryModuleResultContract(MODULE, [])
  const transformed = normalizeStructuredValueLeaf(convertDisjointConstOneOfToAnyOf(inferPrimitiveConstTypes(source)))
  assert.deepEqual(inferPrimitiveConstTypes(transformed), transformed)
  assert.deepEqual(convertDisjointConstOneOfToAnyOf(transformed), transformed)
  assert.deepEqual(normalizeStructuredValueLeaf(transformed), transformed)
  assert.equal(normalizeCodexOutputSchema(source).strengthenedObjectCount > 0, true)
})

test('structural feature counts record baseline schema shape', () => {
  const source = createIndustryModuleResultContract(MODULE, [])
  const counts = structuralCounts(source)
  assert.ok(counts.untypedPrimitiveConst > 0)
  assert.ok(counts.enumWithoutType > 0)
  assert.ok(counts.oneOf > 0)
  assert.ok(counts.emptySchemaLeaves > 0)
  assert.ok(counts.objectWithProperties > 0)
})

test('probe state machine honors bounded stop and transformation gates', () => {
  assert.equal(decideProbePath([outcome('FULL_MODULE_BASELINE', { semanticResultAvailable: true })]).classification, 'PRODUCTION_MODULE_TRANSPORT_FAILURE_NOT_REPRODUCED')
  const base = outcome('FULL_MODULE_BASELINE', { semanticResultAvailable: false, safeFailureClass: 'structured_output_configuration' })
  const b = outcome('UNTYPED_CONST_MINIMAL', { semanticResultAvailable: false, safeFailureClass: 'structured_output_configuration' })
  const c = outcome('TYPED_CONST_MINIMAL')
  assert.equal(decideProbePath([base, b, c, outcome('FULL_MODULE_CONST_TYPED')]).classification, 'MODULE_CONST_TYPE_INFERENCE_PROVEN')
  assert.equal(decideProbePath([base, outcome('UNTYPED_CONST_MINIMAL'), outcome('TYPED_CONST_MINIMAL'), outcome('NESTED_ONEOF_MINIMAL', { semanticResultAvailable: false }), outcome('NESTED_ANYOF_MINIMAL')]).nextActionCategory, 'REVIEW_BACKEND_RUNTIME_FAILURE')
  assert.equal(decideProbePath([base, b, c, outcome('FULL_MODULE_CONST_TYPED', { semanticResultAvailable: false, safeFailureClass: 'structured_output_configuration' }), outcome('NESTED_ONEOF_MINIMAL', { semanticResultAvailable: false }), outcome('NESTED_ANYOF_MINIMAL'), outcome('FULL_MODULE_GUARDED_VARIANT_NORMALIZATION', { semanticResultAvailable: false }), outcome('FULL_MODULE_STRUCTURED_VALUE_LEAF_NORMALIZATION')]).classification, 'MODULE_COMBINED_SCHEMA_NORMALIZATION_PROVEN')
  assert.equal(decideProbePath([base, b, c, outcome('FULL_MODULE_CONST_TYPED'), outcome('NESTED_ONEOF_MINIMAL', { semanticResultAvailable: true }), outcome('NESTED_ANYOF_MINIMAL', { semanticResultAvailable: true })]).classification, 'MODULE_CONST_TYPE_INFERENCE_PROVEN')
})

test('minimal probe schemas are strict and deterministic', () => {
  assert.deepEqual(buildMinimalConstSchema(false).required, ['status'])
  assert.equal((buildMinimalConstSchema(false) as any).properties.status.type, undefined)
  assert.equal((buildMinimalConstSchema(true) as any).properties.status.type, 'string')
})
