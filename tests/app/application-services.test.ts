import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdir, readFile, symlink, writeFile } from 'node:fs/promises'
import { join, relative } from 'node:path'
import { createKnowledgeBase, removeKnowledgeBase } from '../knowledge/helpers.ts'
import { KnowledgeService } from '../../app/services/knowledge-service.ts'
import { ProductionService } from '../../app/services/production-service.ts'
import { ReviewService } from '../../app/services/review-service.ts'
import { WorkflowService } from '../../app/services/workflow-service.ts'
import { createResearchHubTools } from '../../app/pi/tools.ts'
import type { ReasoningCapabilities, ReasoningExecutor, ReasoningRequest, ReasoningResult } from '../../plugins/reasoning/contracts.ts'
import { buildReviewCases } from '../../knowledge/review/case-builder.ts'
import { persistReviewCases } from '../../knowledge/review/store.ts'
import type { EntityCandidate, ResolvedCandidateGroup } from '../../skills/knowledge-curation/contracts.ts'
import type { IngestionWorkflowResult, ReviewItem } from '../../workflows/raw-document-knowledge-ingestion/contracts.ts'
import type { WorkflowOutcome } from '../../app/services/workflow-service.ts'
import { PiReasoningExecutor } from '../../plugins/reasoning/pi/executor.ts'

const capabilities: ReasoningCapabilities = { maxContextTokens: 100_000, maxOutputTokens: 10_000, structuredOutputSupport: true, maxConcurrency: 4 }
class NoopExecutor implements ReasoningExecutor { capabilities(): ReasoningCapabilities { return capabilities }; async execute(request: ReasoningRequest): Promise<ReasoningResult> { return { operation: request.operation, output: {} } } }
class IngestionFixtureExecutor implements ReasoningExecutor {
  capabilities(): ReasoningCapabilities { return capabilities }
  async execute(request: ReasoningRequest): Promise<ReasoningResult> {
    if (request.operation === 'understandAndPlan') return { operation: request.operation, output: { reportMap: { sourceAssessment: { summary: 'fixture', sourceType: 'unknown', reliability: 'unknown' }, researchScope: 'fixture', majorTopics: [], majorEntityMentions: [], majorConclusions: [], sectionSemantics: [{ sectionRef: 'section-0001', summary: 'fixture' }], semanticDependencies: [], themeHypotheses: [], uncertainty: [] }, extractionPlanProposal: { units: [{ proposedUnitId: 'unit-1', topic: 'fixture', semanticPurpose: 'fixture', primaryRefs: [{ kind: 'section', sectionId: 'section-0001' }], contextRefs: [] }], excludedRefs: [] } } }
    if (request.operation === 'extractKnowledge') return { operation: request.operation, output: { entities: [], relations: [], claims: [] } }
    return { operation: request.operation, output: { outcome: 'uncertain', rationale: 'fixture' } }
  }
}

async function executeTool(tool: ReturnType<typeof createResearchHubTools>[number], params: Record<string, unknown>, signal?: AbortSignal): Promise<Record<string, unknown>> {
  const result = await tool.execute('application-test-call', params, signal, undefined, {} as never)
  const first = result.content[0]
  if (!first || first.type !== 'text') throw new Error('Application tool did not return text JSON')
  return JSON.parse(first.text) as Record<string, unknown>
}

async function writeFixture(root: string, count = 55): Promise<void> {
  const registry: Record<string, { type: string; storageRef: string }> = {}
  const theme = { id: 'theme-group:default', name: 'Default', aliases: [], lifecycle: { status: 'active' } }
  await writeFile(join(root, 'theme-groups', 'default.yaml'), JSON.stringify(theme)); registry[theme.id] = { type: 'theme_group', storageRef: 'theme-groups/default.yaml' }
  const source = { id: 'source:fixture', title: 'Fixture Source', sourceType: 'unknown' }
  await writeFile(join(root, 'sources', 'fixture.yaml'), JSON.stringify(source)); registry[source.id] = { type: 'source', storageRef: 'sources/fixture.yaml' }
  for (let index = 0; index < count; index += 1) { const entity = { id: `entity:fixture-${String(index).padStart(3, '0')}`, type: index === 0 ? 'company' : 'industry', name: index === 0 ? 'Acme Corporation' : `Fixture Industry ${index}`, aliases: index === 0 ? ['ACME', 'Acme Corp'] : [], lifecycle: { status: 'active' } }; const path = `entities/fixture-${String(index).padStart(3, '0')}.yaml`; await writeFile(join(root, path), JSON.stringify(entity)); registry[entity.id] = { type: 'entity', storageRef: path } }
  const relation = { id: 'relation:fixture', type: 'business_exposure', sourceRef: 'entity:fixture-000', targetRef: 'entity:fixture-001', sourceRefs: ['source:fixture'], lifecycle: { status: 'active' } }
  await writeFile(join(root, 'relations', 'fixture.yaml'), JSON.stringify(relation)); registry[relation.id] = { type: 'relation', storageRef: 'relations/fixture.yaml' }
  const claim = { id: 'claim:fixture', claimType: 'fact', statement: 'Acme is a fixture.', subjectRefs: ['entity:fixture-000'], sourceRefs: ['source:fixture'], lifecycle: { status: 'active' } }
  await writeFile(join(root, 'claims', 'fixture.yaml'), JSON.stringify(claim)); registry[claim.id] = { type: 'claim', storageRef: 'claims/fixture.yaml' }
  const module = { id: 'module:fixture', type: 'market', targetEntity: 'entity:fixture-000', sourceRefs: ['source:fixture'] }
  await writeFile(join(root, 'modules', 'fixture.yaml'), JSON.stringify(module)); registry[module.id] = { type: 'module', storageRef: 'modules/fixture.yaml' }
  await writeFile(join(root, 'registry', 'assets.yaml'), JSON.stringify(registry))
}

async function writeRelatedFixture(root: string): Promise<void> {
  await writeFixture(root, 2)
  const registry = JSON.parse(await readFile(join(root, 'registry', 'assets.yaml'), 'utf8')) as Record<string, { type: string; storageRef: string }>
  for (let index = 0; index < 25; index += 1) {
    const suffix = String(index).padStart(2, '0')
    const source = { id: `source:related-${suffix}`, title: `Related Source ${index}`, sourceType: 'unknown' }
    const claim = { id: `claim:related-${suffix}`, claimType: 'fact', statement: `Related claim ${index}`, subjectRefs: ['entity:fixture-000'], sourceRefs: [source.id], lifecycle: { status: 'active' } }
    const relation = { id: `relation:related-${suffix}`, type: 'business_exposure', sourceRef: 'entity:fixture-000', targetRef: 'entity:fixture-001', supportingClaimRefs: [claim.id], sourceRefs: [source.id], lifecycle: { status: 'active' } }
    const sourcePath = `sources/related-${suffix}.yaml`; const claimPath = `claims/related-${suffix}.yaml`; const relationPath = `relations/related-${suffix}.yaml`
    await writeFile(join(root, sourcePath), JSON.stringify(source)); await writeFile(join(root, claimPath), JSON.stringify(claim)); await writeFile(join(root, relationPath), JSON.stringify(relation))
    registry[source.id] = { type: 'source', storageRef: sourcePath }; registry[claim.id] = { type: 'claim', storageRef: claimPath }; registry[relation.id] = { type: 'relation', storageRef: relationPath }
  }
  await writeFile(join(root, 'registry', 'assets.yaml'), JSON.stringify(registry))
}

test('KnowledgeService search is deterministic, exact-ref aware, bounded, and read-only', async () => {
  const root = await createKnowledgeBase({ knowledgeBaseId: 'kb-service-search' }); try {
    await writeFixture(root)
    const before = await readFile(join(root, 'registry', 'assets.yaml'), 'utf8')
    const service = new KnowledgeService(root)
    assert.equal((await service.searchKnowledge({ query: 'acme' })).results[0]?.ref, 'entity:fixture-000')
    assert.equal((await service.searchKnowledge({ query: 'ACME' })).total, 1)
    assert.equal((await service.searchKnowledge({ query: 'entity:fixture-000', entityType: 'company' })).results[0]?.kind, 'Entity')
    assert.equal((await service.searchKnowledge({ query: 'Fixture', entityType: 'company' })).total, 1)
    const defaultBound = await service.searchKnowledge({ query: 'Fixture' }); assert.equal(defaultBound.results.length, 20); assert.equal(defaultBound.total, 55); assert.equal(defaultBound.truncated, true)
    const hardBound = await service.searchKnowledge({ query: 'Fixture', limit: 500 }); assert.equal(hardBound.results.length, 50); assert.equal(hardBound.limit, 50); assert.equal(hardBound.truncated, true)
    assert.deepEqual(hardBound.results.map((item) => item.ref), [...hardBound.results].map((item) => item.ref).sort((a, b) => a.localeCompare(b)))
    assert.equal(await readFile(join(root, 'registry', 'assets.yaml'), 'utf8'), before)
  } finally { await removeKnowledgeBase(root) }
})

test('KnowledgeService returns bounded objects across supported canonical kinds', async () => {
  const root = await createKnowledgeBase({ knowledgeBaseId: 'kb-service-object' }); try {
    await writeFixture(root, 2); const service = new KnowledgeService(root)
    const entity = await service.getKnowledgeObject('entity:fixture-000', 1)
    assert.equal(entity.kind, 'Entity'); assert.equal(entity.relatedRelations?.length, 1); assert.equal(entity.relatedClaims?.length, 1); assert.equal(entity.supportingSources?.length, 1)
    for (const ref of ['theme-group:default', 'relation:fixture', 'claim:fixture', 'source:fixture', 'module:fixture']) assert.ok((await service.getKnowledgeObject(ref)).object)
    await assert.rejects(() => service.getKnowledgeObject('entity:missing'), /not found/i)
  } finally { await removeKnowledgeBase(root) }
})

test('KnowledgeService applies default and hard related-object bounds with observable truncation', async () => {
  const root = await createKnowledgeBase({ knowledgeBaseId: 'kb-service-related' }); try {
    await writeRelatedFixture(root); const service = new KnowledgeService(root); const before = await readFile(join(root, 'registry', 'assets.yaml'), 'utf8')
    const defaultView = await service.getKnowledgeObject('entity:fixture-000')
    assert.equal(defaultView.relatedRelations?.length, 20); assert.equal(defaultView.relatedClaims?.length, 20); assert.equal(defaultView.supportingSources?.length, 20)
    assert.deepEqual(defaultView.truncation?.relations, { limit: 20, total: 26, truncated: true }); assert.deepEqual(defaultView.truncation?.claims, { limit: 20, total: 26, truncated: true }); assert.deepEqual(defaultView.truncation?.sources, { limit: 20, total: 26, truncated: true })
    const hardView = await service.getKnowledgeObject('entity:fixture-000', 500); assert.equal(hardView.relatedRelations?.length, 20); assert.equal(hardView.truncation?.relations?.limit, 20); assert.equal(hardView.truncation?.relations?.total, 26)
    for (const ref of ['theme-group:default', 'entity:fixture-000', 'relation:related-00', 'claim:related-00', 'source:related-00', 'module:fixture']) assert.ok((await service.getKnowledgeObject(ref)).object)
    assert.equal(await readFile(join(root, 'registry', 'assets.yaml'), 'utf8'), before)
  } finally { await removeKnowledgeBase(root) }
})

function reviewFixture() {
  const candidate: EntityCandidate = { candidateId: 'root', entityType: 'company', name: 'Review Company', aliases: ['RC'], evidenceBlockRefs: ['block-1'], reason: 'fixture' }
  const groups = [{ candidateId: 'root', kind: 'entity', candidate } as ResolvedCandidateGroup]
  const reviewItems: ReviewItem[] = [{ candidateId: 'root', kind: 'entity', rationale: 'Needs decision', dependentCandidateIds: [], stage: 'knowledge_resolution', category: 'reconciliation_review', origin: 'knowledge_resolution', dependency: false, reviewKey: 'root-review' }]
  return buildReviewCases({ knowledgeBaseId: 'kb-service-review', producerRunId: 'review-run', createdAt: '2026-09-06T00:00:00.000Z', rawRef: `raw-sha256-${'1'.repeat(64)}`, documentId: 'doc-review', knowledgeBaseRevisionAtCreation: 0, assets: { rootDir: '', themeGroups: [], entities: [], relations: [], claims: [], modules: [], sources: [], registry: [] }, groups, reviewItems })
}

test('ReviewService exposes bounded read-only summaries and safe details', async () => {
  const root = await createKnowledgeBase({ knowledgeBaseId: 'kb-service-review' }); try {
    const cases = reviewFixture(); await persistReviewCases({ rootRef: root, knowledgeBaseId: 'kb-service-review', producerRunId: 'review-run', cases, createdAt: '2026-09-06T00:00:00.000Z', knowledgeBaseRevisionAtCreation: 0 })
    const service = new ReviewService(root); const list = await service.listOpenReviewCases({ limit: 1 }); assert.equal(list.total, 1); assert.equal(list.cases[0]?.actionability, 'knowledge_decision'); assert.equal(list.cases[0]?.category, 'reconciliation_review')
    const detail = await service.getReviewCase(cases[0]!.reviewCaseId, 1); assert.equal((detail.rootProposal as { proposalId: string }).proposalId, 'root'); assert.equal(detail.evidenceBindings.length, 1); assert.equal(detail.totalDependentProposals, 0); assert.equal(detail.dependentsTruncated, false)
    await assert.rejects(() => service.getReviewCase('missing'), /not found/i)
  } finally { await removeKnowledgeBase(root) }
})

function manyReviewCases(producerRunId: string, count: number, category: 'reconciliation_review' | 'theme_creation' = 'reconciliation_review') {
  const groups: ResolvedCandidateGroup[] = []; const reviewItems: ReviewItem[] = []
  for (let index = 0; index < count; index += 1) {
    const candidate: EntityCandidate = { candidateId: `root-${index}`, entityType: 'company', name: `Review Company ${index}`, aliases: [`RC-${index}`], evidenceBlockRefs: [`block-${index}`], reason: 'fixture' }
    groups.push({ candidateId: candidate.candidateId, kind: 'entity', candidate }); reviewItems.push({ candidateId: candidate.candidateId, kind: 'entity', rationale: `Review rationale ${index}`, dependentCandidateIds: [], stage: 'knowledge_resolution', category, origin: 'knowledge_resolution', dependency: false, reviewKey: `${category}-${index}` })
  }
  return buildReviewCases({ knowledgeBaseId: 'kb-service-many-review', producerRunId, createdAt: '2026-09-06T00:00:00.000Z', rawRef: `raw-sha256-${'2'.repeat(64)}`, documentId: 'doc-many-review', knowledgeBaseRevisionAtCreation: 0, assets: { rootDir: '', themeGroups: [], entities: [], relations: [], claims: [], modules: [], sources: [], registry: [] }, groups, reviewItems })
}

function dependentReviewCases() {
  const groups: ResolvedCandidateGroup[] = []; const dependentIds = Array.from({ length: 25 }, (_, index) => `dependent-${String(index).padStart(2, '0')}`)
  const root: EntityCandidate = { candidateId: 'root-detail', entityType: 'company', name: 'Detail Root', aliases: ['DR'], evidenceBlockRefs: ['detail-root-block'], reason: 'fixture' }
  groups.push({ candidateId: root.candidateId, kind: 'entity', candidate: root })
  for (const candidateId of dependentIds) groups.push({ candidateId, kind: 'entity', candidate: { candidateId, entityType: 'industry', name: candidateId, aliases: [], evidenceBlockRefs: [`${candidateId}-block`], reason: 'fixture' } })
  const reviewItems: ReviewItem[] = [{ candidateId: root.candidateId, kind: 'entity', rationale: 'Theme coverage requires a decision', dependentCandidateIds: dependentIds, dependencyDirection: 'blocks_dependents', stage: 'knowledge_resolution', category: 'theme_ambiguity', origin: 'knowledge_resolution', dependency: false, reviewKey: 'detail-root' }]
  return buildReviewCases({ knowledgeBaseId: 'kb-service-detail-review', producerRunId: 'review-detail-run', createdAt: '2026-09-06T00:00:00.000Z', rawRef: `raw-sha256-${'3'.repeat(64)}`, documentId: 'doc-detail-review', knowledgeBaseRevisionAtCreation: 0, assets: { rootDir: '', themeGroups: [], entities: [], relations: [], claims: [], modules: [], sources: [], registry: [] }, groups, reviewItems })
}

test('ReviewService bounds 55 durable open cases and preserves filter/order evidence', async () => {
  const root = await createKnowledgeBase({ knowledgeBaseId: 'kb-service-many-review' }); try {
    const first = manyReviewCases('review-many-a', 55); const second = manyReviewCases('review-many-b', 3, 'theme_creation')
    await persistReviewCases({ rootRef: root, knowledgeBaseId: 'kb-service-many-review', producerRunId: 'review-many-a', cases: first, createdAt: '2026-09-06T00:00:00.000Z', knowledgeBaseRevisionAtCreation: 0 }); await persistReviewCases({ rootRef: root, knowledgeBaseId: 'kb-service-many-review', producerRunId: 'review-many-b', cases: second, createdAt: '2026-09-06T00:00:00.000Z', knowledgeBaseRevisionAtCreation: 0 })
    const service = new ReviewService(root); const before = await readFile(join(root, 'reviews', 'runs', 'review-many-a', 'manifest.yaml'), 'utf8')
    const defaultList = await service.listOpenReviewCases(); assert.equal(defaultList.total, 58); assert.equal(defaultList.cases.length, 20); assert.equal(defaultList.truncated, true)
    const hardList = await service.listOpenReviewCases({ limit: 500 }); assert.equal(hardList.limit, 50); assert.equal(hardList.cases.length, 50); assert.equal(hardList.total, 58); assert.equal(hardList.truncated, true); assert.deepEqual(hardList.cases.map((item) => item.reviewCaseId), [...hardList.cases].map((item) => item.reviewCaseId).sort((a, b) => a.localeCompare(b)))
    assert.equal((await service.listOpenReviewCases({ actionability: 'research_followup' })).total, 3); assert.equal((await service.listOpenReviewCases({ category: 'theme_creation' })).total, 3); assert.equal((await service.listOpenReviewCases({ producerRunId: 'review-many-a', limit: 50 })).total, 55)
    assert.equal(await readFile(join(root, 'reviews', 'runs', 'review-many-a', 'manifest.yaml'), 'utf8'), before)
  } finally { await removeKnowledgeBase(root) }
})

test('ReviewService preserves safe detail fields and bounds a 25-proposal dependent bundle', async () => {
  const root = await createKnowledgeBase({ knowledgeBaseId: 'kb-service-detail-review' }); try {
    const cases = dependentReviewCases(); await persistReviewCases({ rootRef: root, knowledgeBaseId: 'kb-service-detail-review', producerRunId: 'review-detail-run', cases, createdAt: '2026-09-06T00:00:00.000Z', knowledgeBaseRevisionAtCreation: 0 })
    const service = new ReviewService(root); const defaultDetail = await service.getReviewCase(cases[0]!.reviewCaseId); const hardDetail = await service.getReviewCase(cases[0]!.reviewCaseId, 500)
    assert.ok(defaultDetail.classification); assert.ok(defaultDetail.rootProposal); assert.equal(defaultDetail.evidenceBindings.length, 1); assert.ok(defaultDetail.existingKnowledgeProjections); assert.ok(defaultDetail.impact); assert.ok(defaultDetail.advisory); assert.ok(defaultDetail.state)
    assert.equal(defaultDetail.totalDependentProposals, 25); assert.equal(defaultDetail.dependentProposalSamples.length, 20); assert.equal(defaultDetail.dependentProposals.length, 20); assert.equal(defaultDetail.dependentsTruncated, true); assert.equal(hardDetail.dependentProposalSamples.length, 20); assert.equal(hardDetail.dependentsTruncated, true)
  } finally { await removeKnowledgeBase(root) }
})

test('WorkflowService distinguishes running, terminal, blocked, failed, and cancellation', async () => {
  const service = new WorkflowService(); service.register({ runId: 'run-cancel', workflowType: 'fixture', objective: 'fixture' }); let release!: () => void
  const running = service.start('run-cancel', (signal) => new Promise<WorkflowOutcome>((resolve, reject) => { release = () => resolve({ status: 'completed' }); signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true }) }))
  assert.equal(service.getWorkflowStatus('run-cancel')?.status, 'running'); assert.equal(service.cancelWorkflow('run-cancel').status, 'cancelled'); release(); await assert.rejects(running, /cancelled/i); assert.equal(service.getWorkflowStatus('run-cancel')?.status, 'cancelled')
  for (const [runId, status] of [['run-completed', 'completed'], ['run-review', 'completed_with_review'], ['run-blocked', 'blocked']] as const) { service.register({ runId, workflowType: 'fixture', objective: 'fixture' }); service.markTerminal(runId, status); assert.equal(service.getWorkflowStatus(runId)?.status, status) }
  service.register({ runId: 'run-failed', workflowType: 'fixture', objective: 'fixture' }); service.markFailure('run-failed', new Error('fixture failure')); assert.equal(service.getWorkflowStatus('run-failed')?.status, 'failed')
  assert.equal(service.cancelWorkflow('run-completed').cancelled, false); await assert.rejects(async () => service.cancelWorkflow('unknown'), /not found/i)
})

test('ProductionService accepts workspace files and rejects traversal and canonical KB references', async () => {
  const root = await createKnowledgeBase({ knowledgeBaseId: 'kb-service-production' }); const project = await createKnowledgeBase({ knowledgeBaseId: 'kb-service-project' }); try {
    const workspace = join(project, 'workspace'); await mkdir(join(workspace, 'uploads'), { recursive: true }); await writeFile(join(workspace, 'uploads', 'fixture.txt'), 'fixture')
    const runs: string[] = []; const workflowService = new WorkflowService(); const service = new ProductionService({ mountedKnowledgeBaseRoot: root, workspaceRoot: workspace, cwd: project, reasoningExecutor: new NoopExecutor(), workflowService, workflowRunner: async ({ handle, documentInput, workflowRunId }): Promise<IngestionWorkflowResult> => { runs.push(documentInput.type === 'file' ? documentInput.reference : documentInput.type === 'text' ? documentInput.text : ''); return { workflowRunId, knowledgeBaseId: handle.knowledgeBaseId, status: 'completed', unitSummaries: [], candidateCounts: {}, rejectedCandidates: [], reviewItems: [], reviewSummary: { total: 0, rootCount: 0, dependencyCount: 0, byCategory: {} as never, byCandidateKind: {} as never, samplesByCategory: {} as never }, errors: [] } } })
    const result = await service.ingestDocument({ workflowRunId: 'file-run', workspaceFile: 'uploads/fixture.txt' }); assert.equal(result.status, 'completed'); assert.equal(runs.length, 1); assert.ok(runs[0]?.endsWith('fixture.txt'))
    await assert.rejects(() => service.ingestDocument({ workflowRunId: 'traversal-run', workspaceFile: '../manifest.yaml' }), /workspaceFile/i)
    await assert.rejects(() => service.ingestDocument({ workflowRunId: 'kb-file-run', workspaceFile: relative(workspace, join(root, 'manifest.yaml')) }), /workspaceFile/i)
    if (process.platform !== 'win32') { await symlink(join(root, 'manifest.yaml'), join(workspace, 'uploads', 'escape.txt')); await assert.rejects(() => service.ingestDocument({ workflowRunId: 'symlink-run', workspaceFile: 'uploads/escape.txt' }), /symlink|workspaceFile/i) }
  } finally { await removeKnowledgeBase(root); await removeKnowledgeBase(project) }
})

test('ProductionService rejects success terminals whose status and durable ReviewCase count disagree', async () => {
  const root = await createKnowledgeBase({ knowledgeBaseId: 'kb-service-terminal-invariant' })
  try {
    const reviewCase = dependentReviewCases()[0]!
    const base = { workflowRunId: 'terminal-invariant-run', knowledgeBaseId: 'kb-service-terminal-invariant', unitSummaries: [], candidateCounts: {}, rejectedCandidates: [], reviewItems: [], reviewSummary: { total: 1, rootCount: 1, dependencyCount: 0, byCategory: {} as never, byCandidateKind: {} as never, samplesByCategory: {} as never }, errors: [] } as const
    const mismatches = [
      { status: 'completed_with_review' as const, reviewCases: [] as const },
      { status: 'completed' as const, reviewCases: [reviewCase] as const },
    ]
    for (const [index, mismatch] of mismatches.entries()) {
      const workflowService = new WorkflowService()
      const runId = `terminal-invariant-run-${index}`
      const production = new ProductionService({ mountedKnowledgeBaseRoot: root, workspaceRoot: join(root, 'workspace'), reasoningExecutor: new NoopExecutor(), workflowService, workflowRunner: async (): Promise<IngestionWorkflowResult> => ({ ...base, workflowRunId: runId, ...mismatch }) })
      await assert.rejects(() => production.ingestDocument({ workflowRunId: runId, text: 'fixture' }), /inconsistent with durable ReviewCases/)
      assert.equal(workflowService.getWorkflowStatus(runId)?.status, 'failed')
    }
  } finally { await removeKnowledgeBase(root) }
})

test('Pi Application Tools expose exactly the product-level eight-tool surface', async () => {
  const root = await createKnowledgeBase({ knowledgeBaseId: 'kb-service-tools' }); try {
    const workflowService = new WorkflowService(); const tools = createResearchHubTools({ knowledgeService: new KnowledgeService(root), reviewService: new ReviewService(root), workflowService, productionService: new ProductionService({ mountedKnowledgeBaseRoot: root, workspaceRoot: join(root, 'workspace'), reasoningExecutor: new NoopExecutor(), workflowService }) })
    assert.deepEqual(tools.map((tool) => tool.name), ['researchhub_status', 'search_knowledge', 'get_knowledge_object', 'ingest_document', 'get_workflow_status', 'cancel_workflow', 'list_review_cases', 'get_review_case'])
    assert.equal(tools.some((tool) => ['create_entity', 'create_relation', 'create_claim', 'create_changeset', 'commit_changeset', 'write_registry', 'resolve_review_case'].includes(tool.name)), false)
  } finally { await removeKnowledgeBase(root) }
})

test('ProductionService cancellation uses the real ingestion Workflow and prevents Writer commit', async () => {
  const root = await createKnowledgeBase({ knowledgeBaseId: 'kb-service-cancel' }); let entered!: () => void; const enteredPromise = new Promise<void>((resolve) => { entered = resolve })
  const executor = new PiReasoningExecutor({ timeoutMs: 2_000, completion: async (_model, _context, options) => {
    if (options.metadata.operation === 'understandAndPlan') { entered(); await new Promise<never>((_resolve, reject) => { options.signal.addEventListener('abort', () => reject(new Error('fixture aborted')), { once: true }) }) }
    return JSON.stringify({})
  } })
  const workflowService = new WorkflowService(); const production = new ProductionService({ mountedKnowledgeBaseRoot: root, workspaceRoot: join(root, 'workspace'), reasoningExecutor: executor, workflowService }); const tools = createResearchHubTools({ knowledgeService: new KnowledgeService(root), reviewService: new ReviewService(root), workflowService, productionService: production })
  try {
    const before = JSON.parse(await readFile(join(root, 'manifest.yaml'), 'utf8')) as { revision: number }
    const pending = production.ingestDocument({ workflowRunId: 'cancel-real-run', text: 'Cancellation fixture' }); await enteredPromise
    assert.equal((await executeTool(tools.find((tool) => tool.name === 'get_workflow_status')!, { runId: 'cancel-real-run' })).status, 'running')
    const cancellation = await executeTool(tools.find((tool) => tool.name === 'cancel_workflow')!, { runId: 'cancel-real-run' }); assert.equal(cancellation.status, 'cancelled'); assert.equal(cancellation.cancelled, true)
    const result = await pending; assert.equal(result.status, 'cancelled'); assert.equal((await executeTool(tools.find((tool) => tool.name === 'get_workflow_status')!, { runId: 'cancel-real-run' })).status, 'cancelled')
    const after = JSON.parse(await readFile(join(root, 'manifest.yaml'), 'utf8')) as { revision: number }; assert.equal(after.revision, before.revision); assert.equal(result.committedRevision, undefined); assert.equal(result.changeSetId, undefined)
  } finally { await removeKnowledgeBase(root) }
})

test('Pi Application Tool definitions execute all eight product actions through real services', async () => {
  const root = await createKnowledgeBase({ knowledgeBaseId: 'kb-service-detail-review' }); try {
    await writeFixture(root, 2); const reviewCases = dependentReviewCases(); await persistReviewCases({ rootRef: root, knowledgeBaseId: 'kb-service-detail-review', producerRunId: 'review-detail-run', cases: reviewCases, createdAt: '2026-09-06T00:00:00.000Z', knowledgeBaseRevisionAtCreation: 0 })
    const workflowService = new WorkflowService(); const productionService = new ProductionService({ mountedKnowledgeBaseRoot: root, workspaceRoot: join(root, 'workspace'), reasoningExecutor: new IngestionFixtureExecutor(), workflowService }); const tools = createResearchHubTools({ knowledgeService: new KnowledgeService(root), reviewService: new ReviewService(root), workflowService, productionService })
    assert.deepEqual(tools.map((tool) => tool.name), ['researchhub_status', 'search_knowledge', 'get_knowledge_object', 'ingest_document', 'get_workflow_status', 'cancel_workflow', 'list_review_cases', 'get_review_case'])
    const status = await executeTool(tools[0]!, {}); assert.equal((status.knowledgeBase as { knowledgeBaseId: string }).knowledgeBaseId, 'kb-service-detail-review')
    const search = await executeTool(tools[1]!, { query: 'ACME', limit: 1 }); assert.equal((search.results as readonly { ref: string }[])[0]?.ref, 'entity:fixture-000')
    const object = await executeTool(tools[2]!, { ref: 'entity:fixture-000', relatedLimit: 1 }); assert.equal(object.kind, 'Entity')
    const ingestion = await executeTool(tools[3]!, { workflowRunId: 'tool-ingest-run', text: 'Tool fixture' }); assert.equal(ingestion.status, 'completed', JSON.stringify(ingestion))
    const workflow = await executeTool(tools[4]!, { runId: 'tool-ingest-run' }); assert.equal(workflow.status, 'completed')
    const terminalCancel = await executeTool(tools[5]!, { runId: 'tool-ingest-run' }); assert.equal(terminalCancel.cancelled, false); assert.equal(terminalCancel.reason, 'already_terminal')
    const list = await executeTool(tools[6]!, { limit: 1, actionability: 'knowledge_decision', category: 'theme_ambiguity', producerRunId: 'review-detail-run' }); assert.equal(list.total, 1); const reviewCaseId = (list.cases as readonly { reviewCaseId: string }[])[0]!.reviewCaseId
    const detail = await executeTool(tools[7]!, { reviewCaseId, dependentLimit: 1 }); assert.equal(detail.reviewCaseId, reviewCaseId); assert.equal(detail.totalDependentProposals, 25); assert.equal((detail.dependentProposalSamples as readonly unknown[]).length, 1)
    const missing = await executeTool(tools[4]!, { runId: 'missing-tool-run' }); assert.equal(missing.code, 'not_found')
    assert.equal(tools.some((tool) => ['create_entity', 'create_relation', 'create_claim', 'create_changeset', 'commit_changeset', 'write_registry', 'resolve_review_case'].includes(tool.name)), false)
  } finally { await removeKnowledgeBase(root) }
})
