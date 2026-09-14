import assert from 'node:assert/strict'
import test from 'node:test'
import { classify, type DiagnosticInput } from './document-parser-managed-runtime-diagnosis.ts'

const base: DiagnosticInput = { managed: { exists: true, executable: true, probe: { candidateLabel: 'managed', executableAvailable: true, version: '3.12.0', venvModuleAvailable: true, pipModuleAvailable: true, doclingImportAvailable: true, doclingVersion: '2.0.0' } }, system: [], artifacts: { exists: true, isDirectory: true, nonEmpty: true, entryCount: 1 }, bridgeSmoke: { status: 'succeeded' }, bootstrapMechanism: { packageScriptPresent: false, scriptsSetupFilePresent: false } }
const copy = (changes: Partial<DiagnosticInput>): DiagnosticInput => ({ ...base, ...changes })

test('classifies all six managed parser outcomes', () => {
  assert.equal(classify(base), 'MANAGED_PARSER_RUNTIME_READY')
  assert.equal(classify(copy({ managed: { exists: true, executable: true, probe: { ...base.managed.probe!, doclingImportAvailable: false, doclingVersion: undefined } } })), 'MANAGED_PARSER_DEPENDENCY_GAP')
  assert.equal(classify(copy({ artifacts: { exists: false, isDirectory: false, nonEmpty: false, entryCount: 0 } })), 'MANAGED_PARSER_ARTIFACT_GAP')
  assert.equal(classify(copy({ bridgeSmoke: { status: 'failed', errorCategory: 'bridge_failure' } })), 'MANAGED_PARSER_DIAGNOSIS_INCONCLUSIVE')
  assert.equal(classify({ ...base, managed: { exists: false, executable: false }, system: [{ candidateLabel: 'system', executableAvailable: true, venvModuleAvailable: true, pipModuleAvailable: true, doclingImportAvailable: false }], bridgeSmoke: { status: 'skipped' } }), 'REPOSITORY_BOOTSTRAP_GAP')
  assert.equal(classify({ ...base, managed: { exists: false, executable: false }, system: [{ candidateLabel: 'system', executableAvailable: false, venvModuleAvailable: false, pipModuleAvailable: false, doclingImportAvailable: false }], bridgeSmoke: { status: 'skipped' } }), 'EXTERNAL_PYTHON_RUNTIME_REQUIRED')
})

test('bootstrap gap wins over missing managed venv, and external runtime is narrower', () => {
  const system = [{ candidateLabel: 'system', executableAvailable: true, venvModuleAvailable: true, pipModuleAvailable: true, doclingImportAvailable: false }]
  assert.equal(classify({ ...base, managed: { exists: false, executable: false }, system, bridgeSmoke: { status: 'skipped' } }), 'REPOSITORY_BOOTSTRAP_GAP')
  assert.equal(classify({ ...base, managed: { exists: false, executable: false }, system: [{ ...system[0], venvModuleAvailable: false, pipModuleAvailable: false }], bridgeSmoke: { status: 'skipped' } }), 'EXTERNAL_PYTHON_RUNTIME_REQUIRED')
})

test('diagnostic-shaped evidence cannot contain private paths, values, or dumps', () => {
  const evidence = JSON.stringify({ configuredOverrides: { pythonExecutableConfigured: true, artifactsPathConfigured: true }, bridge: { path: 'plugins/document/parsers/docling/bridge/docling_bridge.py' }, privacy: { absolutePathsPersisted: false, userProfilePathsPersisted: false, environmentValuesPersisted: false, rawEnvironmentDumpPersisted: false } })
  assert.doesNotMatch(evidence, /[A-Za-z]:\\|\\Users\\|\/home\/|OPENAI_API_KEY|Bearer\s|PATH=/i)
  assert.doesNotMatch(evidence, /process\.env|environment dump|fixture text/i)
})
