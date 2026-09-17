import { cp, mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { loadKnowledgeBaseManifest } from '../storage/manifest-loader.ts'
import { readCanonicalV03Assets } from '../storage/canonical-v03-loader.ts'
import { readCanonicalV04Assets } from '../storage/canonical-v04-loader.ts'
import { createFreshKnowledgeBaseV04 } from '../storage/create-v04.ts'
import { canonicalSerialize, hashKnowledgeObject } from '../storage/canonical-hash.ts'
import { allocateKnowledgeStorageRefV04, kindForKnowledgeV04 } from '../writer/path-allocation-v04.ts'
import type { KnowledgeAssetV04, KnowledgeSourceV04 } from '../schema/domain-v04.ts'
import type { KnowledgeAssetV03 } from '../storage/v03-types.ts'
import { validateKnowledgeV04Objects } from '../validation/v04-validator.ts'

export interface V03ToV04MigrationOptions { readonly mode: 'dry_run' | 'apply'; readonly outputRoot?: string; readonly now?: string }
export interface V03ToV04MigrationResult { readonly mode: 'dry_run' | 'apply'; readonly status: 'planned' | 'applied' | 'already_applied'; readonly sourceRoot: string; readonly outputRoot?: string; readonly sourceRevision: number; readonly objectIds: readonly string[]; readonly rawRefs: readonly string[]; readonly preservedProvenanceCount: number; readonly validation: { readonly status: 'passed' | 'failed'; readonly errors: readonly string[] } }

function v04Source(source: Extract<KnowledgeAssetV03, { id: `source:${string}` }>): KnowledgeSourceV04 {
  return { ...source, id: source.id, sourceType: source.sourceType, rawRefs: source.rawRefs ? [...source.rawRefs] : [], rights: { accessScope: 'unknown', providerTermsKnown: false, retentionAllowed: null, aiProcessingAllowed: null, derivativeKnowledgeAllowed: null, redistributionAllowed: false, policyBasis: 'legacy-v0.3-migrated' }, usagePolicy: { mode: 'personal_noncommercial_research', retainRaw: true, allowAiProcessing: true, allowDerivedKnowledge: true, redistributionAllowed: false }, acquisition: null, provider: source.publisher ?? null, canonicalUrl: source.url ?? null, retrievedAt: null }
}

function convert(value: KnowledgeAssetV03): KnowledgeAssetV04 {
  if (value.id.startsWith('source:')) return v04Source(value as Extract<KnowledgeAssetV03, { id: `source:${string}` }>)
  return structuredClone(value) as unknown as KnowledgeAssetV04
}

async function ensureDestinationAvailable(rootRef: string): Promise<void> {
  try { const entries = await readdir(rootRef); if (entries.length > 0) throw new Error(`Migration output directory is not empty: ${rootRef}`) } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
}

async function isMatchingAppliedMigration(rootRef: string, sourceManifest: { readonly knowledgeBaseId: string; readonly revision: number }, objects: readonly KnowledgeAssetV04[]): Promise<boolean> {
  try {
    const manifest = await loadKnowledgeBaseManifest(rootRef)
    if (manifest.schemaVersion !== '0.4' || manifest.storageFormatVersion !== '1' || manifest.migrationSourceKnowledgeBaseId !== sourceManifest.knowledgeBaseId || manifest.migrationSourceRevision !== sourceManifest.revision) return false
    const existing = await readCanonicalV04Assets(rootRef)
    const existingById = new Map(existing.objects.map((item) => [item.value.id, item.value]))
    return existingById.size === objects.length && objects.every((object) => hashKnowledgeObject(existingById.get(object.id)) === hashKnowledgeObject(object))
  } catch {
    return false
  }
}

export async function migrateV03ToV04(sourceRootRef: string, options: V03ToV04MigrationOptions): Promise<V03ToV04MigrationResult> {
  if (options.mode !== 'dry_run' && options.mode !== 'apply') throw new Error(`Unsupported migration mode: ${options.mode}`)
  const sourceRoot = resolve(sourceRootRef); const sourceManifest = await loadKnowledgeBaseManifest(sourceRoot)
  if (sourceManifest.schemaVersion !== '0.3' || sourceManifest.storageFormatVersion !== '1') throw new Error(`Migration requires a Schema 0.3 / Storage Format 1 source, received ${sourceManifest.schemaVersion}/${sourceManifest.storageFormatVersion}`)
  const assets = await readCanonicalV03Assets(sourceRoot); const objects = [...assets.themeGroups, ...assets.entities, ...assets.relations, ...assets.claims, ...assets.modules, ...assets.sources].map((item) => convert(item.value)); const report = validateKnowledgeV04Objects(objects); const validation = { status: report.status, errors: report.errors.map((error) => `${error.code}: ${error.message}`) }; if (report.status === 'failed') throw new Error(`Migrated Schema 0.4 projection is invalid: ${validation.errors.join('; ')}`)
  const objectIds = objects.map((object) => object.id).sort(); const rawRefs = [...new Set(assets.sources.flatMap((item) => item.value.rawRefs ?? []))].sort(); const preservedProvenanceCount = assets.claims.reduce((total, item) => total + (item.value.provenance?.length ?? 0), 0)
  const result: V03ToV04MigrationResult = { mode: options.mode, status: options.mode === 'dry_run' ? 'planned' : 'applied', sourceRoot, ...(options.outputRoot === undefined ? {} : { outputRoot: resolve(options.outputRoot) }), sourceRevision: sourceManifest.revision, objectIds, rawRefs, preservedProvenanceCount, validation }
  if (options.mode === 'dry_run') return result
  if (!options.outputRoot) throw new Error('Migration apply requires an explicit outputRoot; the source Knowledge Base is never modified in place')
  const outputRoot = resolve(options.outputRoot); if (await isMatchingAppliedMigration(outputRoot, sourceManifest, objects)) return { ...result, status: 'already_applied', outputRoot }; await ensureDestinationAvailable(outputRoot); await mkdir(outputRoot, { recursive: true }); await createFreshKnowledgeBaseV04(outputRoot, { knowledgeBaseId: `${sourceManifest.knowledgeBaseId}-v04`, name: sourceManifest.name, now: options.now ?? sourceManifest.updatedAt }); const manifestPath = join(outputRoot, 'manifest.yaml'); const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as Record<string, unknown>; await writeFile(manifestPath, `${canonicalSerialize({ ...manifest, migrationSourceKnowledgeBaseId: sourceManifest.knowledgeBaseId, migrationSourceRevision: sourceManifest.revision, migrationSourceSchemaVersion: sourceManifest.schemaVersion })}\n`, 'utf8')
  const registry: Record<string, { type: string; storageRef: string }> = {}; for (const object of objects) { const storageRef = allocateKnowledgeStorageRefV04(object); registry[object.id] = { type: kindForKnowledgeV04(object), storageRef }; await mkdir(dirname(join(outputRoot, storageRef)), { recursive: true }); await writeFile(join(outputRoot, storageRef), `${canonicalSerialize(object)}\n`, 'utf8') }
  await writeFile(join(outputRoot, 'registry', 'assets.yaml'), `${canonicalSerialize(registry)}\n`, 'utf8')
  try { await cp(join(sourceRoot, 'raw'), join(outputRoot, 'raw'), { recursive: true, force: true }) } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
  try { await cp(join(sourceRoot, 'registry', 'raw.yaml'), join(outputRoot, 'registry', 'raw.yaml'), { force: true }) } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
  return result
}
