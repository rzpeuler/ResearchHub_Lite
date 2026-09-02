import { basename, relative, resolve, sep } from 'node:path'
import type { KnowledgeWritableObjectV03, KnowledgeSourceV03 } from '../schema/index.ts'

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

export function slugFromKnowledgeId(id: string): string {
  const slug = id.split(':')[1]
  if (!slug || !SLUG_PATTERN.test(slug)) throw new Error(`Knowledge ID cannot be allocated to a safe path: ${id}`)
  return slug
}

export function allocateKnowledgeStorageRef(object: KnowledgeWritableObjectV03 | KnowledgeSourceV03): string {
  const slug = slugFromKnowledgeId(object.id)
  if (object.id.startsWith('source:')) return `sources/${slug}.yaml`
  if (object.id.startsWith('theme-group:')) return `theme-groups/${slug}.yaml`
  if (object.id.startsWith('entity:')) return `entities/${String('type' in object ? object.type : 'entity')}/${slug}.yaml`
  if (object.id.startsWith('relation:')) return `relations/${slug}.yaml`
  if (object.id.startsWith('claim:')) return `claims/${slug}.yaml`
  if (object.id.startsWith('module:')) return `modules/${String('type' in object ? object.type : 'module')}/${slug}.yaml`
  throw new Error(`Unsupported Schema 0.3 object ID: ${object.id}`)
}

export function resolveAllocatedPath(rootRef: string, storageRef: string): string {
  const root = resolve(rootRef)
  const resolved = resolve(root, storageRef)
  const relativePath = relative(root, resolved)
  if (relativePath === '..' || relativePath.startsWith(`..${sep}`)) throw new Error(`Allocated path escapes Knowledge Base root: ${storageRef}`)
  return resolved
}

export function isSafeStorageRef(storageRef: string): boolean {
  return storageRef.length > 0 && !storageRef.startsWith('/') && !/^[A-Za-z]:[\\/]/.test(storageRef) && !storageRef.split(/[\\/]+/).includes('..') && basename(storageRef) === storageRef.split(/[\\/]+/).at(-1)
}
