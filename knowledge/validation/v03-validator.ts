import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { createKnowledgeBaseHandle } from '../storage/handle.ts'
import { loadKnowledgeBaseManifest } from '../storage/manifest-loader.ts'
import { CanonicalV03KnowledgeLoader } from '../storage/canonical-v03-loader.ts'
import { parseYaml } from '../storage/yaml.ts'
import { verifyRaw } from '../raw/raw-archive.ts'
import type { KnowledgeAssetCollectionV03 } from '../storage/v03-types.ts'
import { validateV03CanonicalObjects, validateV03GlobalInvariants, isValidRawRef } from './v03-validation-core.ts'
import type { CanonicalKind, V03CanonicalObject, ValidationDiagnostic, ValidationReport, ValidationScope } from './types.ts'

type Dict = Record<string, unknown>

function isRecord(value: unknown): value is Dict { return typeof value === 'object' && value !== null && !Array.isArray(value) }

function diagnostic(code: string, message: string, filePath?: string): ValidationDiagnostic {
  return { code, severity: 'error', message, ...(filePath === undefined ? {} : { filePath }) }
}

function report(scope: ValidationScope, diagnostics: ValidationDiagnostic[], warnings: ValidationDiagnostic[] = []): ValidationReport {
  return {
    status: diagnostics.some((item) => item.severity === 'error') ? 'failed' : 'passed',
    errors: diagnostics.filter((item) => item.severity === 'error'),
    warnings: warnings.filter((item) => item.severity === 'warning'),
    info: diagnostics.filter((item) => item.severity === 'info'),
    scope,
  }
}

function entries(collection: KnowledgeAssetCollectionV03): Array<{ kind: CanonicalKind; value: Dict; filePath: string }> {
  return [
    ...collection.themeGroups.map((asset) => ({ kind: 'theme_group' as const, value: asset.value as unknown as Dict, filePath: asset.filePath })),
    ...collection.entities.map((asset) => ({ kind: 'entity' as const, value: asset.value as unknown as Dict, filePath: asset.filePath })),
    ...collection.relations.map((asset) => ({ kind: 'relation' as const, value: asset.value as unknown as Dict, filePath: asset.filePath })),
    ...collection.claims.map((asset) => ({ kind: 'claim' as const, value: asset.value as unknown as Dict, filePath: asset.filePath })),
    ...collection.modules.map((asset) => ({ kind: 'module' as const, value: asset.value as unknown as Dict, filePath: asset.filePath })),
    ...collection.sources.map((asset) => ({ kind: 'source' as const, value: asset.value as unknown as Dict, filePath: asset.filePath })),
  ]
}

function selected(kind: CanonicalKind, scope: ValidationScope): boolean {
  return scope === 'all' || scope === kind
}

async function readRawRefs(rootRef: string, diagnostics: ValidationDiagnostic[]): Promise<Set<string>> {
  const path = join(rootRef, 'registry', 'raw.yaml')
  try {
    const parsed = parseYaml(await readFile(path, 'utf8'), path)
    if (!isRecord(parsed)) {
      diagnostics.push(diagnostic('V03_RAW_REGISTRY_INVALID', 'Raw registry must be an object map', path))
      return new Set()
    }
    const refs = new Set<string>()
    for (const [rawRef, entry] of Object.entries(parsed)) {
      if (!isValidRawRef(rawRef)) diagnostics.push(diagnostic('V03_RAW_REF_INVALID', `Raw registry key is not a valid Raw identity: ${rawRef}`, path))
      if (!isRecord(entry) || typeof entry.contentHash !== 'string' || typeof entry.storageRef !== 'string') diagnostics.push(diagnostic('V03_RAW_REGISTRY_ENTRY_INVALID', `Raw registry entry is invalid: ${rawRef}`, path))
      refs.add(rawRef)
    }
    return refs
  } catch (error) {
    diagnostics.push(diagnostic('V03_RAW_REGISTRY_UNREADABLE', error instanceof Error ? error.message : String(error), path))
    return new Set()
  }
}

async function canonicalFiles(rootRef: string, directory: string): Promise<string[]> {
  const root = join(rootRef, directory)
  const result: string[] = []
  async function visit(current: string): Promise<void> {
    let entries
    try { entries = await readdir(current, { withFileTypes: true }) } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return; throw error }
    for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
      const path = join(current, entry.name)
      if (entry.isDirectory()) await visit(path)
      else if (entry.isFile() && /\.(?:yaml|yml|json)$/i.test(entry.name) && !entry.name.includes('.tmp-')) result.push(path)
    }
  }
  await visit(root)
  return result
}

export async function readTaxonomyReferences(rootRef: string, diagnostics: ValidationDiagnostic[] = []): Promise<Set<string>> {
  const ids = new Set<string>()
  for (const filePath of await canonicalFiles(rootRef, 'taxonomy')) {
    try {
      const value = parseYaml(await readFile(filePath, 'utf8'), filePath)
      const visit = (candidate: unknown): void => {
        if (Array.isArray(candidate)) { for (const item of candidate) visit(item); return }
        if (!isRecord(candidate)) return
        if (typeof candidate.id === 'string') ids.add(candidate.id)
        for (const child of Object.values(candidate)) visit(child)
      }
      visit(value)
    } catch (error) { diagnostics.push(diagnostic('V03_AUXILIARY_PARSE_ERROR', error instanceof Error ? error.message : String(error), filePath)) }
  }
  return ids
}

export interface KnowledgeBaseValidationOptions {
  readonly scope?: ValidationScope
  readonly verifyRawBytes?: boolean
}

export async function validateKnowledgeBaseV03(rootRef: string, options: KnowledgeBaseValidationOptions = {}): Promise<ValidationReport> {
  const scope = options.scope ?? 'all'
  const diagnostics: ValidationDiagnostic[] = []
  let manifest
  try {
    manifest = await loadKnowledgeBaseManifest(rootRef)
  } catch (error) {
    diagnostics.push(diagnostic('V03_MANIFEST_INVALID', error instanceof Error ? error.message : String(error), join(rootRef, 'manifest.yaml')))
    return report(scope, diagnostics)
  }
  if (manifest.schemaVersion !== '0.3') diagnostics.push(diagnostic('V03_SCHEMA_VERSION', `Expected Schema 0.3, received ${manifest.schemaVersion}`, join(rootRef, 'manifest.yaml')))
  if (manifest.storageFormatVersion !== '1') diagnostics.push(diagnostic('V03_STORAGE_FORMAT', `Expected Storage Format 1, received ${manifest.storageFormatVersion}`, join(rootRef, 'manifest.yaml')))
  const rawRefs = await readRawRefs(rootRef, diagnostics)
  const taxonomyRefs = await readTaxonomyReferences(rootRef, diagnostics)
  let collection: KnowledgeAssetCollectionV03
  try {
    collection = await new CanonicalV03KnowledgeLoader(rootRef).readAssets()
  } catch (error) {
    diagnostics.push(diagnostic('V03_CANONICAL_REGISTRY_INVALID', error instanceof Error ? error.message : String(error), join(rootRef, 'registry', 'assets.yaml')))
    return report(scope, diagnostics)
  }
  const objects = new Map<string, V03CanonicalObject>()
  for (const item of entries(collection)) {
    const id = typeof item.value.id === 'string' ? item.value.id : `${item.kind}:${item.filePath}`
    objects.set(id, { kind: item.kind, object: item.value })
  }
  const context = { objects, rawRefs, taxonomyRefs }
  if (scope === 'all' || scope === 'registry' || scope === 'manifest' || scope === 'raw') {
    const registryIds = new Set(collection.registry.map((entry) => entry.id))
    for (const item of entries(collection)) if (typeof item.value.id === 'string' && !registryIds.has(item.value.id)) diagnostics.push(diagnostic('V03_REGISTRY_MISSING', `Canonical object is not registered: ${item.value.id}`, item.filePath))
    const registeredPaths = new Set(collection.registry.map((entry) => entry.storageRef.replaceAll('\\', '/')))
    const directories: Array<[string, CanonicalKind]> = [['theme-groups', 'theme_group'], ['entities', 'entity'], ['relations', 'relation'], ['claims', 'claim'], ['modules', 'module'], ['sources', 'source']]
    for (const [directory] of directories) for (const filePath of await canonicalFiles(rootRef, directory)) {
      const relativePath = filePath.slice(rootRef.length + 1).replaceAll('\\', '/')
      if (!registeredPaths.has(relativePath)) diagnostics.push(diagnostic('V03_ORPHAN_CANONICAL_FILE', `Canonical asset file is not registered: ${relativePath}`, filePath))
    }
  }
  for (const item of entries(collection)) if (selected(item.kind, scope)) validateV03CanonicalObjects([{ kind: item.kind, object: item.value }], context, diagnostics, () => ({ assetId: String(item.value.id), filePath: item.filePath }))
  if (scope === 'all' || scope === 'registry' || scope === 'entity' || scope === 'relation' || scope === 'claim' || scope === 'source' || scope === 'module') validateV03GlobalInvariants(context, diagnostics)
  if (options.verifyRawBytes !== false && (scope === 'all' || scope === 'raw' || scope === 'source')) {
    const handle = createKnowledgeBaseHandle(manifest, rootRef)
    for (const rawRef of [...rawRefs].sort()) {
      try { await verifyRaw(handle, rawRef) } catch (error) { diagnostics.push(diagnostic('V03_RAW_INTEGRITY', error instanceof Error ? error.message : String(error), join(rootRef, 'raw', rawRef))) }
    }
  }
  return report(scope, diagnostics)
}
