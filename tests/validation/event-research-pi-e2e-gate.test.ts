import test from 'node:test'
import assert from 'node:assert/strict'
import { evaluateEventResearchPiGate, type EventResearchPiGate } from './event-research-pi-e2e-gate.ts'

const passing: EventResearchPiGate = {
  executed: true, realPiReasoningExecutor: true, operations: ['event_evidence_assessment', 'event_research_synthesis'],
  assessmentCalled: true, assessmentValidated: true, assessmentApplied: true,
  synthesisCalled: true, synthesisValidated: true, synthesisApplied: true, fallbackUsed: false,
  strongVerification: true, reportType: 'event_research', reportSectionCount: 16, reportPersisted: true,
  acceptedProposalCount: 1, canonicalSourceCountDelta: 1, canonicalClaimCountDelta: 1,
  irrelevantSourceCanonicalized: false, workflowTerminalStatus: 'completed',
}

test('Real Pi gate passes only for an executed complete run', () => {
  assert.deepEqual(evaluateEventResearchPiGate(passing), { pass: true, classification: 'EXECUTED / PASS GATE', exitCode: 0 })
})

test('Real Pi gate classifies blocked model contract without false PASS', () => {
  const result = evaluateEventResearchPiGate({ ...passing, fallbackUsed: true })
  assert.deepEqual(result, { pass: false, classification: 'REAL_MODEL_CONTRACT_BLOCKED', exitCode: 1 })
})

test('Real Pi gate distinguishes not executed from contract blocked', () => {
  assert.equal(evaluateEventResearchPiGate({ ...passing, executed: false }).classification, 'NOT_EXECUTED / BLOCKED')
})
