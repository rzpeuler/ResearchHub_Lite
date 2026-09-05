import type {
  ExistingKnowledgeProjection,
  ReviewCase,
  ReviewCaseActionability,
  ReviewCaseCategory,
  ReviewEvidenceBinding,
  ReviewProposalKind,
  ReviewRunManifest,
  ReviewSemanticProposal,
} from './contracts.ts'

const TELEMETRY_CATEGORIES = new Set<ReviewCaseCategory>(['invalid_reference', 'invalid_semantics'])
const NON_ACTIONABLE_ORIGINS = new Set(['extraction_rejection', 'consolidation_mirror', 'dependency_isolation'])
const KNOWN_ACTIONABILITY: Readonly<Record<string, ReviewCaseActionability>> = {
  relation_cardinality: 'knowledge_decision',
  reconciliation_review: 'knowledge_decision',
  theme_ambiguity: 'knowledge_decision',
  theme_creation: 'research_followup',
  schema_gap: 'schema_design',
}

export function isSafeReviewPathSegment(value: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value) && !value.includes('..')
}

function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value) }
function nonEmptyString(value: unknown): value is string { return typeof value === 'string' && value.trim() !== '' }
function stringArray(value: unknown, label: string, unique = false): asserts value is string[] {
  if (!Array.isArray(value) || value.some((item) => !nonEmptyString(item))) throw new Error(`${label} must be a non-empty string array`)
  if (unique && new Set(value).size !== value.length) throw new Error(`${label} must not contain duplicates`)
}
function optionalRecord(value: unknown, label: string): void { if (value !== undefined && value !== null && !isRecord(value)) throw new Error(`${label} must be an object or null`) }
function expectedActionability(category: string): ReviewCaseActionability | undefined { return KNOWN_ACTIONABILITY[category] }
function canonicalRef(value: unknown, kind: ReviewProposalKind, label: string): asserts value is string {
  if (!nonEmptyString(value) || !new RegExp(`^${kind}:[A-Za-z0-9][A-Za-z0-9._-]*$`).test(value)) throw new Error(`${label} must be a canonical ${kind} reference`)
}

export function validateReviewEvidenceBindings(bindings: readonly ReviewEvidenceBinding[]): void {
  const keys = new Set<string>()
  for (const binding of bindings) {
    if (!isRecord(binding) || binding.kind !== 'raw_document_block' || !nonEmptyString(binding.rawRef) || !nonEmptyString(binding.documentId) || !nonEmptyString(binding.blockId)) throw new Error('ReviewCase evidence binding is not a valid RawDocumentBlockEvidenceBinding')
    const key = `${binding.rawRef}\u0000${binding.documentId}\u0000${binding.blockId}`
    if (keys.has(key)) throw new Error(`Duplicate ReviewCase evidence binding: ${binding.blockId}`)
    keys.add(key)
  }
}

function validateSemanticPayload(kind: ReviewProposalKind, payload: unknown, semanticType: string, proposalId: string, label: string): void {
  if (!isRecord(payload) || payload.candidateId !== proposalId || !nonEmptyString(payload.candidateId) || !Array.isArray(payload.evidenceBlockRefs)) throw new Error(`Malformed ReviewCase ${label} semantic payload`)
  stringArray(payload.evidenceBlockRefs, `${label}.semanticPayload.evidenceBlockRefs`, true)
  if (kind === 'entity') {
    if (!nonEmptyString(payload.entityType) || payload.entityType !== semanticType || !nonEmptyString(payload.name)) throw new Error(`ReviewCase ${label} entity payload does not match its semantic kind`)
    if (payload.aliases !== undefined) stringArray(payload.aliases, `${label}.semanticPayload.aliases`)
    return
  }
  if (kind === 'relation') {
    if (!nonEmptyString(payload.relationType) || payload.relationType !== semanticType || !isRecord(payload.source) || !isRecord(payload.target) || !nonEmptyString(payload.source.candidateRef) || !nonEmptyString(payload.source.mention) || !nonEmptyString(payload.target.candidateRef) || !nonEmptyString(payload.target.mention)) throw new Error(`ReviewCase ${label} relation payload does not match its semantic kind`)
    optionalRecord(payload.attributes, `${label}.semanticPayload.attributes`)
    return
  }
  if (!nonEmptyString(payload.claimType) || payload.claimType !== semanticType || !nonEmptyString(payload.statement) || !Array.isArray(payload.subjectRefs) || payload.subjectRefs.length === 0 || payload.subjectRefs.some((subject) => !isRecord(subject) || !nonEmptyString(subject.candidateRef) || !nonEmptyString(subject.mention))) throw new Error(`ReviewCase ${label} claim payload does not match its semantic kind`)
  optionalRecord(payload.structuredValue, `${label}.semanticPayload.structuredValue`)
}

function validateProposal(value: unknown, label: string, expectedKind?: ReviewProposalKind): asserts value is ReviewSemanticProposal {
  if (!isRecord(value) || !nonEmptyString(value.proposalId) || !isSafeReviewPathSegment(value.proposalId) || (value.proposalKind !== 'entity' && value.proposalKind !== 'relation' && value.proposalKind !== 'claim') || (expectedKind !== undefined && value.proposalKind !== expectedKind) || !nonEmptyString(value.semanticType) || !('semanticPayload' in value) || !Array.isArray(value.evidenceBindings) || !Array.isArray(value.dependencyRefs)) throw new Error(`Malformed ReviewCase ${label}`)
  stringArray(value.dependencyRefs, `${label}.dependencyRefs`, true)
  if (value.dependencyRefs.includes(value.proposalId)) throw new Error(`ReviewCase ${label} cannot depend on itself`)
  validateSemanticPayload(value.proposalKind, value.semanticPayload, value.semanticType, value.proposalId, label)
  validateReviewEvidenceBindings(value.evidenceBindings as ReviewEvidenceBinding[])
}

function validateProjection(value: unknown, label: string): asserts value is ExistingKnowledgeProjection {
  if (!isRecord(value) || !nonEmptyString(value.canonicalRef) || (value.kind !== 'entity' && value.kind !== 'relation' && value.kind !== 'claim') || !nonEmptyString(value.semanticType) || !isRecord(value.payload)) throw new Error(`Malformed ReviewCase existing Knowledge projection: ${label}`)
  canonicalRef(value.canonicalRef, value.kind, `${label}.canonicalRef`)
  const payload = value.payload
  if (payload.kind !== value.kind) throw new Error(`ReviewCase existing Knowledge projection kind mismatch: ${label}`)
  if (value.kind === 'entity') {
    if (!nonEmptyString(payload.type) || value.semanticType !== payload.type || !nonEmptyString(payload.name) || !Array.isArray(payload.aliases) || payload.aliases.some((item: unknown) => !nonEmptyString(item))) throw new Error(`Malformed Entity projection: ${label}`)
    return
  }
  if (value.kind === 'relation') {
    if (!nonEmptyString(payload.type) || value.semanticType !== payload.type || !nonEmptyString(payload.sourceRef) || !nonEmptyString(payload.targetRef)) throw new Error(`Malformed Relation projection: ${label}`)
    optionalRecord(payload.attributes, `${label}.payload.attributes`)
    return
  }
  if (!nonEmptyString(payload.claimType) || value.semanticType !== payload.claimType || !nonEmptyString(payload.statement) || !Array.isArray(payload.subjectRefs) || payload.subjectRefs.some((item: unknown) => !nonEmptyString(item))) throw new Error(`Malformed Claim projection: ${label}`)
  optionalRecord(payload.structuredValue, `${label}.payload.structuredValue`)
}

export function validateReviewCase(value: unknown): asserts value is ReviewCase {
  if (!isRecord(value) || value.version !== '0.1' || !nonEmptyString(value.reviewCaseId) || !isSafeReviewPathSegment(value.reviewCaseId) || !nonEmptyString(value.knowledgeBaseId) || !nonEmptyString(value.producerType) || !nonEmptyString(value.producerRunId) || !isSafeReviewPathSegment(value.producerRunId) || !nonEmptyString(value.createdAt)) throw new Error('Malformed ReviewCase contract')
  if (!isRecord(value.classification) || !nonEmptyString(value.classification.category) || !nonEmptyString(value.classification.actionability) || !nonEmptyString(value.classification.origin) || !nonEmptyString(value.classification.stage) || !nonEmptyString(value.classification.rationale)) throw new Error(`Malformed ReviewCase classification: ${value.reviewCaseId}`)
  const expected = expectedActionability(value.classification.category)
  if (TELEMETRY_CATEGORIES.has(value.classification.category as ReviewCaseCategory) || NON_ACTIONABLE_ORIGINS.has(value.classification.origin) || (expected !== undefined && value.classification.actionability !== expected)) throw new Error(`ReviewCase classification is not actionable or is inconsistent: ${value.reviewCaseId}`)
  if (!isRecord(value.rootProposal)) throw new Error(`Malformed ReviewCase root proposal: ${value.reviewCaseId}`)
  validateProposal(value.rootProposal, 'rootProposal')
  if (!isRecord(value.suspendedProposalBundle) || !Array.isArray(value.suspendedProposalBundle.dependentProposals)) throw new Error(`Malformed ReviewCase suspended proposal bundle: ${value.reviewCaseId}`)
  const proposalIds = new Set<string>([value.rootProposal.proposalId])
  for (const [index, proposal] of value.suspendedProposalBundle.dependentProposals.entries()) {
    validateProposal(proposal, `suspendedProposalBundle.dependentProposals[${index}]`)
    if (proposalIds.has(proposal.proposalId)) throw new Error(`ReviewCase proposal bundle contains duplicate proposal: ${proposal.proposalId}`)
    proposalIds.add(proposal.proposalId)
  }
  if (!isRecord(value.resolutionContext) || !Array.isArray(value.resolutionContext.existingKnowledgeProjections) || value.resolutionContext.schemaVersionAtCreation !== '0.3' || typeof value.resolutionContext.knowledgeBaseRevisionAtCreation !== 'number' || !Number.isSafeInteger(value.resolutionContext.knowledgeBaseRevisionAtCreation) || value.resolutionContext.knowledgeBaseRevisionAtCreation < 0) throw new Error(`Malformed ReviewCase resolution context: ${value.reviewCaseId}`)
  if ((value.rootProposal.proposalKind === 'relation' || value.rootProposal.proposalKind === 'claim') && value.resolutionContext.existingKnowledgeProjections.length > 8) throw new Error(`ReviewCase existing Knowledge context exceeds the deterministic bound: ${value.reviewCaseId}`)
  const projectionRefs = new Set<string>()
  for (const [index, projection] of value.resolutionContext.existingKnowledgeProjections.entries()) { validateProjection(projection, `existingKnowledgeProjections[${index}]`); if (projectionRefs.has(projection.canonicalRef)) throw new Error(`ReviewCase existing Knowledge projections contain duplicate canonicalRef: ${projection.canonicalRef}`); projectionRefs.add(projection.canonicalRef) }
  if (value.resolutionContext.context !== undefined && (!isRecord(value.resolutionContext.context) || Object.values(value.resolutionContext.context).some((item) => item !== null && typeof item !== 'string' && typeof item !== 'number' && typeof item !== 'boolean'))) throw new Error(`Malformed ReviewCase context: ${value.reviewCaseId}`)
  if (!isRecord(value.impact) || typeof value.impact.dependentProposalCount !== 'number' || !Number.isSafeInteger(value.impact.dependentProposalCount) || value.impact.dependentProposalCount < 0 || !Array.isArray(value.impact.affectedProposalRefs)) throw new Error(`Malformed ReviewCase impact: ${value.reviewCaseId}`)
  stringArray(value.impact.affectedProposalRefs, `ReviewCase ${value.reviewCaseId}.impact.affectedProposalRefs`, true)
  const bundleIds = value.suspendedProposalBundle.dependentProposals.map((proposal) => proposal.proposalId).sort()
  if (value.impact.dependentProposalCount !== bundleIds.length || JSON.stringify([...value.impact.affectedProposalRefs].sort()) !== JSON.stringify(bundleIds)) throw new Error(`ReviewCase impact is inconsistent with its suspended proposal bundle: ${value.reviewCaseId}`)
  if (!isRecord(value.state) || value.state.status !== 'open') throw new Error(`ReviewCase is not open: ${value.reviewCaseId}`)
}

export function validateReviewRunManifest(value: unknown): asserts value is ReviewRunManifest {
  if (!isRecord(value) || value.version !== '0.1' || !nonEmptyString(value.knowledgeBaseId) || !nonEmptyString(value.producerType) || !nonEmptyString(value.producerRunId) || !isSafeReviewPathSegment(value.producerRunId) || typeof value.reviewCaseCount !== 'number' || !Number.isSafeInteger(value.reviewCaseCount) || value.reviewCaseCount < 1 || !Array.isArray(value.caseIds) || value.caseIds.some((id) => typeof id !== 'string' || !isSafeReviewPathSegment(id)) || typeof value.deterministicSetHash !== 'string' || !/^sha256:[0-9a-f]{64}$/.test(value.deterministicSetHash) || !nonEmptyString(value.createdAt) || value.schemaVersionAtCreation !== '0.3' || typeof value.knowledgeBaseRevisionAtCreation !== 'number' || !Number.isSafeInteger(value.knowledgeBaseRevisionAtCreation) || value.knowledgeBaseRevisionAtCreation < 0) throw new Error('Malformed ReviewCase run manifest')
  if (value.caseIds.length !== value.reviewCaseCount || new Set(value.caseIds).size !== value.caseIds.length || [...value.caseIds].sort().join('\u0000') !== value.caseIds.join('\u0000')) throw new Error('ReviewCase run manifest has duplicate, unsorted, or inconsistent case IDs')
}
