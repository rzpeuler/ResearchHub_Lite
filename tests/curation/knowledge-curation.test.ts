import test from 'node:test'
import assert from 'node:assert/strict'
import type { StructuredDocument } from '../../plugins/document/contracts.ts'
import { buildCurationSchemaContext } from '../../skills/knowledge-curation/schema-context.ts'
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
  const result = await skill.understandAndPlan({ document, capabilities, schemaContext: buildCurationSchemaContext('understand_and_plan') })
  assert.equal(result.extractionPlanProposal.units[0]?.proposedUnitId, 'unit-1')
  assert.equal((executor.calls[0]?.input as { document: StructuredDocument }).document.blocks.length, 2)
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
  const result = await new KnowledgeCurationSkill({ executor }).extractKnowledge({ document, reportMap, unit, schemaContext: buildCurationSchemaContext('knowledge_extraction') })
  assert.deepEqual(result.entities.map((item) => item.candidateId), ['alpha', 'product-beta'])
  assert.deepEqual(result.relations.map((item) => item.candidateId), ['offers'])
  assert.deepEqual(result.claims.map((item) => item.candidateId), ['claim-1'])
  assert.equal(result.rejected.length, 3)
  assert.ok(result.rejected.some((item) => item.code === 'ungrounded_candidate'))
  assert.ok(result.rejected.some((item) => item.code === 'invalid_reference'))
})

test('skill rejects invalid JSON from a non-native structured-output host without retrying', async () => {
  const executor = new MockReasoningExecutor({ capabilities: { ...capabilities, structuredOutputSupport: false }, responses: { extractKnowledge: 'not json' } })
  await assert.rejects(() => new KnowledgeCurationSkill({ executor }).extractKnowledge({ document, reportMap, unit, schemaContext: buildCurationSchemaContext('knowledge_extraction') }), (error: unknown) => error instanceof KnowledgeCurationError && error.code === 'invalid_model_output')
  assert.equal(executor.calls.length, 1)
})

test('reconcileKnowledge requires exactly one decision for every supplied candidate', async () => {
  const candidate = { candidateId: 'alpha', entityType: 'company' as const, name: 'Alpha', evidenceBlockRefs: ['block-1'], reason: 'named' }
  const input = { candidateGroups: [{ candidateId: 'alpha', kind: 'entity' as const, candidate }], existingKnowledge: [], reportMap, sourceAssessment: { summary: 'test' }, schemaContext: buildCurationSchemaContext('reconciliation') }
  const executor = new MockReasoningExecutor({ capabilities, responses: { reconcileKnowledge: { decisions: [{ candidateId: 'alpha', action: 'create', rationale: 'No matching focused knowledge.' }] } } })
  const result = await new KnowledgeCurationSkill({ executor }).reconcileKnowledge(input)
  assert.equal(result.decisions[0]?.action, 'create')
})
