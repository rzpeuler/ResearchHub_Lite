import { mkdir, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { execFile as execFileCallback } from 'node:child_process'
import { promisify } from 'node:util'
import { resolve } from 'node:path'
import { createCodexCliLunaReasoningExecutor } from '../../app/pi/model-selection.ts'
import { normalizeCodexOutputSchema } from '../../plugins/reasoning/codex-cli/executor.ts'
import { ReasoningExecutorError } from '../../plugins/reasoning/errors.ts'
import { IndustryResearchSkill, parseIndustryReasoningObject, validateIndustryResearchDesign } from '../../skills/industry-research/skill.ts'
import { INDUSTRY_MODULES, INDUSTRY_RESEARCH_DESIGN_CONTRACT } from '../../skills/industry-research/contracts.ts'
import type { ReasoningExecutor, ReasoningRequest } from '../../plugins/reasoning/contracts.ts'

export type StructuredOutputClassification = 'COMPATIBLE_VALID_INDUSTRY_DESIGN' | 'COMPATIBLE_VALID_NONINDUSTRY_DIAGNOSIS' | 'MODEL_OUTPUT_INVALID' | 'STRUCTURED_OUTPUT_CONFIGURATION_FAILED' | 'BACKEND_EXECUTION_FAILED' | 'BLOCKED_EXTERNAL_SETUP' | 'REQUEST_CONTINUITY_FAILED'
export const EXPECTED_FINGERPRINTS = { instruction: '7a04f3501b1d420d', input: '36c1bc2fc516f169', outputContract: '9854f93073c44d96' } as const
const execFile = promisify(execFileCallback)
const taskId = 'RHL-M3B-3B-FIX-004-CODEX-CLI-STRUCTURED-OUTPUT-BRIDGE'
const baseCommit = 'f7990053997cd2df670880d58daacbe8e0c30ef4'
const repoRoot = resolve(import.meta.dirname, '../..')
const evidencePath = resolve(repoRoot, 'tests/validation/evidence/RHL_M3B_CODEX_CLI_PCB_DESIGN_STRUCTURED_OUTPUT.json')
const capabilities = { maxContextTokens: 128_000, maxOutputTokens: 16_384, structuredOutputSupport: true, maxConcurrency: 1 }
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 16)
const bytes = (value: unknown) => Buffer.byteLength(JSON.stringify(value), 'utf8')
const safeCode = (error: unknown) => error instanceof ReasoningExecutorError ? error.code : 'reasoning_execution_failed'
const externalSetup = (error: unknown) => { const message = String(error instanceof Error ? error.message : error).toLowerCase(); return (error instanceof ReasoningExecutorError && error.code === 'reasoning_host_unavailable') || /login|authentication|authenticate|otp|sign.?in|account|credential/.test(message) }
const configurationFailure = (error: unknown) => error instanceof ReasoningExecutorError && error.code === 'reasoning_configuration_invalid'

function validDesign(): Record<string, unknown> { return { definitionHypothesis: 'A bounded manufacturing industry research plan.', targetKind: 'industry', scope: { included: ['manufacturing economics'], excluded: ['unrelated sectors'] }, moduleQuestions: Object.fromEntries(INDUSTRY_MODULES.map((module) => [module, `Assess ${module}.`])), keyMetrics: ['market structure'], evidenceRequirements: ['public authoritative evidence'], searchTerms: ['PCB Manufacturing'], knownGaps: [], verificationCandidates: [] } }

export async function captureFirstDesignRequest(): Promise<{ request: ReasoningRequest; calls: number }> {
  let request: ReasoningRequest | undefined; let calls = 0
  const capture: ReasoningExecutor = { capabilities: () => capabilities, execute: async (candidate) => { calls += 1; request = candidate; return { operation: candidate.operation, output: validDesign() } } }
  await new IndustryResearchSkill(capture).design({ target: { name: 'PCB Manufacturing', aliases: ['Printed Circuit Board'] }, existingKnowledge: [] })
  if (!request) throw new Error('Industry Skill did not produce a first-attempt Design request')
  return { request, calls }
}

export function requestFingerprints(request: ReasoningRequest) { return { instruction: hash(request.instruction), input: hash(request.input), outputContract: hash(request.outputContract) } }
export function classifyStructuredOutput(input: { backendExecuted: boolean; continuity: boolean; parsed: boolean; validated: boolean; targetKind?: string; failureCode?: string; externalSetup?: boolean; configurationFailure?: boolean }): StructuredOutputClassification {
  if (input.externalSetup) return 'BLOCKED_EXTERNAL_SETUP'
  if (!input.continuity) return 'REQUEST_CONTINUITY_FAILED'
  if (input.configurationFailure || input.failureCode === 'reasoning_structured_output_configuration_failed') return 'STRUCTURED_OUTPUT_CONFIGURATION_FAILED'
  if (!input.backendExecuted) return 'BACKEND_EXECUTION_FAILED'
  if (input.failureCode === 'reasoning_output_invalid' || input.failureCode === 'reasoning_output_too_large' || !input.parsed || !input.validated) return 'MODEL_OUTPUT_INVALID'
  return input.targetKind === 'industry' ? 'COMPATIBLE_VALID_INDUSTRY_DESIGN' : 'COMPATIBLE_VALID_NONINDUSTRY_DIAGNOSIS'
}

async function cliVersion(): Promise<string | null> { try { const result = await execFile(process.platform === 'win32' ? 'codex' : 'codex', ['--version'], { windowsHide: true, maxBuffer: 8_000 }); return result.stdout.trim().slice(0, 128) || null } catch { return null } }

export async function main(): Promise<void> {
  const started = Date.now(); let captured: { request: ReasoningRequest; calls: number } | undefined; let result: any; let error: unknown; let parsed = false; let validated: any; let validationCode: string | undefined
  try {
    captured = await captureFirstDesignRequest(); const request = captured.request; const actual = requestFingerprints(request); const continuity = Object.keys(EXPECTED_FINGERPRINTS).every((key) => actual[key as keyof typeof actual] === EXPECTED_FINGERPRINTS[key as keyof typeof EXPECTED_FINGERPRINTS])
    if (!continuity) { error = new ReasoningExecutorError('reasoning_configuration_invalid', 'request continuity failed'); throw error }
    const executor = await createCodexCliLunaReasoningExecutor({ capabilities, timeoutMs: 900_000, maxOutputChars: 400_000 }); const runtime = executor.runtimeMetadata(); if (runtime.backend !== 'codex-cli' || runtime.requestedModel !== 'gpt-5.6-luna' || runtime.requestedReasoningEffort !== 'medium' || runtime.invocationMode !== 'exec-stdin-json-output-read-only' || runtime.structuredOutputEnabled !== true) throw new ReasoningExecutorError('reasoning_configuration_invalid', 'Codex runtime metadata did not match the approved compatibility configuration'); result = await executor.execute(request)
    parsed = true; const object = parseIndustryReasoningObject(result.output); try { validated = validateIndustryResearchDesign(object) } catch (validationError) { validationCode = validationError instanceof Error && 'code' in validationError ? String((validationError as { code?: unknown }).code) : 'validator_failure' }
  } catch (caught) { error = caught }
  const requestInfo = captured ? { operation: captured.request.operation, instructionHash: hash(captured.request.instruction), inputHash: hash(captured.request.input), outputContractHash: hash(captured.request.outputContract), outputContractBytes: bytes(captured.request.outputContract) } : null
  const continuity = requestInfo ? { expected: EXPECTED_FINGERPRINTS, actual: { instruction: requestInfo.instructionHash, input: requestInfo.inputHash, outputContract: requestInfo.outputContractHash }, allMatch: requestInfo.instructionHash === EXPECTED_FINGERPRINTS.instruction && requestInfo.inputHash === EXPECTED_FINGERPRINTS.input && requestInfo.outputContractHash === EXPECTED_FINGERPRINTS.outputContract } : { expected: EXPECTED_FINGERPRINTS, actual: null, allMatch: false }
  const normalizedContract = normalizeCodexOutputSchema(INDUSTRY_RESEARCH_DESIGN_CONTRACT)
  const metadata = { backend: 'codex-cli', model: 'gpt-5.6-luna', reasoningEffort: 'medium', invocationMode: 'exec-stdin-json-output-read-only', structuredOutputEnabled: true }
  const classification = classifyStructuredOutput({ backendExecuted: result !== undefined, continuity: continuity.allMatch, parsed, validated: validated !== undefined, targetKind: validated?.targetKind, failureCode: safeCode(error), externalSetup: externalSetup(error), configurationFailure: configurationFailure(error) })
  const evidence = { taskId, baseCommit, generatedAt: new Date().toISOString(), ...metadata, cliVersion: await cliVersion(), schema: { enabled: true, fingerprint: normalizedContract.fingerprint, bytes: normalizedContract.bytes, removedProviderKeywords: normalizedContract.removedKeywords }, request: requestInfo, requestContinuity: continuity, oneCallCount: captured?.calls ?? 0, execution: { backendExecuted: result !== undefined, durationMs: Date.now() - started, outputHash: result ? hash(result.rawOutput ?? result.output) : null, outputBytes: result ? Buffer.byteLength(result.rawOutput ?? JSON.stringify(result.output), 'utf8') : 0, parser: parsed ? 'accepted_bounded_json_object' : safeCode(error), validator: validated ? 'passed' : 'not_run_or_failed', validatorDiagnosticCodes: validationCode ? [validationCode] : [], targetKind: validated?.targetKind ?? null, moduleQuestionKeys: validated ? Object.keys(validated.moduleQuestions).sort() : [], moduleQuestionCount: validated ? Object.keys(validated.moduleQuestions).length : 0, safeErrorCode: safeCode(error) }, classification, productionSelectionAuthorized: false, mutation: { knowledge: false, sourceRaw: false, gateway: false, writer: false, report: false, graph: false, productionModelSelection: false }, privacy: { completeRequestPersisted: false, completeOutputPersisted: false, completeOutputContractPersisted: false, normalizedSchemaPersisted: false, reasoningTracePersisted: false, credentialsPersisted: false, privatePathsPersisted: false } }
  await mkdir(resolve(repoRoot, 'tests/validation/evidence'), { recursive: true }); await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8'); console.log(JSON.stringify(evidence, null, 2))
}
if (process.argv[1]?.endsWith('codex-cli-pcb-design-structured-output.ts')) await main()
