import type { BusinessArchetype, BusinessDriverAnalysisInput, BusinessDriverAnalysisResult, DriverContribution, DriverMetric, DriverMetricResult, DriverObservation, DriverSegmentInput, DriverSegmentResult, OutcomeSeries } from './contracts.ts'

const METRICS: readonly DriverMetric[] = ['revenue', 'gross_profit', 'operating_profit', 'cash_flow']
const finite = (value: number | undefined): value is number => value !== undefined && Number.isFinite(value)
const unique = (values: readonly string[]): string[] => [...new Set(values.filter((value) => value.trim() !== ''))]
const validText = (value: string | undefined): boolean => typeof value === 'string' && value.trim() !== ''
const MULTIPLICATIVE_PAIRS: readonly (readonly [DriverObservation['driverType'], DriverObservation['driverType']])[] = [['volume', 'price'], ['customers', 'ARPU'], ['transactions', 'take_rate'], ['GMV', 'take_rate'], ['capacity', 'utilization']]

function contribution(observation: DriverObservation, amount: number, method: DriverContribution['method']): DriverContribution | undefined {
  if (!Number.isFinite(amount) || observation.sourceRefs.length === 0) return undefined
  return { driverId: observation.id, driverName: observation.name, segment: observation.segment, metric: observation.metric, amount, unit: observation.unit, method, sourceRefs: unique(observation.sourceRefs) }
}

function outcomeFor(segment: DriverSegmentInput, metric: DriverMetric): OutcomeSeries | undefined {
  return segment.outcomes.find((item) => item.metric === metric)
}

function observationsFor(segment: DriverSegmentInput, metric: DriverMetric): readonly DriverObservation[] {
  return segment.drivers.filter((item) => item.metric === metric)
}

function metricResult(segment: DriverSegmentInput, metric: DriverMetric, currentPeriod: string, priorPeriod: string): DriverMetricResult {
  const outcome = outcomeFor(segment, metric)
  const observations = observationsFor(segment, metric)
  const diagnostics: string[] = []
  const unavailable: string[] = []
  const contributions: DriverContribution[] = []
  if (outcome === undefined) return { metric, contributions, unavailableDrivers: observations.map((item) => item.id), diagnostics: ['Outcome series is unavailable for this metric'], status: 'unavailable' }
  const current = outcome.currentValue
  const prior = outcome.priorValue
  const delta = finite(current) && finite(prior) ? current - prior : undefined
  if (!validText(outcome.unit)) diagnostics.push('Outcome unit is required')
  if (outcome.currentSourceRefs.length === 0 || outcome.priorSourceRefs.length === 0) diagnostics.push('Both outcome periods require source references')
  if (!finite(current) || !finite(prior)) diagnostics.push('Both outcome periods require explicit finite values')
  const byType = new Map<string, DriverObservation[]>()
  const byId = new Map<string, DriverObservation>()
  const conflicted = new Set<string>()
  for (const item of observations) {
    const bucket = byType.get(item.driverType) ?? []
    bucket.push(item)
    byType.set(item.driverType, bucket)
    const priorItem = byId.get(item.id)
    if (priorItem !== undefined && (priorItem.currentValue !== item.currentValue || priorItem.priorValue !== item.priorValue || priorItem.unit !== item.unit)) {
      conflicted.add(item.id)
      diagnostics.push(`Conflicting source values for driver ${item.id}`)
    } else byId.set(item.id, item)
    const validPair = item.availability !== 'unavailable' && finite(item.currentValue) && finite(item.priorValue)
      && item.period === currentPeriod && (item.priorPeriod ?? priorPeriod) === priorPeriod && validText(item.unit) && item.sourceRefs.length > 0
    if (!validPair) unavailable.push(item.id)
    if (item.period !== currentPeriod || (item.priorPeriod !== undefined && item.priorPeriod !== priorPeriod)) diagnostics.push(`Driver ${item.id} is not period aligned`)
    if (item.availability === 'unavailable') diagnostics.push(`Driver ${item.id} is unavailable`)
    if (item.sourceRefs.length === 0) diagnostics.push(`Driver ${item.id} has no source references`)
  }
  for (const id of conflicted) unavailable.push(id)
  for (const item of observations.filter((candidate) => candidate.relationshipType === 'additive' && !conflicted.has(candidate.id) && itemReady(candidate, currentPeriod, priorPeriod))) {
    const amount = item.currentValue! - item.priorValue!
    const existing = contribution(item, amount, 'explicit_additive')
    if (existing) contributions.push(existing)
  }
  for (const [leftType, rightType] of MULTIPLICATIVE_PAIRS) {
    const left = byType.get(leftType)?.find((item) => !conflicted.has(item.id) && item.relationshipType === 'multiplicative' && itemReady(item, currentPeriod, priorPeriod))
    const right = byType.get(rightType)?.find((item) => !conflicted.has(item.id) && item.relationshipType === 'multiplicative' && itemReady(item, currentPeriod, priorPeriod))
    if (left === undefined && right === undefined) continue
    if (left === undefined || right === undefined) {
      diagnostics.push(`A complete ${leftType}-${rightType} bridge requires explicit aligned observations`)
      continue
    }
    if (left.unit === right.unit) diagnostics.push(`${leftType} and ${rightType} units must be distinct for ${segment.id}`)
    else {
      const leftEffect = contribution(left, (left.currentValue! - left.priorValue!) * right.priorValue!, 'multiplicative_pair')
      const rightEffect = contribution(right, left.currentValue! * (right.currentValue! - right.priorValue!), 'multiplicative_pair')
      if (leftEffect) contributions.push(leftEffect)
      if (rightEffect) contributions.push(rightEffect)
    }
  }
  const usableContributions = contributions.filter((item) => Number.isFinite(item.amount))
  const known = usableContributions.reduce((sum, item) => sum + item.amount, 0)
  const residual = delta === undefined ? undefined : delta - known
  if (residual !== undefined && !Number.isFinite(residual)) diagnostics.push('Residual is non-finite')
  const validOutcome = finite(current) && finite(prior) && validText(outcome.unit) && outcome.currentSourceRefs.length > 0 && outcome.priorSourceRefs.length > 0
  const status: DriverMetricResult['status'] = !validOutcome ? 'unavailable' : unavailable.length > 0 || observations.length === 0 || diagnostics.length > 0 ? 'partial' : 'complete'
  return { metric, unit: outcome.unit, ...(finite(current) ? { currentValue: current } : {}), ...(finite(prior) ? { priorValue: prior } : {}), ...(delta !== undefined ? { delta } : {}), contributions: usableContributions, ...(residual !== undefined ? { residual } : {}), unavailableDrivers: unique(unavailable), diagnostics: unique(diagnostics), status }
}

function itemReady(item: DriverObservation, currentPeriod: string, priorPeriod: string): boolean {
  return item.availability !== 'unavailable' && finite(item.currentValue) && finite(item.priorValue) && item.period === currentPeriod && (item.priorPeriod ?? priorPeriod) === priorPeriod && validText(item.unit) && item.sourceRefs.length > 0
}

function segmentResult(segment: DriverSegmentInput, currentPeriod: string, priorPeriod: string): DriverSegmentResult {
  const metrics = METRICS.map((metric) => metricResult(segment, metric, currentPeriod, priorPeriod)).filter((item) => item.status !== 'unavailable' || item.contributions.length > 0)
  return { id: segment.id, name: segment.name, metrics, sourceRefs: unique(segment.outcomes.flatMap((item) => [...item.currentSourceRefs, ...item.priorSourceRefs])) }
}

function totalMetric(segments: readonly DriverSegmentResult[], metric: DriverMetric): DriverMetricResult {
  const parts = segments.flatMap((segment) => segment.metrics.filter((item) => item.metric === metric))
  if (parts.length === 0) return { metric, contributions: [], unavailableDrivers: [], diagnostics: ['No aligned outcome series were supplied'], status: 'unavailable' }
  const units = unique(parts.map((item) => item.unit ?? ''))
  const diagnostics = unique(parts.flatMap((item) => item.diagnostics))
  if (units.length > 1) diagnostics.push(`Unit mismatch across ${metric} segments`)
  const currentValues = parts.map((item) => item.currentValue).filter(finite)
  const priorValues = parts.map((item) => item.priorValue).filter(finite)
  const currentValue = currentValues.length === parts.length ? currentValues.reduce((sum, value) => sum + value, 0) : undefined
  const priorValue = priorValues.length === parts.length ? priorValues.reduce((sum, value) => sum + value, 0) : undefined
  const contributions = parts.flatMap((item) => item.contributions)
  const known = contributions.reduce((sum, item) => sum + item.amount, 0)
  const delta = finite(currentValue) && finite(priorValue) ? currentValue - priorValue : undefined
  const residual = delta === undefined ? undefined : delta - known
  return { metric, ...(units.length === 1 ? { unit: units[0] } : {}), ...(currentValue !== undefined ? { currentValue } : {}), ...(priorValue !== undefined ? { priorValue } : {}), ...(delta !== undefined ? { delta } : {}), contributions, ...(residual !== undefined ? { residual } : {}), unavailableDrivers: unique(parts.flatMap((item) => item.unavailableDrivers)), diagnostics, status: currentValue === undefined || priorValue === undefined ? 'unavailable' : parts.some((item) => item.status !== 'complete') || units.length > 1 ? 'partial' : 'complete' }
}

function validateInput(input: BusinessDriverAnalysisInput): string[] {
  const diagnostics: string[] = []
  if (!validText(input.companyRef)) diagnostics.push('companyRef is required')
  if (!validText(input.currentPeriod) || !validText(input.priorPeriod) || input.currentPeriod === input.priorPeriod) diagnostics.push('currentPeriod and priorPeriod must be distinct')
  if (!validText(input.asOf) || Number.isNaN(Date.parse(input.asOf))) diagnostics.push('asOf must be an ISO-compatible date')
  if (input.segments.length === 0) diagnostics.push('at least one segment is required')
  const ids = new Set<string>()
  for (const segment of input.segments) {
    if (!validText(segment.id) || !validText(segment.name) || ids.has(segment.id)) diagnostics.push(`invalid or duplicate segment: ${segment.id}`)
    ids.add(segment.id)
    for (const outcome of segment.outcomes) if (!validText(outcome.unit)) diagnostics.push(`missing unit for ${segment.id}/${outcome.metric}`)
  }
  return unique(diagnostics)
}

export function calculateBusinessDriverAnalysis(input: BusinessDriverAnalysisInput): BusinessDriverAnalysisResult {
  const diagnostics = validateInput(input)
  const archetype: BusinessArchetype = input.archetype ?? 'unknown'
  if (diagnostics.length > 0) return { status: 'unavailable', companyRef: input.companyRef, archetype, currentPeriod: input.currentPeriod, priorPeriod: input.priorPeriod, segments: [], metrics: [], unresolvedDrivers: [], diagnostics, asOf: input.asOf }
  const segments = input.segments.map((segment) => segmentResult(segment, input.currentPeriod, input.priorPeriod))
  const metrics = METRICS.map((metric) => totalMetric(segments, metric)).filter((item) => item.status !== 'unavailable' || item.contributions.length > 0)
  const unresolvedDrivers = unique(metrics.flatMap((item) => item.unavailableDrivers))
  const allDiagnostics = unique([...diagnostics, ...metrics.flatMap((item) => item.diagnostics)])
  const status: BusinessDriverAnalysisResult['status'] = metrics.length === 0 ? 'unavailable' : metrics.some((item) => item.status !== 'complete') || unresolvedDrivers.length > 0 ? 'partial' : 'complete'
  return { status, companyRef: input.companyRef, archetype, currentPeriod: input.currentPeriod, priorPeriod: input.priorPeriod, segments, metrics, unresolvedDrivers, diagnostics: allDiagnostics, asOf: input.asOf }
}
