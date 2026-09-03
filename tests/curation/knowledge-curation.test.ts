import test from 'node:test'
import assert from 'node:assert/strict'
import type { StructuredDocument } from '../../plugins/document/contracts.ts'
import { buildCurationSchemaContext } from '../../skills/knowledge-curation/schema-context.ts'
import { buildUnderstandAndPlanOutputContract, buildExtractKnowledgeOutputContract, buildResolveSemanticCaseOutputContract } from '../../skills/knowledge-curation/output-contracts.ts'
import { UNDERSTAND_AND_PLAN_PROMPT } from '../../skills/knowledge-curation/prompts/understand-and-plan.ts'
import { KnowledgeCurationSkill } from '../../skills/knowledge-curation/skill.ts'
import { KnowledgeCurationError } from '../../skills/knowledge-curation/errors.ts'
import { MockReasoningExecutor } from '../../plugins/reasoning/mock/executor.ts'

const capabilities = { maxContextTokens: 1000, maxOutputTokens: 500, structuredOutputSupport: true, maxConcurrency: 1 }
const document: StructuredDocument = {
  documentId: 'doc-1', parser: { id: 'test' }, metadata: { originalFilename: 'test.txt', mediaType: 'text/plain' }, normalizedText: 'Alpha makes Beta.',
  sections: [{ sectionId: 'section-1', title: 'Overview', level: 1, parentSectionRef: null, blockRefs: ['block-1', 'block-2'], pageStart: null, pageEnd: null }],
  blocks: [
    { blockId: 'block-1', type: 'paragraph', text: 'Alpha makes Beta.', sectionRef: 'section-1', page: null, locator: { page: null }, order: 0 },
    { blockId: 'block-2', type: 'paragraph', text: 'Beta is a product.', sectionRef: 'section-1', page: null, locator: { page: null }, order: 1 },
  ],
  stats: { pageCount: null, sectionCount: 1, blockCount: 2, normalizedCharacters: 18, tableCount: 0, headingCount: 0, listCount: 0, captionCount: 0 }, warnings: [],
}
const refs = [{ kind: 'block', blockId: 'block-1' }] as const
const reportMap = { sourceAssessment: { summary: 'Direct test source' }, researchScope: 'Products', majorTopics: [{ topicId: 'topic-1', label: 'Products', evidenceRefs: refs }], majorEntityMentions: [], majorConclusions: [], sectionSemantics: [{ sectionRef: 'section-1', summary: 'Overview' }], semanticDependencies: [], themeHypotheses: [], uncertainty: [] }
const unit = { proposedUnitId: 'unit-1', topic: 'Products', semanticPurpose: 'Extract product relationships', primaryRefs: refs, contextRefs: [{ kind: 'block', blockId: 'block-2' }] as const }

test('Schema Context exposes only active slices and derives relation constraints', () => {
  const context = buildCurationSchemaContext('knowledge_extraction')
  assert.deepEqual(context.entityTypes, ['investment_theme', 'industry', 'company', 'product', 'technology'])
  const substitute = context.relationContracts.find((item) => item.relationType === 'substitutes_for')
  assert.equal(substitute?.endpointConstraint, 'same_entity_type_on_both_sides')
  assert.throws(() => buildCurationSchemaContext('schema_gap' as never))
})

test('understandAndPlan validates typed document references and projects the full document only there', async () => {
  const response = { reportMap, extractionPlanProposal: { units: [unit], excludedRefs: [] } }
  const executor = new MockReasoningExecutor({ capabilities, responses: { understandAndPlan: response } })
  const skill = new KnowledgeCurationSkill({ executor })
  const result = await skill.understandAndPlan({ document })
  assert.equal(result.extractionPlanProposal.units[0]?.proposedUnitId, 'unit-1')
  assert.equal((executor.calls[0]?.input as { document: StructuredDocument }).document.blocks.length, 2)
  const prepared = executor.calls[0]?.input as { capabilities: typeof capabilities; schemaContext: { slice: string } }
  assert.deepEqual(prepared.capabilities, capabilities)
  assert.equal(prepared.schemaContext.slice, 'understand_and_plan')
})

test('understandAndPlan requires exhaustive excludedRefs and accepts an empty list', async () => {
  const missing = { reportMap, extractionPlanProposal: { units: [unit] } }
  const missingExecutor = new MockReasoningExecutor({ capabilities, responses: { understandAndPlan: missing } })
  await assert.rejects(() => new KnowledgeCurationSkill({ executor: missingExecutor }).understandAndPlan({ document }), (error: unknown) => error instanceof KnowledgeCurationError && error.code === 'invalid_model_output' && error.message.includes('excludedRefs'))
  const validExecutor = new MockReasoningExecutor({ capabilities, responses: { understandAndPlan: { reportMap, extractionPlanProposal: { units: [unit], excludedRefs: [] } } } })
  const valid = await new KnowledgeCurationSkill({ executor: validExecutor }).understandAndPlan({ document })
  assert.deepEqual(valid.extractionPlanProposal.excludedRefs, [])
})

test('understandAndPlan contract and prompt require exhaustive primary/excluded coverage', () => {
  const contract = buildUnderstandAndPlanOutputContract(buildCurationSchemaContext('understand_and_plan'))
  const root = contract.schema.properties as Record<string, { required?: readonly string[] }>
  const plan = root.extractionPlanProposal
  assert.deepEqual(plan.required, ['units', 'excludedRefs'])
  assert.match(UNDERSTAND_AND_PLAN_PROMPT, /EXHAUSTIVE/)
  assert.match(UNDERSTAND_AND_PLAN_PROMPT, /ContextRefs do not satisfy primary coverage/)
  assert.match(UNDERSTAND_AND_PLAN_PROMPT, /excludedRefs even when it is empty/)
})

test('plan repair input preserves the previous output, feedback, and attempt', async () => {
  const response = { reportMap, extractionPlanProposal: { units: [unit], excludedRefs: [] } }
  const executor = new MockReasoningExecutor({ capabilities, responses: { understandAndPlan: response } })
  const previousOutput = structuredClone(response) as never
  const repair = { previousOutput, feedback: { code: 'uncovered_content' as const, message: 'Repair uncovered content', uncoveredRefs: [{ kind: 'block' as const, blockId: 'block-2' }] }, attempt: 2 }
  await new KnowledgeCurationSkill({ executor }).understandAndPlan({ document, planRepair: repair })
  const prepared = executor.calls[0]?.input as { planRepair: typeof repair }
  assert.deepEqual(prepared.planRepair, repair)
})

test('extractKnowledge isolates invalid, ungrounded, and dependent candidates', async () => {
  const response = {
    entities: [
      { candidateId: 'alpha', entityType: 'company', name: 'Alpha', evidenceBlockRefs: ['block-1'], reason: 'named' },
      { candidateId: 'product-beta', entityType: 'product', name: 'Beta', evidenceBlockRefs: ['block-1'], reason: 'named' },
      { candidateId: 'entity:invented', entityType: 'company', name: 'Bad', evidenceBlockRefs: ['block-1'], reason: 'bad' },
      { candidateId: 'context-only', entityType: 'company', name: 'Context', evidenceBlockRefs: ['block-2'], reason: 'not primary' },
    ],
    relations: [
      { candidateId: 'offers', relationType: 'offers_product', source: { candidateRef: 'alpha', mention: 'Alpha' }, target: { candidateRef: 'product-beta', mention: 'Beta' }, evidenceBlockRefs: ['block-1'], reason: 'statement' },
      { candidateId: 'dependent-bad', relationType: 'offers_product', source: { candidateRef: 'entity:invented', mention: 'Bad' }, target: { candidateRef: 'product-beta', mention: 'Beta' }, evidenceBlockRefs: ['block-1'], reason: 'bad' },
    ],
    claims: [{ candidateId: 'claim-1', claimType: 'fact', statement: 'Alpha makes Beta.', subjectRefs: [{ candidateRef: 'alpha', mention: 'Alpha' }], evidenceBlockRefs: ['block-1'], reason: 'direct statement' }],
  }
  const executor = new MockReasoningExecutor({ capabilities, responses: { extractKnowledge: response } })
  const result = await new KnowledgeCurationSkill({ executor }).extractKnowledge({ document, reportMap, unit })
  assert.deepEqual(result.entities.map((item) => item.candidateId), ['alpha', 'product-beta'])
  assert.deepEqual(result.relations.map((item) => item.candidateId), ['offers'])
  assert.deepEqual(result.claims.map((item) => item.candidateId), ['claim-1'])
  assert.equal(result.rejected.length, 3)
  assert.ok(result.rejected.some((item) => item.code === 'ungrounded_candidate'))
  assert.ok(result.rejected.some((item) => item.code === 'invalid_reference'))
})

test('semanticFields recursively reject durable canonical namespace values', async () => {
  const response = { entities: [{ candidateId: 'alpha', entityType: 'company', name: 'Alpha', semanticFields: { nested: { durable: 'entity:already-canonical' } }, evidenceBlockRefs: ['block-1'], reason: 'named' }], relations: [], claims: [] }
  const executor = new MockReasoningExecutor({ capabilities, responses: { extractKnowledge: response } })
  const result = await new KnowledgeCurationSkill({ executor }).extractKnowledge({ document, reportMap, unit })
  assert.equal(result.entities.length, 0)
  assert.equal(result.rejected[0]?.code, 'invalid_reference')
})

test('skill rejects invalid JSON from a non-native structured-output host without retrying', async () => {
  const executor = new MockReasoningExecutor({ capabilities: { ...capabilities, structuredOutputSupport: false }, responses: { extractKnowledge: 'not json' } })
  await assert.rejects(() => new KnowledgeCurationSkill({ executor }).extractKnowledge({ document, reportMap, unit }), (error: unknown) => error instanceof KnowledgeCurationError && error.code === 'invalid_model_output')
  assert.equal(executor.calls.length, 1)
})

test('resolveSemanticCase validates a bounded EntityBinding outcome', async () => {
  const executor = new MockReasoningExecutor({ capabilities, responses: { resolveSemanticCase: { outcome: 'equivalent_to', targetAlias: 'existing-001', rationale: 'The bounded evidence identifies the same company.' } } })
  const skill = new KnowledgeCurationSkill({ executor })
  const result = await skill.resolveSemanticCase({ resolutionCase: { caseId: 'case-1', caseKind: 'EntityBindingCase', candidateProjection: { name: 'Alpha' }, existingProjections: [{ alias: 'existing-001', projection: { name: 'Alpha Corporation' } }], evidence: [], sourceContext: {}, schemaContextSlice: {}, allowedOutcomes: ['equivalent_to', 'distinct_from_all', 'uncertain'] } })
  assert.equal(result.outcome, 'equivalent_to')
  assert.equal(result.targetAlias, 'existing-001')
})

test('resolveSemanticCase rejects an unsupported mutation vocabulary', async () => {
  const executor = new MockReasoningExecutor({ capabilities, responses: { resolveSemanticCase: { outcome: 'create', rationale: 'not a semantic outcome' } } })
  await assert.rejects(() => new KnowledgeCurationSkill({ executor }).resolveSemanticCase({ resolutionCase: { caseId: 'case-1', caseKind: 'ClaimConflictCase', candidateProjection: {}, existingProjections: [{ alias: 'existing-001', projection: {} }], evidence: [], sourceContext: {}, schemaContextSlice: {}, allowedOutcomes: ['equivalent', 'supersedes', 'coexists', 'contradicts', 'invalid', 'uncertain'] } }), (error: unknown) => error instanceof KnowledgeCurationError && error.code === 'invalid_semantics')
})

test('resolveSemanticCase rejects durable IDs and writer fields', async () => {
  const executor = new MockReasoningExecutor({ capabilities, responses: { resolveSemanticCase: { outcome: 'distinct_from_all', rationale: 'new', caseId: 'entity:secret' } } })
  await assert.rejects(() => new KnowledgeCurationSkill({ executor }).resolveSemanticCase({ resolutionCase: { caseId: 'case-1', caseKind: 'EntityBindingCase', candidateProjection: {}, existingProjections: [], evidence: [], sourceContext: {}, schemaContextSlice: {}, allowedOutcomes: ['equivalent_to', 'distinct_from_all', 'uncertain'] } }), (error: unknown) => error instanceof KnowledgeCurationError && error.code === 'invalid_reference')
})

test('resolveSemanticCase rejects embedded durable canonical and RawRef tokens but accepts ordinary words', async () => {
  for (const rationale of ['This appears related to entity:company-test.', 'This mentions claim:test.', 'Evidence came from source:test.', `Evidence came from raw-sha256-${'a'.repeat(64)}.`]) {
    const executor = new MockReasoningExecutor({ capabilities, responses: { resolveSemanticCase: { outcome: 'uncertain', rationale } } })
    await assert.rejects(() => new KnowledgeCurationSkill({ executor }).resolveSemanticCase({ resolutionCase: { caseId: 'case-embedded', caseKind: 'EntityBindingCase', candidateProjection: {}, existingProjections: [], evidence: [], sourceContext: {}, schemaContextSlice: {}, allowedOutcomes: ['equivalent_to', 'distinct_from_all', 'uncertain'] } }), (error: unknown) => error instanceof KnowledgeCurationError && error.code === 'invalid_reference')
  }
  const executor = new MockReasoningExecutor({ capabilities, responses: { resolveSemanticCase: { outcome: 'uncertain', rationale: 'This ordinary entity source claim prose is safe.' } } })
  const result = await new KnowledgeCurationSkill({ executor }).resolveSemanticCase({ resolutionCase: { caseId: 'case-words', caseKind: 'EntityBindingCase', candidateProjection: {}, existingProjections: [], evidence: [], sourceContext: {}, schemaContextSlice: {}, allowedOutcomes: ['equivalent_to', 'distinct_from_all', 'uncertain'] } })
  assert.equal(result.outcome, 'uncertain')
})

test('every operation derives trusted Schema Context internally and ignores caller-shaped overrides', async () => {
  const executor = new MockReasoningExecutor({ capabilities, responses: { extractKnowledge: { entities: [], relations: [], claims: [] } } })
  const shapedOverride = { slice: 'knowledge_extraction', relationContracts: [{ relationType: 'offers_product', allowedSourceTypes: ['industry'], allowedTargetTypes: ['industry'] }] }
  await new KnowledgeCurationSkill({ executor }).extractKnowledge({ document, reportMap, unit, ...({ schemaContext: shapedOverride } as Record<string, unknown>) })
  const request = executor.calls[0]?.input as { schemaContext: { relationContracts: readonly { relationType: string; allowedSourceTypes: readonly string[] }[] } }
  const offers = request.schemaContext.relationContracts.find((item) => item.relationType === 'offers_product')
  assert.deepEqual(offers?.allowedSourceTypes, ['company'])
})

test('relations outside Schema 0.3 and relations with invalid endpoint types remain rejected', async () => {
  const executor = new MockReasoningExecutor({ capabilities, responses: { extractKnowledge: {
    entities: [
      { candidateId: 'industry', entityType: 'industry', name: 'Industry', evidenceBlockRefs: ['block-1'], reason: 'named' },
      { candidateId: 'product', entityType: 'product', name: 'Product', evidenceBlockRefs: ['block-1'], reason: 'named' },
    ],
    relations: [
      { candidateId: 'not-schema', relationType: 'not_schema', source: { candidateRef: 'industry', mention: 'Industry' }, target: { candidateRef: 'product', mention: 'Product' }, evidenceBlockRefs: ['block-1'], reason: 'invalid' },
      { candidateId: 'wrong-endpoints', relationType: 'offers_product', source: { candidateRef: 'product', mention: 'Product' }, target: { candidateRef: 'product', mention: 'Product' }, evidenceBlockRefs: ['block-1'], reason: 'invalid' },
    ],
    claims: [],
  } } })
  const result = await new KnowledgeCurationSkill({ executor }).extractKnowledge({ document, reportMap, unit })
  assert.equal(result.relations.length, 0)
  assert.equal(result.rejected.filter((item) => item.kind === 'relation').length, 2)
  assert.ok(result.rejected.every((item) => item.code === 'invalid_semantics'))
})

test('structured output contracts fully describe nested objects and Schema 0.3 vocabularies', () => {
  const context = buildCurationSchemaContext('knowledge_extraction')
  const understand = buildUnderstandAndPlanOutputContract(buildCurationSchemaContext('understand_and_plan'))
  const understandRoot = understand.schema.properties as Record<string, { properties?: Record<string, unknown>; additionalProperties?: boolean }>
  const plan = understandRoot.extractionPlanProposal.properties as Record<string, { items?: { properties?: Record<string, unknown>; additionalProperties?: boolean } }>
  const unitSchema = plan.units.items!
  assert.equal(unitSchema.additionalProperties, false)
  const refs = unitSchema.properties!.primaryRefs as { items: { oneOf: readonly { additionalProperties?: boolean }[] } }
  assert.equal(refs.items.oneOf.length, 2)
  assert.equal(refs.items.oneOf.every((item) => item.additionalProperties === false), true)
  const extract = buildExtractKnowledgeOutputContract(context)
  const extractRoot = extract.schema.properties as Record<string, { items?: { properties?: Record<string, { enum?: readonly string[]; minimum?: number; maximum?: number }>; } }>
  assert.deepEqual(extractRoot.entities.items?.properties?.entityType.enum, context.entityTypes)
  assert.deepEqual(extractRoot.relations.items?.properties?.relationType.enum, context.relationTypes)
  assert.deepEqual(extractRoot.claims.items?.properties?.claimType.enum, context.claimTypes)
  const entityProperties = extractRoot.entities.items?.properties
  assert.equal(entityProperties?.confidence?.minimum, 0)
  assert.equal(entityProperties?.confidence?.maximum, 1)
  const structuredValue = extractRoot.claims.items?.properties?.structuredValue as { oneOf: readonly [{ properties: Record<string, { oneOf?: readonly { enum?: readonly string[]; type?: string }[] }> }, { type: string }] }
  const comparator = structuredValue.oneOf[0].properties.comparator.oneOf!
  assert.deepEqual(comparator[0]?.enum, context.claimComparators)
  assert.deepEqual(comparator[1], { type: 'null' })
  assert.equal((comparator[0]?.enum as readonly string[] | undefined)?.includes('greater_than'), false)
  const semantic = buildResolveSemanticCaseOutputContract({ caseKind: 'ClaimConflictCase', allowedOutcomes: ['equivalent', 'supersedes', 'coexists', 'contradicts', 'invalid', 'uncertain'], existingAliases: ['existing-001'] })
  const semanticSchema = semantic.schema.properties as Record<string, { enum?: readonly string[]; additionalProperties?: boolean }>
  assert.deepEqual(semanticSchema.outcome.enum, ['equivalent', 'supersedes', 'coexists', 'contradicts', 'invalid', 'uncertain'])
  assert.equal(semanticSchema.caseKind.additionalProperties, undefined)
})
