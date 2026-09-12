import test from 'node:test'
import assert from 'node:assert/strict'
import { classifyCompatibility, type CompatibilityInput } from './codex-cli-pcb-design-compatibility.ts'

const base: CompatibilityInput = { backendExecuted: true, metadataMatches: true, requestUnchanged: true, parserValid: true, validatorValid: true, targetKind: 'industry' }

test('classifies a valid Industry Design as compatible', () => assert.equal(classifyCompatibility(base), 'COMPATIBLE_VALID_INDUSTRY_DESIGN'))
test('classifies a valid non-Industry diagnosis separately', () => assert.equal(classifyCompatibility({ ...base, targetKind: 'product' }), 'COMPATIBLE_VALID_NONINDUSTRY_DIAGNOSIS'))
test('classifies parser or validator failure as invalid model output', () => assert.equal(classifyCompatibility({ ...base, parserValid: false, failureCode: 'reasoning_output_invalid' }), 'MODEL_OUTPUT_INVALID'))
test('classifies backend execution failure without fabrication', () => assert.equal(classifyCompatibility({ ...base, backendExecuted: false }), 'BACKEND_EXECUTION_FAILED'))
test('classifies account or platform setup as externally blocked', () => assert.equal(classifyCompatibility({ ...base, backendExecuted: false, externalSetup: true }), 'BLOCKED_EXTERNAL_SETUP'))
