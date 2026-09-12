import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { buildCodexCliInvocationArgs, CODEX_CLI_LUNA_CONFIG, CodexCliReasoningExecutor, normalizeCodexOutputSchema, parseCodexCliJsonlFinalResponse } from '../../../plugins/reasoning/codex-cli/executor.ts'
import { PiReasoningExecutor } from '../../../plugins/reasoning/pi/executor.ts'

const capabilities = { maxContextTokens: 4_000, maxOutputTokens: 1_000, structuredOutputSupport: true, maxConcurrency: 1 }
const fixture = join(process.cwd(), 'tests/plugins/reasoning/fixtures/fake-reasoning-host.mjs')

test('Codex CLI Luna configuration is immutable and builds the safe documented invocation', () => {
  assert.deepEqual(CODEX_CLI_LUNA_CONFIG, { backend: 'codex-cli', model: 'gpt-5.6-luna', reasoningEffort: 'medium' })
  const args = buildCodexCliInvocationArgs({ commandPrefix: ['exec'], ...CODEX_CLI_LUNA_CONFIG, invocationDirectory: 'temp', outputPath: 'temp/final-output.txt', schemaPath: 'temp/output-schema.json' })
  assert.deepEqual(args.slice(0, 18), ['exec', '--model', 'gpt-5.6-luna', '-c', 'model_reasoning_effort="medium"', '--ephemeral', '--sandbox', 'read-only', '--skip-git-repo-check', '-C', 'temp', '--output-schema', 'temp/output-schema.json', '--json', '-o', 'temp/final-output.txt', '-'])
  assert.equal(args.filter((arg) => arg === '--output-schema').length, 1)
  assert.equal(args.includes(JSON.stringify({ type: 'object' })), false)
  assert.equal(args.includes('--dangerously-bypass-approvals-and-sandbox'), false)
  assert.equal(args.includes('semantic prompt'), false)
})

test('Codex schema normalizer preserves Design structure and strips ResearchHub metadata and provider-unsupported constraints', async () => {
  const { INDUSTRY_RESEARCH_DESIGN_CONTRACT, INDUSTRY_MODULES } = await import('../../../skills/industry-research/contracts.ts')
  const normalized = normalizeCodexOutputSchema(INDUSTRY_RESEARCH_DESIGN_CONTRACT)
  assert.equal(normalized.schema.type, 'object')
  assert.deepEqual((normalized.schema.properties as Record<string, any>).targetKind.enum, ['industry', 'theme', 'product', 'technology', 'uncertain'])
  assert.deepEqual((normalized.schema as any).required, ['definitionHypothesis', 'targetKind', 'scope', 'moduleQuestions', 'keyMetrics', 'evidenceRequirements', 'searchTerms', 'knownGaps', 'verificationCandidates'])
  assert.deepEqual(Object.keys((normalized.schema.properties as any).moduleQuestions.properties), [...INDUSTRY_MODULES])
  assert.deepEqual((normalized.schema.properties as any).scope.required, ['included', 'excluded'])
  assert.deepEqual((normalized.schema.properties as any).verificationCandidates.items.required, ['name', 'kind', 'reason'])
  assert.deepEqual([...normalized.removedKeywords].sort(), ['bounds', 'maxItems', 'maxLength', 'minItems', 'minLength', 'name', 'uniqueItems'])
  assert.equal(JSON.stringify(normalized.schema).includes('proposalRules'), false)
})

test('Codex schema normalizer supports dynamic enum, const and oneOf contracts and fails closed for unsafe inputs', () => {
  const normalized = normalizeCodexOutputSchema({ name: 'dynamic', type: 'object', required: ['kind'], additionalProperties: false, properties: { kind: { enum: ['a', 'b'] }, fixed: { const: 'x' }, value: { oneOf: [{ type: 'string' }, { type: 'number' }] } } })
  assert.deepEqual(normalized.schema.properties, { kind: { enum: ['a', 'b'] }, fixed: { const: 'x' }, value: { oneOf: [{ type: 'string' }, { type: 'number' }] } })
  assert.throws(() => normalizeCodexOutputSchema({ type: 'object', properties: { x: { type: 'string', unknownKeyword: true } } }), (error: unknown) => error instanceof Error && 'code' in error && (error as { code?: unknown }).code === 'reasoning_configuration_invalid')
  assert.throws(() => normalizeCodexOutputSchema({ type: 'object', properties: { x: undefined } }), (error: unknown) => error instanceof Error && 'code' in error && (error as { code?: unknown }).code === 'reasoning_configuration_invalid')
  assert.throws(() => normalizeCodexOutputSchema({}), /one JSON Schema object/)
  assert.throws(() => normalizeCodexOutputSchema({ type: 'string', enum: Array.from({ length: 100000 }, (_, i) => String(i)) }), /size limit/)
  assert.throws(() => normalizeCodexOutputSchema({ type: 'number', const: Number.NaN }), (error: unknown) => error instanceof Error && 'code' in error && (error as { code?: unknown }).code === 'reasoning_configuration_invalid')
  assert.throws(() => normalizeCodexOutputSchema({ type: 'object', properties: { x: new Date(0) } }), (error: unknown) => error instanceof Error && 'code' in error && (error as { code?: unknown }).code === 'reasoning_configuration_invalid')
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
    const metadata = adapter.runtimeMetadata()
    assert.equal(metadata.structuredOutputEnabled, true)
    assert.match(metadata.structuredOutputSchemaFingerprint ?? '', /^[a-f0-9]{16}$/)
    assert.equal(typeof metadata.structuredOutputSchemaBytes, 'number')
  } finally { await rm(root, { recursive: true, force: true }) }
})
