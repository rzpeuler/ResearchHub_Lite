import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { execFile as execFileCallback, spawn } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import { promisify } from 'node:util'
import { ReasoningExecutorError, type ReasoningExitState, type ReasoningFailureClass } from '../errors.ts'
import { validateReasoningCapabilities } from '../capabilities.ts'
import type { Context } from '@earendil-works/pi-ai'
import type { PiCompletionOptions } from '../pi/executor.ts'
import type { ReasoningCapabilities, ReasoningOperation } from '../contracts.ts'

const execFile = promisify(execFileCallback)
const DEFAULT_TIMEOUT_MS = 60_000
const DEFAULT_OUTPUT_LIMIT = 256_000
const DEFAULT_MODEL = 'gpt-5.6-luna'
const DEFAULT_REASONING_EFFORT = 'medium' as const
const CODEX_COMMAND = ['exec'] as const
const CODEX_REASONING_EFFORTS = ['none', 'low', 'medium', 'high', 'xhigh', 'max'] as const
export const CODEX_SCHEMA_MAX_BYTES = 64_000
const RESEARCHHUB_METADATA_KEYS = new Set(['name', 'bounds', 'allowlists', 'proposalRules'])
const CODEX_UNSUPPORTED_GENERATION_KEYS = new Set(['minLength', 'maxLength', 'pattern', 'minItems', 'maxItems', 'uniqueItems', 'minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum', 'multipleOf'])
const CODEX_SCHEMA_KEYS = new Set(['type', 'properties', 'required', 'additionalProperties', 'items', 'enum', 'const', 'oneOf', 'anyOf', 'description'])
const JSON_SCHEMA_TYPES = new Set(['object', 'array', 'string', 'number', 'integer', 'boolean', 'null'])

export type CodexCliReasoningEffort = (typeof CODEX_REASONING_EFFORTS)[number]

export const CODEX_CLI_LUNA_CONFIG = Object.freeze({
  backend: 'codex-cli' as const,
  model: DEFAULT_MODEL,
  reasoningEffort: DEFAULT_REASONING_EFFORT,
})

export interface CodexCliRuntimeMetadata {
  readonly provider: 'codex-cli'
  readonly requestedModel: string
  readonly requestedReasoningEffort: CodexCliReasoningEffort
  readonly invocationMode: 'exec-stdin-json-output-read-only'
  readonly structuredOutputEnabled: true
  readonly structuredOutputSchemaFingerprint?: string
  readonly structuredOutputSchemaBytes?: number
}

export interface CodexCliExecutionDiagnostics {
  readonly executableDiscovered: boolean
  readonly processStarted: boolean
  readonly exitState: ReasoningExitState
  readonly semanticResultAvailable: boolean
  readonly failureClass?: ReasoningFailureClass
  readonly structuredEventType?: string
  readonly safeErrorCode?: string
}

const FAILURE_PRIORITY: readonly ReasoningFailureClass[] = ['structured_output_configuration', 'authentication_or_account', 'model_unavailable', 'rate_limit_or_quota', 'safety_or_policy', 'transport_or_service', 'unknown_nonzero_exit']
const SAFE_CODE = /^[A-Za-z0-9_.:-]{1,64}$/

export interface CodexCliReasoningExecutorOptions {
  readonly capabilities: ReasoningCapabilities
  readonly executable?: string
  readonly timeoutMs?: number
  readonly maxOutputChars?: number
  readonly tempRoot?: string
  readonly model?: string
  readonly reasoningEffort?: CodexCliReasoningEffort
  /** Test-only command prefix; production is the documented `exec` subcommand. */
  readonly commandPrefix?: readonly string[]
}

export class CodexCliReasoningExecutor {
  private readonly capabilitiesValue: ReasoningCapabilities
  private readonly executable: string
  private readonly timeoutMs: number
  private readonly maxOutputChars: number
  private readonly tempRoot: string
  private readonly model: string
  private readonly reasoningEffort: CodexCliReasoningEffort
  private readonly commandPrefix: readonly string[]
  private schemaMetadata?: Pick<CodexCliRuntimeMetadata, 'structuredOutputSchemaFingerprint' | 'structuredOutputSchemaBytes'>
  private lastDiagnosticsValue: CodexCliExecutionDiagnostics = { executableDiscovered: true, processStarted: false, exitState: 'not_started', semanticResultAvailable: false }

  constructor(options: CodexCliReasoningExecutorOptions) {
    this.capabilitiesValue = validateReasoningCapabilities(options.capabilities)
    this.executable = options.executable ?? process.env.CODEX_EXECUTABLE ?? 'codex'
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
    this.maxOutputChars = options.maxOutputChars ?? DEFAULT_OUTPUT_LIMIT
    this.tempRoot = options.tempRoot ?? tmpdir()
    this.model = (options.model ?? DEFAULT_MODEL).trim()
    this.reasoningEffort = options.reasoningEffort ?? DEFAULT_REASONING_EFFORT
    this.commandPrefix = options.commandPrefix ?? CODEX_COMMAND
    if (!this.executable.trim() || !this.model) invalid('executable and model must be non-empty')
    if (!(CODEX_REASONING_EFFORTS as readonly string[]).includes(this.reasoningEffort)) invalid('reasoningEffort is unsupported')
    if (!Number.isSafeInteger(this.timeoutMs) || this.timeoutMs <= 0) invalid('timeoutMs must be a positive safe integer')
    if (!Number.isSafeInteger(this.maxOutputChars) || this.maxOutputChars <= 0) invalid('maxOutputChars must be a positive safe integer')
    if (this.commandPrefix.length === 0) invalid('commandPrefix must not be empty')
  }

  capabilities(): ReasoningCapabilities { return this.capabilitiesValue }

  runtimeMetadata(): CodexCliRuntimeMetadata {
    return { provider: 'codex-cli', requestedModel: this.model, requestedReasoningEffort: this.reasoningEffort, invocationMode: 'exec-stdin-json-output-read-only', structuredOutputEnabled: true, ...this.schemaMetadata }
  }

  executionDiagnostics(): CodexCliExecutionDiagnostics { return this.lastDiagnosticsValue }

  async complete(_model: unknown, context: Context, options: PiCompletionOptions): Promise<string> {
    const operation = options.metadata.operation as ReasoningOperation
    const operationId = options.operationId || randomUUID()
    const directory = await mkdtemp(join(this.tempRoot, 'researchhub-codex-cli-'))
    const outputPath = join(directory, 'final-output.txt')
    const schemaPath = join(directory, 'output-schema.json')
    const prompt = JSON.stringify({ systemPrompt: context.systemPrompt, messages: context.messages })
    try {
      const normalized = normalizeCodexOutputSchema(options.outputContract)
      this.schemaMetadata = { structuredOutputSchemaFingerprint: normalized.fingerprint, structuredOutputSchemaBytes: normalized.bytes }
      await writeFile(schemaPath, normalized.serialized, { encoding: 'utf8', flag: 'wx' })
      const args = buildCodexCliInvocationArgs({ commandPrefix: this.commandPrefix, model: this.model, reasoningEffort: this.reasoningEffort, invocationDirectory: directory, outputPath, schemaPath })
      const stdout = await this.runProcess(operation, operationId, directory, args, prompt, options.signal)
      let output = ''
      try { if ((await stat(outputPath)).size > this.maxOutputChars) throw tooLarge(operation, operationId); output = await readFile(outputPath, 'utf8') } catch (error) {
        if (error instanceof ReasoningExecutorError) throw error
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
        try { output = parseCodexCliJsonlFinalResponse(stdout, this.maxOutputChars) } catch (error) {
          throw new ReasoningExecutorError('reasoning_output_invalid', error instanceof Error ? error.message : 'Codex CLI emitted invalid structured output', { operation, operationId })
        }
      }
      if (Buffer.byteLength(output, 'utf8') > this.maxOutputChars) throw tooLarge(operation, operationId)
      if (!output.trim()) throw new ReasoningExecutorError('reasoning_output_invalid', 'Codex CLI returned an empty final response', { operation, operationId })
      this.lastDiagnosticsValue = { ...this.lastDiagnosticsValue, exitState: 'normal_exit', semanticResultAvailable: true }
      return output
    } finally { await rm(directory, { recursive: true, force: true }) }
  }

  private runProcess(operation: ReasoningOperation, operationId: string, cwd: string, args: readonly string[], prompt: string, signal: AbortSignal): Promise<string> {
    return new Promise((resolve, reject) => {
      const child = spawn(this.executable, [...args], { cwd, shell: false, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] })
      let stdout = ''; let stderr = ''; let settled = false; let timedOut = false
      let processStarted = false
      this.lastDiagnosticsValue = { executableDiscovered: true, processStarted: false, exitState: 'not_started', semanticResultAvailable: false }
      const finish = (fn: () => void) => { if (!settled) { settled = true; clearTimeout(timer); signal.removeEventListener('abort', onAbort); fn() } }
      const terminate = () => { timedOut = true; if (child.pid !== undefined) { if (process.platform === 'win32') void execFile('taskkill', ['/pid', String(child.pid), '/t', '/f'], { windowsHide: true }).catch(() => undefined); else { try { process.kill(child.pid, 'SIGTERM') } catch {} } } }
      const onAbort = () => { terminate(); this.lastDiagnosticsValue = { ...this.lastDiagnosticsValue, processStarted, exitState: 'cancelled' }; finish(() => reject(new ReasoningExecutorError('reasoning_execution_failed', 'Codex CLI reasoning execution was cancelled', { operation, operationId, processStarted, exitState: 'cancelled', failureClass: 'timeout_or_cancel' }))) }
      const timer = setTimeout(() => { terminate(); this.lastDiagnosticsValue = { ...this.lastDiagnosticsValue, processStarted, exitState: 'timeout' }; finish(() => reject(new ReasoningExecutorError('reasoning_timeout', 'Codex CLI reasoning execution timed out', { operation, operationId, processStarted, exitState: 'timeout', failureClass: 'timeout_or_cancel' }))) }, this.timeoutMs)
      signal.addEventListener('abort', onAbort, { once: true })
      child.once('spawn', () => { processStarted = true; this.lastDiagnosticsValue = { ...this.lastDiagnosticsValue, processStarted: true, exitState: 'started' } })
      child.stdout.setEncoding('utf8')
      child.stdout.on('data', (data: string) => { stdout += data; if (Buffer.byteLength(stdout, 'utf8') > this.maxOutputChars * 2) { terminate(); finish(() => reject(tooLarge(operation, operationId))) } })
      child.stderr.setEncoding('utf8')
      child.stderr.on('data', (data: string) => { stderr += data; if (Buffer.byteLength(stderr, 'utf8') > 8_000) stderr = stderr.slice(-8_000) })
      child.once('error', (error: NodeJS.ErrnoException) => finish(() => reject(new ReasoningExecutorError(error.code === 'ENOENT' ? 'reasoning_host_unavailable' : 'reasoning_execution_failed', 'Codex CLI process could not be started', { operation, operationId, processStarted, exitState: 'not_started', failureClass: 'transport_or_service' }))))
      child.once('close', (code) => { if (timedOut || signal.aborted) return; finish(() => { if (code === 0) return resolve(stdout); const signalInfo = classifyCodexFailure(stdout, stderr); this.lastDiagnosticsValue = { executableDiscovered: true, processStarted, exitState: 'nonzero_exit', semanticResultAvailable: false, ...signalInfo }; const codeKind = signalInfo.failureClass === 'structured_output_configuration' ? 'reasoning_structured_output_configuration_failed' : signalInfo.failureClass === 'authentication_or_account' ? 'reasoning_host_unavailable' : 'reasoning_execution_failed'; return reject(new ReasoningExecutorError(codeKind, signalInfo.failureClass === 'structured_output_configuration' ? 'Codex CLI rejected the structured output schema' : signalInfo.failureClass === 'authentication_or_account' ? 'Codex CLI external setup is required' : 'Codex CLI returned a non-zero exit code', { operation, operationId, exitCode: code ?? undefined, processStarted, exitState: 'nonzero_exit', ...signalInfo })) }) })
      child.stdin.end(prompt)
    })
  }
}

export function buildCodexCliInvocationArgs(input: { commandPrefix: readonly string[]; model: string; reasoningEffort: CodexCliReasoningEffort; invocationDirectory: string; outputPath: string; schemaPath: string }): string[] {
  return [...input.commandPrefix, '--model', input.model, '-c', `model_reasoning_effort="${input.reasoningEffort}"`, '--ephemeral', '--sandbox', 'read-only', '--skip-git-repo-check', '-C', input.invocationDirectory, '--output-schema', input.schemaPath, '--json', '-o', input.outputPath, '-']
}

export interface CodexOutputSchema {
  readonly schema: Record<string, unknown>
  readonly serialized: string
  readonly fingerprint: string
  readonly bytes: number
  readonly removedKeywords: readonly string[]
  readonly strengthenedObjectCount: number
  readonly strengthenedObjectPaths: readonly string[]
  readonly primitiveConstTypeCount: number
  readonly guardedKindOneOfConversionCount: number
  readonly redundantRequiredOnlyAnyOfRemovalCount: number
  readonly structuredValueScalarNormalizationCount: number
}

export function normalizeCodexOutputSchema(outputContract: unknown): CodexOutputSchema {
  const removed = new Set<string>()
  let strengthenedObjectCount = 0
  const strengthenedObjectPaths: string[] = []
  let primitiveConstTypeCount = 0
  let guardedKindOneOfConversionCount = 0
  let redundantRequiredOnlyAnyOfRemovalCount = 0
  let structuredValueScalarNormalizationCount = 0
  const isPrimitiveConst = (value: unknown): boolean => value === null || typeof value === 'string' || typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value))
  const inferredType = (value: unknown): string | undefined => value === null ? 'null' : typeof value === 'string' ? 'string' : typeof value === 'boolean' ? 'boolean' : typeof value === 'number' && Number.isFinite(value) ? Number.isInteger(value) ? 'integer' : 'number' : undefined
  const isGuardedKindVariant = (value: unknown): value is Record<string, unknown> => {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
    const variant = value as Record<string, unknown>
    const properties = variant.properties
    const kind = properties && typeof properties === 'object' && !Array.isArray(properties) ? (properties as Record<string, unknown>).kind : undefined
    return variant.type === 'object' && variant.additionalProperties === false && Array.isArray(variant.required) && variant.required.includes('kind') && kind !== null && typeof kind === 'object' && !Array.isArray(kind) && Object.prototype.hasOwnProperty.call(kind, 'const') && isPrimitiveConst((kind as Record<string, unknown>).const)
  }
  const isRedundantRequiredOnlyAnyOf = (value: unknown, propertyKeys: readonly string[], finalRequired: readonly string[]): boolean => {
    if (!Array.isArray(value) || value.length === 0) return false
    const allowed = new Set(propertyKeys)
    const required = new Set(finalRequired)
    return value.every((branch) => {
      if (branch === null || typeof branch !== 'object' || Array.isArray(branch)) return false
      const keys = Object.keys(branch as Record<string, unknown>)
      if (keys.length !== 1 || keys[0] !== 'required') return false
      const branchRequired = (branch as Record<string, unknown>).required
      return Array.isArray(branchRequired) && branchRequired.every((item) => typeof item === 'string' && allowed.has(item) && required.has(item))
    })
  }
  const convert = (value: unknown, path: string): unknown => {
    if (Array.isArray(value)) return value.map((item, index) => convert(item, `${path}[${index}]`))
    if (value === null || typeof value !== 'object') {
      if (typeof value === 'function' || typeof value === 'symbol' || typeof value === 'bigint' || value === undefined) throw new Error(`outputContract contains a non-JSON value at ${path}`)
      if (typeof value === 'number' && !Number.isFinite(value)) throw new Error(`outputContract contains a non-JSON number at ${path}`)
      return value
    }
    const prototype = Object.getPrototypeOf(value)
    if (prototype !== Object.prototype && prototype !== null) throw new Error(`outputContract contains a non-plain object at ${path}`)
    const sourceOneOf = (value as Record<string, unknown>).oneOf
    const sourceCanConvertOneOf = Array.isArray(sourceOneOf) && sourceOneOf.length > 0 && sourceOneOf.every(isGuardedKindVariant) && new Set(sourceOneOf.map((variant) => ((variant as Record<string, unknown>).properties as Record<string, unknown>).kind as Record<string, unknown>).map((kind) => kind.const)).size === sourceOneOf.length
    const result: Record<string, unknown> = {}
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      if (RESEARCHHUB_METADATA_KEYS.has(key)) { removed.add(key); continue }
      if (CODEX_UNSUPPORTED_GENERATION_KEYS.has(key)) { removed.add(key); continue }
      if (!CODEX_SCHEMA_KEYS.has(key)) throw new Error(`outputContract contains unsupported schema keyword ${key}`)
      if (key === 'properties') {
        if (child === null || typeof child !== 'object' || Array.isArray(child)) throw new Error(`outputContract properties must be an object at ${path}`)
        result[key] = Object.fromEntries(Object.entries(child as Record<string, unknown>).map(([property, schema]) => [property, convert(schema, `${path}.properties.${property}`)]))
      } else if (key === 'const') {
        result[key] = cloneJsonValue(child, `${path}.const`)
      } else result[key] = convert(child, `${path}.${key}`)
    }
    if (result.type === undefined && Object.prototype.hasOwnProperty.call(result, 'const')) {
      const type = inferredType(result.const)
      if (type !== undefined) { result.type = type; primitiveConstTypeCount += 1 }
    }
    if (sourceCanConvertOneOf) {
      result.anyOf = result.oneOf
      delete result.oneOf
      guardedKindOneOfConversionCount += 1
    }
    if (result.properties !== undefined) {
      const propertyKeys = Object.keys(result.properties as Record<string, unknown>)
      if (result.required !== undefined) {
        if (!Array.isArray(result.required) || result.required.some((item) => typeof item !== 'string' || !Object.prototype.hasOwnProperty.call(result.properties, item))) {
          throw new Error(`outputContract required references a property that does not exist at ${path}`)
        }
      }
      if (JSON.stringify(result.required) !== JSON.stringify(propertyKeys)) {
        strengthenedObjectCount += 1
        if (strengthenedObjectPaths.length < 256) strengthenedObjectPaths.push(path)
      }
      result.required = propertyKeys
      if (isRedundantRequiredOnlyAnyOf(result.anyOf, propertyKeys, propertyKeys)) {
        delete result.anyOf
        redundantRequiredOnlyAnyOfRemovalCount += 1
      }
    }
    if (path.endsWith('.properties.structuredValue.properties.value') && Object.keys(result).length === 0) {
      result.anyOf = [{ type: 'number' }, { type: 'string' }, { type: 'boolean' }]
      structuredValueScalarNormalizationCount += 1
    }
    return result
  }
  let schema: unknown
  try { schema = convert(outputContract, '$') } catch (error) { throw new ReasoningExecutorError('reasoning_configuration_invalid', 'ResearchHub output contract cannot be converted to Codex structured output schema', { cause: error }) }
  if (schema === null || typeof schema !== 'object' || Array.isArray(schema) || Object.keys(schema as object).length === 0) invalid('ResearchHub output contract must convert to one JSON Schema object')
  const root = schema as Record<string, unknown>
  if (typeof root.type !== 'string' && root.oneOf === undefined && root.anyOf === undefined && root.enum === undefined && root.const === undefined) invalid('Codex structured output schema must be rooted in one JSON value')
  validateSchemaShape(root, '$')
  let serialized: string
  try { serialized = JSON.stringify(root) } catch (error) { throw new ReasoningExecutorError('reasoning_configuration_invalid', 'Codex structured output schema is not JSON-serializable', { cause: error }) }
  if (Buffer.byteLength(serialized, 'utf8') > CODEX_SCHEMA_MAX_BYTES) invalid('Codex structured output schema exceeds the configured size limit')
  return { schema: root, serialized, fingerprint: createHash('sha256').update(serialized).digest('hex').slice(0, 16), bytes: Buffer.byteLength(serialized, 'utf8'), removedKeywords: [...removed].sort(), strengthenedObjectCount, strengthenedObjectPaths, primitiveConstTypeCount, guardedKindOneOfConversionCount, redundantRequiredOnlyAnyOfRemovalCount, structuredValueScalarNormalizationCount }
}

function cloneJsonValue(value: unknown, path: string): unknown {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value
  if (typeof value === 'number') { if (!Number.isFinite(value)) throw new Error(`outputContract contains a non-JSON number at ${path}`); return value }
  if (Array.isArray(value)) return value.map((item, index) => cloneJsonValue(item, `${path}[${index}]`))
  if (typeof value === 'object') {
    const prototype = Object.getPrototypeOf(value)
    if (prototype !== Object.prototype && prototype !== null) throw new Error(`outputContract contains a non-plain object at ${path}`)
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, child]) => [key, cloneJsonValue(child, `${path}.${key}`)]))
  }
  throw new Error(`outputContract contains a non-JSON value at ${path}`)
}

function validateSchemaShape(schema: Record<string, unknown>, path: string): void {
  if (schema.type !== undefined && (typeof schema.type !== 'string' || !JSON_SCHEMA_TYPES.has(schema.type))) invalid(`Codex structured output schema has an invalid type at ${path}`)
  if (schema.properties !== undefined && (schema.properties === null || typeof schema.properties !== 'object' || Array.isArray(schema.properties))) invalid(`Codex structured output schema properties are invalid at ${path}`)
  if (schema.properties !== undefined) for (const [key, child] of Object.entries(schema.properties as Record<string, unknown>)) {
    if (child === null || typeof child !== 'object' || Array.isArray(child)) invalid(`Codex structured output property ${key} is not a schema at ${path}`)
    validateSchemaShape(child as Record<string, unknown>, `${path}.properties.${key}`)
  }
  if (schema.required !== undefined && (!Array.isArray(schema.required) || schema.required.some((item) => typeof item !== 'string'))) invalid(`Codex structured output required is invalid at ${path}`)
  if (schema.additionalProperties !== undefined && typeof schema.additionalProperties !== 'boolean' && (schema.additionalProperties === null || typeof schema.additionalProperties !== 'object' || Array.isArray(schema.additionalProperties))) invalid(`Codex structured output additionalProperties is invalid at ${path}`)
  if (schema.additionalProperties && typeof schema.additionalProperties === 'object' && !Array.isArray(schema.additionalProperties)) validateSchemaShape(schema.additionalProperties as Record<string, unknown>, `${path}.additionalProperties`)
  if (schema.items !== undefined && (schema.items === null || typeof schema.items !== 'object' || Array.isArray(schema.items))) invalid(`Codex structured output items is invalid at ${path}`)
  if (schema.items && typeof schema.items === 'object' && !Array.isArray(schema.items)) validateSchemaShape(schema.items as Record<string, unknown>, `${path}.items`)
  for (const key of ['oneOf', 'anyOf']) if (schema[key] !== undefined) {
    if (!Array.isArray(schema[key]) || schema[key].length === 0 || schema[key].some((item) => item === null || typeof item !== 'object' || Array.isArray(item))) invalid(`Codex structured output ${key} is invalid at ${path}`)
    for (const [index, child] of (schema[key] as unknown[]).entries()) validateSchemaShape(child as Record<string, unknown>, `${path}.${key}[${index}]`)
  }
  if (schema.enum !== undefined && (!Array.isArray(schema.enum) || schema.enum.length === 0)) invalid(`Codex structured output enum is invalid at ${path}`)
}

export function parseCodexCliJsonlFinalResponse(stdout: string, maxOutputChars = DEFAULT_OUTPUT_LIMIT): string {
  let finalText: string | undefined
  for (const line of stdout.split(/\r?\n/).filter((value) => value.trim())) {
    let event: unknown
    try { event = JSON.parse(line) } catch { throw new Error('Codex CLI emitted malformed JSONL output') }
    const item = (event as { type?: string; item?: { type?: string; text?: string; content?: Array<{ type?: string; text?: string }> } })
    if (item.type === 'item.completed' && item.item?.type === 'agent_message') finalText = item.item.text ?? item.item.content?.filter((part) => part.type === 'text').map((part) => part.text ?? '').join('')
  }
  if (!finalText?.trim()) throw new Error('Codex CLI JSONL output did not contain a final assistant response')
  if (Buffer.byteLength(finalText, 'utf8') > maxOutputChars) throw new Error('Codex CLI final response exceeded the configured limit')
  return finalText
}

export interface CodexFailureSignal { readonly failureClass: ReasoningFailureClass; readonly structuredEventType?: string; readonly safeErrorCode?: string }

export function classifyCodexFailure(stdout: string, stderr: string): CodexFailureSignal {
  const signals: CodexFailureSignal[] = []
  for (const line of stdout.split(/\r?\n/).filter((value) => value.trim()).slice(-256)) {
    try {
      const value = JSON.parse(line) as Record<string, unknown>
      const type = typeof value.type === 'string' ? value.type.slice(0, 64) : undefined
      const error = value.error && typeof value.error === 'object' ? value.error as Record<string, unknown> : value
      const code = typeof error.code === 'string' && SAFE_CODE.test(error.code) ? error.code : undefined
      const hint = `${type ?? ''} ${code ?? ''}`.toLowerCase()
      const failureClass = classifySignalText(hint)
      if (failureClass) signals.push({ failureClass, structuredEventType: type, safeErrorCode: code })
    } catch { /* malformed JSONL is deliberately ignored; stderr remains authoritative */ }
  }
  const stderrClass = classifySignalText(stderr)
  if (stderrClass) signals.push({ failureClass: stderrClass })
  for (const failureClass of FAILURE_PRIORITY) { const match = signals.find((signal) => signal.failureClass === failureClass); if (match) return match }
  return { failureClass: 'unknown_nonzero_exit' }
}

function tooLarge(operation: ReasoningOperation, operationId: string): ReasoningExecutorError { return new ReasoningExecutorError('reasoning_output_too_large', 'Codex CLI output exceeded the configured limit', { operation, operationId }) }
function invalid(message: string): never { throw new ReasoningExecutorError('reasoning_configuration_invalid', message) }
function classifySignalText(value: string): ReasoningFailureClass | undefined {
  if (/structured[_ -]?output|output[- ]schema|json schema|(?:invalid|unsupported|reject|config).*schema|schema.*(?:invalid|unsupported|reject|config)/iu.test(value)) return 'structured_output_configuration'
  if (/auth|login|sign.?in|account|credential|otp/iu.test(value)) return 'authentication_or_account'
  if (/model.*(?:unavailable|not found|unknown)|model_unavailable/iu.test(value)) return 'model_unavailable'
  if (/rate.?limit|quota|too many requests/iu.test(value)) return 'rate_limit_or_quota'
  if (/safety|policy|refused|blocked/iu.test(value)) return 'safety_or_policy'
  if (/transport|service|network|connection|unreachable|server/iu.test(value)) return 'transport_or_service'
  return undefined
}
