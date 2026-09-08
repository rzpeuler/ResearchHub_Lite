import type { KnowledgeAssetKindV04, KnowledgeAssetV04 } from '../schema/domain-v04.ts'
export type { KnowledgeAssetKindV04, KnowledgeAssetV04 } from '../schema/domain-v04.ts'
export interface KnowledgeRegistryEntryV04 { readonly id: string; readonly type: KnowledgeAssetKindV04; readonly storageRef: string }
export interface LoadedAssetV04 { readonly kind: KnowledgeAssetKindV04; readonly value: KnowledgeAssetV04; readonly filePath: string; readonly storageRef: string }
export interface KnowledgeAssetCollectionV04 { readonly rootDir: string; readonly objects: readonly LoadedAssetV04[]; readonly registry: readonly KnowledgeRegistryEntryV04[] }
