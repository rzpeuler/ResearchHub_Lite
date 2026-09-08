import type { SemanticProductionProposal } from '../../knowledge/production/contracts.ts'

export const EARNINGS_REVIEW_SECTIONS = [
  'Earnings Snapshot',
  'Revenue / Profit Growth',
  'Segment Performance',
  'Margin Analysis',
  'Cash Flow / Working Capital',
  'Earnings Quality',
  'Management Guidance',
  'One-offs / Accounting Effects',
  'Changes vs Prior Research',
  'Assumption Impact',
  'Thesis Impact',
  'Catalyst / Risk Changes',
  'Valuation Implications',
  'Research Gaps / Monitoring',
] as const

export type EarningsReviewSectionTitle = (typeof EARNINGS_REVIEW_SECTIONS)[number]
export type EarningsImpactDisposition = 'new_fact' | 'supports_existing' | 'contradicts_existing' | 'changes_assumption' | 'affects_thesis' | 'new_catalyst' | 'new_risk' | 'no_change' | 'research_gap'

export interface EarningsImpactAssessment {
  readonly assessmentId: string
  readonly disposition: EarningsImpactDisposition
  readonly existingKnowledgeRefs: readonly string[]
  readonly sourceCandidateIds: readonly string[]
  readonly rationale: string
}

export interface EarningsReviewProposal extends SemanticProductionProposal {
  readonly assessmentRefs: readonly string[]
}

export interface EarningsReviewSection {
  readonly id: string
  readonly title: EarningsReviewSectionTitle
  readonly markdown: string
  readonly sourceCandidateIds: readonly string[]
  readonly assessmentRefs: readonly string[]
}

export interface EarningsReviewReasoningTelemetry {
  readonly called: boolean
  readonly validated: boolean
  readonly applied: boolean
  readonly fallbackUsed: boolean
  readonly repairAttempts: number
  readonly operation: 'earnings_review_synthesis'
  readonly model?: string
  readonly diagnostic?: string
}

export interface EarningsReviewSkillInput {
  readonly company: { readonly symbol: string; readonly name?: string; readonly exchange?: string }
  readonly period: { readonly fiscalYear: number; readonly period: 'Q1' | 'H1' | 'Q3' | 'FY'; readonly key: string; readonly endDate: string }
  readonly officialSources: readonly { readonly candidateId: string; readonly title: string; readonly publishedAt?: string; readonly content: string; readonly url?: string }[]
  readonly financialMetrics: unknown
  readonly existingKnowledgeClaims: readonly Record<string, unknown>[]
}

export interface EarningsReviewSkillResult {
  readonly sections: readonly EarningsReviewSection[]
  readonly assessments: readonly EarningsImpactAssessment[]
  readonly proposals: readonly EarningsReviewProposal[]
  readonly reasoning: EarningsReviewReasoningTelemetry
}
