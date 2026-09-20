import assert from 'node:assert/strict'
import test from 'node:test'
import type { EarningsExpectationAnalysis } from '../../workflows/earnings-review/expectations-contracts.ts'
import { applyBoundedSemanticThesisFilter, buildEarningsValuationImpactAndThesisFilter, enrichEarningsReviewSectionsWithValuationImpact, normalizeEarningsExpectationFindingsDetailed } from '../../workflows/earnings-review/valuation-impact-thesis-filter.ts'
import { projectEarningsThesisContext } from '../../workflows/earnings-review/workflow.ts'
import type { ThesisFilterContext } from '../../workflows/earnings-review/valuation-impact-thesis-filter-contracts.ts'
import type { KnowledgeAssetV04 } from '../../knowledge/schema/domain-v04.ts'

const analysis = (overrides: Partial<EarningsExpectationAnalysis> = {}): EarningsExpectationAnalysis => ({ consensusStatus: 'available', actualVsConsensus: [{ result: { metric: 'eps', fiscalPeriod: 'FY2026', actual: 9, benchmark: 10, absoluteDelta: -1, relativeDelta: -0.1, direction: 'below', benchmarkType: 'consensus' }, sourceCandidateIds: ['consensus-source'] }], actualVsPriorEstimate: [], estimateRevisions: [], guidanceRevisions: [], guidanceVsConsensus: [], segmentKpiDeltas: [], currentGuidance: [], diagnostics: [], ...overrides })
const context: ThesisFilterContext = { status: 'available', diagnostics: [], theses: [{ thesisRef: 'thesis:compounding', title: 'Durable earnings compounding', statement: 'Earnings compound if execution remains stable.', status: 'active', truncated: false, dependencies: [{ edgeRef: 'reasoning-edge:eps', edgeType: 'depends_on', sourceRef: 'claim:eps', sourceKind: 'claim', statement: 'FY2026 EPS remains resilient.', claimType: 'assumption', metric: 'eps', fiscalPeriod: 'FY2026', unit: 'CNY' }, { edgeRef: 'reasoning-edge:revenue', edgeType: 'supports', sourceRef: 'claim:revenue', sourceKind: 'claim', metric: 'revenue', fiscalPeriod: 'FY2026' }] }] }
const executor = (output: unknown, calls: { count: number } = { count: 0 }) => ({ capabilities: () => ({ maxContextTokens: 2_000, maxOutputTokens: 2_000, structuredOutputSupport: true, maxConcurrency: 1 }), execute: async () => { calls.count += 1; return { operation: 'earnings_expectation_thesis_filter' as const, output } } })
const priorComparison = (institutionKey: string, benchmark: number, sourceCandidateIds: readonly string[] = [`${institutionKey}-source`]) => ({ result: { metric: 'eps', fiscalPeriod: 'FY2026', actual: 9, benchmark, absoluteDelta: 9 - benchmark, direction: benchmark > 9 ? 'below' as const : 'above' as const, benchmarkType: 'prior_estimate' as const }, sourceCandidateIds, institutionKey })

test('prior-estimate institution identity is preserved, including equal values and input order', () => {
  const make = (items: readonly ReturnType<typeof priorComparison>[]) => normalizeEarningsExpectationFindingsDetailed(analysis({ actualVsConsensus: [], actualVsPriorEstimate: items })).findings
  const distinct = make([priorComparison('broker-a', 10), priorComparison('broker-b', 11)])
  const equal = make([priorComparison('broker-a', 10), priorComparison('broker-b', 10)])
  const reversed = make([priorComparison('broker-b', 10), priorComparison('broker-a', 10)])
  assert.equal(distinct.length, 2)
  assert.equal(equal.length, 2)
  assert.deepEqual(equal.map((item) => item.findingId), reversed.map((item) => item.findingId))
  assert.deepEqual(equal.map((item) => item.institutionKey), ['broker-a', 'broker-b'])
})

test('prior-estimate finding without explicit institution identity fails closed', () => {
  const result = normalizeEarningsExpectationFindingsDetailed(analysis({ actualVsConsensus: [], actualVsPriorEstimate: [{ result: priorComparison('broker-a', 10).result, sourceCandidateIds: ['source'] }] }))
  assert.equal(result.findings.length, 0)
  assert.ok(result.diagnostics.includes('finding_missing_institution_identity:actual_vs_prior_estimate'))
})

test('exact duplicate Findings union source provenance deterministically', () => {
  const make = (items: readonly string[][]) => normalizeEarningsExpectationFindingsDetailed(analysis({ actualVsPriorEstimate: [], actualVsConsensus: items.map((sourceCandidateIds) => ({ result: { metric: 'eps', fiscalPeriod: 'FY2026', actual: 9, benchmark: 10, absoluteDelta: -1, direction: 'below' as const, benchmarkType: 'consensus' as const }, sourceCandidateIds })) })).findings
  const first = make([['source-a'], ['source-b']])
  const reversed = make([['source-b'], ['source-a']])
  assert.equal(first.length, 1)
  assert.deepEqual(first[0]?.sourceCandidateIds, ['source-a', 'source-b'])
  assert.deepEqual(first, reversed)
})

test('explicit valuation map is closed and zero delta does not require refresh', () => {
  const a = analysis({ actualVsConsensus: [{ result: { metric: 'metric:revenue', fiscalPeriod: 'FY2026', actual: 100, benchmark: 100, absoluteDelta: 0, direction: 'in_line', benchmarkType: 'consensus' }, sourceCandidateIds: ['s'] }], actualVsPriorEstimate: [{ result: { metric: 'shipment', fiscalPeriod: 'FY2026', actual: 1, benchmark: 2, absoluteDelta: -1, direction: 'below', benchmarkType: 'prior_estimate' }, sourceCandidateIds: ['s'], institutionKey: 'broker-a' }, { result: { metric: 'ASP', fiscalPeriod: 'FY2026', actual: 1, benchmark: 2, absoluteDelta: -1, direction: 'below', benchmarkType: 'prior_estimate' }, sourceCandidateIds: ['s'], institutionKey: 'broker-b' }] })
  const result = buildEarningsValuationImpactAndThesisFilter({ expectationAnalysis: a })
  assert.equal(result.findings.length, 3)
  assert.deepEqual(result.valuationImpacts.map((item) => item.affectedValuationInputs), [['revenue'], [], []])
  assert.equal(result.valuationImpacts[0]?.requiresValuationRefresh, false)
  assert.equal(result.valuationImpacts[1]?.requiresValuationRefresh, false)
  assert.equal(result.valuationImpacts[2]?.requiresValuationRefresh, false)
  assert.doesNotMatch(JSON.stringify(result), /target price|DCF value|multiple =/i)
})

test('guidance boundary and bounded dimensions drive refresh without collapsing dimensions', () => {
  const result = buildEarningsValuationImpactAndThesisFilter({ expectationAnalysis: analysis({ guidanceRevisions: [{ result: { metric: 'revenue', fiscalPeriod: 'FY2026', unit: 'CNY', oldGuidanceId: 'old', newGuidanceId: 'new', oldGuidanceType: 'range', newGuidanceType: 'range', oldPublishedAt: '2026-01-01', newPublishedAt: '2026-02-01', lowEndRevision: { oldValue: 10, newValue: 11, absoluteRevision: 1 }, midpointRevision: { oldValue: 12, newValue: 12, absoluteRevision: 0 } }, sourceCandidateIds: ['g'] }], guidanceVsConsensus: [{ result: { metric: 'revenue', fiscalPeriod: 'FY2026', unit: 'CNY', guidanceId: 'new', guidanceType: 'range', guidancePublishedAt: '2026-02-01', consensusAsOf: '2026-02-01', consensusMean: 15, relationship: 'below_range' }, sourceCandidateIds: ['g'] }] }) })
  const revisions = result.findings.find((item) => item.kind === 'guidance_revision')!
  assert.deepEqual(revisions.deterministicDeltas.map((item) => item.dimension), ['low', 'midpoint'])
  assert.equal(result.valuationImpacts.find((item) => item.findingId === revisions.findingId)?.requiresValuationRefresh, true)
  assert.equal(result.valuationImpacts.find((item) => item.metric === 'revenue' && item.findingId !== revisions.findingId)?.requiresValuationRefresh, true)
})

test('segment findings use prior and expectation deltas, never currentValue as an economic delta', () => {
  const result = normalizeEarningsExpectationFindingsDetailed(analysis({ actualVsConsensus: [], segmentKpiDeltas: [{ result: { segmentKey: 'cloud', metric: 'revenue', unit: 'CNY', currentPeriod: 'FY2026', currentValue: 999, priorPeriod: 'FY2025', priorComparison: { benchmark: 10, actual: 12, absoluteDelta: 2, direction: 'above' }, expectationPeriod: 'FY2026', expectationComparison: { benchmark: 20, actual: 18, absoluteDelta: -2, direction: 'below' } }, sourceCandidateIds: ['segment'] }] }))
  assert.deepEqual(result.findings.map((item) => [item.kind, item.deterministicDeltas[0]?.absoluteDelta]), [['segment_kpi_expectation', -2], ['segment_kpi_prior', 2]])
  assert.doesNotMatch(JSON.stringify(result.findings), /999/)
})

test('finding identities are order-independent and reject collisions without index fallback', () => {
  const first = analysis(); const second = analysis({ actualVsConsensus: [...first.actualVsConsensus].reverse() })
  assert.deepEqual(normalizeEarningsExpectationFindingsDetailed(first).findings.map((item) => item.findingId), normalizeEarningsExpectationFindingsDetailed(second).findings.map((item) => item.findingId))
  const collision = normalizeEarningsExpectationFindingsDetailed(analysis({ actualVsConsensus: [{ result: { metric: 'eps', fiscalPeriod: 'FY2026', actual: 9, benchmark: 10, absoluteDelta: -1, direction: 'below', benchmarkType: 'consensus' }, sourceCandidateIds: ['a'] }, { result: { metric: 'eps', fiscalPeriod: 'FY2026', actual: 8, benchmark: 10, absoluteDelta: -2, direction: 'below', benchmarkType: 'consensus' }, sourceCandidateIds: ['b'] }] }))
  assert.equal(collision.findings.length, 0)
  assert.ok(collision.diagnostics.some((item) => item.startsWith('finding_identity_collision:')))
})

test('deterministic Thesis matching is exact, one-hop, and effect remains uncertain', () => {
  const result = buildEarningsValuationImpactAndThesisFilter({ expectationAnalysis: analysis(), thesisContext: context })
  assert.equal(result.thesisImpacts.length, 1)
  assert.equal(result.thesisImpacts[0]?.dependencyRef, 'claim:eps')
  assert.equal(result.thesisImpacts[0]?.criticality, 'load_bearing')
  assert.equal(result.thesisImpacts[0]?.effect, 'uncertain')
  assert.equal(result.thesisImpacts[0]?.relation, 'implicates_dependency')
})

test('Thesis context projection is bounded, lifecycle-filtered, and schema-neutral', () => {
  const objects = [
    { id: 'thesis:eligible', subjectRefs: ['entity:company'], title: 'Eligible', statement: 'Statement', status: 'active', lifecycle: { status: 'active' }, createdAt: '2026-01-01' },
    { id: 'thesis:archived', subjectRefs: ['entity:company'], title: 'Archived', statement: 'Do not use', status: 'archived', lifecycle: { status: 'active' }, createdAt: '2026-01-01' },
    { id: 'claim:metric', subjectRefs: ['entity:company'], claimType: 'assumption', statement: 'EPS dependency', structuredValue: { metric: 'eps', fiscalPeriod: 'FY2026', unit: 'CNY' }, sourceRefs: [], lifecycle: { status: 'active' } },
    { id: 'reasoning-edge:metric', type: 'depends_on', sourceRef: 'claim:metric', targetRef: 'thesis:eligible', lifecycle: { status: 'active' } },
  ] as unknown as KnowledgeAssetV04[]
  const projected = projectEarningsThesisContext('entity:company', objects)
  assert.equal(projected.status, 'available')
  assert.deepEqual(projected.theses.map((item) => item.thesisRef), ['thesis:eligible'])
  assert.deepEqual(Object.keys(projected.theses[0] ?? {}).sort(), ['dependencies', 'statement', 'status', 'thesisRef', 'title', 'truncated'].sort())
  assert.equal(projected.theses[0]?.dependencies[0]?.metric, 'eps')
})

test('direct cross-entity Claim and Observation dependencies project without multi-hop traversal', () => {
  const objects = [
    { id: 'thesis:company', subjectRefs: ['entity:company'], title: 'Company Thesis', statement: 'Company statement', status: 'active', lifecycle: { status: 'active' }, createdAt: '2026-01-01' },
    { id: 'claim:industry', subjectRefs: ['entity:industry'], claimType: 'fact', statement: 'Industry demand supports the company.', structuredValue: { metric: 'revenue', fiscalPeriod: 'FY2026', unit: 'CNY' }, sourceRefs: [], lifecycle: { status: 'active' } },
    { id: 'observation:product', observationType: 'metric', subjectRef: 'entity:product', metricRef: 'eps', value: 9, period: 'FY2026', unit: 'CNY', sourceRef: 'source:x', lifecycle: { status: 'active' } },
    { id: 'claim:inactive', subjectRefs: ['entity:industry'], claimType: 'fact', statement: 'Inactive source', structuredValue: { metric: 'margin', fiscalPeriod: 'FY2026', unit: '%' }, sourceRefs: [], lifecycle: { status: 'inactive' } },
    { id: 'claim:unrelated', subjectRefs: ['entity:industry'], claimType: 'fact', statement: 'No edge', structuredValue: { metric: 'cash_flow', fiscalPeriod: 'FY2026', unit: 'CNY' }, sourceRefs: [], lifecycle: { status: 'active' } },
    { id: 'reasoning-edge:industry-support', type: 'supports', sourceRef: 'claim:industry', targetRef: 'thesis:company', lifecycle: { status: 'active' } },
    { id: 'reasoning-edge:product-challenge', type: 'challenges', sourceRef: 'observation:product', targetRef: 'thesis:company', lifecycle: { status: 'active' } },
    { id: 'reasoning-edge:inactive-source', type: 'invalidates', sourceRef: 'claim:inactive', targetRef: 'thesis:company', lifecycle: { status: 'active' } },
    { id: 'reasoning-edge:inactive-edge', type: 'supports', sourceRef: 'claim:unrelated', targetRef: 'thesis:company', lifecycle: { status: 'inactive' } },
    { id: 'reasoning-edge:claim-hop', type: 'supports', sourceRef: 'claim:industry', targetRef: 'claim:unrelated', lifecycle: { status: 'active' } },
  ] as unknown as KnowledgeAssetV04[]
  const projected = projectEarningsThesisContext('entity:company', objects)
  assert.deepEqual(projected.theses[0]?.dependencies.map((item) => item.edgeRef), ['reasoning-edge:industry-support', 'reasoning-edge:product-challenge'])
  assert.equal(projected.theses[0]?.dependencies.some((item) => item.sourceRef === 'claim:inactive'), false)
  assert.equal(projected.theses[0]?.dependencies.some((item) => item.sourceRef === 'claim:unrelated'), false)
})

test('all findings enter semantic filtering and valid output can add textual dependency matches', async () => {
  const boundedContext: ThesisFilterContext = { ...context, theses: [{ ...context.theses[0]!, dependencies: [{ ...context.theses[0]!.dependencies[0]!, metric: undefined, fiscalPeriod: undefined }] }] }
  const base = buildEarningsValuationImpactAndThesisFilter({ expectationAnalysis: analysis({ actualVsConsensus: [], guidanceVsConsensus: [{ result: { metric: 'shipment', fiscalPeriod: 'FY2026', unit: 'state', guidanceId: 'g', guidanceType: 'point', guidancePublishedAt: '2026-01-01', consensusAsOf: '2026-01-01', consensusMean: 1, relationship: 'at_point' }, sourceCandidateIds: ['s'] }] }), thesisContext: boundedContext })
  const findingId = base.findings[0]!.findingId
  const filtered = await applyBoundedSemanticThesisFilter(base.findings, boundedContext, base.thesisImpacts, executor({ decisions: [{ findingId, matches: [{ thesisRef: 'thesis:compounding', dependencyRefs: ['reasoning-edge:eps'], effect: 'challenges', rationale: 'The finding concerns the existing dependency.' }], unresolved: false }] }))
  assert.equal(filtered.classifications[0]?.classification, 'thesis_critical')
  assert.equal(filtered.impacts[0]?.effect, 'challenges')
})

test('validated semantic effect enriches the same deterministic edge without changing code-owned criticality', async () => {
  const base = buildEarningsValuationImpactAndThesisFilter({ expectationAnalysis: analysis(), thesisContext: context })
  for (const effect of ['supports', 'challenges'] as const) {
    const filtered = await applyBoundedSemanticThesisFilter(base.findings, context, base.thesisImpacts, executor({ decisions: [{ findingId: base.findings[0]!.findingId, matches: [{ thesisRef: 'thesis:compounding', dependencyRefs: ['reasoning-edge:eps'], effect, rationale: `Validated ${effect} effect.` }], unresolved: false }] }))
    assert.equal(filtered.impacts[0]?.reasoningEdgeRef, 'reasoning-edge:eps')
    assert.equal(filtered.impacts[0]?.effect, effect)
    assert.equal(filtered.impacts[0]?.criticality, 'load_bearing')
    assert.equal(filtered.classifications[0]?.classification, 'thesis_critical')
    assert.equal(filtered.classifications[0]?.unresolved, false)
  }
})

test('semantic omission or no-relation cannot delete deterministic relevance', async () => {
  const base = buildEarningsValuationImpactAndThesisFilter({ expectationAnalysis: analysis(), thesisContext: context })
  for (const matches of [[], [{ thesisRef: 'thesis:compounding', dependencyRefs: [], effect: 'uncertain' as const, rationale: 'No additional relation was resolved.' }]]) {
    const filtered = await applyBoundedSemanticThesisFilter(base.findings, context, base.thesisImpacts, executor({ decisions: [{ findingId: base.findings[0]!.findingId, matches, unresolved: false }] }))
    assert.equal(filtered.impacts.length, 1)
    assert.equal(filtered.impacts[0]?.reasoningEdgeRef, 'reasoning-edge:eps')
    assert.equal(filtered.impacts[0]?.effect, 'uncertain')
    assert.equal(filtered.classifications[0]?.classification, 'thesis_critical')
    assert.equal(filtered.classifications[0]?.unresolved, true)
  }
})

test('edge-level semantic dependency identity keeps same-source edges distinct and rejects wrong references', async () => {
  const edgeContext: ThesisFilterContext = { ...context, theses: [{ ...context.theses[0]!, dependencies: [...context.theses[0]!.dependencies, { ...context.theses[0]!.dependencies[0]!, edgeRef: 'reasoning-edge:eps-alt', edgeType: 'invalidates' }] }] }
  const base = buildEarningsValuationImpactAndThesisFilter({ expectationAnalysis: analysis(), thesisContext: edgeContext })
  assert.equal(base.thesisImpacts.length, 2)
  const refined = await applyBoundedSemanticThesisFilter(base.findings, edgeContext, base.thesisImpacts, executor({ decisions: [{ findingId: base.findings[0]!.findingId, matches: [{ thesisRef: 'thesis:compounding', dependencyRefs: ['reasoning-edge:eps'], effect: 'supports', rationale: 'Only the first edge is supported.' }], unresolved: false }] }))
  assert.equal(refined.impacts.length, 2)
  assert.equal(refined.impacts.find((item) => item.reasoningEdgeRef === 'reasoning-edge:eps')?.effect, 'supports')
  assert.equal(refined.impacts.find((item) => item.reasoningEdgeRef === 'reasoning-edge:eps-alt')?.effect, 'uncertain')
  const calls = { count: 0 }
  const invalid = await applyBoundedSemanticThesisFilter(base.findings, edgeContext, base.thesisImpacts, executor({ decisions: [{ findingId: base.findings[0]!.findingId, matches: [{ thesisRef: 'thesis:compounding', dependencyRefs: ['claim:eps'], effect: 'supports', rationale: 'Source refs are not edge refs.' }], unresolved: false }] }, calls))
  assert.equal(calls.count, 2)
  assert.equal(invalid.reasoning.fallbackUsed, true)
  assert.equal(invalid.impacts.every((item) => item.effect === 'uncertain'), true)
  const otherThesisContext: ThesisFilterContext = { ...edgeContext, theses: [...edgeContext.theses, { thesisRef: 'thesis:other', title: 'Other', statement: 'Other', status: 'active', truncated: false, dependencies: [{ ...edgeContext.theses[0]!.dependencies[0]!, edgeRef: 'reasoning-edge:other' }] }] }
  const otherBase = buildEarningsValuationImpactAndThesisFilter({ expectationAnalysis: analysis(), thesisContext: otherThesisContext })
  const wrongThesis = await applyBoundedSemanticThesisFilter(otherBase.findings, otherThesisContext, otherBase.thesisImpacts, executor({ decisions: [{ findingId: otherBase.findings[0]!.findingId, matches: [{ thesisRef: 'thesis:other', dependencyRefs: ['reasoning-edge:eps'], effect: 'supports', rationale: 'Wrong Thesis edge.' }], unresolved: false }] }))
  assert.equal(wrongThesis.reasoning.fallbackUsed, true)
})

test('invalid semantic output gets one repair and then fail-closed uncertainty', async () => {
  const calls = { count: 0 }; const base = buildEarningsValuationImpactAndThesisFilter({ expectationAnalysis: analysis(), thesisContext: context })
  const filtered = await applyBoundedSemanticThesisFilter(base.findings, context, base.thesisImpacts, executor({ decisions: [{ findingId: 'invented', matches: [], unresolved: false }] }, calls))
  assert.equal(calls.count, 2)
  assert.equal(filtered.reasoning.repairAttempts, 1)
  assert.equal(filtered.reasoning.fallbackUsed, true)
  assert.equal(filtered.classifications[0]?.classification, 'thesis_critical')
  assert.equal(filtered.classifications[0]?.unresolved, true)
})

test('successful semantic no-relation is the only route to irrelevant; unavailable executor is uncertain', async () => {
  const noMatchContext: ThesisFilterContext = { ...context, theses: [{ ...context.theses[0]!, dependencies: [{ ...context.theses[0]!.dependencies[0]!, metric: undefined, fiscalPeriod: undefined }] }] }
  const base = buildEarningsValuationImpactAndThesisFilter({ expectationAnalysis: analysis(), thesisContext: noMatchContext })
  const noRelation = await applyBoundedSemanticThesisFilter(base.findings, noMatchContext, base.thesisImpacts, executor({ decisions: [{ findingId: base.findings[0]!.findingId, matches: [], unresolved: false }] }))
  assert.equal(noRelation.classifications[0]?.classification, 'thesis_irrelevant')
  const fallback = await applyBoundedSemanticThesisFilter(base.findings, noMatchContext, base.thesisImpacts)
  assert.equal(fallback.classifications[0]?.classification, 'uncertain')
  assert.equal(fallback.classifications[0]?.unresolved, true)
})

test('report enrichment is report-only and contains no directional valuation conclusion', () => {
  const result = buildEarningsValuationImpactAndThesisFilter({ expectationAnalysis: analysis(), thesisContext: context })
  const sections = enrichEarningsReviewSectionsWithValuationImpact([{ id: 'valuation-implications', title: 'Valuation Implications', markdown: 'Consensus unavailable', sourceCandidateIds: [], assessmentRefs: [] }, { id: 'thesis-impact', title: 'Thesis Impact', markdown: 'No change.', sourceCandidateIds: [], assessmentRefs: [] }], result)
  assert.match(sections[0]!.markdown, /affected inputs=earnings/)
  assert.match(sections[1]!.markdown, /claim:eps/)
  assert.doesNotMatch(JSON.stringify(sections), /target price|DCF value|multiple =|status =/i)
})
