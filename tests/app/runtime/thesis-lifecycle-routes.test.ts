import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { ModelRuntime } from '@earendil-works/pi-coding-agent'
import { fauxProvider } from '@earendil-works/pi-ai'
import { createFreshKnowledgeBaseV04 } from '../../../knowledge/storage/create-v04.ts'
import { createResearchHubApplicationRuntime } from '../../../app/runtime/application-runtime.ts'
import { ResearchHubRuntimeServer } from '../../../app/runtime/server.ts'
import type { ReasoningExecutor } from '../../../plugins/reasoning/contracts.ts'

class FixtureExecutor implements ReasoningExecutor {
  capabilities() { return { maxContextTokens: 32_000, maxOutputTokens: 2_000, structuredOutputSupport: true, maxConcurrency: 1 } }
  async execute() { return { operation: 'thesis_refresh', output: {} } as never }
}

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'runtime-thesis-routes-'))
  const kb = join(root, 'kb'); const cwd = join(root, 'cwd'); const workspace = join(root, 'workspace'); const agentDir = join(root, 'agent')
  await mkdir(cwd); await mkdir(workspace); await mkdir(agentDir); await createFreshKnowledgeBaseV04(kb, { knowledgeBaseId: 'kb-thesis-routes' })
  const modelRuntime = await ModelRuntime.create({ authPath: join(agentDir, 'auth.json'), modelsPath: null, refreshOnCreate: false, allowModelNetwork: false })
  const faux = fauxProvider({ provider: `thesis-routes-${Date.now()}-${Math.random()}`, models: [{ id: 'fixture-model' }] }); modelRuntime.registerNativeProvider(faux.provider)
  const runtime = await createResearchHubApplicationRuntime({ cwd, agentDir, mountedKnowledgeBaseRoot: kb, workspaceRoot: workspace, modelRuntime, model: faux.getModel(), reasoningExecutor: new FixtureExecutor() })
  const server = new ResearchHubRuntimeServer({ runtime, clientRoot: join(root, 'missing-client'), port: 0 })
  await server.start()
  return { root, runtime, server, modelRuntime, origin: server.address!.origin, token: server.address!.runtimeToken }
}

test('Thesis list/detail routes return bounded canonical projections without colliding with object lookup', async () => {
  const f = await fixture()
  try {
    assert.ok(f.runtime.services.thesisQueryService)
    const list = await fetch(`${f.origin}/api/knowledge/theses?limit=4`, { headers: { origin: f.origin } })
    assert.equal(list.status, 200)
    assert.deepEqual(await list.json(), { theses: [], total: 0, limit: 4, truncated: false, revision: 0 })
    const detail = await fetch(`${f.origin}/api/knowledge/theses/thesis:missing`, { headers: { origin: f.origin } })
    assert.equal(detail.status, 404)
    const malformed = await fetch(`${f.origin}/api/knowledge/theses/thesis:missing/extra`, { headers: { origin: f.origin } })
    assert.equal(malformed.status, 404)
    const object = await fetch(`${f.origin}/api/knowledge/object?ref=thesis:missing`, { headers: { origin: f.origin } })
    assert.equal(object.status, 404)
  } finally { await f.server.close(); await f.runtime.close(); await Promise.resolve((f.modelRuntime as unknown as { dispose?: () => void | Promise<void> }).dispose?.()); await rm(f.root, { recursive: true, force: true }) }
})

test('Thesis REFRESH launches through ResearchService and decisions accept only bounded decision fields', async () => {
  const f = await fixture()
  try {
    const headers = { origin: f.origin, 'x-researchhub-runtime-token': f.token, 'content-type': 'application/json' }
    const unauthorized = await fetch(`${f.origin}/api/production/thesis-lifecycle/refresh`, { method: 'POST', headers: { origin: f.origin, 'content-type': 'application/json' }, body: JSON.stringify({ thesisRef: 'thesis:missing', asOf: '2026-09-24T00:00:00.000Z' }) })
    assert.equal(unauthorized.status, 401)
    const invalid = await fetch(`${f.origin}/api/production/thesis-lifecycle/refresh`, { method: 'POST', headers, body: JSON.stringify({ thesisRef: 'thesis:missing', asOf: '2026-09-24T00:00:00.000Z', workflowRunId: 'caller-controlled' }) })
    assert.equal(invalid.status, 400)
    const started = await fetch(`${f.origin}/api/production/thesis-lifecycle/refresh`, { method: 'POST', headers, body: JSON.stringify({ thesisRef: 'thesis:missing', asOf: '2026-09-24T00:00:00.000Z', evidenceRefs: ['observation:missing'] }) })
    assert.equal(started.status, 202)
    const accepted = await started.json() as { accepted: boolean; runId: string; workflow: { workflowType: string } }
    assert.equal(accepted.accepted, true); assert.match(accepted.runId, /^thesis-refresh-/); assert.equal(accepted.workflow.workflowType, 'thesis_lifecycle')
    const denied = await fetch(`${f.origin}/api/review-cases/thesis-review-missing/decision`, { method: 'POST', headers, body: JSON.stringify({ decision: 'DEFER', note: 'later', proposals: [] }) })
    assert.equal(denied.status, 400)
    const decision = await fetch(`${f.origin}/api/review-cases/thesis-review-missing/decision`, { method: 'POST', headers, body: JSON.stringify({ decision: 'DEFER', note: 'later' }) })
    assert.equal(decision.status, 200)
    assert.deepEqual((await decision.json() as { status: string; errors: string[] }).status, 'blocked')
    assert.equal((await fetch(`${f.origin}/api/research-reports/missing`, { headers: { origin: f.origin } })).status, 404)
  } finally { await f.server.close(); await f.runtime.close(); await Promise.resolve((f.modelRuntime as unknown as { dispose?: () => void | Promise<void> }).dispose?.()); await rm(f.root, { recursive: true, force: true }) }
})

test('Thesis CREATE accepts only canonical refs and bounded semantic inputs through a normal Workflow', async () => {
  const f = await fixture()
  try {
    const headers = { origin: f.origin, 'x-researchhub-runtime-token': f.token, 'content-type': 'application/json' }
    const unauthorized = await fetch(`${f.origin}/api/production/thesis-lifecycle/create`, { method: 'POST', headers: { origin: f.origin, 'content-type': 'application/json' }, body: JSON.stringify({ companyRef: 'entity:missing', thesisTitle: 'A thesis', narrative: 'A narrative', evidenceRefs: ['claim:evidence'], asOf: '2026-09-24T00:00:00.000Z' }) })
    assert.equal(unauthorized.status, 401)
    const invalid = await fetch(`${f.origin}/api/production/thesis-lifecycle/create`, { method: 'POST', headers, body: JSON.stringify({ companyRef: 'entity:missing', thesisTitle: 'A thesis', narrative: 'A narrative', evidenceRefs: ['claim:evidence'], asOf: '2026-09-24T00:00:00.000Z', rawPath: 'C:\\private\\raw.txt' }) })
    assert.equal(invalid.status, 400)
    const started = await fetch(`${f.origin}/api/production/thesis-lifecycle/create`, { method: 'POST', headers, body: JSON.stringify({ companyRef: 'entity:missing', thesisTitle: 'A thesis', narrative: 'A narrative', evidenceRefs: ['claim:evidence'], asOf: '2026-09-24T00:00:00.000Z' }) })
    assert.equal(started.status, 202)
    const accepted = await started.json() as { accepted: boolean; runId: string; workflow: { workflowType: string } }
    assert.equal(accepted.accepted, true)
    assert.match(accepted.runId, /^thesis-create-/)
    assert.equal(accepted.workflow.workflowType, 'thesis_lifecycle')
  } finally { await f.server.close(); await f.runtime.close(); await Promise.resolve((f.modelRuntime as unknown as { dispose?: () => void | Promise<void> }).dispose?.()); await rm(f.root, { recursive: true, force: true }) }
})
