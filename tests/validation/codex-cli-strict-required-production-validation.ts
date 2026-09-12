import { mkdir, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { resolve } from 'node:path'
import { createCodexCliLunaReasoningExecutor } from '../../app/pi/model-selection.ts'
import { normalizeCodexOutputSchema } from '../../plugins/reasoning/codex-cli/executor.ts'
import { ReasoningExecutorError } from '../../plugins/reasoning/errors.ts'
import { parseIndustryReasoningObject, validateIndustryResearchDesign } from '../../skills/industry-research/skill.ts'
import { INDUSTRY_MODULES, INDUSTRY_RESEARCH_DESIGN_CONTRACT } from '../../skills/industry-research/contracts.ts'
import { captureFirstDesignRequest } from './codex-cli-pcb-design-compatibility.ts'

export const EXPECTED_DESIGN_SOURCE_FINGERPRINT = '9854f93073c44d96'
export const EXPECTED_DESIGN_TRANSPORT = { fingerprint: '88711c17a6837ae7', bytes: 2125 }
export const MAX_REAL_MODEL_CALLS = 2
export const PCB_CLASSIFICATIONS = ['PCB_COMPATIBLE_VALID_INDUSTRY_DESIGN', 'PCB_VALID_NONINDUSTRY_DIAGNOSIS', 'PCB_MODEL_OUTPUT_INVALID', 'NEUTRAL_DESIGN_VALIDATION_FAILED', 'REQUEST_CONTINUITY_FAILED', 'BACKEND_AUTH_OR_ACCOUNT_BLOCKED', 'BACKEND_MODEL_UNAVAILABLE', 'BACKEND_RATE_OR_QUOTA_BLOCKED', 'BACKEND_SAFETY_OR_POLICY_BLOCKED', 'BACKEND_TIMEOUT_OR_CANCELLED', 'BACKEND_TRANSPORT_OR_SERVICE_FAILURE', 'BACKEND_FAILURE_DIAGNOSTIC_INCONCLUSIVE', 'BLOCKED_EXTERNAL_SETUP'] as const
export type ProductionClassification = typeof PCB_CLASSIFICATIONS[number]

const repoRoot = resolve(import.meta.dirname, '../..')
const evidencePath = resolve(repoRoot, 'tests/validation/evidence/RHL_M3B_CODEX_CLI_STRICT_REQUIRED_PRODUCTION_VALIDATION.json')
const capabilities = { maxContextTokens: 128_000, maxOutputTokens: 16_384, structuredOutputSupport: true, maxConcurrency: 1 } as const
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 16)
const failureClass = (error: unknown) => error instanceof ReasoningExecutorError ? error.failureClass ?? 'unknown_nonzero_exit' : 'unknown_nonzero_exit'

export function decideProductionValidation(input: { neutralPassed: boolean; neutralFailure?: ProductionClassification; requestContinuity: boolean; pcbAttempted: boolean; pcbParserPassed?: boolean; pcbValidatorPassed?: boolean; pcbTargetKind?: string; pcbFailure?: ProductionClassification; calls: number }): { classification: ProductionClassification; productionSelectionAuthorized: boolean } {
  if (!input.neutralPassed) return { classification: input.neutralFailure ?? 'NEUTRAL_DESIGN_VALIDATION_FAILED', productionSelectionAuthorized: false }
  if (!input.requestContinuity) return { classification: 'REQUEST_CONTINUITY_FAILED', productionSelectionAuthorized: false }
  if (!input.pcbAttempted) return { classification: 'BACKEND_FAILURE_DIAGNOSTIC_INCONCLUSIVE', productionSelectionAuthorized: false }
  if (input.pcbFailure) return { classification: input.pcbFailure, productionSelectionAuthorized: false }
  if (!input.pcbParserPassed || !input.pcbValidatorPassed) return { classification: 'PCB_MODEL_OUTPUT_INVALID', productionSelectionAuthorized: false }
  if (input.pcbTargetKind === 'industry') return { classification: 'PCB_COMPATIBLE_VALID_INDUSTRY_DESIGN', productionSelectionAuthorized: input.calls <= MAX_REAL_MODEL_CALLS }
  return { classification: 'PCB_VALID_NONINDUSTRY_DIAGNOSIS', productionSelectionAuthorized: false }
}

function allPropertiesRequired(value: unknown): boolean {
  if (Array.isArray(value)) return value.every(allPropertiesRequired)
  if (value === null || typeof value !== 'object') return true
  const node = value as Record<string, unknown>
  if (node.properties && typeof node.properties === 'object' && !Array.isArray(node.properties) && JSON.stringify(node.required) !== JSON.stringify(Object.keys(node.properties))) return false
  return Object.values(node).every(allPropertiesRequired)
}

function safeError(error: unknown): Record<string, unknown> { return { safeReasoningCode: error instanceof ReasoningExecutorError ? error.code : 'reasoning_execution_failed', safeFailureClass: failureClass(error), processStarted: error instanceof ReasoningExecutorError ? error.processStarted ?? false : false, exitState: error instanceof ReasoningExecutorError ? error.exitState ?? 'not_started' : 'not_started' } }

async function cliVersion(): Promise<string | null> { try { const { execFile } = await import('node:child_process'); const { promisify } = await import('node:util'); const result = await promisify(execFile)('codex', ['--version'], { windowsHide: true, maxBuffer: 8_000 }); return result.stdout.trim().split(/\r?\n/)[0]?.slice(0, 128) ?? null } catch { return null } }

async function main(): Promise<void> {
  const sourceBefore = hash(INDUSTRY_RESEARCH_DESIGN_CONTRACT)
  if (sourceBefore !== EXPECTED_DESIGN_SOURCE_FINGERPRINT) throw new Error('DESIGN_CONTRACT_FINGERPRINT_CHANGED')
  const normalized = normalizeCodexOutputSchema(INDUSTRY_RESEARCH_DESIGN_CONTRACT)
  if (!allPropertiesRequired(normalized.schema)) throw new Error('NORMALIZED_REQUIREDNESS_INCOMPLETE')
  const neutral: Record<string, unknown> = { attempted: false, processStarted: false, semanticResultAvailable: false, parserStatus: 'not_run', validatorStatus: 'not_run', targetKind: null, moduleQuestionCount: 0, failure: null }
  const pcb: Record<string, unknown> = { attempted: false, processStarted: false, semanticResultAvailable: false, parserStatus: 'not_run', validatorStatus: 'not_run', targetKind: null, moduleQuestionCount: 0, failure: null }
  let calls = 0
  let continuity = false
  try {
    const executor = await createCodexCliLunaReasoningExecutor({ capabilities, timeoutMs: 900_000, maxOutputChars: 400_000 })
    neutral.attempted = true; calls += 1
    try {
      const result = await executor.execute({ operation: 'industry_research_design', instruction: 'Return one harmless generic research design satisfying the supplied schema. Use neutral placeholder content.', input: { marker: 'fix-006-neutral-design' }, outputContract: INDUSTRY_RESEARCH_DESIGN_CONTRACT })
      neutral.processStarted = true; neutral.semanticResultAvailable = true
      const design = validateIndustryResearchDesign(parseIndustryReasoningObject(result.output))
      neutral.parserStatus = 'passed'; neutral.validatorStatus = 'passed'; neutral.targetKind = design.targetKind; neutral.moduleQuestionCount = Object.keys(design.moduleQuestions).length
    } catch (error) { neutral.failure = safeError(error) }
    if (neutral.validatorStatus === 'passed') {
      const captured = await captureFirstDesignRequest()
      const request = captured.request
      const expected = { instruction: '7a04f3501b1d420d', input: '36c1bc2fc516f169', outputContract: EXPECTED_DESIGN_SOURCE_FINGERPRINT }
      const actual = { instruction: hash(request.instruction), input: hash(request.input), outputContract: hash(request.outputContract) }
      continuity = actual.instruction === expected.instruction && actual.input === expected.input && actual.outputContract === expected.outputContract
      if (!continuity) pcb.failure = { classification: 'REQUEST_CONTINUITY_FAILED', expected, actual }
      else {
        pcb.attempted = true; calls += 1
        try {
          const result = await executor.execute(request)
          pcb.processStarted = true; pcb.semanticResultAvailable = true
          const design = validateIndustryResearchDesign(parseIndustryReasoningObject(result.output))
          pcb.parserStatus = 'passed'; pcb.validatorStatus = 'passed'; pcb.targetKind = design.targetKind; pcb.moduleQuestionCount = Object.keys(design.moduleQuestions).length
        } catch (error) { pcb.failure = safeError(error) }
      }
    }
  } catch (error) { neutral.failure = safeError(error) }
  const neutralPassed = neutral.validatorStatus === 'passed' && neutral.moduleQuestionCount === INDUSTRY_MODULES.length
  const classifyFailureClass = (value: unknown): ProductionClassification => ({ authentication_or_account: 'BACKEND_AUTH_OR_ACCOUNT_BLOCKED', model_unavailable: 'BACKEND_MODEL_UNAVAILABLE', rate_limit_or_quota: 'BACKEND_RATE_OR_QUOTA_BLOCKED', safety_or_policy: 'BACKEND_SAFETY_OR_POLICY_BLOCKED', timeout_or_cancel: 'BACKEND_TIMEOUT_OR_CANCELLED', transport_or_service: 'BACKEND_TRANSPORT_OR_SERVICE_FAILURE' } as Record<string, ProductionClassification>)[String(value)] ?? 'BACKEND_FAILURE_DIAGNOSTIC_INCONCLUSIVE'
  const neutralFailure = neutral.failure && typeof neutral.failure === 'object' && 'safeFailureClass' in neutral.failure ? classifyFailureClass(neutral.failure.safeFailureClass) : undefined
  const pcbFailure = pcb.failure && typeof pcb.failure === 'object' && 'safeFailureClass' in pcb.failure ? classifyFailureClass(pcb.failure.safeFailureClass) : undefined
  const decision = decideProductionValidation({ neutralPassed, neutralFailure, requestContinuity: continuity, pcbAttempted: Boolean(pcb.attempted), pcbParserPassed: pcb.parserStatus === 'passed', pcbValidatorPassed: pcb.validatorStatus === 'passed', pcbTargetKind: typeof pcb.targetKind === 'string' ? pcb.targetKind : undefined, pcbFailure, calls })
  const sourceAfter = hash(INDUSTRY_RESEARCH_DESIGN_CONTRACT)
  const evidence = { taskId: 'RHL-M3B-3B-FIX-006-CODEX-STRICT-REQUIRED-TRANSPORT-NORMALIZATION', baseCommit: '0c6a80dd1bf73b0357a382b705a43818fc20b562', generatedAt: new Date().toISOString(), cliVersion: await cliVersion(), backend: 'codex-cli', model: 'gpt-5.6-luna', effort: 'medium', authoritativeDesignSourceFingerprint: sourceBefore, normalizedTransport: { fingerprint: normalized.fingerprint, bytes: normalized.bytes, strengthenedObjectCount: normalized.strengthenedObjectCount }, diag006Acceptance: { optionalTypedControl: 'unknown_nonzero_exit', allPropertiesRequiredControl: 'succeeded', currentDesign: 'parser_pass_validator_pass_targetKind_uncertain_eight_module_questions', primitiveTypeInference: false, actualRealCallCount: 3, normalizedFingerprint: '88711c17a6837ae7', normalizedBytes: 2125, knownGapsItemsRequired: ['gapId', 'module', 'question', 'reason', 'actionable', 'searchTerms'], aggregateRegressionFailureEvidenceOnly: 'tests/app/runtime/valuation-route.test.ts timing/environment-sensitive failure' }, actualCallCount: calls, neutralProbe: neutral, conditionalPcbProbe: pcb, pcbRequestFingerprints: continuity ? { instruction: '7a04f3501b1d420d', input: '36c1bc2fc516f169', outputContract: EXPECTED_DESIGN_SOURCE_FINGERPRINT } : null, sourceContractUnchanged: sourceAfter === EXPECTED_DESIGN_SOURCE_FINGERPRINT, finalClassification: decision.classification, productionSelectionAuthorized: decision.productionSelectionAuthorized, mutation: { knowledge: false, sourceRaw: false, gateway: false, writer: false, researchReport: false, graph: false, productionModelSelection: false, codexAdapter: true, piExecutor: false, semanticRequest: false }, privacy: { rawPrompts: false, completeInputs: false, completeContracts: false, normalizedSchema: false, stdout: false, stderr: false, jsonl: false, modelOutputs: false, credentials: false, authData: false, privatePaths: false, reasoningTraces: false }, maxRealModelCalls: MAX_REAL_MODEL_CALLS }
  await mkdir(resolve(repoRoot, 'tests/validation/evidence'), { recursive: true }); await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8'); console.log(JSON.stringify(evidence, null, 2))
}

if (process.argv[1]?.endsWith('codex-cli-strict-required-production-validation.ts')) void main().catch((error) => { console.error(error); process.exitCode = 1 })
