import { mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import { execFile as execFileCallback, spawn } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { promisify } from 'node:util'
import { ReasoningExecutorError } from '../errors.ts'
import { validateReasoningCapabilities } from '../capabilities.ts'
import type { ReasoningExecutor, ReasoningOperation, ReasoningRequest, ReasoningResult, ReasoningCapabilities } from '../contracts.ts'

const STDERR_LIMIT = 4_000
const DEFAULT_TIMEOUT_MS = 60_000
const DEFAULT_OUTPUT_LIMIT = 256_000
const PROCESS_TERMINATION_TIMEOUT_MS = 5_000
const DEFAULT_MODEL = 'gpt-5.6-luna'
const CODEX_REASONING_EFFORTS = ['none', 'low', 'medium', 'high', 'xhigh', 'max'] as const
const execFile = promisify(execFileCallback)

export type CodexReasoningEffort = (typeof CODEX_REASONING_EFFORTS)[number]

export interface CodexReasoningRuntimeMetadata {
  readonly provider: 'codex-cli'
  readonly requestedModel: string
  readonly requestedReasoningEffort: CodexReasoningEffort
}

export interface CodexReasoningExecutorOptions {
  readonly capabilities: ReasoningCapabilities
  readonly executable?: string
  readonly timeoutMs?: number
  readonly maxOutputChars?: number
  readonly tempRoot?: string
  readonly model?: string
  readonly reasoningEffort?: CodexReasoningEffort
  /** Test-only command prefix; production uses the default command prefix. */
  readonly commandPrefix?: readonly string[]
}

export class CodexReasoningExecutor implements ReasoningExecutor {
  private readonly configuredCapabilities: ReasoningCapabilities
  private readonly executable: string
  private readonly timeoutMs: number
  private readonly maxOutputChars: number
  private readonly tempRoot: string
  private readonly model: string
  private readonly reasoningEffort: CodexReasoningEffort
  private readonly commandPrefix: readonly string[]

  constructor(options: CodexReasoningExecutorOptions) {
    this.configuredCapabilities = validateReasoningCapabilities(options?.capabilities)
    this.executable = options.executable ?? process.env.CODEX_EXECUTABLE ?? 'codex'
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
    this.maxOutputChars = options.maxOutputChars ?? DEFAULT_OUTPUT_LIMIT
    this.tempRoot = options.tempRoot ?? tmpdir()
    this.model = (options.model ?? DEFAULT_MODEL).trim()
    this.reasoningEffort = options.reasoningEffort ?? 'high'
    this.commandPrefix = options.commandPrefix ?? ['exec']
    if (!this.executable.trim()) invalid('executable must be non-empty')
    if (!this.model) invalid('model must be non-empty')
    if (!(CODEX_REASONING_EFFORTS as readonly string[]).includes(this.reasoningEffort)) invalid('reasoningEffort is unsupported')
    if (!Number.isSafeInteger(this.timeoutMs) || this.timeoutMs <= 0) invalid('timeoutMs must be a positive safe integer')
    if (!Number.isSafeInteger(this.maxOutputChars) || this.maxOutputChars <= 0) invalid('maxOutputChars must be a positive safe integer')
    if (this.commandPrefix.length === 0) invalid('commandPrefix must not be empty')
  }

  capabilities(): ReasoningCapabilities {
    return this.configuredCapabilities
  }

  runtimeMetadata(): CodexReasoningRuntimeMetadata {
    return { provider: 'codex-cli', requestedModel: this.model, requestedReasoningEffort: this.reasoningEffort }
  }

  async execute(request: ReasoningRequest): Promise<ReasoningResult> {
    const operationId = request.metadata?.executionId ?? randomUUID()
    const started = Date.now()
    let invocationDirectory: string | undefined
    try {
      invocationDirectory = await mkdtemp(join(this.tempRoot, 'researchhub-reasoning-'))
      const outputPath = join(invocationDirectory, 'final-output.txt')
      const prompt = JSON.stringify({
        operation: request.operation,
        instruction: request.instruction,
        input: request.input,
        outputContract: request.outputContract,
      })
      const args = buildCodexInvocationArgs({ commandPrefix: this.commandPrefix, model: this.model, reasoningEffort: this.reasoningEffort, invocationDirectory, outputPath })
      const output = await this.runProcess(request.operation, operationId, invocationDirectory, args, prompt)
      let finalOutput: string
      try {
        const outputStat = await stat(outputPath)
        if (outputStat.size > this.maxOutputChars) throw new ReasoningExecutorError('reasoning_output_too_large', 'Reasoning output exceeded the configured limit', { operation: request.operation, operationId })
        finalOutput = await readFile(outputPath, 'utf8')
      } catch (error) {
        if (error instanceof ReasoningExecutorError) throw error
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
        finalOutput = output
      }
      if (Buffer.byteLength(finalOutput, 'utf8') > this.maxOutputChars) throw new ReasoningExecutorError('reasoning_output_too_large', 'Reasoning output exceeded the configured limit', { operation: request.operation, operationId })
      if (finalOutput.trim() === '') throw new ReasoningExecutorError('reasoning_output_invalid', 'Reasoning host returned an empty final output', { operation: request.operation, operationId })
      return { operation: request.operation, operationId, output: finalOutput, rawOutput: finalOutput, durationMs: Date.now() - started }
    } catch (error) {
      if (error instanceof ReasoningExecutorError) throw error
      throw new ReasoningExecutorError('reasoning_execution_failed', error instanceof Error ? error.message : String(error), { operation: request.operation, operationId, cause: error })
    } finally {
      if (invocationDirectory) await rm(invocationDirectory, { recursive: true, force: true })
    }
  }

  private runProcess(operation: ReasoningOperation, operationId: string, cwd: string, args: readonly string[], prompt: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const child = spawn(this.executable, [...args], { cwd, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true, detached: process.platform !== 'win32' })
      let stdout = ''
      let stderr = ''
      let settled = false
      let timedOut = false
      let stdoutTruncated = false
      const finish = (callback: () => void): void => {
        if (settled) return
        settled = true
        clearTimeout(timeout)
        callback()
      }
      const timeout = setTimeout(() => {
        timedOut = true
        void terminateProcessTree(child.pid).then(() => {
          finish(() => reject(new ReasoningExecutorError('reasoning_timeout', 'Reasoning host execution timed out', { operation, operationId })))
        }).catch((error) => {
          finish(() => reject(new ReasoningExecutorError('reasoning_timeout', `Reasoning host execution timed out; process-tree termination failed: ${error instanceof Error ? error.message : String(error)}`, { operation, operationId, cause: error })))
        })
      }, this.timeoutMs)
      child.stdout.setEncoding('utf8')
      child.stderr.setEncoding('utf8')
      child.stdout.on('data', (data: string) => {
        const remaining = Math.max(0, this.maxOutputChars - stdout.length)
        stdout += data.slice(0, remaining)
        if (data.length > remaining) stdoutTruncated = true
      })
      child.stderr.on('data', (data: string) => { stderr = (stderr + data).slice(-STDERR_LIMIT) })
      child.once('error', (error: NodeJS.ErrnoException) => {
        const code = error.code === 'ENOENT' ? 'reasoning_host_unavailable' : 'reasoning_execution_failed'
        finish(() => reject(new ReasoningExecutorError(code, error.message, { operation, operationId, stderr, cause: error })))
      })
      child.once('close', (exitCode) => {
        finish(() => {
          if (timedOut) reject(new ReasoningExecutorError('reasoning_timeout', 'Reasoning host execution timed out', { operation, operationId }))
          else if (exitCode !== 0) reject(new ReasoningExecutorError('reasoning_execution_failed', `Reasoning host exited with code ${String(exitCode)}`, { operation, operationId, exitCode: exitCode ?? undefined, stderr }))
          else if (stdoutTruncated) reject(new ReasoningExecutorError('reasoning_output_too_large', 'Reasoning output exceeded the configured limit', { operation, operationId }))
          else resolve(stdout)
        })
      })
      child.stdin.end(prompt)
    })
  }
}

export function buildCodexInvocationArgs(input: { commandPrefix: readonly string[]; model: string; reasoningEffort: CodexReasoningEffort; invocationDirectory: string; outputPath: string }): string[] {
  return [
    ...input.commandPrefix,
    '--model', input.model,
    '-c', `model_reasoning_effort="${input.reasoningEffort}"`,
    '--ephemeral',
    '--sandbox', 'read-only',
    '--skip-git-repo-check',
    '-C', input.invocationDirectory,
    '-o', input.outputPath,
    '-',
  ]
}

async function terminateProcessTree(pid: number | undefined): Promise<void> {
  if (pid === undefined) return
  if (process.platform === 'win32') {
    try {
      await execFile('taskkill', ['/pid', String(pid), '/t', '/f'], { windowsHide: true, timeout: PROCESS_TERMINATION_TIMEOUT_MS, maxBuffer: STDERR_LIMIT * 2 })
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      if (code !== 'ESRCH' && code !== 'ENOENT') throw error
    }
    return
  }
  try { process.kill(-pid, 'SIGTERM') } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code !== 'ESRCH') throw error
  }
}

function invalid(message: string): never {
  throw new ReasoningExecutorError('reasoning_configuration_invalid', message)
}
