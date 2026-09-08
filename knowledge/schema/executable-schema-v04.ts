import { KNOWLEDGE_SCHEMA_V03 } from './executable-schema.ts'

export const KNOWLEDGE_SCHEMA_V04 = {
  ...KNOWLEDGE_SCHEMA_V03,
  identity: { schemaVersion: '0.4', storageFormatVersion: '1' },
  relation: {
    ...KNOWLEDGE_SCHEMA_V03.relation,
    definitions: {
      ...KNOWLEDGE_SCHEMA_V03.relation.definitions,
      belongs_to_industry: {
        ...KNOWLEDGE_SCHEMA_V03.relation.definitions.belongs_to_industry,
        sourceTypes: ['company', 'product', 'technology'] as const,
      },
    },
  },
  claim: {
    ...KNOWLEDGE_SCHEMA_V03.claim,
    types: [...KNOWLEDGE_SCHEMA_V03.claim.types, 'assumption', 'thesis', 'catalyst'] as const,
    fields: [...KNOWLEDGE_SCHEMA_V03.claim.fields, 'probability', 'supportsClaimRefs', 'dependsOnClaimRefs', 'contradictsClaimRefs'] as const,
    structuredValueFields: ['metric', 'value', 'unit', 'comparator', 'period', 'fiscalPeriod', 'semanticKey'] as const,
    probability: { requiredFor: ['forecast'] as const, minimum: 0, maximum: 1 },
  },
  source: {
    ...KNOWLEDGE_SCHEMA_V03.source,
    fields: [...KNOWLEDGE_SCHEMA_V03.source.fields, 'provider', 'canonicalUrl', 'retrievedAt', 'contentHash', 'acquisition', 'rights', 'usagePolicy'] as const,
    rights: ['accessScope', 'providerTermsKnown', 'retentionAllowed', 'aiProcessingAllowed', 'derivativeKnowledgeAllowed', 'redistributionAllowed'] as const,
    usagePolicy: ['mode', 'retainRaw', 'allowAiProcessing', 'allowDerivedKnowledge', 'redistributionAllowed'] as const,
  },
} as const

export type KnowledgeSchemaV04 = typeof KNOWLEDGE_SCHEMA_V04
