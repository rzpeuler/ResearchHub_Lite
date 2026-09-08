export interface EarningsReviewPiGate {
  readonly earnings_review_synthesisCalled: boolean
  readonly structuredOutputValidated: boolean
  readonly reasoningApplied: boolean
  readonly fallbackUsed: boolean
  readonly modelDerivedSectionCount: number
  readonly validAssessmentCount: number
  readonly durableAssessmentCount: number
  readonly acceptedProposalCount: number
  readonly canonicalSourceCountDelta: number
  readonly canonicalClaimCountDelta: number
  readonly reportType: string | null
  readonly workflowTerminalStatus: string
}

export interface EarningsReviewPiGateDecision {
  readonly pass: boolean
  readonly classification: 'EXECUTED / PASS GATE' | 'REAL_MODEL_CONTRACT_BLOCKED'
  readonly exitCode: 0 | 1
}

export function evaluateEarningsReviewPiGate(gate: EarningsReviewPiGate): EarningsReviewPiGateDecision {
  const pass = gate.earnings_review_synthesisCalled === true && gate.structuredOutputValidated === true && gate.reasoningApplied === true && gate.fallbackUsed === false && gate.modelDerivedSectionCount >= 1 && gate.validAssessmentCount >= 1 && gate.durableAssessmentCount >= 1 && gate.acceptedProposalCount >= 1 && gate.canonicalSourceCountDelta >= 1 && gate.canonicalClaimCountDelta >= 1 && gate.reportType === 'earnings_review' && gate.workflowTerminalStatus === 'completed'
  return { pass, classification: pass ? 'EXECUTED / PASS GATE' : 'REAL_MODEL_CONTRACT_BLOCKED', exitCode: pass ? 0 : 1 }
}
