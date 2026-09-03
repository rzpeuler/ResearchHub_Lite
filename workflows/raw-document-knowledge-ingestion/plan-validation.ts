import type { ReasoningCapabilities } from '../../plugins/reasoning/contracts.ts'
import { blockIdsForRef } from '../../skills/knowledge-curation/model-input.ts'
import type { DocumentContentRef, PlanValidationCode, PlanValidationFeedback, ProposedExtractionUnit, StructuredDocument, UnderstandAndPlanOutput } from '../../skills/knowledge-curation/contracts.ts'
import type { AcceptedExtractionPlan, AcceptedExtractionUnit, IngestionWorkflowConfig } from './contracts.ts'

const canonicalId = /\b(?:theme-group|entity|relation|claim|source|module):[A-Za-z0-9._-]+/i
const defaultMaxUnits = 64
const defaultInstructionReserve = 2048
const defaultSchemaReserve = 4096
const defaultOutputMargin = 2048

export interface ExtractionPlanDiagnostic {
  readonly code: PlanValidationCode
  readonly message: string
  readonly refs?: readonly DocumentContentRef[]
  readonly unitIds?: readonly string[]
}

export class ExtractionPlanValidationError extends Error {
  readonly code: PlanValidationCode
  readonly repairable: boolean
  readonly diagnostics: readonly ExtractionPlanDiagnostic[]
  readonly feedback: PlanValidationFeedback

  constructor(code: PlanValidationCode, message: string, options: { repairable?: boolean; refs?: readonly DocumentContentRef[]; unitIds?: readonly string[]; feedback?: Omit<PlanValidationFeedback, 'code' | 'message'> } = {}) {
    super(`Deterministic plan validation failed: ${message}`)
    this.name = 'ExtractionPlanValidationError'
    this.code = code
    this.repairable = options.repairable ?? true
    this.diagnostics = [{ code, message, ...(options.refs === undefined ? {} : { refs: options.refs }), ...(options.unitIds === undefined ? {} : { unitIds: options.unitIds }) }]
    this.feedback = { code, message: message.slice(0, 1000), ...(options.feedback ?? {}) }
  }
}

function key(ref: DocumentContentRef): string { return `${ref.kind}:${ref.kind === 'block' ? ref.blockId : ref.sectionId}` }
function refsToBlocks(document: StructuredDocument, refs: readonly DocumentContentRef[]): string[] { return [...new Set(refs.flatMap((ref) => blockIdsForRef(document, ref)))].sort((left, right) => (document.blocks.find((block) => block.blockId === left)?.order ?? 0) - (document.blocks.find((block) => block.blockId === right)?.order ?? 0) || left.localeCompare(right)) }
function firstOrder(document: StructuredDocument, refs: readonly string[]): number { return Math.min(...refs.map((id) => document.blocks.find((block) => block.blockId === id)?.order ?? Number.MAX_SAFE_INTEGER)) }
function hasCanonicalId(value: unknown): boolean { if (typeof value === 'string') return canonicalId.test(value); if (Array.isArray(value)) return value.some(hasCanonicalId); if (value && typeof value === 'object') return Object.values(value).some(hasCanonicalId); return false }
function estimateTokens(document: StructuredDocument, reportMap: UnderstandAndPlanOutput['reportMap'], unit: ProposedExtractionUnit, blockIds: readonly string[], instructions?: string): number {
  const blockText = blockIds.map((id) => document.blocks.find((block) => block.blockId === id)?.text ?? '').join('\n')
  const chars = JSON.stringify(reportMap).length + JSON.stringify(unit).length + blockText.length + (instructions?.length ?? 0)
  return Math.ceil(chars / 4) + defaultSchemaReserve + defaultInstructionReserve + defaultOutputMargin
}

function compressBlockRefs(document: StructuredDocument, blockIds: readonly string[]): DocumentContentRef[] {
  const remaining = new Set(blockIds)
  const refs: DocumentContentRef[] = []
  for (const section of document.sections) {
    const sectionBlocks = section.blockRefs.filter((blockId) => document.blocks.some((block) => block.blockId === blockId))
    if (sectionBlocks.length > 0 && sectionBlocks.every((blockId) => remaining.has(blockId))) {
      refs.push({ kind: 'section', sectionId: section.sectionId })
      sectionBlocks.forEach((blockId) => remaining.delete(blockId))
    }
  }
  for (const block of document.blocks) if (remaining.has(block.blockId)) refs.push({ kind: 'block', blockId: block.blockId })
  return refs
}

function planError(code: PlanValidationCode, message: string, options: { refs?: readonly DocumentContentRef[]; unitIds?: readonly string[]; feedback?: Omit<PlanValidationFeedback, 'code' | 'message'> } = {}): ExtractionPlanValidationError {
  return new ExtractionPlanValidationError(code, message, options)
}

export function validateExtractionPlan(output: UnderstandAndPlanOutput, document: StructuredDocument, capabilities: ReasoningCapabilities, config: IngestionWorkflowConfig = {}, instructions?: string): AcceptedExtractionPlan {
  const units = output.extractionPlanProposal.units
  const maxUnits = config.maxExtractionUnits ?? defaultMaxUnits
  if (units.length === 0) throw planError('no_primary_content', 'extraction plan must contain at least one unit', { feedback: { unitCount: 0, maxUnits } })
  if (!Number.isSafeInteger(maxUnits) || maxUnits <= 0 || units.length > maxUnits) throw planError('unit_count_exceeded', `unit count ${units.length} exceeds maxExtractionUnits ${maxUnits}`, { feedback: { unitCount: units.length, maxUnits } })
  if (hasCanonicalId(output.extractionPlanProposal)) throw planError('canonical_id_in_plan', 'model plan contains canonical Knowledge IDs')
  const seenUnits = new Set<string>()
  const primaryOwners = new Map<string, string>()
  const excluded = new Set(refsToBlocks(document, output.extractionPlanProposal.excludedRefs))
  const normalized: AcceptedExtractionUnit[] = []
  for (const unit of units) {
    if (seenUnits.has(unit.proposedUnitId)) throw planError('duplicate_unit_id', `duplicate proposedUnitId ${unit.proposedUnitId}`, { unitIds: [unit.proposedUnitId] })
    seenUnits.add(unit.proposedUnitId)
    const primaryBlockIds = refsToBlocks(document, unit.primaryRefs)
    const contextBlockIds = refsToBlocks(document, unit.contextRefs).filter((id) => !primaryBlockIds.includes(id))
    if (primaryBlockIds.length === 0) throw planError('no_primary_content', `unit ${unit.proposedUnitId} has no primary content`, { unitIds: [unit.proposedUnitId] })
    for (const blockId of primaryBlockIds) {
      const previous = primaryOwners.get(blockId)
      if (previous) throw planError('primary_overlap', `primary block ${blockId} is assigned to both ${previous} and ${unit.proposedUnitId}`, { refs: [{ kind: 'block', blockId }], unitIds: [previous, unit.proposedUnitId], feedback: { overlapRefs: [{ kind: 'block', blockId }], conflictingUnitIds: [previous, unit.proposedUnitId] } })
      primaryOwners.set(blockId, unit.proposedUnitId)
    }
    const allowedTokens = Math.min(config.maxContextTokens ?? capabilities.maxContextTokens, capabilities.maxContextTokens)
    const estimate = estimateTokens(document, output.reportMap, unit, [...new Set([...primaryBlockIds, ...contextBlockIds])], instructions)
    if (estimate > allowedTokens) throw planError('context_capacity_exceeded', `unit ${unit.proposedUnitId} estimated ${estimate} tokens exceeds executor capacity ${allowedTokens}`, { unitIds: [unit.proposedUnitId], feedback: { affectedUnitId: unit.proposedUnitId, estimatedTokens: estimate, allowedTokens } })
    normalized.push({ ...structuredClone(unit), primaryRefs: [...unit.primaryRefs].sort((a, b) => key(a).localeCompare(key(b))), contextRefs: [...unit.contextRefs].sort((a, b) => key(a).localeCompare(key(b))), unitId: '', primaryBlockIds, contextBlockIds })
  }
  const conflicts = [...primaryOwners.keys()].filter((blockId) => excluded.has(blockId)).sort()
  if (conflicts.length > 0) {
    const refs = compressBlockRefs(document, conflicts)
    const unitIds = [...new Set(conflicts.map((blockId) => primaryOwners.get(blockId)!))].sort()
    throw planError('primary_excluded_conflict', `primary-covered blocks are also explicitly excluded: ${conflicts.join(', ')}`, { refs, unitIds, feedback: { overlapRefs: refs, uncoveredRefs: refs, conflictingUnitIds: unitIds } })
  }
  const allBlocks = new Set(document.blocks.map((block) => block.blockId))
  const covered = new Set([...primaryOwners.keys(), ...excluded])
  const uncovered = [...allBlocks].filter((id) => !covered.has(id)).sort()
  if (uncovered.length > 0) {
    const refs = compressBlockRefs(document, uncovered)
    throw planError('uncovered_content', `document blocks are neither primary-covered nor explicitly excluded: ${uncovered.join(', ')}`, { refs, feedback: { uncoveredRefs: refs } })
  }
  normalized.sort((left, right) => firstOrder(document, left.primaryBlockIds) - firstOrder(document, right.primaryBlockIds) || left.proposedUnitId.localeCompare(right.proposedUnitId))
  const estimatedContextTokens: Record<string, number> = {}
  const finalUnits = normalized.map((unit, index) => {
    const unitId = `unit-${String(index + 1).padStart(3, '0')}`
    estimatedContextTokens[unitId] = estimateTokens(document, output.reportMap, unit, [...new Set([...unit.primaryBlockIds, ...unit.contextBlockIds])], instructions)
    return { ...unit, unitId }
  })
  return { units: finalUnits, excludedBlockIds: [...excluded].sort(), estimatedContextTokens }
}
