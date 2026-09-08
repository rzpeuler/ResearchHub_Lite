import type { NormalizedResearchSource, ResearchCompanyIdentity } from '../../plugins/research-acquisition/contracts.ts'

export interface SemanticKnowledgeProposal {
  readonly proposalId: string
  readonly kind: 'entity' | 'claim' | 'relation' | 'source'
  readonly claimType?: 'fact' | 'forecast' | 'viewpoint' | 'trend' | 'risk' | 'assumption' | 'thesis' | 'catalyst'
  readonly subjectKey: string
  readonly statement?: string
  readonly entityType?: 'company' | 'industry' | 'product' | 'technology'
  readonly entityName?: string
  readonly relationType?: string
  readonly targetKey?: string
  readonly sourceCandidateIds?: readonly string[]
  readonly confidence?: number
  readonly probability?: number
  readonly supportsProposalIds?: readonly string[]
  readonly dependsOnProposalIds?: readonly string[]
  readonly contradictsProposalIds?: readonly string[]
}

export interface CompanyResearchInput { readonly company: ResearchCompanyIdentity; readonly asOf: string; readonly sources: readonly NormalizedResearchSource[]; readonly financialData?: unknown; readonly marketData?: unknown }
export interface CompanyResearchResult { readonly company: ResearchCompanyIdentity; readonly generatedAt: string; readonly asOf: string; readonly sections: readonly { readonly id: string; readonly title: string; readonly markdown: string; readonly sourceCandidateIds: readonly string[]; readonly proposalIds: readonly string[] }[]; readonly proposals: readonly SemanticKnowledgeProposal[]; readonly sourceCandidateIds: readonly string[]; readonly valuation?: unknown }
