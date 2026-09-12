import { mkdir, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { execFile as execFileCallback } from 'node:child_process'
import { promisify } from 'node:util'
import { resolve } from 'node:path'
import { createCodexCliLunaReasoningExecutor } from '../../app/pi/model-selection.ts'
import { normalizeCodexOutputSchema } from '../../plugins/reasoning/codex-cli/executor.ts'
import { ReasoningExecutorError } from '../../plugins/reasoning/errors.ts'
import { IndustryResearchSkill, parseIndustryReasoningObject, validateIndustryResearchDesign } from '../../skills/industry-research/skill.ts'
import { INDUSTRY_MODULES } from '../../skills/industry-research/contracts.ts'
import type { ReasoningExecutor, ReasoningRequest } from '../../plugins/reasoning/contracts.ts'

export const EXPECTED_FINGERPRINTS = { instruction: '7a04f3501b1d420d', input: '36c1bc2fc516f169', outputContract: '9854f93073c44d96' } as const
export const FINAL_CLASSIFICATIONS = ['COMPATIBLE_VALID_INDUSTRY_DESIGN', 'COMPATIBLE_VALID_NONINDUSTRY_DIAGNOSIS', 'MODEL_OUTPUT_INVALID', 'STRUCTURED_OUTPUT_CONFIGURATION_FAILED', 'BACKEND_AUTH_OR_ACCOUNT_BLOCKED', 'BACKEND_MODEL_UNAVAILABLE', 'BACKEND_RATE_OR_QUOTA_BLOCKED', 'BACKEND_SAFETY_OR_POLICY_BLOCKED', 'BACKEND_TIMEOUT_OR_CANCELLED', 'BACKEND_TRANSPORT_OR_SERVICE_FAILURE', 'BACKEND_FAILURE_DIAGNOSTIC_INCONCLUSIVE', 'REQUEST_CONTINUITY_FAILED'] as const
export type FinalClassification = (typeof FINAL_CLASSIFICATIONS)[number]
const taskId = 'RHL-M3B-3B-FIX-005-CODEX-CLI-STRUCTURED-OUTPUT-FAILURE-CLOSURE'
const baseCommit = 'aefb22a2b4beb3389f52c5291a8d081a1c95acac'
const repoRoot = resolve(import.meta.dirname, '../..')
const evidencePath = resolve(repoRoot, 'tests/validation/evidence/RHL_M3B_CODEX_CLI_PCB_STRUCTURED_OUTPUT_FAILURE_CLOSURE.json')
const capabilities = { maxContextTokens: 128_000, maxOutputTokens: 16_384, structuredOutputSupport: true, maxConcurrency: 1 }
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 16)
const size = (value: unknown) => Buffer.byteLength(JSON.stringify(value), 'utf8')

function validFixtureDesign(): Record<string, unknown> { return { definitionHypothesis: 'fixture', targetKind: 'industry', scope: { included: ['fixture'], excluded: [] }, moduleQuestions: Object.fromEntries(INDUSTRY_MODULES.map((module) => [module, 'fixture'])), keyMetrics: ['fixture metric'], evidenceRequirements: ['fixture evidence'], searchTerms: ['fixture search'], knownGaps: [], verificationCandidates: [] } }

export async function captureFirstDesignRequest(): Promise<ReasoningRequest> {
  let captured: ReasoningRequest | undefined
  const executor: ReasoningExecutor = { capabilities: () => capabilities, execute: async (request) => { captured = request; return { operation: request.operation, output: validFixtureDesign() } } }
  await new IndustryResearchSkill(executor).design({ target: { name: 'PCB Manufacturing', aliases: ['Printed Circuit Board'] }, existingKnowledge: [] })
  if (!captured) throw new Error('IndustryResearchSkill did not produce a Design request')
  return captured
}

export function requestContinuity(request: ReasoningRequest) {
  const actual = { instruction: hash(request.instruction), input: hash(request.input), outputContract: hash(request.outputContract) }
  return { expected: EXPECTED_FINGERPRINTS, actual, allMatch: actual.instruction === EXPECTED_FINGERPRINTS.instruction && actual.input === EXPECTED_FINGERPRINTS.input && actual.outputContract === EXPECTED_FINGERPRINTS.outputContract }
}

export function shouldMakeFinalSchemaCall(first: { classification: FinalClassification; deterministicSchemaIncompatibility: boolean }): boolean {
  return first.classification === 'STRUCTURED_OUTPUT_CONFIGURATION_FAILED' && first.deterministicSchemaIncompatibility
}

export function classifyFailure(error: unknown): FinalClassification {
  if (!(error instanceof ReasoningExecutorError)) return 'BACKEND_FAILURE_DIAGNOSTIC_INCONCLUSIVE'
  switch (error.failureClass) {
    case 'structured_output_configuration': return 'STRUCTURED_OUTPUT_CONFIGURATION_FAILED'
    case 'authentication_or_account': return 'BACKEND_AUTH_OR_ACCOUNT_BLOCKED'
    case 'model_unavailable': return 'BACKEND_MODEL_UNAVAILABLE'
    case 'rate_limit_or_quota': return 'BACKEND_RATE_OR_QUOTA_BLOCKED'
    case 'safety_or_policy': return 'BACKEND_SAFETY_OR_POLICY_BLOCKED'
    case 'timeout_or_cancel': return 'BACKEND_TIMEOUT_OR_CANCELLED'
    case 'transport_or_service': return 'BACKEND_TRANSPORT_OR_SERVICE_FAILURE'
    case 'unknown_nonzero_exit': return 'BACKEND_FAILURE_DIAGNOSTIC_INCONCLUSIVE'
    default: return error.code === 'reasoning_timeout' ? 'BACKEND_TIMEOUT_OR_CANCELLED' : 'BACKEND_FAILURE_DIAGNOSTIC_INCONCLUSIVE'
  }
}

async function cliVersion(): Promise<string | null> { try { const result = await promisify(execFileCallback)('codex', ['--version'], { windowsHide: true, maxBuffer: 8_000 }); return result.stdout.trim().slice(0, 128) || null } catch { return null } }

export async function main(): Promise<void> {
  const started = Date.now(); const request = await captureFirstDesignRequest(); const continuity = requestContinuity(request)
  if (!continuity.allMatch) {
    const evidence = { taskId, baseCommit, generatedAt: new Date().toISOString(), classification: 'REQUEST_CONTINUITY_FAILED', realModelCalls: 0, requestContinuity: continuity, mutation: { knowledge: false, sourceRaw: false, gateway: false, writer: false, report: false, graph: false, productionModelSelection: false }, privacy: { rawStdout: false, rawStderr: false, providerOutput: false, credentials: false } }
    await mkdir(resolve(repoRoot, 'tests/validation/evidence'), { recursive: true }); await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`); console.log(JSON.stringify(evidence, null, 2)); return
  }
  const executor = await createCodexCliLunaReasoningExecutor({ capabilities, timeoutMs: 900_000, maxOutputChars: 400_000 })
  const runtime = executor.runtimeMetadata()
  let firstError: unknown; let firstResult: any; let parsed = false; let validated: any
  try { firstResult = await executor.execute(request); parsed = true; const design = parseIndustryReasoningObject(firstResult.output); validated = validateIndustryResearchDesign(design) } catch (error) { firstError = error }
  let classification: FinalClassification
  if (validated?.targetKind === 'industry') classification = 'COMPATIBLE_VALID_INDUSTRY_DESIGN'
  else if (validated) classification = 'COMPATIBLE_VALID_NONINDUSTRY_DIAGNOSIS'
  else if (firstResult && parsed) classification = 'MODEL_OUTPUT_INVALID'
  else classification = classifyFailure(firstError)
  const error = firstError instanceof ReasoningExecutorError ? firstError : undefined
  const deterministicSchemaIncompatibility = classification === 'STRUCTURED_OUTPUT_CONFIGURATION_FAILED' && /^invalid_schema|unsupported_schema/iu.test(error?.safeErrorCode ?? '')
  const callSecond = shouldMakeFinalSchemaCall({ classification, deterministicSchemaIncompatibility })
  let secondError: unknown; let secondResult: any
  if (callSecond) { try { secondResult = await executor.execute(request) } catch (caught) { secondError = caught } }
  if (callSecond) {
    if (secondResult) { try { const design = validateIndustryResearchDesign(parseIndustryReasoningObject(secondResult.output)); classification = design.targetKind === 'industry' ? 'COMPATIBLE_VALID_INDUSTRY_DESIGN' : 'COMPATIBLE_VALID_NONINDUSTRY_DIAGNOSIS' } catch { classification = 'MODEL_OUTPUT_INVALID' } }
    else classification = classifyFailure(secondError)
  }
  const schema = normalizeCodexOutputSchema(request.outputContract)
  const secondSafeError = secondError instanceof ReasoningExecutorError ? secondError : undefined
  const evidence = { taskId, baseCommit, generatedAt: new Date().toISOString(), backend: runtime.backend, model: runtime.requestedModel, effort: runtime.requestedReasoningEffort, invocationMode: runtime.invocationMode, structuredOutputEnabled: runtime.structuredOutputEnabled, cliVersion: await cliVersion(), schema: { fingerprint: schema.fingerprint, bytes: schema.bytes, transportCorrectionApplied: false }, requestContinuity: continuity, attempts: [{ attempt: 1, processStarted: error?.processStarted ?? !!firstResult, exitState: error?.exitState ?? (firstResult ? 'normal_exit' : 'unknown'), semanticResultAvailable: !!firstResult && parsed, safeErrorCode: error?.safeErrorCode ?? null, failureClass: error?.failureClass ?? null, outputHash: firstResult ? hash(firstResult.rawOutput ?? firstResult.output) : null, outputBytes: firstResult ? size(firstResult.rawOutput ?? firstResult.output) : 0 }, ...(callSecond ? [{ attempt: 2, processStarted: secondSafeError?.processStarted ?? !!secondResult, exitState: secondSafeError?.exitState ?? (secondResult ? 'normal_exit' : 'unknown'), semanticResultAvailable: !!secondResult, safeErrorCode: secondSafeError?.safeErrorCode ?? null, failureClass: secondSafeError?.failureClass ?? null, outputHash: secondResult ? hash(secondResult.rawOutput ?? secondResult.output) : null, outputBytes: secondResult ? size(secondResult.rawOutput ?? secondResult.output) : 0 }] : [])], realModelCalls: callSecond ? 2 : 1, classification, productionSelectionAuthorized: false, mutation: { knowledge: false, sourceRaw: false, gateway: false, writer: false, report: false, graph: false, productionModelSelection: false }, privacy: { rawStdout: false, rawStderr: false, providerOutput: false, credentials: false, reasoningTrace: false }, durationMs: Date.now() - started }
  await mkdir(resolve(repoRoot, 'tests/validation/evidence'), { recursive: true }); await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`); console.log(JSON.stringify(evidence, null, 2))
}

if (process.argv[1]?.endsWith('codex-cli-pcb-structured-output-failure-closure.ts')) await main()
