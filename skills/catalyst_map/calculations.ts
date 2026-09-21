import { CATALYST_EVENT_TYPES, CATALYST_STATUSES, CatalystMapError, type CatalystCandidate, type CatalystMapInput, type CatalystMapResult } from './contracts.ts'

const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,95}$/
const text = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0
const unique = (values: readonly string[]): readonly string[] => [...new Set(values)].sort((a, b) => a.localeCompare(b))
const refs = (values: readonly string[] | undefined): readonly string[] => unique((values ?? []).filter((value): value is string => text(value)))
const validDate = (value: string | undefined): boolean => value === undefined || (!Number.isNaN(Date.parse(value)) && value.length <= 80)

function validateCandidate(candidate: CatalystCandidate, input: CatalystMapInput, ids: ReadonlySet<string>): CatalystCandidate {
  if (!ID.test(candidate.catalystId) || !CATALYST_EVENT_TYPES.includes(candidate.eventType) || !CATALYST_STATUSES.includes(candidate.status) || !text(candidate.description) || !text(candidate.observable)) throw new CatalystMapError('CATALYST_SHAPE_INVALID')
  if (!refs(candidate.sourceRefs).length && (candidate.eventDate !== undefined || candidate.eventWindow !== undefined)) throw new CatalystMapError('CATALYST_TIMING_SOURCE_MISSING')
  if (refs(candidate.targetPropositionRefs).length === 0 || refs(candidate.targetPropositionRefs).some((ref) => !ids.has(ref))) throw new CatalystMapError('CATALYST_PROPOSITION_REF_INVALID')
  if (refs(candidate.targetExpectationGapRefs).some((ref) => !(input.expectationGapRefs ?? []).includes(ref))) throw new CatalystMapError('CATALYST_EXPECTATION_GAP_REF_INVALID')
  if (!validDate(candidate.eventDate) || !validDate(candidate.eventWindow?.start) || !validDate(candidate.eventWindow?.end)) throw new CatalystMapError('CATALYST_DATE_INVALID')
  if (candidate.eventWindow?.start && candidate.eventWindow?.end && Date.parse(candidate.eventWindow.start) > Date.parse(candidate.eventWindow.end)) throw new CatalystMapError('CATALYST_WINDOW_INVALID')
  if (candidate.status === 'occurred' && candidate.eventDate === undefined && candidate.eventWindow === undefined) throw new CatalystMapError('OCCURRED_CATALYST_DATE_MISSING')
  if (candidate.status === 'cancelled' && !text(candidate.description)) throw new CatalystMapError('CANCELLED_CATALYST_DESCRIPTION_MISSING')
  return { ...candidate, targetPropositionRefs: refs(candidate.targetPropositionRefs), sourceRefs: refs(candidate.sourceRefs), ...(candidate.targetExpectationGapRefs === undefined ? {} : { targetExpectationGapRefs: refs(candidate.targetExpectationGapRefs) }) }
}

export function mapCatalysts(input: CatalystMapInput): CatalystMapResult {
  if (!input || !text(input.thesisRef) || !text(input.asOf) || Number.isNaN(Date.parse(input.asOf)) || !Array.isArray(input.propositionRefs) || !Array.isArray(input.catalysts)) throw new CatalystMapError('CATALYST_MAP_INPUT_INVALID')
  const propositionRefs = new Set(refs(input.propositionRefs))
  if (propositionRefs.size === 0) return { status: 'unavailable', thesisRef: input.thesisRef, catalysts: [], diagnostics: ['proposition_refs_missing'] }
  const ids = new Set<string>()
  const diagnostics: string[] = []
  const catalysts: CatalystCandidate[] = []
  for (const candidate of input.catalysts.slice(0, 40)) {
    if (ids.has(candidate.catalystId)) throw new CatalystMapError('CATALYST_ID_DUPLICATE')
    ids.add(candidate.catalystId)
    try { catalysts.push(validateCandidate(candidate, input, propositionRefs)) } catch (error) { diagnostics.push(error instanceof CatalystMapError ? `${candidate.catalystId}:${error.code}` : `${candidate.catalystId}:CATALYST_INVALID`) }
  }
  if (catalysts.length === 0) diagnostics.push('no_valid_catalysts')
  return { status: catalysts.length === 0 ? 'unavailable' : diagnostics.length ? 'partial' : 'complete', thesisRef: input.thesisRef, catalysts, diagnostics }
}
