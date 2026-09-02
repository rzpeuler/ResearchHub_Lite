export interface KnowledgeSchemaRelease {
  schemaVersion: '0.3'
  storageFormatVersion: '1'
  readable: true
  writable: true
}

export function findKnowledgeSchemaRelease(version: { schemaVersion: string; storageFormatVersion: string }): KnowledgeSchemaRelease | undefined {
  return version.schemaVersion === '0.3' && version.storageFormatVersion === '1'
    ? { schemaVersion: '0.3', storageFormatVersion: '1', readable: true, writable: true }
    : undefined
}
