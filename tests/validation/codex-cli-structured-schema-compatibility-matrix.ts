import { mkdir, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { execFile as execFileCallback } from 'node:child_process'
import { promisify } from 'node:util'
import { resolve } from 'node:path'
import { createCodexCliLunaReasoningExecutor } from '../../app/pi/model-selection.ts'
import { normalizeCodexOutputSchema } from '../../plugins/reasoning/codex-cli/executor.ts'
import { ReasoningExecutorError } from '../../plugins/reasoning/errors.ts'
import { parseIndustryReasoningObject, validateIndustryResearchDesign } from '../../skills/industry-research/skill.ts'
import { INDUSTRY_RESEARCH_DESIGN_CONTRACT } from '../../skills/industry-research/contracts.ts'
import type { ReasoningRequest, ReasoningResult } from '../../plugins/reasoning/contracts.ts'

export const TASK_ID = 'RHL-M3B-3B-DIAG-003-CODEX-STRUCTURED-SCHEMA-COMPATIBILITY-MATRIX'
export const BASE_COMMIT = '1f011467dc2117d3d09a48f8c9730c285da1a89c'
export const EXPECTED_DESIGN_FINGERPRINT = '9854f93073c44d96'
export const EXPECTED_DESIGN_TRANSPORT = { fingerprint: '95e315657e862a7e', bytes: 2111 } as const
export const CAPABILITIES = { maxContextTokens: 128_000, maxOutputTokens: 16_384, structuredOutputSupport: true, maxConcurrency: 1 } as const
export const PROBE_NAMES = ['MINIMAL_STRICT_CONTROL', 'OPTIONAL_PROPERTY_PROBE', 'CURRENT_DESIGN_SCHEMA_NEUTRAL', 'STRICT_REQUIRED_DESIGN_PROBE'] as const
export type ProbeName = typeof PROBE_NAMES[number]
export type FinalClassification = 'CURRENT_DESIGN_SCHEMA_EXECUTES' | 'STRICT_REQUIRED_DESIGN_TRANSFORMATION_PROVEN' | 'OPTIONAL_PROPERTY_STRICTNESS_INCOMPATIBILITY_UNCONFIRMED' | 'DESIGN_SCHEMA_OTHER_INCOMPATIBILITY' | 'STRUCTURED_OUTPUT_TRANSPORT_GENERAL_FAILURE' | 'BACKEND_AUTH_OR_ACCOUNT_BLOCKED' | 'BACKEND_MODEL_UNAVAILABLE' | 'BACKEND_RATE_OR_QUOTA_BLOCKED' | 'BACKEND_SAFETY_OR_POLICY_BLOCKED' | 'BACKEND_TIMEOUT_OR_CANCELLED' | 'BACKEND_TRANSPORT_OR_SERVICE_FAILURE' | 'BACKEND_FAILURE_DIAGNOSTIC_INCONCLUSIVE' | 'DESIGN_CONTRACT_FINGERPRINT_CHANGED' | 'BLOCKED_EXTERNAL_SETUP'
export type NextActionCategory = 'RERUN_UNCHANGED_PCB_WITHOUT_PRODUCTION_CHANGE' | 'IMPLEMENT_NARROW_STRICT_REQUIRED_TRANSPORT_NORMALIZATION' | 'REVIEW_OTHER_SCHEMA_INCOMPATIBILITY' | 'REVIEW_BACKEND_RUNTIME_FAILURE' | 'EXTERNAL_SETUP_REQUIRED'

export interface ProbePlan { readonly name: ProbeName; readonly outputContract: unknown; readonly normalizedFingerprint: string; readonly normalizedBytes: number; readonly instruction: string; readonly input: Record<string, string> }
export interface ProbeOutcome { readonly name: ProbeName; readonly attempted: boolean; readonly processStarted: boolean; readonly exitState: string; readonly semanticResultAvailable: boolean; readonly safeReasoningCode: string | null; readonly safeFailureClass: string | null; readonly structuredEventType: string | null; readonly safeErrorCode: string | null; readonly durationMs: number; readonly schemaFingerprint: string; readonly schemaBytes: number; readonly outputHash: string | null; readonly outputBytes: number; readonly parserStatus?: string; readonly validatorStatus?: string; readonly targetKind?: string | null; readonly moduleQuestionKeys?: string[]; readonly moduleQuestionCount?: number; readonly diagnostic?: string }

const repoRoot = resolve(import.meta.dirname, '../..')
const evidencePath = resolve(repoRoot, 'tests/validation/evidence/RHL_M3B_CODEX_CLI_STRUCTURED_SCHEMA_COMPATIBILITY_MATRIX.json')
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 16)
const bytes = (value: unknown) => Buffer.byteLength(JSON.stringify(value), 'utf8')
const harmlessInstruction = 'Return exactly one JSON object satisfying the supplied schema with harmless placeholder values.'
const harmlessInput = { purpose: 'schema compatibility diagnostic', value: 'ok' }

export function classifyFailure(error: unknown): FinalClassification {
  if (!(error instanceof ReasoningExecutorError)) return 'BACKEND_FAILURE_DIAGNOSTIC_INCONCLUSIVE'
  switch (error.failureClass) {
    case 'authentication_or_account': return 'BACKEND_AUTH_OR_ACCOUNT_BLOCKED'
    case 'model_unavailable': return 'BACKEND_MODEL_UNAVAILABLE'
    case 'rate_limit_or_quota': return 'BACKEND_RATE_OR_QUOTA_BLOCKED'
    case 'safety_or_policy': return 'BACKEND_SAFETY_OR_POLICY_BLOCKED'
    case 'timeout_or_cancel': return 'BACKEND_TIMEOUT_OR_CANCELLED'
    case 'transport_or_service': return 'BACKEND_TRANSPORT_OR_SERVICE_FAILURE'
    case 'structured_output_configuration': return 'STRUCTURED_OUTPUT_TRANSPORT_GENERAL_FAILURE'
    case 'unknown_nonzero_exit': return 'BACKEND_FAILURE_DIAGNOSTIC_INCONCLUSIVE'
    default: return error.code === 'reasoning_timeout' ? 'BACKEND_TIMEOUT_OR_CANCELLED' : 'BACKEND_FAILURE_DIAGNOSTIC_INCONCLUSIVE'
  }
}

function classifyFailureClass(failureClass: string | null | undefined): FinalClassification {
  switch (failureClass) {
    case 'authentication_or_account': return 'BACKEND_AUTH_OR_ACCOUNT_BLOCKED'
    case 'model_unavailable': return 'BACKEND_MODEL_UNAVAILABLE'
    case 'rate_limit_or_quota': return 'BACKEND_RATE_OR_QUOTA_BLOCKED'
    case 'safety_or_policy': return 'BACKEND_SAFETY_OR_POLICY_BLOCKED'
    case 'timeout_or_cancel': return 'BACKEND_TIMEOUT_OR_CANCELLED'
    case 'transport_or_service': return 'BACKEND_TRANSPORT_OR_SERVICE_FAILURE'
    case 'structured_output_configuration': return 'STRUCTURED_OUTPUT_TRANSPORT_GENERAL_FAILURE'
    default: return 'BACKEND_FAILURE_DIAGNOSTIC_INCONCLUSIVE'
  }
}

export function buildStrictRequiredCopy(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(buildStrictRequiredCopy)
  if (value === null || typeof value !== 'object') return value
  const source = value as Record<string, unknown>
  const copy = Object.fromEntries(Object.entries(source).map(([key, child]) => [key, buildStrictRequiredCopy(child)])) as Record<string, unknown>
  if (copy.type === 'object' && copy.properties && typeof copy.properties === 'object' && !Array.isArray(copy.properties)) copy.required = Object.keys(copy.properties as object)
  return copy
}

export function decideMatrix(outcomes: readonly ProbeOutcome[]): { classification: FinalClassification; nextActionCategory: NextActionCategory; calls: number; stopReason: string } {
  const calls = outcomes.filter((outcome) => outcome.attempted).length
  const first = outcomes.find((outcome) => outcome.name === 'MINIMAL_STRICT_CONTROL')
  if (!first || !first.attempted) return { classification: 'BACKEND_FAILURE_DIAGNOSTIC_INCONCLUSIVE', nextActionCategory: 'REVIEW_BACKEND_RUNTIME_FAILURE', calls, stopReason: 'Probe 1 was not attempted' }
  if (!first.semanticResultAvailable) {
    if (first.safeFailureClass === 'authentication_or_account' || first.safeReasoningCode === 'reasoning_host_unavailable') return { classification: 'BLOCKED_EXTERNAL_SETUP', nextActionCategory: 'EXTERNAL_SETUP_REQUIRED', calls, stopReason: 'Probe 1 external setup failure' }
    if (first.safeFailureClass === 'model_unavailable') return { classification: 'BACKEND_MODEL_UNAVAILABLE', nextActionCategory: 'REVIEW_BACKEND_RUNTIME_FAILURE', calls, stopReason: 'Probe 1 model unavailable' }
    if (first.safeFailureClass === 'rate_limit_or_quota') return { classification: 'BACKEND_RATE_OR_QUOTA_BLOCKED', nextActionCategory: 'REVIEW_BACKEND_RUNTIME_FAILURE', calls, stopReason: 'Probe 1 rate or quota failure' }
    if (first.safeFailureClass === 'safety_or_policy') return { classification: 'BACKEND_SAFETY_OR_POLICY_BLOCKED', nextActionCategory: 'REVIEW_BACKEND_RUNTIME_FAILURE', calls, stopReason: 'Probe 1 safety or policy failure' }
    if (first.safeFailureClass === 'timeout_or_cancel') return { classification: 'BACKEND_TIMEOUT_OR_CANCELLED', nextActionCategory: 'REVIEW_BACKEND_RUNTIME_FAILURE', calls, stopReason: 'Probe 1 timeout or cancellation' }
    if (first.safeFailureClass === 'transport_or_service') return { classification: 'BACKEND_TRANSPORT_OR_SERVICE_FAILURE', nextActionCategory: 'REVIEW_BACKEND_RUNTIME_FAILURE', calls, stopReason: 'Probe 1 transport or service failure' }
    return { classification: 'BACKEND_FAILURE_DIAGNOSTIC_INCONCLUSIVE', nextActionCategory: 'REVIEW_BACKEND_RUNTIME_FAILURE', calls, stopReason: 'Probe 1 did not establish general structured-output health' }
  }
  const optional = outcomes.find((outcome) => outcome.name === 'OPTIONAL_PROPERTY_PROBE')
  const design = outcomes.find((outcome) => outcome.name === 'CURRENT_DESIGN_SCHEMA_NEUTRAL')
  const strict = outcomes.find((outcome) => outcome.name === 'STRICT_REQUIRED_DESIGN_PROBE')
  if (design?.semanticResultAvailable && design.validatorStatus === 'passed') return { classification: 'CURRENT_DESIGN_SCHEMA_EXECUTES', nextActionCategory: 'RERUN_UNCHANGED_PCB_WITHOUT_PRODUCTION_CHANGE', calls, stopReason: 'Current Design schema passed neutral Pi parsing and validation' }
  if (design?.safeFailureClass && design.safeFailureClass !== 'structured_output_configuration') {
    return { classification: optional?.safeFailureClass === 'structured_output_configuration' ? 'OPTIONAL_PROPERTY_STRICTNESS_INCOMPATIBILITY_UNCONFIRMED' : classifyFailureClass(design.safeFailureClass), nextActionCategory: 'REVIEW_BACKEND_RUNTIME_FAILURE', calls, stopReason: 'Design probe failed for an unrelated backend category' }
  }
  if (design?.safeFailureClass === 'structured_output_configuration' && optional?.safeFailureClass === 'structured_output_configuration' && strict?.semanticResultAvailable && strict.validatorStatus === 'passed') return { classification: 'STRICT_REQUIRED_DESIGN_TRANSFORMATION_PROVEN', nextActionCategory: 'IMPLEMENT_NARROW_STRICT_REQUIRED_TRANSPORT_NORMALIZATION', calls, stopReason: 'Strict-required Design copy passed Pi parsing and authoritative validation' }
  if (design?.safeFailureClass === 'structured_output_configuration') return { classification: 'DESIGN_SCHEMA_OTHER_INCOMPATIBILITY', nextActionCategory: 'REVIEW_OTHER_SCHEMA_INCOMPATIBILITY', calls, stopReason: 'Design schema configuration failure was not resolved by the permitted diagnostic copy' }
  return { classification: 'BACKEND_FAILURE_DIAGNOSTIC_INCONCLUSIVE', nextActionCategory: 'REVIEW_BACKEND_RUNTIME_FAILURE', calls, stopReason: 'Design probe did not produce a conclusive result' }
}

export function createProbePlans(): { plans: ProbePlan[]; sourceFingerprint: string; sourceBytes: number; normalizedDesignFingerprint: string; normalizedDesignBytes: number } {
  const minimal = { name: 'MinimalStrictControl', type: 'object', additionalProperties: false, required: ['status'], properties: { status: { const: 'ok' } } }
  const optional = { name: 'OptionalPropertyProbe', type: 'object', additionalProperties: false, required: ['status'], properties: { status: { const: 'ok' }, note: { type: 'string' } } }
  const sourceFingerprint = hash(INDUSTRY_RESEARCH_DESIGN_CONTRACT)
  const normalizedDesign = normalizeCodexOutputSchema(INDUSTRY_RESEARCH_DESIGN_CONTRACT)
  const plans = [minimal, optional, INDUSTRY_RESEARCH_DESIGN_CONTRACT].map((contract, index) => { const normalized = normalizeCodexOutputSchema(contract); return { name: PROBE_NAMES[index], outputContract: contract, normalizedFingerprint: normalized.fingerprint, normalizedBytes: normalized.bytes, instruction: harmlessInstruction, input: harmlessInput } })
  return { plans, sourceFingerprint, sourceBytes: bytes(INDUSTRY_RESEARCH_DESIGN_CONTRACT), normalizedDesignFingerprint: normalizedDesign.fingerprint, normalizedDesignBytes: normalizedDesign.bytes }
}

function safeError(error: unknown): Partial<ProbeOutcome> { const e = error instanceof ReasoningExecutorError ? error : undefined; return { processStarted: e?.processStarted ?? false, exitState: e?.exitState ?? 'not_started', semanticResultAvailable: false, safeReasoningCode: e?.code ?? 'reasoning_execution_failed', safeFailureClass: e?.failureClass ?? null, structuredEventType: e?.structuredEventType ?? null, safeErrorCode: e?.safeErrorCode ?? null, diagnostic: e?.message?.slice(0, 160) ?? 'probe failed' } }

async function cliVersion(): Promise<string | null> { try { const result = await promisify(execFileCallback)('codex', ['--version'], { windowsHide: true, maxBuffer: 8_000 }); return result.stdout.trim().slice(0, 128) || null } catch { return null } }

async function runProbe(executor: Awaited<ReturnType<typeof createCodexCliLunaReasoningExecutor>>, plan: ProbePlan): Promise<ProbeOutcome> {
  const started = Date.now(); const base = { name: plan.name, attempted: true, processStarted: false, exitState: 'not_started', semanticResultAvailable: false, safeReasoningCode: null, safeFailureClass: null, structuredEventType: null, safeErrorCode: null, durationMs: 0, schemaFingerprint: plan.normalizedFingerprint, schemaBytes: plan.normalizedBytes, outputHash: null, outputBytes: 0 }
  const request: ReasoningRequest = { operation: 'industry_research_design', instruction: plan.instruction, input: plan.input, outputContract: plan.outputContract, metadata: { executionId: `diag-003-${plan.name}` } }
  try {
    const result: ReasoningResult = await executor.execute(request)
    const outcome: ProbeOutcome = { ...base, semanticResultAvailable: true, exitState: 'normal_exit', safeReasoningCode: null, durationMs: Date.now() - started, outputHash: hash(result.rawOutput ?? result.output), outputBytes: bytes(result.rawOutput ?? result.output) }
    if (plan.name === 'CURRENT_DESIGN_SCHEMA_NEUTRAL' || plan.name === 'STRICT_REQUIRED_DESIGN_PROBE') {
      try { const parsed = parseIndustryReasoningObject(result.output); const validated = validateIndustryResearchDesign(parsed); return { ...outcome, parserStatus: 'passed', validatorStatus: 'passed', targetKind: validated.targetKind, moduleQuestionKeys: Object.keys(validated.moduleQuestions).sort(), moduleQuestionCount: Object.keys(validated.moduleQuestions).length } } catch (error) { return { ...outcome, parserStatus: 'failed_or_invalid', validatorStatus: 'failed', diagnostic: String(error instanceof Error ? error.message : error).slice(0, 160) } }
    }
    return outcome
  } catch (error) { return { ...base, ...safeError(error), durationMs: Date.now() - started } }
}

export async function main(): Promise<void> {
  const started = Date.now(); const planInfo = createProbePlans(); const sourceBefore = hash(INDUSTRY_RESEARCH_DESIGN_CONTRACT)
  const outcomes: ProbeOutcome[] = []; let executor: Awaited<ReturnType<typeof createCodexCliLunaReasoningExecutor>> | undefined
  try { executor = await createCodexCliLunaReasoningExecutor({ capabilities: CAPABILITIES, timeoutMs: 900_000, maxOutputChars: 400_000 }) } catch (error) {
    outcomes.push({ name: 'MINIMAL_STRICT_CONTROL', attempted: false, schemaFingerprint: planInfo.plans[0].normalizedFingerprint, schemaBytes: planInfo.plans[0].normalizedBytes, durationMs: 0, outputHash: null, outputBytes: 0, ...safeError(error) } as ProbeOutcome)
  }
  if (executor) {
    outcomes.push(await runProbe(executor, planInfo.plans[0]))
    if (outcomes[0].semanticResultAvailable) outcomes.push(await runProbe(executor, planInfo.plans[1]))
    if (outcomes[0].semanticResultAvailable && outcomes[1]?.attempted) outcomes.push(await runProbe(executor, planInfo.plans[2]))
    const design = outcomes.find((outcome) => outcome.name === 'CURRENT_DESIGN_SCHEMA_NEUTRAL')
    const optional = outcomes.find((outcome) => outcome.name === 'OPTIONAL_PROPERTY_PROBE')
    if (design?.safeFailureClass === 'structured_output_configuration' && optional?.safeFailureClass === 'structured_output_configuration') {
      const strictContract = buildStrictRequiredCopy(INDUSTRY_RESEARCH_DESIGN_CONTRACT); const normalized = normalizeCodexOutputSchema(strictContract)
      outcomes.push(await runProbe(executor, { ...planInfo.plans[2], name: 'STRICT_REQUIRED_DESIGN_PROBE', outputContract: strictContract, normalizedFingerprint: normalized.fingerprint, normalizedBytes: normalized.bytes }))
    }
  }
  const sourceAfter = hash(INDUSTRY_RESEARCH_DESIGN_CONTRACT); const decision = sourceBefore !== sourceAfter || sourceAfter !== EXPECTED_DESIGN_FINGERPRINT ? { classification: 'DESIGN_CONTRACT_FINGERPRINT_CHANGED' as const, nextActionCategory: 'REVIEW_OTHER_SCHEMA_INCOMPATIBILITY' as const, calls: outcomes.filter((x) => x.attempted).length, stopReason: 'Imported Design contract fingerprint changed' } : decideMatrix(outcomes)
  const optional = outcomes.find((outcome) => outcome.name === 'OPTIONAL_PROPERTY_PROBE')
  const strict = outcomes.find((outcome) => outcome.name === 'STRICT_REQUIRED_DESIGN_PROBE')
  const evidence = { taskId: TASK_ID, baseCommit: BASE_COMMIT, generatedAt: new Date().toISOString(), backend: 'codex-cli', model: 'gpt-5.6-luna', effort: 'medium', invocationMode: 'exec-stdin-json-output-read-only', cliVersion: await cliVersion(), probeOrder: outcomes.map((x) => x.name), actualCallCount: outcomes.filter((x) => x.attempted).length, probes: outcomes, currentDesign: { sourceFingerprint: sourceAfter, sourceBytes: planInfo.sourceBytes, expectedSourceFingerprint: EXPECTED_DESIGN_FINGERPRINT, normalizedFingerprint: planInfo.normalizedDesignFingerprint, normalizedBytes: planInfo.normalizedDesignBytes, expectedNormalized: EXPECTED_DESIGN_TRANSPORT }, optionalPropertyAccepted: optional?.semanticResultAvailable === true ? true : optional?.safeFailureClass === 'structured_output_configuration' ? false : null, strictRequiredDesign: strict ? { fingerprint: strict.schemaFingerprint, bytes: strict.schemaBytes } : null, ...decision, durationMs: Date.now() - started, mutation: { knowledge: false, sourceRaw: false, gateway: false, writer: false, researchReport: false, graph: false, industryRequest: false, productionModelSelection: false, productionSchemaNormalizer: false }, privacy: { completePrompts: false, completeOutputs: false, completeSchemas: false, stdout: false, stderr: false, jsonl: false, credentials: false, authData: false, reasoningTraces: false, privatePaths: false }, fix005Acceptance: { acceptedScope: 'diagnostic-hardening only', processStarted: true, exitState: 'nonzero_exit', semanticResultAvailable: false, failureClass: 'unknown_nonzero_exit', realModelCalls: 1, requestUnchanged: true, schemaCorrectionAuthorized: false } }
  await mkdir(resolve(repoRoot, 'tests/validation/evidence'), { recursive: true }); await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8'); console.log(JSON.stringify(evidence, null, 2))
}

if (process.argv[1]?.endsWith('codex-cli-structured-schema-compatibility-matrix.ts')) await main()
