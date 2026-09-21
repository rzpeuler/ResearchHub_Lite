import { EXPECTATION_PAIR_TYPES, EXPECTATION_SURFACES, ExpectationGapError, type ExpectationGapInput, type ExpectationGapPairResult, type ExpectationGapProposition, type ExpectationGapResult, type ExpectationPairType, type ExpectationRange, type ExpectationRelationship, type ExpectationSurfaceInput, type ExpectationSurfaceKind } from './contracts.ts'

const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)
const text = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0
const unique = (values: readonly string[]): readonly string[] => [...new Set(values)].sort((a, b) => a.localeCompare(b))
const refs = (value: readonly string[] | undefined): readonly string[] => unique((value ?? []).filter((item): item is string => text(item)))
const pairSides: Readonly<Record<ExpectationPairType, readonly [ExpectationSurfaceKind, ExpectationSurfaceKind]>> = {
  market_vs_consensus: ['price_implied', 'consensus'],
  market_vs_management: ['price_implied', 'management'],
  market_vs_own: ['price_implied', 'own_research'],
  consensus_vs_management: ['consensus', 'management'],
  consensus_vs_own: ['consensus', 'own_research'],
  management_vs_own: ['management', 'own_research'],
}

function validateSurface(surface: ExpectationSurfaceInput, asOf: string): void {
  if (!EXPECTATION_SURFACES.includes(surface.surface) || !text(surface.metric) || !text(surface.period) || !text(surface.unit) || !text(surface.basis)) throw new ExpectationGapError('EXPECTATION_SURFACE_IDENTITY_INVALID')
  const hasValue = finite(surface.value)
  const hasRange = surface.range !== undefined && finite(surface.range.low) && finite(surface.range.high) && surface.range.low <= surface.range.high
  if (hasValue === hasRange) throw new ExpectationGapError('EXPECTATION_SURFACE_VALUE_SHAPE_INVALID')
  if (!refs(surface.sourceRefs).length && !refs(surface.upstreamResultRefs).length) throw new ExpectationGapError('EXPECTATION_SURFACE_TRACEABILITY_MISSING')
  if (surface.surface === 'own_research' && !refs(surface.sourceRefs).length && !refs(surface.upstreamResultRefs).length) throw new ExpectationGapError('OWN_RESEARCH_TRACEABILITY_MISSING')
  if (surface.publishedAt !== undefined && (Number.isNaN(Date.parse(surface.publishedAt)) || Date.parse(surface.publishedAt) > Date.parse(asOf))) throw new ExpectationGapError('EXPECTATION_SURFACE_POST_ASOF')
}

function rangeOf(surface: ExpectationSurfaceInput): ExpectationRange {
  return surface.range ?? { low: surface.value!, high: surface.value! }
}

function compareValues(left: ExpectationSurfaceInput, right: ExpectationSurfaceInput, threshold: number): Pick<ExpectationGapPairResult, 'comparable' | 'relationship' | 'absoluteDelta' | 'percentageDelta' | 'diagnostics'> {
  if (left.metric !== right.metric || left.period !== right.period || left.unit !== right.unit || left.basis !== right.basis) return { comparable: false, relationship: 'not_directly_comparable', diagnostics: ['metric_period_unit_or_basis_mismatch'] }
  const leftRange = rangeOf(left)
  const rightRange = rangeOf(right)
  const leftIsPoint = left.value !== undefined
  const rightIsPoint = right.value !== undefined
  const diagnostics: string[] = []
  let relationship: ExpectationRelationship
  if (leftIsPoint && rightIsPoint) {
    const absoluteDelta = left.value! - right.value!
    const percentageDelta = right.value === 0 ? undefined : absoluteDelta / Math.abs(right.value)
    relationship = Math.abs(absoluteDelta) <= threshold ? (threshold === 0 ? 'equal' : 'in_line') : absoluteDelta < 0 ? 'below_point' : 'above_point'
    return { comparable: true, relationship, absoluteDelta, ...(percentageDelta === undefined ? {} : { percentageDelta }), diagnostics }
  }
  if (leftIsPoint) relationship = left.value! < rightRange.low - threshold ? 'below_range' : left.value! > rightRange.high + threshold ? 'above_range' : 'inside_range'
  else if (rightIsPoint) relationship = leftRange.high < right.value! - threshold ? 'below_point' : leftRange.low > right.value! + threshold ? 'above_point' : 'overlap'
  else relationship = leftRange.high < rightRange.low - threshold ? 'below_range' : leftRange.low > rightRange.high + threshold ? 'above_range' : 'overlap'
  if (relationship === 'overlap') diagnostics.push('range_overlap_preserved')
  return { comparable: true, relationship, diagnostics }
}

function proposition(pair: ExpectationGapPairResult, left: ExpectationSurfaceInput, right: ExpectationSurfaceInput): ExpectationGapProposition | undefined {
  if (!pair.comparable || pair.relationship === 'equal' || pair.relationship === 'in_line' || pair.relationship === 'inside_range') return undefined
  if (pair.relationship === 'not_directly_comparable' || pair.relationship === 'unavailable') return undefined
  return {
    propositionId: `expectation-gap:${pair.pairId}`,
    statement: `${left.surface} is ${pair.relationship.replaceAll('_', ' ')} ${right.surface} for ${left.metric} ${left.period}.`,
    pairId: pair.pairId,
    relationship: pair.relationship,
    sourceRefs: unique([...refs(left.sourceRefs), ...refs(right.sourceRefs)]),
    verificationCondition: `Recompare ${left.metric} ${left.period} on a compatible ${left.basis} basis.`,
  }
}

export function analyzeExpectationGap(input: ExpectationGapInput): ExpectationGapResult {
  if (!input || !text(input.asOf) || Number.isNaN(Date.parse(input.asOf)) || !Array.isArray(input.surfaces)) throw new ExpectationGapError('EXPECTATION_GAP_INPUT_INVALID')
  const threshold = input.materialityThreshold ?? 0
  if (!finite(threshold) || threshold < 0) throw new ExpectationGapError('EXPECTATION_GAP_THRESHOLD_INVALID')
  const surfaces = input.surfaces.slice(0, 4)
  const diagnostics: string[] = []
  const validSurfaces: ExpectationSurfaceInput[] = []
  for (const surface of surfaces) {
    try { validateSurface(surface, input.asOf); validSurfaces.push({ ...surface, sourceRefs: refs(surface.sourceRefs), ...(surface.upstreamResultRefs === undefined ? {} : { upstreamResultRefs: refs(surface.upstreamResultRefs) }) }) }
    catch (error) { diagnostics.push(error instanceof ExpectationGapError ? `${surface.surface}:${error.code}` : `${surface.surface}:surface_invalid`) }
  }
  const requested = input.pairs === undefined ? EXPECTATION_PAIR_TYPES : unique(input.pairs as readonly string[]) as ExpectationPairType[]
  if (requested.some((pair) => !EXPECTATION_PAIR_TYPES.includes(pair))) throw new ExpectationGapError('EXPECTATION_PAIR_INVALID')
  const bySurface = new Map(validSurfaces.map((surface) => [surface.surface, surface]))
  const pairs: ExpectationGapPairResult[] = []
  for (const pairId of requested) {
    const [leftSurface, rightSurface] = pairSides[pairId]
    const left = bySurface.get(leftSurface)
    const right = bySurface.get(rightSurface)
    if (!left || !right) { pairs.push({ pairId, leftSurface, rightSurface, comparable: false, relationship: 'unavailable', sourceRefs: unique([...refs(left?.sourceRefs), ...refs(right?.sourceRefs)]), diagnostics: ['expectation_surface_unavailable'] }); continue }
    const comparison = compareValues(left, right, threshold)
    pairs.push({ pairId, leftSurface, rightSurface, ...comparison, sourceRefs: unique([...refs(left.sourceRefs), ...refs(right.sourceRefs)]) })
  }
  const gapPropositions = pairs.map((pair) => { const [leftSurface, rightSurface] = pairSides[pair.pairId]; const left = bySurface.get(leftSurface); const right = bySurface.get(rightSurface); return left && right ? proposition(pair, left, right) : undefined }).filter((item): item is ExpectationGapProposition => item !== undefined)
  const comparable = pairs.filter((pair) => pair.comparable)
  const noMaterialExpectationGap = comparable.length === 0 ? null : comparable.every((pair) => pair.relationship === 'equal' || pair.relationship === 'in_line' || pair.relationship === 'inside_range')
  if (comparable.length === 0) diagnostics.push('no_comparable_expectation_pairs')
  if (gapPropositions.length === 0 && comparable.length > 0 && noMaterialExpectationGap === true) diagnostics.push('no_material_expectation_gap')
  const blockingDiagnostics = diagnostics.filter((item) => item !== 'no_material_expectation_gap')
  return { status: validSurfaces.length === 0 ? 'unavailable' : blockingDiagnostics.length ? 'partial' : 'complete', surfaces: validSurfaces, pairs, gapPropositions, noMaterialExpectationGap, diagnostics }
}
