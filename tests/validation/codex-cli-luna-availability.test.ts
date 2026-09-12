import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

test('Codex Luna availability evidence has the required sanitized shape', async () => {
  const evidence = JSON.parse(await readFile('tests/validation/evidence/RHL_M3B_CODEX_CLI_LUNA_AVAILABILITY.json', 'utf8')) as Record<string, any>
  assert.equal(evidence.taskId, 'RHL-M3B-3B-FIX-003-CODEX-CLI-LUNA-PI-COMPATIBLE-REASONING')
  assert.equal(evidence.codex.model, 'gpt-5.6-luna')
  assert.equal(evidence.codex.reasoningEffort, 'medium')
  assert.equal(evidence.codex.backend, 'codex-cli')
  assert.equal(evidence.secretsIncluded, false)
  assert.equal(evidence.privatePathsIncluded, false)
})
