import { spawn } from 'node:child_process'
import { access, mkdir, readdir, rename, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const DOCLING_VERSION = '2.116.0'
export const MODEL_FAMILIES = ['layout', 'tableformer']
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const bridgeRelativePath = 'plugins/document/parsers/docling/bridge/docling_bridge.py'
const requirementsRelativePath = 'config/document-parser/requirements.txt'
const checkCode = "import importlib.metadata,importlib.util,json,sys; print(json.dumps({'version':sys.version.split()[0],'venv':importlib.util.find_spec('venv') is not None,'pip':importlib.util.find_spec('pip') is not None,'docling':importlib.util.find_spec('docling') is not None,'doclingVersion':(importlib.metadata.version('docling') if importlib.util.find_spec('docling') is not None else None)}))"
const fixturePdf = Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 300] /Contents 4 0 R >>\nendobj\n4 0 obj\n<< /Length 44 >>\nstream\nBT /F1 12 Tf 20 200 Td (ResearchHub smoke) Tj ET\nendstream\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n', 'ascii')

function pythonPath(root, platform) { return resolve(root, '.researchhub-document-parser', platform === 'win32' ? 'venv/Scripts/python.exe' : 'venv/bin/python') }
function modelPath(root) { return resolve(root, '.researchhub-document-parser/models') }
function stagingPath(root, name) { return resolve(root, '.researchhub-document-parser/.staging', name) }
function commandArgs(platform, executable, args) { return { executable, args, platform } }
export function candidatePlan(platform = process.platform, explicitPython) {
  if (explicitPython?.trim()) return [commandArgs(platform, explicitPython.trim(), [])]
  return (platform === 'win32' ? [['py', ['-3']], ['python', []]] : [['python3', []], ['python', []]])
    .map(([executable, args]) => commandArgs(platform, executable, args))
}
export function bootstrapPlan(platform = process.platform, paths = { venv: 'managed-venv', models: 'managed-models' }) {
  const python = platform === 'win32' ? join(paths.venv, 'Scripts', 'python.exe') : join(paths.venv, 'bin', 'python')
  const tools = platform === 'win32' ? join(paths.venv, 'Scripts', 'docling-tools.exe') : join(paths.venv, 'bin', 'docling-tools')
  return { venv: { executable: python, args: ['-m', 'venv', paths.venv], systemSitePackages: false }, install: { executable: python, args: ['-m', 'pip', 'install', '--disable-pip-version-check', '-r', requirementsRelativePath] }, models: { executable: tools, args: ['models', 'download', ...MODEL_FAMILIES, '--output-dir', paths.models] } }
}
async function runCommand(executable, args, options = {}) {
  return new Promise((done) => { const child = spawn(executable, args, { cwd: options.cwd, env: options.env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true }); let stdout = ''; let stderr = ''; child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8'); child.stdout.on('data', (v) => { stdout += v }); child.stderr.on('data', (v) => { stderr += v }); child.on('error', () => done({ ok: false, stdout: '', stderr: 'command_failed' })); child.on('close', (code) => done({ ok: code === 0, stdout, stderr })) })
}
async function exists(path) { try { await access(path); return true } catch { return false } }
async function nonEmptyDirectory(path) { try { const info = await stat(path); return info.isDirectory() && (await readdir(path)).length > 0 } catch { return false } }
function safeReason(reason) { return reason.replace(/[A-Za-z]:\\[^\n\r ]*|\/Users\/[^\n\r ]*|\/home\/[^\n\r ]*/gi, '[redacted]').replace(/(token|password|secret|credential|authorization)[^\n\r ]*/gi, '$1=[redacted]') }
async function probe(executable, prefix = [], execute = runCommand) {
  const result = await execute(executable, [...prefix, '-c', checkCode])
  if (!result.ok) return null
  try { const value = JSON.parse(result.stdout.trim()); return { executableAvailable: true, venvModuleAvailable: value.venv === true, pipModuleAvailable: value.pip === true, doclingImportAvailable: value.docling === true, doclingVersion: typeof value.doclingVersion === 'string' ? value.doclingVersion : null } } catch { return null }
}
async function smoke(python, models, root, execute = runCommand) {
  const directory = await (await import('node:fs/promises')).mkdtemp(join(tmpdir(), 'rhl-docling-'))
  const pdf = join(directory, 'fixture.pdf')
  try {
    const { writeFile } = await import('node:fs/promises'); await writeFile(pdf, fixturePdf)
    const result = await execute(python, [resolve(root, bridgeRelativePath), pdf], { cwd: root, env: { ...process.env, RESEARCHHUB_DOCLING_ARTIFACTS_PATH: models, HF_HUB_OFFLINE: '1' } })
    return result.ok
  } finally { await rm(directory, { recursive: true, force: true }) }
}
async function readyState(root, platform, execute = runCommand) {
  const python = pythonPath(root, platform); const models = modelPath(root)
  const probeResult = await probe(python, [], execute)
  const dependencyReady = probeResult?.doclingImportAvailable === true && probeResult.doclingVersion === DOCLING_VERSION
  const artifactsReady = await nonEmptyDirectory(models)
  const bridgeReady = dependencyReady && artifactsReady && await smoke(python, models, root, execute)
  return { status: bridgeReady ? 'READY' : !await exists(python) ? 'MANAGED_PYTHON_MISSING' : !dependencyReady ? 'DOCLING_DEPENDENCY_MISSING' : !artifactsReady ? 'ARTIFACTS_MISSING' : 'BRIDGE_SMOKE_FAILED', pythonReady: Boolean(probeResult?.executableAvailable), dependencyReady, artifactsReady, bridgeReady }
}
export async function preflight({ root = repoRoot, platform = process.platform, execute = runCommand } = {}) { return readyState(root, platform, execute) }
export async function setup({ root = repoRoot, platform = process.platform, explicitPython, execute = runCommand } = {}) {
  const initial = await readyState(root, platform, execute)
  if (initial.status === 'READY') return initial
  let base = null
  for (const candidate of candidatePlan(platform, explicitPython)) { const result = await probe(candidate.executable, candidate.args, execute); if (result?.executableAvailable && result.venvModuleAvailable && result.pipModuleAvailable) { base = candidate; break } }
  if (!base) return { status: 'INCONCLUSIVE', reason: 'BASE_PYTHON_MISSING' }
  const stagingRoot = stagingPath(root, `run-${Date.now()}`); const stagedVenv = join(stagingRoot, 'venv'); const stagedModels = join(stagingRoot, 'models'); const stagedPython = platform === 'win32' ? join(stagedVenv, 'Scripts', 'python.exe') : join(stagedVenv, 'bin', 'python')
  try {
    await mkdir(stagingRoot, { recursive: true })
    let result = await execute(base.executable, [...base.args, '-m', 'venv', stagedVenv], { cwd: root, env: { ...process.env } }); if (!result.ok) return { status: 'INCONCLUSIVE', reason: 'VENV_CREATION_FAILED' }
    result = await execute(stagedPython, ['-m', 'pip', 'install', '--disable-pip-version-check', '-r', resolve(root, requirementsRelativePath)], { cwd: root, env: { ...process.env } }); if (!result.ok) return { status: 'INCONCLUSIVE', reason: 'PIP_INSTALL_FAILED' }
    const toolsExecutable = platform === 'win32' ? join(stagedVenv, 'Scripts', 'docling-tools.exe') : join(stagedVenv, 'bin', 'docling-tools'); result = await execute(toolsExecutable, ['models', 'download', ...MODEL_FAMILIES, '--output-dir', stagedModels], { cwd: root, env: { ...process.env } }); if (!result.ok) return { status: 'INCONCLUSIVE', reason: 'MODEL_DOWNLOAD_FAILED' }
    if (!await nonEmptyDirectory(stagedModels) || !await smoke(stagedPython, stagedModels, root, execute)) return { status: 'BRIDGE_SMOKE_FAILED' }
    const finalRoot = resolve(root, '.researchhub-document-parser'); await mkdir(finalRoot, { recursive: true }); await rm(pythonPath(root, platform), { force: true }); await rm(modelPath(root), { recursive: true, force: true }); await rename(stagedVenv, join(finalRoot, 'venv')); await rename(stagedModels, join(finalRoot, 'models')); return readyState(root, platform, execute)
  } finally { await rm(stagingRoot, { recursive: true, force: true }) }
}
function parseArgs(args) { const setupMode = args.includes('--setup'); const checkMode = args.includes('--check') || !setupMode; const index = args.indexOf('--python'); return { setupMode, checkMode, explicitPython: index >= 0 ? args[index + 1] : undefined } }
if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) { const args = parseArgs(process.argv.slice(2)); const result = args.setupMode ? await setup({ explicitPython: args.explicitPython }) : args.checkMode ? await preflight() : { status: 'INCONCLUSIVE', reason: 'UNKNOWN_MODE' }; console.log(JSON.stringify(result)); process.exitCode = result.status === 'READY' ? 0 : 1 }
