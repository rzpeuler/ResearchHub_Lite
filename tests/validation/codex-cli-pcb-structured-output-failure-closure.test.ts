import test from 'node:test'
import assert from 'node:assert/strict'
import { classifyFailure, FINAL_CLASSIFICATIONS, shouldMakeFinalSchemaCall } from './codex-cli-pcb-structured-output-failure-closure.ts'
import { ReasoningExecutorError } from '../../plugins/reasoning/errors.ts'

test('FIX-005 offline classifier covers every final classification family', () => {
  assert.equal(FINAL_CLASSIFICATIONS.length, 12)
  assert.equal(classifyFailure(new ReasoningExecutorError('reasoning_structured_output_configuration_failed', 'safe', { failureClass: 'structured_output_configuration' })), 'STRUCTURED_OUTPUT_CONFIGURATION_FAILED')
  for (const [failureClass, expected] of [['authentication_or_account', 'BACKEND_AUTH_OR_ACCOUNT_BLOCKED'], ['model_unavailable', 'BACKEND_MODEL_UNAVAILABLE'], ['rate_limit_or_quota', 'BACKEND_RATE_OR_QUOTA_BLOCKED'], ['safety_or_policy', 'BACKEND_SAFETY_OR_POLICY_BLOCKED'], ['timeout_or_cancel', 'BACKEND_TIMEOUT_OR_CANCELLED'], ['transport_or_service', 'BACKEND_TRANSPORT_OR_SERVICE_FAILURE'], ['unknown_nonzero_exit', 'BACKEND_FAILURE_DIAGNOSTIC_INCONCLUSIVE']] as const) assert.equal(classifyFailure(new ReasoningExecutorError('reasoning_execution_failed', 'safe', { failureClass })), expected)
  assert.equal(shouldMakeFinalSchemaCall({ classification: 'STRUCTURED_OUTPUT_CONFIGURATION_FAILED', deterministicSchemaIncompatibility: true }), true)
  assert.equal(shouldMakeFinalSchemaCall({ classification: 'STRUCTURED_OUTPUT_CONFIGURATION_FAILED', deterministicSchemaIncompatibility: false }), false)
  for (const classification of FINAL_CLASSIFICATIONS.filter((item) => item !== 'STRUCTURED_OUTPUT_CONFIGURATION_FAILED')) assert.equal(shouldMakeFinalSchemaCall({ classification, deterministicSchemaIncompatibility: true }), false)
})
