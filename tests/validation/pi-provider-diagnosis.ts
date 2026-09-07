import type { ModelRuntime } from '@earendil-works/pi-coding-agent'

export type PiFailureCategory =
  | 'authentication_failed'
  | 'authorization_failed'
  | 'quota_or_billing'
  | 'rate_limited'
  | 'network_unavailable'
  | 'provider_unavailable'
  | 'model_unavailable'
  | 'timeout'
  | 'provider_protocol_error'
  | 'reasoning_output_invalid'
  | 'reasoning_executor_error'
  | 'unknown_external_failure'

export interface PiFailureDiagnosis {
  readonly errorCode?: string
  readonly category: PiFailureCategory
  readonly providerStatus?: number
  readonly safeMessage: string
}

function messageOf(error: unknown): string { return error instanceof Error ? error.message : String(error) }

function codeOf(error: unknown): string | undefined {
  if (!error || typeof error !== 'object') return undefined
  const code = (error as { readonly code?: unknown }).code
  return typeof code === 'string' ? code : undefined
}

function statusOf(message: string): number | undefined {
  const match = message.match(/(?:HTTP\s*)?\b(401|403|408|409|429|500|502|503|504)\b/i)
  return match === null ? undefined : Number(match[1])
}

function categoryOf(error: unknown, message: string, status: number | undefined): PiFailureCategory {
  const code = codeOf(error)
  if (status === 401 || /invalid\s+(?:api\s*)?key|authentication\s+fail|unauthenticated/i.test(message)) return 'authentication_failed'
  if (status === 403 || /forbidden|not authorized|authorization failed|permission denied/i.test(message)) return 'authorization_failed'
  if (status === 429 || /rate.?limit|too many requests/i.test(message)) return 'rate_limited'
  if (/quota|billing|credit|insufficient funds/i.test(message)) return 'quota_or_billing'
  if (code === 'reasoning_timeout' || /timed?\s*out|timeout/i.test(message)) return 'timeout'
  if (code === 'reasoning_output_invalid') return 'reasoning_output_invalid'
  if (/ENOTFOUND|ECONNRESET|ECONNREFUSED|network|fetch failed|socket|DNS/i.test(message)) return 'network_unavailable'
  if (/no available model|model.*(unavailable|not found)|unknown model/i.test(message)) return 'model_unavailable'
  if (/provider.*(unavailable|unknown)|no provider/i.test(message)) return 'provider_unavailable'
  if (/invalid JSON|malformed|unsupported completion|protocol|response format/i.test(message)) return 'provider_protocol_error'
  if (code === 'reasoning_configuration_invalid' || code === 'reasoning_execution_failed' || code === 'reasoning_host_unavailable' || code === 'reasoning_output_too_large') return 'reasoning_executor_error'
  return 'unknown_external_failure'
}

function safeMessage(category: PiFailureCategory): string {
  const messages: Record<PiFailureCategory, string> = {
    authentication_failed: 'Provider authentication was rejected',
    authorization_failed: 'Provider authorization was rejected',
    quota_or_billing: 'Provider quota or billing prevented completion',
    rate_limited: 'Provider rate limit prevented completion',
    network_unavailable: 'Provider network request was unavailable',
    provider_unavailable: 'Provider was unavailable',
    model_unavailable: 'Requested model was unavailable',
    timeout: 'Provider completion timed out',
    provider_protocol_error: 'Provider returned an incompatible completion response',
    reasoning_output_invalid: 'Reasoning output was not valid for the requested contract',
    reasoning_executor_error: 'PiReasoningExecutor reported an execution failure',
    unknown_external_failure: 'Completion failed with an unclassified external error',
  }
  return messages[category]
}

export function diagnosePiFailure(error: unknown): PiFailureDiagnosis {
  const message = messageOf(error); const status = statusOf(message); const category = categoryOf(error, message, status)
  return { ...(codeOf(error) === undefined ? {} : { errorCode: codeOf(error) }), category, ...(status === undefined ? {} : { providerStatus: status }), safeMessage: safeMessage(category) }
}

export function classifyE2EPreflightFailure(error: unknown): PiFailureDiagnosis & { readonly classification: 'ENVIRONMENT_BLOCKED' | 'PRODUCT_DEFECT' | 'VALIDATION_HARNESS_DEFECT' } {
  const diagnosis = diagnosePiFailure(error)
  const classification = diagnosis.category === 'reasoning_output_invalid' ? 'PRODUCT_DEFECT' : diagnosis.category === 'reasoning_executor_error' && diagnosis.errorCode === 'reasoning_configuration_invalid' ? 'VALIDATION_HARNESS_DEFECT' : 'ENVIRONMENT_BLOCKED'
  return { ...diagnosis, classification }
}

export async function safeCredentialMetadata(runtime: ModelRuntime, providerId: string): Promise<{ readonly runtimeCredentialEntryPresent: boolean; readonly credentialType?: 'api_key' | 'oauth'; readonly authCheckAvailable: boolean; readonly authSource?: string }> {
  const entries = await runtime.listCredentials(); const entry = entries.find((item) => item.providerId === providerId)
  const authCheck = await runtime.checkAuth(providerId).catch(() => undefined)
  return { runtimeCredentialEntryPresent: entry !== undefined, ...(entry === undefined ? {} : { credentialType: entry.type }), authCheckAvailable: authCheck !== undefined, ...(authCheck?.source === undefined ? {} : { authSource: authCheck.source }) }
}
