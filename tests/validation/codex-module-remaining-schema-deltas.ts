import { createHash } from 'node:crypto'
import { execFile as execFileCallback } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { promisify } from 'node:util'
import { resolve } from 'node:path'
import { createIndustryModuleResultContract, INDUSTRY_RESEARCH_DESIGN_CONTRACT } from '../../skills/industry-research/contracts.ts'
import { parseIndustryReasoningObject, validateIndustryModuleResult } from '../../skills/industry-research/skill.ts'
import { createIndustryProductionReasoningExecutor } from '../../app/pi/model-selection.ts'
import { normalizeCodexOutputSchema } from '../../plugins/reasoning/codex-cli/executor.ts'
import { ReasoningExecutorError } from '../../plugins/reasoning/errors.ts'
import type { ReasoningRequest, ReasoningResult } from '../../plugins/reasoning/contracts.ts'

export const TASK_ID = 'RHL-M3B-3B-DIAG-014-CODEX-MODULE-REMAINING-SCHEMA-DELTAS'
export const BASE_COMMIT = 'a2d8eb6f5d4a6a93df0e413e9b11fa8cc0bc87d2'
export const MODULE = 'industry_definition' as const
export const MAX_REAL_MODEL_CALLS = 6
export const CAPABILITIES = { maxContextTokens: 128_000, maxOutputTokens: 16_384, structuredOutputSupport: true, maxConcurrency: 1 } as const
export const PROBE_NAMES = ['REQUIRED_ONLY_ANYOF_MINIMAL', 'REQUIRED_ONLY_ANYOF_REMOVED_MINIMAL', 'EMPTY_SCHEMA_LEAF_MINIMAL', 'FINITE_SCALAR_ANYOF_MINIMAL', 'FULL_MODULE_ALL_INDEPENDENTLY_PROVEN_DELTAS'] as const
export type ProbeName = typeof PROBE_NAMES[number]
export type DifferentialResult = 'proven' | 'accepted_by_backend' | 'inconclusive' | 'not_run'
export type Classification = 'MODULE_TRANSPORT_COMPATIBILITY_SET_PROVEN' | 'MODULE_TRANSPORT_WORKS_SEMANTICS_INVALID' | 'REMAINING_MODULE_SCHEMA_DELTA_UNRESOLVED' | 'BACKEND_AUTH_OR_ACCOUNT_BLOCKED' | 'BACKEND_MODEL_UNAVAILABLE' | 'BACKEND_RATE_OR_QUOTA_BLOCKED' | 'BACKEND_SAFETY_OR_POLICY_BLOCKED' | 'BACKEND_TIMEOUT_OR_CANCELLED' | 'BACKEND_TRANSPORT_OR_SERVICE_FAILURE' | 'BACKEND_FAILURE_DIAGNOSTIC_INCONCLUSIVE' | 'RUNTIME_CONFIGURATION_MISMATCH'
export type NextAction = 'IMPLEMENT_PROVEN_CODEX_SCHEMA_COMPATIBILITY_SET' | 'REVIEW_MODULE_SEMANTICS_WITH_TRANSPORT_PROVEN' | 'DIAGNOSE_REMAINING_MODULE_SCHEMA_SHAPE_BY_REDUCTION' | 'REVIEW_BACKEND_RUNTIME_FAILURE' | 'REVIEW_RUNTIME_CONFIGURATION'
type Obj = Record<string, any>
export interface StructuralCounts { untypedEnums: number; nestedArrays: number; descriptions: number; anyOfLocations: Array<{ path: string; branchShapes: string[] }>; oneOf: number; objectDepth: number; arrayDepth: number; emptySchemaCount: number; enumCardinalities: number[]; constLocations: string[]; additionalPropertiesValues: Array<boolean | 'absent' | 'schema'>; itemsNestingDepth: number; maxPropertyCount: number; untypedPrimitiveConst: number; }
export interface ProbeOutcome { name: ProbeName; actualCallOrdinal: number; sourceContractFingerprint: string; sourceContractBytes: number; transformedContractFingerprint: string; transformedContractBytes: number; productionNormalizedFingerprint: string; productionNormalizedBytes: number; processStarted: boolean; exitState: string; semanticResultAvailable: boolean; safeFailureClass: string | null; safeReasoningCode: string | null; safeErrorCode: string | null; parserStatus: string; validatorStatus: string; returnedSemanticStatus: string | null; structuralCounts: StructuralCounts; }

const json = (v: unknown) => JSON.stringify(v)
const fingerprint = (v: unknown) => createHash('sha256').update(json(v)).digest('hex').slice(0, 16)
const size = (v: unknown) => Buffer.byteLength(json(v), 'utf8')
const clone = <T>(v: T): T => JSON.parse(json(v)) as T
const pathJoin = (path: string, key: string | number) => `${path}/${String(key).replaceAll('~', '~0').replaceAll('/', '~1')}`

/** DIAG-013-compatible TEST-only helper: primitive consts only. */
export function inferPrimitiveConstTypes<T>(schema: T): T {
  const walk = (v: any): any => {
    if (Array.isArray(v)) return v.map(walk)
    if (!v || typeof v !== 'object') return v
    const out: Obj = Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)]))
    if (!('type' in out) && Object.prototype.hasOwnProperty.call(out, 'const')) {
      if (typeof out.const === 'string') out.type = 'string'
      else if (typeof out.const === 'boolean') out.type = 'boolean'
      else if (typeof out.const === 'number' && Number.isFinite(out.const)) out.type = Number.isInteger(out.const) ? 'integer' : 'number'
      else if (out.const === null) out.type = 'null'
    }
    return out
  }
  return walk(clone(schema))
}

function isStrictDisjointVariant(v: any): boolean { return !!v && v.type === 'object' && v.additionalProperties === false && Array.isArray(v.required) && v.required.includes('kind') && !!v.properties?.kind && Object.prototype.hasOwnProperty.call(v.properties.kind, 'const') && ['string', 'boolean', 'number'].includes(typeof v.properties.kind.const) }
/** DIAG-013-compatible TEST-only helper: guarded strict disjoint kind variants only. */
export function convertDisjointConstOneOfToAnyOf<T>(schema: T): T {
  const walk = (v: any): any => {
    if (Array.isArray(v)) return v.map(walk)
    if (!v || typeof v !== 'object') return v
    const out: Obj = Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)]))
    if (Array.isArray(out.oneOf) && out.oneOf.length > 0 && out.oneOf.every(isStrictDisjointVariant)) {
      const values = out.oneOf.map((x: any) => x.properties.kind.const)
      if (new Set(values).size === values.length && values.every((x: any) => ['entity', 'relation', 'claim'].includes(x) || ['a', 'b'].includes(x))) { out.anyOf = out.oneOf; delete out.oneOf }
    }
    return out
  }
  return walk(clone(schema))
}

function requiredOnlyBranch(v: any): boolean { return !!v && typeof v === 'object' && Object.keys(v).length === 1 && Array.isArray(v.required) && v.required.every((x: unknown) => typeof x === 'string') }
/** TEST-only: removes only conditionals logically implied by transport requiredness. */
export function removeRedundantRequiredAnyOf<T>(schema: T): T {
  const walk = (v: any): any => {
    if (Array.isArray(v)) return v.map(walk)
    if (!v || typeof v !== 'object') return v
    const out: Obj = Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)]))
    if (Array.isArray(out.anyOf) && out.anyOf.length > 0 && out.anyOf.every(requiredOnlyBranch) && out.type === 'object' && out.properties && Array.isArray(out.required)) {
      const names = out.anyOf.flatMap((branch: any) => branch.required)
      if (names.every((name: string) => Object.prototype.hasOwnProperty.call(out.properties, name)) && names.every((name: string) => out.required.includes(name))) delete out.anyOf
    }
    return out
  }
  return walk(clone(schema))
}

/** TEST-only: exact semantic structuredValue.value empty leaf, and no other {} leaf. */
export function normalizeExactStructuredValueScalarLeaf<T>(schema: T): T {
  const out: any = clone(schema)
  const choices = out?.properties?.proposals?.items?.oneOf ?? out?.properties?.proposals?.items?.anyOf
  if (!Array.isArray(choices)) return out
  const claim = choices.find((x: any) => x?.properties?.kind?.const === 'claim')
  const leaf = claim?.properties?.structuredValue?.properties?.value
  if (leaf && typeof leaf === 'object' && !Array.isArray(leaf) && Object.keys(leaf).length === 0) claim.properties.structuredValue.properties.value = { anyOf: [{ type: 'number' }, { type: 'string' }, { type: 'boolean' }] }
  return out
}

export function structuralCounts(schema: unknown): StructuralCounts {
  const c: StructuralCounts = { untypedEnums: 0, nestedArrays: 0, descriptions: 0, anyOfLocations: [], oneOf: 0, objectDepth: 0, arrayDepth: 0, emptySchemaCount: 0, enumCardinalities: [], constLocations: [], additionalPropertiesValues: [], itemsNestingDepth: 0, maxPropertyCount: 0, untypedPrimitiveConst: 0 }
  const walk = (v: any, path = '', objectDepth = 0, arrayDepth = 0, itemsDepth = 0) => {
    if (Array.isArray(v)) { c.arrayDepth = Math.max(c.arrayDepth, arrayDepth + 1); v.forEach((x, i) => walk(x, pathJoin(path, i), objectDepth, arrayDepth + 1, itemsDepth)); return }
    if (!v || typeof v !== 'object') return
    if (Object.keys(v).length === 0) c.emptySchemaCount++
    if (v.description !== undefined) c.descriptions++
    if (Array.isArray(v.enum)) { c.enumCardinalities.push(v.enum.length); if (v.type === undefined) c.untypedEnums++ }
    if (Object.prototype.hasOwnProperty.call(v, 'const')) { c.constLocations.push(path); if (v.type === undefined && (v.const === null || ['string', 'boolean', 'number'].includes(typeof v.const))) c.untypedPrimitiveConst++ }
    if (v.type === 'object') { c.objectDepth = Math.max(c.objectDepth, objectDepth + 1); if (v.properties) c.maxPropertyCount = Math.max(c.maxPropertyCount, Object.keys(v.properties).length) }
    if (Object.prototype.hasOwnProperty.call(v, 'additionalProperties')) c.additionalPropertiesValues.push(v.additionalProperties === true || v.additionalProperties === false ? v.additionalProperties : 'schema')
    if (v.items !== undefined) { c.itemsNestingDepth = Math.max(c.itemsNestingDepth, itemsDepth + 1); if (v.items?.items) c.nestedArrays++ }
    if (Array.isArray(v.oneOf)) c.oneOf++
    if (Array.isArray(v.anyOf)) c.anyOfLocations.push({ path, branchShapes: v.anyOf.map((x: any) => x?.type ?? (x?.required ? 'required-only' : x?.properties ? 'object' : Object.keys(x ?? {}).join(','))) })
    const childObjectDepth = v.type === 'object' ? objectDepth + 1 : objectDepth
    Object.entries(v).forEach(([k, x]) => walk(x, pathJoin(path, k), childObjectDepth, arrayDepth, k === 'items' ? itemsDepth + 1 : itemsDepth))
  }
  walk(schema); return c
}

export function buildRequiredOnlyAnyOfSchema(includeAnyOf: boolean): Obj { return { type: 'object', additionalProperties: false, required: ['value'], properties: { value: { type: 'object', additionalProperties: false, required: ['period', 'fiscalPeriod'], properties: { period: { type: 'string' }, fiscalPeriod: { type: 'string' } }, ...(includeAnyOf ? { anyOf: [{ required: ['period'] }, { required: ['fiscalPeriod'] }] } : {}) } } } }
export function buildEmptyLeafSchema(typed: boolean): Obj { return { type: 'object', additionalProperties: false, required: ['value'], properties: { value: typed ? { anyOf: [{ type: 'number' }, { type: 'string' }, { type: 'boolean' }] } : {} } } }

function classifyFailure(e: unknown): Classification { const failureClass = e instanceof ReasoningExecutorError ? e.failureClass : (e as any)?.failureClass; switch (failureClass) { case 'authentication_or_account': return 'BACKEND_AUTH_OR_ACCOUNT_BLOCKED'; case 'model_unavailable': return 'BACKEND_MODEL_UNAVAILABLE'; case 'rate_limit_or_quota': return 'BACKEND_RATE_OR_QUOTA_BLOCKED'; case 'safety_or_policy': return 'BACKEND_SAFETY_OR_POLICY_BLOCKED'; case 'timeout_or_cancel': return 'BACKEND_TIMEOUT_OR_CANCELLED'; case 'transport_or_service': return 'BACKEND_TRANSPORT_OR_SERVICE_FAILURE'; default: return 'BACKEND_FAILURE_DIAGNOSTIC_INCONCLUSIVE' } }
const environmental = (o?: ProbeOutcome) => !!o && !!o.safeFailureClass && !['structured_output_configuration', 'unknown_nonzero_exit'].includes(o.safeFailureClass)

export function decideProbePath(outcomes: readonly ProbeOutcome[]): { classification: Classification; nextActionCategory: NextAction; stopReason: string } {
  const a = outcomes.find(x => x.name === 'REQUIRED_ONLY_ANYOF_MINIMAL'); const b = outcomes.find(x => x.name === 'REQUIRED_ONLY_ANYOF_REMOVED_MINIMAL'); const c = outcomes.find(x => x.name === 'EMPTY_SCHEMA_LEAF_MINIMAL'); const d = outcomes.find(x => x.name === 'FINITE_SCALAR_ANYOF_MINIMAL'); const e = outcomes.find(x => x.name === 'FULL_MODULE_ALL_INDEPENDENTLY_PROVEN_DELTAS')
  const firstEnv = [a, b, c, d, e].find(environmental)
  if (firstEnv) return { classification: classifyFailure({ failureClass: firstEnv.safeFailureClass } as any), nextActionCategory: 'REVIEW_BACKEND_RUNTIME_FAILURE', stopReason: `${firstEnv.name} stopped on environmental failure` }
  if (!a || !b || !c || !d) return { classification: 'BACKEND_FAILURE_DIAGNOSTIC_INCONCLUSIVE', nextActionCategory: 'REVIEW_BACKEND_RUNTIME_FAILURE', stopReason: 'A-D differential incomplete' }
  const redundant = !a.semanticResultAvailable && b.semanticResultAvailable
  const leaf = !c.semanticResultAvailable && d.semanticResultAvailable
  if ((!a.semanticResultAvailable && !b.semanticResultAvailable) || (!c.semanticResultAvailable && !d.semanticResultAvailable)) return { classification: 'BACKEND_FAILURE_DIAGNOSTIC_INCONCLUSIVE', nextActionCategory: 'REVIEW_BACKEND_RUNTIME_FAILURE', stopReason: 'A/B or C/D differential inconclusive' }
  if (!e) return { classification: 'BACKEND_FAILURE_DIAGNOSTIC_INCONCLUSIVE', nextActionCategory: 'REVIEW_BACKEND_RUNTIME_FAILURE', stopReason: 'Full Module probe not executed' }
  if (e.semanticResultAvailable && e.validatorStatus === 'passed') return { classification: 'MODULE_TRANSPORT_COMPATIBILITY_SET_PROVEN', nextActionCategory: 'IMPLEMENT_PROVEN_CODEX_SCHEMA_COMPATIBILITY_SET', stopReason: `Full Module passed with proven deltas: redundantRequiredAnyOf=${redundant}, emptySchemaLeaf=${leaf}` }
  if (e.semanticResultAvailable) return { classification: 'MODULE_TRANSPORT_WORKS_SEMANTICS_INVALID', nextActionCategory: 'REVIEW_MODULE_SEMANTICS_WITH_TRANSPORT_PROVEN', stopReason: 'Full Module reached parser but authoritative semantics failed' }
  return { classification: 'REMAINING_MODULE_SCHEMA_DELTA_UNRESOLVED', nextActionCategory: 'DIAGNOSE_REMAINING_MODULE_SCHEMA_SHAPE_BY_REDUCTION', stopReason: 'Full Module remained pre-semantic after all independently proven deltas' }
}

const neutralInput = { module: MODULE, target: { name: 'generic fictional industry' }, evidence: [], existingKnowledge: [], localReferences: [] }
const instruction = 'Return one bounded unavailable result for a generic fictional industry with zero evidence, empty evidenceIds and proposals, one bounded actionable gap, and bounded reportMaterial.'
function safeError(e: unknown): Partial<ProbeOutcome> { const x = e instanceof ReasoningExecutorError ? e : undefined; return { processStarted: x?.processStarted ?? false, exitState: x?.exitState ?? 'not_started', semanticResultAvailable: false, safeFailureClass: x?.failureClass ?? 'unknown_nonzero_exit', safeReasoningCode: x?.code ?? 'reasoning_execution_failed', safeErrorCode: x?.safeErrorCode ?? null, parserStatus: 'not_run', validatorStatus: 'not_run', returnedSemanticStatus: null } }
async function cliVersion(): Promise<string | null> { try { const r = await promisify(execFileCallback)('codex', ['--version'], { windowsHide: true, maxBuffer: 8_000 }); return r.stdout.trim().slice(0, 128) || null } catch { return null } }
function emptyOutcome(name: ProbeName, source: unknown, transformed: unknown, ordinal: number): ProbeOutcome { const normalized = normalizeCodexOutputSchema(transformed); return { name, actualCallOrdinal: ordinal, sourceContractFingerprint: fingerprint(source), sourceContractBytes: size(source), transformedContractFingerprint: fingerprint(transformed), transformedContractBytes: size(transformed), productionNormalizedFingerprint: normalized.fingerprint, productionNormalizedBytes: normalized.bytes, processStarted: false, exitState: 'not_started', semanticResultAvailable: false, safeFailureClass: null, safeReasoningCode: null, safeErrorCode: null, parserStatus: 'not_run', validatorStatus: 'not_run', returnedSemanticStatus: null, structuralCounts: structuralCounts(transformed) } }
async function runProbe(executor: any, name: ProbeName, source: unknown, transformed: unknown, ordinal: number): Promise<ProbeOutcome> { const base = emptyOutcome(name, source, transformed, ordinal); const request: ReasoningRequest = { operation: 'industry_module_analysis', instruction, input: name.includes('MINIMAL') ? (name.includes('ANYOF') || name.includes('LEAF') ? { value: name.includes('LEAF') ? 'neutral' : { period: 'current', fiscalPeriod: 'FY2026' } } : { value: { period: 'current', fiscalPeriod: 'FY2026' } }) : neutralInput, outputContract: transformed, metadata: { executionId: `diag-014-${ordinal}` } }; try { const result: ReasoningResult = await executor.execute(request); const parsed = parseIndustryReasoningObject(result.output); let validatorStatus = 'not_run'; let returnedSemanticStatus: string | null = null; if (!name.includes('MINIMAL')) { try { const valid = validateIndustryModuleResult(parsed, MODULE, []); validatorStatus = 'passed'; returnedSemanticStatus = String((valid as any).status) } catch { validatorStatus = 'failed' } } else validatorStatus = 'not_applicable'; return { ...base, processStarted: true, exitState: 'normal_exit', semanticResultAvailable: true, parserStatus: 'passed', validatorStatus, returnedSemanticStatus } } catch (e) { return { ...base, ...safeError(e) } }
}

export function applyProvenTransformations(source: unknown, redundantRequiredAnyOf: boolean, emptySchemaLeaf: boolean): unknown { let out = inferPrimitiveConstTypes(source); out = convertDisjointConstOneOfToAnyOf(out); if (redundantRequiredAnyOf) out = removeRedundantRequiredAnyOf(normalizeCodexOutputSchema(out).schema); if (emptySchemaLeaf) out = normalizeExactStructuredValueScalarLeaf(out); return out }

function makeEvidence(source: unknown, sourceFingerprint: string, baselineNormalized: any, outcomes: ProbeOutcome[], decision: ReturnType<typeof decideProbePath>, inventory: unknown, cliVersionValue: string | null, runtimeConfiguration: unknown) {
  const a = outcomes.find(x => x.name === 'REQUIRED_ONLY_ANYOF_MINIMAL'); const b = outcomes.find(x => x.name === 'REQUIRED_ONLY_ANYOF_REMOVED_MINIMAL'); const c = outcomes.find(x => x.name === 'EMPTY_SCHEMA_LEAF_MINIMAL'); const d = outcomes.find(x => x.name === 'FINITE_SCALAR_ANYOF_MINIMAL')
  const redundantRequiredAnyOfDifferential: DifferentialResult = a && b ? (!a.semanticResultAvailable && b.semanticResultAvailable ? 'proven' : a.semanticResultAvailable && b.semanticResultAvailable ? 'accepted_by_backend' : 'inconclusive') : 'not_run'
  const emptySchemaLeafDifferential: DifferentialResult = c && d ? (!c.semanticResultAvailable && d.semanticResultAvailable ? 'proven' : c.semanticResultAvailable && d.semanticResultAvailable ? 'accepted_by_backend' : 'inconclusive') : 'not_run'
  return { taskId: TASK_ID, baseCommit: BASE_COMMIT, generatedAt: new Date().toISOString(), diag013Acceptance: { acceptedTestEvidenceOnly: true, baseCommit: 'a2d8eb6f5d4a6a93df0e413e9b11fa8cc0bc87d2', classification: 'KNOWN_MODULE_SCHEMA_DELTAS_INSUFFICIENT', primitiveConstDifferential: 'proven', nestedOneOfDifferential: 'proven', fullModuleConstTyped: 'pre-semantic unknown_nonzero_exit', fullModuleGuardedVariantNormalization: 'pre-semantic unknown_nonzero_exit', fullModuleStructuredValueLeafNormalization: 'pre-semantic unknown_nonzero_exit' }, backend: 'codex-cli', model: 'gpt-5.6-luna', effort: 'medium', cliVersion: cliVersionValue, runtimeConfiguration, authoritativeModuleSource: { fingerprint: sourceFingerprint, bytes: size(source), baselineNormalizedFingerprint: baselineNormalized.fingerprint, baselineNormalizedBytes: baselineNormalized.bytes, byteEqualBeforeAfter: fingerprint(source) === sourceFingerprint }, probes: outcomes, ...(process.env.DIAG014_PROBE_E_ONLY === '1' ? { discardedRealCall: { callOrdinal: 5, reason: 'TEST harness argument-order correction; no probe result retained', productionCodeMutation: false, rawDataPersisted: false } } : {}), redundantRequiredAnyOfDifferential, emptySchemaLeafDifferential, exactFullModuleTransformationSet: { primitiveConstTyping: true, guardedDisjointKindOneOfToAnyOf: true, removeRedundantRequiredAnyOf: redundantRequiredAnyOfDifferential === 'proven', normalizeExactStructuredValueScalarLeaf: emptySchemaLeafDifferential === 'proven' }, probeE: outcomes.filter(x => x.name === 'FULL_MODULE_ALL_INDEPENDENTLY_PROVEN_DELTAS').at(-1) ?? null, remainingStructuralInventory: inventory, actualCallCount: outcomes.length + (process.env.DIAG014_PROBE_E_ONLY === '1' ? 1 : 0), aggregateClassification: decision.classification, nextActionCategory: decision.nextActionCategory, stopReason: decision.stopReason, mutation: { acquisitionCalls: 0, knowledgeMutation: false, gatewaySubmitCount: 0, writerCommitCount: 0, productionCodeMutation: false, sourceContractMutated: false }, privacy: { rawPrompt: false, fullInput: false, fullSchemas: false, fullModelOutput: false, stdout: false, stderr: false, jsonl: false, credentials: false, authData: false, privateAbsolutePaths: false, reasoningTraces: false }, maxRealModelCalls: MAX_REAL_MODEL_CALLS }
}

export async function main(): Promise<void> {
  const source = createIndustryModuleResultContract(MODULE, []); const sourceFingerprint = fingerprint(source); const baselineNormalized = normalizeCodexOutputSchema(source); const outcomes: ProbeOutcome[] = []; let executor: any
  try { executor = await createIndustryProductionReasoningExecutor({ capabilities: CAPABILITIES, timeoutMs: 900_000, maxOutputChars: 400_000 }) } catch (e) { const failed = emptyOutcome('REQUIRED_ONLY_ANYOF_MINIMAL', buildRequiredOnlyAnyOfSchema(true), buildRequiredOnlyAnyOfSchema(true), 0); Object.assign(failed, safeError(e)); outcomes.push(failed) }
  let runtimeConfiguration: unknown = { backend: 'codex-cli', model: 'gpt-5.6-luna', effort: 'medium', structuredOutputEnabled: true }
  if (executor) {
    const meta = executor.runtimeMetadata?.(); runtimeConfiguration = { backend: meta?.backend, model: meta?.requestedModel, effort: meta?.requestedReasoningEffort, invocationMode: meta?.invocationMode, structuredOutputEnabled: meta?.structuredOutputEnabled }
    if (meta?.backend !== 'codex-cli' || meta?.requestedModel !== 'gpt-5.6-luna' || meta?.requestedReasoningEffort !== 'medium' || meta?.structuredOutputEnabled !== true) { const decision = { classification: 'RUNTIME_CONFIGURATION_MISMATCH' as Classification, nextActionCategory: 'REVIEW_RUNTIME_CONFIGURATION' as NextAction, stopReason: 'Production executor metadata mismatch' }; await writeEvidence(makeEvidence(source, sourceFingerprint, baselineNormalized, outcomes, decision, null, await cliVersion(), runtimeConfiguration)); return }
    if (process.env.DIAG014_PROBE_E_ONLY === '1') {
      const prior = JSON.parse(await readFile(resolve(import.meta.dirname, 'evidence/RHL_M3B_CODEX_MODULE_REMAINING_SCHEMA_DELTAS.json'), 'utf8')) as { probes: ProbeOutcome[] }
      const candidate = applyProvenTransformations(source, true, true); const probeE = await runProbe(executor, 'FULL_MODULE_ALL_INDEPENDENTLY_PROVEN_DELTAS', source, candidate, 6)
      const priorWithoutE = prior.probes.filter(x => x.name !== 'FULL_MODULE_ALL_INDEPENDENTLY_PROVEN_DELTAS'); outcomes.push(...priorWithoutE, probeE)
      const inventory = !probeE.semanticResultAvailable ? { fullModule: structuralCounts(candidate), design: structuralCounts(INDUSTRY_RESEARCH_DESIGN_CONTRACT), successfulMinimalSchemas: { requiredOnlyAnyOfRemoved: structuralCounts(buildRequiredOnlyAnyOfSchema(false)), finiteScalarAnyOf: structuralCounts(buildEmptyLeafSchema(true)) } } : null
      await writeEvidence(makeEvidence(source, sourceFingerprint, baselineNormalized, outcomes, decideProbePath(outcomes), inventory, await cliVersion(), runtimeConfiguration)); return
    }
    const call = async (name: ProbeName, contract: unknown, original: unknown = contract) => { outcomes.push(await runProbe(executor, name, original, contract, outcomes.length + 1)); return outcomes[outcomes.length - 1] }
    const a = await call('REQUIRED_ONLY_ANYOF_MINIMAL', buildRequiredOnlyAnyOfSchema(true)); if (environmental(a)) { await writeEvidence(makeEvidence(source, sourceFingerprint, baselineNormalized, outcomes, decideProbePath(outcomes), null, await cliVersion(), runtimeConfiguration)); return }
    const b = await call('REQUIRED_ONLY_ANYOF_REMOVED_MINIMAL', buildRequiredOnlyAnyOfSchema(false)); if (environmental(b)) { await writeEvidence(makeEvidence(source, sourceFingerprint, baselineNormalized, outcomes, decideProbePath(outcomes), null, await cliVersion(), runtimeConfiguration)); return }
    const c = await call('EMPTY_SCHEMA_LEAF_MINIMAL', buildEmptyLeafSchema(false)); if (environmental(c)) { await writeEvidence(makeEvidence(source, sourceFingerprint, baselineNormalized, outcomes, decideProbePath(outcomes), null, await cliVersion(), runtimeConfiguration)); return }
    const d = await call('FINITE_SCALAR_ANYOF_MINIMAL', buildEmptyLeafSchema(true)); if (environmental(d)) { await writeEvidence(makeEvidence(source, sourceFingerprint, baselineNormalized, outcomes, decideProbePath(outcomes), null, await cliVersion(), runtimeConfiguration)); return }
    if (!a.semanticResultAvailable && !b.semanticResultAvailable || !c.semanticResultAvailable && !d.semanticResultAvailable) { await writeEvidence(makeEvidence(source, sourceFingerprint, baselineNormalized, outcomes, decideProbePath(outcomes), null, await cliVersion(), runtimeConfiguration)); return }
    const redundant = !a.semanticResultAvailable && b.semanticResultAvailable; const leaf = !c.semanticResultAvailable && d.semanticResultAvailable
    const candidate = applyProvenTransformations(source, redundant, leaf); const e = await call('FULL_MODULE_ALL_INDEPENDENTLY_PROVEN_DELTAS', candidate, source)
    let inventory: unknown = null
    const decision = decideProbePath(outcomes)
    if (!e.semanticResultAvailable) inventory = { fullModule: structuralCounts(candidate), design: structuralCounts(INDUSTRY_RESEARCH_DESIGN_CONTRACT), successfulMinimalSchemas: { requiredOnlyAnyOfRemoved: structuralCounts(buildRequiredOnlyAnyOfSchema(false)), finiteScalarAnyOf: structuralCounts(buildEmptyLeafSchema(true)) } }
    await writeEvidence(makeEvidence(source, sourceFingerprint, baselineNormalized, outcomes, decision, inventory, await cliVersion(), runtimeConfiguration))
  } else await writeEvidence(makeEvidence(source, sourceFingerprint, baselineNormalized, outcomes, decideProbePath(outcomes), null, await cliVersion(), runtimeConfiguration))
}

async function writeEvidence(evidence: unknown) { const path = resolve(import.meta.dirname, 'evidence/RHL_M3B_CODEX_MODULE_REMAINING_SCHEMA_DELTAS.json'); await mkdir(resolve(import.meta.dirname, 'evidence'), { recursive: true }); await writeFile(path, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8'); console.log(JSON.stringify(evidence, null, 2)) }
if (process.argv[1]?.endsWith('codex-module-remaining-schema-deltas.ts')) await main()
