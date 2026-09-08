import { relativeValuation, scenarioValuation } from './valuation.ts'
import type { CompanyResearchInput, CompanyResearchResult, SemanticKnowledgeProposal } from './contracts.ts'

const REQUIRED_SECTIONS = ['Company Overview', 'Business Model', 'Business Segments', 'Revenue / Profit Drivers', 'Products', 'Technologies', 'Industry Exposure', 'Supply Chain', 'Competition', 'Financial Quality', 'Growth Drivers', 'Management / Capital Allocation', 'Catalysts', 'Risks', 'Valuation', 'Bull / Base / Bear', 'Variant Perception', 'Investment Thesis', 'Monitoring Checklist'] as const

export class CompanyResearchSkill {
  constructor(private readonly now: () => string = () => new Date().toISOString()) {}
  run(input: CompanyResearchInput): CompanyResearchResult {
    const sourceIds = input.sources.map((source) => source.candidate.candidateId)
    const proposals: SemanticKnowledgeProposal[] = [{ proposalId: 'company', kind: 'entity', subjectKey: 'company', entityType: 'company', entityName: input.company.name ?? input.company.symbol }, ...input.sources.slice(0, 12).map((source, index) => ({ proposalId: `fact-${index + 1}`, kind: 'claim' as const, claimType: 'fact' as const, subjectKey: 'company', statement: `${source.title}: ${source.content.slice(0, 280)}`, sourceCandidateIds: [source.candidate.candidateId], confidence: source.candidate.tier === 1 ? 0.9 : 0.7 }))]
    const sections = REQUIRED_SECTIONS.map((title, index) => { const relevant = input.sources.filter((source) => index === 0 || source.content.toLowerCase().includes(title.split(' ')[0]!.toLowerCase())).slice(0, 3); const text = relevant.length ? relevant.map((source) => `- ${source.content.slice(0, 500)}`).join('\n') : 'No bounded source evidence was available for this section; treat this as an explicit research gap.'; return { id: title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''), title, markdown: text, sourceCandidateIds: relevant.map((source) => source.candidate.candidateId), proposalIds: proposals.filter((proposal) => proposal.sourceCandidateIds?.some((id) => relevant.some((source) => source.candidate.candidateId === id))).map((proposal) => proposal.proposalId) } })
    let valuation: unknown
    const metric = extractMetric(input.financialData)
    if (metric !== undefined) valuation = relativeValuation({ metric, peerMultiples: [10, 12, 15] })
    else valuation = scenarioValuation([{ name: 'base', earnings: 1, multiple: 12, probability: 1 }])
    return { company: input.company, generatedAt: this.now(), asOf: input.asOf, sections, proposals, sourceCandidateIds: sourceIds, valuation }
  }
}
function extractMetric(value: unknown): number | undefined { if (!Array.isArray(value) || value.length === 0) return undefined; const first = value[0]; if (typeof first !== 'object' || first === null) return undefined; const candidate = (first as Record<string, unknown>).metric ?? (first as Record<string, unknown>).value; return typeof candidate === 'number' && Number.isFinite(candidate) && candidate >= 0 ? candidate : undefined }
