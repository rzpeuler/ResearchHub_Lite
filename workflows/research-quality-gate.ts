import type { NormalizedResearchSource } from '../plugins/research-acquisition/contracts.ts'

export type ResearchQualityGateProfile = 'valuation' | 'company' | 'earnings' | 'industry' | 'event' | 'thesis_lifecycle' | 'daily_intelligence'
export type ResearchQualityGateStatus = 'PASS' | 'PASS_WITH_WARNINGS' | 'FAIL'
export type ResearchQualityGateSeverity = 'ERROR' | 'WARNING' | 'INFO'

export interface ResearchQualityGateDiagnostic {
  readonly code: string
  readonly severity: ResearchQualityGateSeverity
  readonly message: string
  readonly affectedRefs: readonly string[]
}

export interface ResearchQualityGateDimension {
  readonly metric?: string
  readonly period?: string
  readonly unit?: string
  readonly currency?: string
  readonly basis?: string
}

export interface ResearchQualityGateComparison {
  readonly comparisonRef: string
  readonly left: ResearchQualityGateDimension
  readonly right: ResearchQualityGateDimension
  readonly kind: 'period' | 'unit' | 'currency' | 'general'
}

export interface ResearchQualityGateForecastValuationReference {
  readonly forecastRef: string
  readonly forecastMetric: string
  readonly forecastPeriod: string
  readonly valuationMetric: string
  readonly valuationPeriod: string
  readonly scenarioAdjustment?: boolean
}

export interface ResearchQualityGateExpectationState {
  readonly status: 'MATERIAL_GAP' | 'NO_MATERIAL_GAP' | 'UNAVAILABLE'
  readonly propositionRefs: readonly string[]
}

export interface ResearchQualityGateThesisState {
  readonly claimRef: string
  readonly expectationStatus?: ResearchQualityGateExpectationState['status']
}

export interface ResearchQualityGateCatalystState {
  readonly catalystRef: string
  readonly targetPropositionRefs: readonly string[]
}

export interface ResearchQualityGateInput {
  readonly profile: ResearchQualityGateProfile
  readonly asOf: string
  readonly sources: readonly NormalizedResearchSource[]
  readonly referencedSourceCandidateIds?: readonly string[]
  readonly proposalSourceCandidateIds?: readonly string[]
  readonly reportSourceCandidateIds?: readonly string[]
  readonly comparisons?: readonly ResearchQualityGateComparison[]
  readonly forecastValuationRefs?: readonly ResearchQualityGateForecastValuationReference[]
  readonly expectation?: ResearchQualityGateExpectationState
  readonly thesisStates?: readonly ResearchQualityGateThesisState[]
  readonly catalysts?: readonly ResearchQualityGateCatalystState[]
  readonly validPropositionRefs?: readonly string[]
  readonly optionalUnavailableSections?: readonly string[]
  readonly peerQuality?: { readonly acceptedPeerCount: number; readonly weakComparabilityCount?: number }
}

export interface ResearchQualityGateResult {
  readonly profile: ResearchQualityGateProfile
  readonly status: ResearchQualityGateStatus
  readonly diagnostics: readonly ResearchQualityGateDiagnostic[]
  readonly eligibleForGateway: boolean
}

const profileChecks: Readonly<Record<ResearchQualityGateProfile, ReadonlySet<string>>> = {
  valuation: new Set(['source', 'pit', 'period', 'unit', 'forecast', 'report', 'proposal', 'peer']),
  company: new Set(['source', 'pit', 'period', 'unit', 'report', 'proposal']),
  earnings: new Set(['source', 'pit', 'period', 'unit', 'expectation', 'report', 'proposal']),
  industry: new Set(['source', 'pit', 'period', 'unit', 'report', 'proposal']),
  event: new Set(['source', 'pit', 'report', 'proposal']),
  thesis_lifecycle: new Set(['source', 'pit', 'period', 'unit', 'expectation', 'catalyst', 'report', 'proposal']),
  daily_intelligence: new Set(['source', 'pit', 'report', 'proposal']),
}

function diagnostic(code: string, severity: ResearchQualityGateSeverity, message: string, affectedRefs: readonly string[] = []): ResearchQualityGateDiagnostic { return { code, severity, message, affectedRefs: [...new Set(affectedRefs)].sort() } }
function enabled(input: ResearchQualityGateInput, check: string): boolean { return profileChecks[input.profile].has(check) }
function add(list: ResearchQualityGateDiagnostic[], item: ResearchQualityGateDiagnostic): void { list.push(item) }
function validDate(value: string): boolean { return !Number.isNaN(Date.parse(value)) }

export function runResearchQualityGate(input: ResearchQualityGateInput): ResearchQualityGateResult {
  const diagnostics: ResearchQualityGateDiagnostic[] = []
  const cutoff = Date.parse(input.asOf)
  if (!validDate(input.asOf)) add(diagnostics, diagnostic('INVALID_AS_OF', 'ERROR', 'Quality gate asOf must be a valid date'))
  const byCandidate = new Map<string, NormalizedResearchSource>()
  for (const source of input.sources) {
    const id = source.candidate.candidateId
    if (byCandidate.has(id)) add(diagnostics, diagnostic('DUPLICATE_SOURCE_CANDIDATE', 'ERROR', `Source candidate ${id} is not unique`, [id]))
    byCandidate.set(id, source)
  }
  const refs = [...new Set([...(input.referencedSourceCandidateIds ?? []), ...(input.proposalSourceCandidateIds ?? []), ...(input.reportSourceCandidateIds ?? [])])]
  if (enabled(input, 'source')) {
    for (const ref of refs) {
      const localEvidenceAlias = ref.startsWith('evidence-') && byCandidate.has(ref.slice('evidence-'.length))
      if (!byCandidate.has(ref) && !localEvidenceAlias) add(diagnostics, diagnostic('DANGLING_SOURCE_REF', 'ERROR', `Source reference ${ref} is not present in the composed evidence`, [ref]))
    }
  }
  if (enabled(input, 'pit') && validDate(input.asOf)) {
    for (const source of input.sources) {
      const publishedAt = source.candidate.publishedAt
      if (publishedAt === undefined) { add(diagnostics, diagnostic('SOURCE_PUBLICATION_UNKNOWN', 'WARNING', `Source ${source.candidate.candidateId} has no publication timestamp`, [source.candidate.candidateId])); continue }
      if (!validDate(publishedAt)) { add(diagnostics, diagnostic('SOURCE_PUBLICATION_INVALID', 'ERROR', `Source ${source.candidate.candidateId} has an invalid publication timestamp`, [source.candidate.candidateId])); continue }
      if (Date.parse(publishedAt) > cutoff) add(diagnostics, diagnostic('FUTURE_SOURCE_REFERENCE', 'ERROR', `Source ${source.candidate.candidateId} is published after asOf`, [source.candidate.candidateId]))
    }
  }
  if (enabled(input, 'period') || enabled(input, 'unit')) {
    for (const comparison of input.comparisons ?? []) {
      if (enabled(input, 'period') && comparison.left.period !== undefined && comparison.right.period !== undefined && comparison.left.period !== comparison.right.period) add(diagnostics, diagnostic('PERIOD_MISMATCH', 'ERROR', `Comparison ${comparison.comparisonRef} uses incompatible periods`, [comparison.comparisonRef]))
      if (enabled(input, 'unit') && comparison.left.unit !== undefined && comparison.right.unit !== undefined && comparison.left.unit !== comparison.right.unit) add(diagnostics, diagnostic('UNIT_MISMATCH', 'ERROR', `Comparison ${comparison.comparisonRef} uses incompatible units`, [comparison.comparisonRef]))
      if (enabled(input, 'unit') && comparison.left.currency !== undefined && comparison.right.currency !== undefined && comparison.left.currency !== comparison.right.currency) add(diagnostics, diagnostic('CURRENCY_MISMATCH', 'ERROR', `Comparison ${comparison.comparisonRef} uses incompatible currencies`, [comparison.comparisonRef]))
    }
  }
  if (enabled(input, 'forecast')) for (const reference of input.forecastValuationRefs ?? []) {
    if (reference.forecastMetric !== reference.valuationMetric || reference.forecastPeriod !== reference.valuationPeriod) add(diagnostics, diagnostic(reference.scenarioAdjustment ? 'FORECAST_VALUATION_SCENARIO_ADJUSTMENT' : 'FORECAST_VALUATION_BASIS_MISMATCH', reference.scenarioAdjustment ? 'WARNING' : 'ERROR', `Forecast and valuation basis differ for ${reference.forecastRef}`, [reference.forecastRef]))
  }
  if (enabled(input, 'expectation') && input.expectation !== undefined) for (const thesis of input.thesisStates ?? []) {
    if (thesis.expectationStatus !== undefined && thesis.expectationStatus !== input.expectation.status && thesis.expectationStatus !== 'UNAVAILABLE' && input.expectation.status !== 'UNAVAILABLE') add(diagnostics, diagnostic('EXPECTATION_THESIS_CONTRADICTION', 'ERROR', `Thesis ${thesis.claimRef} disagrees with the expectation-gap result`, [thesis.claimRef, ...input.expectation.propositionRefs]))
  }
  if (enabled(input, 'catalyst')) {
    const valid = new Set(input.validPropositionRefs ?? [])
    for (const catalyst of input.catalysts ?? []) if (catalyst.targetPropositionRefs.length === 0 || catalyst.targetPropositionRefs.some((ref) => !valid.has(ref))) add(diagnostics, diagnostic('DANGLING_CATALYST_PROPOSITION', 'ERROR', `Catalyst ${catalyst.catalystRef} does not target a valid proposition`, [catalyst.catalystRef, ...catalyst.targetPropositionRefs]))
  }
  if (enabled(input, 'peer') && input.peerQuality !== undefined) {
    if (input.peerQuality.acceptedPeerCount < 3) add(diagnostics, diagnostic('SMALL_PEER_COUNT', 'WARNING', 'Comparable valuation has fewer than three accepted peers'))
    if ((input.peerQuality.weakComparabilityCount ?? 0) > 0) add(diagnostics, diagnostic('WEAK_COMPARABILITY_EVIDENCE', 'WARNING', 'One or more accepted peers have weak comparability evidence'))
  }
  if (enabled(input, 'report')) for (const section of input.optionalUnavailableSections ?? []) add(diagnostics, diagnostic('OPTIONAL_SECTION_UNAVAILABLE', 'INFO', `Optional research section unavailable: ${section}`, [section]))
  const errors = diagnostics.filter((item) => item.severity === 'ERROR')
  const warnings = diagnostics.some((item) => item.severity === 'WARNING')
  return { profile: input.profile, status: errors.length > 0 ? 'FAIL' : warnings ? 'PASS_WITH_WARNINGS' : 'PASS', diagnostics, eligibleForGateway: errors.length === 0 }
}
