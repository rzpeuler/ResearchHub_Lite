import { createHash } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createIndustryProductionReasoningExecutor } from '../../app/pi/model-selection.ts'
import { normalizeCodexOutputSchema } from '../../plugins/reasoning/codex-cli/executor.ts'
import { ReasoningExecutorError } from '../../plugins/reasoning/errors.ts'
import { createIndustryModuleResultContract, createIndustrySynthesisContract } from '../../skills/industry-research/contracts.ts'
import { parseIndustryReasoningObject, validateCrossModuleSynthesis, validateIndustryModuleResult } from '../../skills/industry-research/skill.ts'
import type { ReasoningRequest } from '../../plugins/reasoning/contracts.ts'

export const TASK_ID = 'RHL-M3B-3B-FIX-015-CODEX-PROVEN-SCHEMA-COMPATIBILITY'
export const BASE_COMMIT = '9e6601cd11c40093ffff71c473cf1f29b6e0dfe5'
export const CLASSIFICATIONS = ['MODULE_AND_SYNTHESIS_TRANSPORT_VALIDATED', 'MODULE_TRANSPORT_STILL_BLOCKED', 'MODULE_SEMANTIC_OUTPUT_INVALID', 'SYNTHESIS_TRANSPORT_BLOCKED', 'SYNTHESIS_SEMANTIC_OUTPUT_INVALID', 'RUNTIME_CONFIGURATION_MISMATCH', 'BACKEND_AUTH_OR_ACCOUNT_BLOCKED', 'BACKEND_MODEL_UNAVAILABLE', 'BACKEND_RATE_OR_QUOTA_BLOCKED', 'BACKEND_SAFETY_OR_POLICY_BLOCKED', 'BACKEND_TIMEOUT_OR_CANCELLED', 'BACKEND_TRANSPORT_OR_SERVICE_FAILURE', 'BACKEND_FAILURE_DIAGNOSTIC_INCONCLUSIVE'] as const
export type Classification = typeof CLASSIFICATIONS[number]
const capabilities = { maxContextTokens: 128_000, maxOutputTokens: 16_384, structuredOutputSupport: true, maxConcurrency: 1 } as const
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 16)
const bytes = (value: unknown) => Buffer.byteLength(JSON.stringify(value), 'utf8')
const safe = (error: unknown) => { const e = error instanceof ReasoningExecutorError ? error : undefined; return { code: e?.code ?? 'reasoning_execution_failed', failureClass: e?.failureClass ?? null, processStarted: e?.processStarted ?? false, exitState: e?.exitState ?? 'unknown', safeErrorCode: e?.safeErrorCode ?? null } }
const runtimeMatches = (meta: any) => meta?.backend === 'codex-cli' && meta?.requestedModel === 'gpt-5.6-luna' && meta?.requestedReasoningEffort === 'medium' && meta?.invocationMode === 'exec-stdin-json-output-read-only' && meta?.structuredOutputEnabled === true
function failureClassification(error: unknown): Classification { const f = error instanceof ReasoningExecutorError ? error.failureClass : undefined; return f === 'authentication_or_account' ? 'BACKEND_AUTH_OR_ACCOUNT_BLOCKED' : f === 'model_unavailable' ? 'BACKEND_MODEL_UNAVAILABLE' : f === 'rate_limit_or_quota' ? 'BACKEND_RATE_OR_QUOTA_BLOCKED' : f === 'safety_or_policy' ? 'BACKEND_SAFETY_OR_POLICY_BLOCKED' : f === 'timeout_or_cancel' ? 'BACKEND_TIMEOUT_OR_CANCELLED' : f === 'transport_or_service' ? 'BACKEND_TRANSPORT_OR_SERVICE_FAILURE' : 'BACKEND_FAILURE_DIAGNOSTIC_INCONCLUSIVE' }
export function classifyCompatibility(input: { moduleSemantic: boolean; moduleValid: boolean; synthesisAttempted: boolean; synthesisSemantic: boolean; synthesisValid: boolean; error?: unknown; runtimeMatches: boolean }): Classification {
  if (!input.runtimeMatches) return 'RUNTIME_CONFIGURATION_MISMATCH'
  if (input.error && !input.moduleSemantic && !input.synthesisAttempted) return failureClassification(input.error)
  if (!input.moduleSemantic) return 'MODULE_TRANSPORT_STILL_BLOCKED'
  if (!input.moduleValid) return 'MODULE_SEMANTIC_OUTPUT_INVALID'
  if (!input.synthesisAttempted) return 'SYNTHESIS_TRANSPORT_BLOCKED'
  if (!input.synthesisSemantic) return 'SYNTHESIS_TRANSPORT_BLOCKED'
  if (!input.synthesisValid) return 'SYNTHESIS_SEMANTIC_OUTPUT_INVALID'
  return 'MODULE_AND_SYNTHESIS_TRANSPORT_VALIDATED'
}
function structural(schema: unknown) {
  const counts = { untypedPrimitiveConst: 0, qualifyingDisjointKindOneOf: 0, redundantRequiredOnlyAnyOf: 0, emptyExactStructuredValueScalarLeaves: 0 }
  const walk = (value: any, path: string) => { if (Array.isArray(value)) return value.forEach((x, i) => walk(x, `${path}[${i}]`)); if (!value || typeof value !== 'object') return
    if (Object.prototype.hasOwnProperty.call(value, 'const') && value.type === undefined && (value === null || value.const === null || typeof value.const === 'string' || typeof value.const === 'boolean' || typeof value.const === 'number')) counts.untypedPrimitiveConst++
    if (Array.isArray(value.oneOf) && value.oneOf.length > 0 && value.oneOf.every((x: any) => x?.type === 'object' && x.additionalProperties === false && Array.isArray(x.required) && x.required.includes('kind') && Object.prototype.hasOwnProperty.call(x.properties?.kind ?? {}, 'const'))) counts.qualifyingDisjointKindOneOf++
    if (Array.isArray(value.anyOf) && value.anyOf.length > 0 && value.anyOf.every((x: any) => x && typeof x === 'object' && !Array.isArray(x) && Object.keys(x).length === 1 && Object.keys(x)[0] === 'required')) counts.redundantRequiredOnlyAnyOf++
    if (path.endsWith('.properties.structuredValue.properties.value') && Object.keys(value).length === 0) counts.emptyExactStructuredValueScalarLeaves++
    Object.entries(value).forEach(([key, child]) => walk(child, `${path}.${key}`))
  }; walk(schema, '$'); return counts
}
const moduleInstruction = 'Return a valid unavailable industry module result for a harmless generic neutral target with zero evidence. Use empty evidenceIds and proposals, one bounded actionable gap, and bounded reportMaterial. Do not invent facts.'
const synthesisInstruction = 'Return a valid zero-evidence cross-module synthesis for a harmless generic neutral target. Use empty evidenceIds, proposals, gaps, alternativeViews, and bounded reportMaterial. Do not invent facts.'
const neutral = { target: { name: 'generic fictional industry' }, evidence: [], existingKnowledge: [], localReferences: [] }
async function main(): Promise<void> {
  const moduleSource = createIndustryModuleResultContract('industry_definition', [])
  const moduleTransport = normalizeCodexOutputSchema(moduleSource)
  const synthesisSource = createIndustrySynthesisContract([], [], [])
  const synthesisTransport = normalizeCodexOutputSchema(synthesisSource)
  const runtime: any = { backend: 'codex-cli', model: 'gpt-5.6-luna', effort: 'medium', invocationMode: 'exec-stdin-json-output-read-only', structuredOutputEnabled: true }
  const probes: any[] = []; let modelCallCount = 0; let moduleSemantic = false; let moduleValid = false; let synthesisAttempted = false; let synthesisSemantic = false; let synthesisValid = false; let terminalError: unknown
  try {
    const executor = await createIndustryProductionReasoningExecutor({ capabilities, timeoutMs: 900_000, maxOutputChars: 400_000 })
    Object.assign(runtime, executor.runtimeMetadata())
    if (!runtimeMatches(runtime)) throw new ReasoningExecutorError('reasoning_configuration_invalid', 'Production Codex runtime metadata mismatch')
    const moduleRequest: ReasoningRequest = { operation: 'industry_module_analysis', instruction: moduleInstruction, input: { module: 'industry_definition', ...neutral }, outputContract: moduleSource, metadata: { executionId: 'fix-015-module' } }
    modelCallCount++; try { const result = await executor.execute(moduleRequest); moduleSemantic = true; const parsed = parseIndustryReasoningObject(result.output); try { const validated = validateIndustryModuleResult(parsed, 'industry_definition', []); moduleValid = true; probes.push({ operation: moduleRequest.operation, semanticOutput: true, parserStatus: 'passed', validatorStatus: 'passed', returnedStatus: validated.status }) } catch (error) { probes.push({ operation: moduleRequest.operation, semanticOutput: true, parserStatus: 'passed', validatorStatus: 'failed', validationCode: safe(error).code }) } } catch (error) { terminalError = error; probes.push({ operation: moduleRequest.operation, semanticOutput: false, ...safe(error) }) }
    if (moduleSemantic && moduleValid) {
      synthesisAttempted = true
      const synthesisRequest: ReasoningRequest = { operation: 'industry_cross_module_synthesis', instruction: synthesisInstruction, input: { target: neutral.target, evidence: [], modules: [], proposals: [], relations: [] }, outputContract: synthesisSource, metadata: { executionId: 'fix-015-synthesis' } }
      modelCallCount++; try { const result = await executor.execute(synthesisRequest); synthesisSemantic = true; const parsed = parseIndustryReasoningObject(result.output); try { validateCrossModuleSynthesis(parsed, [], [], []); synthesisValid = true; probes.push({ operation: synthesisRequest.operation, semanticOutput: true, parserStatus: 'passed', validatorStatus: 'passed' }) } catch (error) { probes.push({ operation: synthesisRequest.operation, semanticOutput: true, parserStatus: 'passed', validatorStatus: 'failed', validationCode: safe(error).code }) } } catch (error) { terminalError = error; probes.push({ operation: synthesisRequest.operation, semanticOutput: false, ...safe(error) }) }
    }
  } catch (error) { terminalError = error }
  const classification = classifyCompatibility({ moduleSemantic, moduleValid, synthesisAttempted, synthesisSemantic, synthesisValid, error: terminalError, runtimeMatches: runtimeMatches(runtime) })
  const evidence = { taskId: TASK_ID, baseCommit: BASE_COMMIT, generatedAt: new Date().toISOString(), diag014Acceptance: { baseCommit: BASE_COMMIT, aggregateClassification: 'MODULE_TRANSPORT_COMPATIBILITY_SET_PROVEN', nextActionCategory: 'IMPLEMENT_PROVEN_CODEX_SCHEMA_COMPATIBILITY_SET', harnessCaveat: 'Ordinal 5 was an invalid TEST-harness argument-order attempt and was discarded; retained Probe E ordinal 6 executed once with no production mutation.' }, approvedTransformations: ['primitive const type inference', 'guarded strict unique kind oneOf to anyOf', 'redundant required-only anyOf removal', 'exact structuredValue.value scalar-leaf normalization'], runtimeMetadata: { backend: runtime.backend ?? null, model: runtime.model ?? null, reasoningEffort: runtime.effort ?? runtime.requestedReasoningEffort ?? null, invocationMode: runtime.invocationMode ?? null, structuredOutputEnabled: runtime.structuredOutputEnabled ?? null }, contracts: { module: { sourceFingerprint: hash(moduleSource), sourceBytes: bytes(moduleSource), normalizedFingerprint: moduleTransport.fingerprint, normalizedBytes: moduleTransport.bytes, counters: { primitiveConstTypeCount: moduleTransport.primitiveConstTypeCount, guardedKindOneOfConversionCount: moduleTransport.guardedKindOneOfConversionCount, redundantRequiredOnlyAnyOfRemovalCount: moduleTransport.redundantRequiredOnlyAnyOfRemovalCount, structuredValueScalarNormalizationCount: moduleTransport.structuredValueScalarNormalizationCount }, unresolved: structural(moduleTransport.schema) }, synthesis: { sourceFingerprint: hash(synthesisSource), sourceBytes: bytes(synthesisSource), normalizedFingerprint: synthesisTransport.fingerprint, normalizedBytes: synthesisTransport.bytes, unresolved: structural(synthesisTransport.schema) } }, probes, actualModelCallCount: modelCallCount, finalClassification: classification, livePcbModuleDiagnosticAuthorized: classification === 'MODULE_AND_SYNTHESIS_TRANSPORT_VALIDATED', mutation: { acquisitionCalls: 0, knowledgeMutation: false, gatewaySubmitCount: 0, writerCommitCount: 0, productionCodeMutation: true, sourceContractsMutated: false }, privacy: { rawPrompts: false, fullInputs: false, fullSchemas: false, modelOutputs: false, stdout: false, stderr: false, jsonl: false, credentials: false, authData: false, privateAbsolutePaths: false, reasoningTraces: false } }
  const path = resolve(import.meta.dirname, 'evidence/RHL_M3B_CODEX_PRODUCTION_INDUSTRY_SCHEMA_COMPATIBILITY.json'); await mkdir(resolve(path, '..'), { recursive: true }); await writeFile(path, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8'); console.log(JSON.stringify(evidence, null, 2)); if (classification !== 'MODULE_AND_SYNTHESIS_TRANSPORT_VALIDATED') process.exitCode = 1
}
if (process.argv[1]?.endsWith('codex-production-industry-schema-compatibility.ts')) await main()
