import test from 'node:test'
import assert from 'node:assert/strict'
import { captureFirstDesignRequest, classifyStructuredOutput, EXPECTED_FINGERPRINTS, requestFingerprints } from './codex-cli-pcb-design-structured-output.ts'

test('structured-output validation captures the unchanged first PCB Design request', async () => {
  const captured = await captureFirstDesignRequest()
  assert.equal(captured.calls, 1)
  assert.deepEqual(requestFingerprints(captured.request), EXPECTED_FINGERPRINTS)
  assert.equal(captured.request.operation, 'industry_research_design')
})

test('structured-output classification distinguishes continuity, configuration and semantic outcomes', () => {
  assert.equal(classifyStructuredOutput({ backendExecuted: true, continuity: true, parsed: true, validated: true, targetKind: 'industry' }), 'COMPATIBLE_VALID_INDUSTRY_DESIGN')
  assert.equal(classifyStructuredOutput({ backendExecuted: true, continuity: true, parsed: true, validated: true, targetKind: 'theme' }), 'COMPATIBLE_VALID_NONINDUSTRY_DIAGNOSIS')
  assert.equal(classifyStructuredOutput({ backendExecuted: true, continuity: true, parsed: false, validated: false, failureCode: 'reasoning_output_invalid' }), 'MODEL_OUTPUT_INVALID')
  assert.equal(classifyStructuredOutput({ backendExecuted: false, continuity: true, parsed: false, validated: false, configurationFailure: true, failureCode: 'reasoning_configuration_invalid' }), 'STRUCTURED_OUTPUT_CONFIGURATION_FAILED')
  assert.equal(classifyStructuredOutput({ backendExecuted: false, continuity: false, parsed: false, validated: false }), 'REQUEST_CONTINUITY_FAILED')
})
