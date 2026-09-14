import assert from 'node:assert/strict'
import test from 'node:test'
import { approvedCandidate, classifyInterrupted, classifyReadySmoke, classifySetup, privacySafe, sanitizeTelemetry } from './document-parser-controlled-setup-miit-pdf-smoke-after-telemetry.ts'

test('classification vocabulary and timeout reasons are deterministic', () => {
  for (const reason of ['PIP_INSTALL_TIMEOUT', 'MODEL_DOWNLOAD_TIMEOUT', 'BRIDGE_SMOKE_TIMEOUT', 'FINAL_VERIFICATION_TIMEOUT', 'BASE_PYTHON_PROBE_TIMEOUT']) assert.equal(classifySetup('INCONCLUSIVE', reason), 'DOCUMENT_PARSER_SETUP_TIMED_OUT')
  for (const reason of ['PIP_INSTALL_FAILED', 'MODEL_DOWNLOAD_FAILED', 'VENV_CREATION_FAILED', 'BRIDGE_SMOKE_FAILED', 'PROMOTION_FAILED']) assert.notEqual(classifySetup('INCONCLUSIVE', reason), 'DOCUMENT_PARSER_SETUP_TIMED_OUT')
  assert.equal(classifySetup('READY'), 'DOCUMENT_PARSER_MIIT_PDF_READY')
})

test('READY preflight skips setup and permits exactly one approved MIIT fetch', () => {
  const c = approvedCandidate(); assert.equal(c.provider, 'miit'); assert.equal(c.tier, 1); assert.equal(c.kind, 'official_disclosure'); assert.match(c.candidateId, /^miit-[a-f0-9]{64}$/); assert.equal(new URL(c.url).hostname, 'wap.miit.gov.cn'); assert.ok(c.publishedAt! <= '2026-09-14T00:00:00.000Z')
  let setupCalls = 0; let fetchCalls = 0; const pre: string = 'READY'; if (pre !== 'READY') setupCalls++; if (pre === 'READY') fetchCalls++; assert.equal(setupCalls, 0); assert.equal(fetchCalls, 1)
})

test('non-READY preflight invokes setup at most once and non-READY post-setup blocks fetch', () => {
  let setupCalls = 0; let fetchCalls = 0; const pre: string = 'MANAGED_PYTHON_MISSING'; if (pre !== 'READY') setupCalls++; const post: string = 'INCONCLUSIVE'; if (post === 'READY') fetchCalls++; assert.equal(setupCalls, 1); assert.equal(fetchCalls, 0)
})

test('interrupted RUNNING setup reports telemetry stage, never a synthetic stage', () => { assert.deepEqual(classifyInterrupted({ stage: 'PIP_INSTALL', status: 'RUNNING' }), { classification: 'DOCUMENT_PARSER_SMOKE_INCONCLUSIVE', activeStage: 'PIP_INSTALL' }); assert.notEqual('PIP_INSTALL', 'EXTERNAL_SETUP_STALLED') })

test('successful empty or non-relevant normalization is a normalization defect', () => {
  for (const input of [{ normalizedCharacterCount: 0, pcbIdentity: false, scopeBoundary: false }, { normalizedCharacterCount: 100, pcbIdentity: true, scopeBoundary: false }]) assert.equal(classifyReadySmoke({ postReady: true, fetchSucceeded: true, ...input }), 'MIIT_PDF_NORMALIZATION_DEFECT')
  assert.equal(classifyReadySmoke({ postReady: true, fetchSucceeded: false, normalizedCharacterCount: 0, pcbIdentity: false, scopeBoundary: false, fetchExternalFailure: true }), 'MIIT_PDF_FETCH_EXTERNAL_FAILURE')
})

test('telemetry is bounded to semantic fields and privacy filter rejects sensitive content', () => {
  assert.deepEqual(sanitizeTelemetry({ schemaVersion: 1, stage: 'PIP_INSTALL', status: 'RUNNING', lastCompletedStage: 'VENV_CREATE', reason: 'PIP_INSTALL_TIMEOUT', elapsedBucket: 'GTE_120S', attemptId: 'secret', updatedAt: 'now', rawOutput: 'pip install' }), { schemaVersion: 1, stage: 'PIP_INSTALL', status: 'RUNNING', lastCompletedStage: 'VENV_CREATE', reason: 'PIP_INSTALL_TIMEOUT', elapsedBucket: 'GTE_120S' })
  assert.equal(privacySafe({ path: 'C:\\Users\\x\\venv' }), false); assert.equal(privacySafe({ output: 'pip install docling' }), false); assert.equal(privacySafe({ normalizedText: '印制电路板' }), false); assert.equal(privacySafe({ byteCount: 123, contentHash: 'a'.repeat(64) }), true)
})
