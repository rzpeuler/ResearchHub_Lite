import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { fauxProvider } from '@earendil-works/pi-ai'
import { ModelRuntime } from '@earendil-works/pi-coding-agent'
import { createResearchHubApplicationRuntime } from '../../../app/runtime/application-runtime.ts'
import { ResearchHubRuntimeServer } from '../../../app/runtime/server.ts'
import type { ReasoningCapabilities, ReasoningExecutor } from '../../../plugins/reasoning/contracts.ts'
import { createKnowledgeBase, removeKnowledgeBase } from '../../knowledge/helpers.ts'

const capabilities: ReasoningCapabilities = { maxContextTokens: 100_000, maxOutputTokens: 10_000, structuredOutputSupport: true, maxConcurrency: 4 }
class FixtureExecutor implements ReasoningExecutor { capabilities(): ReasoningCapabilities { return capabilities }; async execute() { return { operation: 'fixture', output: {} } as never } }

test('Source Library HTTP retrieval is denied when disabled and available when enabled', async () => {
  const root = await mkdtemp(join(tmpdir(), 'rhl-source-route-')); const kb = await createKnowledgeBase({ schemaVersion: '0.4', knowledgeBaseId: `source-route-${Date.now()}` }); const cwd = join(root, 'cwd'); const agentDir = join(root, 'agent'); await mkdir(cwd); await mkdir(agentDir)
  const modelRuntime = await ModelRuntime.create({ authPath: join(agentDir, 'auth.json'), modelsPath: null, refreshOnCreate: false, allowModelNetwork: false }); const faux = fauxProvider({ provider: `source-route-${Date.now()}`, models: [{ id: 'fixture-model' }] }); modelRuntime.registerNativeProvider(faux.provider)
  const runtime = await createResearchHubApplicationRuntime({ cwd, agentDir, mountedKnowledgeBaseRoot: kb, modelRuntime, model: faux.getModel(), reasoningExecutor: new FixtureExecutor() }); const server = new ResearchHubRuntimeServer({ runtime, clientRoot: join(root, 'missing-client'), port: 0 })
  try { const info = await server.start(); const headers = { origin: info.origin, 'x-researchhub-runtime-token': info.runtimeToken, 'content-type': 'application/json' }; const disabled = await fetch(`${info.origin}/api/research/source-library/search`, { method: 'POST', headers, body: JSON.stringify({ query: 'anything', contextPolicy: { sourceLibrary: false } }) }); assert.equal(disabled.status, 200); assert.deepEqual(await disabled.json(), { enabled: false, hits: [] }); const enabled = await fetch(`${info.origin}/api/research/source-library/search`, { method: 'POST', headers, body: JSON.stringify({ query: 'anything', contextPolicy: { sourceLibrary: true } }) }); assert.equal(enabled.status, 200); assert.equal((await enabled.json() as { enabled: boolean }).enabled, true) } finally { await server.close(); await runtime.close(); await removeKnowledgeBase(kb); await rm(root, { recursive: true, force: true }) }
})
