import { listOpenReviewCases, loadReviewCase } from '../../knowledge/review/store.ts'
import type { ReviewCase } from '../../knowledge/review/contracts.ts'
import { ApplicationServiceError, type ReviewCaseDetail, type ReviewCaseListInput, type ReviewCaseListResult, type ReviewCaseSummary, type ApplicationLimit } from './contracts.ts'

const DEFAULT_REVIEW_LIMIT = 20
const HARD_REVIEW_LIMIT = 50
const DEFAULT_DEPENDENT_LIMIT = 20
const HARD_DEPENDENT_LIMIT = 20
function limitOf(value: number | undefined, fallback: number, hard: number): number { if (value === undefined) return fallback; if (!Number.isInteger(value) || value < 1) throw new ApplicationServiceError('invalid_input', `limit must be an integer between 1 and ${hard}`); return Math.min(value, hard) }
function bounded<T>(items: readonly T[], limit: number): { readonly items: readonly T[]; readonly metadata: ApplicationLimit } { return { items: items.slice(0, limit), metadata: { limit, total: items.length, truncated: items.length > limit } } }
function summary(reviewCase: ReviewCase): ReviewCaseSummary { return { reviewCaseId: reviewCase.reviewCaseId, producerRunId: reviewCase.producerRunId, producerType: reviewCase.producerType, createdAt: reviewCase.createdAt, category: reviewCase.classification.category, actionability: reviewCase.classification.actionability, origin: reviewCase.classification.origin, rationale: reviewCase.classification.rationale, proposalKind: reviewCase.rootProposal.proposalKind, semanticType: reviewCase.rootProposal.semanticType, dependentProposalCount: reviewCase.impact.dependentProposalCount, ...(reviewCase.advisory?.suggestedNextAction === undefined ? {} : { suggestedNextAction: reviewCase.advisory.suggestedNextAction }), status: reviewCase.state.status } }

export class ReviewService {
  constructor(private readonly mountedKnowledgeBaseRoot?: string) {}
  private root(): string { if (!this.mountedKnowledgeBaseRoot) throw new ApplicationServiceError('no_kb_mounted', 'No canonical Knowledge Base is mounted'); return this.mountedKnowledgeBaseRoot }
  async listOpenReviewCases(input: ReviewCaseListInput = {}): Promise<ReviewCaseListResult> {
    const limit = limitOf(input.limit, DEFAULT_REVIEW_LIMIT, HARD_REVIEW_LIMIT)
    const cases = (await listOpenReviewCases(this.root(), input.producerRunId === undefined ? {} : { producerRunId: input.producerRunId }))
      .filter((item) => input.actionability === undefined || item.classification.actionability === input.actionability)
      .filter((item) => input.category === undefined || item.classification.category === input.category)
      .sort((left, right) => left.reviewCaseId.localeCompare(right.reviewCaseId))
    const result = bounded(cases, limit)
    return { cases: result.items.map(summary), total: result.metadata.total, limit, truncated: result.metadata.truncated }
  }
  async countOpenReviewCases(): Promise<number> { return (await listOpenReviewCases(this.root())).length }
  async getReviewCase(reviewCaseId: string, dependentLimit?: number): Promise<ReviewCaseDetail> {
    if (typeof reviewCaseId !== 'string' || reviewCaseId.trim() === '') throw new ApplicationServiceError('invalid_input', 'reviewCaseId is required')
    const limit = limitOf(dependentLimit, DEFAULT_DEPENDENT_LIMIT, HARD_DEPENDENT_LIMIT)
    const value = await loadReviewCase(this.root(), reviewCaseId)
    if (!value) throw new ApplicationServiceError('not_found', `ReviewCase not found: ${reviewCaseId}`)
    const dependents = bounded(value.suspendedProposalBundle.dependentProposals, limit)
    return { reviewCaseId: value.reviewCaseId, producerRunId: value.producerRunId, producerType: value.producerType, createdAt: value.createdAt, classification: value.classification, rootProposal: value.rootProposal, evidenceBindings: value.rootProposal.evidenceBindings, existingKnowledgeProjections: value.resolutionContext.existingKnowledgeProjections, impact: value.impact, ...(value.advisory === undefined ? {} : { advisory: value.advisory }), state: value.state, totalDependentProposals: dependents.metadata.total, dependentProposalSamples: dependents.items, dependentProposals: dependents.items, dependentsTruncated: dependents.metadata.truncated }
  }
}

export { DEFAULT_REVIEW_LIMIT, HARD_REVIEW_LIMIT, DEFAULT_DEPENDENT_LIMIT, HARD_DEPENDENT_LIMIT }
