import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { fauxAssistantMessage, fauxProvider, fauxToolCall } from '@earendil-works/pi-ai'
import { ModelRuntime } from '@earendil-works/pi-coding-agent'
import { createResearchHubPiSession } from '../../app/pi/session.ts'
import { BASH_ISOLATION_GAP, createProtectedEditOperations, createProtectedWriteOperations } from '../../app/pi/security.ts'
import { createResearchHubTools } from '../../app/pi/tools.ts'
import type { ReasoningCapabilities, ReasoningExecutor, ReasoningRequest, ReasoningResult } from '../../plugins/reasoning/contracts.ts'
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
    const session = await createResearchHubPiSession({ cwd: root, mountedKnowledgeBaseRoot: root, reasoningExecutor: new FixtureExecutor(), modelRuntime: runtime, model: faux.getModel() })
    const events: string[] = []
    session.session.subscribe((event) => { events.push(event.type) })
    await session.session.prompt('Check the mounted Knowledge Base status.')
    assert.equal(events.includes('tool_execution_start'), true)
    assert.equal(events.includes('tool_execution_end'), true)
    assert.equal(session.session.state.messages.some((message) => message.role === 'toolResult' && message.toolCallId === 'status-call'), true)
    session.session.dispose()
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
      const created = await createResearchHubPiSession({ cwd: root, mountedKnowledgeBaseRoot: root, reasoningExecutor: new FixtureExecutor(), modelRuntime: runtime, model: faux.getModel() })
      await created.session.prompt('Attempt the requested operation.')
      const blocked = created.session.state.messages.find((message) => message.role === 'toolResult' && message.toolCallId === `blocked-${index}`)
      assert.equal(blocked?.role, 'toolResult', `${attempt.name} must produce a tool result`)
      if (blocked?.role === 'toolResult') assert.equal(blocked.isError, true, `${attempt.name} must fail before canonical mutation`)
      created.session.dispose()
    }
  } finally { await removeKnowledgeBase(root) }
})
