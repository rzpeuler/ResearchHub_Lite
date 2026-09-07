import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createHash } from 'node:crypto'
import { Readable } from 'node:stream'
import { createServer as createHttpServer } from 'node:http'
import { EventEmitter } from 'node:events'
import { fauxProvider } from '@earendil-works/pi-ai'
import { ModelRuntime } from '@earendil-works/pi-coding-agent'
import { AttachmentService, type AttachmentRef } from '../../app/runtime/attachment-service.ts'
import { createResearchHubApplicationRuntime } from '../../app/runtime/application-runtime.ts'
import { ResearchHubRuntimeServer, type RuntimeServerInfo } from '../../app/runtime/server.ts'
import { ProductionService } from '../../app/services/production-service.ts'
import { WorkflowService } from '../../app/services/workflow-service.ts'
import type { IngestionWorkflowResult } from '../../workflows/raw-document-knowledge-ingestion/contracts.ts'
import type { ReasoningCapabilities, ReasoningExecutor } from '../../plugins/reasoning/contracts.ts'
import { createKnowledgeBase, removeKnowledgeBase } from '../knowledge/helpers.ts'

const capabilities: ReasoningCapabilities = { maxContextTokens: 100_000, maxOutputTokens: 10_000, structuredOutputSupport: true, maxConcurrency: 4 }
class FixtureExecutor implements ReasoningExecutor { capabilities(): ReasoningCapabilities { return capabilities } async execute(request: Parameters<ReasoningExecutor['execute']>[0]) { return { operation: request.operation, output: {} } as never } }
class FakeSseResponse extends EventEmitter {
  readonly writes: string[] = []
  writable = true
  destroyed = false
  writableEnded = false
  constructor(private readonly writeResults: boolean[]) { super() }
  writeHead(): void {}
  write(frame: string): boolean { this.writes.push(frame); return this.writeResults.length > 0 ? this.writeResults.shift()! : true }
  end(): void { this.writableEnded = true; this.writable = false }
}

function responseResult(): IngestionWorkflowResult { return { workflowRunId: 'fixture', knowledgeBaseId: 'fixture-kb', status: 'completed', unitSummaries: [], candidateCounts: {}, rejectedCandidates: [], reviewItems: [], reviewSummary: { total: 0, rootCount: 0, dependencyCount: 0, byCategory: {}, byCandidateKind: {}, samplesByCategory: {} }, errors: [] } as unknown as IngestionWorkflowResult }

async function makeRuntimeFixture() {
  const root = await mkdtemp(join(tmpdir(), 'researchhub-runtime-slice-c-'))
  const cwd = join(root, 'cwd'); const agentDir = join(root, 'agent'); const sessionDir = join(root, 'sessions')
  await mkdir(cwd, { recursive: true }); await mkdir(agentDir, { recursive: true })
  const modelRuntime = await ModelRuntime.create({ authPath: join(agentDir, 'auth.json'), modelsPath: null, refreshOnCreate: false, allowModelNetwork: false })
  const faux = fauxProvider({ provider: `researchhub-runtime-slice-c-${Date.now()}-${Math.random()}`, models: [{ id: 'fixture-model' }] })
  modelRuntime.registerNativeProvider(faux.provider)
  const runtime = await createResearchHubApplicationRuntime({ cwd, agentDir, sessionDir, modelRuntime, model: faux.getModel(), reasoningExecutor: new FixtureExecutor() })
  return { root, cwd, agentDir, sessionDir, modelRuntime, runtime, faux }
}

async function multipartBody(fields: { readonly name: string; readonly value: Blob; readonly filename?: string }[]): Promise<{ readonly body: AsyncIterable<Uint8Array>; readonly contentType: string }> {
  const form = new FormData()
  for (const field of fields) form.append(field.name, field.value, field.filename)
  const request = new Request('http://127.0.0.1/upload', { method: 'POST', body: form })
  return { body: Readable.fromWeb(request.body as unknown as Parameters<typeof Readable.fromWeb>[0]), contentType: request.headers.get('content-type')! }
}

async function* oneByteChunks(body: AsyncIterable<Uint8Array>): AsyncIterable<Uint8Array> {
  for await (const chunk of body) for (let index = 0; index < chunk.length; index += 1) yield chunk.subarray(index, index + 1)
}

test('Slice C AttachmentService streams, hashes, normalizes, and keeps upload outside Raw', async () => {
  const root = await mkdtemp(join(tmpdir(), 'researchhub-attachment-c-'))
  try {
    const service = new AttachmentService({ workspaceRoot: root, maxBytes: 100 })
    const request = await multipartBody([{ name: 'file', value: new Blob(['hello'], { type: 'text/plain' }), filename: '../nested\\report.txt' }])
    const attachment = await service.upload(request.body, request.contentType)
    assert.equal(attachment.filename, 'report.txt'); assert.equal(attachment.workspaceRelativePath, 'uploads/' + attachment.attachmentId + '/report.txt'); assert.equal('path' in attachment, false)
    assert.equal((await service.getAttachment(attachment.attachmentId)).sha256.length, 64)
    assert.deepEqual(await readdir(join(root, 'uploads', attachment.attachmentId)), ['metadata.json', 'report.txt'])
    const reserved = await multipartBody([{ name: 'file', value: new Blob(['reserved content'], { type: 'text/plain' }), filename: 'metadata.json' }])
    const reservedAttachment = await service.upload(reserved.body, reserved.contentType)
    assert.notEqual(reservedAttachment.filename.toLowerCase(), 'metadata.json')
    assert.equal((await service.getAttachment(reservedAttachment.attachmentId)).size, 'reserved content'.length)
    assert.match(await readFile(join(root, reservedAttachment.workspaceRelativePath), 'utf8'), /reserved content/)
    assert.equal((await readdir(root)).includes('raw'), false)
  } finally { await rm(root, { recursive: true, force: true }) }
})

test('Slice C AttachmentService preserves multipart boundaries across one-byte chunks', async () => {
  const root = await mkdtemp(join(tmpdir(), 'researchhub-attachment-one-byte-c-'))
  try {
    const service = new AttachmentService({ workspaceRoot: root, maxBytes: 100 })
    const request = await multipartBody([{ name: 'file', value: new Blob(['one-byte multipart content'], { type: 'text/plain' }), filename: 'one-byte.txt' }])
    const attachment = await service.upload(oneByteChunks(request.body), request.contentType)
    assert.equal(attachment.filename, 'one-byte.txt'); assert.equal(attachment.size, 'one-byte multipart content'.length)
    assert.equal((await service.getAttachment(attachment.attachmentId)).sha256, attachment.sha256)
    assert.equal(await readFile(join(root, attachment.workspaceRelativePath), 'utf8'), 'one-byte multipart content')
  } finally { await rm(root, { recursive: true, force: true }) }
})

test('Slice C AttachmentService preserves CRLF--abcX pseudo boundaries across one-byte chunks', async () => {
  const root = await mkdtemp(join(tmpdir(), 'researchhub-attachment-pseudo-boundary-c-')); const boundary = 'abc'; const content = 'prefix\r\n--abcXsuffix with content after the pseudo boundary'
  try {
    const service = new AttachmentService({ workspaceRoot: root, maxBytes: 100 })
    const payload = Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="pseudo.txt"\r\nContent-Type: text/plain\r\n\r\n${content}\r\n--${boundary}--\r\n`)
    const body = (async function* (): AsyncIterable<Uint8Array> { yield payload })()
    const attachment = await service.upload(oneByteChunks(body), `multipart/form-data; boundary=${boundary}`)
    assert.equal(attachment.size, Buffer.byteLength(content))
    assert.equal(attachment.sha256, createHash('sha256').update(content).digest('hex'))
    assert.equal(await readFile(join(root, attachment.workspaceRelativePath), 'utf8'), content)
  } finally { await rm(root, { recursive: true, force: true }) }
})

test('Slice C AttachmentService rejects control names, size overflow, metadata tamper, and symlink escape', async () => {
  const root = await mkdtemp(join(tmpdir(), 'researchhub-attachment-security-c-'))
  try {
    const service = new AttachmentService({ workspaceRoot: root, maxBytes: 4 })
    const control = await multipartBody([{ name: 'file', value: new Blob(['x']), filename: 'bad\u0000name.txt' }])
    await assert.rejects(() => service.upload(control.body, control.contentType), /control|NUL/i)
    const tooLarge = await multipartBody([{ name: 'file', value: new Blob(['12345']), filename: 'large.txt' }])
    await assert.rejects(() => service.upload(tooLarge.body, tooLarge.contentType), /limit|size/i)
    const goodService = new AttachmentService({ workspaceRoot: root, maxBytes: 100 })
    const good = await multipartBody([{ name: 'file', value: new Blob(['safe']), filename: 'safe.txt' }])
    const attachment = await goodService.upload(good.body, good.contentType)
    const metadataPath = join(root, attachment.workspaceRelativePath.replaceAll('/', '\\').replace(/\\[^\\]+$/, '\\metadata.json'))
    const metadata = JSON.parse(await readFile(metadataPath, 'utf8')) as Record<string, unknown>
    metadata.sha256 = '0'.repeat(64); await writeFile(metadataPath, JSON.stringify(metadata))
    await assert.rejects(() => goodService.getAttachment(attachment.attachmentId), /hash/i)
    const outside = join(root, 'outside.txt'); await writeFile(outside, 'outside')
    const escapeDir = join(root, 'uploads', 'escape-link'); await symlink(outside, escapeDir)
    await assert.rejects(() => goodService.getAttachment('escape-link'), /invalid|not found/i)
  } finally { await rm(root, { recursive: true, force: true }) }
})

test('Slice C ProductionService exposes asynchronous start, failure, and cancellation with one workflow path', async () => {
  const kb = await createKnowledgeBase({ knowledgeBaseId: 'kb-production-c' })
  try {
    const workflow = new WorkflowService()
    const service = new ProductionService({ mountedKnowledgeBaseRoot: kb, workspaceRoot: join(kb, 'workspace'), reasoningExecutor: new FixtureExecutor(), workflowService: workflow, workflowRunner: async () => { await new Promise<void>((resolve) => setImmediate(resolve)); return responseResult() } })
    const started = service.startIngestDocument({ workflowRunId: 'async-production', text: 'fixture' }); assert.equal(started.runId, 'async-production'); assert.equal(workflow.getWorkflowStatus(started.runId)?.status, 'running'); assert.equal((await started.completion).status, 'completed')
    const failingWorkflow = new WorkflowService(); const failing = new ProductionService({ mountedKnowledgeBaseRoot: kb, workspaceRoot: join(kb, 'workspace'), reasoningExecutor: new FixtureExecutor(), workflowService: failingWorkflow, workflowRunner: async () => { throw new Error('fixture failure') } })
    const failed = failing.startIngestDocument({ workflowRunId: 'failed-production', text: 'fixture' }); await assert.rejects(failed.completion, /fixture failure/); assert.equal(failingWorkflow.getWorkflowStatus('failed-production')?.status, 'failed')
    const cancellingWorkflow = new WorkflowService(); const cancelling = new ProductionService({ mountedKnowledgeBaseRoot: kb, workspaceRoot: join(kb, 'workspace'), reasoningExecutor: new FixtureExecutor(), workflowService: cancellingWorkflow, workflowRunner: async ({ signal }) => new Promise<IngestionWorkflowResult>((_resolve, reject) => { if (signal?.aborted) reject(new Error('aborted')); else signal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true }) }) })
    const cancelled = cancelling.startIngestDocument({ workflowRunId: 'cancelled-production', text: 'fixture' }); cancellingWorkflow.cancelWorkflow('cancelled-production'); const cancellationResult = await cancelled.completion; assert.equal(cancellationResult.status, 'cancelled')
  } finally { await removeKnowledgeBase(kb) }
})

test('Slice C ProductionService preserves authoritative completion after a late cancellation signal', async () => {
  const kb = await createKnowledgeBase({ knowledgeBaseId: 'kb-production-authoritative-c' })
  try {
    const workflow = new WorkflowService(); let entered!: () => void; const enteredPromise = new Promise<void>((resolve) => { entered = resolve }); let release!: () => void
    const service = new ProductionService({ mountedKnowledgeBaseRoot: kb, workspaceRoot: join(kb, 'workspace'), reasoningExecutor: new FixtureExecutor(), workflowService: workflow, workflowRunner: async () => { entered(); await new Promise<void>((resolve) => { release = resolve }); return responseResult() } })
    const controller = new AbortController(); const started = service.startIngestDocument({ workflowRunId: 'authoritative-completed', text: 'fixture' }, controller.signal)
    await enteredPromise; controller.abort(); release()
    const result = await started.completion
    assert.equal(result.status, 'completed'); assert.equal(workflow.getWorkflowStatus('authoritative-completed')?.status, 'completed')
  } finally { await removeKnowledgeBase(kb) }
})

test('Slice C HTTP server provides bootstrap/security/202/product APIs, no-KB mapping, and close', async () => {
  const fixture = await makeRuntimeFixture(); const server = new ResearchHubRuntimeServer({ runtime: fixture.runtime, port: 0 }); let info: RuntimeServerInfo
  try {
    info = await server.start(); const jsonHeaders = { 'content-type': 'application/json', origin: info.origin, 'x-researchhub-runtime-token': info.runtimeToken }
    const bootstrapResponse = await fetch(`${info.origin}/api/bootstrap`, { headers: { host: `${info.bindAddress}:${info.port}` } }); assert.equal(bootstrapResponse.status, 200); const bootstrap = await bootstrapResponse.json() as { runtime: { runtimeToken: string; origin: string }; knowledgeError?: { code: string } }; assert.equal(bootstrap.runtime.origin, info.origin); assert.equal(bootstrap.knowledgeError?.code, 'no_kb_mounted')
    const unauthorized = await fetch(`${info.origin}/api/conversations/new`, { method: 'POST', headers: { ...jsonHeaders, 'x-researchhub-runtime-token': '0'.repeat(64) }, body: '{}' }); assert.equal(unauthorized.status, 401); assert.equal((await unauthorized.json()).code, 'unauthorized_runtime_token')
    const accepted = await fetch(`${info.origin}/api/conversations/prompt`, { method: 'POST', headers: jsonHeaders, body: JSON.stringify({ text: 'safe prompt' }) }); assert.equal(accepted.status, 202); assert.equal((await accepted.json()).accepted, true)
    const noKb = await fetch(`${info.origin}/api/researchhub/status`, { headers: { host: `${info.bindAddress}:${info.port}` } }); assert.equal(noKb.status, 503); assert.equal((await noKb.json()).code, 'no_kb_mounted')
    const uploadForm = new FormData(); uploadForm.append('file', new Blob(['server upload'], { type: 'text/plain' }), '../../server.txt')
    const uploaded = await fetch(`${info.origin}/api/attachments`, { method: 'POST', headers: { origin: info.origin, 'x-researchhub-runtime-token': info.runtimeToken }, body: uploadForm }); assert.equal(uploaded.status, 201); const uploadedJson = await uploaded.json() as { attachment: AttachmentRef }; assert.equal(uploadedJson.attachment.filename, 'server.txt')
    const attachmentRead = await fetch(`${info.origin}/api/attachments/${uploadedJson.attachment.attachmentId}`); assert.equal(attachmentRead.status, 200); assert.equal((await attachmentRead.json()).attachment.attachmentId, uploadedJson.attachment.attachmentId)
  } finally { await server.close(); await fixture.runtime.close(); await rm(fixture.root, { recursive: true, force: true }) }
  assert.equal(server.address, undefined); await assert.rejects(() => fetch(`${info!.origin}/api/bootstrap`))
})

test('Slice C server does not dispose an injected runtime on close', async () => {
  const fixture = await makeRuntimeFixture(); const server = new ResearchHubRuntimeServer({ runtime: fixture.runtime, port: 0 })
  try {
    await server.start()
    await server.close()
    assert.equal(fixture.runtime.sessionRuntime.isDisposed, false)
    assert.doesNotThrow(() => fixture.runtime.sessionRuntime.getCurrentState())
  } finally {
    await server.close(); await fixture.runtime.close(); await rm(fixture.root, { recursive: true, force: true })
  }
})

test('Slice C server closes a runtime it creates itself', async () => {
  const fixture = await makeRuntimeFixture()
  const server = new ResearchHubRuntimeServer({ cwd: fixture.cwd, agentDir: fixture.agentDir, sessionDir: fixture.sessionDir, modelRuntime: fixture.modelRuntime, model: fixture.faux.getModel(), reasoningExecutor: new FixtureExecutor(), port: 0 })
  let ownedRuntime: NonNullable<ResearchHubRuntimeServer['applicationRuntime']> | undefined
  try {
    await server.start()
    ownedRuntime = server.applicationRuntime
    assert.ok(ownedRuntime)
    await server.close()
    assert.equal(ownedRuntime.sessionRuntime.isDisposed, true)
  } finally {
    await server.close(); await fixture.runtime.close(); await rm(fixture.root, { recursive: true, force: true })
  }
})

test('Slice C server shares concurrent starts and retries after startup failure', async () => {
  const fixture = await makeRuntimeFixture(); const blocker = createHttpServer(); await new Promise<void>((resolve) => blocker.listen(0, '127.0.0.1', resolve))
  const blockedPort = (blocker.address() as { readonly port: number }).port
  const server = new ResearchHubRuntimeServer({ runtime: fixture.runtime, port: blockedPort })
  try {
    const starts = [server.start(), server.start(), server.start()]
    const failures = await Promise.all(starts.map((promise) => promise.then(() => undefined, (error) => error)))
    assert.equal(failures[0], failures[1]); assert.equal(failures[1], failures[2])
    await new Promise<void>((resolve, reject) => blocker.close((error) => error ? reject(error) : resolve()))
    const info = await server.start(); assert.equal(info.port, blockedPort)
    const repeated = await server.start(); assert.equal(repeated, info)
  } finally {
    if (blocker.listening) await new Promise<void>((resolve) => blocker.close(() => resolve()))
    await server.close(); await fixture.runtime.close(); await rm(fixture.root, { recursive: true, force: true })
  }
})

test('Slice C server close retries a failed owned runtime cleanup', async () => {
  const fixture = await makeRuntimeFixture()
  const server = new ResearchHubRuntimeServer({ cwd: fixture.cwd, agentDir: fixture.agentDir, sessionDir: fixture.sessionDir, modelRuntime: fixture.modelRuntime, model: fixture.faux.getModel(), reasoningExecutor: new FixtureExecutor(), port: 0 })
  let ownedRuntime: NonNullable<ResearchHubRuntimeServer['applicationRuntime']> | undefined
  let closeAttempts = 0
  try {
    await server.start(); ownedRuntime = server.applicationRuntime; assert.ok(ownedRuntime)
    const originalClose = ownedRuntime.close.bind(ownedRuntime)
    ownedRuntime.close = async () => { closeAttempts += 1; if (closeAttempts === 1) throw new Error('first close failure'); await originalClose() }
    await assert.rejects(() => server.close(), /first close failure/)
    assert.equal(closeAttempts, 1); assert.equal(server.address, undefined)
    await server.close()
    assert.equal(closeAttempts, 2); assert.equal(ownedRuntime.sessionRuntime.isDisposed, true)
  } finally {
    await server.close(); await fixture.runtime.close(); await rm(fixture.root, { recursive: true, force: true })
  }
})

test('Slice C server rejects start once close has begun and leaves no listener', async () => {
  const fixture = await makeRuntimeFixture(); const server = new ResearchHubRuntimeServer({ runtime: fixture.runtime, port: 0 })
  try {
    await server.start()
    const closing = server.close()
    const starting = server.start()
    await assert.rejects(starting, (error: unknown) => (error as { readonly code?: string }).code === 'conflict')
    await closing
    assert.equal(server.address, undefined)
  } finally {
    await server.close(); await fixture.runtime.close(); await rm(fixture.root, { recursive: true, force: true })
  }
})

test('Slice C SSE registers before heartbeat and releases the slot when a client closes', async () => {
  const fixture = await makeRuntimeFixture(); const server = new ResearchHubRuntimeServer({ runtime: fixture.runtime, port: 0, maxSseSubscribers: 1 })
  let first: Response | undefined; let third: Response | undefined
  try {
    const info = await server.start(); const headers = { host: `${info.bindAddress}:${info.port}`, origin: info.origin }
    first = await fetch(`${info.origin}/api/events`, { headers }); assert.equal(first.status, 200)
    const rejected = await fetch(`${info.origin}/api/events`, { headers }); assert.equal(rejected.status, 500); assert.equal((await rejected.json()).code, 'failed')
    await first.body?.cancel(); await new Promise((resolve) => setTimeout(resolve, 25))
    third = await fetch(`${info.origin}/api/events`, { headers }); assert.equal(third.status, 200)
  } finally {
    await first?.body?.cancel(); await third?.body?.cancel(); await server.close(); await rm(fixture.root, { recursive: true, force: true })
  }
})

test('Slice C SSE drains a bounded client queue after write backpressure', async () => {
  const fixture = await makeRuntimeFixture(); const server = new ResearchHubRuntimeServer({ runtime: fixture.runtime, port: 0 })
  const response = new FakeSseResponse([false, true])
  try {
    await server.start()
    const openEvents = (server as unknown as { openEvents: (value: unknown) => void }).openEvents.bind(server)
    openEvents(response)
    assert.equal(response.writes.length, 1, JSON.stringify(response.writes))
    const client = [...(server as unknown as { sseClients: Set<{ readonly waitingForDrain: boolean; readonly pendingFrames: readonly string[] }> }).sseClients][0]!
    assert.equal(client.waitingForDrain, true)
    const eventStream = (server as unknown as { eventStream: { publish: (event: unknown) => void } }).eventStream
    eventStream.publish({ eventId: 'backpressure-1', conversationId: 'conversation', timestamp: new Date().toISOString(), type: 'session.changed', summary: 'Session changed' })
    assert.equal(client.waitingForDrain, true); assert.equal(client.pendingFrames.length, 1)
    assert.equal(response.writes.length, 1, JSON.stringify(response.writes))
    response.emit('drain')
    assert.equal(response.writes.length, 2); assert.match(response.writes[1]!, /backpressure-1/)
  } finally { await server.close(); await fixture.runtime.close(); await rm(fixture.root, { recursive: true, force: true }) }
})

test('Slice C SSE disconnects only the client whose pending queue exceeds its bound', async () => {
  const fixture = await makeRuntimeFixture(); const server = new ResearchHubRuntimeServer({ runtime: fixture.runtime, port: 0 })
  const slow = new FakeSseResponse([true, false]); const healthy = new FakeSseResponse([true])
  try {
    await server.start()
    const openEvents = (server as unknown as { openEvents: (value: unknown) => void }).openEvents.bind(server)
    openEvents(slow); openEvents(healthy)
    const eventStream = (server as unknown as { eventStream: { publish: (event: unknown) => void } }).eventStream
    for (let index = 0; index < 66; index += 1) eventStream.publish({ eventId: `overflow-${index}`, conversationId: 'conversation', timestamp: new Date().toISOString(), type: 'session.changed', summary: 'Session changed' })
    assert.equal(slow.writableEnded, true); assert.equal(healthy.writableEnded, false); assert.equal(healthy.writes.length, 67)
  } finally { await server.close(); await fixture.runtime.close(); await rm(fixture.root, { recursive: true, force: true }) }
})

test('Slice C close cancels and settles pending 202 operations before owned runtime disposal', async () => {
  const fixture = await makeRuntimeFixture(); const kb = await createKnowledgeBase({ knowledgeBaseId: 'kb-runtime-close-background-c' })
  const server = new ResearchHubRuntimeServer({ cwd: fixture.cwd, agentDir: fixture.agentDir, sessionDir: fixture.sessionDir, mountedKnowledgeBaseRoot: kb, modelRuntime: fixture.modelRuntime, model: fixture.faux.getModel(), reasoningExecutor: new FixtureExecutor(), port: 0 })
  let conversationReject!: (error: Error) => void; let conversationCancelled = false; let productionCancelled = false; let operationsSettled = false; let runtimeDisposed = false
  const unhandled: unknown[] = []; const onUnhandled = (reason: unknown) => { unhandled.push(reason) }; process.on('unhandledRejection', onUnhandled)
  try {
    await server.start(); const ownedRuntime = server.applicationRuntime!; const sessionRuntime = ownedRuntime.sessionRuntime
    sessionRuntime.prompt = async () => new Promise<void>((_resolve, reject) => { conversationReject = reject })
    sessionRuntime.abort = async () => { conversationCancelled = true; conversationReject(new Error('conversation cancelled')) }
    ownedRuntime.productionService.startIngestDocument = ((_input, signal) => ({ runId: 'production-background-c', completion: new Promise<never>((_resolve, reject) => { signal?.addEventListener('abort', () => { productionCancelled = true; reject(new Error('production cancelled')) }, { once: true }) }) })) as typeof ownedRuntime.productionService.startIngestDocument
    const originalClose = ownedRuntime.close.bind(ownedRuntime)
    ownedRuntime.close = async () => { assert.equal(conversationCancelled, true); assert.equal(productionCancelled, true); operationsSettled = true; await originalClose(); runtimeDisposed = true }
    const info = server.address!; const headers = { 'content-type': 'application/json', origin: info.origin, 'x-researchhub-runtime-token': info.runtimeToken }
    assert.equal((await fetch(`${info.origin}/api/conversations/prompt`, { method: 'POST', headers, body: JSON.stringify({ text: 'pending conversation' }) })).status, 202)
    assert.equal((await fetch(`${info.origin}/api/production/ingest`, { method: 'POST', headers, body: JSON.stringify({ text: 'pending production' }) })).status, 202)
    const registry = (server as unknown as { backgroundOperations: Set<unknown> }).backgroundOperations
    assert.equal(registry.size, 2)
    await server.close()
    assert.equal(operationsSettled, true); assert.equal(runtimeDisposed, true); assert.equal(registry.size, 0); assert.equal(unhandled.length, 0)
  } finally {
    process.off('unhandledRejection', onUnhandled); await server.close(); await fixture.runtime.close(); await removeKnowledgeBase(kb); await rm(fixture.root, { recursive: true, force: true })
  }
})

test('Slice C full background registry observes a rejected overflow operation', async () => {
  const fixture = await makeRuntimeFixture(); const server = new ResearchHubRuntimeServer({ runtime: fixture.runtime, port: 0 })
  const trackBackground = (server as unknown as { trackBackground: (operation: Promise<unknown>, cancel: () => void) => void }).trackBackground.bind(server)
  const releases: Array<() => void> = []; const registry = (server as unknown as { backgroundOperations: Set<unknown> }).backgroundOperations
  const unhandled: unknown[] = []; const onUnhandled = (reason: unknown) => { unhandled.push(reason) }; process.on('unhandledRejection', onUnhandled)
  try {
    for (let index = 0; index < 128; index += 1) {
      let release!: () => void
      const operation = new Promise<void>((resolve) => { release = resolve })
      releases.push(release); trackBackground(operation, () => release())
    }
    const rejected = Promise.reject(new Error('overflow rejection'))
    assert.throws(() => trackBackground(rejected, () => undefined), /limit/)
    await new Promise<void>((resolve) => setImmediate(resolve))
    assert.equal(unhandled.length, 0); assert.equal(registry.size, 128)
    await server.close(); assert.equal(registry.size, 0)
  } finally {
    process.off('unhandledRejection', onUnhandled); await server.close(); await fixture.runtime.close(); await rm(fixture.root, { recursive: true, force: true })
  }
})
