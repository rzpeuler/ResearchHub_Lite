import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
// @ts-expect-error The implementation is intentionally a project-local .mjs CLI.
import { bootstrapPlan, candidatePlan, DOCLING_VERSION, MODEL_FAMILIES, preflight, setup } from '../../scripts/document-parser-runtime.mjs'

type Candidate = { executable: string; args: string[] }
type CommandOptions = { cwd?: string; env?: Record<string, string | undefined> }
type Result = { ok: boolean; stdout: string; stderr: string }
type Execute = (executable: string, args: string[], options?: CommandOptions) => Promise<Result>
const probePayload = (docling = true) => JSON.stringify({ version: '3.12.0', venv: true, pip: true, docling, doclingVersion: docling ? DOCLING_VERSION : null })

async function fixture(options: { finalVenv?: boolean; finalModels?: boolean; finalDocling?: boolean } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'rhl-runtime-test-')); const runtime = join(root, '.researchhub-document-parser')
  if (options.finalVenv) { await mkdir(join(runtime, 'venv', 'bin'), { recursive: true }); await writeFile(join(runtime, 'venv', 'bin', 'python'), 'managed') } else if (options.finalVenv === false) await mkdir(join(runtime, 'venv'), { recursive: true })
  if (options.finalModels) { await mkdir(join(runtime, 'models'), { recursive: true }); await writeFile(join(runtime, 'models', 'layout.bin'), 'model') }
  let finalDocling = options.finalDocling !== false
  const calls: Array<{ executable: string; args: string[]; options?: CommandOptions }> = []
  const execute = async (executable: string, args: string[], commandOptions?: CommandOptions): Promise<Result> => {
    calls.push({ executable, args, options: commandOptions })
    if (args.includes('-c')) { const isFinal = executable.includes(join('.researchhub-document-parser', 'venv')) && !executable.includes(join('.staging', '')); return { ok: true, stdout: probePayload(isFinal ? finalDocling : true), stderr: '' } }
    if (args.includes('-m') && args.includes('venv')) { finalDocling = true; await mkdir(join(args[args.length - 1], 'bin'), { recursive: true }); await writeFile(join(args[args.length - 1], 'bin', 'python'), 'staged'); return { ok: true, stdout: '', stderr: '' } }
    if (args.includes('pip')) return { ok: true, stdout: '', stderr: '' }
    if (args.includes('models') && args.includes('download')) { await mkdir(args[args.indexOf('--output-dir') + 1], { recursive: true }); await writeFile(join(args[args.indexOf('--output-dir') + 1], 'layout.bin'), 'model'); return { ok: true, stdout: '', stderr: '' } }
    if (commandOptions?.env?.HF_HUB_OFFLINE !== '1') return { ok: false, stdout: '', stderr: 'offline flag missing' }
    return { ok: true, stdout: '{}', stderr: '' }
  }
  return { root, calls, execute, setFinalDocling: (value: boolean) => { finalDocling = value } }
}

test('dependency is pinned, model families are fixed, and bootstrap uses a base candidate', async () => {
  const requirements = await (await import('node:fs/promises')).readFile('config/document-parser/requirements.txt', 'utf8')
  assert.equal(requirements.trim(), `docling==${DOCLING_VERSION}`); assert.deepEqual(MODEL_FAMILIES, ['layout', 'tableformer'])
  const plan = bootstrapPlan('win32', { venv: 'managed-venv', models: 'managed-models' }, { executable: 'py', args: ['-3'], platform: 'win32' })
  assert.deepEqual(plan.venv, { executable: 'py', args: ['-3', '-m', 'venv', 'managed-venv'], systemSitePackages: false }); assert.deepEqual(bootstrapPlan('linux').models.args.slice(0, 3), ['models', 'download', 'layout']); assert.equal(bootstrapPlan('linux').models.args.includes('tableformer'), true)
})

test('candidate selection is bounded and explicit Python takes precedence', () => {
  assert.deepEqual(candidatePlan('win32').map((candidate: Candidate) => [candidate.executable, candidate.args]), [['py', ['-3']], ['python', []]]); assert.deepEqual(candidatePlan('linux').map((candidate: Candidate) => [candidate.executable, candidate.args]), [['python3', []], ['python', []]]); assert.deepEqual(candidatePlan('win32', 'C:\\tools\\python.exe').map((candidate: Candidate) => candidate.executable), ['C:\\tools\\python.exe'])
})

test('check mode is read-only and never installs or downloads', async () => {
  const root = await mkdtemp(join(tmpdir(), 'rhl-runtime-test-')); const calls: string[][] = []
  try { const result = await preflight({ root, platform: 'linux', execute: async (executable: string, args: string[]) => { calls.push([executable, ...args]); return { ok: false, stdout: '', stderr: '' } } }); assert.equal(result.status, 'MANAGED_PYTHON_MISSING'); assert.equal(calls.some((call) => call.includes('pip') || call.includes('docling_tools')), false); assert.deepEqual(await readdir(root), []) } finally { await rm(root, { recursive: true, force: true }) }
})

test('setup failures are bounded and do not expose stderr', async (t) => {
  for (const [name, expected, failAt] of [['base', 'BASE_PYTHON_MISSING', 'base'], ['venv', 'VENV_CREATION_FAILED', 'venv'], ['pip', 'PIP_INSTALL_FAILED', 'pip'], ['models', 'MODEL_DOWNLOAD_FAILED', 'models'], ['bridge', 'BRIDGE_SMOKE_FAILED', 'bridge']] as const) await t.test(name, async () => {
    const f = await fixture(); try { const result = await setup({ root: f.root, platform: 'linux', explicitPython: failAt === 'base' ? 'missing-python' : 'fixture-python', execute: (async (executable: string, args: string[], options?: CommandOptions) => { if (failAt === 'base' || (failAt === 'venv' && args.includes('venv')) || (failAt === 'pip' && args.includes('pip')) || (failAt === 'models' && args.includes('models')) || (failAt === 'bridge' && !args.includes('-c') && !args.includes('venv') && !args.includes('pip') && !args.includes('models'))) return { ok: false, stdout: '', stderr: 'private-token' }; return f.execute(executable, args, options) }) as Execute }); assert.equal(result.status, 'INCONCLUSIVE'); assert.equal(result.reason, expected); assert.doesNotMatch(JSON.stringify(result), /private-token|[A-Za-z]:\\Users\\/i) } finally { await rm(f.root, { recursive: true, force: true }) }
  })
})

test('partial final venv, missing Docling, and missing models are repaired to READY', async (t) => {
  for (const state of [{ finalVenv: false }, { finalVenv: true, finalDocling: false }, { finalVenv: true, finalModels: false }] as const) await t.test(JSON.stringify(state), async () => { const f = await fixture(state); try { assert.equal((await setup({ root: f.root, platform: 'linux', explicitPython: 'fixture-python', execute: f.execute })).status, 'READY') } finally { await rm(f.root, { recursive: true, force: true }) } })
})

test('arbitrary non-empty models do not bypass a failed production bridge smoke', async () => {
  const f = await fixture({ finalVenv: true, finalModels: true }); try { const result = await setup({ root: f.root, platform: 'linux', explicitPython: 'fixture-python', execute: (async (executable: string, args: string[], options?: CommandOptions) => { const value = await f.execute(executable, args, options); if (!args.includes('-c') && !args.includes('venv') && !args.includes('pip') && !args.includes('models')) return { ok: false, stdout: '', stderr: 'bridge-failed' }; return value }) as Execute }); assert.equal(result.reason, 'BRIDGE_SMOKE_FAILED') } finally { await rm(f.root, { recursive: true, force: true }) }
})

test('verified READY setup performs no creation, install, download, or promotion', async () => {
  const f = await fixture({ finalVenv: true, finalModels: true }); try { f.calls.length = 0; assert.equal((await setup({ root: f.root, platform: 'linux', execute: f.execute })).status, 'READY'); assert.equal(f.calls.every((call) => !call.args.includes('pip') && !call.args.includes('models') && !call.args.includes('venv')), true) } finally { await rm(f.root, { recursive: true, force: true }) }
})

test('staged bridge smoke is offline and failed staging preserves final runtime; stale staging is ignored', async () => {
  const f = await fixture({ finalVenv: true, finalModels: true }); const marker = join(f.root, '.researchhub-document-parser', 'venv', 'bin', 'python')
  try { await mkdir(join(f.root, '.researchhub-document-parser', '.staging', 'stale', 'venv'), { recursive: true }); const result = await setup({ root: f.root, platform: 'linux', explicitPython: 'fixture-python', execute: (async (executable: string, args: string[], options?: CommandOptions) => { const value = await f.execute(executable, args, options); if (!args.includes('-c') && !args.includes('venv') && !args.includes('pip') && !args.includes('models')) return { ok: false, stdout: '', stderr: '' }; return value }) as Execute }); assert.equal(result.reason, 'BRIDGE_SMOKE_FAILED'); assert.equal(await (await import('node:fs/promises')).readFile(marker, 'utf8'), 'managed'); assert.equal(f.calls.some((call) => call.options?.env?.HF_HUB_OFFLINE === '1'), true); assert.deepEqual(await readdir(join(f.root, '.researchhub-document-parser', '.staging')), ['stale']) } finally { await rm(f.root, { recursive: true, force: true }) }
})

test('promotion and final verification failures are bounded and recoverable', async (t) => {
  await t.test('promotion failure', async () => { const f = await fixture({ finalVenv: true, finalModels: true, finalDocling: false }); let failed = false; try { const result = await setup({ root: f.root, platform: 'linux', explicitPython: 'fixture-python', execute: f.execute, move: async (source: string, destination: string) => { if (!failed && destination === join(f.root, '.researchhub-document-parser', 'models')) { failed = true; throw new Error('simulated promotion failure') }; await (await import('node:fs/promises')).rename(source, destination) } }); assert.equal(result.reason, 'PROMOTION_FAILED'); assert.equal((await (await import('node:fs/promises')).readFile(join(f.root, '.researchhub-document-parser', 'venv', 'bin', 'python'), 'utf8')), 'managed'); f.setFinalDocling(false); assert.equal((await setup({ root: f.root, platform: 'linux', explicitPython: 'fixture-python', execute: f.execute })).status, 'READY') } finally { await rm(f.root, { recursive: true, force: true }) } })
  await t.test('final verification failure', async () => { const f = await fixture({ finalVenv: true, finalModels: true, finalDocling: false }); try { const result = await setup({ root: f.root, platform: 'linux', explicitPython: 'fixture-python', execute: (async (executable: string, args: string[], options?: CommandOptions) => { const value = await f.execute(executable, args, options); if (args.includes('-c') && executable.includes(join('.researchhub-document-parser', 'venv')) && !executable.includes(join('.staging', ''))) return { ok: true, stdout: probePayload(false), stderr: '' }; return value }) as Execute }); assert.equal(result.reason, 'PROMOTION_FAILED') } finally { await rm(f.root, { recursive: true, force: true }) } })
})
