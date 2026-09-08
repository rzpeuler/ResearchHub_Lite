import assert from 'node:assert/strict'
import test from 'node:test'
import { evaluateEarningsReviewPiGate, type EarningsReviewPiGate } from './earnings-review-pi-e2e-gate.ts'

const passingGate: EarningsReviewPiGate = { earnings_review_synthesisCalled: true, structuredOutputValidated: true, reasoningApplied: true, fallbackUsed: false, modelDerivedSectionCount: 14, validAssessmentCount: 1, durableAssessmentCount: 1, acceptedProposalCount: 1, canonicalSourceCountDelta: 1, canonicalClaimCountDelta: 1, reportType: 'earnings_review', workflowTerminalStatus: 'completed' }

test('Real Pi PASS gate produces PASS classification and zero exit decision', () => { assert.deepEqual(evaluateEarningsReviewPiGate(passingGate), { pass: true, classification: 'EXECUTED / PASS GATE', exitCode: 0 }) })
test('Real Pi failed gate produces blocked classification and non-zero exit decision', () => { assert.deepEqual(evaluateEarningsReviewPiGate({ ...passingGate, structuredOutputValidated: false, fallbackUsed: true }), { pass: false, classification: 'REAL_MODEL_CONTRACT_BLOCKED', exitCode: 1 }) })
