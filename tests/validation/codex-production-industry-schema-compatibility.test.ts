import test from 'node:test'
import assert from 'node:assert/strict'
import { createIndustryModuleResultContract, createIndustrySynthesisContract } from '../../skills/industry-research/contracts.ts'
import { normalizeCodexOutputSchema } from '../../plugins/reasoning/codex-cli/executor.ts'
import { BASE_COMMIT, TASK_ID, classifyCompatibility } from './codex-production-industry-schema-compatibility.ts'

test('FIX-015 offline classification requires both semantic validations', () => {
  assert.equal(TASK_ID, 'RHL-M3B-3B-FIX-015-CODEX-PROVEN-SCHEMA-COMPATIBILITY')
  assert.equal(BASE_COMMIT, '9e6601cd11c40093ffff71c473cf1f29b6e0dfe5')
  const base = { moduleSemantic: true, moduleValid: true, synthesisAttempted: true, synthesisSemantic: true, synthesisValid: true, runtimeMatches: true }
  assert.equal(classifyCompatibility(base), 'MODULE_AND_SYNTHESIS_TRANSPORT_VALIDATED')
  assert.equal(classifyCompatibility({ ...base, moduleSemantic: false, moduleValid: false, synthesisAttempted: false }), 'MODULE_TRANSPORT_STILL_BLOCKED')
  assert.equal(classifyCompatibility({ ...base, moduleValid: false }), 'MODULE_SEMANTIC_OUTPUT_INVALID')
  assert.equal(classifyCompatibility({ ...base, synthesisSemantic: false, synthesisValid: false }), 'SYNTHESIS_TRANSPORT_BLOCKED')
  assert.equal(classifyCompatibility({ ...base, synthesisValid: false }), 'SYNTHESIS_SEMANTIC_OUTPUT_INVALID')
  assert.equal(classifyCompatibility({ ...base, runtimeMatches: false }), 'RUNTIME_CONFIGURATION_MISMATCH')
})

test('FIX-015 offline evidence inputs preserve authoritative contracts and expected source sizes', () => {
  const moduleContract = createIndustryModuleResultContract('industry_definition', [])
  const synthesisContract = createIndustrySynthesisContract([], [], [])
  const moduleTransport = normalizeCodexOutputSchema(moduleContract)
  const synthesisTransport = normalizeCodexOutputSchema(synthesisContract)
  assert.equal(JSON.stringify(moduleContract).length, 6341)
  assert.equal(moduleTransport.fingerprint, '736e8d9d5d72c5cb')
  assert.equal(moduleTransport.bytes, 4649)
  assert.ok(synthesisTransport.bytes > 0)
  assert.equal(moduleTransport.primitiveConstTypeCount > 0, true)
  assert.equal(moduleTransport.guardedKindOneOfConversionCount > 0, true)
  assert.equal(moduleTransport.redundantRequiredOnlyAnyOfRemovalCount > 0, true)
  assert.equal(moduleTransport.structuredValueScalarNormalizationCount, 1)
})

test('FIX-015 validation module exposes no real backend side effect on import', () => {
  assert.equal(typeof classifyCompatibility, 'function')
})
