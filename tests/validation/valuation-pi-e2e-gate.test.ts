import assert from 'node:assert/strict'
import test from 'node:test'
import { evaluateValuationPiGate, type ValuationPiGateInput } from './valuation-pi-e2e-gate.ts'

function gate(overrides: Partial<ValuationPiGateInput> = {}): ValuationPiGateInput {
  return {
    executorProof: { instanceOfPiReasoningExecutor: true, runtimeProvider: 'pi-coding-agent' }, operations: ['valuation_assumption_design', 'valuation_synthesis'], status: 'completed', reportType: 'valuation', sectionCount: 16,
    assumptionDesign: { called: true, validated: true, applied: true, fallbackUsed: false, repairAttempts: 1 }, synthesis: { called: true, validated: true, applied: true, fallbackUsed: false, repairAttempts: 0 }, primaryMethod: 'PE', eligibleMethods: ['PE', 'PB'], computation: { scenarioCount: 3, calculatedScenarioCount: 3, sensitivityCellCount: 9, deterministicRecomputeStatus: 'matched' }, modelDerivedInterpretiveSectionCount: 1, acceptedProposalCount: 1, canonicalSourceCountDelta: 2, canonicalClaimCountDelta: 1, baselineEntityCount: 1, finalEntityCount: 1, unusedBasicSourceCanonicalized: false, ...overrides,
  }
}

test('VAL-GATE-001 valuation Pi gate returns executable pass contract', () => { assert.deepEqual(evaluateValuationPiGate(gate()), { pass: true, classification: 'EXECUTED / PASS GATE', exitCode: 0 }) })
test('VAL-GATE-002 valuation Pi gate fails closed on semantic acceptance gaps', () => { assert.deepEqual(evaluateValuationPiGate(gate({ canonicalSourceCountDelta: 0 })), { pass: false, classification: 'REAL_MODEL_CONTRACT_BLOCKED', exitCode: 1 }) })
test('VAL-GATE-003 valuation Pi gate rejects a non-Pi executor proof', () => { assert.deepEqual(evaluateValuationPiGate(gate({ executorProof: { instanceOfPiReasoningExecutor: false, runtimeProvider: 'fixture' } })), { pass: false, classification: 'REAL_MODEL_CONTRACT_BLOCKED', exitCode: 1 }) })
