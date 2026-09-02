import type { ReasoningExecutor, ReasoningRequest } from '../../plugins/reasoning/contracts.ts'
import { ReasoningExecutorError } from '../../plugins/reasoning/errors.ts'
import { KnowledgeCurationError } from './errors.ts'
import { buildCurationSchemaContext } from './schema-context.ts'
import { projectExtractKnowledgeModelInput, projectReconcileKnowledgeModelInput, projectUnderstandAndPlanModelInput } from './model-input.ts'
import { validateExtractKnowledge, validateReconcileKnowledge, validateUnderstandAndPlanOutput } from './validation.ts'
import { UNDERSTAND_AND_PLAN_PROMPT } from './prompts/understand-and-plan.ts'
import { EXTRACT_KNOWLEDGE_PROMPT } from './prompts/extract-knowledge.ts'
import { RECONCILE_KNOWLEDGE_PROMPT } from './prompts/reconcile-knowledge.ts'
import { UNDERSTAND_AND_PLAN_OUTPUT_CONTRACT, EXTRACT_KNOWLEDGE_OUTPUT_CONTRACT, RECONCILE_KNOWLEDGE_OUTPUT_CONTRACT } from './output-contracts.ts'
import type { ExtractKnowledgeInput, ReconcileKnowledgeInput, ReconcileKnowledgeOutput, UnderstandAndPlanInput, UnderstandAndPlanOutput, ValidatedExtractKnowledgeResult } from './contracts.ts'

export interface KnowledgeCurationSkillOptions { readonly executor: ReasoningExecutor }

export class KnowledgeCurationSkill {
  constructor(private readonly options: KnowledgeCurationSkillOptions) {
    if (!options?.executor || typeof options.executor.execute !== 'function' || typeof options.executor.capabilities !== 'function') throw new KnowledgeCurationError('reasoning_failed', 'KnowledgeCurationSkill requires an injected ReasoningExecutor')
  }

  async understandAndPlan(input: UnderstandAndPlanInput): Promise<UnderstandAndPlanOutput> {
    const schemaContext = input.schemaContext.slice === 'understand_and_plan' ? input.schemaContext : buildCurationSchemaContext('understand_and_plan')
    const result = await this.invoke({ operation: 'understandAndPlan', instruction: UNDERSTAND_AND_PLAN_PROMPT, input: projectUnderstandAndPlanModelInput({ ...input, schemaContext }), outputContract: UNDERSTAND_AND_PLAN_OUTPUT_CONTRACT })
    return validateUnderstandAndPlanOutput(result, { document: input.document, schemaContext })
  }

  async extractKnowledge(input: ExtractKnowledgeInput): Promise<ValidatedExtractKnowledgeResult> {
    const schemaContext = input.schemaContext.slice === 'knowledge_extraction' ? input.schemaContext : buildCurationSchemaContext('knowledge_extraction')
    const result = await this.invoke({ operation: 'extractKnowledge', instruction: EXTRACT_KNOWLEDGE_PROMPT + feedback(input.validationFeedback), input: projectExtractKnowledgeModelInput({ ...input, schemaContext }), outputContract: EXTRACT_KNOWLEDGE_OUTPUT_CONTRACT })
    return validateExtractKnowledge(result, { ...input, schemaContext })
  }

  async reconcileKnowledge(input: ReconcileKnowledgeInput): Promise<ReconcileKnowledgeOutput> {
    const schemaContext = input.schemaContext.slice === 'reconciliation' ? input.schemaContext : buildCurationSchemaContext('reconciliation')
    const result = await this.invoke({ operation: 'reconcileKnowledge', instruction: RECONCILE_KNOWLEDGE_PROMPT, input: projectReconcileKnowledgeModelInput({ ...input, schemaContext }), outputContract: RECONCILE_KNOWLEDGE_OUTPUT_CONTRACT })
    return validateReconcileKnowledge(result, { ...input, schemaContext })
  }

  private async invoke(request: ReasoningRequest): Promise<unknown> {
    try {
      const result = await this.options.executor.execute(request)
      return parseOutput(result.output, request.operation)
    } catch (error) {
      if (error instanceof KnowledgeCurationError) throw error
      if (error instanceof ReasoningExecutorError) throw new KnowledgeCurationError('reasoning_failed', error.message, request.operation, { cause: error })
      throw new KnowledgeCurationError('reasoning_failed', error instanceof Error ? error.message : String(error), request.operation, { cause: error })
    }
  }
}

function parseOutput(value: unknown, operation: ReasoningRequest['operation']): unknown {
  if (typeof value === 'string') {
    const trimmed = value.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
    try { return JSON.parse(trimmed) } catch (error) { throw new KnowledgeCurationError('invalid_model_output', `Reasoning output for ${operation} is not valid JSON`, operation, { cause: error }) }
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new KnowledgeCurationError('invalid_model_output', `Reasoning output for ${operation} must be a JSON object`, operation)
  return structuredClone(value)
}

function feedback(value: ExtractKnowledgeInput['validationFeedback']): string { return value === undefined ? '' : `\n\nDeterministic validation feedback is informational only: ${value.code}: ${value.message.slice(0, 240)}` }
