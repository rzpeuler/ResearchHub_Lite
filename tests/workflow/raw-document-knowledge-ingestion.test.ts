import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { ReasoningCapabilities, ReasoningExecutor, ReasoningRequest, ReasoningResult } from '../../plugins/reasoning/contracts.ts'
import type { StructuredDocument } from '../../plugins/document/contracts.ts'
import { KnowledgeCurationSkill } from '../../skills/knowledge-curation/skill.ts'
import { runRawDocumentKnowledgeIngestion, validateIngestionConfig } from '../../workflows/raw-document-knowledge-ingestion/workflow.ts'
import { ExtractionPlanValidationError, validateExtractionPlan } from '../../workflows/raw-document-knowledge-ingestion/plan-validation.ts'
import { createKnowledgeBase, readManifest, removeKnowledgeBase } from '../knowledge/helpers.ts'
import { KnowledgeBaseRegistry } from '../../knowledge/registry/registry.ts'
import { KnowledgeBaseLoaderV03 } from '../../knowledge/storage/loader.ts'
import { hashKnowledgeObject } from '../../knowledge/storage/canonical-hash.ts'

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
    const input = request.input as { candidateGroups: readonly { candidateId: string; candidate?: { name?: string } }[] }
    return { operation: request.operation, output: { decisions: input.candidateGroups.map((group) => { const review = group.candidateId === this.reviewCandidate || this.reviewCandidate === 'all'; const reject = this.reviewCandidate === 'reject-all' || (this.reviewCandidate === 'reject-beta' && group.candidate?.name === 'Beta'); return { candidateId: group.candidateId, action: reject ? 'reject' : review ? 'user_review' : 'create', rationale: reject ? 'Rejected fixture candidate' : review ? 'Ambiguous fixture candidate' : 'Fixture candidate is grounded' } }) } }
  }
}

class PlanSequenceExecutor implements ReasoningExecutor {
  readonly calls: ReasoningRequest[] = []
  constructor(private readonly plans: readonly unknown[], private readonly planCapabilities = capabilities) {}
  capabilities(): ReasoningCapabilities { return this.planCapabilities }
  async execute(request: ReasoningRequest): Promise<ReasoningResult> {
    this.calls.push(structuredClone(request))
    if (request.operation === 'understandAndPlan') return { operation: request.operation, output: this.plans[Math.min(this.calls.filter((item) => item.operation === 'understandAndPlan').length - 1, this.plans.length - 1)] }
    if (request.operation === 'extractKnowledge') return { operation: request.operation, output: { entities: [], relations: [], claims: [] } }
    return { operation: request.operation, output: { decisions: [] } }
  }
}

function plan(units: unknown[], excludedRefs: unknown[] = []): unknown { return { reportMap, extractionPlanProposal: { units, excludedRefs } } }
function unit(proposedUnitId: string, primaryRefs: unknown[]): unknown { return { proposedUnitId, topic: 'Fixture', semanticPurpose: 'Fixture extraction', primaryRefs, contextRefs: [] } }
function extraction(blockIds: readonly string[], names: readonly { id: string; type: 'company' | 'product'; name: string }[], relation = true): unknown {
  const entities = names.map((item, index) => ({ candidateId: item.id, entityType: item.type, name: item.name, evidenceBlockRefs: [blockIds[index] ?? blockIds[0]], reason: 'Named in fixture' }))
  return { entities, relations: relation && names.length >= 2 ? [{ candidateId: 'offers', relationType: 'offers_product', source: { candidateRef: names[0]!.id, mention: names[0]!.name }, target: { candidateRef: names[1]!.id, mention: names[1]!.name }, evidenceBlockRefs: [blockIds[0]!], reason: 'Direct fixture statement' }] : [], claims: relation ? [{ candidateId: 'fact', claimType: 'fact', statement: 'Alpha makes Beta.', subjectRefs: [{ candidateRef: names[0]!.id, mention: names[0]!.name, entityType: names[0]!.type }], evidenceBlockRefs: [blockIds[0]!], reason: 'Direct fixture statement' }] : [] }
}

function structuralDocument(sectionCount = 2, blocksPerSection = 2): StructuredDocument {
  const sections = Array.from({ length: sectionCount }, (_, sectionIndex) => ({ sectionId: `section-000${sectionIndex + 1}`, title: `Section ${sectionIndex + 1}`, level: 1, parentSectionRef: null, blockRefs: Array.from({ length: blocksPerSection }, (_, blockIndex) => `block-${String(sectionIndex * blocksPerSection + blockIndex + 1).padStart(6, '0')}`), pageStart: null, pageEnd: null }))
  const blocks = sections.flatMap((section, sectionIndex) => section.blockRefs.map((blockId, blockIndex) => ({ blockId, type: 'paragraph' as const, text: `${section.title} block ${blockIndex + 1}`, sectionRef: section.sectionId, page: null, locator: { page: null }, order: sectionIndex * blocksPerSection + blockIndex + 1 })))
  return { documentId: 'plan-document', parser: { id: 'test' }, metadata: { originalFilename: 'plan.txt', mediaType: 'text/plain' }, normalizedText: blocks.map((block) => block.text).join('\n'), sections, blocks, stats: { pageCount: null, sectionCount: sections.length, blockCount: blocks.length, normalizedCharacters: 1, tableCount: 0, headingCount: 0, listCount: 0, captionCount: 0 }, warnings: [] }
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
    assert.equal(first.reviewSummary.total, 0)
    const executionLog = JSON.parse(await readFile(join(root, 'logs', 'ingestion', 'run-e2e.yaml'), 'utf8')) as Record<string, unknown>
    assert.equal(typeof (executionLog.ingestionContext as Record<string, unknown>).workflowInputFingerprint, 'string')
    assert.equal(executionLog.status, 'completed')
    assert.deepEqual((executionLog.ingestionContext as Record<string, unknown>).reviewSummary, first.reviewSummary)
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
    assert.equal(replay.reviewSummary.total, 0)
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

test('exhaustive plan validation accepts primary and explicit excluded coverage', () => {
  const document = structuralDocument()
  const accepted = validateExtractionPlan(plan([unit('primary', [{ kind: 'section', sectionId: 'section-0001' }])], [{ kind: 'section', sectionId: 'section-0002' }]) as never, document, capabilities)
  assert.deepEqual(accepted.excludedBlockIds, ['block-000003', 'block-000004'])
  assert.deepEqual(accepted.units[0]?.primaryBlockIds, ['block-000001', 'block-000002'])
})

test('uncovered content is a typed repairable diagnostic and context does not cover it', () => {
  const document = structuralDocument()
  const output = plan([unit('primary', [{ kind: 'block', blockId: 'block-000001' }])])
  assert.throws(() => validateExtractionPlan(output as never, document, capabilities), (error: unknown) => error instanceof ExtractionPlanValidationError && error.code === 'uncovered_content' && error.repairable === true && error.feedback.uncoveredRefs?.some((ref) => ref.kind === 'section' && ref.sectionId === 'section-0002'))
  const contextOnlyUnit = unit('primary', [{ kind: 'block', blockId: 'block-000001' }]) as Record<string, unknown>
  const contextOnly = plan([{ ...contextOnlyUnit, contextRefs: [{ kind: 'block', blockId: 'block-000003' }] }])
  assert.throws(() => validateExtractionPlan(contextOnly as never, document, capabilities), (error: unknown) => error instanceof ExtractionPlanValidationError && error.code === 'uncovered_content')
})

test('primary ownership conflicts are typed and never auto-repaired', () => {
  const document = structuralDocument()
  const overlap = plan([unit('one', [{ kind: 'block', blockId: 'block-000001' }]), unit('two', [{ kind: 'block', blockId: 'block-000001' }])], [{ kind: 'section', sectionId: 'section-000002' }])
  assert.throws(() => validateExtractionPlan(overlap as never, document, capabilities), (error: unknown) => error instanceof ExtractionPlanValidationError && error.code === 'primary_overlap' && error.feedback.overlapRefs?.[0]?.kind === 'block')
  const conflict = plan([unit('one', [{ kind: 'block', blockId: 'block-000001' }])], [{ kind: 'block', blockId: 'block-000001' }, { kind: 'section', sectionId: 'section-000002' }])
  assert.throws(() => validateExtractionPlan(conflict as never, document, capabilities), (error: unknown) => error instanceof ExtractionPlanValidationError && error.code === 'primary_excluded_conflict')
})

test('section and partial-section references remain structurally auditable', () => {
  const document = structuralDocument(3, 2)
  const full = validateExtractionPlan(plan([unit('first', [{ kind: 'section', sectionId: 'section-0001' }])], [{ kind: 'section', sectionId: 'section-0002' }, { kind: 'section', sectionId: 'section-0003' }]) as never, document, capabilities)
  assert.equal(full.excludedBlockIds.length, 4)
  const partial = validateExtractionPlan(plan([unit('first', [{ kind: 'block', blockId: 'block-000001' }])], [{ kind: 'block', blockId: 'block-000002' }, { kind: 'section', sectionId: 'section-0002' }, { kind: 'section', sectionId: 'section-0003' }]) as never, document, capabilities)
  assert.deepEqual(partial.excludedBlockIds, ['block-000002', 'block-000003', 'block-000004', 'block-000005', 'block-000006'])
})

test('large structural gaps are compressed to auditable section and block references', () => {
  const document = structuralDocument(3, 3)
  const output = plan([unit('first', [{ kind: 'section', sectionId: 'section-0001' }]), unit('third', [{ kind: 'block', blockId: 'block-000007' }])])
  assert.throws(() => validateExtractionPlan(output as never, document, capabilities), (error: unknown) => {
    if (!(error instanceof ExtractionPlanValidationError) || error.code !== 'uncovered_content') return false
    const refs = error.feedback.uncoveredRefs ?? []
    return refs.some((ref) => ref.kind === 'section' && ref.sectionId === 'section-0002') && refs.some((ref) => ref.kind === 'block' && ref.blockId === 'block-000008') && refs.some((ref) => ref.kind === 'block' && ref.blockId === 'block-000009')
  })
})

test('bounded semantic plan repair retries once and extracts only after acceptance', async () => {
  const first = plan([unit('first', [{ kind: 'block', blockId: 'block-000001' }])])
  const corrected = plan([unit('first', [{ kind: 'section', sectionId: 'section-0001' }])])
  const executor = new PlanSequenceExecutor([first, corrected])
  const root = await createKnowledgeBase({ knowledgeBaseId: 'kb-plan-repair' })
  try {
    const result = await runRawDocumentKnowledgeIngestion({ handle: await new KnowledgeBaseRegistry().mount(root), documentInput: { type: 'text', text: 'Alpha.\n\nBeta.', originalFilename: 'repair.txt', mediaType: 'text/plain' }, skill: new KnowledgeCurationSkill({ executor }), workflowRunId: 'run-plan-repair' })
    assert.notEqual(result.status, 'blocked')
    assert.deepEqual(result.planAttempts?.map((item) => item.status), ['repairable_invalid', 'accepted'])
    assert.equal(executor.calls.filter((item) => item.operation === 'understandAndPlan').length, 2)
    assert.equal(executor.calls.filter((item) => item.operation === 'extractKnowledge').length, 1)
    const repairInput = executor.calls[1]?.input as { planRepair?: { attempt: number; feedback: { code: string; uncoveredRefs?: unknown[] }; previousOutput: unknown } }
    assert.equal(repairInput.planRepair?.attempt, 2)
    assert.equal(repairInput.planRepair?.feedback.code, 'uncovered_content')
    assert.ok(repairInput.planRepair?.feedback.uncoveredRefs?.length)
    assert.equal(JSON.stringify(repairInput.planRepair).includes('changeSetId'), false)
  } finally { await removeKnowledgeBase(root) }
})

test('bounded semantic plan repair reports primary overlap and accepts semantic regrouping', async () => {
  const first = plan([unit('one', [{ kind: 'block', blockId: 'block-000001' }]), unit('two', [{ kind: 'block', blockId: 'block-000001' }])], [{ kind: 'block', blockId: 'block-000002' }])
  const corrected = plan([unit('combined', [{ kind: 'section', sectionId: 'section-0001' }])])
  const executor = new PlanSequenceExecutor([first, corrected])
  const root = await createKnowledgeBase({ knowledgeBaseId: 'kb-plan-overlap-repair' })
  try {
    const result = await runRawDocumentKnowledgeIngestion({ handle: await new KnowledgeBaseRegistry().mount(root), documentInput: { type: 'text', text: 'Alpha.\n\nBeta.', originalFilename: 'overlap-repair.txt', mediaType: 'text/plain' }, skill: new KnowledgeCurationSkill({ executor }), workflowRunId: 'run-plan-overlap-repair' })
    assert.notEqual(result.status, 'blocked')
    assert.deepEqual(result.planAttempts?.map((item) => item.status), ['repairable_invalid', 'accepted'])
    const repairInput = executor.calls[1]?.input as { planRepair?: { feedback: { code: string; overlapRefs?: unknown[]; conflictingUnitIds?: string[] } } }
    assert.equal(repairInput.planRepair?.feedback.code, 'primary_overlap')
    assert.deepEqual(repairInput.planRepair?.feedback.conflictingUnitIds, ['one', 'two'])
    assert.ok(repairInput.planRepair?.feedback.overlapRefs?.length)
    assert.equal(executor.calls.filter((item) => item.operation === 'extractKnowledge').length, 1)
  } finally { await removeKnowledgeBase(root) }
})

test('bounded semantic plan repair reports context capacity and accepts smaller semantic units', async () => {
  const first = plan([unit('combined', [{ kind: 'section', sectionId: 'section-0001' }])])
  const corrected = plan([unit('first', [{ kind: 'block', blockId: 'block-000001' }]), unit('second', [{ kind: 'block', blockId: 'block-000002' }])])
  const executor = new PlanSequenceExecutor([first, corrected], { ...capabilities, maxContextTokens: 10_000 })
  const root = await createKnowledgeBase({ knowledgeBaseId: 'kb-plan-capacity-repair' })
  try {
    const result = await runRawDocumentKnowledgeIngestion({ handle: await new KnowledgeBaseRegistry().mount(root), documentInput: { type: 'text', text: `${'A'.repeat(5_000)}\n\n${'B'.repeat(5_000)}`, originalFilename: 'capacity-repair.txt', mediaType: 'text/plain' }, skill: new KnowledgeCurationSkill({ executor }), workflowRunId: 'run-plan-capacity-repair', config: { maxContextTokens: 10_000 } })
    assert.notEqual(result.status, 'blocked')
    assert.deepEqual(result.planAttempts?.map((item) => item.status), ['repairable_invalid', 'accepted'])
    const repairInput = executor.calls[1]?.input as { planRepair?: { feedback: { code: string; affectedUnitId?: string; estimatedTokens?: number; allowedTokens?: number } } }
    assert.equal(repairInput.planRepair?.feedback.code, 'context_capacity_exceeded')
    assert.equal(repairInput.planRepair?.feedback.affectedUnitId, 'combined')
    assert.ok((repairInput.planRepair?.feedback.estimatedTokens ?? 0) > (repairInput.planRepair?.feedback.allowedTokens ?? Number.MAX_SAFE_INTEGER))
    assert.equal(executor.calls.filter((item) => item.operation === 'extractKnowledge').length, 2)
  } finally { await removeKnowledgeBase(root) }
})

test('bounded plan repair terminates without extraction when the replacement remains invalid', async () => {
  const invalid = plan([unit('first', [{ kind: 'block', blockId: 'block-000001' }])])
  const executor = new PlanSequenceExecutor([invalid, invalid])
  const root = await createKnowledgeBase({ knowledgeBaseId: 'kb-plan-repair-terminal' })
  try {
    const result = await runRawDocumentKnowledgeIngestion({ handle: await new KnowledgeBaseRegistry().mount(root), documentInput: { type: 'text', text: 'Alpha.\n\nBeta.', originalFilename: 'repair-terminal.txt', mediaType: 'text/plain' }, skill: new KnowledgeCurationSkill({ executor }), workflowRunId: 'run-plan-repair-terminal' })
    assert.equal(result.status, 'blocked')
    assert.deepEqual(result.planAttempts?.map((item) => item.status), ['repairable_invalid', 'terminal_invalid'])
    assert.equal(executor.calls.filter((item) => item.operation === 'understandAndPlan').length, 2)
    assert.equal(executor.calls.filter((item) => item.operation === 'extractKnowledge').length, 0)
  } finally { await removeKnowledgeBase(root) }
})

test('maxPlanAttempts is bounded and invalid configuration does not invoke reasoning', async () => {
  assert.deepEqual(validateIngestionConfig({ maxPlanAttempts: 0 }), ['maxPlanAttempts must be a positive safe integer'])
  const invalid = plan([unit('first', [{ kind: 'block', blockId: 'block-000001' }])])
  const executor = new PlanSequenceExecutor([invalid, plan([unit('first', [{ kind: 'section', sectionId: 'section-0001' }])])])
  const root = await createKnowledgeBase({ knowledgeBaseId: 'kb-plan-repair-one-attempt' })
  try {
    const result = await runRawDocumentKnowledgeIngestion({ handle: await new KnowledgeBaseRegistry().mount(root), documentInput: { type: 'text', text: 'Alpha.\n\nBeta.', originalFilename: 'repair-one.txt', mediaType: 'text/plain' }, skill: new KnowledgeCurationSkill({ executor }), workflowRunId: 'run-plan-repair-one', config: { maxPlanAttempts: 1 } })
    assert.equal(result.status, 'blocked')
    assert.equal(executor.calls.filter((item) => item.operation === 'understandAndPlan').length, 1)
  } finally { await removeKnowledgeBase(root) }

  const invalidConfigExecutor = new PlanSequenceExecutor([invalid])
  const invalidConfigRoot = await createKnowledgeBase({ knowledgeBaseId: 'kb-plan-repair-invalid-config' })
  try {
    const result = await runRawDocumentKnowledgeIngestion({ handle: await new KnowledgeBaseRegistry().mount(invalidConfigRoot), documentInput: { type: 'text', text: 'Alpha.', originalFilename: 'invalid-config.txt', mediaType: 'text/plain' }, skill: new KnowledgeCurationSkill({ executor: invalidConfigExecutor }), workflowRunId: 'run-plan-repair-invalid-config', config: { maxPlanAttempts: 0 } })
    assert.equal(result.status, 'blocked')
    assert.equal(invalidConfigExecutor.calls.length, 0)
  } finally { await removeKnowledgeBase(invalidConfigRoot) }
})

test('review isolation commits safe independent candidates and excludes dependent relations/claims', async () => {
  const root = await createKnowledgeBase({ knowledgeBaseId: 'kb-review' })
  try {
    const reviewId = `merged-entity-${hashKnowledgeObject({ entityType: 'company', normalizedSemanticName: 'alpha' }).slice(7, 23)}`
    const executor = new FixtureExecutor(plan([unit('unit-1', [{ kind: 'section', sectionId: 'section-0001' }])]), (_unitId, blocks) => extraction(blocks, [{ id: 'alpha', type: 'company', name: 'Alpha' }, { id: 'beta', type: 'product', name: 'Beta' }]), reviewId)
    const result = await runRawDocumentKnowledgeIngestion({ handle: await new KnowledgeBaseRegistry().mount(root), documentInput: { type: 'text', text: 'Alpha makes Beta.\n\nBeta is a product.', originalFilename: 'review.txt', mediaType: 'text/plain' }, skill: new KnowledgeCurationSkill({ executor }), workflowRunId: 'run-review' })
    assert.equal(result.status, 'completed_with_review')
    assert.ok(result.reviewItems.some((item) => item.candidateId === reviewId))
    const assets = await new KnowledgeBaseLoaderV03().load(await new KnowledgeBaseRegistry().mount(root))
    assert.equal(assets.entities.length, 1)
    assert.equal(assets.relations.length, 0)
    assert.equal(assets.claims.length, 0)
    const replay = await runRawDocumentKnowledgeIngestion({ handle: await new KnowledgeBaseRegistry().mount(root), documentInput: { type: 'text', text: 'Alpha makes Beta.\n\nBeta is a product.', originalFilename: 'review.txt', mediaType: 'text/plain' }, skill: new KnowledgeCurationSkill({ executor }), workflowRunId: 'run-review' })
    assert.equal(replay.status, 'completed_with_review')
    assert.equal(replay.writeStatus, 'already_committed')
    assert.ok(replay.reviewSummary.total > 0)
    assert.equal(replay.committedRevision, result.committedRevision)
    const changedInstructions = await runRawDocumentKnowledgeIngestion({ handle: await new KnowledgeBaseRegistry().mount(root), documentInput: { type: 'text', text: 'Alpha makes Beta.\n\nBeta is a product.', originalFilename: 'review.txt', mediaType: 'text/plain' }, skill: new KnowledgeCurationSkill({ executor }), workflowRunId: 'run-review', instructions: 'changed' })
    assert.equal(changedInstructions.status, 'blocked')
    const changedBytes = await runRawDocumentKnowledgeIngestion({ handle: await new KnowledgeBaseRegistry().mount(root), documentInput: { type: 'text', text: 'Different document bytes.', originalFilename: 'review.txt', mediaType: 'text/plain' }, skill: new KnowledgeCurationSkill({ executor }), workflowRunId: 'run-review' })
    assert.equal(changedBytes.status, 'blocked')
  } finally { await removeKnowledgeBase(root) }
})

test('reconciliation reject is one audited root review and survives committed replay', async () => {
  const root = await createKnowledgeBase({ knowledgeBaseId: 'kb-reconcile-reject' })
  try {
    const executor = new FixtureExecutor(plan([unit('unit-1', [{ kind: 'section', sectionId: 'section-0001' }])]), (_unitId, blocks) => extraction(blocks, [{ id: 'alpha', type: 'company', name: 'Alpha' }, { id: 'beta', type: 'product', name: 'Beta' }]), 'reject-beta')
    const skill = new KnowledgeCurationSkill({ executor })
    const input = { handle: await new KnowledgeBaseRegistry().mount(root), documentInput: { type: 'text' as const, text: 'Alpha makes Beta.\n\nBeta is a product.', originalFilename: 'reject-beta.txt', mediaType: 'text/plain' }, skill, workflowRunId: 'run-reconcile-reject' }
    const first = await runRawDocumentKnowledgeIngestion(input)
    assert.equal(first.status, 'completed_with_review')
    assert.equal(first.writeStatus, 'committed')
    assert.equal(first.reviewSummary.byCategory.reconciliation_review, 1)
    assert.equal(first.reviewSummary.samplesByCategory.reconciliation_review.length, 1)
    assert.equal((await readManifest(root)).revision, 1)
    const calls = executor.calls.length
    const replay = await runRawDocumentKnowledgeIngestion({ ...input, handle: await new KnowledgeBaseRegistry().mount(root) })
    assert.equal(replay.status, 'completed_with_review')
    assert.equal(replay.writeStatus, 'already_committed')
    assert.deepEqual(replay.reviewSummary, first.reviewSummary)
    assert.equal(executor.calls.length, calls)
  } finally { await removeKnowledgeBase(root) }
})

test('capacity guard blocks an oversized unit without resplitting it', () => {
  const document = { documentId: 'doc', parser: { id: 'test' }, metadata: { originalFilename: 'x.txt', mediaType: 'text/plain' }, normalizedText: 'x', sections: [{ sectionId: 'section-0001', title: null, level: null, parentSectionRef: null, blockRefs: ['block-000001'], pageStart: null, pageEnd: null }], blocks: [{ blockId: 'block-000001', type: 'paragraph' as const, text: 'x', sectionRef: 'section-0001', page: null, locator: { page: null }, order: 1 }], stats: { pageCount: null, sectionCount: 1, blockCount: 1, normalizedCharacters: 1, tableCount: 0, headingCount: 0, listCount: 0, captionCount: 0 }, warnings: [] }
  assert.throws(() => validateExtractionPlan(plan([unit('one', [{ kind: 'section', sectionId: 'section-0001' }])] ) as never, document, { ...capabilities, maxContextTokens: 10 }))
})

test('workflow config rejects zero concurrency without fallback execution', () => {
  assert.deepEqual(validateIngestionConfig({ maxConcurrency: 0 }), ['maxConcurrency must be a positive safe integer'])
  assert.deepEqual(validateIngestionConfig({ maxExtractionAttempts: Number.MAX_SAFE_INTEGER + 1 }), ['maxExtractionAttempts must be a positive safe integer'])
})

test('user_review-only and reject-only workflows are no-op completions without revision changes', async () => {
  const root = await createKnowledgeBase({ knowledgeBaseId: 'kb-noop' })
  try {
    const documentInput = { type: 'text' as const, text: 'Alpha makes Beta.\n\nBeta is a product.', originalFilename: 'noop.txt', mediaType: 'text/plain' }
    const reviewExecutor = new FixtureExecutor(plan([unit('unit-1', [{ kind: 'section', sectionId: 'section-0001' }])]), (_unitId, blocks) => extraction(blocks, [{ id: 'alpha', type: 'company', name: 'Alpha' }, { id: 'beta', type: 'product', name: 'Beta' }]), 'all')
    const review = await runRawDocumentKnowledgeIngestion({ handle: await new KnowledgeBaseRegistry().mount(root), documentInput, skill: new KnowledgeCurationSkill({ executor: reviewExecutor }), workflowRunId: 'run-noop-review' })
    assert.equal(review.status, 'completed_with_review')
    assert.equal(review.writeStatus, 'no_changes')
    assert.equal(review.committedRevision, 0)
    assert.ok(review.reviewSummary.total > 0)
    const reviewCalls = reviewExecutor.calls.length
    const reviewReplay = await runRawDocumentKnowledgeIngestion({ handle: await new KnowledgeBaseRegistry().mount(root), documentInput, skill: new KnowledgeCurationSkill({ executor: reviewExecutor }), workflowRunId: 'run-noop-review' })
    assert.equal(reviewReplay.status, 'completed_with_review')
    assert.equal(reviewReplay.writeStatus, 'already_committed')
    assert.deepEqual(reviewReplay.reviewSummary, review.reviewSummary)
    assert.equal(reviewExecutor.calls.length, reviewCalls)
    const noOpLog = JSON.parse(await readFile(join(root, 'logs', 'ingestion', 'run-noop-review.yaml'), 'utf8')) as Record<string, unknown>
    assert.equal(noOpLog.writeStatus, 'no_changes')
    assert.deepEqual(noOpLog.reviewSummary, review.reviewSummary)
    const noOpAssets = await new KnowledgeBaseLoaderV03().load(await new KnowledgeBaseRegistry().mount(root))
    assert.equal(noOpAssets.sources.length, 0)
    const rejectExecutor = new FixtureExecutor(plan([unit('unit-1', [{ kind: 'section', sectionId: 'section-0001' }])]), (_unitId, blocks) => extraction(blocks, [{ id: 'alpha', type: 'company', name: 'Alpha' }], false), 'reject-all')
    const rejected = await runRawDocumentKnowledgeIngestion({ handle: await new KnowledgeBaseRegistry().mount(root), documentInput: { ...documentInput, originalFilename: 'reject.txt' }, skill: new KnowledgeCurationSkill({ executor: rejectExecutor }), workflowRunId: 'run-noop-reject' })
    assert.equal(rejected.writeStatus, 'no_changes')
    assert.equal(rejected.committedRevision, 0)
    const rejectCalls = rejectExecutor.calls.length
    const rejectReplay = await runRawDocumentKnowledgeIngestion({ handle: await new KnowledgeBaseRegistry().mount(root), documentInput: { ...documentInput, originalFilename: 'reject.txt' }, skill: new KnowledgeCurationSkill({ executor: rejectExecutor }), workflowRunId: 'run-noop-reject' })
    assert.equal(rejectReplay.status, 'completed_with_review')
    assert.equal(rejectReplay.writeStatus, 'already_committed')
    assert.equal(rejectExecutor.calls.length, rejectCalls)
    const changed = await runRawDocumentKnowledgeIngestion({ handle: await new KnowledgeBaseRegistry().mount(root), documentInput: { ...documentInput, text: 'Changed bytes.', originalFilename: 'reject.txt' }, skill: new KnowledgeCurationSkill({ executor: rejectExecutor }), workflowRunId: 'run-noop-reject' })
    assert.equal(changed.status, 'blocked')
  } finally { await removeKnowledgeBase(root) }
})
