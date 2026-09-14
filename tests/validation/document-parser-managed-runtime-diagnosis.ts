import { spawn } from 'node:child_process'
import { access, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export type FinalClassification = 'MANAGED_PARSER_RUNTIME_READY' | 'REPOSITORY_BOOTSTRAP_GAP' | 'MANAGED_PARSER_DEPENDENCY_GAP' | 'MANAGED_PARSER_ARTIFACT_GAP' | 'EXTERNAL_PYTHON_RUNTIME_REQUIRED' | 'MANAGED_PARSER_DIAGNOSIS_INCONCLUSIVE'
export interface InterpreterProbe { candidateLabel: string; executableAvailable: boolean; version?: string; venvModuleAvailable: boolean; pipModuleAvailable: boolean; doclingImportAvailable: boolean; doclingVersion?: string }
export interface RuntimeState { exists: boolean; executable: boolean; probe?: InterpreterProbe }
export interface ArtifactsState { exists: boolean; isDirectory: boolean; nonEmpty: boolean; entryCount: number }
export interface BridgeState { path: string; exists: boolean; readable: boolean }
export interface DiagnosticInput { managed: RuntimeState; system: InterpreterProbe[]; artifacts: ArtifactsState; bridgeSmoke: { status: 'succeeded' | 'skipped' | 'failed'; errorCategory?: string }; bootstrapMechanism: { packageScriptPresent: boolean; scriptsSetupFilePresent: boolean } }

const PYTHON_CHECK = "import importlib.util,importlib.metadata,json,sys; print(json.dumps({'version':sys.version.split()[0],'venv':importlib.util.find_spec('venv') is not None,'pip':importlib.util.find_spec('pip') is not None,'docling':importlib.util.find_spec('docling') is not None,'doclingVersion':(importlib.metadata.version('docling') if importlib.util.find_spec('docling') is not None else None)}))"
const SAFE_ERROR = /document_parser_(?:environment_not_ready|failed)/

export function classify(input: DiagnosticInput): FinalClassification {
  const selected = input.managed.probe
  const selectedUsable = input.managed.exists && input.managed.executable && !!selected?.executableAvailable
  if (selectedUsable && selected?.doclingImportAvailable) {
    if (!input.artifacts.exists || !input.artifacts.isDirectory || !input.artifacts.nonEmpty) return 'MANAGED_PARSER_ARTIFACT_GAP'
    if (input.bridgeSmoke.status === 'succeeded') return 'MANAGED_PARSER_RUNTIME_READY'
    if (input.bridgeSmoke.status === 'failed') return 'MANAGED_PARSER_DIAGNOSIS_INCONCLUSIVE'
  } else if (selectedUsable) {
    return 'MANAGED_PARSER_DEPENDENCY_GAP'
  }
  const usableSystem = input.system.some((candidate) => candidate.executableAvailable && candidate.venvModuleAvailable && candidate.pipModuleAvailable)
  if (!selectedUsable && usableSystem && !input.bootstrapMechanism.packageScriptPresent && !input.bootstrapMechanism.scriptsSetupFilePresent) return 'REPOSITORY_BOOTSTRAP_GAP'
  if (!selectedUsable && !usableSystem) return 'EXTERNAL_PYTHON_RUNTIME_REQUIRED'
  return 'MANAGED_PARSER_DIAGNOSIS_INCONCLUSIVE'
}

function sanitizedError(value: string): string {
  const match = value.match(SAFE_ERROR)
  if (match) return match[0]
  if (/module named ['"]docling/i.test(value)) return 'docling_import_error'
  if (/no such file|cannot find|not found/i.test(value)) return 'executable_not_found'
  return 'bridge_failure'
}

async function command(executable: string, args: string[], environment?: Record<string, string>): Promise<{ ok: boolean; output: string }> {
  return new Promise((done) => { const child = spawn(executable, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], ...(environment ? { env: { ...process.env, ...environment } } : {}) }); let out = ''; let err = ''; child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8'); child.stdout.on('data', (v) => { out += v }); child.stderr.on('data', (v) => { err += v }); child.on('error', () => done({ ok: false, output: '' })); child.on('close', (code) => done({ ok: code === 0, output: (out || err).trim() })) })
}

async function probe(label: string, executable: string, args: string[] = ['-c', PYTHON_CHECK]): Promise<InterpreterProbe> {
  const result = await command(executable, args)
  if (!result.ok) return { candidateLabel: label, executableAvailable: false, venvModuleAvailable: false, pipModuleAvailable: false, doclingImportAvailable: false }
  try { const value = JSON.parse(result.output) as { version?: string; venv?: boolean; pip?: boolean; docling?: boolean; doclingVersion?: string }; return { candidateLabel: label, executableAvailable: true, version: typeof value.version === 'string' ? value.version : 'unknown', venvModuleAvailable: value.venv === true, pipModuleAvailable: value.pip === true, doclingImportAvailable: value.docling === true, ...(typeof value.doclingVersion === 'string' ? { doclingVersion: value.doclingVersion } : {}) } } catch { return { candidateLabel: label, executableAvailable: true, venvModuleAvailable: false, pipModuleAvailable: false, doclingImportAvailable: false } }
}

async function exists(path: string): Promise<boolean> { try { await access(path); return true } catch { return false } }
async function fileReadable(path: string): Promise<boolean> { try { await readFile(path); return true } catch { return false } }
async function artifactsState(path: string): Promise<ArtifactsState> { try { const info = await stat(path); if (!info.isDirectory()) return { exists: true, isDirectory: false, nonEmpty: false, entryCount: 0 }; const entries = await readdir(path); return { exists: true, isDirectory: true, nonEmpty: entries.length > 0, entryCount: Math.min(entries.length, 100) } } catch { return { exists: false, isDirectory: false, nonEmpty: false, entryCount: 0 } } }

async function smoke(executable: string, bridge: string, artifacts: string): Promise<{ status: 'succeeded' | 'skipped' | 'failed'; errorCategory?: string; parser?: { id: string; version?: string }; normalizedCharacterCount?: number; sectionCount?: number; blockCount?: number; warningCount?: number }> {
  const dir = await mkdtemp(join(tmpdir(), 'rhl-docling-diagnosis-')); const pdf = join(dir, 'fixture.pdf')
  const bytes = Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n', 'ascii')
  try { await writeFile(pdf, bytes); const result = await command(executable, [bridge, pdf], { RESEARCHHUB_DOCLING_ARTIFACTS_PATH: artifacts, HF_HUB_OFFLINE: '1' }); if (!result.ok) return { status: 'failed', errorCategory: sanitizedError(result.output) }; try { const value = JSON.parse(result.output) as { parser?: { id?: string; version?: string }; normalizedText?: string; sections?: unknown[]; blocks?: unknown[]; warnings?: unknown[] }; return { status: 'succeeded', parser: { id: value.parser?.id ?? 'unknown', ...(value.parser?.version ? { version: value.parser.version } : {}) }, normalizedCharacterCount: typeof value.normalizedText === 'string' ? value.normalizedText.length : 0, sectionCount: Array.isArray(value.sections) ? value.sections.length : 0, blockCount: Array.isArray(value.blocks) ? value.blocks.length : 0, warningCount: Array.isArray(value.warnings) ? value.warnings.length : 0 } } catch { return { status: 'failed', errorCategory: 'invalid_bridge_json' } } } finally { await rm(dir, { recursive: true, force: true }) }
}

async function bootstrapState(repoRoot: string): Promise<{ packageScriptPresent: boolean; scriptsSetupFilePresent: boolean }> {
  let packageScriptPresent = false
  try { const pkg = JSON.parse(await readFile(join(repoRoot, 'package.json'), 'utf8')) as { scripts?: Record<string, string> }; packageScriptPresent = Object.entries(pkg.scripts ?? {}).some(([key, value]) => /docling|document-parser|parser.*(setup|bootstrap)|bootstrap.*parser/i.test(`${key} ${value}`)) } catch { packageScriptPresent = false }
  let scriptsSetupFilePresent = false
  try { const entries = await readdir(join(repoRoot, 'scripts')); scriptsSetupFilePresent = entries.some((entry) => /docling|document-parser|parser.*(setup|bootstrap)|bootstrap.*parser/i.test(entry)) } catch { scriptsSetupFilePresent = false }
  return { packageScriptPresent, scriptsSetupFilePresent }
}

export async function runDiagnostic(repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')): Promise<Record<string, unknown>> {
  const configuredPython = Boolean(process.env.RESEARCHHUB_PYTHON_EXECUTABLE?.trim()); const configuredArtifacts = Boolean(process.env.RESEARCHHUB_DOCLING_ARTIFACTS_PATH?.trim())
  const defaultPython = resolve(repoRoot, '.researchhub-document-parser', process.platform === 'win32' ? 'venv/Scripts/python.exe' : 'venv/bin/python'); const defaultArtifacts = resolve(repoRoot, '.researchhub-document-parser/models')
  const python = process.env.RESEARCHHUB_PYTHON_EXECUTABLE?.trim() || defaultPython
  const artifacts = process.env.RESEARCHHUB_DOCLING_ARTIFACTS_PATH?.trim() || defaultArtifacts
  const bridge = resolve(repoRoot, 'plugins/document/parsers/docling/bridge/docling_bridge.py')
  const managedExists = await exists(python); const managedProbe = managedExists ? await probe('production_selected_python', python) : undefined
  const system: InterpreterProbe[] = process.platform === 'win32' ? [await probe('system_python', 'python'), await probe('system_py_3', 'py', ['-3', '-c', PYTHON_CHECK])] : [await probe('system_python3', 'python3'), await probe('system_python', 'python')]
  const defaultArt = await artifactsState(defaultArtifacts); const art = await artifactsState(artifacts); const bridgeState = { path: 'plugins/document/parsers/docling/bridge/docling_bridge.py', exists: await exists(bridge), readable: await fileReadable(bridge) }
  const prerequisites = !!managedProbe?.executableAvailable && !!managedProbe.doclingImportAvailable && art.exists && art.isDirectory && art.nonEmpty && bridgeState.exists && bridgeState.readable
  const bridgeSmoke = prerequisites ? await smoke(python, bridge, artifacts) : { status: 'skipped' as const }
  const bootstrap = await bootstrapState(repoRoot)
  const input: DiagnosticInput = { managed: { exists: managedExists, executable: managedExists, probe: managedProbe }, system, artifacts: art, bridgeSmoke, bootstrapMechanism: bootstrap }
  const finalClassification = classify(input)
  const evidence = { task043Context: { accepted: true, finalClassification: 'PRODUCT_QUALITY_BLOCKED_BY_EVIDENCE', workflowStatus: 'blocked', acquisitionWaves: 2, gatewaySubmitCount: 0, canonicalRevisionDelta: 0, mandatoryIndustryDefinition: 'unavailable', pdfAnchorNormalizationFailures: 2 }, productionParserContract: { defaultManagedPython: 'default_managed_python', defaultManagedArtifacts: 'default_managed_artifacts', bridge: 'plugins/document/parsers/docling/bridge/docling_bridge.py', offline: true }, configuredOverrides: { pythonExecutableConfigured: configuredPython, artifactsPathConfigured: configuredArtifacts }, defaultManagedRuntime: { semanticLabel: 'default_managed_python', exists: await exists(defaultPython), executable: await exists(defaultPython) }, selectedInterpreter: managedProbe ? { ...managedProbe, candidateLabel: configuredPython ? 'configured_python' : 'default_managed_python' } : { candidateLabel: configuredPython ? 'configured_python' : 'default_managed_python', executableAvailable: false, venvModuleAvailable: false, pipModuleAvailable: false, doclingImportAvailable: false }, systemPythonProbes: system, doclingDependency: { importAvailable: managedProbe?.doclingImportAvailable === true, version: managedProbe?.doclingVersion ?? null }, artifacts: { ...art, semanticLabel: configuredArtifacts ? 'configured_artifacts' : 'default_managed_artifacts' }, defaultManagedArtifacts: { ...defaultArt, semanticLabel: 'default_managed_artifacts' }, bridge: bridgeState, offlineSmoke: bridgeSmoke, repositoryBootstrapMechanism: { ...bootstrap, present: bootstrap.packageScriptPresent || bootstrap.scriptsSetupFilePresent }, privacy: { absolutePathsPersisted: false, userProfilePathsPersisted: false, environmentValuesPersisted: false, credentialsOrTokensPersisted: false, rawEnvironmentDumpPersisted: false, fixtureTextPersisted: false }, finalClassification }
  await writeFile(join(repoRoot, 'tests/validation/evidence/RHL_M3B_DOCUMENT_PARSER_MANAGED_RUNTIME_DIAGNOSIS.json'), `${JSON.stringify(evidence, null, 2)}\n`, 'utf8')
  return evidence
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) { console.log(JSON.stringify(await runDiagnostic(), null, 2)) }
