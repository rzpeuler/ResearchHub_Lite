import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createHash } from 'node:crypto'
import { buildCodexCliInvocationArgs, classifyCodexFailure, CODEX_CLI_LUNA_CONFIG, CodexCliReasoningExecutor, normalizeCodexOutputSchema, parseCodexCliJsonlFinalResponse } from '../../../plugins/reasoning/codex-cli/executor.ts'
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
  assert.deepEqual(normalized.schema.properties, { kind: { enum: ['a', 'b'] }, fixed: { const: 'x', type: 'string' }, value: { oneOf: [{ type: 'string' }, { type: 'number' }] } })
  assert.throws(() => normalizeCodexOutputSchema({ type: 'object', properties: { x: { type: 'string', unknownKeyword: true } } }), (error: unknown) => error instanceof Error && 'code' in error && (error as { code?: unknown }).code === 'reasoning_configuration_invalid')
  assert.throws(() => normalizeCodexOutputSchema({ type: 'object', properties: { x: undefined } }), (error: unknown) => error instanceof Error && 'code' in error && (error as { code?: unknown }).code === 'reasoning_configuration_invalid')
  assert.throws(() => normalizeCodexOutputSchema({}), /one JSON Schema object/)
  assert.throws(() => normalizeCodexOutputSchema({ type: 'string', enum: Array.from({ length: 100000 }, (_, i) => String(i)) }), /size limit/)
  assert.throws(() => normalizeCodexOutputSchema({ type: 'number', const: Number.NaN }), (error: unknown) => error instanceof Error && 'code' in error && (error as { code?: unknown }).code === 'reasoning_configuration_invalid')
  assert.throws(() => normalizeCodexOutputSchema({ type: 'object', properties: { x: new Date(0) } }), (error: unknown) => error instanceof Error && 'code' in error && (error as { code?: unknown }).code === 'reasoning_configuration_invalid')
})

test('Codex transport applies only the proven schema compatibility set', () => {
  const source = {
    type: 'object', additionalProperties: false,
    properties: {
      text: { const: 'x' }, bool: { const: true }, integer: { const: 2 }, decimal: { const: 2.5 }, nil: { const: null }, enumOnly: { enum: ['a', 'b'] },
      objectConst: { const: { x: 1 } }, arrayConst: { const: [1] }, unrelated: {},
      structuredValue: { type: 'object', properties: { value: {} }, anyOf: [{ required: ['value'] }, { required: ['value'] }] },
      choice: { oneOf: [
        { type: 'object', additionalProperties: false, required: ['kind'], properties: { kind: { const: 'a' }, value: { type: 'string' } } },
        { type: 'object', additionalProperties: false, required: ['kind'], properties: { kind: { const: 'b' }, value: { type: 'number' } } },
      ] },
    },
  }
  const before = JSON.stringify(source)
  const normalized = normalizeCodexOutputSchema(source)
  const properties = normalized.schema.properties as any
  assert.deepEqual(properties.text, { const: 'x', type: 'string' })
  assert.deepEqual(properties.bool, { const: true, type: 'boolean' })
  assert.deepEqual(properties.integer, { const: 2, type: 'integer' })
  assert.deepEqual(properties.decimal, { const: 2.5, type: 'number' })
  assert.deepEqual(properties.nil, { const: null, type: 'null' })
  assert.deepEqual(properties.enumOnly, { enum: ['a', 'b'] })
  assert.deepEqual(properties.objectConst, { const: { x: 1 } })
  assert.deepEqual(properties.arrayConst, { const: [1] })
  assert.deepEqual(properties.unrelated, {})
  assert.deepEqual(properties.choice.anyOf.map((x: any) => x.properties.kind.const), ['a', 'b'])
  assert.equal(properties.choice.oneOf, undefined)
  assert.deepEqual(properties.structuredValue.properties.value, { anyOf: [{ type: 'number' }, { type: 'string' }, { type: 'boolean' }] })
  assert.deepEqual(properties.structuredValue.anyOf, undefined)
  assert.equal(normalized.primitiveConstTypeCount, 7)
  assert.equal(normalized.guardedKindOneOfConversionCount, 1)
  assert.equal(normalized.redundantRequiredOnlyAnyOfRemovalCount, 1)
  assert.equal(normalized.structuredValueScalarNormalizationCount, 1)
  assert.equal(JSON.stringify(source), before)
})

test('Codex guarded oneOf conversion refuses unsafe or alternate discriminators', () => {
  const variant = (kind: string, extra: Record<string, unknown> = {}) => ({ type: 'object', additionalProperties: false, required: ['kind'], properties: { kind: { const: kind }, value: { type: 'string' } }, ...extra })
  for (const schema of [
    { oneOf: [variant('a'), variant('a')] },
    { oneOf: [variant('a'), { ...variant('b'), required: [] }] },
    { oneOf: [variant('a'), { type: 'string' }] },
    { oneOf: [{ ...variant('a'), additionalProperties: true }, variant('b')] },
    { oneOf: [{ type: 'object', additionalProperties: false, required: ['discriminator'], properties: { discriminator: { const: 'a' } } }, { type: 'object', additionalProperties: false, required: ['discriminator'], properties: { discriminator: { const: 'b' } } }] },
  ]) assert.equal((normalizeCodexOutputSchema(schema).schema as any).oneOf !== undefined, true)
})

test('Codex redundant required-only anyOf removal is conservative', () => {
  const make = (branch: any) => normalizeCodexOutputSchema({ type: 'object', properties: { value: { type: 'object', properties: { period: { type: 'string' }, fiscalPeriod: { type: 'string' } }, anyOf: [branch] } } }).schema as any
  assert.equal(make({ required: ['period'] }).properties.value.anyOf, undefined)
  assert.ok(make({ required: ['period'], description: 'semantic' }).properties.value.anyOf)
  assert.ok(make({ required: ['missing'] }).properties.value.anyOf)
  assert.ok((normalizeCodexOutputSchema({ type: 'object', properties: { structuredValue: { type: 'object', properties: { value: { anyOf: [{ type: 'number' }, { type: 'string' }, { type: 'boolean' }] } } } } }).schema as any).properties.structuredValue.properties.value.anyOf)
})

test('Codex transport normalization makes every declared property required without mutating the source', () => {
  const source = { type: 'object', additionalProperties: false, properties: { status: { type: 'string', const: 'ok' }, note: { type: 'string' } }, required: ['status'] }
  const before = JSON.stringify(source)
  const normalized = normalizeCodexOutputSchema(source)
  assert.deepEqual(normalized.schema.required, ['status', 'note'])
  assert.equal(normalized.strengthenedObjectCount, 1)
  assert.deepEqual(normalized.strengthenedObjectPaths, ['$'])
  assert.equal(JSON.stringify(source), before)
  assert.deepEqual(source.required, ['status'])
})

test('Codex transport normalization recursively covers properties, items, maps, oneOf and anyOf', () => {
  const normalized = normalizeCodexOutputSchema({ type: 'object', properties: {
    nested: { type: 'object', properties: { value: { type: 'string' } } },
    list: { type: 'array', items: { type: 'object', properties: { item: { type: 'boolean' } } } },
    map: { type: 'object', additionalProperties: { type: 'object', properties: { mapped: { type: 'number' } } } },
    one: { oneOf: [{ type: 'object', properties: { branch: { type: 'null' } } }] },
    any: { anyOf: [{ type: 'object', properties: { alternative: { type: 'integer' } } }] },
  } })
  const schema = normalized.schema as any
  assert.deepEqual(schema.required, ['nested', 'list', 'map', 'one', 'any'])
  assert.deepEqual(schema.properties.nested.required, ['value'])
  assert.deepEqual(schema.properties.list.items.required, ['item'])
  assert.deepEqual(schema.properties.map.additionalProperties.required, ['mapped'])
  assert.deepEqual(schema.properties.one.oneOf[0].required, ['branch'])
  assert.deepEqual(schema.properties.any.anyOf[0].required, ['alternative'])
})

test('Codex transport normalization handles empty and propertyless schema nodes and rejects inconsistent required references', () => {
  const normalized = normalizeCodexOutputSchema({ type: 'object', properties: { empty: { type: 'object', properties: {} }, noProperties: { type: 'string' } } })
  assert.deepEqual((normalized.schema as any).required, ['empty', 'noProperties'])
  assert.deepEqual((normalized.schema as any).properties.empty.required, [])
  assert.equal(Object.prototype.hasOwnProperty.call((normalized.schema as any).properties.noProperties, 'required'), false)
  assert.throws(() => normalizeCodexOutputSchema({ type: 'object', properties: { present: { type: 'string' } }, required: ['missing'] }), (error: unknown) => error instanceof Error && 'code' in error && (error as { code?: unknown }).code === 'reasoning_configuration_invalid')
})

test('Codex transport normalization preserves supported schema semantics and accepted Design fingerprint', async () => {
  const { INDUSTRY_RESEARCH_DESIGN_CONTRACT, INDUSTRY_MODULE_RESULT_CONTRACT, INDUSTRY_SYNTHESIS_CONTRACT } = await import('../../../skills/industry-research/contracts.ts')
  const source = JSON.stringify(INDUSTRY_RESEARCH_DESIGN_CONTRACT)
  const normalized = normalizeCodexOutputSchema(INDUSTRY_RESEARCH_DESIGN_CONTRACT)
  assert.equal(createHash('sha256').update(source).digest('hex').slice(0, 16), '9854f93073c44d96')
  assert.equal(JSON.stringify(INDUSTRY_RESEARCH_DESIGN_CONTRACT), source)
  assert.equal(normalized.fingerprint, '88711c17a6837ae7')
  assert.equal(normalized.bytes, 2125)
  assert.deepEqual((normalized.schema as any).properties.knownGaps.items.required, ['gapId', 'module', 'question', 'reason', 'actionable', 'searchTerms'])
  for (const contract of [INDUSTRY_MODULE_RESULT_CONTRACT, INDUSTRY_SYNTHESIS_CONTRACT]) {
    const result = normalizeCodexOutputSchema(contract)
    const visit = (node: any): void => {
      if (node && typeof node === 'object' && !Array.isArray(node)) {
        if (node.properties) assert.deepEqual(node.required, Object.keys(node.properties))
        for (const value of Object.values(node)) visit(value)
      } else if (Array.isArray(node)) for (const value of node) visit(value)
    }
    visit(result.schema)
  }
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

test('Codex failure classifier safely distinguishes synthetic stdout and stderr categories', () => {
  const cases = [
    [{ type: 'error', error: { code: 'invalid_schema' } }, '', 'structured_output_configuration'],
    [{ type: 'turn.failed', error: { code: 'authentication_required' } }, '', 'authentication_or_account'],
    [{ type: 'error', error: { code: 'model_unavailable' } }, '', 'model_unavailable'],
    [null, 'quota exceeded for fixture', 'rate_limit_or_quota'],
    [null, 'request refused by safety policy fixture', 'safety_or_policy'],
    [null, 'fixture service unavailable', 'transport_or_service'],
    [null, 'synthetic failure', 'unknown_nonzero_exit'],
  ] as const
  for (const [event, stderr, expected] of cases) assert.equal(classifyCodexFailure(event ? JSON.stringify(event) : '', stderr).failureClass, expected)
  assert.equal(classifyCodexFailure('{malformed', 'fixture service unavailable').failureClass, 'transport_or_service')
  assert.equal(classifyCodexFailure('{malformed', '').failureClass, 'unknown_nonzero_exit')
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

test('Codex CLI records a spawned non-zero process without exposing provider channels', async () => {
  const adapter = new CodexCliReasoningExecutor({ capabilities, executable: process.execPath, commandPrefix: [fixture, '--fail'] })
  await assert.rejects(() => adapter.complete(undefined, { systemPrompt: 'fixture', messages: [] }, { signal: new AbortController().signal, maxTokens: 100, metadata: { operation: 'understandAndPlan' }, operationId: 'fixture-operation', outputContract: { type: 'object' } }), (error: unknown) => {
    assert.ok(error instanceof Error)
    assert.equal((error as any).code, 'reasoning_execution_failed')
    assert.equal((error as any).processStarted, true)
    assert.equal((error as any).exitState, 'nonzero_exit')
    assert.equal((error as any).failureClass, 'unknown_nonzero_exit')
    assert.equal((error as any).stderr, undefined)
    assert.equal((error as any).stdout, undefined)
    return true
  })
  assert.equal(adapter.executionDiagnostics().processStarted, true)
  assert.equal(adapter.executionDiagnostics().semanticResultAvailable, false)
})
