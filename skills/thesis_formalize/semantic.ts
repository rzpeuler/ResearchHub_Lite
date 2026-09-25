import { REASONING_ERROR_CODES, ReasoningExecutorError } from '../../plugins/reasoning/errors.ts'
import type { ReasoningExecutor } from '../../plugins/reasoning/contracts.ts'
import { formalizeThesis } from './calculations.ts'
import { ThesisFormalizationError, THESIS_EVIDENCE_BASES, THESIS_PROPOSITION_TYPES, type FormalizedThesisResult, type ThesisFormalizeEvidence, type ThesisFormalizeSemanticInput, type ThesisFormalizeSemanticResult, type ThesisPropositionInput } from './contracts.ts'

const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,95}$/
const MAX_PROPOSITIONS = 40
const MAX_GAPS = 40
const THESIS_FORMALIZATION_ERROR_CODES = [
  'THESIS_SUMMARY_MISSING',
  'THESIS_PROPOSITIONS_INVALID',
  'THESIS_RESEARCH_GAPS_INVALID',
  'THESIS_ASOF_INVALID',
  'THESIS_PROPOSITION_INVALID',
  'THESIS_PROPOSITION_ENUM_INVALID',
  'THESIS_TIME_HORIZON_MISSING',
  'VERIFIED_PROPOSITION_SOURCE_MISSING',
  'THESIS_PROPOSITION_REF_DANGLING',
  'THESIS_PROPOSITION_SELF_DEPENDENCY',
  'THESIS_VERIFICATION_TIME_INVALID',
  'THESIS_AVAILABILITY_INVALID',
  'THESIS_RESEARCH_GAP_INVALID',
  'THESIS_RESEARCH_GAP_DUPLICATE',
  'THESIS_RESEARCH_GAP_REF_DANGLING',
  'THESIS_DEPENDENCY_CYCLE',
  'THESIS_PROPOSITION_DUPLICATE',
] as const
const text = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0

class SemanticValidationError extends Error {
  readonly diagnostics: readonly string[]
  constructor(message: string, diagnostics: readonly string[]) { super(message); this.name = 'SemanticValidationError'; this.diagnostics = diagnostics }
}

function parseObject(value: unknown): Record<string, unknown> {
  if (typeof value === 'string') {
    try { return parseObject(JSON.parse(value.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, ''))) }
    catch { throw new SemanticValidationError('Invalid semantic JSON', ['formalize_output_json_invalid']) }
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new SemanticValidationError('Semantic output must be an object', ['formalize_output_shape_invalid'])
  const object = value as Record<string, unknown>
  for (const wrapper of ['output', 'result', 'data']) if (object[wrapper] && typeof object[wrapper] === 'object' && !Array.isArray(object[wrapper])) return parseObject(object[wrapper])
  return object
}

function safeDiagnostics(error: unknown): readonly string[] {
  if (error instanceof SemanticValidationError) return error.diagnostics
  if (error instanceof ThesisFormalizationError && THESIS_FORMALIZATION_ERROR_CODES.includes(error.code as typeof THESIS_FORMALIZATION_ERROR_CODES[number])) return [error.code]
  if (error instanceof ReasoningExecutorError && REASONING_ERROR_CODES.includes(error.code)) return [`executor_${error.code}`]
  return ['formalize_semantic_failed']
}

function sourceRefs(value: unknown): readonly string[] {
  if (!Array.isArray(value)) return []
  return [...new Set(value.filter((item): item is string => text(item)))].sort()
}

function contract(): unknown {
  return {
    type: 'object', required: ['propositions'], properties: {
      summary: { type: 'string', maxLength: 4000 },
      propositions: { type: 'array', minItems: 1, maxItems: MAX_PROPOSITIONS, items: { type: 'object', required: ['propositionId', 'statement', 'propositionType', 'basis', 'timeHorizon'], properties: { propositionId: { type: 'string' }, statement: { type: 'string' }, propositionType: { enum: THESIS_PROPOSITION_TYPES }, basis: { enum: THESIS_EVIDENCE_BASES }, timeHorizon: { type: 'string' }, sourceRefs: { type: 'array', maxItems: 16, items: { type: 'string' } }, dependsOnPropositionRefs: { type: 'array', maxItems: MAX_PROPOSITIONS, items: { type: 'string' } }, supportingPropositionRefs: { type: 'array', maxItems: MAX_PROPOSITIONS, items: { type: 'string' } }, verificationCondition: { type: 'string' }, verificationTime: { type: 'string' } } } },
      researchGaps: { type: 'array', maxItems: MAX_GAPS, items: { type: 'object', required: ['gapId', 'statement'], properties: { gapId: { type: 'string' }, statement: { type: 'string' }, affectedPropositionRefs: { type: 'array', items: { type: 'string' } }, requiredEvidence: { type: 'string' } } } },
    },
  }
}

function validateCandidate(value: unknown, input: ThesisFormalizeSemanticInput): { readonly summary: string; readonly propositions: readonly ThesisPropositionInput[]; readonly researchGaps: readonly Record<string, unknown>[] } {
  const object = parseObject(value)
  if (!Array.isArray(object.propositions) || object.propositions.length === 0 || object.propositions.length > MAX_PROPOSITIONS) throw new SemanticValidationError('Propositions are required', ['formalize_propositions_invalid'])
  const allowedSources = new Set(input.evidence.flatMap((item: ThesisFormalizeEvidence) => sourceRefs(item.sourceRefs)))
  const allowedKnowledge = new Set((input.propositionHints ?? []).flatMap((item) => sourceRefs(item.existingKnowledgeRefs)))
  const propositionIds = new Set<string>()
  const propositions: ThesisPropositionInput[] = []
  for (const [index, item] of object.propositions.entries()) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw new SemanticValidationError('Proposition shape invalid', [`formalize_proposition_${index}_invalid`])
    const candidate = item as Record<string, unknown>
    if (!text(candidate.propositionId) || !ID.test(candidate.propositionId) || !text(candidate.statement) || !THESIS_PROPOSITION_TYPES.includes(candidate.propositionType as typeof THESIS_PROPOSITION_TYPES[number]) || !THESIS_EVIDENCE_BASES.includes(candidate.basis as typeof THESIS_EVIDENCE_BASES[number]) || !text(candidate.timeHorizon)) throw new SemanticValidationError('Proposition fields invalid', [`formalize_proposition_${index}_invalid`])
    if (propositionIds.has(candidate.propositionId)) throw new SemanticValidationError('Duplicate proposition', ['formalize_proposition_duplicate'])
    propositionIds.add(candidate.propositionId)
    const candidateSources = sourceRefs(candidate.sourceRefs)
    if (candidateSources.some((ref) => !allowedSources.has(ref))) throw new SemanticValidationError('Unknown source reference', [`formalize_proposition_${index}_source_ref_unknown`])
    const knowledgeRefs = sourceRefs(candidate.existingKnowledgeRefs)
    if (knowledgeRefs.some((ref) => !allowedKnowledge.has(ref))) throw new SemanticValidationError('Unknown existing knowledge reference', [`formalize_proposition_${index}_knowledge_ref_unknown`])
    propositions.push({ propositionId: candidate.propositionId, statement: candidate.statement, propositionType: candidate.propositionType as ThesisPropositionInput['propositionType'], basis: candidate.basis as ThesisPropositionInput['basis'], timeHorizon: candidate.timeHorizon, sourceRefs: candidateSources, existingKnowledgeRefs: knowledgeRefs, dependsOnPropositionRefs: sourceRefs(candidate.dependsOnPropositionRefs), supportingPropositionRefs: sourceRefs(candidate.supportingPropositionRefs), ...(text(candidate.verificationCondition) ? { verificationCondition: candidate.verificationCondition } : {}), ...(text(candidate.verificationTime) ? { verificationTime: candidate.verificationTime } : {}), ...(candidate.availability !== undefined ? { availability: candidate.availability as ThesisPropositionInput['availability'] } : {}), ...(candidate.loadBearing === true ? { loadBearing: true } : {}) })
  }
  const researchGaps = Array.isArray(object.researchGaps) ? object.researchGaps.slice(0, MAX_GAPS).map((gap, index) => {
    if (!gap || typeof gap !== 'object' || Array.isArray(gap) || !text((gap as Record<string, unknown>).gapId) || !text((gap as Record<string, unknown>).statement)) throw new SemanticValidationError('Research gap invalid', [`formalize_gap_${index}_invalid`])
    const item = gap as Record<string, unknown>
    const affected = sourceRefs(item.affectedPropositionRefs)
    if (affected.some((ref) => !propositionIds.has(ref))) throw new SemanticValidationError('Research gap ref unknown', [`formalize_gap_${index}_ref_unknown`])
    return { gapId: item.gapId, statement: item.statement, affectedPropositionRefs: affected, ...(text(item.requiredEvidence) ? { requiredEvidence: item.requiredEvidence } : {}) }
  }) : []
  return { summary: text(object.summary) ? object.summary : input.narrative.trim(), propositions, researchGaps }
}

function telemetry(called: boolean, validated: boolean, applied: boolean, fallbackUsed: boolean, repairAttempts: number, diagnostics: readonly string[]) {
  return { called, validated, applied, fallbackUsed, repairAttempts, diagnostics }
}

function boundedOutput(value: unknown, maxChars = 12_000): unknown {
  try { const serialized = JSON.stringify(value); return serialized.length > maxChars ? `${serialized.slice(0, maxChars)}…[bounded]` : value }
  catch { return '[unserializable_previous_output]' }
}

function boundedInput(input: ThesisFormalizeSemanticInput): unknown {
  return { narrative: input.narrative.slice(0, 8000), evidence: input.evidence.slice(0, 40), ...(input.propositionHints === undefined ? {} : { propositionHints: input.propositionHints.slice(0, 40) }), ...(input.asOf === undefined ? {} : { asOf: input.asOf }), ...(input.thesisId === undefined ? {} : { thesisId: input.thesisId }), ...(input.localRef === undefined ? {} : { localRef: input.localRef }) }
}

export async function executeThesisFormalize(input: ThesisFormalizeSemanticInput, executor?: ReasoningExecutor): Promise<ThesisFormalizeSemanticResult> {
  if (!executor) return { status: 'blocked', diagnostics: ['reasoning_executor_missing'], telemetry: telemetry(false, false, false, true, 0, ['reasoning_executor_missing']) }
  let firstOutput: unknown
  let diagnostics: readonly string[] = []
  const run = async (repair: boolean): Promise<FormalizedThesisResult> => {
    const repairInstruction = diagnostics.includes('THESIS_DEPENDENCY_CYCLE')
      ? 'Repair the previous thesis formalization because it failed with THESIS_DEPENDENCY_CYCLE. Remove cyclic dependsOnPropositionRefs and supportingPropositionRefs until the remaining graph is acyclic; omit links when needed instead of inventing replacement links. Preserve proposition sourceRefs and existingKnowledgeRefs, and continue to honor all supplied evidence constraints. Use only supplied evidence and return one bounded JSON object.'
      : 'Repair the previous thesis formalization. Use only supplied evidence and return one bounded JSON object.'
    const response = await executor.execute({ operation: 'thesis_formalize_semantic', instruction: repair ? repairInstruction : 'Formalize the narrative into falsifiable thesis propositions. Generate candidate types, evidence basis, dependencies, verification conditions, and research gaps. Dependency and support edges are optional and, when present, must form an acyclic graph. Use only supplied evidence refs.', input: repair ? { context: boundedInput(input), previousOutput: boundedOutput(firstOutput), diagnostics: diagnostics.slice(0, 16) } : boundedInput(input), outputContract: contract() })
    if (!repair) firstOutput = response.output
    const candidate = validateCandidate(response.output, input)
    return formalizeThesis({ thesisId: input.thesisId, localRef: input.localRef, summary: candidate.summary, propositions: candidate.propositions, researchGaps: candidate.researchGaps as never, asOf: input.asOf })
  }
  try { const result = await run(false); return { status: 'complete', result, diagnostics: [], telemetry: telemetry(true, true, true, false, 0, []) } }
  catch (error) { diagnostics = safeDiagnostics(error) }
  try { const result = await run(true); return { status: 'complete', result, diagnostics: [], telemetry: telemetry(true, true, true, false, 1, []) } }
  catch (error) { const finalDiagnostics = safeDiagnostics(error); return { status: 'blocked', diagnostics: finalDiagnostics, telemetry: telemetry(true, false, false, true, 1, finalDiagnostics) } }
}
