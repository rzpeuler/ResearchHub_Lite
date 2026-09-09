export interface EventResearchPiGate {
  readonly executed: boolean
  readonly realPiReasoningExecutor: boolean
  readonly operations: readonly string[]
  readonly assessmentCalled: boolean
  readonly assessmentValidated: boolean
  readonly assessmentApplied: boolean
  readonly synthesisCalled: boolean
  readonly synthesisValidated: boolean
  readonly synthesisApplied: boolean
  readonly fallbackUsed: boolean
  readonly strongVerification: boolean
  readonly reportType: string | null
  readonly reportSectionCount: number
  readonly reportPersisted: boolean
  readonly acceptedProposalCount: number
  readonly canonicalSourceCountDelta: number
  readonly canonicalClaimCountDelta: number
  readonly irrelevantSourceCanonicalized: boolean
  readonly workflowTerminalStatus: string
}

export interface EventResearchPiGateDecision {
  readonly pass: boolean
  readonly classification: 'EXECUTED / PASS GATE' | 'REAL_MODEL_CONTRACT_BLOCKED' | 'NOT_EXECUTED / BLOCKED'
  readonly exitCode: 0 | 1
}

export function evaluateEventResearchPiGate(gate: EventResearchPiGate): EventResearchPiGateDecision {
  if (!gate.executed) return { pass: false, classification: 'NOT_EXECUTED / BLOCKED', exitCode: 1 }
  const pass = gate.realPiReasoningExecutor === true
    && gate.operations.includes('event_evidence_assessment')
    && gate.operations.includes('event_research_synthesis')
    && gate.assessmentCalled === true
    && gate.assessmentValidated === true
    && gate.assessmentApplied === true
    && gate.synthesisCalled === true
    && gate.synthesisValidated === true
    && gate.synthesisApplied === true
    && gate.fallbackUsed === false
    && gate.strongVerification === true
    && gate.reportType === 'event_research'
    && gate.reportSectionCount === 16
    && gate.reportPersisted === true
    && gate.acceptedProposalCount >= 1
    && gate.canonicalSourceCountDelta >= 1
    && gate.canonicalClaimCountDelta >= 1
    && gate.irrelevantSourceCanonicalized === false
    && gate.workflowTerminalStatus === 'completed'
  return { pass, classification: pass ? 'EXECUTED / PASS GATE' : 'REAL_MODEL_CONTRACT_BLOCKED', exitCode: pass ? 0 : 1 }
}
