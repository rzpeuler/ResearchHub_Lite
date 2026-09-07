import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { fauxAssistantMessage, fauxProvider } from '@earendil-works/pi-ai'
import { ModelRuntime } from '@earendil-works/pi-coding-agent'
import { createResearchHubApplicationRuntime } from '../../app/runtime/application-runtime.ts'
import { toSafeConversationMessage } from '../../app/runtime/session-runtime.ts'
import { WorkflowService } from '../../app/services/workflow-service.ts'
import type { ReasoningCapabilities, ReasoningExecutor, ReasoningRequest, ReasoningResult } from '../../plugins/reasoning/contracts.ts'

const capabilities: ReasoningCapabilities = { maxContextTokens: 100_000, maxOutputTokens: 10_000, structuredOutputSupport: true, maxConcurrency: 4 }

class FixtureExecutor implements ReasoningExecutor {
  capabilities(): ReasoningCapabilities { return capabilities }
  async execute(request: ReasoningRequest): Promise<ReasoningResult> { return { operation: request.operation, output: {} } as ReasoningResult }
}

async function makeFixture() {
  const root = await mkdtemp(join(tmpdir(), 'researchhub-runtime-slice-a-'))
  const cwd = join(root, 'cwd')
  const agentDir = join(root, 'agent')
  const sessionDir = join(root, 'sessions')
  await mkdir(cwd, { recursive: true })
  await mkdir(agentDir, { recursive: true })
  const modelRuntime = await ModelRuntime.create({ authPath: join(agentDir, 'auth.json'), modelsPath: null, refreshOnCreate: false, allowModelNetwork: false })
  const faux = fauxProvider({ provider: `researchhub-runtime-${Date.now()}-${Math.random()}`, models: [{ id: 'fixture-model' }] })
  modelRuntime.registerNativeProvider(faux.provider)
  return { root, cwd, agentDir, sessionDir, modelRuntime, faux }
}

test('Slice A uses persistent Pi sessions and restores a prior conversation', async () => {
  const fixture = await makeFixture()
  let runtime1: Awaited<ReturnType<typeof createResearchHubApplicationRuntime>> | undefined
  let runtime2: Awaited<ReturnType<typeof createResearchHubApplicationRuntime>> | undefined
  try {
    runtime1 = await createResearchHubApplicationRuntime({ cwd: fixture.cwd, agentDir: fixture.agentDir, sessionDir: fixture.sessionDir, modelRuntime: fixture.modelRuntime, model: fixture.faux.getModel(), reasoningExecutor: new FixtureExecutor() })
    assert.equal(runtime1.sessionManager.isPersisted(), true)
    fixture.faux.setResponses([fauxAssistantMessage('persisted answer')])
    await runtime1.sessionRuntime.prompt('persist this conversation')
    const originalId = runtime1.sessionRuntime.getCurrentState().conversationId
    assert.equal(runtime1.sessionRuntime.getCurrentMessages().some((message) => message.content === 'persisted answer'), true)
    await runtime1.close()
    runtime1 = undefined

    runtime2 = await createResearchHubApplicationRuntime({ cwd: fixture.cwd, agentDir: fixture.agentDir, sessionDir: fixture.sessionDir, modelRuntime: fixture.modelRuntime, model: fixture.faux.getModel(), reasoningExecutor: new FixtureExecutor() })
    const listed = await runtime2.sessionRuntime.listConversations()
    assert.equal(listed.some((conversation) => conversation.conversationId === originalId), true)
    await runtime2.sessionRuntime.resumeConversation(originalId)
    assert.equal(runtime2.sessionRuntime.getCurrentState().conversationId, originalId)
    assert.equal(runtime2.sessionRuntime.getCurrentMessages().some((message) => message.content === 'persisted answer'), true)
  } finally {
    await runtime2?.close()
    await runtime1?.close()
    await rm(fixture.root, { recursive: true, force: true })
  }
})

test('Slice A replaces only the active Pi conversation and preserves services and Workflow runs', async () => {
  const fixture = await makeFixture()
  let runtime: Awaited<ReturnType<typeof createResearchHubApplicationRuntime>> | undefined
  try {
    runtime = await createResearchHubApplicationRuntime({ cwd: fixture.cwd, agentDir: fixture.agentDir, sessionDir: fixture.sessionDir, modelRuntime: fixture.modelRuntime, model: fixture.faux.getModel(), reasoningExecutor: new FixtureExecutor() })
    const initialId = runtime.sessionRuntime.getCurrentState().conversationId
    fixture.faux.setResponses([fauxAssistantMessage('initial answer')])
    await runtime.sessionRuntime.prompt('create a persisted first conversation')
    const serviceRefs = { knowledge: runtime.knowledgeService, review: runtime.reviewService, workflow: runtime.workflowService, production: runtime.productionService }
    let release!: () => void
    const gate = new Promise<void>((resolve) => { release = resolve })
    runtime.workflowService.register({ runId: 'slice-a-running', workflowType: 'fixture', objective: 'independence' })
    const run = runtime.workflowService.start('slice-a-running', async () => { await gate; return { status: 'completed' as const } })
    await new Promise((resolve) => setImmediate(resolve))
    assert.equal(runtime.workflowService.getWorkflowStatus('slice-a-running')?.status, 'running')

    await runtime.sessionRuntime.createConversation('second')
    const secondId = runtime.sessionRuntime.getCurrentState().conversationId
    assert.notEqual(secondId, initialId)
    assert.strictEqual(runtime.knowledgeService, serviceRefs.knowledge)
    assert.strictEqual(runtime.reviewService, serviceRefs.review)
    assert.strictEqual(runtime.workflowService, serviceRefs.workflow)
    assert.strictEqual(runtime.productionService, serviceRefs.production)
    assert.equal(runtime.workflowService.getWorkflowStatus('slice-a-running')?.status, 'running')

    await runtime.sessionRuntime.abort()
    assert.equal(runtime.workflowService.getWorkflowStatus('slice-a-running')?.status, 'running')
    runtime.workflowService.cancelWorkflow('slice-a-running')
    release()
    await run
    assert.equal(runtime.workflowService.getWorkflowStatus('slice-a-running')?.status, 'cancelled')

    const conversations = await runtime.sessionRuntime.listConversations()
    assert.equal(conversations.some((conversation) => conversation.conversationId === initialId), true)
    await runtime.sessionRuntime.switchConversation(initialId)
    assert.equal(runtime.sessionRuntime.getCurrentState().conversationId, initialId)
  } finally {
    await runtime?.close()
    await rm(fixture.root, { recursive: true, force: true })
  }
})

test('Slice A does not couple Pi conversation abort to an independent WorkflowService', async () => {
  const workflow = new WorkflowService()
  let release!: () => void
  const pending = new Promise<void>((resolve) => { release = resolve })
  workflow.register({ runId: 'independent', workflowType: 'fixture', objective: 'independence' })
  const run = workflow.start('independent', async () => { await pending; return { status: 'completed' as const } })
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(workflow.getWorkflowStatus('independent')?.status, 'running')
  release()
  await run
  assert.equal(workflow.getWorkflowStatus('independent')?.status, 'completed')
})

test('Slice A serializes concurrent conversation replacement operations', async () => {
  const fixture = await makeFixture()
  let runtime: Awaited<ReturnType<typeof createResearchHubApplicationRuntime>> | undefined
  try {
    runtime = await createResearchHubApplicationRuntime({ cwd: fixture.cwd, agentDir: fixture.agentDir, sessionDir: fixture.sessionDir, modelRuntime: fixture.modelRuntime, model: fixture.faux.getModel(), reasoningExecutor: new FixtureExecutor() })
    const results = await Promise.all([runtime.sessionRuntime.createConversation('first'), runtime.sessionRuntime.createConversation('second')])
    assert.notEqual(results[0].conversationId, results[1].conversationId)
    assert.equal(results[0].name, 'first')
    assert.equal(results[1].name, 'second')
    assert.equal(runtime.sessionRuntime.getCurrentState().conversationId, results[1].conversationId)
  } finally {
    await runtime?.close()
    await rm(fixture.root, { recursive: true, force: true })
  }
})

test('Slice A rejects unsafe tool results and projects only fixed product summaries', () => {
  const secret = 'SECRET raw JSON C:\\workspace\\uploads\\id\\file.txt command=cat api_key=hidden'
  assert.equal(toSafeConversationMessage({ role: 'toolResult', toolName: 'bash', content: [{ type: 'text', text: secret }], timestamp: Date.now(), isError: false }), undefined)
  const safe = toSafeConversationMessage({ role: 'toolResult', toolName: 'ingest_document', content: [{ type: 'text', text: JSON.stringify({ secret, path: 'C:\\private', command: 'rm -rf' }) }], timestamp: Date.now(), isError: false })
  assert.deepEqual(safe?.content, 'Document ingestion completed')
  assert.equal(safe?.content.includes('SECRET'), false)
  assert.equal(safe?.content.includes('workspace'), false)
})

test('Slice A state access rejects after dispose', async () => {
  const fixture = await makeFixture()
  let runtime: Awaited<ReturnType<typeof createResearchHubApplicationRuntime>> | undefined
  try {
    runtime = await createResearchHubApplicationRuntime({ cwd: fixture.cwd, agentDir: fixture.agentDir, sessionDir: fixture.sessionDir, modelRuntime: fixture.modelRuntime, model: fixture.faux.getModel(), reasoningExecutor: new FixtureExecutor() })
    await runtime.close()
    assert.throws(() => runtime!.sessionRuntime.getCurrentState(), /closed/)
  } finally {
    await runtime?.close()
    await rm(fixture.root, { recursive: true, force: true })
  }
})

test('Slice A dispose retries after session cleanup failure and still attempts owned ModelRuntime cleanup', async () => {
  const fixture = await makeFixture()
  let runtime: Awaited<ReturnType<typeof createResearchHubApplicationRuntime>> | undefined
  try {
    runtime = await createResearchHubApplicationRuntime({ cwd: fixture.cwd, agentDir: fixture.agentDir, sessionDir: fixture.sessionDir, model: fixture.faux.getModel(), reasoningExecutor: new FixtureExecutor() })
    let sessionAttempts = 0
    const sessionRuntime = runtime.sessionRuntime as unknown as { dispose: () => Promise<void> }
    const originalDispose = sessionRuntime.dispose.bind(runtime.sessionRuntime)
    sessionRuntime.dispose = async () => { sessionAttempts += 1; if (sessionAttempts === 1) throw new Error('session cleanup fixture failure'); return originalDispose() }
    let modelAttempts = 0
    Object.defineProperty(runtime.modelRuntime, 'dispose', { configurable: true, value: async () => { modelAttempts += 1; if (modelAttempts === 1) throw new Error('model cleanup fixture failure') } })
    await assert.rejects(() => runtime!.close(), /disposal failed|cleanup fixture failure/)
    assert.equal(modelAttempts, 1)
    await runtime!.close()
    assert.equal(sessionAttempts, 2)
    assert.equal(modelAttempts, 2)
    assert.throws(() => runtime!.sessionRuntime.getCurrentState(), /closed/)
  } finally {
    await runtime?.close()
    await rm(fixture.root, { recursive: true, force: true })
  }
})
