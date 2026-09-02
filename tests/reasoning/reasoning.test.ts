import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { MockReasoningExecutor } from '../../plugins/reasoning/mock/executor.ts'
import { ReasoningExecutorError } from '../../plugins/reasoning/errors.ts'
import { CodexReasoningExecutor } from '../../plugins/reasoning/codex/executor.ts'

const capabilities = { maxContextTokens: 1000, maxOutputTokens: 500, structuredOutputSupport: false, maxConcurrency: 1 }

test('MockReasoningExecutor records calls and returns deterministic operation responses', async () => {
  const executor = new MockReasoningExecutor({ capabilities, responses: { understandAndPlan: { ok: true } } })
  const result = await executor.execute({ operation: 'understandAndPlan', instruction: 'test', input: { value: 1 }, outputContract: { type: 'object' } })
  assert.deepEqual(result.output, { ok: true })
  assert.equal(executor.calls.length, 1)
  assert.equal(executor.calls[0]?.operation, 'understandAndPlan')
})

test('reasoning capabilities reject guessed or invalid limits', () => {
  assert.throws(() => new MockReasoningExecutor({ capabilities: { ...capabilities, maxContextTokens: 0 } }), (error: unknown) => error instanceof ReasoningExecutorError && error.code === 'reasoning_configuration_invalid')
})

test('Codex executor isolates and cleans its invocation directory', async () => {
  const root = await mkdtemp(join(tmpdir(), 'rhl-reasoning-test-'))
  try {
    const executor = new CodexReasoningExecutor({ capabilities, executable: process.execPath, tempRoot: root, commandPrefix: [join(process.cwd(), 'tests/reasoning/fixtures/fake-reasoning-host.mjs')] })
    const result = await executor.execute({ operation: 'extractKnowledge', instruction: 'test', input: { private: 'only here' }, outputContract: { type: 'object' } })
    const parsed = JSON.parse(result.output as string) as { cwd: string; ok: boolean }
    assert.equal(parsed.ok, true)
    assert.notEqual(parsed.cwd, process.cwd())
    assert.match(parsed.cwd, /researchhub-reasoning-/)
    assert.deepEqual(await readdir(root), [])
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('Codex executor preserves bounded failure details and timeout errors', async () => {
  const failure = new CodexReasoningExecutor({ capabilities, executable: process.execPath, commandPrefix: [join(process.cwd(), 'tests/reasoning/fixtures/fake-reasoning-host.mjs'), '--fail'] })
  await assert.rejects(() => failure.execute({ operation: 'reconcileKnowledge', instruction: 'test', input: {}, outputContract: {} }), (error: unknown) => error instanceof ReasoningExecutorError && error.code === 'reasoning_execution_failed' && error.exitCode === 7 && error.stderr === 'fixture failure\n')
  const timeout = new CodexReasoningExecutor({ capabilities, executable: process.execPath, timeoutMs: 20, commandPrefix: [join(process.cwd(), 'tests/reasoning/fixtures/fake-reasoning-host.mjs'), '--sleep'] })
  await assert.rejects(() => timeout.execute({ operation: 'reconcileKnowledge', instruction: 'test', input: {}, outputContract: {} }), (error: unknown) => error instanceof ReasoningExecutorError && error.code === 'reasoning_timeout')
})

test('Codex executor classifies unavailable hosts and oversized output', async () => {
  const unavailable = new CodexReasoningExecutor({ capabilities, executable: join(process.cwd(), 'tests/reasoning/fixtures/does-not-exist.exe') })
  await assert.rejects(() => unavailable.execute({ operation: 'understandAndPlan', instruction: 'test', input: {}, outputContract: {} }), (error: unknown) => error instanceof ReasoningExecutorError && error.code === 'reasoning_host_unavailable')
  const oversized = new CodexReasoningExecutor({ capabilities, executable: process.execPath, maxOutputChars: 10, commandPrefix: [join(process.cwd(), 'tests/reasoning/fixtures/fake-reasoning-host.mjs'), '--big'] })
  await assert.rejects(() => oversized.execute({ operation: 'understandAndPlan', instruction: 'test', input: {}, outputContract: {} }), (error: unknown) => error instanceof ReasoningExecutorError && error.code === 'reasoning_output_too_large')
})
