import type { EntityCandidate, StructuredDocument } from '../../skills/knowledge-curation/contracts.ts'
import type { AcceptedExtractionPlan, PotentialInvestmentThemeAssessment, PotentialInvestmentThemeSupport } from './contracts.ts'
import type { ConsolidatedCandidateSupport } from './consolidation.ts'

/** Conservative v0.1 runtime policy; this is not part of Schema 0.3 or ontology. */
export const MATERIAL_PRIMARY_BLOCK_THRESHOLD = 8

function unique(values: readonly string[]): string[] { return [...new Set(values)].sort() }

export function assessPotentialNewInvestmentTheme(candidate: EntityCandidate, consolidated: ConsolidatedCandidateSupport | undefined, plan: AcceptedExtractionPlan, document: StructuredDocument): PotentialInvestmentThemeAssessment {
  const evidenceBlockRefs = unique(consolidated?.evidenceBlockRefs ?? candidate.evidenceBlockRefs)
  const supportingUnitIds = unique(consolidated?.supportingUnitIds ?? [candidate.candidateId])
  const primaryBlockIds = new Set(plan.units.flatMap((unit) => unit.primaryBlockIds))
  const blockById = new Map(document.blocks.map((block) => [block.blockId, block]))
  const supportingPrimaryBlockCount = evidenceBlockRefs.filter((blockId) => primaryBlockIds.has(blockId)).length
  const supportingSectionCount = new Set(evidenceBlockRefs.map((blockId) => blockById.get(blockId)?.sectionRef).filter((sectionRef): sectionRef is string => typeof sectionRef === 'string')).size
  const support: PotentialInvestmentThemeSupport = { supportingCandidateCount: consolidated?.supportingCandidateCount ?? 1, supportingUnitCount: supportingUnitIds.length, supportingPrimaryBlockCount, supportingSectionCount, evidenceBlockRefs }
  const recommendation = supportingUnitIds.length >= 2 || (supportingUnitIds.length === 1 && supportingPrimaryBlockCount >= MATERIAL_PRIMARY_BLOCK_THRESHOLD) ? 'recommend' : 'do_not_recommend'
  const recommendationReason = recommendation === 'recommend'
    ? 'Potential new InvestmentTheme has material, non-incidental consolidated document support.'
    : 'Potential new InvestmentTheme detected, but consolidated document support is incidental and insufficient for recommending Theme creation.'
  return { candidateId: candidate.candidateId, name: candidate.name, aliases: unique(candidate.aliases ?? []), ...(candidate.description === undefined ? {} : { description: candidate.description }), noveltyState: 'potential_new', support, recommendation, recommendationReason, evidenceBlockRefs }
}
