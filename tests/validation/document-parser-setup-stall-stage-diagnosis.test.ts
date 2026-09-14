import assert from 'node:assert/strict'
import test from 'node:test'
import { classifyStage, localizeStage, MAX_PROBE_MS, PIN, privacy, type AvailabilityProbe, type LocalizationInput } from './document-parser-setup-stall-stage-diagnosis.ts'

const probe = (doclingImportAvailable = false, doclingVersion?: string) => ({ candidateLabel: 'staged_1', executableAvailable: true, venvAvailable: true, pipAvailable: true, doclingImportAvailable, doclingVersion })
const layout = (changes = {}) => ({ finalVenvExists: false, finalManagedPythonExists: false, finalModelsExists: false, finalModelsNonEmpty: false, stagingParentExists: true, staleRunCount: 1, backupPresence: false, ...changes })
const stale = (changes = {}) => ({ ordinal: 'stale_1', stagedVenvExists: true, stagedPythonExists: true, stagedModelsExists: false, stagedModelsNonEmpty: false, backupVenvExists: false, backupModelsExists: false, ...changes })
const input = (changes: Partial<LocalizationInput> = {}): LocalizationInput => ({ layout: layout(), stale: [stale()], stagedProbes: [probe()], ...changes })
const healthy: AvailabilityProbe = { attempted: true, success: true, elapsedBucket: 'UNDER_1S' }
const audit = { commandHardTimeoutPresent: false, stageTelemetryPresent: false }

test('staged Python without pinned Docling localizes PIP_STAGE', () => assert.equal(localizeStage(input()), 'PIP_STAGE'))
test('pinned Docling with missing models localizes MODEL_DOWNLOAD_STAGE', () => assert.equal(localizeStage(input({ stagedProbes: [probe(true, PIN)] })), 'MODEL_DOWNLOAD_STAGE'))
test('pinned Docling with non-empty models and no final runtime localizes bridge or promotion', () => assert.equal(localizeStage(input({ stale: [stale({ stagedModelsExists: true, stagedModelsNonEmpty: true })], stagedProbes: [probe(true, PIN)] })), 'BRIDGE_OR_PROMOTION_STAGE'))
test('absent stale evidence is UNKNOWN_STAGE', () => assert.equal(localizeStage(input({ layout: layout({ staleRunCount: 0, stagingParentExists: false }), stale: [], stagedProbes: [] })), 'UNKNOWN_STAGE'))
test('backup or partial final movement is promotion or rollback evidence', () => assert.equal(localizeStage(input({ layout: layout({ backupPresence: true }) })), 'PROMOTION_OR_ROLLBACK_STAGE'))
test('later localized stages do not run package-index probes', () => { assert.equal(classifyStage('MODEL_DOWNLOAD_STAGE', undefined, audit, false), 'SETUP_STALL_MODEL_DOWNLOAD_STAGE'); assert.equal(classifyStage('BRIDGE_OR_PROMOTION_STAGE', undefined, audit, false), 'SETUP_STALL_BRIDGE_OR_PROMOTION_STAGE') })
test('PIP_STAGE with healthy or insufficient availability remains repository-local', () => { assert.equal(classifyStage('PIP_STAGE', healthy, audit, true), 'SETUP_STALL_BOOTSTRAP_TIMEOUT_OBSERVABILITY_GAP'); assert.equal(classifyStage('PIP_STAGE', undefined, audit, true), 'SETUP_STALL_BOOTSTRAP_TIMEOUT_OBSERVABILITY_GAP') })
test('bounded external failure is classified only at PIP or UNKNOWN stage', () => { const failed: AvailabilityProbe = { attempted: true, success: false, elapsedBucket: '5_TO_20S', errorCategory: 'TIMEOUT' }; assert.equal(classifyStage('PIP_STAGE', failed, audit, true), 'SETUP_STALL_EXTERNAL_PACKAGE_INDEX_FAILURE'); assert.equal(classifyStage('MODEL_DOWNLOAD_STAGE', failed, audit, false), 'SETUP_STALL_MODEL_DOWNLOAD_STAGE') })
test('all external process probes have the required hard bound', () => assert.ok(MAX_PROBE_MS <= 20_000))
test('privacy regression rejects paths, raw output, environment and inventories', () => { const unsafe = { path: 'C:\\Users\\Administrator\\secret', rawStdout: 'pip install docling', environment: 'PATH=x', packageFiles: ['private.whl'], token: 'Bearer abc' }; assert.equal(privacy(unsafe), false); assert.equal(privacy({ absolutePathsPersisted: false, rawPackageOutputPersisted: false, packageInventoriesPersisted: false }), true) })
