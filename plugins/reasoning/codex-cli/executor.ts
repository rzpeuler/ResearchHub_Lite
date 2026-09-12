import { mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import { execFile as execFileCallback, spawn } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { promisify } from 'node:util'
import { ReasoningExecutorError } from '../errors.ts'
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
}

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
    return { provider: 'codex-cli', requestedModel: this.model, requestedReasoningEffort: this.reasoningEffort, invocationMode: 'exec-stdin-json-output-read-only' }
  }

  async complete(_model: unknown, context: Context, options: PiCompletionOptions): Promise<string> {
    const operation = options.metadata.operation as ReasoningOperation
    const operationId = options.operationId || randomUUID()
    const directory = await mkdtemp(join(this.tempRoot, 'researchhub-codex-cli-'))
    const outputPath = join(directory, 'final-output.txt')
    const prompt = JSON.stringify({ systemPrompt: context.systemPrompt, messages: context.messages })
    try {
      const args = buildCodexCliInvocationArgs({ commandPrefix: this.commandPrefix, model: this.model, reasoningEffort: this.reasoningEffort, invocationDirectory: directory, outputPath })
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
      return output
    } finally { await rm(directory, { recursive: true, force: true }) }
  }

  private runProcess(operation: ReasoningOperation, operationId: string, cwd: string, args: readonly string[], prompt: string, signal: AbortSignal): Promise<string> {
    return new Promise((resolve, reject) => {
      const child = spawn(this.executable, [...args], { cwd, shell: false, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] })
      let stdout = ''; let settled = false; let timedOut = false
      const finish = (fn: () => void) => { if (!settled) { settled = true; clearTimeout(timer); signal.removeEventListener('abort', onAbort); fn() } }
      const terminate = () => { timedOut = true; if (child.pid !== undefined) { if (process.platform === 'win32') void execFile('taskkill', ['/pid', String(child.pid), '/t', '/f'], { windowsHide: true }).catch(() => undefined); else { try { process.kill(child.pid, 'SIGTERM') } catch {} } } }
      const onAbort = () => { terminate(); finish(() => reject(new ReasoningExecutorError('reasoning_execution_failed', 'Codex CLI reasoning execution was cancelled', { operation, operationId }))) }
      const timer = setTimeout(() => { terminate(); finish(() => reject(new ReasoningExecutorError('reasoning_timeout', 'Codex CLI reasoning execution timed out', { operation, operationId }))) }, this.timeoutMs)
      signal.addEventListener('abort', onAbort, { once: true })
      child.stdout.setEncoding('utf8')
      child.stdout.on('data', (data: string) => { stdout += data; if (Buffer.byteLength(stdout, 'utf8') > this.maxOutputChars * 2) { terminate(); finish(() => reject(tooLarge(operation, operationId))) } })
      child.once('error', (error: NodeJS.ErrnoException) => finish(() => reject(new ReasoningExecutorError(error.code === 'ENOENT' ? 'reasoning_host_unavailable' : 'reasoning_execution_failed', 'Codex CLI process could not be started', { operation, operationId, cause: error }))))
      child.once('close', (code) => { if (timedOut || signal.aborted) return; finish(() => code === 0 ? resolve(stdout) : reject(new ReasoningExecutorError('reasoning_execution_failed', 'Codex CLI returned a non-zero exit code', { operation, operationId, exitCode: code ?? undefined }))) })
      child.stdin.end(prompt)
    })
  }
}

export function buildCodexCliInvocationArgs(input: { commandPrefix: readonly string[]; model: string; reasoningEffort: CodexCliReasoningEffort; invocationDirectory: string; outputPath: string }): string[] {
  return [...input.commandPrefix, '--model', input.model, '-c', `model_reasoning_effort="${input.reasoningEffort}"`, '--ephemeral', '--sandbox', 'read-only', '--skip-git-repo-check', '-C', input.invocationDirectory, '--json', '-o', input.outputPath, '-']
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

function tooLarge(operation: ReasoningOperation, operationId: string): ReasoningExecutorError { return new ReasoningExecutorError('reasoning_output_too_large', 'Codex CLI output exceeded the configured limit', { operation, operationId }) }
function invalid(message: string): never { throw new ReasoningExecutorError('reasoning_configuration_invalid', message) }
