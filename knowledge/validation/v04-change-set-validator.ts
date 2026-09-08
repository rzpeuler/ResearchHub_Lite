import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { loadKnowledgeBaseManifest } from '../storage/manifest-loader.ts'
import { parseYaml } from '../storage/yaml.ts'
import { readCanonicalV04Assets } from '../storage/canonical-v04-loader.ts'
import { verifyRaw } from '../raw/raw-archive.ts'
import { kindForKnowledgeV04 } from '../writer/path-allocation-v04.ts'
import { hashKnowledgeObject } from '../storage/canonical-hash.ts'
import type { KnowledgeBaseHandle } from '../storage/handle.ts'
import type { KnowledgeAssetV04 } from '../schema/domain-v04.ts'
import { assertKnowledgeV04Objects } from './v04-validator.ts'
import type { ValidatedKnowledgeChangeSetV04, KnowledgeChangeSetV04, KnowledgeOperationV04 } from '../schema/mutation-v04.ts'

export interface V04ChangeSetValidationDiagnostic { readonly code: string; readonly message: string; readonly operationId?: string; readonly assetId?: string }
export interface V04ChangeSetValidationReport { readonly status: 'passed' | 'failed'; readonly errors: readonly V04ChangeSetValidationDiagnostic[] }
export interface V04ChangeSetValidationOptions { readonly mode?: 'commit' | 'dry_run'; readonly now?: () => string }
export interface V04ChangeSetValidationResult { readonly report: V04ChangeSetValidationReport; readonly validatedChangeSet?: ValidatedKnowledgeChangeSetV04 }

type Dict = Record<string, unknown>
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]*$/
const HASH = /^sha256:[0-9a-f]{64}$/
const RAW = /^raw-sha256-[0-9a-f]{64}$/
const record = (value: unknown): value is Dict => typeof value === 'object' && value !== null && !Array.isArray(value)
const issuedReceipts = new WeakSet<object>()

export function isValidatorIssuedV04Receipt(value: unknown): value is ValidatedKnowledgeChangeSetV04 {
  return record(value) && issuedReceipts.has(value)
}

function add(errors: V04ChangeSetValidationDiagnostic[], code: string, message: string, operationId?: string, assetId?: string): void {
  errors.push({ code, message, ...(operationId === undefined ? {} : { operationId }), ...(assetId === undefined ? {} : { assetId }) })
}

async function rawRefsInRegistry(root: string, errors: V04ChangeSetValidationDiagnostic[]): Promise<Set<string>> {
  const path = join(root, 'registry', 'raw.yaml')
  try {
    const value = parseYaml(await readFile(path, 'utf8'), path)
    if (!record(value)) { add(errors, 'V04_RAW_REGISTRY_INVALID', 'Raw registry must be an object map'); return new Set() }
    return new Set(Object.keys(value))
  } catch (error) {
    add(errors, 'V04_RAW_REGISTRY_UNREADABLE', error instanceof Error ? error.message : String(error))
    return new Set()
  }
}

function validateRawRef(ref: unknown, known: ReadonlySet<string>, errors: V04ChangeSetValidationDiagnostic[], assetId: string): void {
  if (typeof ref !== 'string' || !RAW.test(ref) || !known.has(ref)) add(errors, 'V04_RAW_REF_INVALID', `Raw reference does not resolve through the Raw registry: ${String(ref)}`, undefined, assetId)
}

function validateEvidence(objects: Iterable<KnowledgeAssetV04>, knownRawRefs: ReadonlySet<string>, errors: V04ChangeSetValidationDiagnostic[]): void {
  const sources = new Set<string>([...objects].filter((object) => object.id.startsWith('source:')).map((object) => object.id))
  for (const object of objects) {
    const value = object as unknown as Dict
    if (object.id.startsWith('source:')) for (const ref of Array.isArray(value.rawRefs) ? value.rawRefs : []) validateRawRef(ref, knownRawRefs, errors, object.id)
    if (object.id.startsWith('claim:')) {
      if (!Array.isArray(value.sourceRefs) || value.sourceRefs.length === 0) add(errors, 'V04_SOURCE_REFERENCE_REQUIRED', 'Claim must resolve at least one Source reference', undefined, object.id)
      else for (const ref of value.sourceRefs as unknown[]) if (typeof ref !== 'string' || !sources.has(ref as string)) add(errors, 'V04_SOURCE_REFERENCE_INVALID', `Claim sourceRef does not resolve: ${String(ref)}`, undefined, object.id)
      if (!Array.isArray(value.provenance) || value.provenance.length === 0) add(errors, 'V04_RAW_PROVENANCE_REQUIRED', 'Claim must contain Raw-backed provenance', undefined, object.id)
      else for (const item of value.provenance as unknown[]) if (!record(item)) add(errors, 'V04_PROVENANCE_INVALID', 'Claim provenance entry must be an object', undefined, object.id); else { if (typeof item.sourceRef !== 'string' || !sources.has(item.sourceRef as string)) add(errors, 'V04_PROVENANCE_SOURCE_INVALID', 'Claim provenance sourceRef does not resolve', undefined, object.id); validateRawRef(item.rawRef, knownRawRefs, errors, object.id) }
    }
  }
}

function applyOperation(objects: Map<string, KnowledgeAssetV04>, operation: KnowledgeOperationV04, errors: V04ChangeSetValidationDiagnostic[], seenOperationIds: Set<string>, mutationTargets: Set<string>): void {
  if (typeof operation.operationId !== 'string' || !SAFE_ID.test(operation.operationId) || seenOperationIds.has(operation.operationId)) add(errors, 'V04_OPERATION_ID_INVALID', `Operation id must be unique and safe: ${String(operation.operationId)}`, operation.operationId)
  else seenOperationIds.add(operation.operationId)
  if (operation.type === 'create') {
    if (!operation.object || typeof operation.object.id !== 'string') { add(errors, 'V04_CREATE_INVALID', 'Create operation must contain a canonical object', operation.operationId); return }
    if (objects.has(operation.object.id)) add(errors, 'V04_CREATE_CONFLICT', `Create conflicts with existing canonical object: ${operation.object.id}`, operation.operationId, operation.object.id)
    else objects.set(operation.object.id, structuredClone(operation.object))
    return
  }
  if (operation.type !== 'update' || typeof operation.knowledgeId !== 'string' || !HASH.test(operation.expectedBeforeHash)) { add(errors, 'V04_UPDATE_INVALID', 'Update operation requires a target and sha256 expected-before hash', operation.operationId); return }
  if (mutationTargets.has(operation.knowledgeId)) add(errors, 'V04_DUPLICATE_TARGET_MUTATION', `Canonical target is mutated more than once: ${operation.knowledgeId}`, operation.operationId, operation.knowledgeId)
  mutationTargets.add(operation.knowledgeId)
  const current = objects.get(operation.knowledgeId)
  if (!current) { add(errors, 'V04_UPDATE_TARGET_INVALID', `Update target does not exist: ${operation.knowledgeId}`, operation.operationId, operation.knowledgeId); return }
  if (hashKnowledgeObject(current) !== operation.expectedBeforeHash) add(errors, 'V04_EXPECTED_HASH_MISMATCH', `Expected-before hash does not match: ${operation.knowledgeId}`, operation.operationId, operation.knowledgeId)
  if (!operation.object || operation.object.id !== operation.knowledgeId || kindForKnowledgeV04(operation.object) !== kindForKnowledgeV04(current)) add(errors, 'V04_UPDATE_IDENTITY_INVALID', `Update object identity or kind does not match: ${operation.knowledgeId}`, operation.operationId, operation.knowledgeId)
  else objects.set(operation.knowledgeId, structuredClone(operation.object))
}

export async function validateKnowledgeChangeSetV04(handle: KnowledgeBaseHandle, changeSet: KnowledgeChangeSetV04, options: V04ChangeSetValidationOptions = {}): Promise<V04ChangeSetValidationResult> {
  const errors: V04ChangeSetValidationDiagnostic[] = []
  const mode = options.mode ?? 'commit'
  if (!handle || handle.schemaVersion !== '0.4' || handle.storageFormatVersion !== '1') add(errors, 'V04_HANDLE_VERSION_INVALID', 'ChangeSet validation requires a Schema 0.4 / Storage Format 1 handle')
  if (mode !== 'commit' && mode !== 'dry_run') add(errors, 'V04_MODE_INVALID', `Unknown validation mode: ${mode}`)
  if (mode === 'commit' && (!handle.writable || handle.status !== 'active')) add(errors, 'V04_HANDLE_NOT_WRITABLE', 'Commit validation requires an active writable Knowledge Base')
  if (!record(changeSet)) { add(errors, 'V04_CHANGESET_INVALID', 'ChangeSet must be an object'); return { report: { status: 'failed', errors } } }
  if (changeSet.schemaVersion !== '0.4' || changeSet.storageFormatVersion !== '1') add(errors, 'V04_VERSION_INVALID', 'ChangeSet must target Schema 0.4 / Storage 1')
  if (!SAFE_ID.test(changeSet.changeSetId) || !SAFE_ID.test(changeSet.workflowRunId)) add(errors, 'V04_ID_INVALID', 'ChangeSet and workflowRunId must use safe identifiers')
  let manifest
  try { manifest = await loadKnowledgeBaseManifest(handle.rootRef) } catch (error) { add(errors, 'V04_MANIFEST_INVALID', error instanceof Error ? error.message : String(error)); return { report: { status: 'failed', errors } } }
  if (manifest.schemaVersion !== '0.4' || manifest.storageFormatVersion !== '1') add(errors, 'V04_MANIFEST_VERSION_INVALID', 'Mounted manifest is not Schema 0.4 / Storage 1')
  if (changeSet.knowledgeBaseId !== handle.knowledgeBaseId || changeSet.knowledgeBaseId !== manifest.knowledgeBaseId) add(errors, 'V04_KB_ID_INVALID', 'ChangeSet Knowledge Base identity does not match the mounted handle')
  if (changeSet.expectedBaseRevision !== handle.revision || changeSet.expectedBaseRevision !== manifest.revision) add(errors, 'V04_BASE_REVISION_INVALID', 'ChangeSet expectedBaseRevision does not match the mounted revision')
  if (!Array.isArray(changeSet.operations)) add(errors, 'V04_OPERATIONS_INVALID', 'ChangeSet operations must be an array')
  const knownRawRefs = await rawRefsInRegistry(handle.rootRef, errors)
  for (const rawRef of knownRawRefs) if (RAW.test(rawRef)) { try { await verifyRaw(handle, rawRef) } catch (error) { add(errors, 'V04_RAW_INTEGRITY_INVALID', error instanceof Error ? error.message : String(error), undefined, rawRef) } }
  let assets
  try { assets = await readCanonicalV04Assets(handle.rootRef) } catch (error) { add(errors, 'V04_CANONICAL_REGISTRY_INVALID', error instanceof Error ? error.message : String(error)); return { report: { status: 'failed', errors } } }
  const objects = new Map<string, KnowledgeAssetV04>(assets.objects.map((item) => [item.value.id, structuredClone(item.value)]))
  const seenOperationIds = new Set<string>()
  const mutationTargets = new Set<string>()
  for (const operation of Array.isArray(changeSet.operations) ? changeSet.operations : []) if (record(operation)) applyOperation(objects, operation as KnowledgeOperationV04, errors, seenOperationIds, mutationTargets); else add(errors, 'V04_OPERATION_INVALID', 'Operation must be an object')
  try { assertKnowledgeV04Objects([...objects.values()]) } catch (error) { add(errors, 'V04_CANONICAL_INVALID', error instanceof Error ? error.message : String(error)) }
  validateEvidence(objects.values(), knownRawRefs, errors)
  const report = { status: errors.length === 0 ? 'passed' as const : 'failed' as const, errors }
  if (report.status === 'failed' || mode === 'dry_run') return { report }
  const validatedChangeSet = Object.freeze({ changeSet: structuredClone(changeSet), knowledgeBaseId: changeSet.knowledgeBaseId, schemaVersion: '0.4' as const, baseRevision: changeSet.expectedBaseRevision, changeSetId: changeSet.changeSetId, changeSetHash: hashKnowledgeObject(changeSet), validatedAt: options.now?.() ?? new Date().toISOString() })
  issuedReceipts.add(validatedChangeSet)
  return { report, validatedChangeSet }
}

export async function validateKnowledgeBaseV04State(rootRef: string): Promise<V04ChangeSetValidationReport> {
  const errors: V04ChangeSetValidationDiagnostic[] = []
  let handle: KnowledgeBaseHandle
  try {
    const { KnowledgeBaseRegistry } = await import('../registry/registry.ts')
    handle = await new KnowledgeBaseRegistry().mount(rootRef)
  } catch (error) {
    add(errors, 'V04_STATE_HANDLE_INVALID', error instanceof Error ? error.message : String(error))
    return { status: 'failed', errors }
  }
  const knownRawRefs = await rawRefsInRegistry(handle.rootRef, errors)
  for (const rawRef of knownRawRefs) if (RAW.test(rawRef)) { try { await verifyRaw(handle, rawRef) } catch (error) { add(errors, 'V04_RAW_INTEGRITY_INVALID', error instanceof Error ? error.message : String(error), undefined, rawRef) } }
  try {
    const assets = await readCanonicalV04Assets(handle.rootRef)
    try { assertKnowledgeV04Objects(assets.objects.map((item) => item.value)) } catch (error) { add(errors, 'V04_CANONICAL_INVALID', error instanceof Error ? error.message : String(error)) }
    validateEvidence(assets.objects.map((item) => item.value), knownRawRefs, errors)
  } catch (error) {
    add(errors, 'V04_CANONICAL_REGISTRY_INVALID', error instanceof Error ? error.message : String(error))
  }
  return { status: errors.length === 0 ? 'passed' : 'failed', errors }
}
