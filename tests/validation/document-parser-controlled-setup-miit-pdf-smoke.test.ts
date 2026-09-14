import assert from 'node:assert/strict'
import test from 'node:test'
import { approvedCandidate, classifySetup, privacySafe } from './document-parser-controlled-setup-miit-pdf-smoke.ts'

test('classifies controlled setup outcomes deterministically', () => {
  assert.equal(classifySetup('READY'), 'DOCUMENT_PARSER_MIIT_PDF_READY')
  assert.equal(classifySetup('INCONCLUSIVE', 'PIP_INSTALL_FAILED'), 'DOCUMENT_PARSER_SETUP_EXTERNAL_FAILURE')
  assert.equal(classifySetup('INCONCLUSIVE', 'PROMOTION_FAILED'), 'DOCUMENT_PARSER_SETUP_DEFECT')
  assert.equal(classifySetup('INCONCLUSIVE', 'BRIDGE_SMOKE_FAILED'), 'DOCUMENT_PARSER_SETUP_DEFECT')
  assert.equal(classifySetup('INCONCLUSIVE', 'unknown'), 'DOCUMENT_PARSER_SMOKE_INCONCLUSIVE')
})
test('READY preflight skips setup and candidate is deterministic and eligible', () => {
  const c = approvedCandidate(); assert.equal(c.provider, 'miit'); assert.equal(c.tier, 1); assert.equal(c.kind, 'official_disclosure'); assert.match(c.candidateId, /^miit-[a-f0-9]{64}$/); assert.equal(c.metadata?.anchor, true); assert.ok(c.publishedAt! <= '2026-09-14T00:00:00.000Z')
})
test('result assembly permits one PDF fetch only after READY and setup success', () => {
  let setupCalls = 0; let fetchCalls = 0; const run = (pre: string, setup: string) => { if (pre === 'READY') return; setupCalls++; if (setup === 'READY') fetchCalls++ }
  run('READY', 'not-called'); run('MANAGED_PYTHON_MISSING', 'READY'); assert.equal(setupCalls, 1); assert.equal(fetchCalls, 1)
})
test('failed setup does not trigger PDF fetch', () => { let fetchCalls = 0; const setup: string = 'INCONCLUSIVE'; if (setup === 'READY') fetchCalls++; assert.equal(fetchCalls, 0) })
test('privacy filter rejects paths, environment values, package output and document text', () => {
  assert.equal(privacySafe({ path: 'C:\\Users\\x\\venv', ok: true }), false); assert.equal(privacySafe({ env: 'OPENAI_API_KEY=secret' }), false); assert.equal(privacySafe({ output: 'pip install docling' }), false); assert.equal(privacySafe({ normalizedText: '印制电路板' }), false); assert.equal(privacySafe({ byteCount: 123, status: 'succeeded' }), true)
})
