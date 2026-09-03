import type { ReasoningCapabilities } from '../../plugins/reasoning/contracts.ts'
import type { ExtractKnowledgeInput, ReconcileKnowledgeInput, UnderstandAndPlanInput, DocumentContentRef } from './contracts.ts'
import type { CurationSchemaContext } from './schema-context-types.ts'

export interface PreparedUnderstandAndPlanInput extends UnderstandAndPlanInput {
  readonly capabilities: ReasoningCapabilities
  readonly schemaContext: CurationSchemaContext
}
export interface PreparedExtractKnowledgeInput extends ExtractKnowledgeInput {
  readonly schemaContext: CurationSchemaContext
}
export interface PreparedReconcileKnowledgeInput extends ReconcileKnowledgeInput {
  readonly schemaContext: CurationSchemaContext
}

export function projectUnderstandAndPlanModelInput(input: PreparedUnderstandAndPlanInput): unknown {
  return {
    document: structuredClone(input.document),
    capabilities: structuredClone(input.capabilities),
    schemaContext: structuredClone(input.schemaContext),
    ...(input.instructions === undefined ? {} : { instructions: input.instructions }),
    ...(input.planRepair === undefined ? {} : { planRepair: structuredClone(input.planRepair) }),
  }
}

export function projectExtractKnowledgeModelInput(input: PreparedExtractKnowledgeInput): unknown {
  const primary = new Set(input.unit.primaryRefs.flatMap((ref) => blockIdsForRef(input.document, ref)))
  const context = new Set(input.unit.contextRefs.flatMap((ref) => blockIdsForRef(input.document, ref)))
  const allowed = new Set([...primary, ...context])
  return {
    reportMap: structuredClone(input.reportMap),
    unit: structuredClone(input.unit),
    blocks: input.document.blocks.filter((block) => allowed.has(block.blockId)).sort((a, b) => a.order - b.order).map((block) => ({
      ...structuredClone(block),
      role: primary.has(block.blockId) ? 'primary' : 'context',
    })),
    schemaContext: structuredClone(input.schemaContext),
    ...(input.instructions === undefined ? {} : { instructions: input.instructions }),
    ...(input.validationFeedback === undefined ? {} : { validationFeedback: structuredClone(input.validationFeedback) }),
  }
}

export function projectReconcileKnowledgeModelInput(input: PreparedReconcileKnowledgeInput): unknown {
  return {
    candidateGroups: structuredClone(input.candidateGroups),
    existingKnowledge: structuredClone(input.existingKnowledge),
    reportMap: structuredClone(input.reportMap),
    sourceAssessment: structuredClone(input.sourceAssessment),
    schemaContext: structuredClone(input.schemaContext),
    ...(input.instructions === undefined ? {} : { instructions: input.instructions }),
  }
}

export function blockIdsForRef(document: UnderstandAndPlanInput['document'], ref: DocumentContentRef): string[] {
  if (ref.kind === 'block') return document.blocks.some((block) => block.blockId === ref.blockId) ? [ref.blockId] : []
  return document.sections.find((section) => section.sectionId === ref.sectionId)?.blockRefs.filter((id) => document.blocks.some((block) => block.blockId === id)) ?? []
}
