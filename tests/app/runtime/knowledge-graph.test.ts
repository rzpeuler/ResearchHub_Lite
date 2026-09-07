import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdir, writeFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { mkdtemp } from 'node:fs/promises'
import { fauxProvider } from '@earendil-works/pi-ai'
import { ModelRuntime } from '@earendil-works/pi-coding-agent'
import { createKnowledgeBase, removeKnowledgeBase } from '../../knowledge/helpers.ts'
import { createResearchHubApplicationRuntime } from '../../../app/runtime/application-runtime.ts'
import { ResearchHubRuntimeServer } from '../../../app/runtime/server.ts'
import type { ReasoningCapabilities, ReasoningExecutor, ReasoningRequest, ReasoningResult } from '../../../plugins/reasoning/contracts.ts'

const capabilities: ReasoningCapabilities = { maxContextTokens: 100_000, maxOutputTokens: 10_000, structuredOutputSupport: true, maxConcurrency: 4 }
class FixtureExecutor implements ReasoningExecutor {
  capabilities(): ReasoningCapabilities { return capabilities }
  async execute(request: ReasoningRequest): Promise<ReasoningResult> { return { operation: request.operation, output: {} } as ReasoningResult }
}

async function writeMountedGraph(root: string): Promise<void> {
  const registry: Record<string, { type: string; storageRef: string }> = {}
  const assets = [
    ['theme-groups', 'infra', { id: 'theme-group:infra', name: 'Infrastructure', aliases: [], lifecycle: { status: 'active' } }, 'theme_group'],
    ['entities', 'theme', { id: 'entity:theme', type: 'investment_theme', name: 'AI Infrastructure', aliases: [], themeGroupRef: 'theme-group:infra', lifecycle: { status: 'active' } }, 'entity'],
    ['entities', 'industry', { id: 'entity:industry', type: 'industry', name: 'Semiconductors', aliases: [], lifecycle: { status: 'active' } }, 'entity'],
    ['relations', 'theme-industry', { id: 'relation:theme-industry', type: 'theme_exposure', sourceRef: 'entity:theme', targetRef: 'entity:industry', lifecycle: { status: 'active' } }, 'relation'],
    ['claims', 'claim', { id: 'claim:runtime', claimType: 'fact', statement: 'runtime fixture', subjectRefs: ['entity:industry'], sourceRefs: [], lifecycle: { status: 'active' } }, 'claim'],
  ] as const
  for (const [directory, filename, value, type] of assets) { const storageRef = `${directory}/${filename}.yaml`; await writeFile(join(root, storageRef), JSON.stringify(value)); registry[value.id] = { type, storageRef } }
  await writeFile(join(root, 'registry', 'assets.yaml'), JSON.stringify(registry))
}

test('Runtime exposes read-only Knowledge Directory and rooted Graph APIs', async () => {
  const fixtureRoot = await mkdtemp(join(tmpdir(), 'researchhub-runtime-graph-'))
  const kb = await createKnowledgeBase({ knowledgeBaseId: `kb-runtime-graph-${Date.now()}` })
  await writeMountedGraph(kb)
  const cwd = join(fixtureRoot, 'cwd'); const agentDir = join(fixtureRoot, 'agent'); const workspaceRoot = join(fixtureRoot, 'workspace')
  await mkdir(cwd, { recursive: true }); await mkdir(agentDir, { recursive: true })
  const modelRuntime = await ModelRuntime.create({ authPath: join(agentDir, 'auth.json'), modelsPath: null, refreshOnCreate: false, allowModelNetwork: false })
  const faux = fauxProvider({ provider: `researchhub-runtime-graph-${Date.now()}-${Math.random()}`, models: [{ id: 'fixture-model' }] })
  modelRuntime.registerNativeProvider(faux.provider)
  const runtime = await createResearchHubApplicationRuntime({ cwd, agentDir, mountedKnowledgeBaseRoot: kb, workspaceRoot, modelRuntime, model: faux.getModel(), reasoningExecutor: new FixtureExecutor() })
  const server = new ResearchHubRuntimeServer({ runtime, port: 0 })
  try {
    const info = await server.start()
    const directoryResponse = await fetch(`${info.origin}/api/knowledge/directory`)
    assert.equal(directoryResponse.status, 200)
    assert.equal((await directoryResponse.json()).companies.limit, 30)
    const graphResponse = await fetch(`${info.origin}/api/knowledge/graph?rootRef=${encodeURIComponent('entity:theme')}&depth=2`)
    assert.equal(graphResponse.status, 200)
    const graph = await graphResponse.json() as { profile: string; nodes: { ref: string }[]; edges: { sourceRef: string; targetRef: string }[] }
    assert.equal(graph.profile, 'theme_context')
    assert.deepEqual(graph.nodes.map((node) => node.ref), ['entity:theme', 'entity:industry'])
    assert.deepEqual(graph.edges[0], { ref: 'relation:theme-industry', relationType: 'theme_exposure', sourceRef: 'entity:theme', targetRef: 'entity:industry', label: 'theme exposure' })
    const noMutationToken = await fetch(`${info.origin}/api/knowledge/directory`, { headers: { 'x-researchhub-runtime-token': 'invalid' } })
    assert.equal(noMutationToken.status, 200)
    const aliasResponse = await fetch(`${info.origin}/api/knowledge/graph?root=${encodeURIComponent('entity:theme')}&depth=1`)
    assert.equal(aliasResponse.status, 200)
    assert.equal((await aliasResponse.json()).rootRef, 'entity:theme')
    for (const [query, status, code] of [
      ['rootRef=', 400, 'invalid_input'],
      ['rootRef=entity%3Aunknown', 404, 'not_found'],
      ['rootRef=theme-group%3Ainfra', 400, 'invalid_input'],
      ['rootRef=claim%3Aruntime', 400, 'invalid_input'],
      ['rootRef=entity%3Atheme&depth=3', 400, 'invalid_input'],
    ] as const) {
      const response = await fetch(`${info.origin}/api/knowledge/graph?${query}`)
      assert.equal(response.status, status)
      assert.equal((await response.json()).code, code)
    }
    const noKbRoot = join(fixtureRoot, 'no-kb')
    const noKbAgent = join(fixtureRoot, 'no-kb-agent')
    const noKbWorkspace = join(fixtureRoot, 'no-kb-workspace')
    await mkdir(noKbRoot, { recursive: true }); await mkdir(noKbAgent, { recursive: true })
    const noKbRuntime = await createResearchHubApplicationRuntime({ cwd: noKbRoot, agentDir: noKbAgent, workspaceRoot: noKbWorkspace, modelRuntime, model: faux.getModel(), reasoningExecutor: new FixtureExecutor() })
    const noKbServer = new ResearchHubRuntimeServer({ runtime: noKbRuntime, port: 0 })
    try {
      const noKbInfo = await noKbServer.start()
      const noKbResponse = await fetch(`${noKbInfo.origin}/api/knowledge/directory`)
      assert.equal(noKbResponse.status, 503)
      assert.equal((await noKbResponse.json()).code, 'no_kb_mounted')
    } finally {
      await noKbServer.close(); await noKbRuntime.close()
    }
  } finally {
    await server.close(); await runtime.close(); await (modelRuntime as unknown as { readonly dispose?: () => void | Promise<void> }).dispose?.(); await removeKnowledgeBase(kb); await rm(fixtureRoot, { recursive: true, force: true })
  }
})
