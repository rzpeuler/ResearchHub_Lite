import test from 'node:test'
import assert from 'node:assert/strict'
import { decide, inferPrimitiveSchemaTypes, MINIMAL_TYPED_SCHEMA, PROBES } from './codex-cli-schema-type-inference-isolation.ts'
import { normalizeCodexOutputSchema } from '../../plugins/reasoning/codex-cli/executor.ts'
import { INDUSTRY_RESEARCH_DESIGN_CONTRACT } from '../../skills/industry-research/contracts.ts'

test('infers supported primitive const types and preserves objects and arrays', () => {
  const input = { type: 'object', properties: { s: { const: 'x' }, i: { const: 2 }, n: { const: 2.5 }, b: { const: true }, z: { const: null }, o: { const: {} }, a: { const: [] } } }
  const result = inferPrimitiveSchemaTypes(input)
  assert.deepEqual(result.additions, [{ path: '$.properties.s', type: 'string' }, { path: '$.properties.i', type: 'integer' }, { path: '$.properties.n', type: 'number' }, { path: '$.properties.b', type: 'boolean' }, { path: '$.properties.z', type: 'null' }])
  assert.equal((result.copy as any).properties.o.type, undefined); assert.equal((result.copy as any).properties.a.type, undefined)
})

test('infers only homogeneous non-empty primitive enums', () => {
  const result = inferPrimitiveSchemaTypes({ type: 'object', properties: { good: { enum: ['a', 'b'] }, mixed: { enum: ['a', 1] }, empty: { enum: [] }, object: { enum: [{}] }, array: { enum: [[]] } } })
  assert.deepEqual(result.additions, [{ path: '$.properties.good', type: 'string' }])
})

test('recurses through schema positions and does not mutate the source', () => {
  const source = { type: 'object', properties: { a: { oneOf: [{ const: 'x' }], items: { const: 1 }, additionalProperties: { enum: [true, false] } } } }
  const before = JSON.stringify(source); const result = inferPrimitiveSchemaTypes(source)
  assert.equal(JSON.stringify(source), before)
  assert.deepEqual(result.additions.map((x) => x.path), ['$.properties.a.items', '$.properties.a.additionalProperties', '$.properties.a.oneOf[0]'])
})

test('Design source stays byte-identical and actual untyped nodes are derived from code', () => {
  const before = JSON.stringify(INDUSTRY_RESEARCH_DESIGN_CONTRACT); const result = inferPrimitiveSchemaTypes(INDUSTRY_RESEARCH_DESIGN_CONTRACT)
  assert.equal(JSON.stringify(INDUSTRY_RESEARCH_DESIGN_CONTRACT), before); assert.equal(result.additions.some((x) => x.path === '$.properties.targetKind' && x.type === 'string'), true)
})

test('Probe A normalizes to the exact native-good minimal schema', () => { assert.deepEqual(normalizeCodexOutputSchema(MINIMAL_TYPED_SCHEMA).schema, MINIMAL_TYPED_SCHEMA) })

const a = (extra: Record<string, unknown> = {}) => ({ attempted: true, semanticResultAvailable: true, safeFailureClass: null, ...extra })
test('decision state machine stops after Probe A failure and classifies adapter delta', () => { const r = decide({ probeA: a({ semanticResultAvailable: false, safeFailureClass: 'structured_output_configuration' }), inferredCount: 1, designFingerprintUnchanged: true }); assert.equal(r.classification, 'ADAPTER_INVOCATION_DELTA_CONFIRMED') })
test('decision state machine proves inference only after authoritative validation', () => { const r = decide({ probeA: a(), probeB: a({ validatorStatus: 'passed' }), inferredCount: 1, designFingerprintUnchanged: true }); assert.equal(r.classification, 'PRIMITIVE_ENUM_CONST_TYPE_INFERENCE_PROVEN') })
test('decision state machine classifies typed transport semantic invalidity and config insufficiency', () => { assert.equal(decide({ probeA: a(), probeB: a({ validatorStatus: 'failed' }), inferredCount: 1, designFingerprintUnchanged: true }).classification, 'TYPE_INFERENCE_TRANSPORT_WORKS_SEMANTICS_INVALID'); assert.equal(decide({ probeA: a(), probeB: a({ semanticResultAvailable: false, safeFailureClass: 'structured_output_configuration' }), inferredCount: 1, designFingerprintUnchanged: true }).classification, 'TYPE_INFERENCE_INSUFFICIENT') })
test('maximum real calls is two and Probe B is conditional', () => { assert.equal(PROBES.length, 2); assert.equal(decide({ probeA: a(), inferredCount: 0, designFingerprintUnchanged: true }).classification, 'ADAPTER_EXPLICIT_TYPED_MINIMAL_WORKS_DESIGN_NOT_RUN') })
