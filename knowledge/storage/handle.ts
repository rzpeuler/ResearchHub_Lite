import type { KnowledgeBaseManifest } from '../schema/manifest.ts'

export interface KnowledgeBaseHandleInit {
  knowledgeBaseId: string
  rootRef: string
  schemaVersion: string
  storageFormatVersion: string
  revision: number
  status: KnowledgeBaseManifest['status']
}

export class KnowledgeBaseHandle {
  readonly knowledgeBaseId: string
  readonly rootRef: string
  readonly schemaVersion: string
  readonly storageFormatVersion: string
  readonly revision: number
  readonly status: KnowledgeBaseManifest['status']

  constructor(input: KnowledgeBaseHandleInit) {
    this.knowledgeBaseId = input.knowledgeBaseId
    this.rootRef = input.rootRef
    this.schemaVersion = input.schemaVersion
    this.storageFormatVersion = input.storageFormatVersion
    this.revision = input.revision
    this.status = input.status
    Object.freeze(this)
  }

  get writable(): boolean { return this.schemaVersion === '0.3' && this.storageFormatVersion === '1' && this.status === 'active' }
}

export function createKnowledgeBaseHandle(manifest: KnowledgeBaseManifest, rootRef: string): KnowledgeBaseHandle {
  return new KnowledgeBaseHandle({
    knowledgeBaseId: manifest.knowledgeBaseId,
    rootRef,
    schemaVersion: manifest.schemaVersion,
    storageFormatVersion: manifest.storageFormatVersion,
    revision: manifest.revision,
    status: manifest.status,
  })
}
