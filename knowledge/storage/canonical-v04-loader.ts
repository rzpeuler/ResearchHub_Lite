import { readFile } from 'node:fs/promises'
import { isAbsolute, join, relative, resolve, sep } from 'node:path'
import { KNOWLEDGE_SCHEMA_V04 } from '../schema/executable-schema-v04.ts'
import { KnowledgeError } from './errors.ts'
import { parseYaml } from './yaml.ts'
import type { KnowledgeAssetCollectionV04, KnowledgeAssetKindV04, KnowledgeRegistryEntryV04 } from './v04-types.ts'

const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
const namespace: Record<KnowledgeAssetKindV04, string> = { theme_group: KNOWLEDGE_SCHEMA_V04.canonicalNamespaces.themeGroup, entity: KNOWLEDGE_SCHEMA_V04.canonicalNamespaces.entity, relation: KNOWLEDGE_SCHEMA_V04.canonicalNamespaces.relation, claim: KNOWLEDGE_SCHEMA_V04.canonicalNamespaces.claim, source: KNOWLEDGE_SCHEMA_V04.canonicalNamespaces.source, module: KNOWLEDGE_SCHEMA_V04.canonicalNamespaces.module }
const kindSet = new Set(Object.keys(namespace))
function safePath(root: string, value: string, path: string): string { if (isAbsolute(value) || value.trim() === '' || value.split(/[\\/]+/).includes('..')) throw new KnowledgeError('RegistryError', `Unsafe Schema 0.4 storageRef: ${value}`, path); const resolved = resolve(root, value); const rel = relative(root, resolved); if (rel === '..' || rel.startsWith(`..${sep}`)) throw new KnowledgeError('RegistryError', `StorageRef escapes Knowledge Base: ${value}`, path); return resolved }
export async function readCanonicalV04Assets(rootDir: string): Promise<KnowledgeAssetCollectionV04> {
  const root = resolve(rootDir); const registryPath = join(root, 'registry', 'assets.yaml'); let parsed: unknown
  try { parsed = parseYaml(await readFile(registryPath, 'utf8'), registryPath) } catch (error) { throw error instanceof KnowledgeError ? error : new KnowledgeError('RegistryError', String(error), registryPath) }
  if (!record(parsed)) throw new KnowledgeError('RegistryError', 'Schema 0.4 registry must be an object map', registryPath)
  const ids = new Set<string>(); const objects: KnowledgeAssetCollectionV04['objects'][number][] = []; const registry: KnowledgeRegistryEntryV04[] = []
  for (const [id, raw] of Object.entries(parsed)) {
    if (!record(raw) || typeof raw.type !== 'string' || !kindSet.has(raw.type)) throw new KnowledgeError('RegistryError', `Invalid Schema 0.4 registry entry: ${id}`, registryPath)
    if (ids.has(id) || !id.startsWith(namespace[raw.type as KnowledgeAssetKindV04])) throw new KnowledgeError('RegistryError', `Invalid or duplicate Schema 0.4 id: ${id}`, registryPath)
    if (typeof raw.storageRef !== 'string') throw new KnowledgeError('RegistryError', `Registry storageRef must be a string: ${id}`, registryPath)
    const filePath = safePath(root, raw.storageRef, registryPath); let value: unknown
    try { value = parseYaml(await readFile(filePath, 'utf8'), filePath) } catch (error) { throw error instanceof KnowledgeError ? error : new KnowledgeError('RegistryError', `Unable to read Schema 0.4 asset: ${id}`, filePath) }
    if (!record(value) || value.id !== id) throw new KnowledgeError('RegistryError', `Registry key does not match asset id: ${id}`, filePath)
    ids.add(id); const kind = raw.type as KnowledgeAssetKindV04; registry.push({ id, type: kind, storageRef: raw.storageRef }); objects.push({ kind, value: value as never, filePath, storageRef: raw.storageRef })
  }
  registry.sort((a, b) => a.id.localeCompare(b.id)); objects.sort((a, b) => a.value.id.localeCompare(b.value.id)); return { rootDir: root, objects, registry }
}
