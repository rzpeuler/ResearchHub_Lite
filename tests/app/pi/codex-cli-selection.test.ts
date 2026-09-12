import test from 'node:test'
import assert from 'node:assert/strict'
import { createCodexCliLunaReasoningExecutor, PRIMARY_PRODUCTION_REASONING_MODEL } from '../../../app/pi/model-selection.ts'

const capabilities = { maxContextTokens: 4_000, maxOutputTokens: 1_000, structuredOutputSupport: true, maxConcurrency: 1 }

test('explicit Codex CLI Luna factory is separate from unchanged production selection', async () => {
  assert.deepEqual(PRIMARY_PRODUCTION_REASONING_MODEL, { providerId: 'zhipu-openapi', modelId: 'glm-5.3-flash' })
  const executor = await createCodexCliLunaReasoningExecutor({ capabilities, executable: process.execPath })
  assert.deepEqual(executor.runtimeMetadata(), { provider: 'pi-coding-agent', backend: 'codex-cli', requestedModel: 'gpt-5.6-luna', requestedReasoningEffort: 'medium', invocationMode: 'exec-stdin-json-output-read-only' })
})
