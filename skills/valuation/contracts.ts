import type { SemanticProductionProposal } from '../../knowledge/production/contracts.ts'

export const VALUATION_METHODS = ['PE', 'PB', 'EV_EBITDA'] as const
export type ValuationMethod = (typeof VALUATION_METHODS)[number]
export const VALUATION_SCENARIOS = ['bear', 'base', 'bull'] as const
export type ValuationScenarioId = (typeof VALUATION_SCENARIOS)[number]
export const VALUATION_EVIDENCE_ROLES = ['market', 'financial', 'basic'] as const
export type ValuationEvidenceRole = (typeof VALUATION_EVIDENCE_ROLES)[number]
export type DurableValuationEvidenceRole = Exclude<ValuationEvidenceRole, 'basic'>

export interface ValuationStructuredValue {
  readonly metric: string
  readonly value: number
  readonly unit: 'ratio' | 'multiple' | 'CNY/share' | 'percent'
  readonly period: string
  readonly comparator: 'eq'
}

export const VALUATION_REPORT_SECTIONS = [
  'Valuation Snapshot',
  'Data Basis & Point-in-Time Status',
  'Existing Research Context',
  'Method Eligibility',
  'FY-Based Reference Multiples',
  'Primary Method Selection',
  'Assumption Framework',
  'Bear Scenario',
  'Base Scenario',
  'Bull Scenario',
  'Target Price Range',
  'Sensitivity Analysis',
  'Secondary Method Cross-checks',
  'Changes vs Existing Research',
  'Valuation View',
  'Risks / Limitations / Research Gaps',
] as const
export type ValuationReportSectionTitle = (typeof VALUATION_REPORT_SECTIONS)[number]

export interface ValuationBasis {
  readonly valuationDate: string
  readonly priceDate: string
  readonly marketPrice: number
  readonly marketPriceUnit: 'CNY/share'
  readonly basisFiscalYear: number
  readonly reportDate: string
  readonly publicationStatus: 'verified' | 'current_snapshot_unverified'
  readonly eps?: number
  readonly bvps?: number
  readonly ebitda?: number
  readonly netDebt?: number
  readonly shares?: number
  readonly units: Readonly<Record<string, string>>
}
export interface ValuationMethodEligibility {
  readonly method: ValuationMethod
  readonly eligible: boolean
  readonly reason: string
}

export interface ValuationScenarioAssumption {
  readonly scenarioId: ValuationScenarioId
  readonly primaryMethod: ValuationMethod
  readonly targetFiscalYear: number
  readonly growthRate: number
  readonly targetMultiple: number
  readonly rationale: string
  readonly sourceCandidateIds: readonly string[]
  readonly existingKnowledgeRefs: readonly string[]
}

export interface ValuationAssumptionPlan {
  readonly primaryMethod: ValuationMethod
  readonly secondaryMethods: readonly ValuationMethod[]
  readonly targetFiscalYear: number
  readonly scenarios: readonly ValuationScenarioAssumption[]
}

export interface ValuationScenarioResult {
  readonly scenarioId: ValuationScenarioId
  readonly primaryMethod: ValuationMethod
  readonly targetFiscalYear: number
  readonly growthRate: number
  readonly targetMultiple: number
  readonly forecastMetric: number
  readonly targetPrice: number
  readonly impliedReturnPct: number
}

export interface ValuationSensitivityCell {
  readonly cellId: string
  readonly growthScenario: ValuationScenarioId
  readonly multipleScenario: ValuationScenarioId
  readonly growthRate: number
  readonly targetMultiple: number
  readonly targetPrice: number
}

export interface ValuationComputation {
  readonly basis: ValuationBasis
  readonly eligibility: readonly ValuationMethodEligibility[]
  readonly referenceMultiples: Readonly<Partial<Record<ValuationMethod, number>>>
  readonly scenarios: readonly ValuationScenarioResult[]
  readonly sensitivity: readonly ValuationSensitivityCell[]
  readonly deterministicRecomputeMatched: boolean
  readonly unavailable: readonly string[]
}

export interface ValuationSynthesisProposal extends SemanticProductionProposal {
  readonly claimType: 'assumption' | 'viewpoint'
  readonly valuationAssumptionRefs: readonly string[]
  readonly valuationResultRefs: readonly string[]
  readonly existingKnowledgeRefs: readonly string[]
}

export interface ValuationSynthesisSection {
  readonly sectionId: string
  readonly markdown: string
  readonly sourceCandidateIds: readonly string[]
  readonly existingKnowledgeRefs: readonly string[]
  readonly valuationResultRefs: readonly string[]
}

export interface ValuationSynthesisOutput {
  readonly sections: readonly ValuationSynthesisSection[]
  readonly proposals: readonly ValuationSynthesisProposal[]
}

export interface ValuationReasoningTelemetry {
  readonly called: boolean
  readonly validated: boolean
  readonly applied: boolean
  readonly fallbackUsed: boolean
  readonly repairAttempts: number
  readonly operation: 'valuation_assumption_design' | 'valuation_synthesis'
  readonly model?: string
  readonly diagnostic?: string
}

export interface ValuationTelemetry {
  readonly companyCoverageResolved: boolean
  readonly marketDataUsable: boolean
  readonly financialBasisUsable: boolean
  readonly pointInTimeVerified: boolean
  readonly eligibleMethods: readonly ValuationMethod[]
  readonly primaryMethod?: ValuationMethod
  readonly assumptionDesign: ValuationReasoningTelemetry
  readonly computation: { readonly scenarioCount: number; readonly calculatedScenarioCount: number; readonly sensitivityCellCount: number; readonly deterministicRecomputeStatus: 'matched' | 'unavailable' | 'mismatch' }
  readonly synthesis: ValuationReasoningTelemetry
  readonly proposalCandidateCount: number
  readonly acceptedProposalCount: number
  readonly canonicalSourceCount: number
  readonly canonicalClaimCount: number
}
