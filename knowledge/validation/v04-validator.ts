import { KNOWLEDGE_SCHEMA_V04 } from '../schema/executable-schema-v04.ts'
import type { ClaimTypeV04, KnowledgeAssetV04, KnowledgeClaimV04, KnowledgeSourceV04 } from '../schema/domain-v04.ts'

export interface KnowledgeV04Diagnostic {
  readonly code: string
  readonly message: string
  readonly assetId?: string
}

export interface KnowledgeV04ValidationReport {
  readonly status: 'passed' | 'failed'
  readonly errors: readonly KnowledgeV04Diagnostic[]
}

const CLAIM_TYPES = new Set<ClaimTypeV04>(KNOWLEDGE_SCHEMA_V04.claim.types)
const SOURCE_TYPES = new Set(KNOWLEDGE_SCHEMA_V04.source.types)
const SOURCE_RELIABILITIES = new Set(KNOWLEDGE_SCHEMA_V04.source.reliabilities)
const RAW_PATTERN = /^raw-sha256-[0-9a-f]{64}$/
const HASH_PATTERN = /^[0-9a-f]{64}$/
const DATE = (value: unknown): boolean => typeof value === 'string' && value.trim() !== '' && !Number.isNaN(Date.parse(value))
const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

function add(errors: KnowledgeV04Diagnostic[], code: string, message: string, assetId?: string): void { errors.push({ code, message, ...(assetId === undefined ? {} : { assetId }) }) }
function inRange(value: unknown): boolean { return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1 }
function validRef(value: unknown, prefix: string): value is string { return typeof value === 'string' && value.startsWith(prefix) && value.slice(prefix.length).length > 0 }

function validateSource(source: KnowledgeSourceV04, errors: KnowledgeV04Diagnostic[]): void {
  const id = source.id
  if (!validRef(id, 'source:')) add(errors, 'V04_SOURCE_ID', 'Source id must use source: namespace', id)
  if (typeof source.title !== 'string' || source.title.trim() === '') add(errors, 'V04_REQUIRED_FIELD', 'Source title is required', id)
  if (!SOURCE_TYPES.has(source.sourceType)) add(errors, 'V04_SOURCE_TYPE', 'Source sourceType is not declared by Schema 0.4', id)
  if (source.sourceReliability !== undefined && !SOURCE_RELIABILITIES.has(source.sourceReliability)) add(errors, 'V04_SOURCE_RELIABILITY', 'Source reliability is invalid', id)
  if (source.canonicalUrl !== undefined && source.canonicalUrl !== null && typeof source.canonicalUrl !== 'string') add(errors, 'V04_CANONICAL_URL', 'canonicalUrl must be a string or null', id)
  if (source.retrievedAt !== undefined && source.retrievedAt !== null && !DATE(source.retrievedAt)) add(errors, 'V04_RETRIEVED_AT', 'retrievedAt must be a date string or null', id)
  if (source.contentHash !== undefined && source.contentHash !== null && (typeof source.contentHash !== 'string' || !HASH_PATTERN.test(source.contentHash))) add(errors, 'V04_CONTENT_HASH', 'contentHash must be a lowercase SHA-256 hex string or null', id)
  if (!record(source.rights)) { add(errors, 'V04_SOURCE_RIGHTS', 'Source rights metadata is required', id); return }
  const rights = source.rights
  if (!['public', 'authenticated', 'restricted', 'unknown'].includes(rights.accessScope as string)) add(errors, 'V04_SOURCE_RIGHTS', 'rights.accessScope is invalid', id)
  for (const field of ['retentionAllowed', 'aiProcessingAllowed', 'derivativeKnowledgeAllowed', 'redistributionAllowed']) if (typeof rights[field] !== 'boolean') add(errors, 'V04_SOURCE_RIGHTS', `rights.${field} must be boolean`, id)
  if (source.acquisition !== undefined && source.acquisition !== null && !record(source.acquisition)) add(errors, 'V04_ACQUISITION', 'acquisition must be an object or null', id)
  for (const rawRef of source.rawRefs ?? []) if (!RAW_PATTERN.test(rawRef)) add(errors, 'V04_RAW_REF', `Source rawRef is invalid: ${rawRef}`, id)
}

function validateClaim(claim: KnowledgeClaimV04, sources: ReadonlySet<string>, claims: ReadonlySet<string>, errors: KnowledgeV04Diagnostic[]): void {
  const id = claim.id
  if (!validRef(id, 'claim:')) add(errors, 'V04_CLAIM_ID', 'Claim id must use claim: namespace', id)
  if (!CLAIM_TYPES.has(claim.claimType)) add(errors, 'V04_CLAIM_TYPE', 'Claim type is invalid', id)
  if (typeof claim.statement !== 'string' || claim.statement.trim() === '') add(errors, 'V04_REQUIRED_FIELD', 'Claim statement is required', id)
  if (!Array.isArray(claim.subjectRefs) || claim.subjectRefs.length === 0) add(errors, 'V04_SUBJECT_REFS', 'Claim subjectRefs must be non-empty', id)
  for (const sourceRef of claim.sourceRefs ?? []) if (!sources.has(sourceRef)) add(errors, 'V04_MISSING_SOURCE_REF', `Claim sourceRef does not resolve: ${sourceRef}`, id)
  if (claim.confidence !== undefined && claim.confidence !== null && !inRange(claim.confidence)) add(errors, 'V04_CONFIDENCE', 'confidence must be between 0 and 1', id)
  if (claim.claimType === 'forecast') {
    if (!inRange(claim.probability)) add(errors, 'V04_PROBABILITY', 'Forecast probability is required and must be between 0 and 1', id)
  } else if (claim.probability !== undefined && claim.probability !== null) add(errors, 'V04_PROBABILITY', 'probability is only valid for forecast claims', id)
  if (claim.provenance !== undefined) for (const provenance of claim.provenance) {
    if (!sources.has(provenance.sourceRef)) add(errors, 'V04_MISSING_PROVENANCE_SOURCE', `Provenance sourceRef does not resolve: ${provenance.sourceRef}`, id)
    if (!RAW_PATTERN.test(provenance.rawRef)) add(errors, 'V04_PROVENANCE_RAW_REF', 'Provenance rawRef is invalid', id)
  }
  const fields = ['supportsClaimRefs', 'dependsOnClaimRefs', 'contradictsClaimRefs'] as const
  for (const field of fields) for (const ref of claim[field] ?? []) {
    if (!claims.has(ref)) add(errors, 'V04_MISSING_CLAIM_REF', `${field} does not resolve: ${ref}`, id)
    if (ref === id) add(errors, 'V04_SELF_REFERENCE', `${field} cannot reference the same claim`, id)
  }
}

function validateCycles(claims: ReadonlyMap<string, KnowledgeClaimV04>, errors: KnowledgeV04Diagnostic[]): void {
  const indegree = new Map<string, number>([...claims.keys()].map((id) => [id, 0]))
  const outgoing = new Map<string, string[]>([...claims.keys()].map((id) => [id, []]))
  for (const [id, claim] of claims) for (const ref of [...claim.supportsClaimRefs ?? [], ...claim.dependsOnClaimRefs ?? [], ...claim.contradictsClaimRefs ?? []]) {
    if (!claims.has(ref)) continue
    outgoing.get(ref)!.push(id)
    indegree.set(id, indegree.get(id)! + 1)
  }
  const queue = [...indegree.entries()].filter(([, degree]) => degree === 0).map(([id]) => id).sort()
  let visited = 0
  while (queue.length > 0) {
    const id = queue.shift()!
    visited += 1
    for (const next of outgoing.get(id)!.sort()) {
      const degree = indegree.get(next)! - 1
      indegree.set(next, degree)
      if (degree === 0) queue.push(next)
    }
  }
  if (visited !== claims.size) add(errors, 'V04_DEPENDENCY_CYCLE', 'Claim dependency graph contains a deterministic cycle')
}

export function validateKnowledgeV04Objects(objects: readonly KnowledgeAssetV04[]): KnowledgeV04ValidationReport {
  const errors: KnowledgeV04Diagnostic[] = []
  const ids = new Set<string>()
  const sources = new Map<string, KnowledgeSourceV04>()
  const claims = new Map<string, KnowledgeClaimV04>()
  for (const object of objects) {
    if (!record(object) || typeof object.id !== 'string') { add(errors, 'V04_OBJECT', 'Canonical object must have a string id'); continue }
    if (ids.has(object.id)) add(errors, 'V04_DUPLICATE_ID', `Duplicate canonical id: ${object.id}`, object.id)
    ids.add(object.id)
    if (object.id.startsWith('source:')) sources.set(object.id, object as KnowledgeSourceV04)
    if (object.id.startsWith('claim:')) claims.set(object.id, object as KnowledgeClaimV04)
  }
  for (const source of sources.values()) validateSource(source, errors)
  const sourceIds = new Set(sources.keys())
  const claimIds = new Set(claims.keys())
  for (const claim of claims.values()) validateClaim(claim, sourceIds, claimIds, errors)
  validateCycles(claims, errors)
  return { status: errors.length === 0 ? 'passed' : 'failed', errors }
}

export function assertKnowledgeV04Objects(objects: readonly KnowledgeAssetV04[]): void {
  const report = validateKnowledgeV04Objects(objects)
  if (report.status === 'failed') throw new Error(report.errors.map((error) => `${error.code}: ${error.message}`).join('; '))
}

export function isKnowledgeV04RawRef(value: unknown): value is string { return typeof value === 'string' && RAW_PATTERN.test(value) }
