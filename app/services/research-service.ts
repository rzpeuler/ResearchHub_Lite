import { join, resolve } from 'node:path'
import { KnowledgeBaseRegistry } from '../../knowledge/registry/registry.ts'
import { runCompanyDeepResearch } from '../../workflows/company-deep-research/workflow.ts'
import type { ResearchAcquisitionPlugin, ResearchCompanyIdentity, ResearchSignalStore } from '../../plugins/research-acquisition/contracts.ts'
import type { AkshareDataClient } from '../../plugins/research-acquisition/akshare.ts'
import { ApplicationServiceError, type ApplicationResearchResult, type ResearchCompanyInput } from './contracts.ts'
import { WorkflowService } from './workflow-service.ts'

export interface ResearchServiceOptions {
  readonly mountedKnowledgeBaseRoot: string
  readonly reportRoot?: string
  readonly acquisitionPlugins: readonly ResearchAcquisitionPlugin[]
  readonly akshare?: AkshareDataClient
  readonly signalStore?: ResearchSignalStore
  readonly workflowService: WorkflowService
  readonly cwd?: string
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
}
