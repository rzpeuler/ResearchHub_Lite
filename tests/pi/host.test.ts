import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rename, rm } from 'node:fs/promises'
import { dirname, join, relative } from 'node:path'
import { tmpdir } from 'node:os'
import { fauxAssistantMessage, fauxProvider, fauxToolCall } from '@earendil-works/pi-ai'
import { ModelRuntime } from '@earendil-works/pi-coding-agent'
import { createResearchHubPiSession } from '../../app/pi/session.ts'
import { BASH_ISOLATION_GAP, createProtectedBashOperations, createProtectedEditOperations, createProtectedWriteOperations } from '../../app/pi/security.ts'
import { createResearchHubTools } from '../../app/pi/tools.ts'
import type { ReasoningCapabilities, ReasoningExecutor, ReasoningRequest, ReasoningResult } from '../../plugins/reasoning/contracts.ts'
import { PiReasoningExecutor } from '../../plugins/reasoning/pi/executor.ts'
import { KnowledgeCurationSkill } from '../../skills/knowledge-curation/skill.ts'
import { runRawDocumentKnowledgeIngestion } from '../../workflows/raw-document-knowledge-ingestion/workflow.ts'
import { KnowledgeBaseRegistry } from '../../knowledge/registry/registry.ts'
import { createKnowledgeBase, removeKnowledgeBase } from '../knowledge/helpers.ts'

const capabilities: ReasoningCapabilities = { maxContextTokens: 100_000, maxOutputTokens: 10_000, structuredOutputSupport: true, maxConcurrency: 4 }

class FixtureExecutor implements ReasoningExecutor {
  readonly calls: ReasoningRequest[] = []
  capabilities(): ReasoningCapabilities { return capabilities }
  async execute(request: ReasoningRequest): Promise<ReasoningResult> {
    this.calls.push(structuredClone(request))
    if (request.operation === 'understandAndPlan') return { operation: request.operation, output: { reportMap: { sourceAssessment: { summary: 'fixture', sourceType: 'unknown', reliability: 'unknown' }, researchScope: 'fixture', majorTopics: [], majorEntityMentions: [], majorConclusions: [], sectionSemantics: [{ sectionRef: 'section-0001', summary: 'fixture' }], semanticDependencies: [], themeHypotheses: [], uncertainty: [] }, extractionPlanProposal: { units: [{ proposedUnitId: 'unit-1', topic: 'fixture', semanticPurpose: 'fixture', primaryRefs: [{ kind: 'section', sectionId: 'section-0001' }], contextRefs: [] }], excludedRefs: [] } } }
    if (request.operation === 'extractKnowledge') return { operation: request.operation, output: { entities: [], relations: [], claims: [] } }
    return { operation: request.operation, output: { outcome: 'uncertain', rationale: 'fixture' } }
  }
}

test('ResearchHub custom tool enters the real Workflow/Core boundary', async () => {
  const root = await createKnowledgeBase({ knowledgeBaseId: 'kb-pi-tool' })
  try {
    const executor = new FixtureExecutor()
    const tool = createResearchHubTools({ mountedKnowledgeBaseRoot: root, reasoningExecutor: executor }).find((item) => item.name === 'researchhub_ingest_text')!
    const result = await tool.execute('call-1', { text: 'Fixture text', workflowRunId: 'pi-tool-run' }, undefined, undefined, {} as never)
    assert.equal(result.content.length > 0, true)
    assert.equal(executor.calls.some((call) => call.operation === 'understandAndPlan'), true)
  } finally { await removeKnowledgeBase(root) }
})

test('programmatic Pi session streams a model-selected ResearchHub tool call', async () => {
  const root = await createKnowledgeBase({ knowledgeBaseId: 'kb-pi-session' })
  const faux = fauxProvider({ provider: 'researchhub-faux', models: [{ id: 'fixture-model' }] })
  const runtime = await ModelRuntime.create({ modelsPath: null, refreshOnCreate: false, allowModelNetwork: false })
  runtime.registerNativeProvider(faux.provider)
  faux.setResponses([
    fauxAssistantMessage(fauxToolCall('researchhub_status', { rootRef: root }, { id: 'status-call' })),
    fauxAssistantMessage('ResearchHub status was read.'),
  ])
  try {
    const agentDir = await mkdtemp(join(tmpdir(), 'researchhub-pi-agent-'))
    const session = await createResearchHubPiSession({ cwd: root, agentDir, mountedKnowledgeBaseRoot: root, reasoningExecutor: new FixtureExecutor(), modelRuntime: runtime, model: faux.getModel() })
    const events: string[] = []
    session.session.subscribe((event) => { events.push(event.type) })
    await session.session.prompt('Check the mounted Knowledge Base status.')
    assert.equal(events.includes('tool_execution_start'), true)
    assert.equal(events.includes('tool_execution_end'), true)
    assert.equal(session.session.state.messages.some((message) => message.role === 'toolResult' && message.toolCallId === 'status-call'), true)
    assert.equal(session.agentDir, agentDir)
    assert.notEqual(session.agentDir, join(root, '.pi', 'agent'))
    session.session.dispose()
    await rm(agentDir, { recursive: true, force: true })
  } finally { await removeKnowledgeBase(root) }
})

test('canonical mutation wrappers block write/edit and honestly identify bash isolation gap', async () => {
  const root = await mkdtemp(join(tmpdir(), 'researchhub-pi-security-'))
  const write = createProtectedWriteOperations(root, { writeFile: async () => undefined, mkdir: async () => undefined })
  await assert.rejects(() => write.writeFile(join(root, 'manifest.yaml'), 'manual'), /Canonical Knowledge Base is protected/)
  const edit = createProtectedEditOperations(root, { readFile: async () => Buffer.from('old'), access: async () => undefined, writeFile: async () => undefined })
  await assert.rejects(() => edit.writeFile(join(root, 'manifest.yaml'), 'manual'), /Canonical Knowledge Base is protected/)
  assert.equal(BASH_ISOLATION_GAP, 'BASH_ISOLATION_GAP')
})

test('ResearchHub tools do not allow root override or cancelled Workflow start', async () => {
  const root = await createKnowledgeBase({ knowledgeBaseId: 'kb-pi-boundary' })
  const other = await createKnowledgeBase({ knowledgeBaseId: 'kb-pi-other' })
  try {
    const executor = new FixtureExecutor()
    const tools = createResearchHubTools({ mountedKnowledgeBaseRoot: root, reasoningExecutor: executor })
    const ingest = tools.find((item) => item.name === 'researchhub_ingest_text')!
    await assert.rejects(() => ingest.execute('override', { text: 'x', workflowRunId: 'safe-run', rootRef: other }, undefined, undefined, {} as never), /cannot override/)
    const controller = new AbortController()
    controller.abort()
    const result = await ingest.execute('cancelled', { text: 'x', workflowRunId: 'safe-run' }, controller.signal, undefined, {} as never)
    assert.equal(result.content.length > 0, true)
    assert.equal(executor.calls.length, 0)
  } finally { await removeKnowledgeBase(root); await removeKnowledgeBase(other) }
})

test('Pi tool-call boundary rejects direct write, edit, and explicit-path bash mutation attempts', async () => {
  const root = await createKnowledgeBase({ knowledgeBaseId: 'kb-pi-protected' })
  try {
    const attempts: Array<{ name: string; arguments: Record<string, unknown> }> = [
      { name: 'write', arguments: { path: join(root, 'manifest.yaml'), content: 'manual' } },
      { name: 'write', arguments: { path: 'manifest.yaml', content: 'manual' } },
      { name: 'edit', arguments: { path: join(root, 'manifest.yaml'), edits: [{ oldText: 'active', newText: 'archived' }] } },
      { name: 'edit', arguments: { path: 'manifest.yaml', edits: [{ oldText: 'active', newText: 'archived' }] } },
      { name: 'bash', arguments: { command: `echo manual > "${join(root, 'manifest.yaml')}"` } },
      { name: 'bash', arguments: { command: 'echo manual > manifest.yaml' } },
    ]
    for (const [index, attempt] of attempts.entries()) {
      const faux = fauxProvider({ provider: `researchhub-protected-${index}`, models: [{ id: 'fixture-model' }] })
      const runtime = await ModelRuntime.create({ modelsPath: null, refreshOnCreate: false, allowModelNetwork: false })
      runtime.registerNativeProvider(faux.provider)
      faux.setResponses([fauxAssistantMessage(fauxToolCall(attempt.name, attempt.arguments, { id: `blocked-${index}` })), fauxAssistantMessage('blocked')])
      const agentDir = await mkdtemp(join(tmpdir(), 'researchhub-pi-agent-'))
      const created = await createResearchHubPiSession({ cwd: root, agentDir, mountedKnowledgeBaseRoot: root, reasoningExecutor: new FixtureExecutor(), modelRuntime: runtime, model: faux.getModel() })
      await created.session.prompt('Attempt the requested operation.')
      const blocked = created.session.state.messages.find((message) => message.role === 'toolResult' && message.toolCallId === `blocked-${index}`)
      assert.equal(blocked?.role, 'toolResult', `${attempt.name} must produce a tool result`)
      if (blocked?.role === 'toolResult') assert.equal(blocked.isError, true, `${attempt.name} must fail before canonical mutation`)
      created.session.dispose()
      await rm(agentDir, { recursive: true, force: true })
    }
  } finally { await removeKnowledgeBase(root) }
})

test('Pi-backed deterministic ingestion derives four-way ExtractionUnit concurrency', async () => {
  const root = await createKnowledgeBase({ knowledgeBaseId: 'kb-pi-concurrency' })
  let active = 0
  let peak = 0
  const executor = new PiReasoningExecutor({
    completion: async (_model, _context, options) => {
      if (options.metadata.operation === 'understandAndPlan') return JSON.stringify({
        reportMap: { sourceAssessment: { summary: 'fixture', sourceType: 'unknown', reliability: 'unknown' }, researchScope: 'fixture', majorTopics: [], majorEntityMentions: [], majorConclusions: [], sectionSemantics: [{ sectionRef: 'section-0001', summary: 'fixture' }], semanticDependencies: [], themeHypotheses: [], uncertainty: [] },
        extractionPlanProposal: {
          units: ['000001', '000002', '000003', '000004'].map((id) => ({ proposedUnitId: `unit-${id}`, topic: 'fixture', semanticPurpose: 'independent fixture extraction', primaryRefs: [{ kind: 'block', blockId: `block-${id}` }], contextRefs: [] })),
          excludedRefs: [],
        },
      })
      if (options.metadata.operation === 'extractKnowledge') {
        active += 1
        peak = Math.max(peak, active)
        await new Promise((resolve) => setTimeout(resolve, 20))
        active -= 1
        return JSON.stringify({ entities: [], relations: [], claims: [] })
      }
      return JSON.stringify({ outcome: 'uncertain', rationale: 'deterministic fixture' })
    },
  })
  try {
    const result = await runRawDocumentKnowledgeIngestion({
      handle: await new KnowledgeBaseRegistry().mount(root),
      documentInput: { type: 'text', text: 'Alpha.\n\nBeta.\n\nGamma.\n\nDelta.', originalFilename: 'pi-concurrency.txt', mediaType: 'text/plain' },
      skill: new KnowledgeCurationSkill({ executor }),
      workflowRunId: 'pi-concurrency-run',
      config: { maxConcurrency: 4 },
    })
    assert.equal(executor.capabilities().maxConcurrency, 4)
    assert.equal(result.acceptedPlan?.units.length, 4)
    assert.equal(result.extractionConcurrency, 4)
    assert.equal(result.peakExtractionConcurrency, 4)
    assert.equal(peak, 4)
  } finally { await removeKnowledgeBase(root) }
})

test('nested canonical Knowledge Base blocks absolute and cwd-relative write/edit/bash paths', async () => {
  const projectRoot = await mkdtemp(join(tmpdir(), 'researchhub-pi-project-'))
  const temporaryRoot = await createKnowledgeBase({ knowledgeBaseId: 'kb-test' })
  const knowledgeBaseRoot = join(projectRoot, 'runtime-data', 'knowledge-bases', 'kb-test')
  const agentDir = await mkdtemp(join(tmpdir(), 'researchhub-pi-agent-'))
  try {
    await mkdir(dirname(knowledgeBaseRoot), { recursive: true })
    await rename(temporaryRoot, knowledgeBaseRoot)
    const relativeManifest = relative(projectRoot, join(knowledgeBaseRoot, 'manifest.yaml'))

    const write = createProtectedWriteOperations(knowledgeBaseRoot, { writeFile: async () => undefined, mkdir: async () => undefined }, projectRoot)
    await assert.rejects(() => write.writeFile(join(knowledgeBaseRoot, 'manifest.yaml'), 'manual'), /Canonical Knowledge Base is protected/)
    await assert.rejects(() => write.writeFile(relativeManifest, 'manual'), /Canonical Knowledge Base is protected/)

    const edit = createProtectedEditOperations(knowledgeBaseRoot, { readFile: async () => Buffer.from('old'), access: async () => undefined, writeFile: async () => undefined }, projectRoot)
    await assert.rejects(() => edit.writeFile(join(knowledgeBaseRoot, 'manifest.yaml'), 'manual'), /Canonical Knowledge Base is protected/)
    await assert.rejects(() => edit.writeFile(relativeManifest, 'manual'), /Canonical Knowledge Base is protected/)

    const bashCalls: string[] = []
    const bash = createProtectedBashOperations(knowledgeBaseRoot, { exec: async (command) => { bashCalls.push(command); return { exitCode: 0 } } })
    const options = { onData: () => undefined }
    await assert.rejects(() => bash.exec(`echo manual > "${join(knowledgeBaseRoot, 'manifest.yaml')}"`, projectRoot, options), /Canonical Knowledge Base is protected/)
    await assert.rejects(() => bash.exec(`echo manual > "${relativeManifest}"`, projectRoot, options), /Canonical Knowledge Base is protected/)
    await bash.exec('echo harmless', projectRoot, options)
    const archivePath = join(projectRoot, 'runtime-data', 'knowledge-bases', 'kb-test-archive', 'manifest.yaml')
    const archiveRelativePath = relative(projectRoot, archivePath)
    await bash.exec(`echo harmless > "${archivePath}"`, projectRoot, options)
    await bash.exec(`echo harmless > "${archiveRelativePath}"`, projectRoot, options)
    assert.deepEqual(bashCalls, ['echo harmless', `echo harmless > "${archivePath}"`, `echo harmless > "${archiveRelativePath}"`])

    const faux = fauxProvider({ provider: 'researchhub-nested-protected', models: [{ id: 'fixture-model' }] })
    const runtime = await ModelRuntime.create({ modelsPath: null, refreshOnCreate: false, allowModelNetwork: false })
    runtime.registerNativeProvider(faux.provider)
    const attempts: Array<{ name: string; arguments: Record<string, unknown> }> = [
      { name: 'write', arguments: { path: join(knowledgeBaseRoot, 'manifest.yaml'), content: 'manual' } },
      { name: 'write', arguments: { path: relativeManifest, content: 'manual' } },
      { name: 'edit', arguments: { path: join(knowledgeBaseRoot, 'manifest.yaml'), edits: [{ oldText: 'active', newText: 'archived' }] } },
      { name: 'edit', arguments: { path: relativeManifest, edits: [{ oldText: 'active', newText: 'archived' }] } },
      { name: 'bash', arguments: { command: `echo manual > "${join(knowledgeBaseRoot, 'manifest.yaml')}"` } },
      { name: 'bash', arguments: { command: `echo manual > "${relativeManifest}"` } },
    ]
    for (const [index, attempt] of attempts.entries()) {
      faux.setResponses([fauxAssistantMessage(fauxToolCall(attempt.name, attempt.arguments, { id: `nested-blocked-${index}` })), fauxAssistantMessage('blocked')])
      const created = await createResearchHubPiSession({ cwd: projectRoot, agentDir, mountedKnowledgeBaseRoot: knowledgeBaseRoot, reasoningExecutor: new FixtureExecutor(), modelRuntime: runtime, model: faux.getModel() })
      await created.session.prompt('Attempt the requested operation.')
      const blocked = created.session.state.messages.find((message) => message.role === 'toolResult' && message.toolCallId === `nested-blocked-${index}`)
      assert.equal(blocked?.role, 'toolResult')
      if (blocked?.role === 'toolResult') assert.equal(blocked.isError, true)
      created.session.dispose()
    }
  } finally {
    await rm(agentDir, { recursive: true, force: true })
    await rm(projectRoot, { recursive: true, force: true })
    await rm(temporaryRoot, { recursive: true, force: true })
  }
})
