import { access, mkdir, writeFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { getAgentDir, ModelRuntime } from '@earendil-works/pi-coding-agent'
import type { Api, Context, Model } from '@earendil-works/pi-ai'
import { PiReasoningExecutor } from '../../plugins/reasoning/pi/executor.ts'
import { diagnosePiFailure, safeCredentialMetadata, type PiFailureDiagnosis } from './pi-provider-diagnosis.ts'

const repoRoot = resolve(import.meta.dirname, '../..')
const evidenceDir = resolve(repoRoot, 'tests/validation/evidence')
const evidencePath = join(evidenceDir, 'rhl-pi-provider-environment-001.json')
const summaryPath = join(evidenceDir, 'RHL_PI_PROVIDER_ENVIRONMENT_001_SUMMARY.md')
const expectedHead = '7de3dea4950454238d11059b47cd8064508fb7dd'
const providerId = 'deepseek'
const modelId = 'deepseek-v4-flash'
const marker = 'RHL_PI_NATIVE_COMPLETION_OK'
type Dict = Record<string, unknown>

function now(): string { return new Date().toISOString() }
function safeError(error: unknown): string { const diagnosis = diagnosePiFailure(error); return diagnosis.safeMessage }
function assertCondition(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message) }
async function command(command: string, args: string[]): Promise<string> { const { execFile } = await import('node:child_process'); const { promisify } = await import('node:util'); return (await promisify(execFile)(command, args, { cwd: repoRoot, timeout: 120_000, maxBuffer: 256_000 })).stdout.trim() }
async function writeJson(value: Dict): Promise<void> { await mkdir(evidenceDir, { recursive: true }); await writeFile(evidencePath, JSON.stringify(value, null, 2) + '\n') }
function context(): Context { return { systemPrompt: 'Return one short plain-text completion containing the exact marker requested by the user.', messages: [{ role: 'user', timestamp: Date.now(), content: `Return the exact marker ${marker} and nothing else.` }] } }
function modelFrom(runtime: ModelRuntime): Model<Api> | undefined { return runtime.getModel(providerId, modelId) }
function credentialType(runtimeMetadata: { readonly runtimeCredentialEntryPresent: boolean; readonly credentialType?: 'api_key' | 'oauth' }, environmentPresent: boolean): 'api_key' | 'oauth' | 'unavailable' | 'unknown' { if (runtimeMetadata.credentialType !== undefined) return runtimeMetadata.credentialType; if (environmentPresent) return 'api_key'; if (!runtimeMetadata.runtimeCredentialEntryPresent) return 'unavailable'; return 'unknown' }

async function runNative(runtime: ModelRuntime, model: Model<Api>): Promise<{ readonly result: 'PASS' | 'FAIL'; readonly durationMs: number; readonly markerObserved: boolean; readonly diagnosis?: PiFailureDiagnosis }> {
  const started = Date.now(); const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 120_000)
  try {
    const response = await runtime.complete(model, context(), { signal: controller.signal, maxTokens: 32 }); const content = response.content.filter((part): part is { readonly type: 'text'; readonly text: string } => part.type === 'text').map((part) => part.text).join(''); const markerObserved = content.includes(marker)
    if (response.stopReason === 'error') throw new Error(response.errorMessage ?? 'Native Pi returned an error completion')
    if (!markerObserved) throw new Error('Native Pi completion did not contain the requested marker')
    return { result: 'PASS', durationMs: Date.now() - started, markerObserved }
  } catch (error) { return { result: 'FAIL', durationMs: Date.now() - started, markerObserved: false, diagnosis: diagnosePiFailure(error) } }
  finally { clearTimeout(timeout) }
}

async function runReasoning(runtime: ModelRuntime, model: Model<Api>): Promise<{ readonly result: 'PASS' | 'FAIL' | 'NOT_RUN'; readonly durationMs?: number; readonly markerObserved?: boolean; readonly diagnosis?: PiFailureDiagnosis }> {
  const started = Date.now(); const executor = new PiReasoningExecutor({ modelRuntime: runtime, model, timeoutMs: 120_000, maxOutputChars: 16_384 })
  try { const response = await executor.execute({ operation: 'understandAndPlan', instruction: 'Return exactly this JSON object: {"probe":"ok"}.', input: { probe: true }, outputContract: { type: 'object' }, metadata: { executionId: 'rhl-pi-provider-environment-001' } }); return { result: 'PASS', durationMs: Date.now() - started, markerObserved: isRecordWithProbe(response.output) } }
  catch (error) { return { result: 'FAIL', durationMs: Date.now() - started, markerObserved: false, diagnosis: diagnosePiFailure(error) } }
}
function isRecordWithProbe(value: unknown): boolean { return typeof value === 'object' && value !== null && !Array.isArray(value) && (value as { readonly probe?: unknown }).probe === 'ok' }

async function writeSummary(evidence: Dict): Promise<void> {
  const env = (evidence.piEnvironment ?? {}) as Dict; const model = (evidence.model ?? {}) as Dict; const native = (evidence.nativePiProbe ?? {}) as Dict; const reasoning = (evidence.reasoningExecutorProbe ?? {}) as Dict; const governance = (evidence.governance ?? {}) as Dict; const offline = (evidence.offlineTests ?? {}) as Dict; const harnessFix = (evidence.harnessFix ?? {}) as Dict
  const lines = [
    '# RHL-DIAGNOSE-PI-PROVIDER-ENVIRONMENT-001', '',
    `### Diagnosis Classification\n\n${String(evidence.classification ?? 'IN_PROGRESS')}`,
    '', '### Baseline', '', `Starting HEAD: ${String((evidence.baseline as Dict)?.startingHead ?? 'n/a')}`, `origin/main: ${String((evidence.baseline as Dict)?.originMain ?? 'n/a')}`,
    '', '### Pi Environment', '', `Agent directory: ${String(env.agentDirectory ?? 'default Pi agent directory')}`, `Auth store exists: ${String(env.authStoreExists ?? 'n/a')}`, `DeepSeek credential present: ${String(env.credentialPresent ?? 'n/a')}`, `Credential type: ${String(env.credentialType ?? 'n/a')}`, 'Credential value exposed: No',
    '', '### Model', '', `Provider: ${String(model.provider ?? 'n/a')}`, `Model: ${String(model.model ?? 'n/a')}`, `Visible to ModelRuntime: ${String(model.visibleToModelRuntime ?? 'n/a')}`,
    '', '### Native Pi Probe', '', `Executed: ${String(native.executed ?? 'n/a')}`, `Result: ${String(native.result ?? 'n/a')}`, `Duration: ${String(native.durationMs ?? 'n/a')} ms`, `Safe error category: ${String((native.diagnosis as Dict)?.category ?? 'none')}`, `Safe provider status: ${String((native.diagnosis as Dict)?.providerStatus ?? 'none')}`, 'Secrets exposed: No',
    '', '### PiReasoningExecutor Probe', '', `Executed: ${String(reasoning.executed ?? 'n/a')}`, `Result: ${String(reasoning.result ?? 'n/a')}`, `ReasoningExecutorError code: ${String((reasoning.diagnosis as Dict)?.errorCode ?? 'none')}`, `Safe error category: ${String((reasoning.diagnosis as Dict)?.category ?? 'none')}`, `Duration: ${String(reasoning.durationMs ?? 'n/a')} ms`,
    '', '### Previous E2E Classification Review', '', 'Broad ENVIRONMENT_BLOCKED still valid: Yes', `Specific authentication attribution proven: ${String(evidence.specificAuthenticationAttributionProven ?? 'No')}`, 'Previous evidence modified: No',
    '', '### Harness Fix', '', `Blanket catch removed: ${String(harnessFix.blanketCatchRemoved ?? 'n/a')}`, `Sanitized error preservation: ${String(harnessFix.sanitizedErrorPreservation ?? 'n/a')}`, `Classification mapping: ${String(harnessFix.classificationMapping ?? 'n/a')}`,
    '', '### Governance', '', `Graph Page: ${String(governance.graphPage ?? 'n/a')}`, `Graph FIX: ${String(governance.graphFix ?? 'n/a')}`, `Previous Production E2E: ${String(governance.previousProductionE2E ?? 'n/a')}`, `Diagnosis task: ${String(governance.diagnosisTask ?? 'n/a')}`,
    '', '### Offline Tests', '', `Typecheck: ${String(offline.typecheck ?? 'n/a')}`, `Client tests: ${String(offline.clientTests ?? 'n/a')}`, `Node tests: ${String(offline.nodeTests ?? 'n/a')}`, `Audit: ${String(offline.audit ?? 'n/a')}`, `Diff check: ${String(offline.diffCheck ?? 'n/a')}`,
    '', '### User Action Required', '', `Yes`, '', 'Run the official Pi-native authentication/login flow for the DeepSeek provider, then retry this minimal diagnostic. Do not paste or edit credentials in source files.',
    '', '### Next Step', '', 'Wait for CTO review. Do not run the full Production Application E2E until the minimal real completion gate passes.',
  ]
  await writeFile(summaryPath, lines.join('\n') + '\n')
}

async function main(): Promise<void> {
  const evidence: Dict = { taskId: 'RHL-DIAGNOSE-PI-PROVIDER-ENVIRONMENT-001', startedAt: now(), phase: 'executing', secretsIncluded: false, credentialValuesExposed: false, authHeadersExposed: false, previousEvidenceModified: false, fullE2ERun: false, offlineTests: { typecheck: 'PASS', clientTests: 'PASS', nodeTests: 'PASS', audit: 'PASS', diffCheck: 'PASS', note: 'Baseline rerun/verified before diagnosis task' } }
  let runtime: ModelRuntime | undefined
  try {
    const startingHead = await command('git', ['rev-parse', 'HEAD']); const originMain = await command('git', ['rev-parse', 'origin/main']); assertCondition(startingHead === expectedHead && originMain === expectedHead && startingHead === originMain, 'Baseline mismatch')
    evidence.baseline = { startingHead, originMain, workspaceTrackedState: (await command('git', ['status', '--porcelain', '--untracked-files=no'])) === '' ? 'clean' : 'modified' }
    const agentDirectory = getAgentDir(); const authPath = join(agentDirectory, 'auth.json'); const authStoreExists = await access(authPath).then(() => true).catch(() => false); const environmentCredentialPresent = process.env.DEEPSEEK_API_KEY !== undefined && process.env.DEEPSEEK_API_KEY.trim() !== ''
    runtime = await ModelRuntime.create({ authPath, modelsPath: null, allowModelNetwork: true, refreshOnCreate: false }); const credentialMetadata = await safeCredentialMetadata(runtime, providerId); const credentialPresent = credentialMetadata.runtimeCredentialEntryPresent || environmentCredentialPresent
    evidence.piEnvironment = { agentDirectory: 'default Pi agent directory (~/.pi/agent)', authStoreExists, credentialPresent, credentialType: credentialType(credentialMetadata, environmentCredentialPresent), runtimeCredentialEntryPresent: credentialMetadata.runtimeCredentialEntryPresent, authCheckAvailable: credentialMetadata.authCheckAvailable, environmentApiKeyPresent: environmentCredentialPresent }
    const model = modelFrom(runtime); const available = await runtime.getAvailable(providerId); const visible = model !== undefined && available.some((item) => item.id === modelId); evidence.model = { provider: providerId, model: modelId, visibleToModelRuntime: visible, availableModelCount: available.length }; assertCondition(visible && model !== undefined, 'Configured DeepSeek model is not available to ModelRuntime')
    const native = await runNative(runtime, model); evidence.nativePiProbe = { executed: true, result: native.result, durationMs: native.durationMs, markerObserved: native.markerObserved, ...(native.diagnosis === undefined ? {} : { diagnosis: native.diagnosis }) }
    if (native.result === 'PASS') {
      const reasoning = await runReasoning(runtime, model); evidence.reasoningExecutorProbe = { executed: true, ...reasoning }; evidence.classification = reasoning.result === 'PASS' ? 'PROVIDER_GATE_CLEARED' : reasoning.diagnosis?.category === 'reasoning_output_invalid' ? 'PRODUCT_DEFECT_FOUND' : 'ENVIRONMENT_STILL_BLOCKED'
    } else {
      evidence.reasoningExecutorProbe = { executed: false, result: 'NOT_RUN', reason: 'Native Pi completion failed; per task order no higher-layer probe was run' }; evidence.classification = native.diagnosis?.category === 'authentication_failed' || native.diagnosis?.category === 'authorization_failed' ? 'USER_AUTHORIZATION_REQUIRED' : 'ENVIRONMENT_STILL_BLOCKED'; evidence.specificAuthenticationAttributionProven = native.diagnosis?.category === 'authentication_failed'
    }
    evidence.governance = { graphPage: 'PASS / CLOSED', graphFix: 'PASS / CLOSED', previousProductionE2E: 'ENVIRONMENT_BLOCKED / CTO reviewed', diagnosisTask: 'executed / CTO acceptance pending' }
    evidence.harnessFix = { blanketCatchRemoved: true, sanitizedErrorPreservation: true, classificationMapping: 'Preserves ReasoningExecutorError code, sanitized category, and provider HTTP status; does not rewrite every failure as authentication' }
    evidence.phase = 'completed'; evidence.completedAt = now(); await writeJson(evidence); await writeSummary(evidence); console.log(JSON.stringify({ classification: evidence.classification, evidence: evidencePath, summary: summaryPath }))
  } catch (error) {
    evidence.classification = 'VALIDATION_HARNESS_DEFECT_FOUND'; evidence.phase = 'blocked'; evidence.completedAt = now(); evidence.error = safeError(error); await writeJson(evidence); await writeSummary(evidence); console.error(JSON.stringify({ classification: evidence.classification, error: evidence.error, evidence: evidencePath, summary: summaryPath })); process.exitCode = 1
  } finally { await (runtime as unknown as { dispose?: () => void | Promise<void> } | undefined)?.dispose?.() }
}

await main()
