import { mkdir, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { resolve } from 'node:path'
import { createCodexCliLunaReasoningExecutor } from '../../app/pi/model-selection.ts'
import { ReasoningExecutorError } from '../../plugins/reasoning/errors.ts'
import { IndustryResearchSkill, parseIndustryReasoningObject, validateIndustryResearchDesign } from '../../skills/industry-research/skill.ts'
import { INDUSTRY_MODULES, INDUSTRY_RESEARCH_DESIGN_CONTRACT } from '../../skills/industry-research/contracts.ts'
import type { ReasoningExecutor, ReasoningRequest, ReasoningResult } from '../../plugins/reasoning/contracts.ts'

export type CompatibilityClassification =
  | 'COMPATIBLE_VALID_INDUSTRY_DESIGN'
  | 'COMPATIBLE_VALID_NONINDUSTRY_DIAGNOSIS'
  | 'MODEL_OUTPUT_INVALID'
  | 'BACKEND_EXECUTION_FAILED'
  | 'BLOCKED_EXTERNAL_SETUP'

export interface CompatibilityInput {
  readonly backendExecuted: boolean
  readonly metadataMatches: boolean
  readonly requestUnchanged: boolean
  readonly parserValid: boolean
  readonly validatorValid: boolean
  readonly targetKind?: string
  readonly externalSetup?: boolean
  readonly failureCode?: string
}

export function classifyCompatibility(input: CompatibilityInput): CompatibilityClassification {
  if (input.externalSetup) return 'BLOCKED_EXTERNAL_SETUP'
  if (input.failureCode === 'reasoning_output_invalid' || input.failureCode === 'reasoning_output_too_large') return 'MODEL_OUTPUT_INVALID'
  if (!input.backendExecuted) return 'BACKEND_EXECUTION_FAILED'
  if (!input.metadataMatches || !input.requestUnchanged) return 'BACKEND_EXECUTION_FAILED'
  if (!input.parserValid || !input.validatorValid) return 'MODEL_OUTPUT_INVALID'
  return input.targetKind === 'industry' ? 'COMPATIBLE_VALID_INDUSTRY_DESIGN' : 'COMPATIBLE_VALID_NONINDUSTRY_DIAGNOSIS'
}

const taskId = 'RHL-M3B-3B-DIAG-002-CODEX-CLI-PCB-DESIGN-COMPATIBILITY'
const baseCommit = '5c63d540c36b7ccbfa9afe58ffbba886e7fe0dae'
const repoRoot = resolve(import.meta.dirname, '../..')
const evidencePath = resolve(repoRoot, 'tests/validation/evidence/RHL_M3B_CODEX_CLI_PCB_DESIGN_COMPATIBILITY.json')
const expectedFingerprints = { instruction: '7a04f3501b1d420d', input: '36c1bc2fc516f169', outputContract: '9854f93073c44d96' }
const capabilities = { maxContextTokens: 128_000, maxOutputTokens: 16_384, structuredOutputSupport: true, maxConcurrency: 1 }
const shortHash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 16)
const byteSize = (value: unknown) => Buffer.byteLength(JSON.stringify(value), 'utf8')
const safeError = (error: unknown) => error instanceof ReasoningExecutorError ? error.code : 'reasoning_execution_failed'
const isExternalSetup = (error: unknown) => {
  const message = String(error instanceof Error ? error.message : error).toLowerCase()
  return error instanceof ReasoningExecutorError && error.code === 'reasoning_host_unavailable' || /login|authentication|authenticate|otp|sign.?in|account|credential/.test(message)
}

function validDesign(): Record<string, unknown> {
  return {
    definitionHypothesis: 'A bounded manufacturing industry research plan.', targetKind: 'industry',
    scope: { included: ['manufacturing economics'], excluded: ['unrelated sectors'] },
    moduleQuestions: Object.fromEntries(INDUSTRY_MODULES.map((module) => [module, `Assess ${module}.`])),
    keyMetrics: ['market structure'], evidenceRequirements: ['public authoritative evidence'], searchTerms: ['PCB Manufacturing'], knownGaps: [], verificationCandidates: [],
  }
}

export async function captureFirstDesignRequest(): Promise<{ request: ReasoningRequest; calls: number }> {
  let request: ReasoningRequest | undefined
  let calls = 0
  const captureExecutor: ReasoningExecutor = {
    capabilities: () => capabilities,
    execute: async (candidate) => { calls += 1; request = candidate; return { operation: candidate.operation, output: validDesign() } },
  }
  await new IndustryResearchSkill(captureExecutor).design({ target: { name: 'PCB Manufacturing', aliases: ['Printed Circuit Board'] }, existingKnowledge: [] })
  if (!request) throw new Error('Industry Skill did not produce a first-attempt Design request')
  return { request, calls }
}

function requestSummary(request: ReasoningRequest) {
  return {
    operation: request.operation,
    instructionHash: shortHash(request.instruction), instructionBytes: Buffer.byteLength(request.instruction, 'utf8'),
    inputHash: shortHash(request.input), inputBytes: byteSize(request.input), inputKeys: Object.keys(request.input as Record<string, unknown>).sort(),
    outputContractHash: shortHash(request.outputContract), outputContractBytes: byteSize(request.outputContract), outputContractKeys: Object.keys(request.outputContract as Record<string, unknown>).sort(),
  }
}

function setupFailure(error: unknown) {
  return { safeCode: safeError(error), externalSetup: isExternalSetup(error), category: isExternalSetup(error) ? 'external_setup' : 'backend_execution' }
}

export async function main(): Promise<void> {
  const started = Date.now()
  let captured: { request: ReasoningRequest; calls: number } | undefined
  let result: ReasoningResult | undefined
  let failure: { safeCode: string; externalSetup: boolean; category: string } | undefined
  let backendInvoked = false
  let parsed = false
  let validated: ReturnType<typeof validateIndustryResearchDesign> | undefined
  let validationCode: string | undefined
  let metadata: Record<string, unknown> = { backend: 'codex-cli', requestedModel: 'gpt-5.6-luna', requestedReasoningEffort: 'medium', invocationMode: 'exec-stdin-json-output-read-only' }
  try {
    captured = await captureFirstDesignRequest()
    const request = captured.request
    const input = request.input as { target?: { name?: string; aliases?: readonly string[] }; existingKnowledge?: readonly unknown[] }
    if (request.operation !== 'industry_research_design' || input.target?.name !== 'PCB Manufacturing' || JSON.stringify(input.target?.aliases) !== JSON.stringify(['Printed Circuit Board']) || input.existingKnowledge?.length !== 0 || JSON.stringify(request.outputContract) !== JSON.stringify(INDUSTRY_RESEARCH_DESIGN_CONTRACT)) throw new Error('captured_request_assertion_failed')
    const executor = await createCodexCliLunaReasoningExecutor({ capabilities, timeoutMs: 900_000, maxOutputChars: 400_000 })
    metadata = executor.runtimeMetadata() as unknown as Record<string, unknown>
    backendInvoked = true
    result = await executor.execute(request)
    const object = parseIndustryReasoningObject(result.output)
    parsed = true
    try { validated = validateIndustryResearchDesign(object) } catch (error) { validationCode = error instanceof Error && 'code' in error ? String((error as { code?: unknown }).code) : 'validator_failure' }
  } catch (error) {
    failure = setupFailure(error)
  }

  const requestInfo = captured ? requestSummary(captured.request) : null
  const continuity = requestInfo ? { convention: 'sha256(JSON.stringify(value)).slice(0,16)', expected: expectedFingerprints, actual: { instruction: requestInfo.instructionHash, input: requestInfo.inputHash, outputContract: requestInfo.outputContractHash }, matches: { instruction: requestInfo.instructionHash === expectedFingerprints.instruction, input: requestInfo.inputHash === expectedFingerprints.input, outputContract: requestInfo.outputContractHash === expectedFingerprints.outputContract }, allMatch: requestInfo.instructionHash === expectedFingerprints.instruction && requestInfo.inputHash === expectedFingerprints.input && requestInfo.outputContractHash === expectedFingerprints.outputContract } : null
  const metadataMatches = metadata.backend === 'codex-cli' && metadata.requestedModel === 'gpt-5.6-luna' && metadata.requestedReasoningEffort === 'medium' && metadata.invocationMode === 'exec-stdin-json-output-read-only'
  const classification = classifyCompatibility({ backendExecuted: backendInvoked, metadataMatches, requestUnchanged: Boolean(requestInfo && continuity?.allMatch), parserValid: parsed, validatorValid: validated !== undefined, targetKind: validated?.targetKind, externalSetup: failure?.externalSetup, failureCode: failure?.safeCode })
  const evidence = {
    taskId, baseCommit, generatedAt: new Date().toISOString(), backend: metadata.backend, model: metadata.requestedModel, reasoningEffort: metadata.requestedReasoningEffort, invocationMode: metadata.invocationMode,
    request: requestInfo, requestContinuity: continuity, capturedFirstAttemptCount: captured?.calls ?? 0,
    execution: { attempted: captured !== undefined, backendExecuted: backendInvoked, durationMs: Date.now() - started, outputHash: result ? shortHash(result.rawOutput ?? result.output) : null, outputBytes: result ? Buffer.byteLength(result.rawOutput ?? JSON.stringify(result.output), 'utf8') : 0, parser: parsed ? 'accepted_bounded_json_object' : failure?.safeCode === 'reasoning_output_invalid' ? 'rejected_invalid_json_or_shape' : 'not_available', validator: validated ? 'passed' : 'not_run_or_failed', validatorDiagnosticCodes: validationCode ? [validationCode] : [], targetKind: validated?.targetKind ?? null, moduleQuestionKeys: validated ? Object.keys(validated.moduleQuestions).sort() : [], moduleQuestionCount: validated ? Object.keys(validated.moduleQuestions).length : 0, failure: failure ?? null },
    classification, productionSelectionAuthorized: false,
    mutation: { knowledgeBase: false, sourceRaw: false, gateway: false, writer: false, researchReport: false, graph: false, productionModelSelection: false },
    privacy: { completeRequestPersisted: false, completeOutputPersisted: false, promptPersisted: false, reasoningTracePersisted: false, credentialsPersisted: false, privatePathsPersisted: false },
  }
  await mkdir(resolve(repoRoot, 'tests/validation/evidence'), { recursive: true })
  await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8')
  console.log(JSON.stringify(evidence, null, 2))
}

if (process.argv[1]?.endsWith('codex-cli-pcb-design-compatibility.ts')) await main()
