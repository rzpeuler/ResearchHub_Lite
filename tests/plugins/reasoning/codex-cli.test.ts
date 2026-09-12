import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { buildCodexCliInvocationArgs, CODEX_CLI_LUNA_CONFIG, CodexCliReasoningExecutor, parseCodexCliJsonlFinalResponse } from '../../../plugins/reasoning/codex-cli/executor.ts'
import { PiReasoningExecutor } from '../../../plugins/reasoning/pi/executor.ts'

const capabilities = { maxContextTokens: 4_000, maxOutputTokens: 1_000, structuredOutputSupport: true, maxConcurrency: 1 }
const fixture = join(process.cwd(), 'tests/plugins/reasoning/fixtures/fake-reasoning-host.mjs')

test('Codex CLI Luna configuration is immutable and builds the safe documented invocation', () => {
  assert.deepEqual(CODEX_CLI_LUNA_CONFIG, { backend: 'codex-cli', model: 'gpt-5.6-luna', reasoningEffort: 'medium' })
  const args = buildCodexCliInvocationArgs({ commandPrefix: ['exec'], ...CODEX_CLI_LUNA_CONFIG, invocationDirectory: 'temp', outputPath: 'temp/final-output.txt' })
  assert.deepEqual(args.slice(0, 16), ['exec', '--model', 'gpt-5.6-luna', '-c', 'model_reasoning_effort="medium"', '--ephemeral', '--sandbox', 'read-only', '--skip-git-repo-check', '-C', 'temp', '--json', '-o', 'temp/final-output.txt', '-'])
  assert.equal(args.includes('--dangerously-bypass-approvals-and-sandbox'), false)
  assert.equal(args.includes('semantic prompt'), false)
})

test('Codex CLI JSONL parser keeps only the final assistant response', () => {
  const stdout = [
    JSON.stringify({ type: 'thread.started', thread_id: 'public-fixture' }),
    JSON.stringify({ type: 'item.completed', item: { type: 'reasoning', text: 'private trace' } }),
    JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', text: '{"status":"ok"}' } }),
  ].join('\n')
  assert.equal(parseCodexCliJsonlFinalResponse(stdout), '{"status":"ok"}')
  assert.throws(() => parseCodexCliJsonlFinalResponse('{"type":"bad"}'), /final assistant response/)
  assert.throws(() => parseCodexCliJsonlFinalResponse('{bad'), /malformed JSONL/)
})

test('Codex CLI adapter runs through the Pi completion boundary without a native ModelRuntime model', async () => {
  const root = await mkdtemp(join(tmpdir(), 'rhl-codex-cli-test-'))
  try {
    const adapter = new CodexCliReasoningExecutor({ capabilities, executable: process.execPath, tempRoot: root, commandPrefix: [fixture] })
    const executor = new PiReasoningExecutor({ capabilities, completion: adapter.complete.bind(adapter), runtimeMetadata: { backend: 'codex-cli', requestedModel: 'gpt-5.6-luna', requestedReasoningEffort: 'medium' } })
    const result = await executor.execute({ operation: 'understandAndPlan', instruction: 'return the fixture object', input: { publicValue: 'ok' }, outputContract: { type: 'object' } })
    assert.equal((result.output as { ok: boolean }).ok, true)
    assert.deepEqual(executor.runtimeMetadata(), { provider: 'pi-coding-agent', backend: 'codex-cli', requestedModel: 'gpt-5.6-luna', requestedReasoningEffort: 'medium' })
  } finally { await rm(root, { recursive: true, force: true }) }
})
