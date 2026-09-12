import type { ModelRuntime } from '@earendil-works/pi-coding-agent'
import type { Api, Model } from '@earendil-works/pi-ai'
import { execFile as execFileCallback } from 'node:child_process'
import { promisify } from 'node:util'
import { PiReasoningExecutor } from '../../plugins/reasoning/pi/executor.ts'
import { CodexCliReasoningExecutor, CODEX_CLI_LUNA_CONFIG } from '../../plugins/reasoning/codex-cli/executor.ts'
import type { ReasoningCapabilities } from '../../plugins/reasoning/contracts.ts'
import { ReasoningExecutorError } from '../../plugins/reasoning/errors.ts'

const execFile = promisify(execFileCallback)

export interface ProductionReasoningModelSelection {
  readonly providerId: string
  readonly modelId: string
}

export const PRIMARY_PRODUCTION_REASONING_MODEL: ProductionReasoningModelSelection = Object.freeze({
  providerId: 'zhipu-openapi',
  modelId: 'glm-5.3-flash',
})

export interface IndustryProductionReasoningSelection {
  readonly backend: 'codex-cli'
  readonly requestedModel: 'gpt-5.6-luna'
  readonly requestedReasoningEffort: 'medium'
}

export const INDUSTRY_PRODUCTION_REASONING_SELECTION: IndustryProductionReasoningSelection = Object.freeze({
  backend: 'codex-cli',
  requestedModel: 'gpt-5.6-luna',
  requestedReasoningEffort: 'medium',
})

export function selectProductionReasoningModel(runtime: ModelRuntime, selection: ProductionReasoningModelSelection = PRIMARY_PRODUCTION_REASONING_MODEL): Model<Api> {
  const model = runtime.getModel(selection.providerId, selection.modelId)
  if (model === undefined) throw new Error(`Configured production reasoning model is unavailable: ${selection.providerId}/${selection.modelId}`)
  return model
}

export interface CodexCliLunaExecutorOptions {
  readonly capabilities: ReasoningCapabilities
  readonly executable?: string
  readonly timeoutMs?: number
  readonly maxOutputChars?: number
  readonly tempRoot?: string
}

/** Explicit opt-in factory. It never participates in Application Runtime default selection. */
export async function createCodexCliLunaReasoningExecutor(options: CodexCliLunaExecutorOptions): Promise<PiReasoningExecutor> {
  const executable = options.executable ?? await discoverCodexCliExecutable()
  const adapter = new CodexCliReasoningExecutor({ ...options, executable, model: CODEX_CLI_LUNA_CONFIG.model, reasoningEffort: CODEX_CLI_LUNA_CONFIG.reasoningEffort })
  const metadata = adapter.runtimeMetadata()
  return new PiReasoningExecutor({ capabilities: options.capabilities, timeoutMs: options.timeoutMs, maxOutputChars: options.maxOutputChars, completion: adapter.complete.bind(adapter), runtimeMetadata: { backend: 'codex-cli', requestedModel: metadata.requestedModel, requestedReasoningEffort: metadata.requestedReasoningEffort, invocationMode: metadata.invocationMode, structuredOutputEnabled: metadata.structuredOutputEnabled } })
}

/** The sole explicit Industry production backend. It has no fallback policy. */
export async function createIndustryProductionReasoningExecutor(options: CodexCliLunaExecutorOptions): Promise<PiReasoningExecutor> {
  return createCodexCliLunaReasoningExecutor(options)
}

export async function discoverCodexCliExecutable(): Promise<string> {
  const command = process.platform === 'win32' ? 'where.exe' : 'which'
  try {
    const result = await execFile(command, ['codex'], { windowsHide: true, maxBuffer: 8_000 })
    const executable = result.stdout.split(/\r?\n/).map((line) => line.trim()).find(Boolean)
    if (executable) return executable
  } catch (error) {
    throw new ReasoningExecutorError('reasoning_host_unavailable', 'Codex CLI executable was not discovered', { cause: error })
  }
  throw new ReasoningExecutorError('reasoning_host_unavailable', 'Codex CLI executable was not discovered')
}
