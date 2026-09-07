import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { fauxAssistantMessage, fauxProvider } from '@earendil-works/pi-ai'
import { ModelRuntime } from '@earendil-works/pi-coding-agent'
import { createResearchHubApplicationRuntime } from '../../app/runtime/application-runtime.ts'
import { ResearchHubRuntimeServer } from '../../app/runtime/server.ts'
import type { ReasoningCapabilities, ReasoningExecutor } from '../../plugins/reasoning/contracts.ts'
import { createKnowledgeBase, removeKnowledgeBase } from '../knowledge/helpers.ts'

const capabilities: ReasoningCapabilities = { maxContextTokens: 100_000, maxOutputTokens: 10_000, structuredOutputSupport: true, maxConcurrency: 4 }
class FixtureExecutor implements ReasoningExecutor { capabilities(): ReasoningCapabilities { return capabilities }; async execute() { return { operation: 'fixture', output: {} } as never } }

async function readUntil(reader: ReadableStreamDefaultReader<Uint8Array>, needle: string): Promise<string> {
  const decoder = new TextDecoder(); let output = ''
  for (;;) {
    const next = await reader.read(); if (next.done) return output
    output += decoder.decode(next.value, { stream: true }); if (output.includes(needle)) return output
  }
}

test('Homepage local smoke: bootstrap, prompt SSE, upload, and explicit production start', async () => {
  const root = await mkdtemp(join(tmpdir(), 'researchhub-homepage-smoke-')); const kb = await createKnowledgeBase({ knowledgeBaseId: `homepage-smoke-${Date.now()}` })
  const cwd = join(root, 'cwd'); const agentDir = join(root, 'agent'); const sessionDir = join(root, 'sessions'); const workspace = join(root, 'workspace'); await mkdir(cwd); await mkdir(agentDir)
  const modelRuntime = await ModelRuntime.create({ authPath: join(agentDir, 'auth.json'), modelsPath: null, refreshOnCreate: false, allowModelNetwork: false }); const faux = fauxProvider({ provider: `researchhub-homepage-${Date.now()}-${Math.random()}`, models: [{ id: 'fixture-model' }] }); modelRuntime.registerNativeProvider(faux.provider)
  const runtime = await createResearchHubApplicationRuntime({ cwd, agentDir, sessionDir, mountedKnowledgeBaseRoot: kb, workspaceRoot: workspace, modelRuntime, model: faux.getModel(), reasoningExecutor: new FixtureExecutor() }); const server = new ResearchHubRuntimeServer({ runtime, clientRoot: join(root, 'missing-client'), port: 0 })
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined
  try {
    const info = await server.start(); const readHeaders = { origin: info.origin }; const mutationHeaders = { origin: info.origin, 'x-researchhub-runtime-token': info.runtimeToken, 'content-type': 'application/json' }
    const bootstrap = await fetch(`${info.origin}/api/bootstrap`, { headers: readHeaders }); assert.equal(bootstrap.status, 200); assert.equal((await bootstrap.json() as { runtime: { origin: string } }).runtime.origin, info.origin)
    const events = await fetch(`${info.origin}/api/events`, { headers: readHeaders }); assert.equal(events.status, 200); reader = events.body!.getReader(); const eventPromise = readUntil(reader, '"type":"agent.completed"')
    faux.setResponses([fauxAssistantMessage('homepage smoke answer')])
    const prompt = await fetch(`${info.origin}/api/conversations/prompt`, { method: 'POST', headers: mutationHeaders, body: JSON.stringify({ text: 'smoke prompt' }) }); assert.equal(prompt.status, 202); assert.equal((await prompt.json() as { accepted: boolean }).accepted, true)
    const eventText = await eventPromise; const eventPayloads = [...eventText.matchAll(/^data: (.+)$/gm)].map((match) => JSON.parse(match[1]!) as { type?: string; role?: string; summary?: string }); const assistantText = eventPayloads.filter((event) => event.type === 'message.delta' && event.role === 'assistant').map((event) => event.summary ?? '').join(''); assert.equal(assistantText, 'homepage smoke answer')
    const form = new FormData(); form.append('file', new Blob(['homepage attachment'], { type: 'text/plain' }), 'homepage.txt'); const upload = await fetch(`${info.origin}/api/attachments`, { method: 'POST', headers: { origin: info.origin, 'x-researchhub-runtime-token': info.runtimeToken }, body: form }); assert.equal(upload.status, 201); const uploaded = await upload.json() as { attachment: { attachmentId: string } }
    const production = await fetch(`${info.origin}/api/production/ingest`, { method: 'POST', headers: mutationHeaders, body: JSON.stringify({ attachmentId: uploaded.attachment.attachmentId }) }); assert.equal(production.status, 202); const started = await production.json() as { accepted: boolean; runId: string }; assert.equal(started.accepted, true); assert.match(started.runId, /^[0-9a-f-]{36}$/)
  } finally { await reader?.cancel(); await server.close(); await runtime.close(); await removeKnowledgeBase(kb); await rm(root, { recursive: true, force: true }) }
})
