import type { ReasoningExecutor } from '../../plugins/reasoning/contracts.ts'
import { refreshThesis } from './calculations.ts'
import { REFRESH_EVIDENCE_RELATIONS, type RefreshEvidence, type RefreshEvidenceCandidate, type ThesisRefreshResult, type ThesisRefreshSemanticInput, type ThesisRefreshSemanticResult } from './contracts.ts'

const text = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0
const refs = (value: unknown): readonly string[] => Array.isArray(value) ? [...new Set(value.filter((item): item is string => text(item)))].sort() : []

class SemanticValidationError extends Error {
  readonly diagnostics: readonly string[]
  constructor(message: string, diagnostics: readonly string[]) { super(message); this.name = 'SemanticValidationError'; this.diagnostics = diagnostics }
}

function parseObject(value: unknown): Record<string, unknown> {
  if (typeof value === 'string') { try { return parseObject(JSON.parse(value.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, ''))) } catch { throw new SemanticValidationError('Invalid refresh JSON', ['refresh_output_json_invalid']) } }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new SemanticValidationError('Refresh output must be an object', ['refresh_output_shape_invalid'])
  const object = value as Record<string, unknown>
  for (const wrapper of ['output', 'result', 'data']) if (object[wrapper] && typeof object[wrapper] === 'object' && !Array.isArray(object[wrapper])) return parseObject(object[wrapper])
  return object
}

function diagnostics(error: unknown): readonly string[] { return error instanceof SemanticValidationError ? error.diagnostics : ['refresh_semantic_failed'] }
function contract(): unknown { return { type: 'object', required: ['evidence'], properties: { evidence: { type: 'array', maxItems: 80, items: { type: 'object', required: ['evidenceId', 'relation', 'targetPropositionRefs', 'sourceRefs'], properties: { evidenceId: { type: 'string' }, relation: { enum: REFRESH_EVIDENCE_RELATIONS }, targetPropositionRefs: { type: 'array', items: { type: 'string' } }, sourceRefs: { type: 'array', items: { type: 'string' } }, rationale: { type: 'string' } } } } } } }

function validateEvidence(value: unknown, input: ThesisRefreshSemanticInput): readonly RefreshEvidence[] {
  const object = parseObject(value)
  if (!Array.isArray(object.evidence) || object.evidence.length > 80) throw new SemanticValidationError('Refresh evidence output invalid', ['refresh_evidence_invalid'])
  if (!input.priorSnapshot) throw new SemanticValidationError('Prior thesis snapshot required', ['prior_thesis_snapshot_required'])
  const propositionRefs = new Set(input.priorSnapshot.propositions.map((item) => item.propositionId))
  const supplied = new Map(input.evidence.map((item) => [item.evidenceId, item]))
  const used = new Set<string>()
  const normalized: RefreshEvidence[] = []
  for (const [index, value] of object.evidence.entries()) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new SemanticValidationError('Refresh evidence candidate invalid', [`refresh_evidence_${index}_invalid`])
    const candidate = value as Record<string, unknown>
    if (!text(candidate.evidenceId) || used.has(candidate.evidenceId)) throw new SemanticValidationError('Refresh evidence identity invalid', [`refresh_evidence_${index}_identity_invalid`])
    used.add(candidate.evidenceId)
    const raw: RefreshEvidenceCandidate | undefined = supplied.get(candidate.evidenceId)
    if (!raw) throw new SemanticValidationError('Unknown refresh evidence reference', [`refresh_evidence_${index}_unknown`])
    if (candidate.relation === undefined || !REFRESH_EVIDENCE_RELATIONS.includes(candidate.relation as typeof REFRESH_EVIDENCE_RELATIONS[number])) throw new SemanticValidationError('Refresh relation invalid', [`refresh_evidence_${index}_relation_invalid`])
    const targetPropositionRefs = refs(candidate.targetPropositionRefs)
    if (targetPropositionRefs.some((ref) => !propositionRefs.has(ref)) || (targetPropositionRefs.length === 0 && candidate.relation !== 'context' && candidate.relation !== 'irrelevant')) throw new SemanticValidationError('Refresh proposition target invalid', [`refresh_evidence_${index}_target_invalid`])
    const sourceRefs = refs(candidate.sourceRefs)
    const suppliedSources = new Set(refs(raw.sourceRefs))
    if (sourceRefs.length === 0 || sourceRefs.some((ref) => !suppliedSources.has(ref))) throw new SemanticValidationError('Refresh source ref invalid', [`refresh_evidence_${index}_source_invalid`])
    normalized.push({ evidenceId: raw.evidenceId, publishedAt: raw.publishedAt, relation: candidate.relation as RefreshEvidence['relation'], targetPropositionRefs, sourceRefs, ...(raw.statement === undefined ? {} : { statement: raw.statement }), ...(raw.metric === undefined ? {} : { metric: raw.metric }), ...(raw.period === undefined ? {} : { period: raw.period }), ...(raw.unit === undefined ? {} : { unit: raw.unit }), ...(raw.value === undefined ? {} : { value: raw.value }) })
  }
  return normalized
}

function boundedInput(input: ThesisRefreshSemanticInput): unknown { return { priorSnapshot: input.priorSnapshot, currentAsOf: input.currentAsOf, evidence: input.evidence.slice(0, 80), killCriteria: input.killCriteria?.slice(0, 40) } }
function boundedOutput(value: unknown, maxChars = 12_000): unknown { try { const serialized = JSON.stringify(value); return serialized.length > maxChars ? `${serialized.slice(0, maxChars)}…[bounded]` : value } catch { return '[unserializable_previous_output]' } }
function telemetry(called: boolean, validated: boolean, applied: boolean, fallbackUsed: boolean, repairAttempts: number, diagnostics: readonly string[]) { return { called, validated, applied, fallbackUsed, repairAttempts, diagnostics } }

export async function executeThesisRefresh(input: ThesisRefreshSemanticInput, executor?: ReasoningExecutor): Promise<ThesisRefreshSemanticResult> {
  if (!executor) return { status: 'blocked', diagnostics: ['reasoning_executor_missing'], telemetry: telemetry(false, false, false, true, 0, ['reasoning_executor_missing']) }
  let firstOutput: unknown
  let priorDiagnostics: readonly string[] = []
  const run = async (repair: boolean): Promise<ThesisRefreshResult> => {
    const response = await executor.execute({ operation: 'thesis_refresh_semantic', instruction: repair ? 'Repair the thesis refresh classification. Use only supplied evidence and prior proposition refs; preserve point-in-time fields.' : 'Classify each supplied evidence item against the prior thesis. Identify target propositions and relation without inventing refs, dates, metrics, or thresholds.', input: repair ? { context: boundedInput(input), previousOutput: boundedOutput(firstOutput), diagnostics: priorDiagnostics.slice(0, 16) } : boundedInput(input), outputContract: contract() })
    if (!repair) firstOutput = response.output
    return refreshThesis({ priorSnapshot: input.priorSnapshot, currentAsOf: input.currentAsOf, evidence: validateEvidence(response.output, input), killCriteria: input.killCriteria })
  }
  try { const result = await run(false); return { status: 'complete', result, diagnostics: [], telemetry: telemetry(true, true, true, false, 0, []) } }
  catch (error) { priorDiagnostics = diagnostics(error) }
  try { const result = await run(true); return { status: 'complete', result, diagnostics: [], telemetry: telemetry(true, true, true, false, 1, []) } }
  catch (error) { const finalDiagnostics = diagnostics(error); return { status: 'blocked', diagnostics: finalDiagnostics, telemetry: telemetry(true, false, false, true, 1, finalDiagnostics) } }
}
