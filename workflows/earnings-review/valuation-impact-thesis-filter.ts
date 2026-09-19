import type { KnowledgeClaimV04, KnowledgeObservationV04, KnowledgeReasoningEdgeV04, KnowledgeThesisV04 } from '../../knowledge/schema/domain-v04.ts'
import type { EarningsExpectationAnalysis } from './expectations-contracts.ts'
import type { EarningsReviewSection } from '../../skills/earnings-review/contracts.ts'
import type { ReasoningRequest } from '../../plugins/reasoning/contracts.ts'
import type { EarningsFinding, EarningsFindingKind, EarningsValuationImpactAnalysis, EarningsValuationImpactInput, FindingDirection, ThesisFilterContext, ThesisFilterReasoning, ThesisImpact, ThesisImpactRelation, ValuationImpactBridge, ValuationInput } from './valuation-impact-thesis-filter-contracts.ts'

const text = (value: unknown): value is string => typeof value === 'string' && value.trim() !== ''
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)
const uniqueSorted = (values: readonly string[]): readonly string[] => [...new Set(values.filter(text).map((value) => value.trim()))].sort()
const safePart = (value: string): string => value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'unknown'

function metricKey(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase().replace(/^metric:/, '').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') : ''
}

function canonicalMetric(value: unknown): string {
  const key = metricKey(value)
  if (/^(?:revenue|sales|turnover)$/.test(key)) return 'revenue'
  if (/^(?:eps|net_profit|net_income|earnings|profit)$/.test(key)) return 'earnings'
  if (/^(?:gross_margin|operating_margin|ebitda_margin|net_margin|margin)$/.test(key)) return 'margin'
  if (/^(?:free_cash_flow|operating_cash_flow|cash_flow|fcf|ocf)$/.test(key)) return 'cash_flow'
  if (/^(?:growth|revenue_growth|earnings_growth|volume_growth)$/.test(key)) return 'growth'
  return key
}

function valueOf(object: unknown, keys: readonly string[]): unknown {
  if (!object || typeof object !== 'object') return undefined
  const record = object as Record<string, unknown>
  return keys.map((key) => record[key]).find((value) => value !== undefined)
}

function resultField(item: unknown, keys: readonly string[]): unknown { return valueOf((item as { result?: unknown } | undefined)?.result, keys) }
function nestedResultField(item: unknown, paths: readonly string[]): unknown { const result = (item as { result?: unknown } | undefined)?.result; return paths.map((path) => path.split('.').reduce<unknown>((current, key) => valueOf(current, [key]), result)).find((value) => value !== undefined) }
function sourceIds(item: unknown): readonly string[] { const raw = valueOf(item, ['sourceCandidateIds']); return uniqueSorted(Array.isArray(raw) ? raw : []) }
function periodOf(item: unknown): string { return String(resultField(item, ['fiscalPeriod', 'currentPeriod', 'period', 'expectationPeriod']) ?? valueOf(item, ['fiscalPeriod', 'currentPeriod', 'period']) ?? '') }
function metricOf(item: unknown): string { return String(resultField(item, ['metric']) ?? valueOf(item, ['metric']) ?? '') }
function directionOf(item: unknown, fallback: FindingDirection = 'mixed'): FindingDirection { return String(resultField(item, ['direction']) ?? nestedResultField(item, ['expectationComparison.direction', 'priorComparison.direction']) ?? fallback) as FindingDirection }
function numeric(item: unknown, keys: readonly string[]): number | undefined { const value = nestedResultField(item, keys); return finite(value) ? value : undefined }

function findingId(kind: EarningsFindingKind, item: unknown, index: number): string {
  const result = item as { result?: Record<string, unknown> }
  const value = result.result ?? item as Record<string, unknown>
  const identity = [value.metric, value.fiscalPeriod ?? value.currentPeriod, value.institutionKey, value.oldPublishedAt, value.newPublishedAt, value.guidanceId, value.oldGuidanceId, value.newGuidanceId, value.segmentKey].filter((part) => part !== undefined).map(String).map(safePart).join('-')
  return `expectation-finding-${kind}-${identity || index + 1}`
}

function summary(kind: EarningsFindingKind, metric: string, period: string, direction: FindingDirection): string {
  const labels: Record<EarningsFindingKind, string> = { actual_vs_consensus: 'Actual vs PIT consensus', actual_vs_prior_estimate: 'Actual vs selected prior estimate', estimate_revision: 'Estimate revision', guidance_revision: 'Guidance revision', guidance_vs_consensus: 'Guidance vs PIT consensus', segment_kpi_delta: 'Segment KPI delta' }
  return `${labels[kind]}: ${metric || 'unspecified metric'} ${period || 'unspecified period'} (${direction}).`
}

function addFinding(output: EarningsFinding[], kind: EarningsFindingKind, item: unknown, index: number, deltaKeys: readonly string[], direction: FindingDirection): void {
  const metric = metricOf(item); const fiscalPeriod = periodOf(item); const absoluteDelta = numeric(item, deltaKeys); const relativeDelta = numeric(item, ['relativeDelta', 'relativeRevision']); const unit = resultField(item, ['unit']) ?? valueOf(item, ['unit']);
  output.push({ findingId: findingId(kind, item, index), kind, metric, fiscalPeriod, ...(text(unit) ? { unit: String(unit) } : {}), direction, ...(absoluteDelta === undefined ? {} : { absoluteDelta }), ...(relativeDelta === undefined ? {} : { relativeDelta }), sourceCandidateIds: sourceIds(item), summary: summary(kind, metric, fiscalPeriod, direction) })
}

export function normalizeEarningsExpectationFindings(analysis: EarningsExpectationAnalysis): readonly EarningsFinding[] {
  const findings: EarningsFinding[] = []
  analysis.actualVsConsensus.forEach((item, index) => addFinding(findings, 'actual_vs_consensus', item, index, ['absoluteDelta'], directionOf(item)))
  analysis.actualVsPriorEstimate.forEach((item, index) => addFinding(findings, 'actual_vs_prior_estimate', item, index, ['absoluteDelta'], directionOf(item)))
  analysis.estimateRevisions.forEach((item, index) => addFinding(findings, 'estimate_revision', item, index, ['absoluteRevision'], directionOf(item, 'mixed')))
  analysis.guidanceRevisions.forEach((item, index) => {
    const low = numeric(item, ['lowEndRevision.absoluteRevision']); const high = numeric(item, ['highEndRevision.absoluteRevision']); const midpoint = numeric(item, ['midpointRevision.absoluteRevision']);
    const direction = midpoint !== undefined ? midpoint > 0 ? 'raised' : midpoint < 0 ? 'lowered' : 'in_line' : low !== undefined && high !== undefined && low >= 0 && high >= 0 ? 'raised' : 'mixed'
    addFinding(findings, 'guidance_revision', item, index, ['midpointRevision', 'absoluteRevision'], direction)
    void low; void high
  })
  analysis.guidanceVsConsensus.forEach((item, index) => addFinding(findings, 'guidance_vs_consensus', item, index, ['absoluteDelta'], directionOf(item)))
  analysis.segmentKpiDeltas.forEach((item, index) => addFinding(findings, 'segment_kpi_delta', item, index, ['currentValue', 'priorComparison.absoluteDelta', 'expectationComparison.absoluteDelta'], directionOf(item, 'mixed')))
  const deduped = new Map(findings.map((item) => [item.findingId, item]))
  return [...deduped.values()].sort((left, right) => left.findingId.localeCompare(right.findingId))
}

function affectedInputs(finding: EarningsFinding): readonly ValuationInput[] {
  const metric = canonicalMetric(finding.metric); const inputs = new Set<ValuationInput>()
  if (metric === 'revenue') inputs.add('revenue')
  else if (metric === 'earnings') inputs.add('earnings')
  else if (metric === 'margin') inputs.add('margin')
  else if (metric === 'cash_flow') inputs.add('cash_flow')
  else if (metric === 'growth') inputs.add('growth')
  else if (finding.kind === 'segment_kpi_delta' && /(asp|price)/i.test(finding.metric)) inputs.add('revenue')
  else if (finding.kind === 'segment_kpi_delta' && /(shipment|volume|capacity|utili[sz]ation)/i.test(finding.metric)) inputs.add('growth')
  return [...inputs].sort()
}

export function buildValuationImpactBridges(findings: readonly EarningsFinding[]): readonly ValuationImpactBridge[] {
  return findings.map((finding) => {
    const affected = affectedInputs(finding); const numericDelta = finding.absoluteDelta ?? finding.relativeDelta ?? null
    return { findingId: finding.findingId, metric: finding.metric, fiscalPeriod: finding.fiscalPeriod, surpriseOrRevision: numericDelta, affectedValuationInputs: affected, requiresValuationRefresh: affected.length > 0, rationale: affected.length > 0 ? `${finding.summary} affects ${affected.join(', ')} inputs; refresh is required before any valuation conclusion is reused.` : `${finding.summary} has no deterministic valuation-input mapping in W2-005; valuation arithmetic remains deferred to Valuation Workflow.`, rationaleRefs: uniqueSorted([...finding.sourceCandidateIds, finding.findingId]) }
  })
}

function structuredValue(object: Record<string, unknown>): Record<string, unknown> { return object.structuredValue && typeof object.structuredValue === 'object' ? object.structuredValue as Record<string, unknown> : {} }
function structuredMetric(object: Record<string, unknown>): string { const value = structuredValue(object); return String(object.metricRef ?? object.metric ?? value.metricRef ?? value.metric ?? '') }
function structuredPeriod(object: Record<string, unknown>): string { const value = structuredValue(object); return String(object.fiscalPeriod ?? object.period ?? value.fiscalPeriod ?? value.period ?? '') }
function objectText(object: Record<string, unknown>): string { const value = structuredValue(object); return [object.title, object.statement, object.name, object.metricRef, object.metric, object.fiscalPeriod, object.period, value.metricRef, value.metric, value.fiscalPeriod, value.period].filter(text).join(' ').toLowerCase() }
function metricRelevant(finding: EarningsFinding, dependency: Record<string, unknown>): boolean {
  const findingMetric = canonicalMetric(finding.metric); const dependencyMetric = canonicalMetric(structuredMetric(dependency)); const period = structuredPeriod(dependency); if (dependencyMetric && findingMetric && dependencyMetric !== findingMetric) return false
  if (period && finding.fiscalPeriod && period !== finding.fiscalPeriod) return false
  if (dependencyMetric && findingMetric && dependencyMetric === findingMetric) return true
  const haystack = objectText(dependency); const key = metricKey(finding.metric); return Boolean(key && (haystack.includes(key) || (key === 'eps' && /earnings|profit|eps/.test(haystack)) || (key === 'net_profit' && /earnings|profit|net income/.test(haystack))))
}

function directDependencies(context: ThesisFilterContext, thesis: KnowledgeThesisV04): readonly { dependency: KnowledgeClaimV04 | KnowledgeObservationV04; edge: KnowledgeReasoningEdgeV04 }[] {
  const byId = new Map<string, KnowledgeClaimV04 | KnowledgeObservationV04>([...context.claims, ...context.observations].map((item) => [item.id, item]))
  return context.reasoningEdges.filter((edge) => edge.targetRef === thesis.id && byId.has(edge.sourceRef)).map((edge) => ({ dependency: byId.get(edge.sourceRef)!, edge })).sort((left, right) => left.dependency.id.localeCompare(right.dependency.id) || left.edge.id.localeCompare(right.edge.id))
}

function relationFor(findings: readonly EarningsFinding[]): ThesisImpactRelation {
  const negative = findings.some((item) => ['below', 'lowered', 'down'].includes(item.direction)); const positive = findings.some((item) => ['above', 'raised', 'up'].includes(item.direction)); if (negative && !positive) return 'challenges_dependency'; if (positive && !negative) return 'supports_dependency'; return 'implicates_dependency'
}

export function filterThesisImpacts(findings: readonly EarningsFinding[], context: ThesisFilterContext | undefined): readonly ThesisImpact[] {
  if (context === undefined) return []
  const impacts: ThesisImpact[] = []
  for (const thesis of [...context.theses].sort((left, right) => left.id.localeCompare(right.id))) {
    for (const { dependency, edge } of directDependencies(context, thesis)) {
      const relevant = findings.filter((finding) => metricRelevant(finding, dependency as unknown as Record<string, unknown>)); if (relevant.length === 0) continue
      const dependencyStatement = 'statement' in dependency ? dependency.statement : `${dependency.observationType} ${dependency.metricRef}`
      const relation = relationFor(relevant)
      impacts.push({ thesisRef: thesis.id, thesisTitle: thesis.title, thesisStatus: thesis.status, dependencyRef: dependency.id, dependencyKind: dependency.id.startsWith('claim:') ? 'claim' : 'observation', dependencyStatement, reasoningEdgeRef: edge.id, reasoningEdgeType: edge.type, findingIds: relevant.map((item) => item.findingId).sort(), relation, rationale: `${relevant.map((item) => item.summary).join(' ')} This is a report-only implication of existing dependency ${dependency.id}; Thesis status and graph state are unchanged.` })
    }
  }
  return impacts.sort((left, right) => `${left.thesisRef}|${left.dependencyRef}|${left.reasoningEdgeRef}`.localeCompare(`${right.thesisRef}|${right.dependencyRef}|${right.reasoningEdgeRef}`))
}

export function buildEarningsValuationImpactAndThesisFilter(input: EarningsValuationImpactInput): EarningsValuationImpactAnalysis {
  const findings = normalizeEarningsExpectationFindings(input.expectationAnalysis); const valuationImpacts = buildValuationImpactBridges(findings); const thesisImpacts = filterThesisImpacts(findings, input.thesisContext); const implicated = new Set(thesisImpacts.flatMap((item) => item.findingIds));
  return { findings, valuationImpacts, thesisImpacts, unmatchedFindingIds: findings.map((item) => item.findingId).filter((id) => !implicated.has(id)), diagnostics: [], thesisFilterReasoning: { called: false, validated: true, applied: true, fallbackUsed: false, repairAttempts: 0, operation: 'earnings_expectation_thesis_filter' } }
}

function parseModelObject(value: unknown): Record<string, unknown> {
  if (typeof value === 'string') { const parsed = JSON.parse(value) as unknown; if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed as Record<string, unknown> }
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>
  throw new Error('thesis_filter_output_invalid')
}

function semanticImpacts(value: unknown, candidates: readonly ThesisImpact[]): readonly ThesisImpact[] {
  const object = parseModelObject(value); const raw = object.impacts ?? object.thesisImpacts; if (!Array.isArray(raw)) throw new Error('thesis_filter_impacts_invalid')
  const byKey = new Map(candidates.map((candidate) => [`${candidate.thesisRef}|${candidate.dependencyRef}|${candidate.reasoningEdgeRef}`, candidate])); const seen = new Set<string>(); const result: ThesisImpact[] = []
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') throw new Error('thesis_filter_impact_invalid')
    const item = entry as Record<string, unknown>; const thesisRef = String(item.thesisRef ?? ''); const dependencyRef = String(item.dependencyRef ?? ''); const edgeRef = String(item.reasoningEdgeRef ?? ''); const candidate = byKey.get(`${thesisRef}|${dependencyRef}|${edgeRef}`); const findingIds = Array.isArray(item.findingIds) ? uniqueSorted(item.findingIds) : []; const relation = item.relation; const rationale = item.rationale
    if (!candidate || seen.has(candidate.reasoningEdgeRef) || findingIds.length === 0 || !findingIds.every((id) => candidate.findingIds.includes(id)) || !['challenges_dependency', 'supports_dependency', 'implicates_dependency'].includes(String(relation)) || !text(rationale)) throw new Error('thesis_filter_impact_invalid')
    seen.add(candidate.reasoningEdgeRef); result.push({ ...candidate, findingIds, relation: relation as ThesisImpactRelation, rationale: String(rationale).trim().slice(0, 1_000) })
  }
  return result.sort((left, right) => `${left.thesisRef}|${left.dependencyRef}|${left.reasoningEdgeRef}`.localeCompare(`${right.thesisRef}|${right.dependencyRef}|${right.reasoningEdgeRef}`))
}

function thesisFilterRequest(candidates: readonly ThesisImpact[], findings: readonly EarningsFinding[], repair?: { readonly prior: unknown; readonly diagnostic: string }): ReasoningRequest {
  const allowedFindingIds = uniqueSorted(candidates.flatMap((candidate) => candidate.findingIds)); const request: Record<string, unknown> = { candidates: candidates.slice(0, 24).map((candidate) => ({ thesisRef: candidate.thesisRef, thesisTitle: candidate.thesisTitle, thesisStatus: candidate.thesisStatus, dependencyRef: candidate.dependencyRef, dependencyKind: candidate.dependencyKind, dependencyStatement: candidate.dependencyStatement, reasoningEdgeRef: candidate.reasoningEdgeRef, reasoningEdgeType: candidate.reasoningEdgeType, findingIds: candidate.findingIds })), findings: findings.filter((finding) => allowedFindingIds.includes(finding.findingId)).slice(0, 24).map((finding) => ({ findingId: finding.findingId, kind: finding.kind, metric: finding.metric, fiscalPeriod: finding.fiscalPeriod, direction: finding.direction, summary: finding.summary })), allowedThesisRefs: uniqueSorted(candidates.map((candidate) => candidate.thesisRef)), allowedDependencyRefs: uniqueSorted(candidates.map((candidate) => candidate.dependencyRef)), allowedReasoningEdgeRefs: uniqueSorted(candidates.map((candidate) => candidate.reasoningEdgeRef)), allowedFindingIds }
  if (repair !== undefined) request.repair = { attempt: 1, diagnostic: repair.diagnostic, priorInvalidOutput: typeof repair.prior === 'string' ? repair.prior.slice(0, 8_000) : JSON.stringify(repair.prior).slice(0, 8_000) }
  return { operation: 'earnings_expectation_thesis_filter', instruction: repair === undefined ? 'Filter the supplied eligible existing Thesis dependencies against verified expectation findings. Return only impacts that are materially implicated. Copy exact refs and finding IDs from the candidate allowlists. This is report-only: never change Thesis status and never create a Claim or ReasoningEdge.' : `Return a corrected replacement. Fix: ${repair.diagnostic}.`, input: request, outputContract: { type: 'object', required: ['impacts'], impacts: { type: 'array', maxItems: 12, item: { thesisRef: 'exact allowed Thesis ref', dependencyRef: 'exact allowed Claim or Observation ref', reasoningEdgeRef: 'exact allowed ReasoningEdge ref', findingIds: 'non-empty exact allowed finding IDs', relation: ['challenges_dependency', 'supports_dependency', 'implicates_dependency'], rationale: 'bounded non-empty text' } } }, metadata: { operationFamily: 'personal-research-v1', surface: 'earnings-review', purpose: 'report-only-thesis-filter' } } satisfies ReasoningRequest
}

export async function applyBoundedSemanticThesisFilter(candidates: readonly ThesisImpact[], executor: EarningsValuationImpactInput['reasoningExecutor'], findings: readonly EarningsFinding[] = []): Promise<{ readonly impacts: readonly ThesisImpact[]; readonly reasoning: ThesisFilterReasoning }> {
  if (candidates.length === 0) return { impacts: [], reasoning: { called: false, validated: true, applied: true, fallbackUsed: false, repairAttempts: 0, operation: 'earnings_expectation_thesis_filter' } }
  if (executor === undefined) return { impacts: candidates, reasoning: { called: false, validated: false, applied: true, fallbackUsed: true, repairAttempts: 0, operation: 'earnings_expectation_thesis_filter', diagnostic: 'reasoning_executor_unavailable' } }
  let prior: unknown
  let diagnostic = 'thesis_filter_output_invalid'
  try { const result = await executor.execute(thesisFilterRequest(candidates, findings)); prior = result.output; return { impacts: semanticImpacts(result.output, candidates), reasoning: { called: true, validated: true, applied: true, fallbackUsed: false, repairAttempts: 0, operation: 'earnings_expectation_thesis_filter' } } } catch { /* bounded repair below */ }
  try { const result = await executor.execute(thesisFilterRequest(candidates, findings, { prior, diagnostic })); return { impacts: semanticImpacts(result.output, candidates), reasoning: { called: true, validated: true, applied: true, fallbackUsed: false, repairAttempts: 1, operation: 'earnings_expectation_thesis_filter' } } } catch { return { impacts: candidates, reasoning: { called: true, validated: false, applied: true, fallbackUsed: true, repairAttempts: 1, operation: 'earnings_expectation_thesis_filter', diagnostic } } }
}

export const buildEarningsExpectationFindings = normalizeEarningsExpectationFindings
export const buildValuationImpactBridge = buildValuationImpactBridges

export type EarningsThesisFilterContext = ThesisFilterContext

function append(section: EarningsReviewSection, markdown: string, sourceCandidateIds: readonly string[]): EarningsReviewSection {
  return { ...section, markdown: `${section.markdown}${section.markdown.endsWith('\n') ? '' : '\n\n'}${markdown}`, sourceCandidateIds: uniqueSorted([...section.sourceCandidateIds, ...sourceCandidateIds]) }
}

function reportLines(values: readonly string[]): string { return values.length === 0 ? '' : values.map((value) => `- ${value}`).join('\n') }

export function enrichEarningsReviewSectionsWithValuationImpact(sections: readonly EarningsReviewSection[], analysis: EarningsValuationImpactAnalysis): readonly EarningsReviewSection[] {
  if (analysis.findings.length === 0) return sections
  const sourceCandidateIds = uniqueSorted(analysis.findings.flatMap((finding) => finding.sourceCandidateIds))
  const valuationLines = analysis.valuationImpacts.map((item) => `${item.metric || 'unspecified metric'} ${item.fiscalPeriod || 'unspecified period'}: affected inputs=${item.affectedValuationInputs.join(', ') || 'none'}; refresh=${item.requiresValuationRefresh ? 'required' : 'not mapped'}; ${item.rationale}`)
  const thesisLines = analysis.thesisImpacts.map((item) => `${item.thesisTitle} [${item.thesisStatus}] -> dependency ${item.dependencyRef} via ${item.reasoningEdgeRef} (${item.reasoningEdgeType}): ${item.relation}. ${item.rationale}`)
  const unmatched = analysis.unmatchedFindingIds.length > 0 ? `\n\n${analysis.unmatchedFindingIds.length} expectation finding(s) did not implicate an existing first-class Thesis dependency.` : ''
  return sections.map((section) => {
    if (section.title === 'Valuation Implications') {
      const withoutSentinel = { ...section, markdown: section.markdown.replace('Consensus unavailable', '').trim() }
      return append(withoutSentinel, `### Deterministic valuation-input bridge\n${reportLines(valuationLines)}\n\nNo target price, multiple, DCF value, or valuation assumption is calculated or changed by W2-005.`, sourceCandidateIds)
    }
    if (section.title === 'Thesis Impact') return append(section, `### Existing Thesis dependency filter\n${thesisLines.length > 0 ? reportLines(thesisLines) : 'No existing first-class Thesis dependency was implicated by the verified expectation findings.'}${unmatched}\n\nThis is report-only context; Thesis status, Claims, and ReasoningEdges are unchanged.`, sourceCandidateIds)
    return section
  })
}
