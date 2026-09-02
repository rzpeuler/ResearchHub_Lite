import { resolve } from 'node:path'
import { KnowledgeError } from '../storage/errors.ts'
import { createKnowledgeBaseHandle, type KnowledgeBaseHandle } from '../storage/handle.ts'
import { loadKnowledgeBaseManifest } from '../storage/manifest-loader.ts'

export class KnowledgeBaseRegistry {
  private readonly handles = new Map<string, KnowledgeBaseHandle>()

  async mount(rootRef: string): Promise<KnowledgeBaseHandle> {
    const manifest = await loadKnowledgeBaseManifest(rootRef)
    if (manifest.schemaVersion !== '0.3' || manifest.storageFormatVersion !== '1') throw new KnowledgeError('UnsupportedSchema', `Unsupported Knowledge Base version: ${manifest.schemaVersion}/${manifest.storageFormatVersion}`, rootRef)
    return this.register(createKnowledgeBaseHandle(manifest, resolve(rootRef)))
  }

  register(handle: KnowledgeBaseHandle): KnowledgeBaseHandle {
    if (handle.schemaVersion !== '0.3' || handle.storageFormatVersion !== '1') throw new KnowledgeError('UnsupportedSchema', 'Only Schema 0.3 / Storage Format 1 Knowledge Bases can be mounted')
    const existing = this.handles.get(handle.knowledgeBaseId)
    if (existing && resolve(existing.rootRef) !== resolve(handle.rootRef)) throw new KnowledgeError('MountConflict', `Knowledge Base ID is already mounted from another root: ${handle.knowledgeBaseId}`)
    if (existing) return existing
    this.handles.set(handle.knowledgeBaseId, handle)
    return handle
  }

  async refresh(rootRef: string): Promise<KnowledgeBaseHandle> {
    const manifest = await loadKnowledgeBaseManifest(rootRef)
    if (manifest.schemaVersion !== '0.3' || manifest.storageFormatVersion !== '1') throw new KnowledgeError('UnsupportedSchema', `Unsupported Knowledge Base version: ${manifest.schemaVersion}/${manifest.storageFormatVersion}`, rootRef)
    const handle = createKnowledgeBaseHandle(manifest, resolve(rootRef))
    const existing = this.handles.get(handle.knowledgeBaseId)
    if (existing && resolve(existing.rootRef) !== resolve(handle.rootRef)) throw new KnowledgeError('MountConflict', `Knowledge Base ID is already mounted from another root: ${handle.knowledgeBaseId}`)
    this.handles.set(handle.knowledgeBaseId, handle)
    return handle
  }

  unmount(knowledgeBaseId: string): boolean { return this.handles.delete(knowledgeBaseId) }
  get(knowledgeBaseId: string): KnowledgeBaseHandle | undefined { return this.handles.get(knowledgeBaseId) }
  list(): KnowledgeBaseHandle[] { return [...this.handles.values()].sort((a, b) => a.knowledgeBaseId.localeCompare(b.knowledgeBaseId)) }
}
