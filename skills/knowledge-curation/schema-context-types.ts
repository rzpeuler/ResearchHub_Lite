import type { ClaimComparatorV03, ClaimTemporalScopeTypeV03, ClaimTypeV03, EntityTypeV03, RelationTypeV03, SourceReliabilityV03, SourceTypeV03 } from '../../knowledge/schema/domain.ts'

export type CurationSchemaContextSlice = 'understand_and_plan' | 'knowledge_extraction' | 'knowledge_resolution'

export interface RelationSchemaContract {
  readonly relationType: RelationTypeV03
  readonly allowedSourceTypes: readonly EntityTypeV03[]
  readonly allowedTargetTypes: readonly EntityTypeV03[]
  readonly directionality: string
  readonly endpointConstraint?: string
  readonly attributes?: Readonly<Record<string, unknown>>
}

export interface EntitySchemaContract {
  readonly entityType: EntityTypeV03
  readonly semanticFields?: readonly string[]
}

export interface CurationSchemaContext {
  readonly schemaVersion: '0.3'
  readonly storageFormatVersion: '1'
  readonly slice: CurationSchemaContextSlice
  readonly entityTypes: readonly EntityTypeV03[]
  readonly relationTypes: readonly RelationTypeV03[]
  readonly claimTypes: readonly ClaimTypeV03[]
  readonly claimTemporalScopeTypes: readonly ClaimTemporalScopeTypeV03[]
  readonly claimComparators: readonly ClaimComparatorV03[]
  readonly sourceTypes: readonly SourceTypeV03[]
  readonly sourceReliabilities: readonly SourceReliabilityV03[]
  readonly entityContracts: readonly EntitySchemaContract[]
  readonly relationContracts: readonly RelationSchemaContract[]
  readonly numericConstraints: Readonly<Record<string, unknown>>
}
