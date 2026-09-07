import { createHash } from 'node:crypto'

type Dict = Record<string, unknown>

export function setEvidenceClassification(evidence: Dict, classification: string): void {
  evidence.currentRun = classification
  evidence.classification = classification
}

export class RestartPersistenceValidationError extends Error {
  constructor(message: string) { super(message); this.name = 'RestartPersistenceValidationError' }
}

function isDict(value: unknown): value is Dict { return typeof value === 'object' && value !== null && !Array.isArray(value) }
function requireCondition(condition: unknown, message: string): asserts condition { if (!condition) throw new RestartPersistenceValidationError(message) }
function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`
  if (isDict(value)) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`
  return JSON.stringify(value)
}
function sha256(value: string): string { return createHash('sha256').update(value, 'utf8').digest('hex') }

export interface CanonicalSnapshotInput { readonly revision: number; readonly counts: Dict; readonly refs: readonly string[] }
export interface CanonicalPersistenceResult { readonly revisionStable: true; readonly countsStable: true; readonly canonicalStable: true; readonly refHash: string }

export function canonicalRefHash(refs: readonly string[]): string { return sha256(stable([...refs].sort((left, right) => left.localeCompare(right)))) }

export function verifyRuntimeInstanceIndependence(left: object, right: object): true {
  requireCondition(left !== right, 'Runtime restart verifier received the same Runtime instance')
  return true
}

export function verifyCanonicalPersistence(before: CanonicalSnapshotInput, after: CanonicalSnapshotInput): CanonicalPersistenceResult {
  requireCondition(before.revision === after.revision, `Knowledge revision changed across restart: ${before.revision} -> ${after.revision}`)
  requireCondition(stable(before.counts) === stable(after.counts), 'Knowledge counts changed across restart')
  const beforeRefs = [...before.refs].sort((left, right) => left.localeCompare(right)); const afterRefs = [...after.refs].sort((left, right) => left.localeCompare(right))
  requireCondition(stable(beforeRefs) === stable(afterRefs), 'Canonical ref set changed across restart')
  const refHash = canonicalRefHash(beforeRefs)
  requireCondition(refHash === canonicalRefHash(afterRefs), 'Canonical ref hash changed across restart')
  return { revisionStable: true, countsStable: true, canonicalStable: true, refHash }
}

export interface RawSnapshotInput { readonly rawRef: string; readonly sizeBytes: number; readonly contentHash: string; readonly integrity: boolean }
export interface RawPersistenceResult { readonly rawStable: true; readonly sameRawRef: true; readonly sameHash: true; readonly sameSize: true; readonly integrity: true }

export function verifyRawPersistence(before: RawSnapshotInput, after: RawSnapshotInput): RawPersistenceResult {
  requireCondition(before.rawRef !== '', 'Raw snapshot is missing rawRef')
  requireCondition(before.rawRef === after.rawRef, 'Raw ref changed across restart')
  requireCondition(before.sizeBytes === after.sizeBytes, 'Raw size changed across restart')
  requireCondition(before.contentHash === after.contentHash, 'Raw content hash changed across restart')
  requireCondition(before.integrity && after.integrity, 'Raw integrity verification did not pass in both runtimes')
  return { rawStable: true, sameRawRef: true, sameHash: true, sameSize: true, integrity: true }
}

export interface GraphSnapshotInput { readonly rootRef: string; readonly nodes: readonly string[]; readonly edges: readonly { readonly ref: string; readonly sourceRef: string; readonly targetRef: string }[] }
export interface GraphPersistenceResult { readonly graphStable: true; readonly rootStable: true; readonly nodeRefHash: string; readonly edgeRefHash: string }

export function graphStructuralSnapshot(input: GraphSnapshotInput): { readonly rootRef: string; readonly nodes: readonly string[]; readonly edges: readonly GraphSnapshotInput['edges'][number][]; readonly nodeRefHash: string; readonly edgeRefHash: string } {
  const nodes = [...input.nodes].sort((left, right) => left.localeCompare(right))
  const edges = [...input.edges].map((edge) => ({ ref: edge.ref, sourceRef: edge.sourceRef, targetRef: edge.targetRef })).sort((left, right) => stable(left).localeCompare(stable(right)))
  return { rootRef: input.rootRef, nodes, edges, nodeRefHash: sha256(stable(nodes)), edgeRefHash: sha256(stable(edges)) }
}

export function verifyGraphPersistence(before: GraphSnapshotInput, after: GraphSnapshotInput): GraphPersistenceResult {
  requireCondition(before.rootRef === after.rootRef, 'Graph root changed across restart')
  const left = graphStructuralSnapshot(before); const right = graphStructuralSnapshot(after)
  requireCondition(left.nodeRefHash === right.nodeRefHash, 'Graph node ref set changed across restart')
  requireCondition(left.edgeRefHash === right.edgeRefHash, 'Graph edge ref set or direction changed across restart')
  return { graphStable: true, rootStable: true, nodeRefHash: left.nodeRefHash, edgeRefHash: left.edgeRefHash }
}

export interface ReviewApiEvidence {
  readonly reviewCaseId: string
  readonly producerRunId: string
  readonly total: number
  readonly caseIds: readonly string[]
  readonly category: string
  readonly actionability: string
  readonly origin: string
  readonly proposalKind: string
  readonly semanticType: string
  readonly status: string
  readonly rootProposalExists: true
  readonly evidenceBindingCount: number
  readonly evidenceBindingsStructurallyValid: true
  readonly totalDependentProposals: number
  readonly dependentProposalSampleCount: number
  readonly dependentMetadataValid: true
}

function safeReviewMetadata(summary: Dict): Pick<ReviewApiEvidence, 'reviewCaseId' | 'producerRunId' | 'category' | 'actionability' | 'origin' | 'proposalKind' | 'semanticType' | 'status'> {
  const fields = ['reviewCaseId', 'producerRunId', 'category', 'actionability', 'origin', 'proposalKind', 'semanticType', 'status']
  for (const field of fields) requireCondition(typeof summary[field] === 'string' && summary[field] !== '', `Review summary is missing ${field}`)
  return { reviewCaseId: summary.reviewCaseId as string, producerRunId: summary.producerRunId as string, category: summary.category as string, actionability: summary.actionability as string, origin: summary.origin as string, proposalKind: summary.proposalKind as string, semanticType: summary.semanticType as string, status: summary.status as string }
}

export function validateReviewApiListAndDetail(list: unknown, detail: unknown, producerRunId: string): ReviewApiEvidence {
  requireCondition(isDict(list) && Array.isArray(list.cases), 'Review API list must expose cases')
  requireCondition(Number.isInteger(list.total) && (list.total as number) >= 1, 'Review API list must expose a positive total')
  requireCondition(isDict(detail), 'Review API detail must be an object')
  const summaries = list.cases.filter(isDict); const matching = summaries.find((item) => item.producerRunId === producerRunId)
  requireCondition(matching !== undefined, 'Review API list did not contain the current Production run')
  const summary = safeReviewMetadata(matching)
  requireCondition(detail.reviewCaseId === summary.reviewCaseId, 'Review API detail returned the wrong reviewCaseId')
  requireCondition(detail.producerRunId === producerRunId, 'Review API detail producerRunId does not match Production run')
  requireCondition(isDict(detail.rootProposal), 'Review API detail is missing rootProposal')
  requireCondition(Array.isArray(detail.evidenceBindings), 'Review API detail is missing evidenceBindings')
  const bindings = detail.evidenceBindings.filter(isDict)
  requireCondition(bindings.length === detail.evidenceBindings.length && bindings.length > 0, 'Review API evidence bindings are empty or malformed')
  requireCondition(bindings.every((binding) => binding.kind === 'raw_document_block' && typeof binding.rawRef === 'string' && typeof binding.documentId === 'string' && typeof binding.blockId === 'string'), 'Review API evidence binding shape is invalid')
  requireCondition(Number.isInteger(detail.totalDependentProposals) && (detail.totalDependentProposals as number) >= 0, 'Review API dependent proposal total is invalid')
  requireCondition(Array.isArray(detail.dependentProposalSamples) && Array.isArray(detail.dependentProposals), 'Review API dependent proposal metadata is invalid')
  requireCondition(detail.dependentProposalSamples.length <= detail.dependentProposals.length, 'Review API dependent samples exceed dependent proposals')
  return { ...summary, total: list.total as number, caseIds: summaries.map((item) => item.reviewCaseId).filter((id): id is string => typeof id === 'string').sort((left, right) => left.localeCompare(right)), rootProposalExists: true, evidenceBindingCount: bindings.length, evidenceBindingsStructurallyValid: true, totalDependentProposals: detail.totalDependentProposals as number, dependentProposalSampleCount: detail.dependentProposalSamples.length, dependentMetadataValid: true }
}

export function verifyReviewPersistence(before: ReviewApiEvidence, after: ReviewApiEvidence): { readonly reviewStable: true; readonly reviewCaseFound: true; readonly detailFound: true; readonly metadataStable: true } {
  requireCondition(before.reviewCaseId === after.reviewCaseId, 'Persisted ReviewCase ID changed across restart')
  requireCondition(before.producerRunId === after.producerRunId, 'Persisted ReviewCase producerRunId changed across restart')
  requireCondition(stable({ ...before, caseIds: undefined, total: undefined }) === stable({ ...after, caseIds: undefined, total: undefined }), 'Persisted ReviewCase metadata changed across restart')
  return { reviewStable: true, reviewCaseFound: true, detailFound: true, metadataStable: true }
}
