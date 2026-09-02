export const UNDERSTAND_AND_PLAN_OUTPUT_CONTRACT = { format: 'json', root: 'object', additionalProperties: false, required: ['reportMap', 'extractionPlanProposal'] } as const
export const EXTRACT_KNOWLEDGE_OUTPUT_CONTRACT = { format: 'json', root: 'object', additionalProperties: false, required: ['entities', 'relations', 'claims'] } as const
export const RECONCILE_KNOWLEDGE_OUTPUT_CONTRACT = { format: 'json', root: 'object', additionalProperties: false, required: ['decisions'] } as const
