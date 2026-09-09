import { Type } from '@earendil-works/pi-ai'
import { defineTool, type ToolDefinition } from '@earendil-works/pi-coding-agent'
import { ApplicationServiceError, type EarningsReviewInput, type EventResearchInput, type IngestDocumentInput, type ReviewCaseListInput, type ResearchCompanyInput, type ThesisRedTeamInput, type ValuationInput } from '../services/contracts.ts'
import type { KnowledgeService } from '../services/knowledge-service.ts'
import type { ProductionService } from '../services/production-service.ts'
import type { ReviewService } from '../services/review-service.ts'
import type { WorkflowService } from '../services/workflow-service.ts'
import type { ResearchService } from '../services/research-service.ts'
import type { DailyIntelligenceService } from '../services/daily-intelligence-service.ts'
import type { DailyBriefInput } from '../services/daily-intelligence-service.ts'

export interface ResearchHubPiToolContext {
  readonly knowledgeService: KnowledgeService
  readonly productionService: ProductionService
  readonly reviewService: ReviewService
  readonly workflowService: WorkflowService
  readonly researchService?: ResearchService
  readonly dailyIntelligenceService?: DailyIntelligenceService
}

function textResult(value: unknown, isError = false) { return { content: [{ type: 'text' as const, text: JSON.stringify(value) }], details: undefined, isError } }
function formatError(error: unknown): { readonly error: string; readonly code: string } {
  if (error instanceof ApplicationServiceError) return { error: error.message, code: error.code }
  return { error: 'ResearchHub application operation failed', code: 'failed' }
}
async function invoke<T>(operation: () => Promise<T>, signal?: AbortSignal) {
  try { if (signal?.aborted) return textResult({ error: 'ResearchHub operation cancelled', code: 'cancelled' }, true); return textResult(await operation()) }
  catch (error) { return textResult(formatError(error), true) }
}
function integerParam(value: number | undefined, name: string): void { if (value !== undefined && (!Number.isInteger(value) || value < 1)) throw new ApplicationServiceError('invalid_input', `${name} must be a positive integer`) }

export function createResearchHubTools(context: ResearchHubPiToolContext): ToolDefinition[] {
  const status = defineTool({
    name: 'researchhub_status', label: 'ResearchHub status', description: 'Read bounded canonical ResearchHub status. This tool never mutates data.', promptSnippet: 'Inspect ResearchHub status', parameters: Type.Object({}),
    execute: async () => invoke(async () => ({ knowledgeBase: await context.knowledgeService.status(), openReviewCases: await context.reviewService.countOpenReviewCases() })),
  })
  const search = defineTool({
    name: 'search_knowledge', label: 'Search Knowledge', description: 'Deterministically search bounded canonical Knowledge by exact reference or Entity name, alias, and ID.', promptSnippet: 'Search canonical Knowledge', parameters: Type.Object({ query: Type.String(), entityType: Type.Optional(Type.String()), limit: Type.Optional(Type.Number()) }),
    execute: async (_toolCallId, params) => invoke(async () => { integerParam(params.limit, 'limit'); return context.knowledgeService.searchKnowledge({ query: params.query, ...(params.entityType === undefined ? {} : { entityType: params.entityType as never }), limit: params.limit }) }),
  })
  const object = defineTool({
    name: 'get_knowledge_object', label: 'Get Knowledge object', description: 'Read one bounded canonical Knowledge object and related projections.', promptSnippet: 'Read a canonical Knowledge object', parameters: Type.Object({ ref: Type.String(), relatedLimit: Type.Optional(Type.Number()) }),
    execute: async (_toolCallId, params) => invoke(async () => { integerParam(params.relatedLimit, 'relatedLimit'); return context.knowledgeService.getKnowledgeObject(params.ref, params.relatedLimit) }),
  })
  const ingest = defineTool({
    name: 'ingest_document', label: 'Ingest document', description: 'Explicitly ingest text or an existing workspace file through the governed Knowledge Production Workflow.', promptSnippet: 'Ingest a document through Knowledge Production', parameters: Type.Object({ workflowRunId: Type.String(), text: Type.Optional(Type.String()), workspaceFile: Type.Optional(Type.String()), originalFilename: Type.Optional(Type.String()), mediaType: Type.Optional(Type.String()), instructions: Type.Optional(Type.String()), sourceMetadata: Type.Optional(Type.Object({ title: Type.Optional(Type.String()), institution: Type.Optional(Type.String()), author: Type.Optional(Type.String()), publishedAt: Type.Optional(Type.String()), sourceUrl: Type.Optional(Type.String()) })) }),
    execute: async (_toolCallId, params, signal) => invoke(() => context.productionService.ingestDocument(params as IngestDocumentInput, signal), signal),
  })
  const workflowStatus = defineTool({ name: 'get_workflow_status', label: 'Get Workflow status', description: 'Read authoritative application Workflow state.', promptSnippet: 'Inspect Workflow status', parameters: Type.Object({ runId: Type.String() }), execute: async (_toolCallId, params) => invoke(async () => { const result = context.workflowService.getWorkflowStatus(params.runId); if (!result) throw new ApplicationServiceError('not_found', `Workflow run not found: ${params.runId}`); return result }) })
  const cancel = defineTool({ name: 'cancel_workflow', label: 'Cancel Workflow', description: 'Request cancellation of an active Knowledge Production Workflow.', promptSnippet: 'Cancel an active Workflow', parameters: Type.Object({ runId: Type.String() }), execute: async (_toolCallId, params) => invoke(async () => context.workflowService.cancelWorkflow(params.runId)) })
  const reviewList = defineTool({ name: 'list_review_cases', label: 'List ReviewCases', description: 'Read bounded open durable ReviewCase summaries.', promptSnippet: 'List open ReviewCases', parameters: Type.Object({ limit: Type.Optional(Type.Number()), actionability: Type.Optional(Type.String()), category: Type.Optional(Type.String()), producerRunId: Type.Optional(Type.String()) }), execute: async (_toolCallId, params) => invoke(async () => { integerParam(params.limit, 'limit'); return context.reviewService.listOpenReviewCases(params as ReviewCaseListInput) }) })
  const reviewGet = defineTool({ name: 'get_review_case', label: 'Get ReviewCase', description: 'Read one safe bounded durable ReviewCase detail without mutation.', promptSnippet: 'Inspect a ReviewCase', parameters: Type.Object({ reviewCaseId: Type.String(), dependentLimit: Type.Optional(Type.Number()) }), execute: async (_toolCallId, params) => invoke(async () => { integerParam(params.dependentLimit, 'dependentLimit'); return context.reviewService.getReviewCase(params.reviewCaseId, params.dependentLimit) }) })
  const tools = [status, search, object, ingest, workflowStatus, cancel, reviewList, reviewGet]
  if (context.researchService) {
    tools.push(defineTool({ name: 'research_company', label: 'Research company', description: 'Start bounded A-share Company Deep Research and return its linked Report and Knowledge outcome.', promptSnippet: 'Research an A-share company through the governed production Workflow', parameters: Type.Object({ workflowRunId: Type.String(), symbol: Type.String(), name: Type.Optional(Type.String()), exchange: Type.Optional(Type.String()), asOf: Type.Optional(Type.String()) }), execute: async (_toolCallId, params, signal) => invoke(() => context.researchService!.startResearchCompany(params as ResearchCompanyInput, signal).completion, signal) }))
    tools.push(defineTool({ name: 'get_research_report', label: 'Get research report', description: 'Read one bounded persisted Research Report by report ID.', promptSnippet: 'Read a persisted Research Report', parameters: Type.Object({ reportId: Type.String() }), execute: async (_toolCallId, params) => invoke(() => context.researchService!.getResearchReport(params.reportId)) }))
    tools.push(defineTool({ name: 'review_earnings', label: 'Review earnings', description: 'Start an exact-period Earnings Review for an already-covered A-share company.', promptSnippet: 'Review a covered company earnings period', parameters: Type.Object({ workflowRunId: Type.String(), symbol: Type.String(), name: Type.Optional(Type.String()), exchange: Type.Optional(Type.String()), fiscalYear: Type.Number(), period: Type.String(), asOf: Type.Optional(Type.String()) }), execute: async (_toolCallId, params, signal) => invoke(() => context.researchService!.startEarningsReview(params as EarningsReviewInput, signal).completion, signal) }))
    tools.push(defineTool({ name: 'analyze_valuation', label: 'Analyze valuation', description: 'Start a reproducible valuation for an already-covered A-share company using bounded AKShare data and deterministic calculations.', promptSnippet: 'Analyze valuation for a covered company', parameters: Type.Object({ workflowRunId: Type.String(), symbol: Type.String(), name: Type.Optional(Type.String()), exchange: Type.Optional(Type.String()), asOf: Type.Optional(Type.String()), methods: Type.Optional(Type.Array(Type.String())), targetFiscalYear: Type.Optional(Type.Number()) }), execute: async (_toolCallId, params, signal) => invoke(() => context.researchService!.startValuation(params as ValuationInput, signal).completion, signal) }))
      tools.push(defineTool({ name: 'research_event', label: 'Research event', description: 'Start bounded Event Research for one existing A-share Company and an explicit event anchor.', promptSnippet: 'Research a bounded event for a covered company', parameters: Type.Object({ workflowRunId: Type.String(), symbol: Type.String(), name: Type.Optional(Type.String()), exchange: Type.Optional(Type.String()), asOf: Type.Optional(Type.String()), anchor: Type.Union([Type.Object({ kind: Type.Literal('daily_signal'), signalId: Type.String() }), Type.Object({ kind: Type.Literal('article'), url: Type.String(), title: Type.Optional(Type.String()), publishedAt: Type.Optional(Type.String()), content: Type.Optional(Type.String()) }), Type.Object({ kind: Type.Literal('url'), url: Type.String(), title: Type.Optional(Type.String()), publishedAt: Type.Optional(Type.String()) }), Type.Object({ kind: Type.Literal('user_event'), title: Type.String(), description: Type.String(), eventDate: Type.Optional(Type.String()) })]) }), execute: async (_toolCallId, params, signal) => invoke(() => context.researchService!.startEventResearch(params as EventResearchInput, signal).completion, signal) }))
      tools.push(defineTool({ name: 'red_team_thesis', label: 'Red-team thesis', description: 'Adversarially test one exact active canonical Thesis for disconfirming evidence, alternatives, failure cases, and resilience.', promptSnippet: 'Red-team an active canonical thesis', parameters: Type.Object({ workflowRunId: Type.String(), symbol: Type.String(), name: Type.Optional(Type.String()), exchange: Type.Optional(Type.String()), thesisRef: Type.String(), lookbackDays: Type.Optional(Type.Number()) }), execute: async (_toolCallId, params, signal) => invoke(() => context.researchService!.startThesisRedTeam(params as ThesisRedTeamInput, signal).completion, signal) }))
  }
  if (context.dailyIntelligenceService) {
    const start = (briefType: 'morning' | 'evening') => defineTool({ name: `generate_${briefType}_brief`, label: `Generate ${briefType} brief`, description: `Generate a bounded ${briefType} Daily Intelligence Brief from configured public sources.`, promptSnippet: `Generate ${briefType} Daily Intelligence Brief`, parameters: Type.Object({ workflowRunId: Type.String(), tradeDate: Type.String(), asOf: Type.Optional(Type.String()), forceRefresh: Type.Optional(Type.Boolean()) }), execute: async (_toolCallId, params, signal) => invoke(() => context.dailyIntelligenceService!.startBrief({ ...(params as Omit<DailyBriefInput, 'briefType'>), briefType }, signal).completion, signal) })
    tools.push(start('morning')); tools.push(start('evening'))
    tools.push(defineTool({ name: 'get_daily_brief', label: 'Get daily brief', description: 'Read one bounded persisted Daily Intelligence Brief.', promptSnippet: 'Read a Daily Intelligence Brief', parameters: Type.Object({ reportId: Type.String() }), execute: async (_toolCallId, params) => invoke(() => context.dailyIntelligenceService!.getBrief(params.reportId)) }))
    tools.push(defineTool({ name: 'list_daily_briefs', label: 'List daily briefs', description: 'List recent persisted Daily Intelligence Briefs.', promptSnippet: 'List Daily Intelligence Briefs', parameters: Type.Object({ limit: Type.Optional(Type.Number()) }), execute: async (_toolCallId, params) => invoke(async () => { integerParam(params.limit, 'limit'); return context.dailyIntelligenceService!.listBriefs(params.limit) }) }))
  }
  return tools
}
