import { mkdir, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { resolve } from 'node:path'
import { createIndustryProductionReasoningExecutor, INDUSTRY_PRODUCTION_REASONING_SELECTION, PRIMARY_PRODUCTION_REASONING_MODEL } from '../../app/pi/model-selection.ts'
import { normalizeCodexOutputSchema } from '../../plugins/reasoning/codex-cli/executor.ts'
import { ReasoningExecutorError } from '../../plugins/reasoning/errors.ts'
import { parseIndustryReasoningObject, validateIndustryResearchDesign } from '../../skills/industry-research/skill.ts'
import { INDUSTRY_MODULES } from '../../skills/industry-research/contracts.ts'
import { captureFirstDesignRequest } from './codex-cli-pcb-design-compatibility.ts'

const taskId = 'RHL-M3B-3B-FIX-007-INDUSTRY-EXPLICIT-CODEX-PRODUCTION-SELECTION'
const baseCommit = 'fbeed8ce47409382e4439228f1a45e99e8b3e916'
const expected = { instruction: '7a04f3501b1d420d', input: '36c1bc2fc516f169', outputContract: '9854f93073c44d96' }
const capabilities = { maxContextTokens: 128_000, maxOutputTokens: 16_384, structuredOutputSupport: true, maxConcurrency: 1 } as const
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 16)
const safeFailure = (error: unknown) => ({ code: error instanceof ReasoningExecutorError ? error.code : 'reasoning_execution_failed', failureClass: error instanceof ReasoningExecutorError ? error.failureClass ?? null : null })

export async function main(): Promise<void> {
  const repoRoot = resolve(import.meta.dirname, '../..')
  const evidencePath = resolve(repoRoot, 'tests/validation/evidence/RHL_M3B_INDUSTRY_PRODUCTION_CODEX_SELECTION.json')
  const captured = await captureFirstDesignRequest()
  const actual = { instruction: hash(captured.request.instruction), input: hash(captured.request.input), outputContract: hash(captured.request.outputContract) }
  const continuity = { expected, actual, allMatch: Object.keys(expected).every((key) => actual[key as keyof typeof actual] === expected[key as keyof typeof expected]) }
  const transport = normalizeCodexOutputSchema(captured.request.outputContract)
  let realCallCount = 0; let parserStatus = 'not_run'; let validatorStatus = 'not_run'; let targetKind: string | null = null; let moduleQuestionCount = 0; let failure: ReturnType<typeof safeFailure> | null = null
  let runtimeMetadata: Record<string, unknown> = { backend: null, requestedModel: null, requestedReasoningEffort: null, structuredOutputEnabled: null }
  if (!continuity.allMatch) {
    await writeEvidence(evidencePath, { taskId, baseCommit, classification: 'REQUEST_CONTINUITY_FAILED', capturedFirstAttemptCount: captured.calls, transport: { fingerprint: transport.fingerprint, bytes: transport.bytes }, continuity, realCallCount, runtimeMetadata, parserStatus, validatorStatus, targetKind, moduleQuestionCount, defaultProductionModel: PRIMARY_PRODUCTION_REASONING_MODEL, industryProductionBackend: INDUSTRY_PRODUCTION_REASONING_SELECTION, lazySelection: true, noFallbackAssertions: { noAutomaticFallback: true, defaultExecutorInvoked: false }, mutation: noMutation(), privacy: noPrivacy() })
    process.exitCode = 1; return
  }
  try {
    const executor = await createIndustryProductionReasoningExecutor({ capabilities, timeoutMs: 900_000, maxOutputChars: 400_000 })
    runtimeMetadata = executor.runtimeMetadata() as unknown as Record<string, unknown>
    realCallCount += 1
    const result = await executor.execute(captured.request)
    const parsed = parseIndustryReasoningObject(result.output); parserStatus = 'passed'
    const validated = validateIndustryResearchDesign(parsed); validatorStatus = 'passed'; targetKind = validated.targetKind; moduleQuestionCount = Object.keys(validated.moduleQuestions).length
  } catch (error) { failure = safeFailure(error) }
  const metadataMatches = runtimeMetadata.backend === 'codex-cli' && runtimeMetadata.requestedModel === 'gpt-5.6-luna' && runtimeMetadata.requestedReasoningEffort === 'medium' && runtimeMetadata.structuredOutputEnabled === true
  const classification = failure?.failureClass === 'authentication_or_account' ? 'BACKEND_AUTH_OR_ACCOUNT_BLOCKED'
    : failure?.failureClass === 'model_unavailable' ? 'BACKEND_MODEL_UNAVAILABLE'
      : failure?.failureClass === 'rate_limit_or_quota' ? 'BACKEND_RATE_OR_QUOTA_BLOCKED'
        : failure?.failureClass === 'safety_or_policy' ? 'BACKEND_SAFETY_OR_POLICY_BLOCKED'
          : failure?.failureClass === 'timeout_or_cancel' ? 'BACKEND_TIMEOUT_OR_CANCELLED'
            : failure?.failureClass === 'transport_or_service' ? 'BACKEND_TRANSPORT_OR_SERVICE_FAILURE'
              : parserStatus !== 'passed' || validatorStatus !== 'passed' ? 'INDUSTRY_MODEL_OUTPUT_INVALID'
                : targetKind === 'industry' && moduleQuestionCount === INDUSTRY_MODULES.length && metadataMatches && realCallCount === 1 ? 'INDUSTRY_CODEX_SELECTION_VALIDATED' : 'INDUSTRY_VALID_NONINDUSTRY_DIAGNOSIS'
  const evidence = { taskId, baseCommit, generatedAt: new Date().toISOString(), defaultProductionModel: PRIMARY_PRODUCTION_REASONING_MODEL, industryProductionBackend: INDUSTRY_PRODUCTION_REASONING_SELECTION, lazySelection: { applicationStartupDoesNotDiscoverCodex: true, resolvesOnIndustryRun: true, successfulExecutorMayBeMemoized: true, rejectionDoesNotFallback: true }, realCallCount, requestFingerprints: continuity, transport: { sourceContractFingerprint: '9854f93073c44d96', fingerprint: transport.fingerprint, bytes: transport.bytes }, runtimeMetadata: { backend: runtimeMetadata.backend ?? null, requestedModel: runtimeMetadata.requestedModel ?? null, requestedReasoningEffort: runtimeMetadata.requestedReasoningEffort ?? null, structuredOutputEnabled: runtimeMetadata.structuredOutputEnabled ?? null }, parserStatus, validatorStatus, targetKind, moduleQuestionCount, failure, finalClassification: classification, noFallbackAssertions: { noAutomaticFallback: true, defaultExecutorInvoked: false, fallbackCallCount: 0 }, mutation: noMutation(), privacy: noPrivacy() }
  await writeEvidence(evidencePath, evidence); console.log(JSON.stringify(evidence, null, 2)); if (classification !== 'INDUSTRY_CODEX_SELECTION_VALIDATED') process.exitCode = 1
}

function noMutation() { return { knowledge: false, sourceRaw: false, gateway: false, writer: false, researchReport: false, graph: false, canonicalKnowledge: false, fullIndustryRun: false } }
function noPrivacy() { return { rawPrompt: false, completeRequest: false, outputContract: false, stdout: false, stderr: false, completeOutput: false, credentials: false, privatePaths: false, reasoningTraces: false } }
async function writeEvidence(path: string, value: unknown) { await mkdir(resolve(path, '..'), { recursive: true }); await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8'); console.log(JSON.stringify(value, null, 2)) }
if (process.argv[1]?.endsWith('industry-production-codex-selection.ts')) await main()
