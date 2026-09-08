import type { KnowledgeBaseHandle } from '../../knowledge/storage/handle.ts'
import type { CompanyResearchResult } from '../../skills/company-research/contracts.ts'
import type { ResearchAcquisitionPlugin, ResearchCompanyIdentity, ResearchSignalStore } from '../../plugins/research-acquisition/contracts.ts'
import type { AkshareDataClient } from '../../plugins/research-acquisition/akshare.ts'

export interface CompanyDeepResearchInput {
  readonly workflowRunId: string
  readonly handle: KnowledgeBaseHandle
  readonly company: ResearchCompanyIdentity
  readonly acquisitionPlugins: readonly ResearchAcquisitionPlugin[]
  readonly akshare?: AkshareDataClient
  readonly asOf?: string
  readonly reportRoot: string
  readonly signalStore?: ResearchSignalStore
  readonly maxSources?: number
  readonly signal?: AbortSignal
  readonly now?: () => string
}
export interface CompanyDeepResearchResult {
  readonly workflowRunId: string
  readonly status: 'completed' | 'blocked' | 'cancelled' | 'failed'
  readonly knowledgeBaseId: string
  readonly knowledgeBaseRevision?: number
  readonly report?: { readonly reportId: string; readonly outputPath: string }
  readonly proposalIds: readonly string[]
  readonly committedIds: readonly string[]
  readonly sourceIds: readonly string[]
  readonly claimIds: readonly string[]
  readonly errors: readonly string[]
  readonly research?: CompanyResearchResult
}
