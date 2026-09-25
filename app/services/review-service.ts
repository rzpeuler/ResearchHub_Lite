import { listReviewDecisionProjections, loadReviewDecision, type ReviewDecisionEventType, type ReviewDecisionState } from '../../knowledge/review/decision-store.ts'
import { listOpenReviewCases, loadReviewCase } from '../../knowledge/review/store.ts'
import type { ReviewCase } from '../../knowledge/review/contracts.ts'
import { ApplicationServiceError, type ReviewCaseDetail, type ReviewCaseListInput, type ReviewCaseListResult, type ReviewCaseSummary, type ApplicationLimit } from './contracts.ts'

const DEFAULT_REVIEW_LIMIT = 20
const HARD_REVIEW_LIMIT = 50
const DEFAULT_DEPENDENT_LIMIT = 20
const HARD_DEPENDENT_LIMIT = 20
const HARD_DECISION_EVENT_LIMIT = 20
function limitOf(value: number | undefined, fallback: number, hard: number): number { if (value === undefined) return fallback; if (!Number.isInteger(value) || value < 1) throw new ApplicationServiceError('invalid_input', `limit must be an integer between 1 and ${hard}`); return Math.min(value, hard) }
function bounded<T>(items: readonly T[], limit: number): { readonly items: readonly T[]; readonly metadata: ApplicationLimit } { return { items: items.slice(0, limit), metadata: { limit, total: items.length, truncated: items.length > limit } } }
function summary(reviewCase: ReviewCase, decisionState?: ReviewDecisionState): ReviewCaseSummary { return { reviewCaseId: reviewCase.reviewCaseId, producerRunId: reviewCase.producerRunId, producerType: reviewCase.producerType, createdAt: reviewCase.createdAt, category: reviewCase.classification.category, actionability: reviewCase.classification.actionability, origin: reviewCase.classification.origin, rationale: reviewCase.classification.rationale, proposalKind: reviewCase.rootProposal.proposalKind, semanticType: reviewCase.rootProposal.semanticType, dependentProposalCount: reviewCase.impact.dependentProposalCount, ...(reviewCase.advisory?.suggestedNextAction === undefined ? {} : { suggestedNextAction: reviewCase.advisory.suggestedNextAction }), status: reviewCase.state.status, ...(decisionState === undefined ? {} : { decisionState }) } }
function caseKey(producerRunId: string, reviewCaseId: string): string { return `${producerRunId}\0${reviewCaseId}` }
function decisionEventView(event: { readonly revision: number; readonly type: ReviewDecisionEventType; readonly actor: 'local_user'; readonly at: string; readonly note?: string; readonly writerRunId?: string; readonly committedRevision?: number }) {
  return { revision: event.revision, type: event.type, actor: event.actor, at: event.at, ...(event.note === undefined ? {} : { note: event.note }), ...(event.writerRunId === undefined ? {} : { writerRunId: event.writerRunId }), ...(event.committedRevision === undefined ? {} : { committedRevision: event.committedRevision }) }
}

export class ReviewService {
  constructor(private readonly mountedKnowledgeBaseRoot?: string) {}
  private root(): string { if (!this.mountedKnowledgeBaseRoot) throw new ApplicationServiceError('no_kb_mounted', 'No canonical Knowledge Base is mounted'); return this.mountedKnowledgeBaseRoot }
  private async actionableCases(producerRunId?: string): Promise<{ readonly reviewCase: ReviewCase; readonly decisionState?: ReviewDecisionState }[]> {
    const root = this.root()
    const [openCases, decisions] = await Promise.all([
      listOpenReviewCases(root, producerRunId === undefined ? {} : { producerRunId }),
      listReviewDecisionProjections(root, producerRunId === undefined ? {} : { producerRunId }),
    ])
    const byCase = new Map(decisions.map((item) => [caseKey(item.producerRunId, item.reviewCaseId), item]))
    return openCases.flatMap((reviewCase) => {
      if (reviewCase.producerType !== 'thesis_lifecycle') return [{ reviewCase }]
      const decision = byCase.get(caseKey(reviewCase.producerRunId, reviewCase.reviewCaseId))
      if (!decision?.actionable) return []
      return [{ reviewCase, decisionState: decision.state }]
    })
  }
  async listOpenReviewCases(input: ReviewCaseListInput = {}): Promise<ReviewCaseListResult> {
    const limit = limitOf(input.limit, DEFAULT_REVIEW_LIMIT, HARD_REVIEW_LIMIT)
    const cases = (await this.actionableCases(input.producerRunId))
      .filter(({ reviewCase }) => input.actionability === undefined || reviewCase.classification.actionability === input.actionability)
      .filter(({ reviewCase }) => input.category === undefined || reviewCase.classification.category === input.category)
      .sort((left, right) => left.reviewCase.reviewCaseId.localeCompare(right.reviewCase.reviewCaseId))
    const result = bounded(cases, limit)
    return { cases: result.items.map(({ reviewCase, decisionState }) => summary(reviewCase, decisionState)), total: result.metadata.total, limit, truncated: result.metadata.truncated }
  }
  async countOpenReviewCases(): Promise<number> { return (await this.actionableCases()).length }
  async getReviewCase(reviewCaseId: string, dependentLimit?: number): Promise<ReviewCaseDetail> {
    if (typeof reviewCaseId !== 'string' || reviewCaseId.trim() === '') throw new ApplicationServiceError('invalid_input', 'reviewCaseId is required')
    const limit = limitOf(dependentLimit, DEFAULT_DEPENDENT_LIMIT, HARD_DEPENDENT_LIMIT)
    const value = await loadReviewCase(this.root(), reviewCaseId)
    if (!value) throw new ApplicationServiceError('not_found', `ReviewCase not found: ${reviewCaseId}`)
    const dependents = bounded(value.suspendedProposalBundle.dependentProposals, limit)
    const decisionSnapshot = value.producerType === 'thesis_lifecycle' ? await loadReviewDecision(this.root(), value.producerRunId, value.reviewCaseId) : undefined
    const events = decisionSnapshot?.record?.events ?? []
    const boundedEvents = events.slice(-HARD_DECISION_EVENT_LIMIT).map(decisionEventView)
    const decision = decisionSnapshot ? { state: decisionSnapshot.state, revision: decisionSnapshot.revision, actionable: decisionSnapshot.state === 'OPEN' || decisionSnapshot.state === 'DEFERRED', events: boundedEvents, totalEvents: events.length, eventsTruncated: events.length > boundedEvents.length } : undefined
    return { reviewCaseId: value.reviewCaseId, producerRunId: value.producerRunId, producerType: value.producerType, createdAt: value.createdAt, classification: value.classification, rootProposal: value.rootProposal, evidenceBindings: value.rootProposal.evidenceBindings, existingKnowledgeProjections: value.resolutionContext.existingKnowledgeProjections, impact: value.impact, ...(value.thesisScope === undefined ? {} : { thesisScope: value.thesisScope }), ...(value.advisory === undefined ? {} : { advisory: value.advisory }), state: value.state, ...(decision === undefined ? {} : { decision }), totalDependentProposals: dependents.metadata.total, dependentProposalSamples: dependents.items, dependentProposals: dependents.items, dependentsTruncated: dependents.metadata.truncated }
  }
}

export { DEFAULT_REVIEW_LIMIT, HARD_REVIEW_LIMIT, DEFAULT_DEPENDENT_LIMIT, HARD_DEPENDENT_LIMIT }
