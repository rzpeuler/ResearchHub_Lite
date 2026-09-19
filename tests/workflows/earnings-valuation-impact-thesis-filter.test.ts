import assert from 'node:assert/strict'
import test from 'node:test'
import type { KnowledgeClaimV04, KnowledgeReasoningEdgeV04, KnowledgeThesisV04 } from '../../knowledge/schema/domain-v04.ts'
import type { EarningsExpectationAnalysis } from '../../workflows/earnings-review/expectations-contracts.ts'
import { applyBoundedSemanticThesisFilter, buildEarningsValuationImpactAndThesisFilter, enrichEarningsReviewSectionsWithValuationImpact } from '../../workflows/earnings-review/valuation-impact-thesis-filter.ts'

const analysis = (overrides: Partial<EarningsExpectationAnalysis> = {}): EarningsExpectationAnalysis => ({ consensusStatus: 'available', actualVsConsensus: [{ result: { metric: 'eps', fiscalPeriod: 'FY2026', actual: 9, benchmark: 10, absoluteDelta: -1, relativeDelta: -0.1, direction: 'below', benchmarkType: 'consensus' }, sourceCandidateIds: ['consensus-source'] }], actualVsPriorEstimate: [], estimateRevisions: [], guidanceRevisions: [], guidanceVsConsensus: [], segmentKpiDeltas: [], currentGuidance: [], diagnostics: [], ...overrides })

const thesis = { id: 'thesis:compounding', subjectRefs: ['entity:company'], title: 'Durable earnings compounding', statement: 'The company can compound earnings if execution remains stable.', status: 'active', createdAt: '2026-09-01T00:00:00.000Z', lifecycle: { status: 'active' } } as KnowledgeThesisV04
const claim = { id: 'claim:eps-dependency', subjectRefs: ['entity:company'], claimType: 'assumption', statement: 'FY2026 EPS remains resilient.', sourceRefs: ['source:expectation'], lifecycle: { status: 'active' } } as KnowledgeClaimV04
const edge = { id: 'reasoning-edge:eps-dependency', type: 'depends_on', sourceRef: claim.id, targetRef: thesis.id, lifecycle: { status: 'active' } } as KnowledgeReasoningEdgeV04

test('W2-005 normalizes expectation findings and maps EPS to earnings without valuation arithmetic', () => {
  const result = buildEarningsValuationImpactAndThesisFilter({ expectationAnalysis: analysis() })
  assert.equal(result.findings.length, 1)
  assert.deepEqual(result.valuationImpacts[0]?.affectedValuationInputs, ['earnings'])
  assert.equal(result.valuationImpacts[0]?.requiresValuationRefresh, true)
  assert.equal(result.valuationImpacts[0]?.surpriseOrRevision, -1)
  assert.doesNotMatch(JSON.stringify(result), /target price|multiple =|DCF value/i)
})

test('W2-005 filters only first-class Thesis dependencies through existing ReasoningEdges', () => {
  const result = buildEarningsValuationImpactAndThesisFilter({ expectationAnalysis: analysis(), thesisContext: { theses: [thesis], claims: [claim], observations: [], reasoningEdges: [edge] } })
  assert.equal(result.thesisImpacts.length, 1)
  assert.equal(result.thesisImpacts[0]?.thesisRef, thesis.id)
  assert.equal(result.thesisImpacts[0]?.dependencyRef, claim.id)
  assert.equal(result.thesisImpacts[0]?.relation, 'challenges_dependency')
  assert.deepEqual(result.thesisImpacts[0]?.findingIds, [result.findings[0]?.findingId])
})

test('W2-005 enriches only report sections and never mutates Thesis or creates graph objects', () => {
  const result = buildEarningsValuationImpactAndThesisFilter({ expectationAnalysis: analysis(), thesisContext: { theses: [thesis], claims: [claim], observations: [], reasoningEdges: [edge] } })
  const sections = enrichEarningsReviewSectionsWithValuationImpact([{ id: 'valuation-implications', title: 'Valuation Implications', markdown: 'Consensus unavailable', sourceCandidateIds: [], assessmentRefs: [] }, { id: 'thesis-impact', title: 'Thesis Impact', markdown: 'No change.', sourceCandidateIds: [], assessmentRefs: [] }], result)
  assert.match(sections[0]!.markdown, /affected inputs=earnings/)
  assert.match(sections[0]!.markdown, /No target price/)
  assert.match(sections[1]!.markdown, /claim:eps-dependency/)
  assert.equal(result.thesisImpacts[0]?.thesisStatus, 'active')
  assert.equal(result.thesisImpacts[0]?.reasoningEdgeRef, edge.id)
})

test('W2-005 semantic Thesis filter is bounded to deterministic first-class candidates', async () => {
  const base = buildEarningsValuationImpactAndThesisFilter({ expectationAnalysis: analysis(), thesisContext: { theses: [thesis], claims: [claim], observations: [], reasoningEdges: [edge] } })
  const candidate = base.thesisImpacts[0]!
  const executor = {
    capabilities: () => ({ maxContextTokens: 1_000, maxOutputTokens: 1_000, structuredOutputSupport: true, maxConcurrency: 1 }),
    execute: async () => ({ operation: 'earnings_expectation_thesis_filter' as const, output: { impacts: [{ thesisRef: candidate.thesisRef, dependencyRef: candidate.dependencyRef, reasoningEdgeRef: candidate.reasoningEdgeRef, findingIds: candidate.findingIds, relation: 'challenges_dependency', rationale: 'The verified EPS miss implicates the existing EPS dependency.' }] } }),
  }
  const filtered = await applyBoundedSemanticThesisFilter(base.thesisImpacts, executor)
  assert.equal(filtered.reasoning.operation, 'earnings_expectation_thesis_filter')
  assert.equal(filtered.reasoning.applied, true)
  assert.equal(filtered.reasoning.fallbackUsed, false)
  assert.equal(filtered.impacts.length, 1)
})
