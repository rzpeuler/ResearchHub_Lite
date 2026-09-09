import assert from 'node:assert/strict'
import test from 'node:test'
import type { ReasoningCapabilities, ReasoningExecutor, ReasoningRequest, ReasoningResult } from '../../plugins/reasoning/contracts.ts'
import {
  EVENT_RESEARCH_SECTIONS,
  type EventEvidenceAssessmentInput,
  type EventEvidenceAssessmentOutput,
  type EventResearchSynthesisInput,
} from '../../skills/event-research/contracts.ts'
import {
  EventEvidenceAssessmentSkill,
  EventResearchSemanticError,
  EventResearchSynthesisSkill,
  buildEventOccurrenceProposal,
  deriveEventVerification,
  eventOccurrenceStructuredValue,
  hasUnsupportedNumericClaim,
  toEventResearchGatewayProposal,
  validateEventAssumptionUpdate,
  validateEventEvidenceAssessment,
  validateEventResearchSynthesis,
} from '../../skills/event-research/index.ts'

type Dict = Record<string, unknown>

const capabilities: ReasoningCapabilities = { maxContextTokens: 10_000, maxOutputTokens: 2_000, structuredOutputSupport: true, maxConcurrency: 1 }

class SequenceExecutor implements ReasoningExecutor {
  readonly requests: ReasoningRequest[] = []
  private index = 0
  constructor(private readonly outputs: readonly unknown[]) {}
  capabilities(): ReasoningCapabilities { return capabilities }
  async execute(request: ReasoningRequest): Promise<ReasoningResult> {
    this.requests.push(request)
    return { operation: request.operation, output: this.outputs[Math.min(this.index++, this.outputs.length - 1)] }
  }
}

function assessmentInput(): EventEvidenceAssessmentInput {
  return {
    company: { symbol: '600519', name: 'Fixture Company', exchange: 'SSE' },
    anchor: { kind: 'user_event', title: 'Material announcement', description: 'A bounded event for testing.', eventDate: '2026-09-08' },
    asOf: '2026-09-09T00:00:00.000Z',
    eventDate: '2026-09-08',
    sources: [
      { candidateId: 'official-1', title: 'Official disclosure', provider: 'cninfo', kind: 'official_disclosure', official: true, publishedAt: '2026-09-08T02:00:00.000Z', excerpt: 'The company announced the event.' },
      { candidateId: 'news-1', title: 'Independent report', provider: 'gdelt', kind: 'news', publishedAt: '2026-09-08T03:00:00.000Z', excerpt: 'An independent report corroborates the event.' },
    ],
  }
}

function validAssessment(): EventEvidenceAssessmentOutput {
  return {
    sourceAssessments: [
      { sourceCandidateId: 'official-1', verdict: 'supports', confidence: 0.98, rationale: 'Official disclosure directly describes the event.', evidenceRequirement: 'primary' },
      { sourceCandidateId: 'news-1', verdict: 'supports', confidence: 0.8, rationale: 'Independent reporting corroborates the event.', evidenceRequirement: 'corroborated' },
    ],
    verifiedFacts: [{ factId: 'fact-1', statement: 'The bounded event occurred.', sourceCandidateIds: ['official-1', 'news-1'], confidence: 0.95, evidenceRequirement: 'corroborated' }],
    contradictions: [],
  }
}

function synthesisInput(strongVerification = true): EventResearchSynthesisInput {
  const evidence = strongVerification ? validAssessment() : { ...validAssessment(), sourceAssessments: [validAssessment().sourceAssessments[1]!], verifiedFacts: [ { ...validAssessment().verifiedFacts[0]!, sourceCandidateIds: ['news-1'] } ] }
  return {
    company: assessmentInput().company,
    anchor: assessmentInput().anchor,
    eventFingerprint: 'event-fixture-1',
    eventDate: '2026-09-08',
    evidence,
    verification: deriveEventVerification(evidence, assessmentInput().sources),
    existingKnowledge: [{ canonicalRef: 'claim:assumption-1', claimType: 'assumption', statement: 'Demand growth assumption.', subjectRefs: ['entity:fixture'], structuredValue: { metric: 'demand_growth', value: 0.1, unit: 'ratio', comparator: 'eq', period: '2026-FY' } }],
    sources: assessmentInput().sources,
  }
}

function validSynthesis(overrides: Dict = {}): Dict {
  const sections = EVENT_RESEARCH_SECTIONS.map((title) => ({ sectionId: title.toLowerCase().replace(/[^a-z0-9]+/g, '-'), title, markdown: `Bounded interpretation for ${title}.`, sourceCandidateIds: title === 'Source & Evidence Map' ? ['official-1'] : [], existingKnowledgeRefs: title === 'Assumption Impact' ? ['claim:assumption-1'] : [], assessmentRefs: ['impact-1'] }))
  return {
    sections,
    assessments: [{ assessmentId: 'impact-1', disposition: 'changes_assumption', existingKnowledgeRefs: ['claim:assumption-1'], sourceCandidateIds: ['official-1'], rationale: 'The verified event changes the assumption.', directImpact: 'The direct effect is material.', secondOrderImpact: 'The second-order effect requires monitoring.' }],
    proposals: [{ proposalId: 'assumption-update', kind: 'claim', claimType: 'assumption', subjectKey: 'company', statement: 'Demand growth assumption is revised based on the verified event.', sourceCandidateIds: ['official-1'], existingKnowledgeRefs: ['claim:assumption-1'], assessmentRefs: ['impact-1'], structuredValue: { metric: 'demand_growth', value: 0.05, unit: 'ratio', comparator: 'eq', period: '2026-FY' } }],
    ...overrides,
  }
}

test('ER-SKILL-1 Stage A uses the exact sourceAssessments shape and allowlists', () => {
  const output = validateEventEvidenceAssessment(validAssessment(), assessmentInput())
  assert.deepEqual(Object.keys(output), ['sourceAssessments', 'verifiedFacts', 'contradictions'])
  assert.equal(output.sourceAssessments[0]?.verdict, 'supports')
  assert.throws(() => validateEventEvidenceAssessment({ ...validAssessment(), sourceAssessments: [{ ...validAssessment().sourceAssessments[0], verdict: 'inconclusive' }] }, assessmentInput()), EventResearchSemanticError)
  assert.throws(() => validateEventEvidenceAssessment({ ...validAssessment(), sourceAssessments: [{ ...validAssessment().sourceAssessments[0], confidence: Number.NaN }] }, assessmentInput()), EventResearchSemanticError)
  for (const confidence of [-0.01, 1.01, Number.POSITIVE_INFINITY]) assert.throws(() => validateEventEvidenceAssessment({ ...validAssessment(), sourceAssessments: [{ ...validAssessment().sourceAssessments[0], confidence }] }, assessmentInput()), EventResearchSemanticError)
})

test('ER-SKILL-1b Stage A rejects duplicate sources, oversized arrays, and malformed structured values', () => {
  const input = assessmentInput()
  const duplicateSources = [...input.sources, ...Array.from({ length: 10 }, (_, index) => ({ ...input.sources[1]!, candidateId: `extra-${index}` })), { ...input.sources[0]!, provider: 'gdelt', official: false }]
  assert.throws(() => deriveEventVerification(validAssessment(), duplicateSources), EventResearchSemanticError)
  assert.throws(() => validateEventEvidenceAssessment(validAssessment(), { ...input, sources: duplicateSources }), EventResearchSemanticError)
  assert.throws(() => validateEventEvidenceAssessment({ ...validAssessment(), sourceAssessments: Array.from({ length: 2_000 }, (_, index) => ({ ...validAssessment().sourceAssessments[0]!, sourceCandidateId: index % 2 === 0 ? 'official-1' : 'news-1' })) }, input), EventResearchSemanticError)
  assert.throws(() => validateEventEvidenceAssessment({ ...validAssessment(), verifiedFacts: Array.from({ length: 2_000 }, (_, index) => ({ ...validAssessment().verifiedFacts[0]!, factId: `fact-${index}` })) }, input), EventResearchSemanticError)
  assert.throws(() => validateEventEvidenceAssessment({ ...validAssessment(), contradictions: Array.from({ length: 2_000 }, () => ({ statement: 'Conflict.', sourceCandidateIds: ['news-1'] })) }, input), EventResearchSemanticError)
  for (const value of [{}, [], undefined, '15%']) assert.throws(() => validateEventEvidenceAssessment({ ...validAssessment(), verifiedFacts: [{ ...validAssessment().verifiedFacts[0]!, structuredValue: { metric: 'revenue', value, unit: 'ratio', comparator: 'eq' } }] }, input), EventResearchSemanticError)
  assert.doesNotThrow(() => validateEventEvidenceAssessment({ ...validAssessment(), verifiedFacts: [{ ...validAssessment().verifiedFacts[0]!, structuredValue: { metric: 'event_occurrence_fixture', value: true, unit: 'event', comparator: 'eq' } }] }, input))
  const occurrence = eventOccurrenceStructuredValue('event-fixture-1', '2026-09-08')
  assert.throws(() => validateEventEvidenceAssessment({ ...validAssessment(), verifiedFacts: [{ ...validAssessment().verifiedFacts[0]!, sourceCandidateIds: ['official-1', 'official-1'], structuredValue: occurrence }] }, input), EventResearchSemanticError)
  assert.throws(() => validateEventEvidenceAssessment({ ...validAssessment(), verifiedFacts: [{ ...validAssessment().verifiedFacts[0]!, sourceCandidateIds: ['source-forged'], structuredValue: occurrence }] }, input), EventResearchSemanticError)
  assert.throws(() => validateEventEvidenceAssessment({ ...validAssessment(), verifiedFacts: [{ ...validAssessment().verifiedFacts[0]!, structuredValue: { ...occurrence, metric: 'm'.repeat(97) } }] }, input), EventResearchSemanticError)
})

test('ER-SKILL-1c Stage A contracts describe structured values and fail closed on source metadata', async () => {
  const executor = new SequenceExecutor([validAssessment()])
  await new EventEvidenceAssessmentSkill(executor).assess(assessmentInput())
  const contract = executor.requests[0]?.outputContract as Dict
  const verifiedFacts = (contract.verifiedFacts as Dict).item as Dict
  const structuredValue = verifiedFacts.structuredValue as Dict
  assert.deepEqual(verifiedFacts.required, ['factId', 'statement', 'sourceCandidateIds', 'confidence', 'evidenceRequirement'])
  assert.deepEqual(structuredValue.required, ['metric', 'value', 'unit', 'comparator'])
  assert.equal((structuredValue.metric as Dict).maxLength, 96)
  assert.equal((structuredValue.period as Dict).maxLength, 96)
  assert.equal((structuredValue.value as Dict).maxLength, 1_200)
  const missingExecutor = new SequenceExecutor([validAssessment()])
  const fallback = await new EventEvidenceAssessmentSkill(missingExecutor).assess({ ...assessmentInput(), sources: [] })
  assert.equal(fallback.verification.strongVerification, false)
  assert.equal(missingExecutor.requests.length, 0)
  assert.throws(() => deriveEventVerification({ sourceAssessments: [], verifiedFacts: [], contradictions: [] }, [null as never]), EventResearchSemanticError)
})

test('ER-SKILL-2 Stage A accepts context and rejects forged source references', () => {
  const input = assessmentInput()
  const context = { ...validAssessment(), sourceAssessments: [{ sourceCandidateId: 'news-1', verdict: 'context' as const, confidence: 0.4, rationale: 'Context only.', evidenceRequirement: 'single_source' as const }] }
  assert.equal(validateEventEvidenceAssessment(context, input).sourceAssessments[0]?.verdict, 'context')
  const irrelevant = { ...context, sourceAssessments: [{ ...context.sourceAssessments[0]!, verdict: 'irrelevant' as const }] }
  assert.equal(validateEventEvidenceAssessment(irrelevant, input).sourceAssessments[0]?.verdict, 'irrelevant')
  assert.throws(() => validateEventEvidenceAssessment({ ...context, verifiedFacts: [{ ...context.verifiedFacts[0]!, sourceCandidateIds: ['forged'] }] }, input), EventResearchSemanticError)
  assert.throws(() => validateEventEvidenceAssessment({ ...context, contradictions: [{ statement: 'Conflict.', sourceCandidateIds: ['forged'] }] }, input), EventResearchSemanticError)
})

test('ER-SKILL-3 Stage A derives deterministic verification levels', () => {
  const input = assessmentInput()
  assert.equal(deriveEventVerification(validAssessment(), input.sources).verificationLevel, 'official_verified')
  const corroborated = { ...validAssessment(), sourceAssessments: validAssessment().sourceAssessments.map((item) => ({ ...item, sourceCandidateId: item.sourceCandidateId === 'official-1' ? 'news-1' : 'news-2' })), verifiedFacts: [{ ...validAssessment().verifiedFacts[0]!, sourceCandidateIds: ['news-1', 'news-2'] }] }
  assert.equal(deriveEventVerification(corroborated, [{ ...input.sources[1]!, candidateId: 'news-1' }, { ...input.sources[1]!, candidateId: 'news-2' }]).verificationLevel, 'corroborated')
  assert.equal(deriveEventVerification({ ...validAssessment(), sourceAssessments: [validAssessment().sourceAssessments[0]!] , contradictions: [{ statement: 'A conflicting account.', sourceCandidateIds: ['news-1'] }] }, input.sources).verificationLevel, 'conflicted')
  assert.equal(deriveEventVerification({ ...validAssessment(), sourceAssessments: [validAssessment().sourceAssessments[1]!] , contradictions: [] }, input.sources).verificationLevel, 'single_source')
  assert.equal(deriveEventVerification({ sourceAssessments: [], verifiedFacts: [], contradictions: [] }).verificationLevel, 'unverified')
})

test('ER-SKILL-3b verification never trusts empty or forged source sets', () => {
  const input = assessmentInput()
  const emptyEvidence = { sourceAssessments: [], verifiedFacts: [], contradictions: [] }
  assert.equal(deriveEventVerification(emptyEvidence, []).verificationLevel, 'unverified')
  assert.equal(deriveEventVerification(emptyEvidence, []).strongVerification, false)
  assert.throws(() => deriveEventVerification(validAssessment(), []), EventResearchSemanticError)
  assert.throws(() => deriveEventVerification({ ...validAssessment(), sourceAssessments: [{ ...validAssessment().sourceAssessments[0]!, sourceCandidateId: 'forged' }] }, input.sources), EventResearchSemanticError)
  assert.throws(() => deriveEventVerification({ ...validAssessment(), verifiedFacts: [{ ...validAssessment().verifiedFacts[0]!, sourceCandidateIds: ['forged'] }] }, input.sources), EventResearchSemanticError)
})

test('ER-SKILL-3c source catalogs are rejected before any truncating traversal', () => {
  const input = assessmentInput()
  const oversizedSources = Array.from({ length: 13 }, (_, index) => ({ ...input.sources[1]!, candidateId: `news-${index}` }))
  assert.throws(() => deriveEventVerification({ sourceAssessments: [], verifiedFacts: [], contradictions: [] }, oversizedSources), EventResearchSemanticError)
  assert.throws(() => validateEventEvidenceAssessment({ sourceAssessments: [], verifiedFacts: [], contradictions: [] }, { ...input, sources: oversizedSources }), EventResearchSemanticError)
})

test('ER-SKILL-4 Stage A makes at most one bounded repair attempt', async () => {
  const invalid = { sourceAssessments: [{ sourceCandidateId: 'forged', verdict: 'supports', confidence: 0.9, rationale: 'bad', evidenceRequirement: 'primary' }], verifiedFacts: [], contradictions: [] }
  const executor = new SequenceExecutor([invalid, validAssessment()])
  const result = await new EventEvidenceAssessmentSkill(executor).assess(assessmentInput())
  assert.equal(result.reasoning.repairAttempts, 1)
  assert.equal(result.reasoning.validated, true)
  assert.equal(executor.requests.length, 2)
  const repair = (executor.requests[1]?.input as Dict).repair as Dict
  assert.equal(repair.attempt, 1)
  assert.ok(repair.priorInvalidStructuredOutput)
  assert.deepEqual((executor.requests[1]?.input as Dict).allowedSourceCandidateIds, ['news-1', 'official-1'])
  assert.deepEqual((executor.requests[1]?.input as Dict).allowedVerdictValues, ['supports', 'contradicts', 'context', 'irrelevant'])
  assert.equal(JSON.stringify(repair).includes('stack'), false)
})

test('ER-SKILL-4b repair input bounds oversized hidden refs and model projections', async () => {
  const input: EventEvidenceAssessmentInput = { ...assessmentInput(), company: { ...assessmentInput().company, name: 'company '.repeat(2_000) }, anchor: { ...assessmentInput().anchor, description: 'anchor '.repeat(2_000) }, sources: assessmentInput().sources.map((source) => ({ ...source, title: 'title '.repeat(2_000), url: `https://example.test/${'u'.repeat(4_000)}`, excerpt: 'excerpt '.repeat(2_000) })) }
  const invalid = { sourceAssessments: [{ sourceCandidateId: 'forged', verdict: 'supports', confidence: 0.9, rationale: 'bad', evidenceRequirement: 'primary' }], verifiedFacts: [], contradictions: [], hiddenRef: 'secret '.repeat(20_000) }
  const executor = new SequenceExecutor([invalid, validAssessment()])
  await new EventEvidenceAssessmentSkill(executor).assess(input)
  const requestInput = executor.requests[0]?.input as Dict
  assert.equal(String((requestInput.company as Dict).name).length, 200)
  assert.ok(String((requestInput.anchor as Dict).description).length <= 1_500)
  assert.ok(String(((requestInput.sources as Dict[])[0]!).excerpt).length <= 1_500)
  const repair = (executor.requests[1]?.input as Dict).repair as Dict
  assert.ok(JSON.stringify(repair).length <= 12_000)
  assert.equal(JSON.stringify(repair).includes('secret '.repeat(1_000)), false)
})

test('ER-SKILL-5 Stage B validates exact sections, impacts, and structured assumption updates', () => {
  const output = validateEventResearchSynthesis(validSynthesis(), synthesisInput())
  assert.equal(output.sections.length, 16)
  assert.equal(output.proposals.length, 1)
  const existing = synthesisInput().existingKnowledge[0]!
  assert.equal(validateEventAssumptionUpdate({ existingClaimRef: existing.canonicalRef, structuredValue: output.proposals[0]!.structuredValue }, existing), true)
  assert.equal(validateEventAssumptionUpdate({ existingClaimRef: existing.canonicalRef, structuredValue: { ...(output.proposals[0]!.structuredValue as Dict), unit: 'percent' } }, existing), false)
  assert.equal(validateEventAssumptionUpdate({ existingClaimRef: existing.canonicalRef, structuredValue: { ...(output.proposals[0]!.structuredValue as Dict), value: '15%' } }, existing), false)
})

test('ER-SKILL-6 Stage B rejects forged refs, incompatible impacts, and over-broad proposals', () => {
  const input = synthesisInput()
  assert.throws(() => validateEventResearchSynthesis(validSynthesis({ proposals: [{ ...(validSynthesis().proposals as Dict[])[0], existingKnowledgeRefs: ['claim:forged'] }] }), input), EventResearchSemanticError)
  assert.throws(() => validateEventResearchSynthesis(validSynthesis({ proposals: [{ ...(validSynthesis().proposals as Dict[])[0], sourceCandidateIds: ['source-forged'] }] }), input), EventResearchSemanticError)
  assert.throws(() => validateEventResearchSynthesis(validSynthesis({ proposals: Array.from({ length: 5 }, (_, index) => ({ ...(validSynthesis().proposals as Dict[])[0], proposalId: `p-${index}` })) }), input), EventResearchSemanticError)
})

test('ER-SKILL-6b Stage B derives verification and rejects forged or inconsistent caller verification', () => {
  const input = synthesisInput()
  assert.throws(() => validateEventResearchSynthesis(validSynthesis(), { ...input, verification: { ...input.verification, strongVerification: false } }), EventResearchSemanticError)
  assert.throws(() => validateEventResearchSynthesis(validSynthesis(), { ...input, verification: { verificationLevel: 'corroborated', strongVerification: true, supportingSourceCandidateIds: ['official-1'], contradictingSourceCandidateIds: [] } }), EventResearchSemanticError)
  assert.throws(() => validateEventResearchSynthesis(validSynthesis(), { ...input, verification: { ...input.verification, supportingSourceCandidateIds: ['source-forged'] } }), EventResearchSemanticError)
  const forgedContradiction = { ...input, evidence: { ...input.evidence, contradictions: [{ statement: 'Forged contradiction.', sourceCandidateIds: ['source-forged'] }] } }
  assert.throws(() => validateEventResearchSynthesis(validSynthesis(), { ...forgedContradiction, verification: deriveEventVerification(forgedContradiction.evidence, input.sources) }), EventResearchSemanticError)
})

test('ER-SKILL-6d Stage B requires exact existing Claim refs by impact disposition', () => {
  const input = synthesisInput()
  const baseAssessment = (validSynthesis().assessments as Dict[])[0]!
  assert.throws(() => validateEventResearchSynthesis(validSynthesis({ assessments: [{ ...baseAssessment, existingKnowledgeRefs: [] }] }), input), EventResearchSemanticError)
  const thesisInput: EventResearchSynthesisInput = { ...input, existingKnowledge: [...input.existingKnowledge, { canonicalRef: 'claim:thesis-1', claimType: 'thesis', statement: 'Existing thesis.' }] }
  assert.throws(() => validateEventResearchSynthesis(validSynthesis({ assessments: [{ ...baseAssessment, disposition: 'affects_thesis', existingKnowledgeRefs: ['claim:thesis-1'] }] }), thesisInput), EventResearchSemanticError)
  assert.throws(() => validateEventResearchSynthesis(validSynthesis({ assessments: [{ ...baseAssessment, disposition: 'supports_existing', existingKnowledgeRefs: [] }] }), input), EventResearchSemanticError)
})

test('ER-SKILL-6e Stage B rejects oversized assessments and reference arrays before traversal', () => {
  const input = synthesisInput()
  const oversizedAssessments = Array.from({ length: 2_000 }, (_, index) => ({ ...(validSynthesis().assessments as Dict[])[0]!, assessmentId: `impact-${index}` }))
  assert.throws(() => validateEventResearchSynthesis(validSynthesis({ assessments: oversizedAssessments }), input), EventResearchSemanticError)
  const largeRefs = (validSynthesis().sections as Dict[]).map((section) => ({ ...section, sourceCandidateIds: Array.from({ length: 2_000 }, () => 'official-1') }))
  assert.throws(() => validateEventResearchSynthesis(validSynthesis({ sections: largeRefs }), input), EventResearchSemanticError)
  const duplicateSectionIds = (validSynthesis().sections as Dict[]).map((section) => ({ ...section, sectionId: 'same-section' }))
  assert.throws(() => validateEventResearchSynthesis(validSynthesis({ sections: duplicateSectionIds }), input), EventResearchSemanticError)
  const executor = new SequenceExecutor([validSynthesis()])
  return new EventResearchSynthesisSkill(executor).synthesize(input).then(() => {
    const contract = executor.requests[0]?.outputContract as Dict
    assert.equal(((contract.sections as Dict).maxItems), 16)
    assert.equal(((contract.assessments as Dict).maxItems), 12)
    assert.equal((((contract.sections as Dict).item as Dict).sourceCandidateIds as Dict).maxItems, 12)
    assert.deepEqual(((contract.sections as Dict).item as Dict).required, ['sectionId', 'title', 'markdown', 'sourceCandidateIds', 'existingKnowledgeRefs', 'assessmentRefs'])
    assert.deepEqual(((contract.assessments as Dict).item as Dict).required, ['assessmentId', 'impactType', 'basis', 'direction', 'materiality', 'timeHorizon', 'existingKnowledgeRefs', 'sourceCandidateIds', 'rationale', 'causalChain'])
    assert.deepEqual(((contract.proposals as Dict).item as Dict).required, ['proposalId', 'kind', 'claimType', 'subjectKey', 'statement', 'sourceCandidateIds', 'existingKnowledgeRefs', 'assessmentRefs'])
    assert.deepEqual((((contract.proposals as Dict).item as Dict).claimType as Dict).enum, ['viewpoint', 'risk', 'catalyst', 'assumption'])
    assert.deepEqual((((contract.proposals as Dict).item as Dict).structuredValue as Dict).required, ['metric', 'value', 'unit', 'comparator'])
  })
})

test('ER-SKILL-6c Stage B request receives bounded supporting and contradicting source excerpts', async () => {
  const sources = assessmentInput().sources
  const evidence = { ...validAssessment(), sourceAssessments: [{ ...validAssessment().sourceAssessments[0]!, verdict: 'supports' as const }, { ...validAssessment().sourceAssessments[1]!, verdict: 'contradicts' as const }], contradictions: [{ statement: 'The independent account conflicts.', sourceCandidateIds: ['news-1'] }] }
  const input: EventResearchSynthesisInput = { ...synthesisInput(), sources, evidence, verification: deriveEventVerification(evidence, sources), supportingSourceExcerpts: [{ ...sources[0]!, excerpt: 'support '.repeat(1_000) }], contradictingSourceExcerpts: [{ ...sources[1]!, excerpt: 'contradiction '.repeat(1_000) }] }
  const executor = new SequenceExecutor([validSynthesis()])
  await new EventResearchSynthesisSkill(executor).synthesize(input)
  const requestInput = executor.requests[0]?.input as Dict
  const supporting = requestInput.supportingSourceExcerpts as Dict[]
  const contradicting = requestInput.contradictingSourceExcerpts as Dict[]
  assert.equal(supporting[0]?.candidateId, 'official-1')
  assert.equal(contradicting[0]?.candidateId, 'news-1')
  assert.ok(String(supporting[0]?.excerpt).length <= 1_500)
  assert.ok(String(contradicting[0]?.excerpt).length <= 1_500)
  assert.equal('content' in (supporting[0] ?? {}), false)
})

test('ER-SKILL-7 unsupported numeric claims fail closed while event occurrence values are deterministic', () => {
  assert.equal(hasUnsupportedNumericClaim('The event changed the outlook by 15%.'), true)
  assert.equal(hasUnsupportedNumericClaim('The event was recorded on 2026-09-08.'), false)
  assert.deepEqual(eventOccurrenceStructuredValue('event-fixture-1', '2026-09-08'), { metric: 'event_occurrence_event-fixture-1', value: true, unit: 'event', comparator: 'eq', period: '2026-09-08' })
  assert.equal('semanticKey' in buildEventOccurrenceProposal('event-fixture-1', '2026-09-08', ['official-1']), false)
  assert.throws(() => eventOccurrenceStructuredValue('entity:forged', '2026-09-08'), TypeError)
  assert.throws(() => eventOccurrenceStructuredValue('event-fixture-1', '2026-99-99'), TypeError)
  assert.equal(hasUnsupportedNumericClaim('Metric 2026 is material.'), true)
  assert.equal(hasUnsupportedNumericClaim('Ticker 123456 is material.'), true)
  assert.equal(hasUnsupportedNumericClaim('Ticker 600519 is material.', [], ['600519']), false)
  assert.deepEqual(eventOccurrenceStructuredValue('event-fixture-1', '0001-01-01').period, '0001-01-01')
  assert.deepEqual(eventOccurrenceStructuredValue('event-fixture-1', '0099-12-31').period, '0099-12-31')
  assert.throws(() => eventOccurrenceStructuredValue('event-fixture-1', '0001-02-29'), TypeError)
  assert.throws(() => eventOccurrenceStructuredValue('event-fixture-1', '0000-01-01'), TypeError)
})

test('ER-SKILL-7c proposal dates require authoritative dates and bounded structured values', () => {
  const input = synthesisInput()
  const baseProposal = (validSynthesis().proposals as Dict[])[0]!
  assert.equal(hasUnsupportedNumericClaim('The event was recorded on 2026-09-08.', [], [], ['2026-09-08']), false)
  assert.equal(hasUnsupportedNumericClaim('The event was recorded on 2099-01-01.', [], [], ['2026-09-08']), true)
  assert.throws(() => validateEventResearchSynthesis(validSynthesis({ proposals: [{ ...baseProposal, statement: 'The event is scheduled for 2099-01-01.' }] }), input), EventResearchSemanticError)
  assert.throws(() => validateEventResearchSynthesis(validSynthesis({ proposals: [{ ...baseProposal, structuredValue: { ...(baseProposal.structuredValue as Dict), metric: 'm'.repeat(97) } }] }), input), EventResearchSemanticError)
  assert.throws(() => validateEventResearchSynthesis(validSynthesis({ proposals: [{ ...baseProposal, structuredValue: { ...(baseProposal.structuredValue as Dict), fiscalPeriod: 'FY2026' } }] }), input), EventResearchSemanticError)
  assert.throws(() => validateEventResearchSynthesis(validSynthesis({ proposals: [{ ...baseProposal, structuredValue: { ...(baseProposal.structuredValue as Dict), period: '2099-01-01' } }] }), input), EventResearchSemanticError)
  assert.throws(() => validateEventResearchSynthesis(validSynthesis(), { ...input, sources: undefined }), EventResearchSemanticError)
})

test('ER-SKILL-7b Gateway conversion returns only the canonical proposal shape', () => {
  const proposal = (validSynthesis().proposals as Dict[])[0]!
  const converted = toEventResearchGatewayProposal(proposal as never)
  assert.deepEqual(converted, { proposalId: 'assumption-update', kind: 'claim', claimType: 'assumption', subjectKey: 'company', statement: 'Demand growth assumption is revised based on the verified event.', sourceCandidateIds: ['official-1'], structuredValue: { metric: 'demand_growth', value: 0.05, unit: 'ratio', comparator: 'eq', period: '2026-FY' } })
  assert.equal('semanticKey' in converted, false)
  assert.equal('existingKnowledgeRefs' in converted, false)
  assert.equal('assessmentRefs' in converted, false)
})

test('ER-SKILL-8 weak verification returns a report contract with no durable proposals', () => {
  const weakSynthesis = validSynthesis({ sections: (validSynthesis().sections as Dict[]).map((section) => ({ ...section, sourceCandidateIds: (section.sourceCandidateIds as string[]).filter((id) => id === 'news-1') })), assessments: [{ ...(validSynthesis().assessments as Dict[])[0], sourceCandidateIds: ['news-1'] }] })
  const output = validateEventResearchSynthesis(weakSynthesis, synthesisInput(false))
  assert.equal(output.sections.length, 16)
  assert.equal(output.proposals.length, 0)
})

test('ER-SKILL-9 Stage B repair is bounded and invalid output falls back safely', async () => {
  const invalid = validSynthesis({ proposals: [{ ...(validSynthesis().proposals as Dict[])[0], sourceCandidateIds: ['forged'] }] })
  const executor = new SequenceExecutor([invalid, invalid])
  const result = await new EventResearchSynthesisSkill(executor).synthesize(synthesisInput())
  assert.equal(result.reasoning.repairAttempts, 1)
  assert.equal(result.reasoning.fallbackUsed, true)
  assert.equal(result.output.proposals.length, 0)
  assert.equal(executor.requests.length, 2)
})
