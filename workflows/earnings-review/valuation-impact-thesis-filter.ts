import type { EarningsExpectationAnalysis } from './expectations-contracts.ts'
import type { ReasoningExecutor } from '../../plugins/reasoning/contracts.ts'
import type {
  EarningsFinding,
  EarningsFindingKind,
  EarningsThesisContext,
  EarningsValuationImpactAnalysis,
  EarningsValuationImpactInput,
  FindingDelta,
  SemanticFindingDecision,
  ThesisFindingClassification,
  ThesisFilterContext,
  ThesisFilterReasoning,
  ThesisImpact,
  ThesisEffect,
  ValuationImpactBridge,
  ValuationInput,
} from './valuation-impact-thesis-filter-contracts.ts'

const OPERATION = 'earnings_expectation_thesis_filter' as const
const OUTSIDE_GUIDANCE_RELATIONSHIPS = new Set(['below_range', 'above_range', 'below_minimum', 'above_maximum', 'below_point', 'above_point'])
const VALUATION_METRIC_MAP: Readonly<Record<string, ValuationInput>> = {
  revenue: 'revenue',
  net_profit: 'earnings',
  eps: 'earnings',
  gross_margin: 'margin',
  net_profit_margin: 'margin',
  operating_cash_flow: 'cash_flow',
  free_cash_flow: 'cash_flow',
  cash_flow: 'cash_flow',
  revenue_growth: 'growth',
  earnings_growth: 'growth',
  eps_growth: 'growth',
}
const LOAD_BEARING_EDGES = new Set(['depends_on', 'invalidates'])
const ALLOWED_EFFECTS = new Set<ThesisEffect>(['supports', 'challenges', 'mixed', 'uncertain'])

function text(value: unknown): string { return typeof value === 'string' ? value.normalize('NFKC').trim() : '' }
function metricKey(value: unknown): string { const normalized = text(value).toLowerCase(); return normalized.startsWith('metric:') ? normalized.slice(7).trim() : normalized }
function finite(value: unknown): value is number { return typeof value === 'number' && Number.isFinite(value) }
function sortedUnique(values: readonly string[]): string[] { return [...new Set(values.filter((value) => value.length > 0))].sort((a, b) => a.localeCompare(b)) }
function sourceIds(value: unknown): string[] { return Array.isArray(value) ? sortedUnique(value.filter((item): item is string => typeof item === 'string').map(text)) : [] }
function resultOf(item: unknown): Record<string, unknown> { return item && typeof item === 'object' ? item as Record<string, unknown> : {} }
function safePart(value: string): string { return value.toLowerCase().replace(/[^a-z0-9._-]+/g, '_').replace(/^_+|_+$/g, '') || 'unknown' }
function jsonIdentity(value: unknown): string { return JSON.stringify(value, (_key, item) => item === undefined ? null : item) }
function delta(dimension: string, absoluteDelta: unknown, relativeDelta: unknown): FindingDelta | undefined {
  if (!finite(absoluteDelta)) return undefined
  return finite(relativeDelta) ? { dimension, absoluteDelta, relativeDelta } : { dimension, absoluteDelta }
}
function firstDelta(deltas: readonly FindingDelta[]): number | null { return deltas.length === 1 ? deltas[0]!.absoluteDelta : null }
function mappedValuationInput(metric: string): ValuationInput | undefined { return VALUATION_METRIC_MAP[metricKey(metric)] }

interface DraftFinding { finding: EarningsFinding; identity: string; payload: string }

function makeFinding(kind: EarningsFindingKind, result: Record<string, unknown>, sourceCandidateIds: readonly string[], deterministicDeltas: readonly FindingDelta[], fields: { readonly identity: string; readonly direction?: EarningsFinding['direction']; readonly relationship?: string; readonly metric?: string; readonly fiscalPeriod?: string; readonly unit?: string; readonly institutionKey?: string; }): DraftFinding | undefined {
  const metric = metricKey(fields.metric ?? result.metric)
  const fiscalPeriod = text(fields.fiscalPeriod ?? result.fiscalPeriod)
  const institutionKey = text(fields.institutionKey)
  if (!metric || !fiscalPeriod || (kind === 'actual_vs_prior_estimate' && !institutionKey) || fields.identity.split('|').some((part) => part.length === 0) || (deterministicDeltas.length === 0 && kind !== 'guidance_vs_consensus')) return undefined
  const identity = `${kind}|${fields.identity}`
  const payload = jsonIdentity({ kind, metric, fiscalPeriod, unit: fields.unit ?? text(result.unit), institutionKey: institutionKey || undefined, direction: fields.direction ?? result.direction ?? 'mixed', relationship: fields.relationship ?? result.relationship, deltas: deterministicDeltas })
  const finding: EarningsFinding = {
    findingId: `finding:${safePart(identity)}`,
    kind,
    metric,
    fiscalPeriod,
    ...(text(fields.unit ?? result.unit) ? { unit: text(fields.unit ?? result.unit) } : {}),
    ...(institutionKey ? { institutionKey } : {}),
    direction: fields.direction ?? ((text(result.direction) as EarningsFinding['direction']) || 'mixed'),
    ...(text(fields.relationship ?? result.relationship) ? { relationship: text(fields.relationship ?? result.relationship) } : {}),
    ...(deterministicDeltas.length === 1 ? { absoluteDelta: deterministicDeltas[0]!.absoluteDelta, ...(deterministicDeltas[0]!.relativeDelta === undefined ? {} : { relativeDelta: deterministicDeltas[0]!.relativeDelta }) } : {}),
    deterministicDeltas,
    sourceCandidateIds: sortedUnique(sourceCandidateIds),
    summary: `${metric} ${fiscalPeriod} expectation finding`,
  }
  return { finding, identity, payload }
}

function normalizeDetailed(expectationAnalysis: EarningsExpectationAnalysis): { readonly findings: readonly EarningsFinding[]; readonly diagnostics: readonly string[] } {
  const drafts: DraftFinding[] = []
  const diagnostics: string[] = []
  const add = (draft: DraftFinding | undefined, reason: string): void => { if (draft) drafts.push(draft); else diagnostics.push(reason) }

  for (const item of expectationAnalysis.actualVsConsensus) {
    const result = resultOf(item.result)
    add(makeFinding('actual_vs_consensus', result, sourceIds(item.sourceCandidateIds), [delta('benchmark', result.absoluteDelta, result.relativeDelta)].filter((item): item is FindingDelta => item !== undefined), { identity: [metricKey(result.metric), text(result.fiscalPeriod), text(result.benchmarkType)].join('|'), direction: text(result.direction) as EarningsFinding['direction'] }), 'finding_missing_stable_identity:actual_vs_consensus')
  }
  for (const item of expectationAnalysis.actualVsPriorEstimate) {
    const result = resultOf(item.result)
    const institutionKey = text(item.institutionKey)
    add(makeFinding('actual_vs_prior_estimate', result, sourceIds(item.sourceCandidateIds), [delta('benchmark', result.absoluteDelta, result.relativeDelta)].filter((item): item is FindingDelta => item !== undefined), { identity: [institutionKey, metricKey(result.metric), text(result.fiscalPeriod), text(result.benchmarkType)].join('|'), institutionKey, direction: text(result.direction) as EarningsFinding['direction'] }), institutionKey ? 'finding_missing_stable_identity:actual_vs_prior_estimate' : 'finding_missing_institution_identity:actual_vs_prior_estimate')
  }
  for (const item of expectationAnalysis.estimateRevisions) {
    const result = resultOf(item.result)
    add(makeFinding('estimate_revision', result, sourceIds(item.sourceCandidateIds), [delta('revision', result.absoluteRevision, result.relativeRevision)].filter((item): item is FindingDelta => item !== undefined), { identity: [metricKey(result.metric), text(result.fiscalPeriod), text(result.institutionKey), text(result.oldPublishedAt), text(result.newPublishedAt)].join('|'), direction: finite(result.absoluteRevision) ? result.absoluteRevision > 0 ? 'raised' : result.absoluteRevision < 0 ? 'lowered' : 'mixed' : 'mixed' }), 'finding_missing_stable_identity:estimate_revision')
  }
  for (const item of expectationAnalysis.guidanceRevisions) {
    const result = resultOf(item.result)
    const dimensions = [['low', result.lowEndRevision], ['high', result.highEndRevision], ['midpoint', result.midpointRevision], ['range_width', result.rangeWidthChange]] as const
    const deltas = dimensions.map(([name, raw]) => { const revision = resultOf(raw); return delta(name, revision.absoluteRevision, revision.relativeRevision) }).filter((item): item is FindingDelta => item !== undefined)
    add(makeFinding('guidance_revision', result, sourceIds(item.sourceCandidateIds), deltas, { identity: [metricKey(result.metric), text(result.fiscalPeriod), text(result.unit), text(result.oldGuidanceId), text(result.newGuidanceId), text(result.oldPublishedAt), text(result.newPublishedAt)].join('|'), direction: 'mixed' }), 'finding_missing_stable_identity:guidance_revision')
  }
  for (const item of expectationAnalysis.guidanceVsConsensus) {
    const result = resultOf(item.result)
    const one = delta('consensus', result.absoluteDelta, result.relativeDelta)
    add(makeFinding('guidance_vs_consensus', result, sourceIds(item.sourceCandidateIds), one ? [one] : [], { identity: [metricKey(result.metric), text(result.fiscalPeriod), text(result.unit), text(result.guidanceId), text(result.consensusAsOf)].join('|'), direction: text(result.direction) as EarningsFinding['direction'], relationship: text(result.relationship) }), 'finding_missing_stable_identity:guidance_vs_consensus')
  }
  for (const item of expectationAnalysis.segmentKpiDeltas) {
    const result = resultOf(item.result)
    const shared = [text(result.segmentKey), metricKey(result.metric), text(result.unit), text(result.currentPeriod)]
    const prior = resultOf(result.priorComparison)
    const priorDelta = delta('prior', prior.absoluteDelta, prior.relativeDelta)
    if (priorDelta && text(result.priorPeriod)) add(makeFinding('segment_kpi_prior', result, sourceIds(item.sourceCandidateIds), [priorDelta], { identity: [...shared, text(result.priorPeriod), 'prior'].join('|'), fiscalPeriod: text(result.currentPeriod), direction: text(prior.direction) as EarningsFinding['direction'] }), 'finding_missing_stable_identity:segment_kpi_prior')
    else if (result.priorComparison !== undefined) diagnostics.push('finding_missing_stable_identity:segment_kpi_prior')
    const expectation = resultOf(result.expectationComparison)
    const expectationDelta = delta('expectation', expectation.absoluteDelta, expectation.relativeDelta)
    if (expectationDelta && text(result.expectationPeriod)) add(makeFinding('segment_kpi_expectation', result, sourceIds(item.sourceCandidateIds), [expectationDelta], { identity: [...shared, text(result.expectationPeriod), 'expectation'].join('|'), fiscalPeriod: text(result.currentPeriod), direction: text(expectation.direction) as EarningsFinding['direction'] }), 'finding_missing_stable_identity:segment_kpi_expectation')
    else if (result.expectationComparison !== undefined) diagnostics.push('finding_missing_stable_identity:segment_kpi_expectation')
  }

  const byId = new Map<string, DraftFinding[]>(); for (const draft of drafts) byId.set(draft.finding.findingId, [...(byId.get(draft.finding.findingId) ?? []), draft])
  const valid: EarningsFinding[] = []
  for (const [findingId, sameId] of byId) {
    const payloads = new Set(sameId.map((item) => item.payload))
    if (payloads.size > 1) { diagnostics.push(`finding_identity_collision:${findingId}`); continue }
    const provenance = sortedUnique(sameId.flatMap((item) => item.finding.sourceCandidateIds))
    valid.push({ ...sameId[0]!.finding, sourceCandidateIds: provenance })
  }
  valid.sort((a, b) => a.findingId.localeCompare(b.findingId))
  return { findings: valid, diagnostics: sortedUnique(diagnostics) }
}

export function normalizeEarningsExpectationFindingsDetailed(expectationAnalysis: EarningsExpectationAnalysis): { readonly findings: readonly EarningsFinding[]; readonly diagnostics: readonly string[] } { return normalizeDetailed(expectationAnalysis) }
export function normalizeEarningsExpectationFindings(expectationAnalysis: EarningsExpectationAnalysis): readonly EarningsFinding[] { return normalizeDetailed(expectationAnalysis).findings }
export const buildEarningsExpectationFindings = normalizeEarningsExpectationFindings

export function buildValuationImpactBridges(findings: readonly EarningsFinding[]): readonly ValuationImpactBridge[] {
  return findings.map((finding) => {
    const input = mappedValuationInput(finding.metric)
    const hasNonZeroDelta = finding.deterministicDeltas.some((item) => item.absoluteDelta !== 0)
    const outsideBoundary = finding.kind === 'guidance_vs_consensus' && finding.relationship !== undefined && OUTSIDE_GUIDANCE_RELATIONSHIPS.has(finding.relationship)
    const requires = input !== undefined && (hasNonZeroDelta || outsideBoundary)
    return { findingId: finding.findingId, metric: finding.metric, fiscalPeriod: finding.fiscalPeriod, surpriseOrRevision: firstDelta(finding.deterministicDeltas), deterministicDeltas: finding.deterministicDeltas, affectedValuationInputs: input === undefined ? [] : [input], requiresValuationRefresh: requires, rationale: input === undefined ? 'No explicit valuation-input mapping exists for this metric.' : requires ? 'A verified expectation change affects a mapped valuation input; the dedicated Valuation Workflow must refresh arithmetic.' : 'The verified expectation finding does not require a valuation refresh under the bounded bridge rules.', rationaleRefs: finding.sourceCandidateIds }
  })
}
export const buildValuationImpactBridge = buildValuationImpactBridges

function edgeCriticality(edgeType: string): ThesisImpact['criticality'] { return LOAD_BEARING_EDGES.has(edgeType) ? 'load_bearing' : 'direct' }
function relationFor(effect: ThesisEffect): ThesisImpact['relation'] { return effect === 'supports' ? 'supports_dependency' : effect === 'challenges' ? 'challenges_dependency' : 'implicates_dependency' }
function contextDependencies(context: ThesisFilterContext): Map<string, { readonly thesis: EarningsThesisContext; readonly dependency: EarningsThesisContext['dependencies'][number] }> {
  const map = new Map<string, { readonly thesis: EarningsThesisContext; readonly dependency: EarningsThesisContext['dependencies'][number] }>()
  for (const thesis of context.theses) for (const dependency of thesis.dependencies) map.set(`${thesis.thesisRef}|${dependency.edgeRef}`, { thesis, dependency })
  return map
}
function exactMatches(finding: EarningsFinding, context: ThesisFilterContext): ThesisImpact[] {
  const matches: ThesisImpact[] = []
  for (const thesis of context.theses) for (const dependency of thesis.dependencies) {
    if (!finding.metric || !dependency.metric || metricKey(dependency.metric) !== metricKey(finding.metric)) continue
    if (dependency.fiscalPeriod && dependency.fiscalPeriod !== finding.fiscalPeriod) continue
    const criticality = edgeCriticality(dependency.edgeType)
    matches.push({ findingId: finding.findingId, thesisRef: thesis.thesisRef, thesisTitle: thesis.title, thesisStatus: thesis.status, dependencyRef: dependency.sourceRef, dependencyKind: dependency.sourceKind, ...(dependency.statement ? { dependencyStatement: dependency.statement } : {}), reasoningEdgeRef: dependency.edgeRef, reasoningEdgeType: dependency.edgeType, criticality, effect: 'uncertain', relation: 'implicates_dependency', rationale: 'Exact structured metric relevance was found; effect remains unresolved until bounded semantic filtering.' })
  }
  return matches.sort((a, b) => `${a.thesisRef}|${a.reasoningEdgeRef}`.localeCompare(`${b.thesisRef}|${b.reasoningEdgeRef}`))
}

export function filterThesisImpacts(findings: readonly EarningsFinding[], thesisContext?: ThesisFilterContext): readonly ThesisImpact[] { return thesisContext ? findings.flatMap((finding) => exactMatches(finding, thesisContext)) : [] }

function classification(findingId: string, matches: readonly ThesisImpact[], unresolved: boolean, rationale: string): ThesisFindingClassification {
  const value: ThesisFindingClassification['classification'] = matches.length === 0 ? (unresolved ? 'uncertain' : 'thesis_irrelevant') : matches.some((item) => item.criticality === 'load_bearing') ? 'thesis_critical' : 'thesis_relevant'
  return { findingId, classification: value, matches, unresolved, rationale }
}
function fallbackClassifications(findings: readonly EarningsFinding[], impacts: readonly ThesisImpact[]): readonly ThesisFindingClassification[] {
  const byFinding = new Map<string, ThesisImpact[]>(); for (const impact of impacts) byFinding.set(impact.findingId, [...(byFinding.get(impact.findingId) ?? []), impact])
  return findings.map((finding) => { const matches = byFinding.get(finding.findingId) ?? []; return classification(finding.findingId, matches, true, matches.length > 0 ? 'Deterministic relevance is retained, but effect resolution is unavailable.' : 'Thesis relevance is uncertain because semantic resolution is unavailable.') })
}
function baseReasoning(overrides: Partial<ThesisFilterReasoning> = {}): ThesisFilterReasoning { return { called: false, validated: true, applied: true, fallbackUsed: false, repairAttempts: 0, operation: OPERATION, ...overrides } }

function outputObject(value: unknown): Record<string, unknown> | undefined { return value && typeof value === 'object' ? value as Record<string, unknown> : undefined }
function validateSemanticOutput(output: unknown, findings: readonly EarningsFinding[], context: ThesisFilterContext): { readonly decisions?: readonly SemanticFindingDecision[]; readonly error?: string } {
  const root = outputObject(output); if (!root || !Array.isArray(root.decisions) || Object.keys(root).some((key) => key !== 'decisions')) return { error: 'semantic_output_shape_invalid' }
  const findingIds = new Set(findings.map((item) => item.findingId)); const thesisRefs = new Set(context.theses.map((item) => item.thesisRef)); const validRefs = contextDependencies(context); const seen = new Set<string>(); const decisions: SemanticFindingDecision[] = []
  for (const raw of root.decisions) {
    const decision = outputObject(raw); if (!decision || typeof decision.findingId !== 'string' || !findingIds.has(decision.findingId) || seen.has(decision.findingId) || !Array.isArray(decision.matches) || typeof decision.unresolved !== 'boolean' || Object.keys(decision).some((key) => !['findingId', 'matches', 'unresolved'].includes(key))) return { error: 'semantic_decision_invalid' }
    seen.add(decision.findingId); const matches: Array<{ readonly thesisRef: string; readonly dependencyRefs: readonly string[]; readonly effect: ThesisEffect; readonly rationale: string }> = []
    const seenDependencyRefs = new Set<string>()
    for (const rawMatch of decision.matches) {
      const match = outputObject(rawMatch); if (!match || typeof match.thesisRef !== 'string' || !thesisRefs.has(match.thesisRef) || !Array.isArray(match.dependencyRefs) || typeof match.effect !== 'string' || !ALLOWED_EFFECTS.has(match.effect as ThesisEffect) || typeof match.rationale !== 'string' || !text(match.rationale) || Object.keys(match).some((key) => !['thesisRef', 'dependencyRefs', 'effect', 'rationale'].includes(key))) return { error: 'semantic_match_invalid' }
      const refs = match.dependencyRefs.filter((ref): ref is string => typeof ref === 'string'); if (refs.length !== match.dependencyRefs.length || new Set(refs).size !== refs.length || refs.some((ref) => seenDependencyRefs.has(`${match.thesisRef}|${ref}`))) return { error: 'semantic_dependency_refs_invalid' }
      refs.forEach((ref) => seenDependencyRefs.add(`${match.thesisRef}|${ref}`))
      for (const ref of refs) if (!validRefs.has(`${match.thesisRef}|${ref}`)) return { error: 'semantic_reference_invalid' }
      matches.push({ thesisRef: match.thesisRef, dependencyRefs: refs, effect: match.effect as ThesisEffect, rationale: text(match.rationale) })
    }
    decisions.push({ findingId: decision.findingId, matches, unresolved: decision.unresolved })
  }
  if (seen.size !== findings.length) return { error: 'semantic_decisions_incomplete' }
  return { decisions }
}

function mergeSemantic(findings: readonly EarningsFinding[], context: ThesisFilterContext, deterministic: readonly ThesisImpact[], decisions: readonly SemanticFindingDecision[]): { readonly impacts: readonly ThesisImpact[]; readonly classifications: readonly ThesisFindingClassification[] } {
  const deterministicByFinding = new Map<string, ThesisImpact[]>(); for (const item of deterministic) deterministicByFinding.set(item.findingId, [...(deterministicByFinding.get(item.findingId) ?? []), item])
  const decisionByFinding = new Map(decisions.map((item) => [item.findingId, item])); const refs = contextDependencies(context)
  const classifications = findings.map((finding) => {
    const decision = decisionByFinding.get(finding.findingId)!; const merged = [...(deterministicByFinding.get(finding.findingId) ?? [])]
    for (const match of decision.matches) for (const dependencyRef of match.dependencyRefs) {
      const resolved = refs.get(`${match.thesisRef}|${dependencyRef}`); if (!resolved) continue
      const existingIndex = merged.findIndex((item) => item.thesisRef === match.thesisRef && item.reasoningEdgeRef === resolved.dependency.edgeRef)
      if (existingIndex >= 0) {
        const existing = merged[existingIndex]!
        merged[existingIndex] = { ...existing, effect: match.effect, relation: relationFor(match.effect), rationale: match.rationale }
      } else {
        const dependency = resolved.dependency; merged.push({ findingId: finding.findingId, thesisRef: resolved.thesis.thesisRef, thesisTitle: resolved.thesis.title, thesisStatus: resolved.thesis.status, dependencyRef: dependency.sourceRef, dependencyKind: dependency.sourceKind, ...(dependency.statement ? { dependencyStatement: dependency.statement } : {}), reasoningEdgeRef: dependency.edgeRef, reasoningEdgeType: dependency.edgeType, criticality: edgeCriticality(dependency.edgeType), effect: match.effect, relation: relationFor(match.effect), rationale: match.rationale })
      }
    }
    const unique = [...new Map(merged.map((item) => [`${item.thesisRef}|${item.reasoningEdgeRef}`, item])).values()]
    return classification(finding.findingId, unique, decision.unresolved || unique.some((item) => item.effect === 'uncertain'), unique.length > 0 ? 'Bounded semantic relevance was validated and merged with deterministic matches.' : 'The bounded semantic filter found no existing Thesis dependency.')
  })
  return { impacts: classifications.flatMap((item) => item.matches), classifications }
}

export async function applyBoundedSemanticThesisFilter(findings: readonly EarningsFinding[], context: ThesisFilterContext | undefined, deterministicImpacts: readonly ThesisImpact[], executor?: ReasoningExecutor): Promise<{ readonly impacts: readonly ThesisImpact[]; readonly classifications: readonly ThesisFindingClassification[]; readonly reasoning: ThesisFilterReasoning }> {
  const usableContext = context ?? { theses: [], diagnostics: ['thesis_context_unavailable'], status: 'unavailable' as const }
  if (!executor || findings.length === 0 || usableContext.theses.length === 0) return { impacts: deterministicImpacts, classifications: fallbackClassifications(findings, deterministicImpacts), reasoning: baseReasoning({ fallbackUsed: true, diagnostic: !executor ? 'semantic_executor_unavailable' : 'thesis_context_unavailable' }) }
  const input = { findings, theses: usableContext.theses, deterministicMatches: deterministicImpacts }
  const request = { operation: OPERATION, instruction: 'Classify every finding against the bounded existing Thesis dependencies. Return only the declared decisions contract. Do not infer effect from numeric sign or magnitude.', input, outputContract: { decisions: 'one decision per findingId; matches use existing thesisRef and direct ReasoningEdge dependencyRefs (edgeRef values) only; effects supports|challenges|mixed|uncertain; rationale is required' } } as const
  let attempts = 0; let diagnostic: string | undefined
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const result = await executor.execute(request); const validated = validateSemanticOutput(result.output, findings, usableContext)
      if (validated.decisions) { const merged = mergeSemantic(findings, usableContext, deterministicImpacts, validated.decisions); return { ...merged, reasoning: baseReasoning({ called: true, validated: true, applied: true, repairAttempts: attempts }) } }
      diagnostic = validated.error
    } catch (error) { diagnostic = error instanceof Error ? error.message : String(error) }
    if (attempt === 0) attempts += 1
  }
  return { impacts: deterministicImpacts, classifications: fallbackClassifications(findings, deterministicImpacts), reasoning: baseReasoning({ called: true, validated: false, applied: true, fallbackUsed: true, repairAttempts: attempts, diagnostic }) }
}

export function buildEarningsValuationImpactAndThesisFilter(input: EarningsValuationImpactInput): EarningsValuationImpactAnalysis {
  const normalized = normalizeDetailed(input.expectationAnalysis); const valuationImpacts = buildValuationImpactBridges(normalized.findings); const thesisImpacts = filterThesisImpacts(normalized.findings, input.thesisContext); const classifications = fallbackClassifications(normalized.findings, thesisImpacts)
  return { findings: normalized.findings, valuationImpacts, thesisImpacts, thesisFindingClassifications: classifications, unmatchedFindingIds: classifications.filter((item) => item.matches.length === 0).map((item) => item.findingId), diagnostics: normalized.diagnostics, thesisContextStatus: input.thesisContext?.status ?? 'unavailable', thesisContextThesisCount: input.thesisContext?.theses.length ?? 0, thesisDependencyCount: input.thesisContext?.theses.reduce((sum, thesis) => sum + thesis.dependencies.length, 0) ?? 0, thesisFilterReasoning: baseReasoning() }
}

function appendSection(sections: readonly { readonly id: string; readonly title: string; readonly markdown: string; readonly sourceCandidateIds: readonly string[]; readonly assessmentRefs: readonly string[] }[], id: string, title: string, markdown: string, sourceCandidateIds: readonly string[]): typeof sections[number][] {
  const existing = sections.find((section) => section.id === id || section.title === title); if (existing) return sections.map((section) => section.id === existing.id ? { ...section, markdown: `${section.markdown}\n\n${markdown}`, sourceCandidateIds: sortedUnique([...section.sourceCandidateIds, ...sourceCandidateIds]) } : section)
  return [...sections, { id, title, markdown, sourceCandidateIds: sortedUnique(sourceCandidateIds), assessmentRefs: [] }]
}

export function enrichEarningsReviewSectionsWithValuationImpact(sections: readonly any[], analysis: EarningsValuationImpactAnalysis): readonly any[] {
  const valuation = analysis.valuationImpacts.length === 0 ? 'No verified expectation finding mapped to a valuation input.' : analysis.valuationImpacts.map((item) => `${item.findingId}: ${item.metric} ${item.fiscalPeriod}; affected inputs=${item.affectedValuationInputs.join(', ') || 'none'}; valuation refresh required=${item.requiresValuationRefresh ? 'yes' : 'no'}.`).join('\n')
  const thesis = analysis.thesisFindingClassifications.length === 0 ? 'No expectation findings were available for Thesis filtering.' : analysis.thesisFindingClassifications.map((item) => item.matches.length > 0 ? item.matches.map((match) => `${item.findingId}: classification=${item.classification}; Thesis=${match.thesisRef}; dependency=${match.dependencyRef}; criticality=${match.criticality}; effect=${match.effect}; rationale=${match.rationale}`).join('\n') : item.classification === 'thesis_irrelevant' ? `${item.findingId}: classification=thesis_irrelevant; No existing Thesis dependency was found by successful semantic classification.` : `${item.findingId}: classification=uncertain; Thesis relevance is uncertain; semantic resolution is unavailable or failed.`).join('\n')
  const sourceIds = analysis.findings.flatMap((finding) => finding.sourceCandidateIds)
  return appendSection(appendSection(sections, 'valuation_implications', 'Valuation Implications', valuation, sourceIds), 'thesis_impact', 'Thesis Impact', thesis, sourceIds)
}
