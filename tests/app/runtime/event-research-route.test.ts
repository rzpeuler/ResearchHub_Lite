import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import test from 'node:test'
import { fauxProvider } from '@earendil-works/pi-ai'
import { ModelRuntime } from '@earendil-works/pi-coding-agent'
import { createFreshKnowledgeBaseV04 } from '../../../knowledge/storage/create-v04.ts'
import { createResearchHubApplicationRuntime } from '../../../app/runtime/application-runtime.ts'
import { ResearchHubRuntimeServer } from '../../../app/runtime/server.ts'
import type { ReasoningExecutor } from '../../../plugins/reasoning/contracts.ts'

class FixtureExecutor implements ReasoningExecutor {
  capabilities() { return { maxContextTokens: 100_000, maxOutputTokens: 10_000, structuredOutputSupport: true, maxConcurrency: 2 } }
  async execute() { return { operation: 'event_evidence_assessment', output: {} } as never }
}

test('Event HTTP product route starts the event_research Workflow through the runtime service', async () => {
  const root = await mkdtemp(join(tmpdir(), 'rhl-event-route-')); const kb = join(root, 'kb'); const cwd = join(root, 'cwd'); const agentDir = join(root, 'agent'); const workspace = join(root, 'workspace'); await mkdir(cwd); await mkdir(agentDir); await mkdir(workspace); await createFreshKnowledgeBaseV04(kb, { knowledgeBaseId: 'kb-event-route' })
  const modelRuntime = await ModelRuntime.create({ authPath: join(agentDir, 'auth.json'), modelsPath: null, refreshOnCreate: false, allowModelNetwork: false }); const faux = fauxProvider({ provider: `event-route-${Date.now()}`, models: [{ id: 'fixture-model' }] }); modelRuntime.registerNativeProvider(faux.provider); const runtime = await createResearchHubApplicationRuntime({ cwd, agentDir, mountedKnowledgeBaseRoot: kb, workspaceRoot: workspace, modelRuntime, model: faux.getModel(), reasoningExecutor: new FixtureExecutor() }); const server = new ResearchHubRuntimeServer({ runtime, clientRoot: join(root, 'missing-client'), port: 0 })
  try { const info = await server.start(); const response = await fetch(`${info.origin}/api/production/research-event`, { method: 'POST', headers: { origin: info.origin, 'x-researchhub-runtime-token': info.runtimeToken, 'content-type': 'application/json' }, body: JSON.stringify({ workflowRunId: 'event-route-run', symbol: '600519', exchange: 'SSE', anchor: { kind: 'user_event', title: 'Fixture event', description: 'A bounded fixture event.' } }) }); assert.equal(response.status, 202); const body = await response.json() as { accepted: boolean; runId: string }; assert.equal(body.accepted, true); assert.equal(body.runId, 'event-route-run'); assert.equal(runtime.workflowService.getWorkflowStatus(body.runId)?.workflowType, 'event_research'); for (let attempt = 0; attempt < 50 && runtime.workflowService.getWorkflowStatus(body.runId)?.status !== 'blocked'; attempt++) await new Promise((resolve) => setTimeout(resolve, 20)); assert.equal(runtime.workflowService.getWorkflowStatus(body.runId)?.status, 'blocked') } finally { await server.close(); await runtime.close(); await Promise.resolve((modelRuntime as unknown as { dispose?: () => void | Promise<void> }).dispose?.()).catch(() => undefined); await rm(root, { recursive: true, force: true }) }
})
