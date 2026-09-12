import { createHash } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { execFile as execFileCallback } from 'node:child_process'
import { promisify } from 'node:util'
import { resolve } from 'node:path'
import { createCodexCliLunaReasoningExecutor } from '../../app/pi/model-selection.ts'
import { normalizeCodexOutputSchema } from '../../plugins/reasoning/codex-cli/executor.ts'
import { ReasoningExecutorError } from '../../plugins/reasoning/errors.ts'
import type { ReasoningRequest, ReasoningResult } from '../../plugins/reasoning/contracts.ts'
import { parseIndustryReasoningObject, validateIndustryResearchDesign } from '../../skills/industry-research/skill.ts'
import { INDUSTRY_RESEARCH_DESIGN_CONTRACT } from '../../skills/industry-research/contracts.ts'

export const TASK_ID = 'RHL-M3B-3B-DIAG-005-CODEX-SCHEMA-TYPE-INFERENCE-ISOLATION'
export const BASE_COMMIT = '128215bb47b680fed02cf38558803a8724b23eae'
export const EXPECTED_DESIGN_FINGERPRINT = '9854f93073c44d96'
export const MAX_REAL_MODEL_CALLS = 2
export const PROBES = ['ADAPTER_EXPLICIT_TYPED_MINIMAL_CONTROL', 'ADAPTER_TYPE_INFERRED_DESIGN_NEUTRAL'] as const
export type ProbeName = typeof PROBES[number]
export type FinalClassification = 'PRIMITIVE_ENUM_CONST_TYPE_INFERENCE_PROVEN' | 'ADAPTER_EXPLICIT_TYPED_MINIMAL_WORKS_DESIGN_NOT_RUN' | 'ADAPTER_INVOCATION_DELTA_CONFIRMED' | 'TYPE_INFERENCE_INSUFFICIENT' | 'TYPE_INFERENCE_TRANSPORT_WORKS_SEMANTICS_INVALID' | 'DESIGN_CONTRACT_FINGERPRINT_CHANGED' | 'BACKEND_AUTH_OR_ACCOUNT_BLOCKED' | 'BACKEND_MODEL_UNAVAILABLE' | 'BACKEND_RATE_OR_QUOTA_BLOCKED' | 'BACKEND_SAFETY_OR_POLICY_BLOCKED' | 'BACKEND_TIMEOUT_OR_CANCELLED' | 'BACKEND_TRANSPORT_OR_SERVICE_FAILURE' | 'BACKEND_FAILURE_DIAGNOSTIC_INCONCLUSIVE' | 'BLOCKED_EXTERNAL_SETUP'
export type NextActionCategory = 'IMPLEMENT_NARROW_PRODUCTION_ENUM_CONST_TYPE_INFERENCE' | 'ISOLATE_PI_CONTEXT_OR_PROCESS_INVOCATION_DELTA' | 'REVIEW_NEXT_STRICT_SCHEMA_REQUIREMENT' | 'RERUN_NEUTRAL_TYPED_DESIGN_OR_REVIEW_MODEL_SEMANTICS' | 'REVIEW_BACKEND_RUNTIME_FAILURE' | 'EXTERNAL_SETUP_REQUIRED'

export const CAPABILITIES = { maxContextTokens: 128_000, maxOutputTokens: 16_384, structuredOutputSupport: true, maxConcurrency: 1 } as const
export const MINIMAL_TYPED_SCHEMA = Object.freeze({ type: 'object', additionalProperties: false, properties: { status: { type: 'string', const: 'ok' } }, required: ['status'] })
const repoRoot = resolve(import.meta.dirname, '../..')
const evidencePath = resolve(repoRoot, 'tests/validation/evidence/RHL_M3B_CODEX_CLI_SCHEMA_TYPE_INFERENCE_ISOLATION.json')
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 16)
const fullHash = (value: string) => createHash('sha256').update(value).digest('hex')
const jsonBytes = (value: unknown) => Buffer.byteLength(JSON.stringify(value), 'utf8')

type SchemaRecord = Record<string, unknown>
export interface InferredTypeAddition { path: string; type: 'string' | 'number' | 'integer' | 'boolean' | 'null' }

function primitiveType(value: unknown): InferredTypeAddition['type'] | undefined {
  if (value === null) return 'null'
  if (typeof value === 'string') return 'string'
  if (typeof value === 'boolean') return 'boolean'
  if (typeof value === 'number' && Number.isFinite(value)) return Number.isInteger(value) ? 'integer' : 'number'
  return undefined
}

function inferredType(node: SchemaRecord): InferredTypeAddition['type'] | undefined {
  if (Object.prototype.hasOwnProperty.call(node, 'type')) return undefined
  if (Object.prototype.hasOwnProperty.call(node, 'const')) return primitiveType(node.const)
  if (Array.isArray(node.enum) && node.enum.length > 0) {
    const types = node.enum.map(primitiveType)
    if (types.every((value): value is InferredTypeAddition['type'] => value !== undefined) && types.every((value) => value === types[0])) return types[0]
  }
  return undefined
}

export function inferPrimitiveSchemaTypes(value: unknown): { copy: unknown; additions: InferredTypeAddition[] } {
  const additions: InferredTypeAddition[] = []
  const repairSchemaNode = (node: SchemaRecord, path: string): SchemaRecord => {
    const result = { ...node } as SchemaRecord
    const type = inferredType(result)
    if (type !== undefined) { result.type = type; additions.push({ path, type }) }
    if (result.properties && typeof result.properties === 'object' && !Array.isArray(result.properties)) result.properties = Object.fromEntries(Object.entries(result.properties as SchemaRecord).map(([key, child]) => [key, child && typeof child === 'object' && !Array.isArray(child) ? repairSchemaNode(child as SchemaRecord, `${path}.properties.${key}`) : child]))
    for (const key of ['items', 'additionalProperties']) if (result[key] && typeof result[key] === 'object' && !Array.isArray(result[key])) result[key] = repairSchemaNode(result[key] as SchemaRecord, `${path}.${key}`)
    for (const key of ['oneOf', 'anyOf']) if (Array.isArray(result[key])) result[key] = result[key].map((child, index) => child && typeof child === 'object' && !Array.isArray(child) ? repairSchemaNode(child as SchemaRecord, `${path}.${key}[${index}]`) : child)
    return result
  }
  // Only schema positions recurse; enum/const data values remain opaque.
  const root = value as unknown
  if (root === null || typeof root !== 'object' || Array.isArray(root)) return { copy: root, additions }
  const copy = repairSchemaNode(root as SchemaRecord, '$')
  return { copy, additions }
}

export function classifyFailure(error: unknown): FinalClassification {
  if (!(error instanceof ReasoningExecutorError)) return 'BACKEND_FAILURE_DIAGNOSTIC_INCONCLUSIVE'
  switch (error.failureClass) {
    case 'authentication_or_account': return 'BACKEND_AUTH_OR_ACCOUNT_BLOCKED'
    case 'model_unavailable': return 'BACKEND_MODEL_UNAVAILABLE'
    case 'rate_limit_or_quota': return 'BACKEND_RATE_OR_QUOTA_BLOCKED'
    case 'safety_or_policy': return 'BACKEND_SAFETY_OR_POLICY_BLOCKED'
    case 'timeout_or_cancel': return 'BACKEND_TIMEOUT_OR_CANCELLED'
    case 'transport_or_service': return 'BACKEND_TRANSPORT_OR_SERVICE_FAILURE'
    default: return 'BACKEND_FAILURE_DIAGNOSTIC_INCONCLUSIVE'
  }
}

export interface DecisionInput { probeA: { attempted: boolean; semanticResultAvailable: boolean; safeFailureClass?: string | null }; probeB?: { attempted: boolean; semanticResultAvailable: boolean; validatorStatus?: string; safeFailureClass?: string | null }; inferredCount: number; designFingerprintUnchanged: boolean }
export function decide(input: DecisionInput): { classification: FinalClassification; nextActionCategory: NextActionCategory } {
  if (!input.designFingerprintUnchanged) return { classification: 'DESIGN_CONTRACT_FINGERPRINT_CHANGED', nextActionCategory: 'REVIEW_BACKEND_RUNTIME_FAILURE' }
  if (!input.probeA.attempted) return { classification: 'BACKEND_FAILURE_DIAGNOSTIC_INCONCLUSIVE', nextActionCategory: 'REVIEW_BACKEND_RUNTIME_FAILURE' }
  if (!input.probeA.semanticResultAvailable) {
    if (input.probeA.safeFailureClass === 'structured_output_configuration') return { classification: 'ADAPTER_INVOCATION_DELTA_CONFIRMED', nextActionCategory: 'ISOLATE_PI_CONTEXT_OR_PROCESS_INVOCATION_DELTA' }
    return { classification: 'BACKEND_FAILURE_DIAGNOSTIC_INCONCLUSIVE', nextActionCategory: 'REVIEW_BACKEND_RUNTIME_FAILURE' }
  }
  if (!input.inferredCount) return { classification: 'ADAPTER_EXPLICIT_TYPED_MINIMAL_WORKS_DESIGN_NOT_RUN', nextActionCategory: 'REVIEW_NEXT_STRICT_SCHEMA_REQUIREMENT' }
  if (input.probeB?.safeFailureClass === 'structured_output_configuration') return { classification: 'TYPE_INFERENCE_INSUFFICIENT', nextActionCategory: 'REVIEW_NEXT_STRICT_SCHEMA_REQUIREMENT' }
  if (input.probeB?.semanticResultAvailable && input.probeB.validatorStatus === 'passed') return { classification: 'PRIMITIVE_ENUM_CONST_TYPE_INFERENCE_PROVEN', nextActionCategory: 'IMPLEMENT_NARROW_PRODUCTION_ENUM_CONST_TYPE_INFERENCE' }
  if (input.probeB?.semanticResultAvailable) return { classification: 'TYPE_INFERENCE_TRANSPORT_WORKS_SEMANTICS_INVALID', nextActionCategory: 'RERUN_NEUTRAL_TYPED_DESIGN_OR_REVIEW_MODEL_SEMANTICS' }
  return { classification: 'BACKEND_FAILURE_DIAGNOSTIC_INCONCLUSIVE', nextActionCategory: 'REVIEW_BACKEND_RUNTIME_FAILURE' }
}

function safeError(error: unknown): Record<string, unknown> {
  const e = error instanceof ReasoningExecutorError ? error : undefined
  return { processStarted: e?.processStarted ?? false, exitState: e?.exitState ?? 'not_started', semanticResultAvailable: false, safeReasoningCode: e?.code ?? 'reasoning_execution_failed', safeFailureClass: e?.failureClass ?? null, structuredEventType: e?.structuredEventType ?? null, safeErrorCode: e?.safeErrorCode ?? null }
}

async function cliVersion(): Promise<string | null> { try { const result = await promisify(execFileCallback)('codex', ['--version'], { windowsHide: true, maxBuffer: 8_000 }); return result.stdout.trim().split(/\r?\n/)[0]?.slice(0, 128) ?? null } catch { return null } }

async function main(): Promise<void> {
  const generatedAt = new Date().toISOString(); const sourceBefore = hash(INDUSTRY_RESEARCH_DESIGN_CONTRACT); const sourceBytes = jsonBytes(INDUSTRY_RESEARCH_DESIGN_CONTRACT)
  const typed = inferPrimitiveSchemaTypes(INDUSTRY_RESEARCH_DESIGN_CONTRACT); const sourceAfter = hash(INDUSTRY_RESEARCH_DESIGN_CONTRACT)
  const normalizedA = normalizeCodexOutputSchema(MINIMAL_TYPED_SCHEMA); const normalizedDesign = normalizeCodexOutputSchema(typed.copy)
  const probes: Record<string, any> = {}; let executor: Awaited<ReturnType<typeof createCodexCliLunaReasoningExecutor>> | undefined
  const request = (name: ProbeName, contract: unknown): ReasoningRequest => ({ operation: 'industry_research_design', instruction: name === PROBES[0] ? 'Return exactly one harmless status object matching the supplied schema.' : 'Produce one generic research-design-shaped placeholder object satisfying the supplied schema.', input: { marker: 'neutral-schema-diagnostic' }, outputContract: contract, metadata: { executionId: `diag-005-${name}` } })
  try { executor = await createCodexCliLunaReasoningExecutor({ capabilities: CAPABILITIES, timeoutMs: 900_000, maxOutputChars: 400_000 }) } catch (error) { probes[PROBES[0]] = { attempted: false, ...safeError(error), durationMs: 0, normalizedSchemaFingerprint: normalizedA.fingerprint, normalizedSchemaBytes: normalizedA.bytes } }
  const run = async (name: ProbeName, contract: unknown, normalized: { fingerprint: string; bytes: number }): Promise<void> => {
    const started = Date.now(); const base = { attempted: true, processStarted: false, exitState: 'not_started', semanticResultAvailable: false, safeReasoningCode: null, safeFailureClass: null, structuredEventType: null, safeErrorCode: null, durationMs: 0, normalizedSchemaFingerprint: normalized.fingerprint, normalizedSchemaBytes: normalized.bytes, outputHash: null, outputBytes: 0, parserStatus: 'not_run', validatorStatus: 'not_run', targetKind: null, moduleQuestionKeys: [], moduleQuestionCount: 0 }
    try {
      const result: ReasoningResult = await executor!.execute(request(name, contract)); const outputText = result.rawOutput ?? JSON.stringify(result.output); const record: any = { ...base, processStarted: true, exitState: 'normal_exit', semanticResultAvailable: true, durationMs: Date.now() - started, outputHash: fullHash(outputText), outputBytes: Buffer.byteLength(outputText, 'utf8') }
      if (name === PROBES[1]) { try { const parsed = parseIndustryReasoningObject(result.output); const valid = validateIndustryResearchDesign(parsed); record.parserStatus = 'passed'; record.validatorStatus = 'passed'; record.targetKind = valid.targetKind; record.moduleQuestionKeys = Object.keys(valid.moduleQuestions).sort(); record.moduleQuestionCount = record.moduleQuestionKeys.length } catch { record.parserStatus = 'failed'; record.validatorStatus = 'failed' } }
      probes[name] = record
    } catch (error) { probes[name] = { ...base, ...safeError(error), durationMs: Date.now() - started } }
  }
  if (executor) {
    await run(PROBES[0], MINIMAL_TYPED_SCHEMA, normalizedA)
    const a = probes[PROBES[0]]
    if (a.semanticResultAvailable && JSON.stringify(normalizedA.schema) === JSON.stringify(MINIMAL_TYPED_SCHEMA) && typed.additions.length > 0) await run(PROBES[1], typed.copy, normalizedDesign)
  }
  const designUnchanged = sourceBefore === sourceAfter && sourceBefore === EXPECTED_DESIGN_FINGERPRINT
  const decision = decide({ probeA: probes[PROBES[0]] ?? { attempted: false, semanticResultAvailable: false }, probeB: probes[PROBES[1]], inferredCount: typed.additions.length, designFingerprintUnchanged: designUnchanged })
  const evidence = { taskId: TASK_ID, baseCommit: BASE_COMMIT, generatedAt, cliVersion: await cliVersion(), backend: 'codex-cli', model: 'gpt-5.6-luna', effort: 'medium', invocationMode: 'exec-stdin-json-output-read-only', diag004Acceptance: { acceptedTestEvidenceOnly: true, nativeProbeA: 'succeeded', nativeProbeB: 'succeeded', nativeProbeBFlags: '--output-schema + --json + -o', actualModelCallCount: 2, unrelatedAggregateFailure: 'tests/app/runtime/valuation-route.test.ts timing/environment-sensitive failure in npm run test:node and npm test' }, schemaDelta: { diag003FailingAdapterControl: { fingerprint: '6403f2b1cc6b62ac', bytes: 107, untypedConst: 'ok' }, diag004NativeGood: { bytes: 123, typedConst: 'ok', type: 'string' } }, actualRealCallCount: Object.values(probes).filter((probe: any) => probe.attempted).length, probes, design: { sourceFingerprintBefore: sourceBefore, sourceFingerprintAfter: sourceAfter, expectedFingerprint: EXPECTED_DESIGN_FINGERPRINT, sourceBytes, byteIdentical: sourceBefore === sourceAfter, inferredTypeAdditions: typed.additions, normalizedFingerprint: normalizedDesign.fingerprint, normalizedBytes: normalizedDesign.bytes }, classification: decision.classification, nextActionCategory: decision.nextActionCategory, mutation: { production: false, pcbCall: false, industrySkillInvocation: false, knowledge: false, sourceRaw: false, gateway: false, writer: false, researchReport: false, graph: false, productionModelSelection: false, codexAdapter: false, piExecutor: false, productionSchemaNormalizer: false }, privacy: { rawPrompts: false, rawStdout: false, rawStderr: false, rawJsonl: false, rawFinalOutput: false, completeSchemas: false, completeDesignOutput: false, credentials: false, authData: false, privatePaths: false, reasoningTraces: false }, maxRealModelCalls: MAX_REAL_MODEL_CALLS }
  await mkdir(resolve(repoRoot, 'tests/validation/evidence'), { recursive: true }); await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8'); console.log(JSON.stringify(evidence, null, 2))
}

if (process.argv[1]?.endsWith('codex-cli-schema-type-inference-isolation.ts')) void main()
