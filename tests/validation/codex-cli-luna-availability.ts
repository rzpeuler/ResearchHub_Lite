import { createHash } from 'node:crypto'
import { execFile as execFileCallback } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { promisify } from 'node:util'
import { createCodexCliLunaReasoningExecutor } from '../../app/pi/model-selection.ts'
import { ReasoningExecutorError } from '../../plugins/reasoning/errors.ts'

const execFile = promisify(execFileCallback)
const taskId = 'RHL-M3B-3B-FIX-003-CODEX-CLI-LUNA-PI-COMPATIBLE-REASONING'
const baseCommit = 'cf8b7445e9eee5721b88199bdd306c9c44cc2557'
const evidencePath = resolve('tests/validation/evidence/RHL_M3B_CODEX_CLI_LUNA_AVAILABILITY.json')
const capabilities = { maxContextTokens: 128_000, maxOutputTokens: 16_384, structuredOutputSupport: true, maxConcurrency: 1 }
const hash = (value: string) => createHash('sha256').update(value).digest('hex')

let version = 'unavailable'
let invocationMode = 'exec-stdin-json-output-read-only'
let safeModeConfirmed = false
let classification: 'AVAILABLE' | 'BLOCKED_EXTERNAL_SETUP' | 'UNSUPPORTED_PI_COMPATIBILITY' = 'UNSUPPORTED_PI_COMPATIBILITY'
let failureCode: string | null = null
let requestHash: string | null = null
let resultHash: string | null = null
let requestSize = 0
let resultSize = 0
let durationMs = 0
try {
  const versionResult = await execFile('codex', ['--version'], { windowsHide: true, maxBuffer: 8_000 })
  version = versionResult.stdout.trim().split(/\r?\n/)[0] ?? 'unknown'
  const help = (await execFile('codex', ['exec', '--help'], { windowsHide: true, maxBuffer: 32_000 })).stdout
  safeModeConfirmed = ['--model', '--sandbox', 'read-only', '--ephemeral', '--json', '--output-last-message'].every((value) => help.includes(value))
  if (!safeModeConfirmed) throw new Error('installed Codex CLI does not expose the required safe invocation mode')
  const executor = await createCodexCliLunaReasoningExecutor({ capabilities, timeoutMs: 120_000 })
  const request = { operation: 'understandAndPlan' as const, instruction: 'Return exactly the JSON object {"status":"ok"}. Do not use tools.', input: { publicValue: 'ok' }, outputContract: { type: 'object', required: ['status'], properties: { status: { const: 'ok' } } } }
  const serializedRequest = JSON.stringify(request)
  requestHash = hash(serializedRequest); requestSize = Buffer.byteLength(serializedRequest)
  const started = Date.now()
  const result = await executor.execute(request)
  durationMs = Date.now() - started
  const serializedResult = JSON.stringify(result.output)
  resultHash = hash(serializedResult); resultSize = Buffer.byteLength(serializedResult)
  if (result.output && typeof result.output === 'object' && (result.output as { status?: unknown }).status === 'ok') classification = 'AVAILABLE'
  else failureCode = 'reasoning_output_invalid'
} catch (error) {
  failureCode = error instanceof ReasoningExecutorError ? error.code : 'capability_or_execution_failure'
  classification = failureCode === 'reasoning_host_unavailable' ? 'BLOCKED_EXTERNAL_SETUP' : safeModeConfirmed ? 'BLOCKED_EXTERNAL_SETUP' : 'UNSUPPORTED_PI_COMPATIBILITY'
  console.error(JSON.stringify({ classification, failureCode }))
}

const evidence = { taskId, baseCommit, generatedAt: new Date().toISOString(), codex: { discovered: version !== 'unavailable', version, backend: 'codex-cli', model: 'gpt-5.6-luna', reasoningEffort: 'medium', supportedInvocationMode: invocationMode, safeNonMutatingNonInteractiveConfirmed: safeModeConfirmed }, request: { sha256: requestHash, sizeBytes: requestSize }, result: { sha256: resultHash, sizeBytes: resultSize }, executionDurationMs: durationMs, classification, failureCode, secretsIncluded: false, privatePathsIncluded: false }
await mkdir(resolve('tests/validation/evidence'), { recursive: true })
await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8')
console.log(JSON.stringify(evidence, null, 2))
if (classification !== 'AVAILABLE') process.exitCode = 1
