import type { CurationSchemaContext } from './schema-context-types.ts'

export interface StructuredOutputContract {
  readonly format: 'json'
  readonly root: 'object'
  readonly additionalProperties: false
  readonly schema: Readonly<Record<string, unknown>>
}

const noExtra = { additionalProperties: false } as const
const text = { type: 'string' } as const
const confidence = { type: 'number', minimum: 0, maximum: 1 } as const

function enumSchema(values: readonly string[]): Record<string, unknown> { return { type: 'string', enum: [...values] } }
function nullableEnumSchema(values: readonly string[]): Record<string, unknown> { return { oneOf: [enumSchema(values), { type: 'null' }] } }
function arraySchema(items: unknown): Record<string, unknown> { return { type: 'array', items } }
function objectSchema(required: readonly string[], properties: Readonly<Record<string, unknown>>): Record<string, unknown> { return { type: 'object', ...noExtra, required: [...required], properties } }
function contentRefSchema(): Record<string, unknown> {
  return { oneOf: [
    objectSchema(['kind', 'blockId'], { kind: { const: 'block' }, blockId: text }),
    objectSchema(['kind', 'sectionId'], { kind: { const: 'section' }, sectionId: text }),
  ] }
}
function evidenceItemSchema(required: readonly string[], properties: Readonly<Record<string, unknown>>): Record<string, unknown> { return objectSchema([...required, 'evidenceRefs'], { ...properties, evidenceRefs: arraySchema(contentRefSchema()) }) }

export function buildUnderstandAndPlanOutputContract(schema: CurationSchemaContext): StructuredOutputContract {
  const sourceAssessment = objectSchema(['summary'], { summary: text, sourceType: enumSchema(schema.sourceTypes), reliability: enumSchema(schema.sourceReliabilities), uncertainty: arraySchema(text) })
  const reportMap = objectSchema(
    ['sourceAssessment', 'researchScope', 'majorTopics', 'majorEntityMentions', 'majorConclusions', 'sectionSemantics', 'semanticDependencies', 'themeHypotheses', 'uncertainty'],
    {
      sourceAssessment,
      researchScope: text,
      majorTopics: arraySchema(evidenceItemSchema(['topicId', 'label'], { topicId: text, label: text, description: text })),
      majorEntityMentions: arraySchema(evidenceItemSchema(['mentionId', 'text'], { mentionId: text, text, entityType: enumSchema(schema.entityTypes) })),
      majorConclusions: arraySchema(evidenceItemSchema(['conclusionId', 'text'], { conclusionId: text, text })),
      sectionSemantics: arraySchema(objectSchema(['sectionRef', 'summary'], { sectionRef: text, summary: text, topicRefs: arraySchema(text), evidenceRefs: arraySchema(contentRefSchema()) })),
      semanticDependencies: arraySchema(objectSchema(['fromSectionRef', 'toSectionRef', 'reason'], { fromSectionRef: text, toSectionRef: text, reason: text })),
      themeHypotheses: arraySchema(evidenceItemSchema(['text'], { text })),
      uncertainty: arraySchema(text),
    },
  )
  const unit = objectSchema(['proposedUnitId', 'topic', 'semanticPurpose', 'primaryRefs', 'contextRefs'], { proposedUnitId: text, topic: text, semanticPurpose: text, primaryRefs: arraySchema(contentRefSchema()), contextRefs: arraySchema(contentRefSchema()), extractionFocus: text })
  const plan = objectSchema(['units', 'excludedRefs'], { units: arraySchema(unit), excludedRefs: arraySchema(contentRefSchema()) })
  return { format: 'json', root: 'object', additionalProperties: false, schema: objectSchema(['reportMap', 'extractionPlanProposal'], { reportMap, extractionPlanProposal: plan }) }
}

function candidateEntityRefSchema(schema: CurationSchemaContext): Record<string, unknown> { return objectSchema(['candidateRef', 'mention'], { candidateRef: text, mention: text, entityType: enumSchema(schema.entityTypes) }) }
function candidateCommon(kindProperties: Readonly<Record<string, unknown>>, required: readonly string[]): Record<string, unknown> { return objectSchema([...required, 'candidateId', 'evidenceBlockRefs', 'reason'], { candidateId: text, ...kindProperties, evidenceBlockRefs: arraySchema(text), reason: text, confidence }) }

export function buildExtractKnowledgeOutputContract(schema: CurationSchemaContext): StructuredOutputContract {
  const entity = candidateCommon({ entityType: enumSchema(schema.entityTypes), name: text, aliases: arraySchema(text), description: { type: ['string', 'null'] }, semanticFields: { type: 'object' } }, ['entityType', 'name'])
  const relation = candidateCommon({ relationType: enumSchema(schema.relationTypes), source: candidateEntityRefSchema(schema), target: candidateEntityRefSchema(schema), attributes: { type: 'object' } }, ['relationType', 'source', 'target'])
  const temporal = objectSchema(['asOf', 'scope'], { asOf: { type: ['string', 'null'] }, scope: objectSchema(['type', 'start', 'end', 'label'], { type: enumSchema(schema.claimTemporalScopeTypes), start: { type: ['string', 'null'] }, end: { type: ['string', 'null'] }, label: { type: ['string', 'null'] } }) })
  const structuredValue = objectSchema(['metric', 'value', 'unit', 'comparator'], { metric: text, value: { type: ['string', 'number', 'boolean', 'null'] }, unit: { type: ['string', 'null'] }, comparator: nullableEnumSchema(schema.claimComparators) })
  const claim = candidateCommon({ claimType: enumSchema(schema.claimTypes), statement: text, subjectRefs: { ...arraySchema(candidateEntityRefSchema(schema)), minItems: 1 }, temporal: { oneOf: [temporal, { type: 'null' }] }, structuredValue: { oneOf: [structuredValue, { type: 'null' }] } }, ['claimType', 'statement', 'subjectRefs'])
  return { format: 'json', root: 'object', additionalProperties: false, schema: objectSchema(['entities', 'relations', 'claims'], { entities: arraySchema(entity), relations: arraySchema(relation), claims: arraySchema(claim) }) }
}

export function buildReconcileKnowledgeOutputContract(): StructuredOutputContract {
  const action = enumSchema(['create', 'duplicate', 'merge_source', 'update_state', 'supersede', 'keep_both', 'reject', 'user_review'])
  const decision = objectSchema(['candidateId', 'action', 'rationale'], { candidateId: text, action, rationale: text, targetCandidateId: text, conflictingFields: arraySchema(text) })
  return { format: 'json', root: 'object', additionalProperties: false, schema: objectSchema(['decisions'], { decisions: arraySchema(decision) }) }
}
