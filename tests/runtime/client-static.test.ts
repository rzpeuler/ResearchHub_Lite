import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { fauxProvider } from '@earendil-works/pi-ai'
import { ModelRuntime } from '@earendil-works/pi-coding-agent'
import { createResearchHubApplicationRuntime } from '../../app/runtime/application-runtime.ts'
import { ResearchHubRuntimeServer } from '../../app/runtime/server.ts'
import type { ReasoningCapabilities, ReasoningExecutor } from '../../plugins/reasoning/contracts.ts'

const capabilities: ReasoningCapabilities = { maxContextTokens: 100_000, maxOutputTokens: 10_000, structuredOutputSupport: true, maxConcurrency: 4 }
class FixtureExecutor implements ReasoningExecutor { capabilities(): ReasoningCapabilities { return capabilities }; async execute() { return { operation: 'fixture', output: {} } as never } }

test('Runtime serves only the configured client root with safe SPA fallback', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'researchhub-client-static-'))
  const clientRoot = join(root, 'client'); const workspace = join(root, 'workspace'); const knowledge = join(root, 'knowledge')
  await mkdir(join(clientRoot, 'assets'), { recursive: true }); await mkdir(workspace); await mkdir(knowledge)
  await writeFile(join(clientRoot, 'index.html'), '<html>client</html>'); await writeFile(join(clientRoot, 'assets', 'app-abc.js'), 'console.log("client")'); await writeFile(join(workspace, 'secret.txt'), 'workspace secret'); await writeFile(join(knowledge, 'canonical.txt'), 'canonical secret')
  const cwd = join(root, 'cwd'); const agentDir = join(root, 'agent'); const sessionDir = join(root, 'sessions'); await mkdir(cwd); await mkdir(agentDir)
  const modelRuntime = await ModelRuntime.create({ authPath: join(agentDir, 'auth.json'), modelsPath: null, refreshOnCreate: false, allowModelNetwork: false })
  const faux = fauxProvider({ provider: `researchhub-static-${Date.now()}-${Math.random()}`, models: [{ id: 'fixture-model' }] }); modelRuntime.registerNativeProvider(faux.provider)
  const runtime = await createResearchHubApplicationRuntime({ cwd, agentDir, sessionDir, modelRuntime, model: faux.getModel(), reasoningExecutor: new FixtureExecutor(), workspaceRoot: workspace })
  const server = new ResearchHubRuntimeServer({ runtime, clientRoot, port: 0 })
  try {
    const info = await server.start()
    const get = (path: string) => fetch(`${info.origin}${path}`)
    const home = await get('/'); assert.equal(home.status, 200); assert.equal(await home.text(), '<html>client</html>'); assert.match(home.headers.get('cache-control') ?? '', /no-store/)
    const asset = await get('/assets/app-abc.js'); assert.equal(asset.status, 200); assert.equal(await asset.text(), 'console.log("client")'); assert.match(asset.headers.get('cache-control') ?? '', /immutable/)
    const spa = await get('/research/queue'); assert.equal(spa.status, 200); assert.equal(await spa.text(), '<html>client</html>')
    const api = await get('/api/not-a-route'); assert.equal(api.status, 404); assert.notEqual(await api.text(), '<html>client</html>')
    assert.equal((await get('/%2e%2e/workspace/secret.txt')).status, 404)
    assert.equal((await get('/%2e%2e/knowledge/canonical.txt')).status, 404)
    assert.equal((await get('/assets/%2e%2e/%2e%2e/workspace/secret.txt')).status, 404)
    try { await symlink(join(root, 'outside.txt'), join(clientRoot, 'assets', 'escape.js')); await writeFile(join(root, 'outside.txt'), 'outside') } catch { t.diagnostic('symlink unavailable; traversal coverage still ran') }
    if (await readFile(join(root, 'outside.txt'), 'utf8').catch(() => undefined)) assert.equal((await get('/assets/escape.js')).status, 404)
  } finally { await server.close(); await runtime.close(); await rm(root, { recursive: true, force: true }) }
})
