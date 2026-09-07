export type Dict = Record<string, unknown>

function isDict(value: unknown): value is Dict { return typeof value === 'object' && value !== null && !Array.isArray(value) }
function stringValue(value: unknown, fallback: string): string { return typeof value === 'string' && value.trim() !== '' ? value : fallback }
function optionalString(value: unknown): string | undefined { return typeof value === 'string' ? value : undefined }
function safeText(value: string): string { return value.replace(/\b(?:sk|ghp)_[A-Za-z0-9._-]+\b/gi, '[redacted]').replace(/\b(?:api[_-]?key|token|password|secret|authorization)\s*[:=]?\s*[^\s,;]+/gi, '[redacted]').replace(/(?:[A-Za-z]:[\\/]|\\\\)[^\s"']+/g, '[path]').replace(/\s+/g, ' ').slice(0, 500) }
function looksLikeAbsolutePath(value: unknown): boolean { return typeof value === 'string' && /^(?:[A-Za-z]:[\\/]|\\\\|\/)/.test(value) }

export function captureProductionStart(value: Dict): Dict {
  const workflow = isDict(value.workflow) ? value.workflow : value
  return {
    runId: stringValue(value.runId ?? workflow.runId, 'unknown'),
    initialStatus: stringValue(workflow.status, 'unknown'),
    workflowType: stringValue(workflow.workflowType, 'unknown'),
    objective: stringValue(workflow.objective, 'unknown'),
  }
}

export function captureProductionTerminal(value: Dict): Dict {
  const evidence: Dict = {
    runId: stringValue(value.runId, 'unknown'),
    status: stringValue(value.status, 'unknown'),
    progressSummary: stringValue(value.progressSummary, 'unknown'),
  }
  const errorSummary = optionalString(value.errorSummary)
  if (errorSummary !== undefined) evidence.errorSummary = safeText(errorSummary)
  if (typeof value.reviewCount === 'number' && Number.isSafeInteger(value.reviewCount) && value.reviewCount >= 0) evidence.reviewCount = value.reviewCount
  for (const field of ['startedAt', 'updatedAt', 'completedAt']) {
    const valueForField = optionalString(value[field])
    if (valueForField !== undefined) evidence[field] = valueForField
  }
  return evidence
}

export function classifyProductionTerminal(status: string): { readonly pollStage: 'PASS'; readonly terminalStage: 'PASS' | 'FAIL'; readonly classification: 'SUCCESS' | 'PRODUCT_DEFECT' } {
  const success = status === 'completed' || status === 'completed_with_review'
  return { pollStage: 'PASS', terminalStage: success ? 'PASS' : 'FAIL', classification: success ? 'SUCCESS' : 'PRODUCT_DEFECT' }
}

export function attachmentDtoEvidence(attachment: Dict): Dict {
  const publicDtoExposesWorkspaceReference = Object.hasOwn(attachment, 'workspaceRelativePath')
  const publicDtoExposesPath = Object.hasOwn(attachment, 'path')
  const publicDtoExposesAbsolutePath = Object.values(attachment).some(looksLikeAbsolutePath)
  return { publicDtoExposesWorkspaceReference, publicDtoExposesPath, publicDtoExposesAbsolutePath, valid: !publicDtoExposesWorkspaceReference && !publicDtoExposesPath && !publicDtoExposesAbsolutePath }
}
