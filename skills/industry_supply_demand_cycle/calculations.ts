import type { CapacityObservation, CycleEvidence, DemandIndicator, IndustrySupplyDemandCycleInput, IndustrySupplyDemandCycleResult, IndicatorDirection, InventoryObservation, PricingObservation, UtilizationObservation } from './contracts.ts'

const finite = (value: number | undefined): value is number => value !== undefined && Number.isFinite(value)
const text = (value: string | undefined): boolean => typeof value === 'string' && value.trim() !== ''
const unique = (values: readonly string[]): string[] => [...new Set(values.filter((value) => value.trim() !== ''))]
const date = (value: string | undefined): boolean => text(value) && !Number.isNaN(Date.parse(value!))
const periodValid = (value: string | undefined, asOf: string): boolean => text(value) && (!date(value) || Date.parse(value!) <= Date.parse(asOf))

function evidence(id: string, category: CycleEvidence['category'], direction: IndicatorDirection, refs: readonly string[], role: CycleEvidence['role']): CycleEvidence { return { id, category, direction, sourceRefs: unique(refs), role } }
function capacityDirection(item: CapacityObservation): IndicatorDirection { return item.change }
function validDemand(item: DemandIndicator, asOf: string): string[] {
  const hasPrior = item.priorDirection !== undefined || item.priorPeriod !== undefined || item.priorSourceRefs !== undefined
  return !text(item.id) || !periodValid(item.period, asOf) || item.sourceRefs.length === 0 || (hasPrior && (item.priorDirection === undefined || !periodValid(item.priorPeriod, asOf) || (item.priorSourceRefs?.length ?? 0) === 0)) ? [`demand ${item.id} is missing valid period or source evidence`] : []
}
function validCapacity(item: CapacityObservation, asOf: string): string[] {
  const hasPrior = item.priorValue !== undefined || item.priorPeriod !== undefined || item.priorSourceRefs !== undefined
  return !text(item.id) || !text(item.unit) || !periodValid(item.period, asOf) || item.sourceRefs.length === 0 || (item.value !== undefined && !finite(item.value)) || (hasPrior && (!finite(item.priorValue) || !periodValid(item.priorPeriod, asOf) || (item.priorSourceRefs?.length ?? 0) === 0)) ? [`capacity ${item.id} has invalid value, period, unit, or source evidence`] : []
}
function validInventory(item: InventoryObservation, asOf: string): string[] {
  const hasPrior = item.priorDirection !== undefined || item.priorPeriod !== undefined || item.priorSourceRefs !== undefined
  return !text(item.id) || !text(item.unit) || !periodValid(item.period, asOf) || item.sourceRefs.length === 0 || ((item.direction === 'up' || item.direction === 'down') && !item.hasHistory) || (hasPrior && (item.priorDirection === undefined || !periodValid(item.priorPeriod, asOf) || (item.priorSourceRefs?.length ?? 0) === 0)) ? [`inventory ${item.id} lacks valid history, period, unit, or source evidence`] : []
}
function validPricing(item: PricingObservation, asOf: string): string[] { return !text(item.id) || !text(item.unit) || !periodValid(item.period, asOf) || item.sourceRefs.length === 0 || ((finite(item.currentValue) || finite(item.priorValue)) && (!finite(item.currentValue) || !finite(item.priorValue) || item.priorPeriod === undefined)) ? [`pricing ${item.id} lacks aligned values, prior period, or source evidence`] : [] }

function utilization(input: UtilizationObservation | undefined, asOf: string, diagnostics: string[]): IndustrySupplyDemandCycleResult['utilization'] {
  if (input === undefined) return undefined
  if (!periodValid(input.period, asOf) || input.sourceRefs.length === 0 || !text(input.unit)) { diagnostics.push('utilization evidence is missing a valid period, unit, or source'); return undefined }
  const priorValid = input.priorReportedValue === undefined && input.priorPeriod === undefined && input.priorSourceRefs === undefined || finite(input.priorReportedValue) && periodValid(input.priorPeriod, asOf) && (input.priorSourceRefs?.length ?? 0) > 0
  if (!priorValid) { diagnostics.push('prior utilization requires a comparable period and source evidence'); return undefined }
  const direction = input.direction ?? (finite(input.reportedValue) && finite(input.priorReportedValue) ? input.reportedValue > input.priorReportedValue ? 'up' : input.reportedValue < input.priorReportedValue ? 'down' : 'flat' : undefined)
  if (finite(input.reportedValue)) return input.reportedValue >= 0 && input.reportedValue <= 1 ? { value: input.reportedValue, unit: input.unit, method: 'reported', ...(direction === undefined ? {} : { direction }), ...(input.priorReportedValue === undefined ? {} : { priorValue: input.priorReportedValue }), ...(input.priorPeriod === undefined ? {} : { priorPeriod: input.priorPeriod }), sourceRefs: unique(input.sourceRefs), ...(input.priorSourceRefs === undefined ? {} : { priorSourceRefs: unique(input.priorSourceRefs) }) } : (diagnostics.push('reported utilization must be between zero and one'), undefined)
  if (finite(input.outputValue) && finite(input.capacityValue) && input.capacityValue > 0) { const value = input.outputValue / input.capacityValue; return Number.isFinite(value) && value >= 0 && value <= 1 ? { value, unit: input.unit, method: 'output_divided_by_capacity', sourceRefs: unique(input.sourceRefs) } : (diagnostics.push('calculated utilization is outside zero to one'), undefined) }
  diagnostics.push('utilization requires a reported value or explicit output and capacity')
  return undefined
}

function priceDeltas(items: readonly PricingObservation[], diagnostics: string[]): IndustrySupplyDemandCycleResult['priceDeltas'] {
  return items.map((item) => {
    if (!finite(item.currentValue) || !finite(item.priorValue)) return { id: item.id, unit: item.unit, sourceRefs: unique(item.sourceRefs) }
    const delta = item.currentValue - item.priorValue
    if (!Number.isFinite(delta)) diagnostics.push(`pricing ${item.id} delta is non-finite`)
    return { id: item.id, ...(Number.isFinite(delta) ? { delta } : {}), unit: item.unit, sourceRefs: unique(item.sourceRefs) }
  })
}

export function analyzeIndustrySupplyDemandCycle(input: IndustrySupplyDemandCycleInput): IndustrySupplyDemandCycleResult {
  const diagnostics: string[] = []
  const missingIndicators: string[] = []
  if (!text(input.industryRef) || !date(input.asOf)) diagnostics.push('industryRef and ISO-compatible asOf are required')
  for (const item of input.demand) diagnostics.push(...validDemand(item, input.asOf))
  for (const item of input.capacity) diagnostics.push(...validCapacity(item, input.asOf))
  for (const item of input.inventory) diagnostics.push(...validInventory(item, input.asOf))
  for (const item of input.pricing) diagnostics.push(...validPricing(item, input.asOf))
  const validDemandItems = input.demand.filter((item) => validDemand(item, input.asOf).length === 0)
  const validCapacityItems = input.capacity.filter((item) => validCapacity(item, input.asOf).length === 0)
  const validInventoryItems = input.inventory.filter((item) => validInventory(item, input.asOf).length === 0)
  const validPricingItems = input.pricing.filter((item) => validPricing(item, input.asOf).length === 0)
  if (unique(validPricingItems.map((item) => item.unit)).length > 1) diagnostics.push('pricing unit mismatch')
  const computedUtilization = utilization(input.utilization, input.asOf, diagnostics)
  const effective = validCapacityItems.filter((item) => item.state === 'effective' && finite(item.value))
  const effectiveUnits = unique(effective.map((item) => item.unit))
  const effectiveCapacity = effective.length > 0 && effectiveUnits.length === 1 ? { value: effective.reduce((sum, item) => sum + item.value!, 0), unit: effectiveUnits[0]!, sourceRefs: unique(effective.flatMap((item) => item.sourceRefs)) } : undefined
  if (effective.length > 0 && effectiveUnits.length > 1) diagnostics.push('effective capacity unit mismatch')
  const demandUp = validDemandItems.some((item) => item.direction === 'up')
  const demandDown = validDemandItems.some((item) => item.direction === 'down')
  const demandFlat = validDemandItems.some((item) => item.direction === 'flat')
  const capacityUp = validCapacityItems.some((item) => ['announced', 'under_construction', 'installed', 'commissioned', 'effective'].includes(item.state) && capacityDirection(item) === 'up')
  const effectiveCapacityUp = validCapacityItems.some((item) => item.state === 'effective' && capacityDirection(item) === 'up')
  const inventoryUp = validInventoryItems.some((item) => item.direction === 'up')
  const inventoryDown = validInventoryItems.some((item) => item.direction === 'down')
  const priceUp = validPricingItems.some((item) => item.direction === 'up')
  const priceDown = validPricingItems.some((item) => item.direction === 'down')
  const priceFlat = validPricingItems.some((item) => item.direction === 'flat')
  if (input.utilization === undefined || computedUtilization === undefined) missingIndicators.push('utilization')
  if (validInventoryItems.length === 0) missingIndicators.push('inventory_history')
  if (validPricingItems.length === 0) missingIndicators.push('pricing')
  if (validCapacityItems.every((item) => item.state !== 'effective')) missingIndicators.push('effective_capacity')
  const leadingIndicators: CycleEvidence[] = []
  const confirmingIndicators: CycleEvidence[] = []
  const contradictingIndicators: CycleEvidence[] = []
  for (const item of validDemandItems) leadingIndicators.push(evidence(item.id, 'demand', item.direction, item.sourceRefs, 'leading'))
  for (const item of validCapacityItems.filter((item) => item.state === 'announced' || item.state === 'under_construction')) leadingIndicators.push(evidence(item.id, 'capacity', item.change, item.sourceRefs, 'leading'))
  for (const item of validInventoryItems) confirmingIndicators.push(evidence(item.id, 'inventory', item.direction, item.sourceRefs, 'confirming'))
  for (const item of validPricingItems) confirmingIndicators.push(evidence(item.id, 'pricing', item.direction, item.sourceRefs, 'confirming'))
  if (computedUtilization !== undefined) confirmingIndicators.push(evidence('utilization', 'utilization', computedUtilization.direction ?? 'unknown', computedUtilization.sourceRefs, 'confirming'))
  const contradiction = inventoryDown && capacityUp && priceDown
  if (contradiction) {
    for (const item of validCapacityItems.filter((candidate) => candidate.change === 'up')) contradictingIndicators.push(evidence(item.id, 'capacity', item.change, item.sourceRefs, 'contradicting'))
    for (const item of validPricingItems.filter((candidate) => candidate.direction === 'down')) contradictingIndicators.push(evidence(item.id, 'pricing', item.direction, item.sourceRefs, 'contradicting'))
  }
  let state: IndustrySupplyDemandCycleResult['state'] = 'unknown'
  if (demandUp && effectiveCapacity !== undefined && !effectiveCapacityUp && priceUp && inventoryDown) state = 'tightening'
  else if ((demandDown || demandFlat) && effectiveCapacityUp && inventoryUp && priceDown) state = 'oversupply'
  else if (inventoryDown && (demandDown || demandFlat) && (priceDown || priceFlat)) state = 'destocking'
  else if (demandUp && effectiveCapacity !== undefined && !effectiveCapacityUp && (priceUp || priceFlat) && validPricingItems.length > 0) state = 'expansion'
  else if (inventoryUp && demandUp) state = 'restocking'
  else if (priceUp && inventoryDown && effectiveCapacityUp) state = 'bottoming'
  else if (validDemandItems.length > 0 || validCapacityItems.length > 0 || validInventoryItems.length > 0 || validPricingItems.length > 0) state = 'normalization'
  if (contradiction) state = 'unknown'
  const demandTransition = validDemandItems.some((item) => item.priorDirection !== undefined && item.priorDirection !== item.direction)
  const capacityTransition = validCapacityItems.some((item) => finite(item.value) && finite(item.priorValue) && item.value !== item.priorValue)
  const inventoryTransition = validInventoryItems.some((item) => item.priorDirection !== undefined && item.priorDirection !== item.direction)
  const pricingTransition = validPricingItems.some((item) => finite(item.currentValue) && finite(item.priorValue) && item.currentValue !== item.priorValue)
  const utilizationTransition = computedUtilization?.direction !== undefined && computedUtilization.priorValue !== undefined
  const transitionCount = [demandTransition, capacityTransition, inventoryTransition, pricingTransition, utilizationTransition].filter(Boolean).length
  const evidenceCount = leadingIndicators.length + confirmingIndicators.length
  const inflection: IndustrySupplyDemandCycleResult['inflection'] = evidenceCount === 0 ? 'no_evidence' : contradiction ? 'insufficient_data' : transitionCount >= 2 && ['tightening', 'oversupply', 'destocking', 'bottoming'].includes(state) ? 'confirmed_inflection' : 'possible_inflection'
  const status: IndustrySupplyDemandCycleResult['status'] = evidenceCount === 0 ? 'unavailable' : diagnostics.length === 0 && missingIndicators.length === 0 && contradictingIndicators.length === 0 ? 'complete' : 'partial'
  return { status, industryRef: input.industryRef, state, inflection, leadingIndicators, confirmingIndicators, contradictingIndicators, missingIndicators: unique(missingIndicators), ...(effectiveCapacity === undefined ? {} : { effectiveCapacity }), ...(computedUtilization === undefined ? {} : { utilization: computedUtilization }), priceDeltas: priceDeltas(validPricingItems, diagnostics), diagnostics: unique(diagnostics), asOf: input.asOf }
}
