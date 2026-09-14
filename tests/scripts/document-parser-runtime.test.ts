import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
// @ts-expect-error The implementation is intentionally a project-local .mjs CLI.
import { bootstrapPlan, candidatePlan, DOCLING_VERSION, MODEL_FAMILIES, preflight, setup } from '../../scripts/document-parser-runtime.mjs'
type Candidate = { executable: string; args: string[] }
type CommandOptions = { env?: Record<string, string> }

test('dependency is pinned and bootstrap requests only layout and tableformer', async () => {
  const requirements = await (await import('node:fs/promises')).readFile('config/document-parser/requirements.txt', 'utf8')
  assert.equal(requirements.trim(), `docling==${DOCLING_VERSION}`)
  assert.deepEqual(MODEL_FAMILIES, ['layout', 'tableformer'])
  assert.deepEqual(bootstrapPlan('win32').venv.args.slice(0, 2), ['-m', 'venv'])
  assert.equal(bootstrapPlan('win32').venv.systemSitePackages, false)
  assert.deepEqual(bootstrapPlan('linux').models.args.slice(0, 3), ['models', 'download', 'layout'])
  assert.equal(bootstrapPlan('linux').models.args.includes('tableformer'), true)
})

test('candidate selection is bounded and explicit Python takes precedence', () => {
  assert.deepEqual(candidatePlan('win32').map((candidate: Candidate) => [candidate.executable, candidate.args]), [['py', ['-3']], ['python', []]])
  assert.deepEqual(candidatePlan('linux').map((candidate: Candidate) => [candidate.executable, candidate.args]), [['python3', []], ['python', []]])
  assert.deepEqual(candidatePlan('win32', 'C:\\tools\\python.exe').map((candidate: Candidate) => candidate.executable), ['C:\\tools\\python.exe'])
})

test('check mode is read-only and does not install or download', async () => {
  const root = await mkdtemp(join(tmpdir(), 'rhl-runtime-test-')); const calls: string[][] = []
  try {
    const result = await preflight({ root, platform: 'linux', execute: async (executable: string, args: string[]) => { calls.push([executable, ...args]); return { ok: false, stdout: '', stderr: '' } } })
    assert.equal(result.status, 'MANAGED_PYTHON_MISSING')
    assert.equal(calls.some((call) => call.includes('pip') || call.includes('docling_tools')), false)
    assert.deepEqual(await readdir(root), [])
  } finally { await rm(root, { recursive: true, force: true }) }
})

test('setup requires a usable bounded base Python and never treats a directory as ready', async () => {
  const root = await mkdtemp(join(tmpdir(), 'rhl-runtime-test-')); const calls: string[][] = []
  try {
    await mkdir(join(root, '.researchhub-document-parser', 'venv'), { recursive: true })
    const result = await setup({ root, platform: 'linux', execute: async (executable: string, args: string[]) => { calls.push([executable, ...args]); return { ok: false, stdout: '', stderr: '' } } })
    assert.equal(result.status, 'INCONCLUSIVE')
    assert.equal(result.reason, 'BASE_PYTHON_MISSING')
    assert.equal(calls.some((call) => call.includes('pip') || call.includes('docling_tools')), false)
  } finally { await rm(root, { recursive: true, force: true }) }
})

test('failure reasons are bounded and bridge smoke uses offline mode', async () => {
  const root = await mkdtemp(join(tmpdir(), 'rhl-runtime-test-')); const calls: Array<{ executable: string; args: string[]; options?: { env?: Record<string, string> } }> = []
  try {
    const result = await setup({ root, platform: 'linux', explicitPython: 'fixture-python', execute: async (executable: string, args: string[], options?: CommandOptions) => {
      calls.push({ executable, args, options });
      if (args.includes('-c')) return { ok: true, stdout: JSON.stringify({ version: '3.12.0', venv: true, pip: true, docling: true, doclingVersion: DOCLING_VERSION }), stderr: '' }
      if (args.includes('venv')) return { ok: true, stdout: '', stderr: '' }
      if (args.includes('pip')) return { ok: false, stdout: '', stderr: 'private-token-should-not-escape' }
      return { ok: false, stdout: '', stderr: '' }
    } })
    assert.equal(result.status, 'INCONCLUSIVE')
    assert.equal(result.reason, 'PIP_INSTALL_FAILED')
    assert.equal(calls.some((call) => call.options?.env?.HF_HUB_OFFLINE === '1'), false)
    assert.doesNotMatch(JSON.stringify(result), /private-token|[A-Za-z]:\\Users\\/i)
  } finally { await rm(root, { recursive: true, force: true }) }
})
