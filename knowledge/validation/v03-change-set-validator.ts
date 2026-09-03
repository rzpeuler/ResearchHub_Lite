import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { loadKnowledgeBaseManifest } from '../storage/manifest-loader.ts'
import { CanonicalV03KnowledgeLoader } from '../storage/canonical-v03-loader.ts'
import { parseYaml } from '../storage/yaml.ts'
import { hashKnowledgeObject } from '../storage/canonical-hash.ts'
import type { KnowledgeBaseHandle } from '../storage/handle.ts'
import type { KnowledgeChangeSetV03, KnowledgeOperationV03, KnowledgeSourceOperationV03, ValidatedKnowledgeChangeSetV03 } from '../schema/mutation.ts'
import { validateV03CanonicalObjects, validateV03GlobalInvariants, isValidRawRef, kindForV03Id } from './v03-validation-core.ts'
import { readTaxonomyReferences } from './v03-validator.ts'
import type { V03CanonicalObject, ValidationDiagnostic, ValidationReport, ChangeSetValidationOptions } from './types.ts'

type Dict = Record<string, unknown>
const safeId = /^[A-Za-z0-9][A-Za-z0-9._-]*$/
const hashPattern = /^sha256:[0-9a-f]{64}$/
function isRecord(value: unknown): value is Dict { return typeof value === 'object' && value !== null && !Array.isArray(value) }
function error(diagnostics: ValidationDiagnostic[], code: string, message: string, operationId?: string, assetId?: string): void { diagnostics.push({ code, severity: 'error', message, ...(operationId === undefined ? {} : { operationId }), ...(assetId === undefined ? {} : { assetId }) }) }
function report(diagnostics: ValidationDiagnostic[]): ValidationReport { return { status: diagnostics.length === 0 ? 'passed' : 'failed', errors: diagnostics, warnings: [], info: [], scope: 'all' } }

async function rawRefsFor(rootRef: string, diagnostics: ValidationDiagnostic[]): Promise<Set<string>> {
  const path = join(rootRef, 'registry', 'raw.yaml')
  try {
    const value = parseYaml(await readFile(path, 'utf8'), path)
    if (!isRecord(value)) { error(diagnostics, 'V03_RAW_REGISTRY_INVALID', 'Raw registry must be an object map'); return new Set() }
    return new Set(Object.keys(value))
  } catch (cause) {
    error(diagnostics, 'V03_RAW_REGISTRY_UNREADABLE', cause instanceof Error ? cause.message : String(cause))
    return new Set()
  }
}

function addObject(objects: Map<string, V03CanonicalObject>, object: Dict, diagnostics: ValidationDiagnostic[], operationId: string): void {
  const id = typeof object.id === 'string' ? object.id : undefined
  if (!id) { error(diagnostics, 'V03_ID_MISSING', 'Operation object must have an id', operationId); return }
  const kind = kindForV03Id(id)
  if (!kind) { error(diagnostics, 'V03_ID_NAMESPACE', `Operation object id is not in a Schema 0.3 namespace: ${id}`, operationId, id); return }
  if (objects.has(id)) error(diagnostics, 'V03_ID_CONFLICT', `Operation would create an existing object: ${id}`, operationId, id)
  else objects.set(id, { kind, object })
}

function validateOperationId(operationId: unknown, diagnostics: ValidationDiagnostic[], seen: Set<string>): operationId is string {
  if (typeof operationId !== 'string' || !safeId.test(operationId) || seen.has(operationId)) { error(diagnostics, 'V03_OPERATION_ID_INVALID', `Operation id must be unique and safe: ${String(operationId)}`); return false }
  seen.add(operationId); return true
}

function validateRawProvenance(object: Dict, rawRefs: ReadonlySet<string>, sourceIds: ReadonlySet<string>, diagnostics: ValidationDiagnostic[], operationId: string, required: boolean): void {
  if (object.id && kindForV03Id(object.id) === 'claim') {
    if (!Array.isArray(object.sourceRefs) || object.sourceRefs.length === 0 || object.sourceRefs.some((ref) => typeof ref !== 'string' || !sourceIds.has(ref))) error(diagnostics, 'V03_MISSING_SOURCE_REFERENCE', 'Claim must include at least one registered Source reference', operationId, String(object.id))
    if (required && (!Array.isArray(object.provenance) || object.provenance.length === 0)) error(diagnostics, 'V03_MISSING_RAW_PROVENANCE', 'Claim must include Raw-backed provenance', operationId, String(object.id))
    if (Array.isArray(object.provenance)) for (const item of object.provenance) if (isRecord(item) && (typeof item.rawRef !== 'string' || !isValidRawRef(item.rawRef) || !rawRefs.has(item.rawRef))) error(diagnostics, 'V03_RAW_REF_INVALID', 'Claim provenance rawRef must resolve through the Raw registry', operationId, String(object.id))
  }
}

function applySourceOperation(objects: Map<string, V03CanonicalObject>, operation: KnowledgeSourceOperationV03, diagnostics: ValidationDiagnostic[], seen: Set<string>, rawRefs: Set<string>): void {
  if (!validateOperationId(operation.operationId, diagnostics, seen)) return
  if (operation.type === 'source_create') {
    const source = operation.source as unknown as Dict
    if (typeof source.id !== 'string' || kindForV03Id(source.id) !== 'source') error(diagnostics, 'V03_SOURCE_ID_INVALID', 'source_create must use a Source namespace id', operation.operationId)
    if (Array.isArray(source.rawRefs)) for (const rawRef of source.rawRefs) if (typeof rawRef !== 'string' || !isValidRawRef(rawRef) || !rawRefs.has(rawRef)) error(diagnostics, 'V03_RAW_REF_INVALID', 'Source rawRefs must resolve through the Raw registry', operation.operationId, String(source.id))
    addObject(objects, source, diagnostics, operation.operationId)
    return
  }
  if (!hashPattern.test(operation.expectedBeforeHash)) error(diagnostics, 'V03_EXPECTED_HASH_INVALID', 'source_merge expectedBeforeHash must be a sha256 hash', operation.operationId, operation.sourceId)
  const current = objects.get(operation.sourceId)
  if (!current || current.kind !== 'source') { error(diagnostics, 'V03_SOURCE_TARGET_INVALID', 'source_merge target must resolve to a Source', operation.operationId, operation.sourceId); return }
  if (hashKnowledgeObject(current.object) !== operation.expectedBeforeHash) error(diagnostics, 'V03_EXPECTED_HASH_MISMATCH', 'source_merge expectedBeforeHash does not match current state', operation.operationId, operation.sourceId)
  const next = structuredClone(current.object)
  if (operation.addRawRefs) next.rawRefs = [...new Set([...(Array.isArray(next.rawRefs) ? next.rawRefs : []), ...operation.addRawRefs])].sort()
  Object.assign(next, structuredClone(operation.metadataPatch ?? {}))
  objects.set(operation.sourceId, { kind: 'source', object: next })
}

function applyKnowledgeOperation(objects: Map<string, V03CanonicalObject>, operation: KnowledgeOperationV03, diagnostics: ValidationDiagnostic[], seen: Set<string>, rawRefs: Set<string>, requiresRawProvenance: boolean): void {
  if (!validateOperationId(operation.operationId, diagnostics, seen)) return
  if (operation.type === 'create') { const object = operation.object as unknown as Dict; addObject(objects, object, diagnostics, operation.operationId); validateRawProvenance(object, rawRefs, new Set([...objects].filter(([, value]) => value.kind === 'source').map(([id]) => id)), diagnostics, operation.operationId, requiresRawProvenance); return }
  if (!hashPattern.test(operation.expectedBeforeHash)) error(diagnostics, 'V03_EXPECTED_HASH_INVALID', 'Operation expectedBeforeHash must be a sha256 hash', operation.operationId, operation.knowledgeId)
  const current = objects.get(operation.knowledgeId)
  if (!current) { error(diagnostics, 'V03_TARGET_INVALID', 'Operation target does not exist', operation.operationId, operation.knowledgeId); return }
  if (hashKnowledgeObject(current.object) !== operation.expectedBeforeHash) error(diagnostics, 'V03_EXPECTED_HASH_MISMATCH', 'Operation expectedBeforeHash does not match current state', operation.operationId, operation.knowledgeId)
  if (operation.type === 'update') {
    const next = operation.object as unknown as Dict
    if (next.id !== operation.knowledgeId || kindForV03Id(next.id) !== current.kind) error(diagnostics, 'V03_UPDATE_IDENTITY_INVALID', 'Update object identity or kind does not match target', operation.operationId, operation.knowledgeId)
    else objects.set(operation.knowledgeId, { kind: current.kind, object: structuredClone(next) })
  } else if (operation.type === 'merge_source') {
    const next = structuredClone(current.object)
    if (!('sourceRefs' in next)) error(diagnostics, 'V03_SOURCE_MERGE_UNSUPPORTED', 'Target object does not declare sourceRefs', operation.operationId, operation.knowledgeId)
    else { next.sourceRefs = [...new Set([...(Array.isArray(next.sourceRefs) ? next.sourceRefs : []), ...operation.addSourceRefs])].sort(); objects.set(operation.knowledgeId, { kind: current.kind, object: next }) }
  } else {
    if (current.kind !== 'claim') error(diagnostics, 'V03_SUPERSEDE_KIND_INVALID', 'Only Claims may be superseded', operation.operationId, operation.knowledgeId)
    else { const oldNext = structuredClone(current.object); const lifecycle = isRecord(oldNext.lifecycle) ? oldNext.lifecycle : { status: 'active' }; lifecycle.status = 'superseded'; oldNext.lifecycle = lifecycle; oldNext.supersededBy = [...new Set([...(Array.isArray(oldNext.supersededBy) ? oldNext.supersededBy : []), operation.replacement.id])].sort(); objects.set(operation.knowledgeId, { kind: 'claim', object: oldNext }); addObject(objects, operation.replacement as unknown as Dict, diagnostics, operation.operationId) }
  }
  const finalObject = operation.type === 'update' ? operation.object as unknown as Dict : objects.get(operation.knowledgeId)?.object
  if (finalObject) validateRawProvenance(finalObject, rawRefs, new Set([...objects].filter(([, value]) => value.kind === 'source').map(([id]) => id)), diagnostics, operation.operationId, requiresRawProvenance)
}

export async function validateKnowledgeChangeSetV03(handle: KnowledgeBaseHandle, changeSet: KnowledgeChangeSetV03, options: ChangeSetValidationOptions = {}): Promise<{ report: ValidationReport; validatedChangeSet?: ValidatedKnowledgeChangeSetV03 }> {
  const diagnostics: ValidationDiagnostic[] = []
  if (!handle || typeof handle.rootRef !== 'string') { error(diagnostics, 'V03_HANDLE_INVALID', 'ChangeSet validation requires a KnowledgeBaseHandle'); return { report: report(diagnostics) } }
  let manifest
  try { manifest = await loadKnowledgeBaseManifest(handle.rootRef) } catch (cause) { error(diagnostics, 'V03_MANIFEST_INVALID', cause instanceof Error ? cause.message : String(cause)); return { report: report(diagnostics) } }
  if (changeSet.schemaVersion !== '0.3' || changeSet.storageFormatVersion !== '1') error(diagnostics, 'V03_VERSION_INVALID', 'ChangeSet must target Schema 0.3 / Storage Format 1')
  if (changeSet.knowledgeBaseId !== handle.knowledgeBaseId || changeSet.knowledgeBaseId !== manifest.knowledgeBaseId) error(diagnostics, 'V03_KB_ID_INVALID', 'ChangeSet Knowledge Base identity does not match the mounted handle')
  if (changeSet.expectedBaseRevision !== handle.revision || changeSet.expectedBaseRevision !== manifest.revision) error(diagnostics, 'V03_BASE_REVISION_INVALID', 'ChangeSet expectedBaseRevision does not match the mounted revision')
  if (!safeId.test(changeSet.changeSetId) || !safeId.test(changeSet.workflowRunId)) error(diagnostics, 'V03_ID_INVALID', 'ChangeSet and workflowRunId must use safe deterministic identifiers')
  const rawRefs = await rawRefsFor(handle.rootRef, diagnostics)
  const taxonomyRefs = await readTaxonomyReferences(handle.rootRef, diagnostics)
  let assets
  try { assets = await new CanonicalV03KnowledgeLoader(handle.rootRef).readAssets() } catch (cause) { error(diagnostics, 'V03_CANONICAL_REGISTRY_INVALID', cause instanceof Error ? cause.message : String(cause)); return { report: report(diagnostics) } }
  const objects = new Map<string, V03CanonicalObject>()
  for (const group of [assets.themeGroups, assets.entities, assets.relations, assets.claims, assets.modules, assets.sources]) for (const asset of group) objects.set(asset.value.id, { kind: asset.kind, object: asset.value as unknown as Dict })
  const seen = new Set<string>()
  for (const operation of changeSet.sourceOperations) applySourceOperation(objects, operation, diagnostics, seen, new Set([...rawRefs, ...(options.virtualRawRefs ?? [])]))
  for (const operation of changeSet.knowledgeOperations) applyKnowledgeOperation(objects, operation, diagnostics, seen, new Set([...rawRefs, ...(options.virtualRawRefs ?? [])]), changeSet.requiresRawProvenance)
  const context = { objects, rawRefs: new Set([...rawRefs, ...(options.virtualRawRefs ?? [])]), taxonomyRefs }
  validateV03CanonicalObjects(objects.values(), context, diagnostics)
  validateV03GlobalInvariants(context, diagnostics)
  const finalSourceIds = new Set([...objects].filter(([, value]) => value.kind === 'source').map(([id]) => id))
  for (const value of objects.values()) validateRawProvenance(value.object, context.rawRefs, finalSourceIds, diagnostics, 'change-set', false)
  const validationReport = report(diagnostics)
  if (validationReport.status === 'failed' || options.mode === 'dry_run') return { report: validationReport }
  const validatedChangeSet: ValidatedKnowledgeChangeSetV03 = Object.freeze({ changeSet: structuredClone(changeSet), knowledgeBaseId: changeSet.knowledgeBaseId, schemaVersion: '0.3', baseRevision: changeSet.expectedBaseRevision, changeSetId: changeSet.changeSetId, changeSetHash: hashKnowledgeObject(changeSet), validatedAt: new Date().toISOString() })
  return { report: validationReport, validatedChangeSet }
}
