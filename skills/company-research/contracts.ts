import type { NormalizedResearchSource, ResearchCompanyIdentity } from '../../plugins/research-acquisition/contracts.ts'
import type { SemanticProductionProposal } from '../../knowledge/production/contracts.ts'

export type SemanticKnowledgeProposal = SemanticProductionProposal

export interface CompanyResearchInput { readonly company: ResearchCompanyIdentity; readonly asOf: string; readonly sources: readonly NormalizedResearchSource[]; readonly financialData?: unknown; readonly marketData?: unknown; readonly existingKnowledgeProjection?: unknown }
export interface CompanyResearchResult { readonly company: ResearchCompanyIdentity; readonly generatedAt: string; readonly asOf: string; readonly sections: readonly { readonly id: string; readonly title: string; readonly markdown: string; readonly sourceCandidateIds: readonly string[]; readonly proposalIds: readonly string[] }[]; readonly proposals: readonly SemanticKnowledgeProposal[]; readonly sourceCandidateIds: readonly string[]; readonly valuation?: unknown }
