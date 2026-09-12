import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createFreshKnowledgeBaseV04 } from '../../../knowledge/storage/create-v04.ts'
import { createResearchHubApplicationRuntime } from '../../../app/runtime/application-runtime.ts'
import { ResearchHubRuntimeServer } from '../../../app/runtime/server.ts'
import { ModelRuntime } from '@earendil-works/pi-coding-agent'
import { fauxProvider } from '@earendil-works/pi-ai'
import type { ReasoningExecutor } from '../../../plugins/reasoning/contracts.ts'

class FixtureExecutor implements ReasoningExecutor {
  capabilities() { return { maxContextTokens: 100_000, maxOutputTokens: 10_000, structuredOutputSupport: true, maxConcurrency: 2 } }
  async execute() { return { operation: 'industry_design', output: {} } as never }
}

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'runtime-industry-route-'))
  const kb = join(root, 'kb'); const cwd = join(root, 'cwd'); const workspace = join(root, 'workspace'); const agentDir = join(root, 'agent')
  await mkdir(cwd); await mkdir(workspace); await mkdir(agentDir); await createFreshKnowledgeBaseV04(kb, { knowledgeBaseId: 'kb-industry-route' })
  const modelRuntime = await ModelRuntime.create({ authPath: join(agentDir, 'auth.json'), modelsPath: null, refreshOnCreate: false, allowModelNetwork: false })
  const faux = fauxProvider({ provider: `industry-route-${Date.now()}-${Math.random()}`, models: [{ id: 'fixture-model' }] }); modelRuntime.registerNativeProvider(faux.provider)
  const runtime = await createResearchHubApplicationRuntime({ cwd, agentDir, mountedKnowledgeBaseRoot: kb, workspaceRoot: workspace, modelRuntime, model: faux.getModel(), reasoningExecutor: new FixtureExecutor() })
  const server = new ResearchHubRuntimeServer({ runtime, clientRoot: join(root, 'missing-client'), port: 0 })
  await server.start()
  return { root, runtime, server, modelRuntime, origin: server.address!.origin, token: server.address!.runtimeToken }
}

test('Industry HTTP routes accept bounded requests only with runtime security and register the Workflow', async () => {
  const f = await fixture()
  try {
    for (const path of ['/api/production/research-industry', '/api/research-industry']) {
      const response = await fetch(`${f.origin}${path}`, { method: 'POST', headers: { origin: f.origin, 'x-researchhub-runtime-token': f.token, 'content-type': 'application/json' }, body: JSON.stringify({ name: 'PCB', aliases: ['印制电路板'], searchTerms: ['PCB'], maxSources: 4, maxEvidencePerModule: 2 }) })
      assert.equal(response.status, 202)
      const body = await response.json() as { accepted: boolean; runId: string }
      assert.equal(body.accepted, true); assert.match(body.runId, /^[0-9a-f-]{36}$/); assert.equal(f.runtime.workflowService.getWorkflowStatus(body.runId)?.workflowType, 'industry_deep_research')
    }
  } finally { await f.server.close(); await f.runtime.close(); await Promise.resolve((f.modelRuntime as unknown as { dispose?: () => void | Promise<void> }).dispose?.()); await rm(f.root, { recursive: true, force: true }) }
})

test('Industry HTTP route rejects invalid input and security before Workflow registration', async () => {
  const f = await fixture()
  try {
    const cases = [
      { body: { name: '' } },
      { body: { name: 'x'.repeat(201) } },
      { body: { name: 'PCB', aliases: [''] } },
      { body: { name: 'PCB', searchTerms: Array.from({ length: 9 }, () => 'x') } },
      { body: { name: 'PCB', canonicalRef: 'company:not-industry' } },
      { body: { name: 'PCB', maxSources: 0 } },
      { body: { name: 'PCB', maxEvidencePerModule: 13 } },
    ]
    for (const [index, item] of cases.entries()) {
      const runId = `invalid-industry-${index}`
      const response = await fetch(`${f.origin}/api/research-industry`, { method: 'POST', headers: { origin: f.origin, 'x-researchhub-runtime-token': f.token, 'content-type': 'application/json' }, body: JSON.stringify({ ...item.body, workflowRunId: runId }) })
      assert.equal(response.status, 400); assert.equal(f.runtime.workflowService.getWorkflowStatus(runId), undefined)
    }
    const unauthorized = await fetch(`${f.origin}/api/research-industry`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'PCB' }) })
    assert.equal(unauthorized.status, 401)
  } finally { await f.server.close(); await f.runtime.close(); await Promise.resolve((f.modelRuntime as unknown as { dispose?: () => void | Promise<void> }).dispose?.()); await rm(f.root, { recursive: true, force: true }) }
})
