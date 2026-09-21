import type { MarketEstimate, MarketEstimateReconciliation, MarketStructureInput, MarketStructureResult, ValueChainNode } from './contracts.ts'

const finite = (value: number | undefined): value is number => value !== undefined && Number.isFinite(value)
const text = (value: string | undefined): boolean => typeof value === 'string' && value.trim() !== ''
const unique = (values: readonly string[]): string[] => [...new Set(values.filter((value) => value.trim() !== ''))]
const date = (value: string | undefined): boolean => text(value) && !Number.isNaN(Date.parse(value!))

function estimateDiagnostics(item: MarketEstimate, asOf: string): string[] {
  const diagnostics: string[] = []
  if (!text(item.id) || !text(item.definition) || !text(item.geography) || !text(item.period) || !text(item.unit)) diagnostics.push(`estimate ${item.id} is missing its definition, scope, period, or unit`)
  if (item.method !== 'unavailable' && (!finite(item.value) || item.value! < 0)) diagnostics.push(`estimate ${item.id} requires a non-negative finite value`)
  if (item.sourceRefs.length === 0) diagnostics.push(`estimate ${item.id} requires source references`)
  if (date(item.period) && Date.parse(item.period) > Date.parse(asOf)) diagnostics.push(`estimate ${item.id} is after the as-of boundary`)
  return diagnostics
}

function reconcile(left: MarketEstimate, right: MarketEstimate): MarketEstimateReconciliation | undefined {
  const differences: string[] = []
  if (left.definition !== right.definition) differences.push('definition')
  if (left.geography !== right.geography) differences.push('geography')
  if (left.period !== right.period) differences.push('period')
  if (left.unit !== right.unit) differences.push('unit')
  if (left.method !== right.method) differences.push('method')
  const comparable = differences.length === 0
  if (comparable && left.value !== right.value) return { estimateIds: [left.id, right.id], comparable: true, differences: ['same basis but different values'], conclusion: 'same_basis_conflict' }
  if (!comparable) return { estimateIds: [left.id, right.id], comparable: false, differences, conclusion: 'preserve_separately' }
  return undefined
}

function validValueChain(node: ValueChainNode): string[] {
  return !text(node.id) || !text(node.name) || !text(node.role) || node.sourceRefs.length === 0 ? [`value-chain node ${node.id} requires name, role, and source references`] : []
}

function validate(input: MarketStructureInput): string[] {
  const diagnostics: string[] = []
  if (!text(input.marketRef) || !date(input.asOf)) diagnostics.push('marketRef and ISO-compatible asOf are required')
  const boundary = input.boundary
  if (!text(boundary.marketName) || boundary.included.length === 0 || boundary.excluded.length === 0 || !text(boundary.geography) || !text(boundary.period) || !text(boundary.unit) || boundary.sourceRefs.length === 0) diagnostics.push('market boundary must declare included/excluded scope, geography, period, unit, and sources')
  if (!text(input.segmentation.axis) || input.segmentation.values.length === 0 || input.segmentation.sourceRefs.length === 0) diagnostics.push('one sourced segmentation axis with values is required')
  const ids = new Set<string>()
  for (const item of input.estimates) { if (ids.has(item.id)) diagnostics.push(`duplicate estimate ${item.id}`); ids.add(item.id); diagnostics.push(...estimateDiagnostics(item, input.asOf)) }
  for (const node of input.valueChain) diagnostics.push(...validValueChain(node))
  return unique(diagnostics)
}

export function analyzeMarketStructure(input: MarketStructureInput): MarketStructureResult {
  const diagnostics = validate(input)
  const reconciliations: MarketEstimateReconciliation[] = []
  for (let i = 0; i < input.estimates.length; i += 1) for (let j = i + 1; j < input.estimates.length; j += 1) {
    const item = reconcile(input.estimates[i]!, input.estimates[j]!)
    if (item) reconciliations.push(item)
  }
  const validEstimates = input.estimates.filter((item) => estimateDiagnostics(item, input.asOf).length === 0)
  const validNodes = input.valueChain.filter((item) => validValueChain(item).length === 0)
  const hasCore = diagnostics.every((item) => !item.includes('market boundary') && !item.includes('segmentation'))
  const status: MarketStructureResult['status'] = !hasCore ? 'unavailable' : diagnostics.length === 0 && validEstimates.length === input.estimates.length && validNodes.length === input.valueChain.length ? 'complete' : validEstimates.length > 0 || validNodes.length > 0 ? 'partial' : 'unavailable'
  return { status, marketRef: input.marketRef, boundary: input.boundary, segmentation: input.segmentation, estimates: input.estimates, reconciliations, valueChain: input.valueChain, diagnostics, asOf: input.asOf }
}
