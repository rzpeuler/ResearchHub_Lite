import type { ReasoningExecutor, ReasoningRequest } from '../../plugins/reasoning/contracts.ts'
import { ReasoningExecutorError } from '../../plugins/reasoning/errors.ts'
import { validateReasoningCapabilities } from '../../plugins/reasoning/capabilities.ts'
import { KnowledgeCurationError } from './errors.ts'
import { buildCurationSchemaContext } from './schema-context.ts'
import { projectExtractKnowledgeModelInput, projectResolveSemanticCaseModelInput, projectUnderstandAndPlanModelInput } from './model-input.ts'
import { validateExtractKnowledge, validateSemanticResolutionResult, validateUnderstandAndPlanOutput } from './validation.ts'
import { UNDERSTAND_AND_PLAN_PROMPT, PLAN_REPAIR_PROMPT } from './prompts/understand-and-plan.ts'
import { EXTRACT_KNOWLEDGE_PROMPT } from './prompts/extract-knowledge.ts'
import { RESOLVE_SEMANTIC_CASE_PROMPT } from './prompts/resolve-semantic-case.ts'
import { buildUnderstandAndPlanOutputContract, buildExtractKnowledgeOutputContract, buildResolveSemanticCaseOutputContract } from './output-contracts.ts'
import type { ExtractKnowledgeInput, ResolveSemanticCaseInput, SemanticResolutionResult, UnderstandAndPlanInput, UnderstandAndPlanOutput, ValidatedExtractKnowledgeResult } from './contracts.ts'

export interface KnowledgeCurationSkillOptions { readonly executor: ReasoningExecutor }

export class KnowledgeCurationSkill {
  constructor(private readonly options: KnowledgeCurationSkillOptions) {
    if (!options?.executor || typeof options.executor.execute !== 'function' || typeof options.executor.capabilities !== 'function') throw new KnowledgeCurationError('reasoning_failed', 'KnowledgeCurationSkill requires an injected ReasoningExecutor')
  }

  capabilities() {
    return validateReasoningCapabilities(this.options.executor.capabilities())
  }

  async understandAndPlan(input: UnderstandAndPlanInput): Promise<UnderstandAndPlanOutput> {
    const schemaContext = buildCurationSchemaContext('understand_and_plan')
    const capabilities = validateReasoningCapabilities(this.options.executor.capabilities())
    const result = await this.invoke({ operation: 'understandAndPlan', instruction: input.planRepair === undefined ? UNDERSTAND_AND_PLAN_PROMPT : `${UNDERSTAND_AND_PLAN_PROMPT}\n\n${PLAN_REPAIR_PROMPT}`, input: projectUnderstandAndPlanModelInput({ ...input, capabilities, schemaContext }), outputContract: buildUnderstandAndPlanOutputContract(schemaContext) })
    return validateUnderstandAndPlanOutput(result, { document: input.document, schemaContext })
  }

  async extractKnowledge(input: ExtractKnowledgeInput): Promise<ValidatedExtractKnowledgeResult> {
    const schemaContext = buildCurationSchemaContext('knowledge_extraction')
    const result = await this.invoke({ operation: 'extractKnowledge', instruction: EXTRACT_KNOWLEDGE_PROMPT + feedback(input.validationFeedback), input: projectExtractKnowledgeModelInput({ ...input, schemaContext }), outputContract: buildExtractKnowledgeOutputContract(schemaContext) })
    return validateExtractKnowledge(result, { ...input, schemaContext })
  }

  async resolveSemanticCase(input: ResolveSemanticCaseInput): Promise<SemanticResolutionResult> {
    const schemaContext = buildCurationSchemaContext('knowledge_resolution')
    const result = await this.invoke({ operation: 'resolveSemanticCase', instruction: RESOLVE_SEMANTIC_CASE_PROMPT, input: projectResolveSemanticCaseModelInput({ ...input, schemaContext }), outputContract: buildResolveSemanticCaseOutputContract({ caseKind: input.resolutionCase.caseKind, allowedOutcomes: input.resolutionCase.allowedOutcomes, existingAliases: input.resolutionCase.existingProjections.map((item) => item.alias) }) })
    return validateSemanticResolutionResult(result, { ...input, schemaContext })
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
