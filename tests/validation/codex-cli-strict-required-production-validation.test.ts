import test from 'node:test'
import assert from 'node:assert/strict'
import { decideProductionValidation, MAX_REAL_MODEL_CALLS } from './codex-cli-strict-required-production-validation.ts'

const base = { requestContinuity: true, pcbAttempted: true, pcbParserPassed: true, pcbValidatorPassed: true, pcbTargetKind: 'industry', calls: 2 }

test('neutral failure prevents the conditional PCB call and preserves backend classification', () => {
  assert.equal(decideProductionValidation({ neutralPassed: false, neutralFailure: 'BACKEND_AUTH_OR_ACCOUNT_BLOCKED', requestContinuity: false, pcbAttempted: false, calls: 1 }).classification, 'BACKEND_AUTH_OR_ACCOUNT_BLOCKED')
  assert.equal(decideProductionValidation({ neutralPassed: false, requestContinuity: false, pcbAttempted: false, calls: 1 }).classification, 'NEUTRAL_DESIGN_VALIDATION_FAILED')
})

test('request continuity failure prevents PCB execution', () => {
  assert.equal(decideProductionValidation({ ...base, neutralPassed: true, requestContinuity: false, pcbAttempted: false, calls: 1 }).classification, 'REQUEST_CONTINUITY_FAILED')
})

test('valid non-industry PCB output remains non-authorizing', () => {
  const result = decideProductionValidation({ ...base, neutralPassed: true, pcbTargetKind: 'uncertain' })
  assert.equal(result.classification, 'PCB_VALID_NONINDUSTRY_DIAGNOSIS')
  assert.equal(result.productionSelectionAuthorized, false)
})

test('valid industry PCB output authorizes only the next separate model-selection task', () => {
  const result = decideProductionValidation({ ...base, neutralPassed: true })
  assert.equal(result.classification, 'PCB_COMPATIBLE_VALID_INDUSTRY_DESIGN')
  assert.equal(result.productionSelectionAuthorized, true)
})

test('real validation is bounded to two calls', () => {
  assert.equal(MAX_REAL_MODEL_CALLS, 2)
  assert.equal(decideProductionValidation({ ...base, neutralPassed: true, calls: 3 }).productionSelectionAuthorized, false)
})
