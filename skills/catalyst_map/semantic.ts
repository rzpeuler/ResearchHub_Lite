import type { ReasoningExecutor } from '../../plugins/reasoning/contracts.ts'
import { mapCatalysts } from './calculations.ts'
import { CATALYST_EVENT_TYPES, CATALYST_STATUSES, type CatalystCandidate, type CatalystMapResult, type CatalystMapSemanticInput, type CatalystMapSemanticResult } from './contracts.ts'

const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,95}$/
const text = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0

class SemanticValidationError extends Error {
  readonly diagnostics: readonly string[]
  constructor(message: string, diagnostics: readonly string[]) { super(message); this.name = 'SemanticValidationError'; this.diagnostics = diagnostics }
}

function parseObject(value: unknown): Record<string, unknown> {
  if (typeof value === 'string') { try { return parseObject(JSON.parse(value.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, ''))) } catch { throw new SemanticValidationError('Invalid catalyst JSON', ['catalyst_output_json_invalid']) } }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new SemanticValidationError('Catalyst output must be an object', ['catalyst_output_shape_invalid'])
  const object = value as Record<string, unknown>
  for (const wrapper of ['output', 'result', 'data']) if (object[wrapper] && typeof object[wrapper] === 'object' && !Array.isArray(object[wrapper])) return parseObject(object[wrapper])
  return object
}

function refs(value: unknown): readonly string[] { return Array.isArray(value) ? [...new Set(value.filter((item): item is string => text(item)))].sort() : [] }
function diagnostics(error: unknown): readonly string[] { return error instanceof SemanticValidationError ? error.diagnostics : ['catalyst_semantic_failed'] }

function contract(): unknown {
  return { type: 'object', required: ['catalysts'], properties: { catalysts: { type: 'array', maxItems: 40, items: { type: 'object', required: ['eventId', 'catalystId', 'eventType', 'description', 'targetPropositionRefs', 'status', 'observable', 'sourceRefs'], properties: { eventId: { type: 'string' }, catalystId: { type: 'string' }, eventType: { enum: CATALYST_EVENT_TYPES }, description: { type: 'string' }, targetPropositionRefs: { type: 'array', items: { type: 'string' } }, targetExpectationGapRefs: { type: 'array', items: { type: 'string' } }, eventDate: { type: 'string' }, eventWindow: { type: 'object' }, status: { enum: CATALYST_STATUSES }, observable: { type: 'string' }, sourceRefs: { type: 'array', items: { type: 'string' } }, resolutionMechanism: { type: 'string' } } } } } }
}

function validateCandidate(value: unknown, input: CatalystMapSemanticInput): readonly CatalystCandidate[] {
  const object = parseObject(value)
  if (!Array.isArray(object.catalysts) || object.catalysts.length > 40) throw new SemanticValidationError('Catalyst candidates invalid', ['catalyst_candidates_invalid'])
  const propositionRefs = new Set(input.propositions.map((item) => item.propositionId))
  const gapRefs = new Set((input.expectationGaps ?? []).map((item) => item.gapId))
  const events = new Map(input.events.map((event) => [event.eventId, event]))
  const candidates: CatalystCandidate[] = []
  for (const [index, value] of object.catalysts.entries()) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new SemanticValidationError('Catalyst candidate invalid', [`catalyst_${index}_invalid`])
    const candidate = value as Record<string, unknown>
    if (!text(candidate.eventId) || !ID.test(candidate.eventId) || !text(candidate.catalystId) || !ID.test(candidate.catalystId)) throw new SemanticValidationError('Catalyst identity invalid', [`catalyst_${index}_identity_invalid`])
    const event = events.get(candidate.eventId)
    if (!event) throw new SemanticValidationError('Unknown event reference', [`catalyst_${index}_event_unknown`])
    if (!CATALYST_EVENT_TYPES.includes(candidate.eventType as typeof CATALYST_EVENT_TYPES[number]) || !CATALYST_STATUSES.includes(candidate.status as typeof CATALYST_STATUSES[number]) || !text(candidate.description) || !text(candidate.observable)) throw new SemanticValidationError('Catalyst fields invalid', [`catalyst_${index}_fields_invalid`])
    if (event.eventType !== undefined && candidate.eventType !== event.eventType) throw new SemanticValidationError('Catalyst event type is not attributable', [`catalyst_${index}_event_type_not_in_source`])
    if (event.status !== undefined && candidate.status !== event.status) throw new SemanticValidationError('Catalyst status is not attributable', [`catalyst_${index}_status_not_in_source`])
    const sourceRefs = refs(candidate.sourceRefs)
    const eventSources = new Set(refs(event.sourceRefs))
    if (sourceRefs.some((ref) => !eventSources.has(ref))) throw new SemanticValidationError('Unknown catalyst source reference', [`catalyst_${index}_source_ref_unknown`])
    const targetPropositionRefs = refs(candidate.targetPropositionRefs)
    if (targetPropositionRefs.length === 0 || targetPropositionRefs.some((ref) => !propositionRefs.has(ref))) throw new SemanticValidationError('Unknown proposition reference', [`catalyst_${index}_proposition_ref_invalid`])
    const targetExpectationGapRefs = refs(candidate.targetExpectationGapRefs)
    if (targetExpectationGapRefs.some((ref) => !gapRefs.has(ref))) throw new SemanticValidationError('Unknown expectation-gap reference', [`catalyst_${index}_gap_ref_invalid`])
    const eventDate = candidate.eventDate
    const eventWindow = candidate.eventWindow
    if (eventDate !== undefined && eventDate !== event.eventDate) throw new SemanticValidationError('Catalyst date is not attributable', [`catalyst_${index}_date_not_in_source`])
    if (eventWindow !== undefined && JSON.stringify(eventWindow) !== JSON.stringify(event.eventWindow)) throw new SemanticValidationError('Catalyst window is not attributable', [`catalyst_${index}_window_not_in_source`])
    candidates.push({ catalystId: candidate.catalystId, eventType: candidate.eventType as CatalystCandidate['eventType'], description: candidate.description as string, targetPropositionRefs, ...(targetExpectationGapRefs.length ? { targetExpectationGapRefs } : {}), ...(eventDate === undefined ? {} : { eventDate: eventDate as string }), ...(eventWindow === undefined ? {} : { eventWindow: eventWindow as CatalystCandidate['eventWindow'] }), status: candidate.status as CatalystCandidate['status'], observable: candidate.observable as string, sourceRefs, ...(text(candidate.resolutionMechanism) ? { resolutionMechanism: candidate.resolutionMechanism } : {}) })
  }
  return candidates
}

function boundedInput(input: CatalystMapSemanticInput): unknown { return { thesisRef: input.thesisRef, propositions: input.propositions.slice(0, 40), expectationGaps: input.expectationGaps?.slice(0, 40), asOf: input.asOf, events: input.events.slice(0, 40) } }
function boundedOutput(value: unknown, maxChars = 12_000): unknown { try { const serialized = JSON.stringify(value); return serialized.length > maxChars ? `${serialized.slice(0, maxChars)}…[bounded]` : value } catch { return '[unserializable_previous_output]' } }
function telemetry(called: boolean, validated: boolean, applied: boolean, fallbackUsed: boolean, repairAttempts: number, diagnostics: readonly string[]) { return { called, validated, applied, fallbackUsed, repairAttempts, diagnostics } }

export async function executeCatalystMap(input: CatalystMapSemanticInput, executor?: ReasoningExecutor): Promise<CatalystMapSemanticResult> {
  if (!executor) return { status: 'blocked', diagnostics: ['reasoning_executor_missing'], telemetry: telemetry(false, false, false, true, 0, ['reasoning_executor_missing']) }
  let firstOutput: unknown
  let priorDiagnostics: readonly string[] = []
  const run = async (repair: boolean): Promise<CatalystMapResult> => {
    const response = await executor.execute({ operation: 'catalyst_map_semantic', instruction: repair ? 'Repair the previous catalyst map. Use only supplied event, proposition, gap, date, and source refs.' : 'Identify which supplied attributable events could change which supplied thesis propositions. Return bounded catalyst candidates without inventing dates or refs.', input: repair ? { context: boundedInput(input), previousOutput: boundedOutput(firstOutput), diagnostics: priorDiagnostics.slice(0, 16) } : boundedInput(input), outputContract: contract() })
    if (!repair) firstOutput = response.output
    return mapCatalysts({ thesisRef: input.thesisRef, propositionRefs: input.propositions.map((item) => item.propositionId), expectationGapRefs: input.expectationGaps?.map((item) => item.gapId), asOf: input.asOf, catalysts: validateCandidate(response.output, input) })
  }
  try { const result = await run(false); return { status: 'complete', result, diagnostics: [], telemetry: telemetry(true, true, true, false, 0, []) } }
  catch (error) { priorDiagnostics = diagnostics(error) }
  try { const result = await run(true); return { status: 'complete', result, diagnostics: [], telemetry: telemetry(true, true, true, false, 1, []) } }
  catch (error) { const finalDiagnostics = diagnostics(error); return { status: 'blocked', diagnostics: finalDiagnostics, telemetry: telemetry(true, false, false, true, 1, finalDiagnostics) } }
}
