import test from 'node:test'
import assert from 'node:assert/strict'
import type { StructuredDocument } from '../../plugins/document/contracts.ts'
import { buildCurationSchemaContext } from '../../skills/knowledge-curation/schema-context.ts'
import { buildUnderstandAndPlanOutputContract, buildExtractKnowledgeOutputContract, buildReconcileKnowledgeOutputContract } from '../../skills/knowledge-curation/output-contracts.ts'
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
  const response = { reportMap, extractionPlanProposal: { units: [unit] } }
  const executor = new MockReasoningExecutor({ capabilities, responses: { understandAndPlan: response } })
  const skill = new KnowledgeCurationSkill({ executor })
  const result = await skill.understandAndPlan({ document })
  assert.equal(result.extractionPlanProposal.units[0]?.proposedUnitId, 'unit-1')
  assert.equal((executor.calls[0]?.input as { document: StructuredDocument }).document.blocks.length, 2)
  const prepared = executor.calls[0]?.input as { capabilities: typeof capabilities; schemaContext: { slice: string } }
  assert.deepEqual(prepared.capabilities, capabilities)
  assert.equal(prepared.schemaContext.slice, 'understand_and_plan')
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

test('skill rejects invalid JSON from a non-native structured-output host without retrying', async () => {
  const executor = new MockReasoningExecutor({ capabilities: { ...capabilities, structuredOutputSupport: false }, responses: { extractKnowledge: 'not json' } })
  await assert.rejects(() => new KnowledgeCurationSkill({ executor }).extractKnowledge({ document, reportMap, unit }), (error: unknown) => error instanceof KnowledgeCurationError && error.code === 'invalid_model_output')
  assert.equal(executor.calls.length, 1)
})

test('reconcileKnowledge requires exactly one decision for every supplied candidate', async () => {
  const candidate = { candidateId: 'alpha', entityType: 'company' as const, name: 'Alpha', evidenceBlockRefs: ['block-1'], reason: 'named' }
  const input = { candidateGroups: [{ candidateId: 'alpha', kind: 'entity' as const, candidate }], existingKnowledge: [], reportMap, sourceAssessment: { summary: 'test' } }
  const executor = new MockReasoningExecutor({ capabilities, responses: { reconcileKnowledge: { decisions: [{ candidateId: 'alpha', action: 'create', rationale: 'No matching focused knowledge.' }] } } })
  const result = await new KnowledgeCurationSkill({ executor }).reconcileKnowledge(input)
  assert.equal(result.decisions[0]?.action, 'create')
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
  const reconcile = buildReconcileKnowledgeOutputContract()
  const decision = (reconcile.schema.properties as Record<string, { items?: { additionalProperties?: boolean; properties?: Record<string, { enum?: readonly string[] }> } }>).decisions.items!
  assert.equal(decision.additionalProperties, false)
  assert.deepEqual(decision.properties?.action.enum, ['create', 'duplicate', 'merge_source', 'update_state', 'supersede', 'keep_both', 'reject', 'user_review'])
})
