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
  readonly eventFingerprintUsesClusterIdentity: boolean
  readonly stageBRepairAttempts: number
  readonly directImpactCount: number
  readonly secondOrderImpactCount: number
  readonly affectedExistingClaimCount: number
  readonly modelDerivedInterpretiveSectionCount: number
  readonly eventOccurrenceProposalIncluded: boolean
  readonly baselineEntityCount: number
  readonly finalEntityCount: number
  readonly baselineSourceCount: number
  readonly finalSourceCount: number
  readonly baselineClaimCount: number
  readonly finalClaimCount: number
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
    && gate.eventFingerprintUsesClusterIdentity === true
    && gate.stageBRepairAttempts <= 1
    && gate.directImpactCount >= 1
    && gate.secondOrderImpactCount >= 1
    && gate.affectedExistingClaimCount >= 1
    && gate.modelDerivedInterpretiveSectionCount >= 1
    && gate.eventOccurrenceProposalIncluded === true
    && gate.finalEntityCount === gate.baselineEntityCount
    && gate.finalSourceCount > gate.baselineSourceCount
    && gate.finalClaimCount > gate.baselineClaimCount
  return { pass, classification: pass ? 'EXECUTED / PASS GATE' : 'REAL_MODEL_CONTRACT_BLOCKED', exitCode: pass ? 0 : 1 }
}
