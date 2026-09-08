import type { ReasoningExecutor } from '../../plugins/reasoning/contracts.ts'
import { ReasoningExecutorError } from '../../plugins/reasoning/errors.ts'
import type { EarningsComputation } from './financials.ts'
import { EARNINGS_REVIEW_SECTIONS, type EarningsImpactAssessment, type EarningsReviewProposal, type EarningsReviewSection, type EarningsReviewSkillInput, type EarningsReviewSkillResult } from './contracts.ts'

const LOCAL_ID = /^[A-Za-z0-9][A-Za-z0-9._-]*$/
const DISPOSITIONS = new Set(['new_fact', 'supports_existing', 'contradicts_existing', 'changes_assumption', 'affects_thesis', 'new_catalyst', 'new_risk', 'no_change', 'research_gap'])

export class EarningsReviewSemanticError extends Error { readonly retryable: boolean; constructor(message: string, retryable = true) { super(message); this.name = 'EarningsReviewSemanticError'; this.retryable = retryable } }

export class EarningsReviewSkill {
  constructor(private readonly now: () => string = () => new Date().toISOString(), private readonly executor?: ReasoningExecutor) {}

  fallback(input: EarningsReviewSkillInput, computation: EarningsComputation, reason?: string): EarningsReviewSkillResult {
    const unavailable = computation.unavailable.length ? `Unavailable metrics for ${input.company.symbol}: ${computation.unavailable.join(', ')}.` : `Verified current-period metrics for ${input.company.symbol} are available.`
    const sections = EARNINGS_REVIEW_SECTIONS.map((title) => ({ id: sectionId(title), title, markdown: title === 'Research Gaps / Monitoring' ? `${gap(title)} ${unavailable}${reason ? ` Semantic reasoning fallback: ${reason}` : ''}` : title === 'Valuation Implications' ? `${gap(title)} Consensus unavailable` : gap(title), sourceCandidateIds: [], assessmentRefs: [] }))
    const runtime = this.executor as unknown as { runtimeMetadata?: () => { requestedModel?: string } } | undefined; const model = typeof runtime?.runtimeMetadata === 'function' ? runtime.runtimeMetadata().requestedModel : undefined
    return { sections, assessments: [], proposals: [], reasoning: { called: this.executor !== undefined, validated: false, applied: false, fallbackUsed: true, repairAttempts: 0, operation: 'earnings_review_synthesis', ...(model === undefined ? {} : { model }), ...(reason === undefined ? {} : { diagnostic: reason.slice(0, 300) }) } }
  }

  async synthesize(input: EarningsReviewSkillInput, computation: EarningsComputation): Promise<EarningsReviewSkillResult> {
    if (!this.executor) return this.fallback(input, computation)
    let repairAttempts = 0
    const execute = async (repair: boolean) => this.executor!.execute({
      operation: 'earnings_review_synthesis',
      instruction: `${repair ? 'Repair the prior invalid output. ' : ''}Review only the bounded earnings evidence. Return sections, impactAssessments, and local proposals. Never allocate canonical IDs or invent evidence, metrics, periods, or consensus.`,
      input: { generatedAt: this.now(), company: input.company, fiscalPeriod: input.period, selectedOfficialFilingExcerpts: input.officialSources.map((source) => ({ ...source, content: source.content.slice(0, 1_500) })), deterministicFinancialMetrics: computation.metrics, existingKnowledgeClaims: input.existingKnowledgeClaims.slice(0, 40), methodology: 'Exact-period official disclosure plus period-scoped AKShare metrics; code owns arithmetic and durable eligibility.' },
      outputContract: { sections: EARNINGS_REVIEW_SECTIONS.map((title) => ({ title, markdown: 'string', sourceCandidateIds: 'local source IDs', assessmentRefs: 'local assessment IDs' })), impactAssessments: 'local assessments with canonical Claim refs only', proposals: 'claim-only local proposals with assessmentRefs' },
      metadata: { operationFamily: 'personal-research-v1', companySymbol: input.company.symbol, fiscalPeriod: input.period.key },
    })
    try {
      let first
      try { first = await execute(false) } catch (error) {
        if (!(error instanceof ReasoningExecutorError) || error.code !== 'reasoning_output_invalid') throw error
        repairAttempts = 1; const repaired = await execute(true); return withReasoning(validateOutput(repaired.output, input, computation), this.executor, repairAttempts)
      }
      try { return withReasoning(validateOutput(first.output, input, computation), this.executor, repairAttempts) } catch (error) {
        if (!(error instanceof EarningsReviewSemanticError) || !error.retryable) throw error
        repairAttempts = 1; const repaired = await execute(true); return withReasoning(validateOutput(repaired.output, input, computation), this.executor, repairAttempts)
      }
    } catch (error) {
      throw new EarningsReviewSemanticError(error instanceof Error ? error.message : String(error), false)
    }
  }
}

function sectionId(title: string): string { return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') }
function gap(title: string): string { return `Research Gap / Unavailable: no bounded evidence supports a conclusion for ${title}.` }
function withReasoning(value: Omit<EarningsReviewSkillResult, 'reasoning'>, executor: ReasoningExecutor, repairAttempts: number): EarningsReviewSkillResult {
  const runtime = executor as unknown as { runtimeMetadata?: () => { requestedModel?: string } }; const model = typeof runtime.runtimeMetadata === 'function' ? runtime.runtimeMetadata().requestedModel : undefined
  return { ...value, reasoning: { called: true, validated: true, applied: true, fallbackUsed: false, repairAttempts, operation: 'earnings_review_synthesis', ...(model === undefined ? {} : { model }) } }
}
function parseObject(value: unknown): Record<string, unknown> {
  if (typeof value === 'string') { try { return parseObject(JSON.parse(value.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, ''))) } catch { throw new EarningsReviewSemanticError('earnings_review_synthesis returned invalid JSON') } }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new EarningsReviewSemanticError('earnings_review_synthesis must return an object')
  const object = value as Record<string, unknown>; const wrapped = object.result ?? object.output ?? object.data
  return wrapped === undefined ? object : parseObject(wrapped)
}
function arrayOfRecords(value: unknown): readonly Record<string, unknown>[] { return Array.isArray(value) ? value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object' && !Array.isArray(item)) : [] }
function strings(value: unknown): readonly string[] { return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [] }
function validateOutput(value: unknown, input: EarningsReviewSkillInput, computation: EarningsComputation): Omit<EarningsReviewSkillResult, 'reasoning'> {
  const object = parseObject(value); const sources = new Set(input.officialSources.map((source) => source.candidateId).concat(computation.metrics.flatMap((metric) => metric.sourceCandidateIds))); const claims = new Set(input.existingKnowledgeClaims.map((claim) => typeof claim.canonicalRef === 'string' ? claim.canonicalRef : ''))
  const assessments: EarningsImpactAssessment[] = arrayOfRecords(object.impactAssessments ?? object.assessments).map((item, index) => {
    const assessmentId = typeof item.assessmentId === 'string' ? item.assessmentId : ''
    const disposition = typeof item.disposition === 'string' ? item.disposition : ''
    const existingKnowledgeRefs = strings(item.existingKnowledgeRefs); const sourceCandidateIds = strings(item.sourceCandidateIds); const rationale = typeof item.rationale === 'string' ? item.rationale.trim() : ''
    if (!LOCAL_ID.test(assessmentId) || !DISPOSITIONS.has(disposition) || existingKnowledgeRefs.some((ref) => !/^claim:[^\s]+$/.test(ref) || !claims.has(ref)) || sourceCandidateIds.some((id) => !sources.has(id)) || !rationale) throw new EarningsReviewSemanticError(`Invalid earnings assessment at index ${index}`)
    return { assessmentId, disposition: disposition as EarningsImpactAssessment['disposition'], existingKnowledgeRefs, sourceCandidateIds, rationale }
  })
  const assessmentIds = new Set(assessments.map((item) => item.assessmentId))
  const proposals: EarningsReviewProposal[] = arrayOfRecords(object.proposals).map((item, index) => {
    const proposal = item as unknown as EarningsReviewProposal
    if (proposal.kind !== 'claim' || typeof proposal.proposalId !== 'string' || !LOCAL_ID.test(proposal.proposalId) || /^(?:entity|relation|claim|source|raw|module|theme-group):/.test(proposal.proposalId) || proposal.subjectKey !== 'company' || typeof proposal.statement !== 'string' || !proposal.statement.trim()) throw new EarningsReviewSemanticError(`Invalid earnings proposal at index ${index}`)
    const assessmentRefs = strings(item.assessmentRefs); if (!assessmentRefs.length || assessmentRefs.some((ref) => !assessmentIds.has(ref))) throw new EarningsReviewSemanticError(`Proposal assessmentRefs are invalid at index ${index}`)
    const sourceCandidateIds = strings(item.sourceCandidateIds); if (!sourceCandidateIds.length || sourceCandidateIds.some((id) => !sources.has(id))) throw new EarningsReviewSemanticError(`Proposal evidence refs are invalid at index ${index}`)
    return { ...proposal, assessmentRefs, sourceCandidateIds, temporal: undefined }
  })
  const rawSections = arrayOfRecords(object.sections); const byTitle = new Map(rawSections.map((item) => [typeof item.title === 'string' ? item.title : '', item])); const sections: EarningsReviewSection[] = EARNINGS_REVIEW_SECTIONS.map((title) => { const item = byTitle.get(title); const sourceCandidateIds = item ? strings(item.sourceCandidateIds) : []; const assessmentRefs = item ? strings(item.assessmentRefs) : []; if (sourceCandidateIds.some((id) => !sources.has(id)) || assessmentRefs.some((id) => !assessmentIds.has(id))) throw new EarningsReviewSemanticError(`Section ${title} contains unknown local references`); const markdown = item && typeof item.markdown === 'string' && item.markdown.trim() ? item.markdown.trim() : gap(title); return { id: sectionId(title), title, markdown, sourceCandidateIds, assessmentRefs } })
  const consensus = sections.find((section) => section.title === 'Valuation Implications')!; const finalSections = consensus.markdown.includes('Consensus unavailable') ? sections : sections.map((section) => section.title === consensus.title ? { ...section, markdown: `${section.markdown}\n\nConsensus unavailable` } : section)
  return { sections: finalSections, assessments, proposals }
}
