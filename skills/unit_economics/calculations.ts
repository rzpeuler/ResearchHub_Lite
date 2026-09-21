import type { OperatingLeverageInput, OperatingLeverageResult, PerUnitMetricResult, UnitDefinitionInput, UnitEconomicsInput, UnitEconomicsResult, UnitGrowthComponentInput, UnitGrowthComponentResult, UnitGrowthDecompositionInput, UnitGrowthResult, UnitMetricObservation, UnitEconomicsUnitResult } from './contracts.ts'

const finite = (value: number | undefined): value is number => value !== undefined && Number.isFinite(value)
const unique = (values: readonly string[]): string[] => [...new Set(values.filter((value) => value.trim() !== ''))]
const text = (value: string | undefined): boolean => typeof value === 'string' && value.trim() !== ''

function perUnitMetric(observation: UnitMetricObservation, denominatorUnit: string, currentPeriod: string, priorPeriod: string | undefined, currentCount: number | undefined, priorCount: number | undefined, currentRefs: readonly string[], priorRefs: readonly string[]): PerUnitMetricResult {
  const diagnostics: string[] = []
  const refs = unique([...observation.sourceRefs, ...currentRefs, ...priorRefs])
  const currentAligned = observation.currentPeriod === currentPeriod
  const priorAligned = priorPeriod === undefined || observation.priorPeriod === undefined || observation.priorPeriod === priorPeriod
  if (!currentAligned || !priorAligned) diagnostics.push('metric period mismatch')
  if (!text(observation.unit) || observation.unit === denominatorUnit) diagnostics.push('numerator and denominator units are not distinguishable')
  if (observation.availability === 'unavailable') diagnostics.push('metric is unavailable')
  if (!finite(currentCount) || currentCount <= 0) diagnostics.push('current unit count must be greater than zero')
  if (priorPeriod !== undefined && (!finite(priorCount) || priorCount <= 0)) diagnostics.push('prior unit count must be greater than zero')
  if (!finite(observation.currentValue)) diagnostics.push('current metric value is unavailable')
  if (priorPeriod !== undefined && !finite(observation.priorValue)) diagnostics.push('prior metric value is unavailable')
  if (observation.sourceRefs.length === 0) diagnostics.push('metric requires source references')
  if (currentRefs.length === 0 || (priorPeriod !== undefined && priorRefs.length === 0)) diagnostics.push('unit counts require source references')
  const currentPerUnit = diagnostics.length === 0 ? observation.currentValue! / currentCount! : undefined
  const priorPerUnit = diagnostics.length === 0 && priorPeriod !== undefined ? observation.priorValue! / priorCount! : undefined
  const deltaPerUnit = currentPerUnit !== undefined && priorPerUnit !== undefined ? currentPerUnit - priorPerUnit : undefined
  if (currentPerUnit !== undefined && !Number.isFinite(currentPerUnit)) diagnostics.push('current per-unit result is non-finite')
  if (priorPerUnit !== undefined && !Number.isFinite(priorPerUnit)) diagnostics.push('prior per-unit result is non-finite')
  return { metric: observation.metric, numeratorUnit: observation.unit, denominatorUnit, ...(currentPerUnit !== undefined && Number.isFinite(currentPerUnit) ? { currentPerUnit } : {}), ...(priorPerUnit !== undefined && Number.isFinite(priorPerUnit) ? { priorPerUnit } : {}), ...(deltaPerUnit !== undefined && Number.isFinite(deltaPerUnit) ? { deltaPerUnit } : {}), sourceRefs: refs, status: diagnostics.length === 0 ? 'available' : 'unavailable', diagnostics: unique(diagnostics) }
}

function unitResult(unit: UnitDefinitionInput, input: UnitEconomicsInput): UnitEconomicsUnitResult {
  const diagnostics: string[] = []
  if (!text(unit.id) || !text(unit.name) || !text(unit.scope) || !text(unit.countUnit)) diagnostics.push('unit identity, scope, and count unit are required')
  const metrics = unit.metrics.map((item) => perUnitMetric(item, unit.countUnit, input.currentPeriod, input.priorPeriod, unit.currentCount, unit.priorCount, unit.currentCountSourceRefs, unit.priorCountSourceRefs))
  const status: UnitEconomicsUnitResult['status'] = metrics.length === 0 ? 'unavailable' : metrics.every((item) => item.status === 'available') && diagnostics.length === 0 ? 'complete' : metrics.some((item) => item.status === 'available') ? 'partial' : 'unavailable'
  return { id: unit.id, name: unit.name, unitType: unit.unitType, scope: unit.scope, denominatorUnit: unit.countUnit, metrics, status, diagnostics: unique([...diagnostics, ...metrics.flatMap((item) => item.diagnostics)]) }
}

function componentResult(item: UnitGrowthComponentInput, amount?: number, diagnostics: readonly string[] = []): UnitGrowthComponentResult {
  const valid = amount === undefined || Number.isFinite(amount)
  return { kind: item.kind, ...(valid && amount !== undefined ? { amount } : {}), unit: item.unit, sourceRefs: unique(item.sourceRefs), status: valid && item.sourceRefs.length > 0 && item.availability !== 'unavailable' ? 'available' : 'unavailable', diagnostics: unique([...diagnostics, ...(item.sourceRefs.length === 0 ? ['component requires source references'] : []), ...(item.availability === 'unavailable' ? ['component is unavailable'] : [])]) }
}

function growthResult(input: UnitGrowthDecompositionInput, currentPeriod: string, priorPeriod: string | undefined): UnitGrowthResult {
  const diagnostics: string[] = []
  const components: UnitGrowthComponentResult[] = []
  if (!Number.isFinite(input.currentRevenue) || !Number.isFinite(input.priorRevenue)) diagnostics.push('revenue bridge requires finite current and prior revenue')
  if (!text(input.revenueUnit) || input.currentSourceRefs.length === 0 || input.priorSourceRefs.length === 0) diagnostics.push('revenue bridge requires a unit and period source references')
  const volume = input.components.find((item) => item.kind === 'volume')
  const price = input.components.find((item) => item.kind === 'price')
  const ready = (item: UnitGrowthComponentInput | undefined): item is UnitGrowthComponentInput => item !== undefined && item.availability !== 'unavailable' && finite(item.currentValue) && finite(item.priorValue) && text(item.unit) && item.sourceRefs.length > 0
  if (ready(volume) && ready(price)) {
    if (volume.unit === price.unit) {
      components.push(componentResult(volume, undefined, ['volume and price units must be distinct']))
      components.push(componentResult(price, undefined, ['volume and price units must be distinct']))
      diagnostics.push('volume and price units must be distinct')
    } else {
      components.push(componentResult(volume, (volume.currentValue! - volume.priorValue!) * price.priorValue!))
      components.push(componentResult(price, volume.currentValue! * (price.currentValue! - price.priorValue!)))
    }
  } else if (volume !== undefined || price !== undefined) diagnostics.push('complete volume-price decomposition requires explicit aligned volume and price inputs')
  for (const item of input.components.filter((candidate) => candidate.kind !== 'volume' && candidate.kind !== 'price')) {
    const amount = ready(item) ? item.currentValue! - item.priorValue! : undefined
    components.push(componentResult(item, amount, amount === undefined ? ['component values are unavailable; no amount was inferred'] : []))
  }
  const delta = input.currentRevenue - input.priorRevenue
  const availableAmounts = components.filter((item) => item.amount !== undefined && item.status === 'available').map((item) => item.amount!)
  const residual = availableAmounts.length > 0 ? delta - availableAmounts.reduce((sum, value) => sum + value, 0) : delta
  const status: UnitGrowthResult['status'] = diagnostics.length === 0 && components.length > 0 && components.every((item) => item.status === 'available') ? 'complete' : components.some((item) => item.status === 'available') ? 'partial' : 'unavailable'
  if (priorPeriod === undefined || currentPeriod.trim() === '') diagnostics.push('growth decomposition requires explicit comparable periods')
  return { unitId: input.unitId, currentRevenue: input.currentRevenue, priorRevenue: input.priorRevenue, delta, components, ...(Number.isFinite(residual) ? { residual } : {}), status, diagnostics: unique(diagnostics) }
}

function leverage(input: OperatingLeverageInput): OperatingLeverageResult {
  const diagnostics: string[] = []
  if (!Number.isFinite(input.currentRevenue) || !Number.isFinite(input.priorRevenue) || input.currentSourceRefs.length === 0 || input.priorSourceRefs.length === 0 || !text(input.unit)) diagnostics.push('operating leverage requires period-aligned revenue and source references')
  const deltaRevenue = input.currentRevenue - input.priorRevenue
  if (!Number.isFinite(deltaRevenue) || deltaRevenue === 0) diagnostics.push('revenue delta must be finite and non-zero for incremental margins')
  const deltaGrossProfit = finite(input.currentGrossProfit) && finite(input.priorGrossProfit) ? input.currentGrossProfit - input.priorGrossProfit : undefined
  const deltaOperatingProfit = finite(input.currentOperatingProfit) && finite(input.priorOperatingProfit) ? input.currentOperatingProfit - input.priorOperatingProfit : undefined
  if (deltaGrossProfit === undefined) diagnostics.push('gross-profit operating leverage is unavailable')
  if (deltaOperatingProfit === undefined) diagnostics.push('operating-profit leverage is unavailable')
  const incrementalGrossMargin = deltaGrossProfit !== undefined && deltaRevenue !== 0 ? deltaGrossProfit / deltaRevenue : undefined
  const incrementalOperatingMargin = deltaOperatingProfit !== undefined && deltaRevenue !== 0 ? deltaOperatingProfit / deltaRevenue : undefined
  return { deltaRevenue, ...(deltaGrossProfit !== undefined ? { deltaGrossProfit } : {}), ...(deltaOperatingProfit !== undefined ? { deltaOperatingProfit } : {}), ...(incrementalGrossMargin !== undefined && Number.isFinite(incrementalGrossMargin) ? { incrementalGrossMargin } : {}), ...(incrementalOperatingMargin !== undefined && Number.isFinite(incrementalOperatingMargin) ? { incrementalOperatingMargin } : {}), status: diagnostics.length === 0 ? 'complete' : deltaGrossProfit !== undefined || deltaOperatingProfit !== undefined ? 'partial' : 'unavailable', diagnostics: unique(diagnostics) }
}

function validate(input: UnitEconomicsInput): string[] {
  const diagnostics: string[] = []
  if (!text(input.companyRef)) diagnostics.push('companyRef is required')
  if (!text(input.currentPeriod)) diagnostics.push('currentPeriod is required')
  if (!text(input.asOf) || Number.isNaN(Date.parse(input.asOf))) diagnostics.push('asOf must be an ISO-compatible date')
  if (input.units.length === 0) diagnostics.push('at least one explicit unit definition is required')
  const ids = new Set<string>()
  for (const unit of input.units) {
    if (!text(unit.id) || ids.has(unit.id)) diagnostics.push(`invalid or duplicate unit definition: ${unit.id}`)
    ids.add(unit.id)
    if (!text(unit.name) || !text(unit.scope) || !text(unit.countUnit)) diagnostics.push(`unit ${unit.id} is missing its definition or scope`)
    if (!finite(unit.currentCount) || unit.currentCount <= 0) diagnostics.push(`unit ${unit.id} has no positive current denominator`)
    if (input.priorPeriod !== undefined && (!finite(unit.priorCount) || unit.priorCount <= 0)) diagnostics.push(`unit ${unit.id} has no positive prior denominator`)
  }
  return unique(diagnostics)
}

export function calculateUnitEconomics(input: UnitEconomicsInput): UnitEconomicsResult {
  const diagnostics = validate(input)
  const archetype = input.archetype ?? 'unknown'
  if (diagnostics.length > 0) return { status: 'unavailable', companyRef: input.companyRef, archetype, currentPeriod: input.currentPeriod, ...(input.priorPeriod === undefined ? {} : { priorPeriod: input.priorPeriod }), units: [], growthDecompositions: [], diagnostics, asOf: input.asOf }
  const units = input.units.map((unit) => unitResult(unit, input))
  const growthDecompositions = (input.growthDecompositions ?? []).map((item) => growthResult(item, input.currentPeriod, input.priorPeriod))
  const operatingLeverage = input.operatingLeverage === undefined ? undefined : leverage(input.operatingLeverage)
  const allDiagnostics = unique([...diagnostics, ...units.flatMap((item) => item.diagnostics), ...growthDecompositions.flatMap((item) => item.diagnostics), ...(operatingLeverage?.diagnostics ?? [])])
  const availableUnits = units.filter((item) => item.status !== 'unavailable')
  const status: UnitEconomicsResult['status'] = availableUnits.length === 0 ? 'unavailable' : units.every((item) => item.status === 'complete') && growthDecompositions.every((item) => item.status === 'complete') && (operatingLeverage === undefined || operatingLeverage.status === 'complete') ? 'complete' : 'partial'
  return { status, companyRef: input.companyRef, archetype, currentPeriod: input.currentPeriod, ...(input.priorPeriod === undefined ? {} : { priorPeriod: input.priorPeriod }), units, growthDecompositions, ...(operatingLeverage === undefined ? {} : { operatingLeverage }), diagnostics: allDiagnostics, asOf: input.asOf }
}
