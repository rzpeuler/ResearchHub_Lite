import test from 'node:test'
import assert from 'node:assert/strict'
import { classifyAggregate, finalModuleState, operationTopology, safeValidatorSummary, classifyEastmoneyTarget } from './industry-module-evidence-validation-isolation.ts'

const base = (overrides: any = {}) => ({ module: 'industry_definition', callCount: 1, repairCount: 0, rerunCount: 0, nonRepairEvidenceCount: 1, nonRepairEvidenceEveryAttempt: 1, validatorFailureCount: 0, parserFailureCount: 0, transportFailureCount: 0, finalDiagnosticState: 'valid_partial', finalSemanticStatus: 'partial', requestConstructionPrevented: false, ...overrides })

test('topology distinguishes immediate repair, Wave-2 rerun, and mixed sequence', () => {
  assert.deepEqual(operationTopology([{ module: 'industry_definition', repair: false, wave: 1 }, { module: 'industry_definition', repair: true, wave: 1 }], ['industry_research_design', 'industry_module_analysis']).repairPairs, ['industry_definition'])
  assert.deepEqual(operationTopology([{ module: 'industry_definition', repair: false, wave: 1 }, { module: 'industry_definition', repair: false, wave: 2 }], ['industry_research_design', 'industry_module_analysis']).reruns, ['industry_definition'])
  const mixed = operationTopology([{ module: 'industry_definition', repair: false, wave: 1 }, { module: 'industry_definition', repair: true, wave: 1 }, { module: 'industry_definition', repair: false, wave: 2 }], ['industry_research_design', 'industry_module_analysis'])
  assert.deepEqual(mixed.repairPairs, ['industry_definition']); assert.deepEqual(mixed.reruns, ['industry_definition'])
})

test('topology stops at synthesis, and fails closed for cap and unknown modules', () => {
  assert.equal(operationTopology([], ['industry_research_design', 'industry_cross_module_synthesis']).classification, 'MODULE_STAGE_PASSED_DIAGNOSTIC_STOP')
  assert.equal(operationTopology([], Array.from({ length: 25 }, () => 'industry_module_analysis')).classification, 'UNEXPECTED_MODULE_CALL_TOPOLOGY')
  assert.equal(operationTopology([{ module: 'invented', repair: false, wave: 1 }], []).classification, 'UNEXPECTED_MODULE_CALL_TOPOLOGY')
})

test('aggregate classification proves evidence relevance from delivered request evidence, not acquisition alone', () => {
  const topology = operationTopology([], ['industry_research_design', 'industry_module_analysis'])
  assert.deepEqual(classifyAggregate({ strongTargetNormalizedSourceCount: 2, topology, modules: [base({ nonRepairEvidenceCount: 0, nonRepairEvidenceEveryAttempt: 0, finalDiagnosticState: 'valid_unavailable', finalSemanticStatus: 'unavailable' })] }), { classification: 'EVIDENCE_RELEVANCE_FILTER_BLOCKER_PROVEN', nextActionCategory: 'FIX_INDUSTRY_EVIDENCE_RELEVANCE_TARGET_ALIASES_AND_STRUCTURED_BOARD_METADATA' })
})

test('aggregate separates validator, transport, breadth, workflow, pass, and mixed blockers', () => {
  const topology = operationTopology([], ['industry_research_design', 'industry_module_analysis'])
  assert.equal(classifyAggregate({ strongTargetNormalizedSourceCount: 0, topology, modules: [base({ validatorFailureCount: 2, finalDiagnosticState: 'validator_failed' })] }).classification, 'MODULE_CONTRACT_VALIDATION_BLOCKER_PROVEN')
  assert.equal(classifyAggregate({ strongTargetNormalizedSourceCount: 0, topology, modules: [base({ transportFailureCount: 1, finalDiagnosticState: 'transport_failed' })] }).classification, 'MODULE_TRANSPORT_BLOCKER_PROVEN')
  assert.equal(classifyAggregate({ strongTargetNormalizedSourceCount: 0, topology, modules: [base({ finalDiagnosticState: 'valid_unavailable', finalSemanticStatus: 'unavailable' })] }).classification, 'EVIDENCE_BREADTH_INSUFFICIENT')
  const all = Array.from({ length: 8 }, (_, i) => base({ module: i === 0 ? 'industry_definition' : `m${i}`, finalDiagnosticState: 'valid_partial' }))
  assert.equal(classifyAggregate({ strongTargetNormalizedSourceCount: 0, topology, modules: all, applicationStatus: 'blocked' }).classification, 'WORKFLOW_MODULE_STATE_TRANSITION_BLOCKER')
  assert.equal(classifyAggregate({ topology: operationTopology([], ['industry_cross_module_synthesis']), modules: all }).classification, 'MODULE_STAGE_PASSED_DIAGNOSTIC_STOP')
  assert.equal(classifyAggregate({ strongTargetNormalizedSourceCount: 0, topology, modules: [base({ transportFailureCount: 1, validatorFailureCount: 1 })] }).classification, 'MIXED_MODULE_BLOCKERS')
})

test('valid unavailable is semantic and does not imply contract failure', () => {
  assert.equal(finalModuleState([{ repair: false, wave: 1, validator: { parsed: true, authoritativeValidatorPassed: true, returnedStatus: 'unavailable', validatorError: null } }]), 'valid_unavailable')
  assert.notEqual(classifyAggregate({ strongTargetNormalizedSourceCount: 0, topology: operationTopology([], []), modules: [base({ finalDiagnosticState: 'valid_unavailable', finalSemanticStatus: 'unavailable' })] }).classification, 'MODULE_CONTRACT_VALIDATION_BLOCKER_PROVEN')
})

test('validator telemetry is structural and excludes semantic prose', () => {
  const summary = safeValidatorSummary({ module: 'industry_definition', status: 'supported', analysis: 'PRIVATE_ANALYSIS', evidenceIds: ['e1'], proposals: [], gaps: [], reportMaterial: { markdown: 'PRIVATE_MARKDOWN', evidenceIds: ['e1'], proposalIds: [] } }, 'industry_definition', ['e1'])
  assert.equal(summary.authoritativeValidatorPassed, true); assert.equal(summary.outputHash.length, 16); assert.ok(!JSON.stringify(summary).includes('PRIVATE_')); assert.deepEqual(summary.proposalKindCounts, { entity: 0, relation: 0, claim: 0 })
})

test('Eastmoney target classification and zero-delivery distinction are deterministic', () => {
  assert.equal(classifyEastmoneyTarget('PCB'), 'strong_target_match'); assert.equal(classifyEastmoneyTarget('新能源设备'), 'non_target_context_match')
  const topology = operationTopology([], ['industry_module_analysis'])
  assert.equal(classifyAggregate({ strongTargetNormalizedSourceCount: 1, topology, modules: [base({ nonRepairEvidenceCount: 1, nonRepairEvidenceEveryAttempt: 1 })] }).classification, 'MIXED_MODULE_BLOCKERS')
})
