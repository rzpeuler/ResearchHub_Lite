export interface ValuationPiGateInput {
  readonly executorProof: { readonly instanceOfPiReasoningExecutor: boolean; readonly runtimeProvider: string }
  readonly operations: readonly string[]
  readonly status: string
  readonly reportType: string | null
  readonly sectionCount: number
  readonly assumptionDesign: { readonly called: boolean; readonly validated: boolean; readonly applied: boolean; readonly fallbackUsed: boolean; readonly repairAttempts: number }
  readonly synthesis: { readonly called: boolean; readonly validated: boolean; readonly applied: boolean; readonly fallbackUsed: boolean; readonly repairAttempts: number }
  readonly primaryMethod?: string
  readonly eligibleMethods: readonly string[]
  readonly computation: { readonly scenarioCount: number; readonly calculatedScenarioCount: number; readonly sensitivityCellCount: number; readonly deterministicRecomputeStatus: string }
  readonly modelDerivedInterpretiveSectionCount: number
  readonly acceptedProposalCount: number
  readonly canonicalSourceCountDelta: number
  readonly canonicalClaimCountDelta: number
  readonly baselineEntityCount: number
  readonly finalEntityCount: number
  readonly unusedBasicSourceCanonicalized: boolean
}

export interface ValuationPiGateResult {
  readonly pass: boolean
  readonly classification: 'EXECUTED / PASS GATE' | 'REAL_MODEL_CONTRACT_BLOCKED'
  readonly exitCode: 0 | 1
}

export function evaluateValuationPiGate(input: ValuationPiGateInput): ValuationPiGateResult {
  const pass = input.executorProof.instanceOfPiReasoningExecutor && input.executorProof.runtimeProvider === 'pi-coding-agent' && input.status === 'completed' && input.reportType === 'valuation' && input.sectionCount === 16 && input.operations.includes('valuation_assumption_design') && input.operations.includes('valuation_synthesis') && input.assumptionDesign.called && input.assumptionDesign.validated && input.assumptionDesign.applied && !input.assumptionDesign.fallbackUsed && input.assumptionDesign.repairAttempts <= 1 && input.primaryMethod !== undefined && input.eligibleMethods.includes(input.primaryMethod) && input.computation.scenarioCount === 3 && input.computation.calculatedScenarioCount === 3 && input.computation.sensitivityCellCount === 9 && input.computation.deterministicRecomputeStatus === 'matched' && input.synthesis.called && input.synthesis.validated && input.synthesis.applied && !input.synthesis.fallbackUsed && input.synthesis.repairAttempts <= 1 && input.modelDerivedInterpretiveSectionCount >= 1 && input.acceptedProposalCount >= 1 && input.acceptedProposalCount <= 3 && input.canonicalSourceCountDelta >= 1 && input.canonicalSourceCountDelta <= 2 && input.canonicalClaimCountDelta >= 1 && input.canonicalClaimCountDelta <= 3 && input.baselineEntityCount === 1 && input.finalEntityCount === 1 && !input.unusedBasicSourceCanonicalized
  return { pass, classification: pass ? 'EXECUTED / PASS GATE' : 'REAL_MODEL_CONTRACT_BLOCKED', exitCode: pass ? 0 : 1 }
}
