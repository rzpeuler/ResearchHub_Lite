import { KnowledgeError } from './errors.ts'
import { createKnowledgeBaseHandle, type KnowledgeBaseHandle } from './handle.ts'
import { CanonicalV03KnowledgeLoader } from './canonical-v03-loader.ts'
import { KnowledgeBaseRegistry } from '../registry/registry.ts'
import type { KnowledgeAssetCollectionV03 } from './v03-types.ts'

export class KnowledgeBaseLoaderV03 {
  constructor(public readonly registry = new KnowledgeBaseRegistry()) {}

  async mount(rootRef: string): Promise<KnowledgeBaseHandle> {
    return this.registry.mount(rootRef)
  }

  async load(handle: KnowledgeBaseHandle): Promise<KnowledgeAssetCollectionV03> {
    if (handle.schemaVersion !== '0.3' || handle.storageFormatVersion !== '1') throw new KnowledgeError('UnsupportedSchema', 'Only Schema 0.3 / Storage Format 1 can be loaded')
    return new CanonicalV03KnowledgeLoader(handle.rootRef).readAssets()
  }

  async readAssets(handle: KnowledgeBaseHandle): Promise<KnowledgeAssetCollectionV03> { return this.load(handle) }

  async refresh(handle: KnowledgeBaseHandle): Promise<KnowledgeBaseHandle> { return this.registry.refresh(handle.rootRef) }
}

export { createKnowledgeBaseHandle }
