import type { ReviewCase, ReviewEvidenceBinding, ReviewRunManifest } from './contracts.ts'

export function isSafeReviewPathSegment(value: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value) && !value.includes('..')
}

function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value) }

export function validateReviewEvidenceBindings(bindings: readonly ReviewEvidenceBinding[]): void {
  const keys = new Set<string>()
  for (const binding of bindings) {
    if (binding.kind !== 'raw_document_block' || binding.rawRef.trim() === '' || binding.documentId.trim() === '' || binding.blockId.trim() === '') throw new Error('ReviewCase evidence binding is not a valid RawDocumentBlockEvidenceBinding')
    const key = `${binding.rawRef}\u0000${binding.documentId}\u0000${binding.blockId}`
    if (keys.has(key)) throw new Error(`Duplicate ReviewCase evidence binding: ${binding.blockId}`)
    keys.add(key)
  }
}

export function validateReviewCase(value: unknown): asserts value is ReviewCase {
  if (!isRecord(value) || value.version !== '0.1' || typeof value.reviewCaseId !== 'string' || !isSafeReviewPathSegment(value.reviewCaseId) || typeof value.knowledgeBaseId !== 'string' || typeof value.producerType !== 'string' || value.producerType.trim() === '' || typeof value.producerRunId !== 'string' || !isSafeReviewPathSegment(value.producerRunId) || typeof value.createdAt !== 'string') throw new Error('Malformed ReviewCase contract')
  if (!isRecord(value.classification) || typeof value.classification.category !== 'string' || typeof value.classification.actionability !== 'string' || typeof value.classification.origin !== 'string' || typeof value.classification.stage !== 'string' || typeof value.classification.rationale !== 'string') throw new Error(`Malformed ReviewCase classification: ${value.reviewCaseId}`)
  if (!isRecord(value.rootProposal) || typeof value.rootProposal.proposalId !== 'string' || !isSafeReviewPathSegment(value.rootProposal.proposalId) || (value.rootProposal.proposalKind !== 'entity' && value.rootProposal.proposalKind !== 'relation' && value.rootProposal.proposalKind !== 'claim') || !('semanticPayload' in value.rootProposal) || !Array.isArray(value.rootProposal.evidenceBindings) || !Array.isArray(value.rootProposal.dependencyRefs)) throw new Error(`Malformed ReviewCase root proposal: ${value.reviewCaseId}`)
  validateReviewEvidenceBindings(value.rootProposal.evidenceBindings as ReviewEvidenceBinding[])
  for (const proposal of (isRecord(value.suspendedProposalBundle) && Array.isArray(value.suspendedProposalBundle.dependentProposals) ? value.suspendedProposalBundle.dependentProposals : [])) {
    if (!isRecord(proposal) || typeof proposal.proposalId !== 'string' || !isSafeReviewPathSegment(proposal.proposalId) || !Array.isArray(proposal.evidenceBindings) || !Array.isArray(proposal.dependencyRefs)) throw new Error(`Malformed ReviewCase dependent proposal: ${value.reviewCaseId}`)
    validateReviewEvidenceBindings(proposal.evidenceBindings as ReviewEvidenceBinding[])
  }
  if (!isRecord(value.resolutionContext) || !Array.isArray(value.resolutionContext.existingKnowledgeProjections) || value.resolutionContext.schemaVersionAtCreation !== '0.3' || typeof value.resolutionContext.knowledgeBaseRevisionAtCreation !== 'number' || !Number.isSafeInteger(value.resolutionContext.knowledgeBaseRevisionAtCreation) || value.resolutionContext.knowledgeBaseRevisionAtCreation < 0) throw new Error(`Malformed ReviewCase resolution context: ${value.reviewCaseId}`)
  if (!isRecord(value.impact) || typeof value.impact.dependentProposalCount !== 'number' || !Number.isSafeInteger(value.impact.dependentProposalCount) || value.impact.dependentProposalCount < 0 || !Array.isArray(value.impact.affectedProposalRefs)) throw new Error(`Malformed ReviewCase impact: ${value.reviewCaseId}`)
  if (!isRecord(value.state) || value.state.status !== 'open') throw new Error(`ReviewCase is not open: ${value.reviewCaseId}`)
}

export function validateReviewRunManifest(value: unknown): asserts value is ReviewRunManifest {
  if (!isRecord(value) || value.version !== '0.1' || typeof value.knowledgeBaseId !== 'string' || typeof value.producerType !== 'string' || value.producerType.trim() === '' || typeof value.producerRunId !== 'string' || !isSafeReviewPathSegment(value.producerRunId) || typeof value.reviewCaseCount !== 'number' || !Number.isSafeInteger(value.reviewCaseCount) || value.reviewCaseCount < 1 || !Array.isArray(value.caseIds) || value.caseIds.some((id) => typeof id !== 'string' || !isSafeReviewPathSegment(id)) || typeof value.deterministicSetHash !== 'string' || typeof value.createdAt !== 'string' || value.schemaVersionAtCreation !== '0.3' || typeof value.knowledgeBaseRevisionAtCreation !== 'number' || !Number.isSafeInteger(value.knowledgeBaseRevisionAtCreation) || value.knowledgeBaseRevisionAtCreation < 0) throw new Error('Malformed ReviewCase run manifest')
  if (value.caseIds.length !== value.reviewCaseCount || new Set(value.caseIds).size !== value.caseIds.length) throw new Error('ReviewCase run manifest has duplicate or inconsistent case IDs')
}
