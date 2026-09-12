import { createHash } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { execFile as execFileCallback } from 'node:child_process'
import { promisify } from 'node:util'
import { resolve } from 'node:path'
import { createCodexCliLunaReasoningExecutor } from '../../app/pi/model-selection.ts'
import { normalizeCodexOutputSchema } from '../../plugins/reasoning/codex-cli/executor.ts'
import { ReasoningExecutorError, type ReasoningFailureClass } from '../../plugins/reasoning/errors.ts'
import type { ReasoningRequest, ReasoningResult } from '../../plugins/reasoning/contracts.ts'
import { parseIndustryReasoningObject, validateIndustryResearchDesign } from '../../skills/industry-research/skill.ts'
import { INDUSTRY_RESEARCH_DESIGN_CONTRACT } from '../../skills/industry-research/contracts.ts'
import { inferPrimitiveSchemaTypes as inferDiag005PrimitiveSchemaTypes, type InferredTypeAddition } from './codex-cli-schema-type-inference-isolation.ts'

export const TASK_ID = 'RHL-M3B-3B-DIAG-006-CODEX-STRICT-REQUIRED-SCHEMA-ISOLATION'
export const BASE_COMMIT = 'f7d9b4cfe840d6c1fd9cce3d4abf6b0df2e3e6c7'
export const EXPECTED_DESIGN_FINGERPRINT = '9854f93073c44d96'
export const MAX_REAL_MODEL_CALLS = 4
export const PROBES = ['TYPED_OPTIONAL_PROPERTY_CONTROL', 'TYPED_ALL_REQUIRED_CONTROL', 'ALL_REQUIRED_DESIGN_WITHOUT_TYPE_INFERENCE', 'ALL_REQUIRED_PLUS_TYPE_INFERRED_DESIGN'] as const
export type ProbeName = typeof PROBES[number]
export type FinalClassification = 'ALL_PROPERTIES_REQUIRED_TRANSFORMATION_PROVEN' | 'ALL_REQUIRED_PLUS_PRIMITIVE_TYPE_INFERENCE_PROVEN' | 'OPTIONAL_PROPERTIES_ACCEPTED_STRICT_REQUIRED_HYPOTHESIS_REJECTED' | 'STRICT_REQUIRED_CONTROL_DIFFERENTIAL_NOT_PROVEN' | 'ALL_REQUIRED_TRANSPORT_WORKS_SEMANTICS_INVALID' | 'ALL_REQUIRED_PLUS_TYPES_TRANSPORT_WORKS_SEMANTICS_INVALID' | 'STRICT_REQUIRED_AND_TYPE_INFERENCE_INSUFFICIENT' | 'DESIGN_CONTRACT_FINGERPRINT_CHANGED' | 'BACKEND_AUTH_OR_ACCOUNT_BLOCKED' | 'BACKEND_MODEL_UNAVAILABLE' | 'BACKEND_RATE_OR_QUOTA_BLOCKED' | 'BACKEND_SAFETY_OR_POLICY_BLOCKED' | 'BACKEND_TIMEOUT_OR_CANCELLED' | 'BACKEND_TRANSPORT_OR_SERVICE_FAILURE' | 'BACKEND_FAILURE_DIAGNOSTIC_INCONCLUSIVE' | 'BLOCKED_EXTERNAL_SETUP'
export type NextActionCategory = 'IMPLEMENT_NARROW_PRODUCTION_ALL_PROPERTIES_REQUIRED_NORMALIZATION' | 'IMPLEMENT_NARROW_PRODUCTION_STRICT_REQUIRED_AND_TYPE_INFERENCE' | 'REVIEW_NEXT_DESIGN_SCHEMA_DELTA' | 'REVIEW_NEXT_STRICT_SCHEMA_REQUIREMENT' | 'REVIEW_MODEL_SEMANTICS_WITH_TRANSPORT_PROVEN' | 'REVIEW_BACKEND_RUNTIME_FAILURE' | 'EXTERNAL_SETUP_REQUIRED'
export const CAPABILITIES = { maxContextTokens: 128_000, maxOutputTokens: 16_384, structuredOutputSupport: true, maxConcurrency: 1 } as const
export const TYPED_OPTIONAL_PROPERTY_CONTROL = Object.freeze({ type: 'object', additionalProperties: false, properties: { status: { type: 'string', const: 'ok' }, note: { type: 'string' } }, required: ['status'] })
export const TYPED_ALL_REQUIRED_CONTROL = Object.freeze({ type: 'object', additionalProperties: false, properties: { status: { type: 'string', const: 'ok' }, note: { type: 'string' } }, required: ['status', 'note'] })
const repoRoot = resolve(import.meta.dirname, '../..')
const evidencePath = resolve(repoRoot, 'tests/validation/evidence/RHL_M3B_CODEX_CLI_STRICT_REQUIRED_SCHEMA_ISOLATION.json')
const fingerprint = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 16)
const outputHash = (value: string) => createHash('sha256').update(value).digest('hex')
const jsonBytes = (value: unknown) => Buffer.byteLength(JSON.stringify(value), 'utf8')
type SchemaRecord = Record<string, unknown>
export interface RequirednessChange { path: string; propertyKeys: string[] }

const isRecord = (value: unknown): value is SchemaRecord => value !== null && typeof value === 'object' && !Array.isArray(value)
const schemaChildren = (node: SchemaRecord, path: string): Array<[string, unknown, string]> => {
  const children: Array<[string, unknown, string]> = []
  if (isRecord(node.properties)) for (const [key, child] of Object.entries(node.properties)) if (isRecord(child)) children.push(['property', child, `${path}.properties.${key}`])
  if (isRecord(node.items)) children.push(['items', node.items, `${path}.items`])
  if (isRecord(node.additionalProperties)) children.push(['additionalProperties', node.additionalProperties, `${path}.additionalProperties`])
  for (const key of ['oneOf', 'anyOf']) if (Array.isArray(node[key])) for (const [index, child] of (node[key] as unknown[]).entries()) if (isRecord(child)) children.push([key, child, `${path}.${key}[${index}]`])
  return children
}

export function makeAllObjectPropertiesRequired(value: unknown): { copy: unknown; changes: RequirednessChange[] } {
  const changes: RequirednessChange[] = []
  const visit = (node: SchemaRecord, path: string): SchemaRecord => {
    const result: SchemaRecord = { ...node }
    if (isRecord(result.properties)) {
      const keys = Object.keys(result.properties)
      if (JSON.stringify(result.required) !== JSON.stringify(keys)) changes.push({ path, propertyKeys: keys })
      result.required = keys
      result.properties = Object.fromEntries(Object.entries(result.properties).map(([key, child]) => [key, isRecord(child) ? visit(child, `${path}.properties.${key}`) : child]))
    }
    for (const [position, child, childPath] of schemaChildren(result, path)) {
      if (position === 'property') continue
      const replacement = visit(child as SchemaRecord, childPath)
      if (position === 'items' || position === 'additionalProperties') result[position] = replacement
      else result[position] = (result[position] as unknown[]).map((candidate, index) => index === Number(childPath.match(/\[(\d+)\]$/)?.[1]) ? replacement : candidate)
    }
    return result
  }
  return { copy: isRecord(value) ? visit(value, '$') : value, changes }
}

export const inferPrimitiveSchemaTypes = inferDiag005PrimitiveSchemaTypes
export type { InferredTypeAddition }
export function classifyFailure(error: unknown): FinalClassification {
  if (!(error instanceof ReasoningExecutorError)) return 'BACKEND_FAILURE_DIAGNOSTIC_INCONCLUSIVE'
  const map: Record<ReasoningFailureClass, FinalClassification> = { authentication_or_account: 'BACKEND_AUTH_OR_ACCOUNT_BLOCKED', model_unavailable: 'BACKEND_MODEL_UNAVAILABLE', rate_limit_or_quota: 'BACKEND_RATE_OR_QUOTA_BLOCKED', safety_or_policy: 'BACKEND_SAFETY_OR_POLICY_BLOCKED', timeout_or_cancel: 'BACKEND_TIMEOUT_OR_CANCELLED', transport_or_service: 'BACKEND_TRANSPORT_OR_SERVICE_FAILURE', structured_output_configuration: 'BACKEND_FAILURE_DIAGNOSTIC_INCONCLUSIVE', unknown_nonzero_exit: 'BACKEND_FAILURE_DIAGNOSTIC_INCONCLUSIVE' }
  return map[error.failureClass ?? 'unknown_nonzero_exit']
}
const failureClassification = (failureClass: string): FinalClassification => ({ authentication_or_account: 'BACKEND_AUTH_OR_ACCOUNT_BLOCKED', model_unavailable: 'BACKEND_MODEL_UNAVAILABLE', rate_limit_or_quota: 'BACKEND_RATE_OR_QUOTA_BLOCKED', safety_or_policy: 'BACKEND_SAFETY_OR_POLICY_BLOCKED', timeout_or_cancel: 'BACKEND_TIMEOUT_OR_CANCELLED', transport_or_service: 'BACKEND_TRANSPORT_OR_SERVICE_FAILURE' } as Record<string, FinalClassification>)[failureClass] ?? 'BACKEND_FAILURE_DIAGNOSTIC_INCONCLUSIVE'

export interface ProbeState { attempted: boolean; semanticResultAvailable: boolean; validatorStatus?: string; safeFailureClass?: string | null }
export function decide(input: { probeA: ProbeState; probeB?: ProbeState; probeC?: ProbeState; probeD?: ProbeState; designFingerprintUnchanged: boolean }): { classification: FinalClassification; nextActionCategory: NextActionCategory } {
  if (!input.designFingerprintUnchanged) return { classification: 'DESIGN_CONTRACT_FINGERPRINT_CHANGED', nextActionCategory: 'REVIEW_BACKEND_RUNTIME_FAILURE' }
  const backend = (probe: ProbeState | undefined) => probe?.safeFailureClass && probe.safeFailureClass !== 'structured_output_configuration' && probe.safeFailureClass !== 'unknown_nonzero_exit'
  if (!input.probeA.attempted || backend(input.probeA)) return { classification: !input.probeA.attempted ? 'BACKEND_FAILURE_DIAGNOSTIC_INCONCLUSIVE' : failureClassification(input.probeA.safeFailureClass!), nextActionCategory: 'REVIEW_BACKEND_RUNTIME_FAILURE' }
  if (input.probeA.semanticResultAvailable) return { classification: 'OPTIONAL_PROPERTIES_ACCEPTED_STRICT_REQUIRED_HYPOTHESIS_REJECTED', nextActionCategory: 'REVIEW_NEXT_DESIGN_SCHEMA_DELTA' }
  if (!input.probeB?.attempted || backend(input.probeB)) return { classification: 'STRICT_REQUIRED_CONTROL_DIFFERENTIAL_NOT_PROVEN', nextActionCategory: 'REVIEW_NEXT_STRICT_SCHEMA_REQUIREMENT' }
  if (!input.probeB.semanticResultAvailable) return { classification: 'STRICT_REQUIRED_CONTROL_DIFFERENTIAL_NOT_PROVEN', nextActionCategory: 'REVIEW_NEXT_STRICT_SCHEMA_REQUIREMENT' }
  if (input.probeC?.semanticResultAvailable && input.probeC.validatorStatus === 'passed') return { classification: 'ALL_PROPERTIES_REQUIRED_TRANSFORMATION_PROVEN', nextActionCategory: 'IMPLEMENT_NARROW_PRODUCTION_ALL_PROPERTIES_REQUIRED_NORMALIZATION' }
  if (input.probeC?.semanticResultAvailable) return { classification: 'ALL_REQUIRED_TRANSPORT_WORKS_SEMANTICS_INVALID', nextActionCategory: 'REVIEW_MODEL_SEMANTICS_WITH_TRANSPORT_PROVEN' }
  if (backend(input.probeC)) return { classification: failureClassification(input.probeC!.safeFailureClass!), nextActionCategory: 'REVIEW_BACKEND_RUNTIME_FAILURE' }
  if (input.probeD?.semanticResultAvailable && input.probeD.validatorStatus === 'passed') return { classification: 'ALL_REQUIRED_PLUS_PRIMITIVE_TYPE_INFERENCE_PROVEN', nextActionCategory: 'IMPLEMENT_NARROW_PRODUCTION_STRICT_REQUIRED_AND_TYPE_INFERENCE' }
  if (input.probeD?.semanticResultAvailable) return { classification: 'ALL_REQUIRED_PLUS_TYPES_TRANSPORT_WORKS_SEMANTICS_INVALID', nextActionCategory: 'REVIEW_MODEL_SEMANTICS_WITH_TRANSPORT_PROVEN' }
  return { classification: 'STRICT_REQUIRED_AND_TYPE_INFERENCE_INSUFFICIENT', nextActionCategory: 'REVIEW_NEXT_STRICT_SCHEMA_REQUIREMENT' }
}

function safeError(error: unknown): Record<string, unknown> { const e = error instanceof ReasoningExecutorError; return { processStarted: e ? error.processStarted ?? false : false, exitState: e ? error.exitState ?? 'not_started' : 'not_started', semanticResultAvailable: false, safeReasoningCode: e ? error.code : 'reasoning_execution_failed', safeFailureClass: e ? error.failureClass ?? null : null, structuredEventType: e ? error.structuredEventType ?? null : null, safeErrorCode: e ? error.safeErrorCode ?? null : null } }
async function cliVersion(): Promise<string | null> { try { const result = await promisify(execFileCallback)('codex', ['--version'], { windowsHide: true, maxBuffer: 8_000 }); return result.stdout.trim().split(/\r?\n/)[0]?.slice(0, 128) ?? null } catch { return null } }
const requestFor = (name: ProbeName, contract: unknown): ReasoningRequest => ({ operation: 'industry_research_design', instruction: name === PROBES[0] ? 'Return a harmless schema-conforming object with status ok; omit the optional note field.' : name === PROBES[1] ? 'Return a harmless schema-conforming object with status ok and a short note.' : 'Produce one generic research-design-shaped object satisfying the supplied schema, using neutral placeholder content.', input: { marker: 'neutral-schema-diagnostic' }, outputContract: contract, metadata: { executionId: `diag-006-${name}` } })

async function main(): Promise<void> {
  const generatedAt = new Date().toISOString(); const sourceBefore = fingerprint(INDUSTRY_RESEARCH_DESIGN_CONTRACT); const sourceBytes = jsonBytes(INDUSTRY_RESEARCH_DESIGN_CONTRACT)
  const sourceSerialized = JSON.stringify(INDUSTRY_RESEARCH_DESIGN_CONTRACT); const required = makeAllObjectPropertiesRequired(INDUSTRY_RESEARCH_DESIGN_CONTRACT)
  const sourceAfter = fingerprint(INDUSTRY_RESEARCH_DESIGN_CONTRACT); const normalizedControls = { optional: normalizeCodexOutputSchema(TYPED_OPTIONAL_PROPERTY_CONTROL), allRequired: normalizeCodexOutputSchema(TYPED_ALL_REQUIRED_CONTROL) }; const normalizedC = normalizeCodexOutputSchema(required.copy); let normalizedD: { fingerprint: string; bytes: number } | undefined; let designForD: { copy: unknown } | undefined; let primitiveTypeAdditions: InferredTypeAddition[] = []
  const probes: Record<string, any> = {}; let executor: Awaited<ReturnType<typeof createCodexCliLunaReasoningExecutor>> | undefined
  const run = async (name: ProbeName, contract: unknown, normalized: { fingerprint: string; bytes: number }) => { const started = Date.now(); const base: any = { attempted: true, processStarted: false, exitState: 'not_started', semanticResultAvailable: false, safeReasoningCode: null, safeFailureClass: null, structuredEventType: null, safeErrorCode: null, durationMs: 0, normalizedSchemaFingerprint: normalized.fingerprint, normalizedSchemaBytes: normalized.bytes, outputHash: null, outputBytes: 0, parserStatus: 'not_run', validatorStatus: 'not_run' }; try { const result: ReasoningResult = await executor!.execute(requestFor(name, contract)); const text = result.rawOutput ?? JSON.stringify(result.output); base.processStarted = true; base.exitState = 'normal_exit'; base.semanticResultAvailable = true; base.outputHash = outputHash(text); base.outputBytes = Buffer.byteLength(text, 'utf8'); if (name === PROBES[0] || name === PROBES[1]) { const out = result.output as any; base.validatorStatus = typeof out?.status === 'string' && (name === PROBES[0] || typeof out?.note === 'string') && Object.keys(out).every((key) => key === 'status' || key === 'note') ? 'passed' : 'failed'; base.parserStatus = base.validatorStatus } else { try { const parsed = parseIndustryReasoningObject(result.output); const valid = validateIndustryResearchDesign(parsed); base.parserStatus = 'passed'; base.validatorStatus = 'passed'; base.targetKind = valid.targetKind; base.moduleQuestionCount = Object.keys(valid.moduleQuestions).length } catch { base.parserStatus = 'failed'; base.validatorStatus = 'failed' } } } catch (error) { Object.assign(base, safeError(error)) } base.durationMs = Date.now() - started; probes[name] = base }
  try { executor = await createCodexCliLunaReasoningExecutor({ capabilities: CAPABILITIES, timeoutMs: 900_000, maxOutputChars: 400_000 }) } catch (error) { probes[PROBES[0]] = { attempted: false, ...safeError(error), durationMs: 0, normalizedSchemaFingerprint: normalizedControls.optional.fingerprint, normalizedSchemaBytes: normalizedControls.optional.bytes } }
  if (executor) { await run(PROBES[0], TYPED_OPTIONAL_PROPERTY_CONTROL, normalizedControls.optional); if (!probes[PROBES[0]].semanticResultAvailable) { await run(PROBES[1], TYPED_ALL_REQUIRED_CONTROL, normalizedControls.allRequired); if (probes[PROBES[1]].semanticResultAvailable) { await run(PROBES[2], required.copy, normalizedC); if (!probes[PROBES[2]].semanticResultAvailable && ['structured_output_configuration', 'unknown_nonzero_exit'].includes(probes[PROBES[2]].safeFailureClass)) { const typedForD = inferPrimitiveSchemaTypes(INDUSTRY_RESEARCH_DESIGN_CONTRACT); primitiveTypeAdditions = typedForD.additions; designForD = makeAllObjectPropertiesRequired(typedForD.copy); normalizedD = normalizeCodexOutputSchema(designForD.copy); await run(PROBES[3], designForD.copy, normalizedD) } } } }
  const decision = decide({ probeA: probes[PROBES[0]] ?? { attempted: false, semanticResultAvailable: false }, probeB: probes[PROBES[1]], probeC: probes[PROBES[2]], probeD: probes[PROBES[3]], designFingerprintUnchanged: sourceBefore === sourceAfter && sourceBefore === EXPECTED_DESIGN_FINGERPRINT })
  const evidence = { taskId: TASK_ID, baseCommit: BASE_COMMIT, generatedAt, cliVersion: await cliVersion(), backend: 'codex-cli', model: 'gpt-5.6-luna', effort: 'medium', invocationMode: 'production-codex-pi-adapter-exec-stdin-json-output-read-only', diag005Acceptance: { acceptedTestEvidenceOnly: true, baseCommit: 'f7d9b4cfe840d6c1fd9cce3d4abf6b0df2e3e6c7', adapterExplicitTypedMinimal: 'succeeded', typeInferredDesign: 'process_started_unknown_nonzero_exit', actualRealCallCount: 2, normalizedFingerprint: '66ca1308a52ea98d', normalizedBytes: 2159, authoritativeSourceFingerprint: EXPECTED_DESIGN_FINGERPRINT, primitiveTypePaths: ['$.properties.targetKind', '$.properties.knownGaps.items.properties.module', '$.properties.verificationCandidates.items.properties.kind'], aggregateFailuresEvidenceOnly: true }, actualRealCallCount: Object.values(probes).filter((p: any) => p.attempted).length, probes, controls: { optional: { required: ['status'], normalizedFingerprint: normalizedControls.optional.fingerprint, normalizedBytes: normalizedControls.optional.bytes }, allRequired: { required: ['status', 'note'], normalizedFingerprint: normalizedControls.allRequired.fingerprint, normalizedBytes: normalizedControls.allRequired.bytes }, structurallyIdenticalExceptRequired: true }, design: { sourceFingerprintBefore: sourceBefore, sourceFingerprintAfter: sourceAfter, expectedFingerprint: EXPECTED_DESIGN_FINGERPRINT, sourceBytes, byteIdentical: sourceSerialized === JSON.stringify(INDUSTRY_RESEARCH_DESIGN_CONTRACT), requirednessChanges: required.changes, requirednessChangeCount: required.changes.length, primitiveTypeAdditions, normalizedWithoutTypeInference: { fingerprint: normalizedC.fingerprint, bytes: normalizedC.bytes }, ...(normalizedD ? { normalizedWithTypeInference: { fingerprint: normalizedD.fingerprint, bytes: normalizedD.bytes } } : {}) }, classification: decision.classification, nextActionCategory: decision.nextActionCategory, mutation: { production: false, pcbCall: false, industrySkillInvocation: false, knowledge: false, sourceRaw: false, gateway: false, writer: false, researchReport: false, graph: false, productionModelSelection: false, codexAdapter: false, piExecutor: false, productionSchemaNormalizer: false }, privacy: { rawPrompts: false, rawStdout: false, rawStderr: false, rawJsonl: false, rawFinalOutput: false, completeSchemas: false, completeDesignOutput: false, credentials: false, authData: false, privatePaths: false, reasoningTraces: false }, maxRealModelCalls: MAX_REAL_MODEL_CALLS }
  await mkdir(resolve(repoRoot, 'tests/validation/evidence'), { recursive: true }); await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8'); console.log(JSON.stringify(evidence, null, 2))
}
if (process.argv[1]?.endsWith('codex-cli-strict-required-schema-isolation.ts')) void main().catch((error) => { console.error(error); process.exitCode = 1 })
