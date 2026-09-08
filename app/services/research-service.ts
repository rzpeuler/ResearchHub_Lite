import { join, resolve } from 'node:path'
import { KnowledgeBaseRegistry } from '../../knowledge/registry/registry.ts'
import { runCompanyDeepResearch } from '../../workflows/company-deep-research/workflow.ts'
import { runEarningsReview } from '../../workflows/earnings-review/workflow.ts'
import type { ResearchAcquisitionPlugin, ResearchCompanyIdentity, ResearchSignalStore } from '../../plugins/research-acquisition/contracts.ts'
import type { AkshareDataClient } from '../../plugins/research-acquisition/akshare.ts'
import { ApplicationServiceError, type ApplicationEarningsReviewResult, type ApplicationResearchResult, type EarningsReviewInput, type ResearchCompanyInput } from './contracts.ts'
import { WorkflowService } from './workflow-service.ts'
import { readResearchReport } from './research-report.ts'
import type { ReasoningExecutor } from '../../plugins/reasoning/contracts.ts'

export interface ResearchServiceOptions {
  readonly mountedKnowledgeBaseRoot: string
  readonly reportRoot?: string
  readonly acquisitionPlugins: readonly ResearchAcquisitionPlugin[]
  readonly akshare?: AkshareDataClient
  readonly signalStore?: ResearchSignalStore
  readonly workflowService: WorkflowService
  readonly cwd?: string
  readonly reasoningExecutor?: ReasoningExecutor
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

  async getResearchReport(reportId: string) {
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(reportId)) throw new ApplicationServiceError('invalid_input', 'reportId is invalid')
    const reportRoot = resolve(this.options.reportRoot ?? join(this.options.cwd ?? process.cwd(), 'runtime-data', 'reports'))
    try { return await readResearchReport(join(reportRoot, `${reportId}.md.json`)) } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') throw new ApplicationServiceError('not_found', 'Research report not found', { cause: error })
      throw error
    }
  }
}
