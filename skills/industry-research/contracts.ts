import type { NormalizedResearchSource } from '../../plugins/research-acquisition/contracts.ts'
import type { SemanticProductionProposal } from '../../knowledge/production/contracts.ts'

export const INDUSTRY_MODULES = ['industry_definition', 'market_size_growth', 'supply_demand_analysis', 'industry_chain_analysis', 'competitive_landscape', 'technology_evolution', 'company_mapping', 'risk_analysis'] as const
export type IndustryResearchModule = typeof INDUSTRY_MODULES[number]
export type IndustryTargetKind = 'industry' | 'theme' | 'product' | 'technology' | 'uncertain'
export interface IndustryTargetInput { readonly name: string; readonly canonicalRef?: string; readonly aliases?: readonly string[]; readonly geography?: string; readonly asOf?: string }
export interface ResearchGap { readonly gapId: string; readonly module: IndustryResearchModule; readonly question: string; readonly reason: string; readonly actionable: boolean; readonly searchTerms?: readonly string[] }
export interface ResearchDesign { readonly definitionHypothesis: string; readonly targetKind: IndustryTargetKind; readonly scope: { readonly included: readonly string[]; readonly excluded: readonly string[] }; readonly moduleQuestions: Readonly<Record<IndustryResearchModule, string>>; readonly keyMetrics: readonly string[]; readonly evidenceRequirements: readonly string[]; readonly searchTerms: readonly string[]; readonly knownGaps: readonly ResearchGap[]; readonly verificationCandidates: readonly { readonly name: string; readonly kind: 'product' | 'technology' | 'industry' | 'company'; readonly reason: string }[] }
export interface ModuleEvidence { readonly evidenceId: string; readonly source: NormalizedResearchSource; readonly excerpt?: string }
export interface LocalReportMaterial { readonly markdown: string; readonly evidenceIds: readonly string[]; readonly proposalIds: readonly string[]; readonly relationProposalIds?: readonly string[]; readonly reportOnly?: boolean }
export interface IndustryModuleResult { readonly module: IndustryResearchModule; readonly status: 'supported' | 'partial' | 'unavailable'; readonly analysis: string; readonly evidenceIds: readonly string[]; readonly proposals: readonly SemanticProductionProposal[]; readonly gaps: readonly ResearchGap[]; readonly reportMaterial: LocalReportMaterial }
export interface CrossModuleSynthesis { readonly executiveView: string; readonly analysis: string; readonly evidenceIds: readonly string[]; readonly proposals: readonly SemanticProductionProposal[]; readonly gaps: readonly ResearchGap[]; readonly alternativeViews: readonly string[]; readonly reportMaterial: LocalReportMaterial }
export interface IndustryResearchSkillInput { readonly target: IndustryTargetInput; readonly designContext?: unknown; readonly evidence: readonly ModuleEvidence[]; readonly existingKnowledge: readonly unknown[]; readonly localReferences: readonly string[] }

export const ALL_INDUSTRY_OPERATION_NAMES = ['industry_research_design', 'industry_module_analysis', 'industry_cross_module_synthesis'] as const
export type IndustryOperationName = typeof ALL_INDUSTRY_OPERATION_NAMES[number]
