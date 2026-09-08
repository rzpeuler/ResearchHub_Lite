import { KNOWLEDGE_SCHEMA_V03 } from './executable-schema.ts'

export const KNOWLEDGE_SCHEMA_V04 = {
  ...KNOWLEDGE_SCHEMA_V03,
  identity: { schemaVersion: '0.4', storageFormatVersion: '1' },
  claim: {
    ...KNOWLEDGE_SCHEMA_V03.claim,
    types: [...KNOWLEDGE_SCHEMA_V03.claim.types, 'assumption', 'thesis', 'catalyst'] as const,
    fields: [...KNOWLEDGE_SCHEMA_V03.claim.fields, 'probability', 'supportsClaimRefs', 'dependsOnClaimRefs', 'contradictsClaimRefs'] as const,
    probability: { requiredFor: ['forecast'] as const, minimum: 0, maximum: 1 },
  },
  source: {
    ...KNOWLEDGE_SCHEMA_V03.source,
    fields: [...KNOWLEDGE_SCHEMA_V03.source.fields, 'provider', 'canonicalUrl', 'retrievedAt', 'contentHash', 'acquisition', 'rights'] as const,
    rights: ['accessScope', 'retentionAllowed', 'aiProcessingAllowed', 'derivativeKnowledgeAllowed', 'redistributionAllowed', 'policyBasis'] as const,
  },
} as const

export type KnowledgeSchemaV04 = typeof KNOWLEDGE_SCHEMA_V04
