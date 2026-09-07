import type { ReasoningErrorCode } from '../../plugins/reasoning/errors.ts'

export type WorkflowDiagnosisClassification = 'ENVIRONMENT_BLOCKED' | 'PRODUCT_DEFECT' | 'VALIDATION_HARNESS_DEFECT' | 'PRODUCTION_OBSERVABILITY_CHANGE_REQUIRED'
export type WorkflowFailurePhase = 'INPUT_RESOLUTION' | 'RAW_ARCHIVE' | 'DOCUMENT_PARSE' | 'UNDERSTAND_AND_PLAN' | 'PLAN_VALIDATION' | 'PLAN_REPAIR' | 'EXTRACTION' | 'CONSOLIDATION' | 'KNOWLEDGE_RESOLUTION' | 'CHANGESET_PLANNING' | 'CHANGESET_VALIDATION' | 'WRITER' | 'FINAL_VALIDATION' | 'PROVIDER_REASONING' | 'UNKNOWN'
export type ReasoningDiagnosticCategory = 'authentication_failed' | 'authorization_failed' | 'quota_or_billing' | 'rate_limited' | 'network_unavailable' | 'provider_unavailable' | 'timeout' | 'provider_protocol_error' | 'reasoning_output_invalid' | 'reasoning_executor_error' | 'unknown_external_failure'

export interface WorkflowViewLike {
  readonly runId?: unknown
  readonly workflowType?: unknown
  readonly objective?: unknown
  readonly status?: unknown
  readonly progressSummary?: unknown
  readonly errorSummary?: unknown
  readonly reviewCount?: unknown
  readonly startedAt?: unknown
  readonly updatedAt?: unknown
  readonly completedAt?: unknown
}

export interface SafeWorkflowView {
  readonly runId: string
  readonly workflowType: string
  readonly objective: string
  readonly status: string
  readonly progressSummary?: string
  readonly errorSummary?: { readonly present: boolean; readonly category: string; readonly safeMessage: string }
  readonly reviewCount?: number
  readonly startedAt?: string
  readonly updatedAt?: string
  readonly completedAt?: string
}

export interface ReasoningCallDiagnosticInput {
  readonly operation: string
  readonly startedAt: string
  readonly durationMs: number
  readonly status: 'passed' | 'failed'
  readonly errorCode?: string
  readonly category?: string
  readonly providerStatus?: number
  readonly safeMessage?: string
}

export interface SafeReasoningCallDiagnostic {
  readonly operation: string
  readonly startedAt: string
  readonly durationMs: number
  readonly status: 'passed' | 'failed'
  readonly errorCode?: string
  readonly category?: string
  readonly providerStatus?: number
  readonly safeMessage?: string
}

export interface WorkflowDiagnosisInput {
  readonly terminal: SafeWorkflowView
  readonly reasoningCalls: readonly SafeReasoningCallDiagnostic[]
  readonly ingestionLog?: Record<string, unknown>
  readonly canonicalRevision: number
  readonly rawPresent: boolean
  readonly pathBoundary?: { readonly runtimeProductionWorkspaceSame?: boolean; readonly attachmentInsideRuntimeWorkspace?: boolean; readonly attachmentInsideProductionWorkspace?: boolean; readonly attachmentOutsideCanonicalKnowledge?: boolean; readonly attachmentPathMatchesResolvedPath?: boolean; readonly canonicalAttachmentPathPresent?: boolean; readonly productionWorkspaceReference?: string; readonly workspaceReferenceRelative?: boolean; readonly workspaceReferenceResolvesInsideRuntimeWorkspace?: boolean; readonly workspaceReferenceResolvesInsideProductionWorkspace?: boolean; readonly workspaceReferenceOutsideCanonicalKnowledge?: boolean }
}

export interface WorkflowDiagnosisResult {
  readonly classification: WorkflowDiagnosisClassification
  readonly failurePhase: WorkflowFailurePhase
  readonly rootCauseSummary: string
  readonly environmentCategory?: string
  readonly reasoningOperation?: string
}

function stringValue(value: unknown): string | undefined { return typeof value === 'string' && value.trim() !== '' ? value : undefined }
function safeText(value: string): string { return value.replace(/\b(?:sk|ghp)_[A-Za-z0-9._-]+\b/gi, '[redacted]').replace(/\b(?:api[_-]?key|token|password|secret|authorization)\s*[:=]?\s*[^\s,;]+/gi, '[redacted]').replace(/(?:[A-Za-z]:[\\/]|\\\\)[^\s"']+/g, '[path]').replace(/\s+/g, ' ').slice(0, 500) }
export function sanitizeDiagnosticText(value: string): string { return safeText(value) }
function statusCode(value: string): number | undefined { const match = value.match(/(?:HTTP\s*)?\b(400|401|403|408|409|422|429|500|502|503|504)\b/i); return match ? Number(match[1]) : undefined }

export function classifyReasoningError(input: { readonly code?: string; readonly message?: string; readonly providerStatus?: number }): { readonly category: ReasoningDiagnosticCategory; readonly environment: boolean; readonly safeMessage: string } {
  const message = input.message ?? ''
  const status = input.providerStatus ?? statusCode(message)
  if (status === 401 || /authentication|invalid\s+(?:api\s*)?key|unauthenticated/i.test(message)) return { category: 'authentication_failed', environment: true, safeMessage: 'Provider authentication failed' }
  if (status === 403 || /forbidden|authorization failed|permission denied|not authorized/i.test(message)) return { category: 'authorization_failed', environment: true, safeMessage: 'Provider authorization failed' }
  if (status === 429 || /rate.?limit|too many requests/i.test(message)) return { category: 'rate_limited', environment: true, safeMessage: 'Provider rate limit blocked completion' }
  if (/quota|billing|credit|insufficient funds/i.test(message)) return { category: 'quota_or_billing', environment: true, safeMessage: 'Provider quota or billing blocked completion' }
  if (input.code === 'reasoning_timeout' || /timed?\s*out|timeout/i.test(message)) return { category: 'timeout', environment: true, safeMessage: 'Provider reasoning timed out' }
  if (input.code === 'reasoning_output_invalid' || /reasoning[_ ]output[_ ]invalid|invalid[_ ]model[_ ]output|invalid json|schema validation|output contract/i.test(message)) return { category: 'reasoning_output_invalid', environment: false, safeMessage: 'Reasoning output failed the requested structured contract' }
  if (/ENOTFOUND|ECONNRESET|ECONNREFUSED|network|fetch failed|socket|DNS/i.test(message)) return { category: 'network_unavailable', environment: true, safeMessage: 'Provider network request was unavailable' }
  if (input.code === 'reasoning_host_unavailable' || /provider.*unavailable|no available model|unknown model/i.test(message)) return { category: 'provider_unavailable', environment: true, safeMessage: 'Provider or requested model was unavailable' }
  if (/protocol|response format|unsupported completion/i.test(message)) return { category: 'provider_protocol_error', environment: true, safeMessage: 'Provider returned an incompatible completion response' }
  if (input.code === 'reasoning_execution_failed' || input.code === 'reasoning_output_too_large') return { category: 'reasoning_executor_error', environment: false, safeMessage: 'PiReasoningExecutor reported an execution failure' }
  return { category: 'unknown_external_failure', environment: false, safeMessage: 'Reasoning failure was not classified by the available safe metadata' }
}

function summaryCategory(value: string): { readonly category: string; readonly classification: WorkflowDiagnosisClassification; readonly safeMessage: string } {
  const diagnosis = classifyReasoningError({ message: value })
  if (diagnosis.category !== 'unknown_external_failure') return { category: diagnosis.category, classification: diagnosis.environment ? 'ENVIRONMENT_BLOCKED' : 'PRODUCT_DEFECT', safeMessage: safeText(value) }
  if (/writer|changeset|canonical|revision|invariant|validation/i.test(value)) return { category: 'deterministic_production_failure', classification: 'PRODUCT_DEFECT', safeMessage: safeText(value) }
  return { category: 'unknown_workflow_failure', classification: 'VALIDATION_HARNESS_DEFECT', safeMessage: safeText(value) }
}

export function sanitizeWorkflowView(value: WorkflowViewLike): SafeWorkflowView {
  const runId = stringValue(value.runId) ?? 'unknown'
  const workflowType = stringValue(value.workflowType) ?? 'unknown'
  const objective = stringValue(value.objective) ?? 'unknown'
  const status = stringValue(value.status) ?? 'unknown'
  const progressSummary = stringValue(value.progressSummary)
  const rawError = stringValue(value.errorSummary)
  const error = rawError === undefined ? undefined : summaryCategory(rawError)
  const reviewCount = typeof value.reviewCount === 'number' && Number.isSafeInteger(value.reviewCount) && value.reviewCount >= 0 ? value.reviewCount : undefined
  return { runId, workflowType, objective, status, ...(progressSummary === undefined ? {} : { progressSummary: safeText(progressSummary) }), ...(error === undefined ? {} : { errorSummary: { present: true, category: error.category, safeMessage: error.safeMessage } }), ...(reviewCount === undefined ? {} : { reviewCount }), ...(typeof value.startedAt === 'string' ? { startedAt: value.startedAt } : {}), ...(typeof value.updatedAt === 'string' ? { updatedAt: value.updatedAt } : {}), ...(typeof value.completedAt === 'string' ? { completedAt: value.completedAt } : {}) }
}

export function sanitizeReasoningCall(input: ReasoningCallDiagnosticInput): SafeReasoningCallDiagnostic {
  const diagnosis = input.status === 'failed' ? classifyReasoningError({ code: input.errorCode, message: input.safeMessage, providerStatus: input.providerStatus }) : undefined
  return { operation: input.operation, startedAt: input.startedAt, durationMs: input.durationMs, status: input.status, ...(input.errorCode === undefined ? {} : { errorCode: input.errorCode }), ...(input.category === undefined && diagnosis === undefined ? {} : { category: input.category ?? diagnosis?.category }), ...(input.providerStatus === undefined ? {} : { providerStatus: input.providerStatus }), ...(input.status === 'failed' ? { safeMessage: diagnosis?.safeMessage ?? 'Reasoning call failed' } : {}) }
}

export function deriveFailurePhase(input: { readonly terminal: SafeWorkflowView; readonly reasoningCalls: readonly SafeReasoningCallDiagnostic[]; readonly ingestionLog?: Record<string, unknown>; readonly rawPresent: boolean; readonly canonicalRevision: number }): WorkflowFailurePhase {
  const failed = input.reasoningCalls.find((call) => call.status === 'failed')
  if (failed) return 'PROVIDER_REASONING'
  const stage = String(input.ingestionLog?.failureStage ?? input.ingestionLog?.stage ?? '').toUpperCase()
  const known: WorkflowFailurePhase[] = ['INPUT_RESOLUTION', 'RAW_ARCHIVE', 'DOCUMENT_PARSE', 'UNDERSTAND_AND_PLAN', 'PLAN_VALIDATION', 'PLAN_REPAIR', 'EXTRACTION', 'CONSOLIDATION', 'KNOWLEDGE_RESOLUTION', 'CHANGESET_PLANNING', 'CHANGESET_VALIDATION', 'WRITER', 'FINAL_VALIDATION', 'PROVIDER_REASONING']
  const matched = known.find((candidate) => stage === candidate)
  if (matched) return matched
  const errorCategory = input.terminal.errorSummary?.category ?? ''
  if (/writer|changeset|canonical|revision|invariant/i.test(errorCategory)) return 'WRITER'
  if (!input.rawPresent && input.reasoningCalls.length === 0 && (input.ingestionLog === undefined || input.ingestionLog.present === false)) return 'INPUT_RESOLUTION'
  if (!input.rawPresent) return 'RAW_ARCHIVE'
  if (input.canonicalRevision > 0) return 'FINAL_VALIDATION'
  return 'UNKNOWN'
}

export function classifyWorkflowFailure(input: WorkflowDiagnosisInput): WorkflowDiagnosisResult {
  const phase = deriveFailurePhase(input)
  const failedReasoning = input.reasoningCalls.find((call) => call.status === 'failed')
  const failedDiagnosis = failedReasoning ? classifyReasoningError({ code: failedReasoning.errorCode, message: failedReasoning.safeMessage, providerStatus: failedReasoning.providerStatus }) : undefined
  const terminalCategory = input.terminal.errorSummary?.category
  if (failedDiagnosis?.environment || ['authentication_failed', 'authorization_failed', 'quota_or_billing', 'rate_limited', 'network_unavailable', 'provider_unavailable', 'timeout'].includes(terminalCategory ?? '')) return { classification: 'ENVIRONMENT_BLOCKED', failurePhase: phase, rootCauseSummary: failedDiagnosis?.safeMessage ?? 'Workflow terminal error is attributable to the provider environment', environmentCategory: failedDiagnosis?.category ?? terminalCategory, ...(failedReasoning === undefined ? {} : { reasoningOperation: failedReasoning.operation }) }
  if (failedDiagnosis?.category === 'reasoning_output_invalid' || terminalCategory === 'reasoning_output_invalid' || terminalCategory === 'deterministic_production_failure') {
    const detail = input.terminal.errorSummary?.safeMessage
    const boundaryConsistent = input.pathBoundary?.runtimeProductionWorkspaceSame === true && input.pathBoundary.attachmentInsideRuntimeWorkspace === true && input.pathBoundary.attachmentInsideProductionWorkspace === true && input.pathBoundary.attachmentOutsideCanonicalKnowledge === true && (input.pathBoundary.attachmentPathMatchesResolvedPath === undefined || input.pathBoundary.attachmentPathMatchesResolvedPath === true)
    const resolvedBoundaryMismatch = input.pathBoundary?.runtimeProductionWorkspaceSame === true && input.pathBoundary.attachmentInsideRuntimeWorkspace === true && input.pathBoundary.attachmentOutsideCanonicalKnowledge === true && (input.pathBoundary.attachmentPathMatchesResolvedPath === false || input.pathBoundary.attachmentInsideProductionWorkspace !== true)
    const rootCauseSummary = resolvedBoundaryMismatch && detail?.includes('workspaceFile') === true
      ? 'AttachmentService returned a canonical attachment path that ProductionService rejected against its lexical workspace boundary on Windows; the failure is deterministic INPUT_RESOLUTION path canonicalization/wiring'
      : boundaryConsistent && detail?.includes('workspaceFile') === true
        ? 'ProductionService rejected a controlled attachment path during INPUT_RESOLUTION even though Runtime and ProductionService workspace boundaries agreed; this is a deterministic application path-wiring/boundary defect'
        : detail === undefined ? 'Production workflow crossed a deterministic model/Knowledge contract boundary' : `Production workflow failed at ${phase}: ${detail}`
    return { classification: 'PRODUCT_DEFECT', failurePhase: phase, rootCauseSummary, ...(failedReasoning === undefined ? {} : { reasoningOperation: failedReasoning.operation }) }
  }
  if (input.terminal.status === 'failed' && input.terminal.errorSummary === undefined) return { classification: 'PRODUCTION_OBSERVABILITY_CHANGE_REQUIRED', failurePhase: phase, rootCauseSummary: 'Terminal failure did not expose a safe errorSummary' }
  return { classification: 'VALIDATION_HARNESS_DEFECT', failurePhase: phase, rootCauseSummary: 'Terminal failure was retained but its root cause remains unclassified by safe available metadata' }
}

export function isReasoningErrorCode(value: unknown): value is ReasoningErrorCode { return typeof value === 'string' && ['reasoning_host_unavailable', 'reasoning_configuration_invalid', 'reasoning_execution_failed', 'reasoning_timeout', 'reasoning_output_invalid', 'reasoning_output_too_large'].includes(value) }
