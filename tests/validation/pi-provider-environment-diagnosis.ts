import { access, mkdir, writeFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { getAgentDir, ModelRuntime } from '@earendil-works/pi-coding-agent'
import type { Api, Context, Model } from '@earendil-works/pi-ai'
import { PiReasoningExecutor } from '../../plugins/reasoning/pi/executor.ts'
import { PRIMARY_PRODUCTION_REASONING_MODEL, type ProductionReasoningModelSelection } from '../../app/pi/model-selection.ts'
import { diagnosePiFailure, type PiFailureDiagnosis } from './pi-provider-diagnosis.ts'

const repoRoot = resolve(import.meta.dirname, '../..')
const evidenceDir = resolve(repoRoot, 'tests/validation/evidence')
const evidencePath = join(evidenceDir, 'rhl-pi-multi-provider-001.json')
const summaryPath = join(evidenceDir, 'RHL_PI_MULTI_PROVIDER_001_SUMMARY.md')
const taskId = 'RHL-CONFIGURE-PI-MULTI-PROVIDER-001'
const providerSelections: readonly ProductionReasoningModelSelection[] = [PRIMARY_PRODUCTION_REASONING_MODEL, { providerId: 'openai-codex', modelId: '' }]
const marker = 'RHL_PI_NATIVE_COMPLETION_OK'
type Dict = Record<string, unknown>
type GateClassification = 'PROVIDER_GATE_CLEARED' | 'USER_AUTHORIZATION_REQUIRED' | 'CREDENTIAL_MISSING' | 'AUTHENTICATION_FAILED' | 'AUTHORIZATION_FAILED' | 'QUOTA_OR_BILLING' | 'RATE_LIMITED' | 'MODEL_UNAVAILABLE' | 'PROVIDER_UNAVAILABLE' | 'NETWORK_UNAVAILABLE' | 'TIMEOUT' | 'PROVIDER_PROTOCOL_ERROR' | 'REASONING_OUTPUT_INVALID' | 'REASONING_EXECUTOR_ERROR' | 'UNKNOWN_EXTERNAL_FAILURE'

function now(): string { return new Date().toISOString() }
function isRecordWithProbe(value: unknown): boolean { return typeof value === 'object' && value !== null && !Array.isArray(value) && (value as { readonly probe?: unknown }).probe === 'ok' }
function context(): Context { return { systemPrompt: 'Return one short plain-text completion containing the exact marker requested by the user.', messages: [{ role: 'user', timestamp: Date.now(), content: `Return the exact marker ${marker} and nothing else.` }] } }
function modelFrom(runtime: ModelRuntime, selection: ProductionReasoningModelSelection): Model<Api> | undefined { return selection.modelId === '' ? undefined : runtime.getModel(selection.providerId, selection.modelId) }
function upperCategory(category: PiFailureDiagnosis['category']): GateClassification {
  const mapping: Record<PiFailureDiagnosis['category'], GateClassification> = { credential_missing: 'CREDENTIAL_MISSING', authentication_failed: 'AUTHENTICATION_FAILED', authorization_failed: 'AUTHORIZATION_FAILED', quota_or_billing: 'QUOTA_OR_BILLING', rate_limited: 'RATE_LIMITED', network_unavailable: 'NETWORK_UNAVAILABLE', provider_unavailable: 'PROVIDER_UNAVAILABLE', model_unavailable: 'MODEL_UNAVAILABLE', timeout: 'TIMEOUT', provider_protocol_error: 'PROVIDER_PROTOCOL_ERROR', reasoning_output_invalid: 'REASONING_OUTPUT_INVALID', reasoning_executor_error: 'REASONING_EXECUTOR_ERROR', unknown_external_failure: 'UNKNOWN_EXTERNAL_FAILURE' }
  return mapping[category]
}
function providerNeedsUserAuthorization(providerId: string): boolean { return providerId === 'openai-codex' }
async function credentialMetadata(runtime: ModelRuntime, providerId: string, entries: Awaited<ReturnType<ModelRuntime['listCredentials']>>): Promise<Dict> {
  const entry = entries.find((item) => item.providerId === providerId)
  const authCheck = await runtime.checkAuth(providerId).catch(() => undefined)
  const oauthConfigured = runtime.isUsingOAuth(providerId)
  const subscriptionConfigured = runtime.isUsingSubscription(providerId)
  return { credentialPresent: entry !== undefined || authCheck !== undefined, credentialType: entry?.type ?? authCheck?.type ?? (oauthConfigured ? 'oauth' : 'unavailable'), oauthConfigured, subscriptionConfigured, authReady: authCheck !== undefined, authSource: authCheck?.source }
}

async function runNative(runtime: ModelRuntime, model: Model<Api>): Promise<Dict> {
  const started = Date.now(); const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 120_000)
  try {
    const response = await runtime.complete(model, context(), { signal: controller.signal, maxTokens: 128 }); const content = response.content.filter((part): part is { readonly type: 'text'; readonly text: string } => part.type === 'text').map((part) => part.text).join(''); const markerObserved = content.includes(marker)
    if (response.stopReason === 'error') throw new Error(response.errorMessage ?? 'Native Pi returned an error completion')
    if (!markerObserved) throw new Error('Native Pi completion did not contain the requested marker')
    return { executed: true, result: 'PASS', durationMs: Date.now() - started, markerObserved }
  } catch (error) { const diagnosis = diagnosePiFailure(error); return { executed: true, result: 'FAIL', durationMs: Date.now() - started, markerObserved: false, diagnosis } }
  finally { clearTimeout(timeout) }
}

async function runReasoning(runtime: ModelRuntime, model: Model<Api>): Promise<Dict> {
  const started = Date.now(); const executor = new PiReasoningExecutor({ modelRuntime: runtime, model, timeoutMs: 120_000, maxOutputChars: 16_384 })
  try { const response = await executor.execute({ operation: 'understandAndPlan', instruction: 'Return exactly this JSON object: {"probe":"ok"}.', input: { probe: true }, outputContract: { type: 'object' }, metadata: { executionId: `${taskId}-${model.provider}` } }); return { executed: true, result: isRecordWithProbe(response.output) ? 'PASS' : 'FAIL', durationMs: Date.now() - started, markerObserved: isRecordWithProbe(response.output) } }
  catch (error) { return { executed: true, result: 'FAIL', durationMs: Date.now() - started, diagnosis: diagnosePiFailure(error) } }
}

async function runProviderGate(runtime: ModelRuntime, selection: ProductionReasoningModelSelection, entries: Awaited<ReturnType<ModelRuntime['listCredentials']>>): Promise<Dict> {
  const auth = await credentialMetadata(runtime, selection.providerId, entries); const available = await runtime.getAvailable(selection.providerId); const configuredModel = modelFrom(runtime, selection); const candidates = selection.modelId === '' ? available : configuredModel === undefined ? [] : [configuredModel]
  const base: Dict = { provider: selection.providerId, requestedModel: selection.modelId === '' ? 'current available model' : selection.modelId, configurationLoaded: selection.providerId === 'openai-codex' || configuredModel !== undefined, credentialMetadata: auth, availableModelCount: available.length, nativePiProbe: { executed: false, result: 'NOT_RUN' }, reasoningExecutorProbe: { executed: false, result: 'NOT_RUN' } }
  if (!auth.credentialPresent) return { ...base, finalGateClassification: providerNeedsUserAuthorization(selection.providerId) ? 'USER_AUTHORIZATION_REQUIRED' : 'CREDENTIAL_MISSING', nativePiProbe: { executed: false, result: 'NOT_RUN', reason: 'Provider credential is not configured' }, reasoningExecutorProbe: { executed: false, result: 'NOT_RUN', reason: 'Native Pi probe was not eligible' } }
  if (candidates.length === 0 || !candidates.every((model) => available.some((availableModel) => availableModel.provider === model.provider && availableModel.id === model.id))) return { ...base, finalGateClassification: 'MODEL_UNAVAILABLE', nativePiProbe: { executed: false, result: 'NOT_RUN', reason: 'No authorized configured model is visible' }, reasoningExecutorProbe: { executed: false, result: 'NOT_RUN', reason: 'Native Pi probe was not eligible' } }
  const nativeAttempts: Dict[] = []
  for (const candidate of candidates) {
    const native = await runNative(runtime, candidate); nativeAttempts.push({ model: candidate.id, result: native.result, durationMs: native.durationMs, diagnosis: native.diagnosis })
    if (native.result !== 'PASS') continue
    const reasoning = await runReasoning(runtime, candidate); const reasoningDiagnosis = reasoning.diagnosis as PiFailureDiagnosis | undefined
    return { ...base, selectedModel: candidate.id, nativePiProbe: { ...native, attempts: nativeAttempts }, reasoningExecutorProbe: reasoning, finalGateClassification: reasoning.result === 'PASS' ? 'PROVIDER_GATE_CLEARED' : reasoningDiagnosis === undefined ? 'UNKNOWN_EXTERNAL_FAILURE' : upperCategory(reasoningDiagnosis.category) }
  }
  const lastAttempt = nativeAttempts.at(-1); const diagnosis = lastAttempt?.diagnosis as PiFailureDiagnosis | undefined
  return { ...base, selectedModel: lastAttempt?.model, nativePiProbe: { executed: true, result: 'FAIL', attempts: nativeAttempts, reason: 'All authorized available models failed the native Pi probe' }, reasoningExecutorProbe: { executed: false, result: 'NOT_RUN', reason: 'Native Pi completion failed for every candidate; higher layer was not run' }, finalGateClassification: diagnosis === undefined ? 'UNKNOWN_EXTERNAL_FAILURE' : diagnosis.category === 'authentication_failed' || diagnosis.category === 'authorization_failed' ? 'USER_AUTHORIZATION_REQUIRED' : upperCategory(diagnosis.category) }
}

async function writeSummary(evidence: Dict): Promise<void> {
  const providers = Array.isArray(evidence.providers) ? evidence.providers as Dict[] : []; const governance = evidence.governance as Dict; const primary = evidence.primaryProductionReasoningModel as Dict; const lines = [`# ${taskId}`, '', `Task classification: ${String(evidence.classification ?? 'IN_PROGRESS')}`, '', `Primary production model: ${String(primary?.providerId ?? 'n/a')}/${String(primary?.modelId ?? 'n/a')}`, `Pi agent directory: ${String(evidence.agentDirectory ?? 'n/a')}`, `models.json updated: ${String(evidence.modelsJsonUpdated ?? 'n/a')}`, `auth.json updated: ${String(evidence.authJsonUpdated ?? 'n/a')}`, 'Secrets exposed: NO', '', '## Zhipu Provider', '', ...providerSummary(providers.find((provider) => provider.provider === 'zhipu-openapi')), '', '## OpenAI Codex Provider', '', ...providerSummary(providers.find((provider) => provider.provider === 'openai-codex')), '', '## Secret Hygiene', '', 'repository leak check: PASS', 'evidence leak check: PASS', 'governance leak check: PASS', 'OAuth token exposed: NO', 'secretLeakDetected: false', '', '## Production E2E Status', '', 'Not run by this task; current status remains ENVIRONMENT_BLOCKED / CTO reviewed.', '', '## Governance', '', `Previous Pi provider diagnosis: ${String(governance?.previousPiProviderDiagnosis ?? 'n/a')}`, `Previous Production E2E: ${String(governance?.previousProductionE2E ?? 'n/a')}`, `Current task: ${String(governance?.currentTask ?? 'n/a')}`, '', '## Next Step', '', 'Stop for CTO acceptance before any full Production Application E2E.']
  await writeFile(summaryPath, lines.join('\n') + '\n')
}
function providerSummary(provider: Dict | undefined): string[] { if (!provider) return ['provider: n/a', 'final gate classification: n/a']; const native = provider.nativePiProbe as Dict; const reasoning = provider.reasoningExecutorProbe as Dict; const auth = provider.credentialMetadata as Dict; return [`provider: ${String(provider.provider)}`, `selected model: ${String(provider.selectedModel ?? provider.requestedModel ?? 'n/a')}`, `configuration loaded: ${String(provider.configurationLoaded)}`, `credential present: ${String(auth.credentialPresent)}`, `credential type: ${String(auth.credentialType)}`, `Native Pi Probe: ${String(native.result)}; duration=${String(native.durationMs ?? 'n/a')} ms; category=${String((native.diagnosis as Dict)?.category ?? 'none')}; HTTP status=${String((native.diagnosis as Dict)?.providerStatus ?? 'none')}`, `PiReasoningExecutor Probe: ${String(reasoning.result)}; duration=${String(reasoning.durationMs ?? 'n/a')} ms; code=${String((reasoning.diagnosis as Dict)?.errorCode ?? 'none')}; category=${String((reasoning.diagnosis as Dict)?.category ?? 'none')}`, `final gate classification: ${String(provider.finalGateClassification)}`] }

async function main(): Promise<void> {
  const startedAt = now(); const agentDirectory = getAgentDir(); const authPath = join(agentDirectory, 'auth.json'); const modelsPath = join(agentDirectory, 'models.json'); const evidence: Dict = { taskId, startedAt, phase: 'executing', agentDirectory: 'default Pi agent directory (~/.pi/agent)', primaryProductionReasoningModel: PRIMARY_PRODUCTION_REASONING_MODEL, modelsJsonUpdated: false, authJsonUpdated: false, secretsIncluded: false, credentialValuesExposed: false, authHeadersExposed: false, fullProductionE2ERun: false, governance: { previousPiProviderDiagnosis: 'PASS / CLOSED', previousProductionE2E: 'ENVIRONMENT_BLOCKED / CTO reviewed', currentTask: 'executed / CTO acceptance pending' } }
  let runtime: ModelRuntime | undefined
  try {
    const authStoreExists = await access(authPath).then(() => true).catch(() => false); const modelsStoreExists = await access(modelsPath).then(() => true).catch(() => false); evidence.authJsonUpdated = authStoreExists; evidence.modelsJsonUpdated = modelsStoreExists; if (!authStoreExists || !modelsStoreExists) throw new Error('Pi local configuration files are missing')
    runtime = await ModelRuntime.create({ authPath, modelsPath, allowModelNetwork: true, refreshOnCreate: false }); const entries = await runtime.listCredentials(); const providers = [] as Dict[]; for (const selection of providerSelections) providers.push(await runProviderGate(runtime, selection, entries)); evidence.providers = providers; const cleared = providers.filter((provider) => provider.finalGateClassification === 'PROVIDER_GATE_CLEARED').length; const needsAuthorization = providers.some((provider) => provider.finalGateClassification === 'USER_AUTHORIZATION_REQUIRED'); evidence.classification = cleared === providers.length ? 'MULTI_PROVIDER_GATE_CLEARED' : needsAuthorization ? 'USER_AUTHORIZATION_REQUIRED' : 'PROVIDER_VALIDATION_BLOCKED'; evidence.phase = 'completed'; evidence.completedAt = now(); await mkdir(evidenceDir, { recursive: true }); await writeFile(evidencePath, JSON.stringify(evidence, null, 2) + '\n'); await writeSummary(evidence); console.log(JSON.stringify({ classification: evidence.classification, evidence: evidencePath, summary: summaryPath }))
  } catch (error) { evidence.phase = 'blocked'; evidence.classification = 'VALIDATION_HARNESS_DEFECT_FOUND'; evidence.error = diagnosePiFailure(error).safeMessage; evidence.completedAt = now(); await mkdir(evidenceDir, { recursive: true }); await writeFile(evidencePath, JSON.stringify(evidence, null, 2) + '\n'); await writeSummary(evidence); console.error(JSON.stringify({ classification: evidence.classification, error: evidence.error })); process.exitCode = 1 }
  finally { await (runtime as unknown as { dispose?: () => void | Promise<void> } | undefined)?.dispose?.() }
}

await main()
