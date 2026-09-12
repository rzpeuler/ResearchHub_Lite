import { join, resolve } from 'node:path'
import { KnowledgeBaseRegistry } from '../../knowledge/registry/registry.ts'
import { runCompanyDeepResearch } from '../../workflows/company-deep-research/workflow.ts'
import { runIndustryDeepResearch } from '../../workflows/industry-deep-research/workflow.ts'
import { runEarningsReview } from '../../workflows/earnings-review/workflow.ts'
import { runValuation } from '../../workflows/valuation/workflow.ts'
import { runEventResearch } from '../../workflows/event-research/workflow.ts'
import { runThesisRedTeam } from '../../workflows/thesis-red-team/workflow.ts'
import type { EventResearchSignalStore } from '../../plugins/daily-intelligence/contracts.ts'
import type { ResearchAcquisitionPlugin, ResearchCompanyIdentity, ResearchProviderOutcome, ResearchSignalStore } from '../../plugins/research-acquisition/contracts.ts'
import type { AkshareDataClient } from '../../plugins/research-acquisition/akshare.ts'
import { AkshareIndustryResearchPlugin } from '../../plugins/research-acquisition/industry.ts'
import { IndustryAcquisitionComposition } from '../../plugins/research-acquisition/industry-composition.ts'
import { ApplicationServiceError, type ApplicationEarningsReviewResult, type ApplicationEventResearchResult, type ApplicationResearchResult, type ApplicationValuationResult, type ApplicationThesisRedTeamResult, type ApplicationIndustryResearchResult, type EarningsReviewInput, type EventResearchInput, type IndustryResearchInput, type ResearchCompanyInput, type ThesisRedTeamInput, type ValuationInput } from './contracts.ts'
import { WorkflowService } from './workflow-service.ts'
import { readResearchReport } from './research-report.ts'
import type { ReasoningExecutor } from '../../plugins/reasoning/contracts.ts'

export interface ResearchServiceOptions {
  readonly mountedKnowledgeBaseRoot: string
  readonly reportRoot?: string
  readonly acquisitionPlugins: readonly ResearchAcquisitionPlugin[]
  readonly akshare?: AkshareDataClient
  readonly signalStore?: ResearchSignalStore
  readonly dailySignalStore?: EventResearchSignalStore
  readonly workflowService: WorkflowService
  readonly cwd?: string
  readonly reasoningExecutor?: ReasoningExecutor
  readonly industryReasoningExecutorFactory?: () => Promise<ReasoningExecutor>
}

export class ResearchService {
  private readonly registry = new KnowledgeBaseRegistry()

  constructor(private readonly options: ResearchServiceOptions) {}

  startResearchCompany(input: ResearchCompanyInput, callerSignal?: AbortSignal): { readonly runId: string; readonly completion: Promise<ApplicationResearchResult> } {
    if (!input || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(input.workflowRunId) || !/^\d{6}$/.test(input.symbol)) {
      throw new ApplicationServiceError('invalid_input', 'workflowRunId and A-share symbol are invalid')
    }
    const company: ResearchCompanyIdentity = {
      symbol: input.symbol,
      ...(input.name === undefined ? {} : { name: input.name }),
      ...(input.exchange === undefined ? {} : { exchange: input.exchange }),
    }
    this.options.workflowService.register({
      runId: input.workflowRunId,
      workflowType: 'company_deep_research',
      objective: `Company research ${input.symbol}`,
    })
    const completion = this.options.workflowService.start(input.workflowRunId, async (signal) => {
      const combined = new AbortController()
      const abort = () => combined.abort()
      signal.addEventListener('abort', abort, { once: true })
      callerSignal?.addEventListener('abort', abort, { once: true })
      try {
        const handle = await this.registry.mount(resolve(this.options.mountedKnowledgeBaseRoot))
        const result = await runCompanyDeepResearch({
          workflowRunId: input.workflowRunId,
          handle,
          company,
          acquisitionPlugins: this.options.acquisitionPlugins,
          akshare: this.options.akshare,
          asOf: input.asOf,
          reportRoot: resolve(this.options.reportRoot ?? join(this.options.cwd ?? process.cwd(), 'runtime-data', 'reports')),
          signal: combined.signal,
          signalStore: this.options.signalStore,
          reasoningExecutor: this.options.reasoningExecutor,
        })
        if (result.status === 'completed') {
          this.options.workflowService.markAuthoritativeTerminal(input.workflowRunId, 'completed', { summary: `Company research completed for ${input.symbol}` })
        }
        return {
          status: result.status,
          summary: result.status === 'completed' ? `Company research completed for ${input.symbol}` : 'Company research did not complete',
          errorSummary: result.errors.join('; ').slice(0, 500),
          workflow: result,
        }
      } finally {
        signal.removeEventListener('abort', abort)
        callerSignal?.removeEventListener('abort', abort)
      }
    }).then((outcome) => ({
      runId: input.workflowRunId,
      status: outcome.status,
      knowledgeBaseId: outcome.workflow.knowledgeBaseId,
      ...(outcome.workflow.report === undefined ? {} : {
        reportId: outcome.workflow.report.reportId,
        // Keep the application/API contract relative; the server owns report storage.
        reportPath: `${outcome.workflow.report.reportId}.md`,
      }),
      committedIds: outcome.workflow.committedIds,
      proposalCount: outcome.workflow.proposalIds.length,
      summary: outcome.summary,
      ...(outcome.errorSummary ? { errorSummary: outcome.errorSummary } : {}),
    }))
    completion.catch(() => undefined)
    return { runId: input.workflowRunId, completion }
  }

  startIndustryResearch(input: IndustryResearchInput, callerSignal?: AbortSignal): { readonly runId: string; readonly completion: Promise<ApplicationIndustryResearchResult> } {
    if (!input || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(input.workflowRunId) || typeof input.name !== 'string' || input.name.trim() === '' || input.name.length > 200) throw new ApplicationServiceError('invalid_input', 'workflowRunId and Industry name are invalid')
    if (input.canonicalRef !== undefined && !/^entity:[A-Za-z0-9._-]+$/.test(input.canonicalRef)) throw new ApplicationServiceError('invalid_input', 'canonicalRef is invalid')
    if (input.aliases !== undefined && (!Array.isArray(input.aliases) || input.aliases.length > 8 || input.aliases.some((x) => typeof x !== 'string' || !x.trim() || x.length > 120))) throw new ApplicationServiceError('invalid_input', 'aliases are invalid')
    if (input.searchTerms !== undefined && (!Array.isArray(input.searchTerms) || input.searchTerms.length > 8 || input.searchTerms.some((x) => typeof x !== 'string' || !x.trim() || x.length > 120))) throw new ApplicationServiceError('invalid_input', 'searchTerms are invalid')
    if (input.maxSources !== undefined && (!Number.isSafeInteger(input.maxSources) || input.maxSources < 1 || input.maxSources > 50)) throw new ApplicationServiceError('invalid_input', 'maxSources is invalid')
    if (input.maxEvidencePerModule !== undefined && (!Number.isSafeInteger(input.maxEvidencePerModule) || input.maxEvidencePerModule < 1 || input.maxEvidencePerModule > 12)) throw new ApplicationServiceError('invalid_input', 'maxEvidencePerModule is invalid')
    const target = { name: input.name.trim(), ...(input.aliases === undefined ? {} : { aliases: input.aliases.map((x) => x.trim()) }), ...(input.canonicalRef === undefined ? {} : { canonicalRef: input.canonicalRef }), ...(input.asOf === undefined ? {} : { asOf: input.asOf }) }
    const industryReasoningExecutorFactory = this.options.industryReasoningExecutorFactory
      ?? (this.options.reasoningExecutor === undefined ? undefined : async () => this.options.reasoningExecutor!)
    if (!industryReasoningExecutorFactory) throw new ApplicationServiceError('failed', 'Industry Research requires a configured ReasoningExecutor')
    const plugins = [...this.options.acquisitionPlugins]; if (this.options.akshare) plugins.push(new AkshareIndustryResearchPlugin(this.options.akshare))
    const composition = new IndustryAcquisitionComposition(plugins)
    this.options.workflowService.register({ runId: input.workflowRunId, workflowType: 'industry_deep_research', objective: `Industry research ${target.name}` })
    const completion = this.options.workflowService.start(input.workflowRunId, async (signal) => {
      const combined = new AbortController(); const abort = () => combined.abort(); signal.addEventListener('abort', abort, { once: true }); callerSignal?.addEventListener('abort', abort, { once: true }); let diagnostics: readonly string[] = []; let outcomes: readonly ResearchProviderOutcome[] = []
      try { const reasoningExecutor = await industryReasoningExecutorFactory(); const handle = await this.registry.mount(resolve(this.options.mountedKnowledgeBaseRoot)); const result = await runIndustryDeepResearch({ workflowRunId: input.workflowRunId, handle, target, reportRoot: resolve(this.options.reportRoot ?? join(this.options.cwd ?? process.cwd(), 'runtime-data', 'reports')), reasoningExecutor, maxSources: input.maxSources, maxEvidencePerModule: input.maxEvidencePerModule, signal: combined.signal, acquisitionWave: async (request) => { const acquired = await composition.acquire({ ...request, searchTerms: input.searchTerms ?? request.searchTerms }); diagnostics = [...diagnostics, ...acquired.diagnostics].slice(0, 32); const prior = new Map<string, ResearchProviderOutcome>(outcomes.map((outcome) => [outcome.provider, outcome])); for (const outcome of acquired.outcomes) { const previous = prior.get(outcome.provider); prior.set(outcome.provider, previous === undefined ? outcome : { provider: outcome.provider, providerAttempted: previous.providerAttempted || outcome.providerAttempted, providerSucceeded: previous.providerSucceeded || outcome.providerSucceeded, providerEmpty: previous.providerEmpty && outcome.providerEmpty, providerFailed: previous.providerFailed || outcome.providerFailed, usableSourceCount: Math.min(24, previous.usableSourceCount + outcome.usableSourceCount) }) } outcomes = [...prior.values()].slice(0, 8); return acquired.sources } }); return { status: result.status, workflow: result, diagnostics, outcomes } } finally { signal.removeEventListener('abort', abort); callerSignal?.removeEventListener('abort', abort) }
    }).then((outcome) => ({ runId: input.workflowRunId, status: outcome.status, knowledgeBaseId: outcome.workflow.knowledgeBaseId, ...(outcome.workflow.report === undefined ? {} : { reportId: outcome.workflow.report.reportId, reportPath: `${outcome.workflow.report.reportId}.md` }), committedIds: outcome.workflow.committedIds, proposalCount: outcome.workflow.proposalIds.length, summary: outcome.workflow.status === 'completed' ? `Industry research completed for ${target.name}` : `Industry research ${outcome.workflow.status} for ${target.name}`, ...(outcome.workflow.errors.length ? { errorSummary: outcome.workflow.errors.join('; ').slice(0, 500) } : {}), providerOutcomes: outcome.outcomes, acquisitionDiagnostics: outcome.diagnostics }))
    completion.catch(() => undefined); return { runId: input.workflowRunId, completion }
  }

  startEarningsReview(input: EarningsReviewInput, callerSignal?: AbortSignal): { readonly runId: string; readonly completion: Promise<ApplicationEarningsReviewResult> } {
    if (!input || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(input.workflowRunId) || !/^\d{6}$/.test(input.symbol) || !Number.isInteger(input.fiscalYear) || !['Q1', 'H1', 'Q3', 'FY'].includes(input.period)) throw new ApplicationServiceError('invalid_input', 'workflowRunId, A-share symbol, fiscalYear, and period are invalid')
    const company: ResearchCompanyIdentity = { symbol: input.symbol, ...(input.name === undefined ? {} : { name: input.name }), ...(input.exchange === undefined ? {} : { exchange: input.exchange }) }
    this.options.workflowService.register({ runId: input.workflowRunId, workflowType: 'earnings_review', objective: `Earnings review ${input.symbol} ${input.fiscalYear}-${input.period}` })
    const completion = this.options.workflowService.start(input.workflowRunId, async (signal) => {
      const combined = new AbortController(); const abort = () => combined.abort(); signal.addEventListener('abort', abort, { once: true }); callerSignal?.addEventListener('abort', abort, { once: true })
      try {
        const handle = await this.registry.mount(resolve(this.options.mountedKnowledgeBaseRoot)); const result = await runEarningsReview({ workflowRunId: input.workflowRunId, handle, company, fiscalYear: input.fiscalYear, period: input.period, asOf: input.asOf, reportRoot: resolve(this.options.reportRoot ?? join(this.options.cwd ?? process.cwd(), 'runtime-data', 'reports')), acquisitionPlugins: this.options.acquisitionPlugins, akshare: this.options.akshare, reasoningExecutor: this.options.reasoningExecutor, signal: combined.signal })
        return { runId: input.workflowRunId, status: result.status, knowledgeBaseId: result.knowledgeBaseId, ...(result.report === undefined ? {} : { reportId: result.report.reportId, reportPath: `${result.report.reportId}.md` }), committedIds: result.committedIds, proposalCount: result.proposalIds.length, summary: result.status === 'completed' ? `Earnings review completed for ${input.symbol} ${input.fiscalYear}-${input.period}` : `Earnings review ${result.status} for ${input.symbol}`, ...(result.errors.length ? { errorSummary: result.errors.join('; ').slice(0, 500) } : {}), telemetry: result.telemetry, ...(result.blockedReason === undefined ? {} : { blockedReason: result.blockedReason }) }
      } finally { signal.removeEventListener('abort', abort); callerSignal?.removeEventListener('abort', abort) }
    }).then((outcome) => outcome as ApplicationEarningsReviewResult)
    completion.catch(() => undefined); return { runId: input.workflowRunId, completion }
  }

  startValuation(input: ValuationInput, callerSignal?: AbortSignal): { readonly runId: string; readonly completion: Promise<ApplicationValuationResult> } {
    if (!input || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(input.workflowRunId) || !/^\d{6}$/.test(input.symbol) || (input.methods !== undefined && (!Array.isArray(input.methods) || input.methods.some((method) => !['PE', 'PB', 'EV_EBITDA'].includes(method))))) throw new ApplicationServiceError('invalid_input', 'workflowRunId, A-share symbol, and valuation methods are invalid')
    if (input.targetFiscalYear !== undefined && !Number.isInteger(input.targetFiscalYear)) throw new ApplicationServiceError('invalid_input', 'targetFiscalYear must be an integer')
    const company: ResearchCompanyIdentity = { symbol: input.symbol, ...(input.name === undefined ? {} : { name: input.name }), ...(input.exchange === undefined ? {} : { exchange: input.exchange }) }
    this.options.workflowService.register({ runId: input.workflowRunId, workflowType: 'valuation', objective: `Valuation ${input.symbol}` })
    const completion = this.options.workflowService.start(input.workflowRunId, async (signal) => {
      const combined = new AbortController(); const abort = () => combined.abort(); signal.addEventListener('abort', abort, { once: true }); callerSignal?.addEventListener('abort', abort, { once: true })
      try {
        const handle = await this.registry.mount(resolve(this.options.mountedKnowledgeBaseRoot)); const result = await runValuation({ workflowRunId: input.workflowRunId, handle, company, asOf: input.asOf, methods: input.methods, targetFiscalYear: input.targetFiscalYear, reportRoot: resolve(this.options.reportRoot ?? join(this.options.cwd ?? process.cwd(), 'runtime-data', 'reports')), akshare: this.options.akshare, reasoningExecutor: this.options.reasoningExecutor, signal: combined.signal })
        return { runId: input.workflowRunId, status: result.status, knowledgeBaseId: result.knowledgeBaseId, ...(result.report === undefined ? {} : { reportId: result.report.reportId, reportPath: `${result.report.reportId}.md` }), committedIds: result.committedIds, proposalCount: result.proposalIds.length, summary: result.status === 'completed' ? `Valuation completed for ${input.symbol}` : `Valuation ${result.status} for ${input.symbol}`, ...(result.errors.length ? { errorSummary: result.errors.join('; ').slice(0, 500) } : {}), telemetry: result.telemetry, providerOutcome: result.providerOutcome, ...(result.blockedReason === undefined ? {} : { blockedReason: result.blockedReason }) }
      } finally { signal.removeEventListener('abort', abort); callerSignal?.removeEventListener('abort', abort) }
    }).then((outcome) => outcome as ApplicationValuationResult)
    completion.catch(() => undefined); return { runId: input.workflowRunId, completion }
  }

  startEventResearch(input: EventResearchInput, callerSignal?: AbortSignal): { readonly runId: string; readonly completion: Promise<ApplicationEventResearchResult & { readonly providerOutcome?: unknown }> } {
    if (!input || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(input.workflowRunId) || !/^\d{6}$/.test(input.symbol)) throw new ApplicationServiceError('invalid_input', 'workflowRunId and A-share symbol are invalid')
    const company: ResearchCompanyIdentity = { symbol: input.symbol, ...(input.name === undefined ? {} : { name: input.name }), ...(input.exchange === undefined ? {} : { exchange: input.exchange }) }
    this.options.workflowService.register({ runId: input.workflowRunId, workflowType: 'event_research', objective: `Event research ${input.symbol}` })
    const completion = this.options.workflowService.start(input.workflowRunId, async (signal) => {
      const combined = new AbortController(); const abort = () => combined.abort(); signal.addEventListener('abort', abort, { once: true }); callerSignal?.addEventListener('abort', abort, { once: true })
      try {
        const handle = await this.registry.mount(resolve(this.options.mountedKnowledgeBaseRoot)); const result = await runEventResearch({ workflowRunId: input.workflowRunId, handle, company, anchor: input.anchor, asOf: input.asOf, reportRoot: resolve(this.options.reportRoot ?? join(this.options.cwd ?? process.cwd(), 'runtime-data', 'reports')), acquisitionPlugins: this.options.acquisitionPlugins, dailySignalStore: this.options.dailySignalStore, reasoningExecutor: this.options.reasoningExecutor, signal: combined.signal })
        return { runId: input.workflowRunId, status: result.status, knowledgeBaseId: result.knowledgeBaseId, ...(result.report === undefined ? {} : { reportId: result.report.reportId, reportPath: `${result.report.reportId}.md` }), committedIds: result.committedIds, proposalCount: result.proposalIds.length, summary: result.status === 'completed' ? `Event research completed for ${input.symbol}` : `Event research ${result.status} for ${input.symbol}`, ...(result.errors.length ? { errorSummary: result.errors.join('; ').slice(0, 500) } : {}), telemetry: result.telemetry, providerOutcome: result.providerOutcomes, ...(result.blockedReason === undefined ? {} : { blockedReason: result.blockedReason }) }
      } finally { signal.removeEventListener('abort', abort); callerSignal?.removeEventListener('abort', abort) }
    }).then((outcome) => outcome as ApplicationEventResearchResult & { readonly providerOutcome?: unknown })
    completion.catch(() => undefined); return { runId: input.workflowRunId, completion }
  }

  startThesisRedTeam(input: ThesisRedTeamInput, callerSignal?: AbortSignal): { readonly runId: string; readonly completion: Promise<ApplicationThesisRedTeamResult> } {
    if (!input || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(input.workflowRunId) || !/^\d{6}$/.test(input.symbol) || !/^claim:[^\s]+$/.test(input.thesisRef)) throw new ApplicationServiceError('invalid_input', 'workflowRunId, A-share symbol, and thesisRef are invalid')
    if (input.lookbackDays !== undefined && (!Number.isInteger(input.lookbackDays) || input.lookbackDays < 30 || input.lookbackDays > 1095)) throw new ApplicationServiceError('invalid_input', 'lookbackDays must be between 30 and 1095')
    const company: ResearchCompanyIdentity = { symbol: input.symbol, ...(input.name === undefined ? {} : { name: input.name }), ...(input.exchange === undefined ? {} : { exchange: input.exchange }) }
    this.options.workflowService.register({ runId: input.workflowRunId, workflowType: 'thesis_red_team', objective: `Thesis Red Team ${input.symbol}` })
    const completion = this.options.workflowService.start(input.workflowRunId, async (signal) => {
      const combined = new AbortController(); const abort = () => combined.abort(); signal.addEventListener('abort', abort, { once: true }); callerSignal?.addEventListener('abort', abort, { once: true })
      try { const handle = await this.registry.mount(resolve(this.options.mountedKnowledgeBaseRoot)); const result = await runThesisRedTeam({ workflowRunId: input.workflowRunId, handle, company, thesisRef: input.thesisRef, lookbackDays: input.lookbackDays, reportRoot: resolve(this.options.reportRoot ?? join(this.options.cwd ?? process.cwd(), 'runtime-data', 'reports')), acquisitionPlugins: this.options.acquisitionPlugins, dailySignalStore: this.options.dailySignalStore, reasoningExecutor: this.options.reasoningExecutor, signal: combined.signal }); return { runId: input.workflowRunId, status: result.status, knowledgeBaseId: result.knowledgeBaseId, ...(result.report === undefined ? {} : { reportId: result.report.reportId, reportPath: `${result.report.reportId}.md` }), committedIds: result.committedIds, proposalCount: result.proposalIds.length, summary: result.status === 'completed' ? `Thesis Red Team completed for ${input.symbol}` : `Thesis Red Team ${result.status} for ${input.symbol}`, ...(result.errors.length ? { errorSummary: result.errors.join('; ').slice(0, 500) } : {}), telemetry: result.telemetry }
      } finally { signal.removeEventListener('abort', abort); callerSignal?.removeEventListener('abort', abort) }
    }).then((outcome) => outcome as ApplicationThesisRedTeamResult)
    completion.catch(() => undefined); return { runId: input.workflowRunId, completion }
  }

  async getResearchReport(reportId: string) {
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(reportId)) throw new ApplicationServiceError('invalid_input', 'reportId is invalid')
    const reportRoot = resolve(this.options.reportRoot ?? join(this.options.cwd ?? process.cwd(), 'runtime-data', 'reports'))
    try { return await readResearchReport(join(reportRoot, `${reportId}.md.json`)) } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') throw new ApplicationServiceError('not_found', 'Research report not found', { cause: error })
      throw error
    }
  }
}
