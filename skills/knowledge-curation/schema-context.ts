import { KNOWLEDGE_SCHEMA_V03 } from '../../knowledge/schema/executable-schema.ts'
import type { ClaimComparatorV03, ClaimTemporalScopeTypeV03, ClaimTypeV03, EntityTypeV03, RelationTypeV03, SourceTypeV03 } from '../../knowledge/schema/domain.ts'
import type { CurationSchemaContext, CurationSchemaContextSlice, RelationSchemaContract } from './schema-context-types.ts'

export function buildCurationSchemaContext(slice: CurationSchemaContextSlice): CurationSchemaContext {
  const schema = KNOWLEDGE_SCHEMA_V03
  const relationContracts = schema.relation.types.map((relationType) => {
    const definition = schema.relation.definitions[relationType] as { directionality: string; sourceTypes: readonly EntityTypeV03[]; targetTypes: readonly EntityTypeV03[]; endpointConstraint?: string }
    const result: RelationSchemaContract = {
      relationType,
      allowedSourceTypes: definition.sourceTypes,
      allowedTargetTypes: definition.targetTypes,
      directionality: definition.directionality,
      ...(definition.endpointConstraint === undefined ? {} : { endpointConstraint: definition.endpointConstraint }),
    }
    return result
  })
  if (!['understand_and_plan', 'knowledge_extraction', 'reconciliation'].includes(slice)) throw new Error(`Unsupported Knowledge Curation Schema Context slice: ${String(slice)}`)
  return Object.freeze({
    schemaVersion: schema.identity.schemaVersion,
    storageFormatVersion: schema.identity.storageFormatVersion,
    slice,
    entityTypes: [...schema.entity.types] as EntityTypeV03[],
    relationTypes: [...schema.relation.types] as RelationTypeV03[],
    claimTypes: [...schema.claim.types] as ClaimTypeV03[],
    claimTemporalScopeTypes: [...schema.claim.temporalScopeTypes] as ClaimTemporalScopeTypeV03[],
    claimComparators: [...schema.claim.comparators] as ClaimComparatorV03[],
    sourceTypes: [...schema.source.types] as SourceTypeV03[],
    relationContracts: Object.freeze(relationContracts),
    numericConstraints: structuredClone(schema.numericConstraints),
  })
}
