import type { ReasoningCapabilities } from '../../plugins/reasoning/contracts.ts'
import { blockIdsForRef } from '../../skills/knowledge-curation/model-input.ts'
import type { DocumentContentRef, ProposedExtractionUnit, StructuredDocument, UnderstandAndPlanOutput } from '../../skills/knowledge-curation/contracts.ts'
import type { AcceptedExtractionPlan, AcceptedExtractionUnit, IngestionWorkflowConfig } from './contracts.ts'

const canonicalId = /\b(?:theme-group|entity|relation|claim|source|module):[A-Za-z0-9._-]+/i
const defaultMaxUnits = 64
const defaultInstructionReserve = 2048
const defaultSchemaReserve = 4096
const defaultOutputMargin = 2048

function key(ref: DocumentContentRef): string { return `${ref.kind}:${ref.kind === 'block' ? ref.blockId : ref.sectionId}` }
function refsToBlocks(document: StructuredDocument, refs: readonly DocumentContentRef[]): string[] { return [...new Set(refs.flatMap((ref) => blockIdsForRef(document, ref)))].sort((left, right) => (document.blocks.find((block) => block.blockId === left)?.order ?? 0) - (document.blocks.find((block) => block.blockId === right)?.order ?? 0) || left.localeCompare(right)) }
function firstOrder(document: StructuredDocument, refs: readonly string[]): number { return Math.min(...refs.map((id) => document.blocks.find((block) => block.blockId === id)?.order ?? Number.MAX_SAFE_INTEGER)) }
function hasCanonicalId(value: unknown): boolean { if (typeof value === 'string') return canonicalId.test(value); if (Array.isArray(value)) return value.some(hasCanonicalId); if (value && typeof value === 'object') return Object.values(value).some(hasCanonicalId); return false }
function estimateTokens(document: StructuredDocument, reportMap: UnderstandAndPlanOutput['reportMap'], unit: ProposedExtractionUnit, blockIds: readonly string[], instructions?: string): number {
  const blockText = blockIds.map((id) => document.blocks.find((block) => block.blockId === id)?.text ?? '').join('\n')
  const chars = JSON.stringify(reportMap).length + JSON.stringify(unit).length + blockText.length + (instructions?.length ?? 0)
  return Math.ceil(chars / 4) + defaultSchemaReserve + defaultInstructionReserve + defaultOutputMargin
}

export function validateExtractionPlan(output: UnderstandAndPlanOutput, document: StructuredDocument, capabilities: ReasoningCapabilities, config: IngestionWorkflowConfig = {}, instructions?: string): AcceptedExtractionPlan {
  const units = output.extractionPlanProposal.units
  if (units.length === 0) throw new Error('Deterministic plan validation failed: extraction plan must contain at least one unit')
  const maxUnits = config.maxExtractionUnits ?? defaultMaxUnits
  if (!Number.isSafeInteger(maxUnits) || maxUnits <= 0 || units.length > maxUnits) throw new Error(`Deterministic plan validation failed: unit count ${units.length} exceeds maxExtractionUnits ${maxUnits}`)
  if (hasCanonicalId(output.extractionPlanProposal)) throw new Error('Deterministic plan validation failed: model plan contains canonical Knowledge IDs')
  const seenUnits = new Set<string>()
  const primaryOwners = new Map<string, string>()
  const excluded = new Set(refsToBlocks(document, output.extractionPlanProposal.excludedRefs ?? []))
  const normalized: AcceptedExtractionUnit[] = []
  for (const unit of units) {
    if (seenUnits.has(unit.proposedUnitId)) throw new Error(`Deterministic plan validation failed: duplicate proposedUnitId ${unit.proposedUnitId}`)
    seenUnits.add(unit.proposedUnitId)
    const primaryBlockIds = refsToBlocks(document, unit.primaryRefs)
    const contextBlockIds = refsToBlocks(document, unit.contextRefs).filter((id) => !primaryBlockIds.includes(id))
    if (primaryBlockIds.length === 0) throw new Error(`Deterministic plan validation failed: unit ${unit.proposedUnitId} has no primary content`)
    for (const blockId of primaryBlockIds) {
      const previous = primaryOwners.get(blockId)
      if (previous) throw new Error(`Deterministic plan validation failed: primary block ${blockId} is assigned to both ${previous} and ${unit.proposedUnitId}`)
      primaryOwners.set(blockId, unit.proposedUnitId)
    }
    const estimate = estimateTokens(document, output.reportMap, unit, [...new Set([...primaryBlockIds, ...contextBlockIds])], instructions)
    if (estimate > Math.min(config.maxContextTokens ?? capabilities.maxContextTokens, capabilities.maxContextTokens)) throw new Error(`Context capacity guard blocked unit ${unit.proposedUnitId}: estimated ${estimate} tokens exceeds executor capacity`)
    normalized.push({ ...structuredClone(unit), primaryRefs: [...unit.primaryRefs].sort((a, b) => key(a).localeCompare(key(b))), contextRefs: [...unit.contextRefs].sort((a, b) => key(a).localeCompare(key(b))), unitId: '', primaryBlockIds, contextBlockIds })
  }
  const allBlocks = new Set(document.blocks.map((block) => block.blockId))
  const covered = new Set([...primaryOwners.keys(), ...excluded])
  const uncovered = [...allBlocks].filter((id) => !covered.has(id)).sort()
  if (uncovered.length > 0) throw new Error(`Deterministic plan validation failed: document blocks are neither primary-covered nor explicitly excluded: ${uncovered.join(', ')}`)
  normalized.sort((left, right) => firstOrder(document, left.primaryBlockIds) - firstOrder(document, right.primaryBlockIds) || left.proposedUnitId.localeCompare(right.proposedUnitId))
  const estimatedContextTokens: Record<string, number> = {}
  const finalUnits = normalized.map((unit, index) => {
    const unitId = `unit-${String(index + 1).padStart(3, '0')}`
    estimatedContextTokens[unitId] = estimateTokens(document, output.reportMap, unit, [...new Set([...unit.primaryBlockIds, ...unit.contextBlockIds])], instructions)
    return { ...unit, unitId }
  })
  return { units: finalUnits, excludedBlockIds: [...excluded].sort(), estimatedContextTokens }
}
