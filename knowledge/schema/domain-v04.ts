import type { KnowledgeClaimV03, KnowledgeEntityV03, KnowledgeModuleV03, KnowledgeRelationV03, KnowledgeSourceV03, KnowledgeThemeGroupV03, KnowledgeMetadataV03, SourceTypeV03, SourceReliabilityV03 } from './domain.ts'

export type ClaimTypeV04 = 'fact' | 'forecast' | 'viewpoint' | 'trend' | 'risk' | 'assumption' | 'thesis' | 'catalyst'
export type ClaimRefV04 = `claim:${string}`
export type SourceRefV04 = `source:${string}`
export type RawRefV04 = `raw-sha256-${string}`
export type EntityRefV04 = `entity:${string}`
export type RelationRefV04 = `relation:${string}`
export type CanonicalKnowledgeRefV04 = `theme-group:${string}` | EntityRefV04 | RelationRefV04 | ClaimRefV04 | SourceRefV04 | `module:${string}` | RawRefV04

export interface SourceRightsV04 {
  accessScope: 'public' | 'authenticated' | 'restricted' | 'unknown'
  retentionAllowed: boolean
  aiProcessingAllowed: boolean
  derivativeKnowledgeAllowed: boolean
  redistributionAllowed: boolean
}

export interface SourceAcquisitionV04 {
  method: 'official' | 'structured_data' | 'news_search' | 'rss' | 'web_fetch' | 'manual' | 'unknown'
  discoveredAt?: string | null
  fetchedAt?: string | null
  extractor?: string | null
}

export interface KnowledgeClaimV04 extends Omit<KnowledgeClaimV03, 'claimType' | 'sourceRefs' | 'provenance' | 'confidence' | 'supersedes' | 'supersededBy'> {
  claimType: ClaimTypeV04
  sourceRefs: SourceRefV04[]
  provenance?: Array<{ sourceRef: SourceRefV04; rawRef: RawRefV04; locator: string | null; chunkRef: string | null }>
  confidence?: number | null
  probability?: number | null
  supportsClaimRefs?: ClaimRefV04[]
  dependsOnClaimRefs?: ClaimRefV04[]
  contradictsClaimRefs?: ClaimRefV04[]
  supersedes?: ClaimRefV04[]
  supersededBy?: ClaimRefV04[]
}

export interface KnowledgeSourceV04 extends Omit<KnowledgeSourceV03, 'sourceType' | 'sourceReliability' | 'rawRefs' | 'metadata'> {
  sourceType: SourceTypeV03
  sourceReliability?: SourceReliabilityV03
  rawRefs?: RawRefV04[]
  provider?: string | null
  canonicalUrl?: string | null
  retrievedAt?: string | null
  contentHash?: string | null
  acquisition?: SourceAcquisitionV04 | null
  rights: SourceRightsV04
  metadata?: KnowledgeMetadataV03
}

export type KnowledgeEntityV04 = KnowledgeEntityV03
export type KnowledgeRelationV04 = KnowledgeRelationV03
export type KnowledgeThemeGroupV04 = KnowledgeThemeGroupV03
export type KnowledgeModuleV04 = KnowledgeModuleV03
export type KnowledgeAssetV04 = KnowledgeThemeGroupV04 | KnowledgeEntityV04 | KnowledgeRelationV04 | KnowledgeClaimV04 | KnowledgeSourceV04 | KnowledgeModuleV04
export type KnowledgeAssetKindV04 = 'theme_group' | 'entity' | 'relation' | 'claim' | 'source' | 'module'
