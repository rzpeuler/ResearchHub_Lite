import test from 'node:test'
import assert from 'node:assert/strict'
import type { ReasoningCapabilities, ReasoningExecutor, ReasoningRequest, ReasoningResult } from '../../plugins/reasoning/contracts.ts'
import { KnowledgeCurationSkill } from '../../skills/knowledge-curation/skill.ts'
import { runRawDocumentKnowledgeIngestion } from '../../workflows/raw-document-knowledge-ingestion/workflow.ts'
import { validateExtractionPlan } from '../../workflows/raw-document-knowledge-ingestion/plan-validation.ts'
import { createKnowledgeBase, readManifest, removeKnowledgeBase } from '../knowledge/helpers.ts'
import { KnowledgeBaseRegistry } from '../../knowledge/registry/registry.ts'
import { KnowledgeBaseLoaderV03 } from '../../knowledge/storage/loader.ts'

const capabilities: ReasoningCapabilities = { maxContextTokens: 100_000, maxOutputTokens: 10_000, structuredOutputSupport: true, maxConcurrency: 4 }
const reportMap = { sourceAssessment: { summary: 'Fixture source', sourceType: 'unknown' as const, reliability: 'unknown' as const }, researchScope: 'Fixture scope', majorTopics: [], majorEntityMentions: [], majorConclusions: [], sectionSemantics: [{ sectionRef: 'section-0001', summary: 'Fixture section' }], semanticDependencies: [], themeHypotheses: [], uncertainty: [] }

class FixtureExecutor implements ReasoningExecutor {
  readonly calls: ReasoningRequest[] = []
  constructor(private readonly plan: unknown, private readonly extract: (unitId: string, blockIds: readonly string[]) => unknown, private readonly reviewCandidate?: string) {
  }
  capabilities(): ReasoningCapabilities { return capabilities }
  async execute(request: ReasoningRequest): Promise<ReasoningResult> {
    this.calls.push(structuredClone(request))
    if (request.operation === 'understandAndPlan') return { operation: request.operation, output: this.plan }
    if (request.operation === 'extractKnowledge') {
      const input = request.input as { unit: { proposedUnitId: string }; blocks: readonly { blockId: string }[] }
      return { operation: request.operation, output: this.extract(input.unit.proposedUnitId, input.blocks.map((block) => block.blockId)) }
    }
    const input = request.input as { candidateGroups: readonly { candidateId: string }[] }
    return { operation: request.operation, output: { decisions: input.candidateGroups.map((group) => ({ candidateId: group.candidateId, action: group.candidateId === this.reviewCandidate ? 'user_review' : 'create', rationale: group.candidateId === this.reviewCandidate ? 'Ambiguous fixture candidate' : 'Fixture candidate is grounded' })) } }
  }
}

function plan(units: unknown[]): unknown { return { reportMap, extractionPlanProposal: { units } } }
function unit(proposedUnitId: string, primaryRefs: unknown[]): unknown { return { proposedUnitId, topic: 'Fixture', semanticPurpose: 'Fixture extraction', primaryRefs, contextRefs: [] } }
function extraction(blockIds: readonly string[], names: readonly { id: string; type: 'company' | 'product'; name: string }[], relation = true): unknown {
  const entities = names.map((item, index) => ({ candidateId: item.id, entityType: item.type, name: item.name, evidenceBlockRefs: [blockIds[index] ?? blockIds[0]], reason: 'Named in fixture' }))
  return { entities, relations: relation && names.length >= 2 ? [{ candidateId: 'offers', relationType: 'offers_product', source: { candidateRef: names[0]!.id, mention: names[0]!.name }, target: { candidateRef: names[1]!.id, mention: names[1]!.name }, evidenceBlockRefs: [blockIds[0]!], reason: 'Direct fixture statement' }] : [], claims: relation ? [{ candidateId: 'fact', claimType: 'fact', statement: 'Alpha makes Beta.', subjectRefs: [{ candidateRef: names[0]!.id, mention: names[0]!.name, entityType: names[0]!.type }], evidenceBlockRefs: [blockIds[0]!], reason: 'Direct fixture statement' }] : [] }
}

test('offline ingestion archives Raw before parsing, writes canonical objects once, and replays idempotently', async () => {
  const root = await createKnowledgeBase({ knowledgeBaseId: 'kb-e2e' })
  try {
    const executor = new FixtureExecutor(plan([unit('unit-1', [{ kind: 'section', sectionId: 'section-0001' }])]), (_unitId, blocks) => extraction(blocks, [{ id: 'alpha', type: 'company', name: 'Alpha' }, { id: 'beta', type: 'product', name: 'Beta' }]))
    const skill = new KnowledgeCurationSkill({ executor })
    const handle = await new KnowledgeBaseRegistry().mount(root)
    const input = { handle, documentInput: { type: 'text' as const, text: 'Alpha makes Beta.\n\nBeta is a product.', originalFilename: 'fixture.txt', mediaType: 'text/plain' }, skill, workflowRunId: 'run-e2e' }
    const first = await runRawDocumentKnowledgeIngestion(input)
    assert.equal(first.status, 'completed')
    assert.equal(first.writeStatus, 'committed')
    assert.equal(first.committedRevision, 1)
    assert.equal(first.validationSummary?.status, 'passed')
    const mounted = await new KnowledgeBaseRegistry().mount(root)
    const assets = await new KnowledgeBaseLoaderV03().load(mounted)
    assert.equal(assets.entities.length, 2)
    assert.equal(assets.relations.length, 1)
    assert.equal(assets.claims.length, 1)
    assert.equal(assets.sources.length, 1)
    const manifest = await readManifest(root)
    assert.equal(manifest.revision, 1)
    const replay = await runRawDocumentKnowledgeIngestion({ ...input, handle: mounted })
    assert.equal(replay.status, 'completed')
    assert.equal(replay.writeStatus, 'already_committed')
    assert.equal(replay.changeSetId, first.changeSetId)
    assert.equal((await readManifest(root)).revision, 1)
  } finally { await removeKnowledgeBase(root) }
})

test('parallel extraction is bounded and deterministic across multiple units', async () => {
  const root = await createKnowledgeBase({ knowledgeBaseId: 'kb-parallel' })
  try {
    const fixturePlan = plan([unit('first', [{ kind: 'block', blockId: 'block-000001' }]), unit('second', [{ kind: 'block', blockId: 'block-000002' }])])
    const executor = new FixtureExecutor(fixturePlan, (unitId, blocks) => extraction(blocks, [{ id: unitId, type: 'company', name: unitId === 'first' ? 'Alpha' : 'Beta' }], false))
    const result = await runRawDocumentKnowledgeIngestion({ handle: await new KnowledgeBaseRegistry().mount(root), documentInput: { type: 'text', text: 'Alpha.\n\nBeta.', originalFilename: 'parallel.txt', mediaType: 'text/plain' }, skill: new KnowledgeCurationSkill({ executor }), workflowRunId: 'run-parallel', config: { maxConcurrency: 2 } })
    assert.equal(result.status, 'completed')
    assert.equal(result.extractionConcurrency, 2)
    assert.ok((result.peakExtractionConcurrency ?? 0) <= 2)
    assert.deepEqual(result.unitSummaries.map((item) => item.unitId), ['unit-001', 'unit-002'])
  } finally { await removeKnowledgeBase(root) }
})

test('review isolation commits safe independent candidates and excludes dependent relations/claims', async () => {
  const root = await createKnowledgeBase({ knowledgeBaseId: 'kb-review' })
  try {
    const reviewId = 'merged-entity-company-alpha'
    const executor = new FixtureExecutor(plan([unit('unit-1', [{ kind: 'section', sectionId: 'section-0001' }])]), (_unitId, blocks) => extraction(blocks, [{ id: 'alpha', type: 'company', name: 'Alpha' }, { id: 'beta', type: 'product', name: 'Beta' }]), reviewId)
    const result = await runRawDocumentKnowledgeIngestion({ handle: await new KnowledgeBaseRegistry().mount(root), documentInput: { type: 'text', text: 'Alpha makes Beta.\n\nBeta is a product.', originalFilename: 'review.txt', mediaType: 'text/plain' }, skill: new KnowledgeCurationSkill({ executor }), workflowRunId: 'run-review' })
    assert.equal(result.status, 'completed_with_review')
    assert.ok(result.reviewItems.some((item) => item.candidateId === reviewId))
    const assets = await new KnowledgeBaseLoaderV03().load(await new KnowledgeBaseRegistry().mount(root))
    assert.equal(assets.entities.length, 1)
    assert.equal(assets.relations.length, 0)
    assert.equal(assets.claims.length, 0)
  } finally { await removeKnowledgeBase(root) }
})

test('capacity guard blocks an oversized unit without resplitting it', () => {
  const document = { documentId: 'doc', parser: { id: 'test' }, metadata: { originalFilename: 'x.txt', mediaType: 'text/plain' }, normalizedText: 'x', sections: [{ sectionId: 'section-0001', title: null, level: null, parentSectionRef: null, blockRefs: ['block-000001'], pageStart: null, pageEnd: null }], blocks: [{ blockId: 'block-000001', type: 'paragraph' as const, text: 'x', sectionRef: 'section-0001', page: null, locator: { page: null }, order: 1 }], stats: { pageCount: null, sectionCount: 1, blockCount: 1, normalizedCharacters: 1, tableCount: 0, headingCount: 0, listCount: 0, captionCount: 0 }, warnings: [] }
  assert.throws(() => validateExtractionPlan(plan([unit('one', [{ kind: 'section', sectionId: 'section-0001' }])] ) as never, document, { ...capabilities, maxContextTokens: 10 }))
})
