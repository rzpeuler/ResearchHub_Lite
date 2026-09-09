import type { ReasoningExecutor, ReasoningRequest } from '../../plugins/reasoning/contracts.ts'
import { ReasoningExecutorError } from '../../plugins/reasoning/errors.ts'
import type { SemanticProductionProposal } from '../../knowledge/production/contracts.ts'
import {
  EVENT_DURABLE_CLAIM_TYPES,
  EVENT_EVIDENCE_REQUIREMENTS,
  EVENT_EVIDENCE_VERDICTS,
  EVENT_IMPACT_DISPOSITIONS,
  EVENT_RESEARCH_SECTIONS,
  type EventAssumptionUpdate,
  type EventContradiction,
  type EventDurableClaimType,
  type EventEvidenceAssessmentInput,
  type EventEvidenceAssessmentOutput,
  type EventEvidenceRequirement,
  type EventEvidenceSource,
  type EventExistingKnowledgeClaim,
  type EventImpactAssessment,
  type EventResearchProposal,
  type EventResearchReasoningTelemetry,
  type EventResearchSection,
  type EventResearchSynthesisInput,
  type EventResearchSynthesisOutput,
  type EventSourceAssessment,
  type EventStructuredValue,
  type EventVerifiedFact,
  type EventVerificationLevel,
  type EventVerificationResult,
  type EventEvidenceAssessmentSkillResult,
  type EventResearchSynthesisSkillResult,
} from './contracts.ts'

const LOCAL_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,95}$/
const CLAIM_REF = /^claim:[^\s]+$/
const MAX_VERIFIED_FACTS = 12
const MAX_PROPOSALS = 4
const MAX_REPAIR_OUTPUT_CHARS = 12_000
const MAX_SOURCE_EXCERPT = 1_500
const MAX_EXISTING_CLAIMS = 60
const WRAPPERS = ['result', 'output', 'data', 'structuredOutput', 'response'] as const
const STRUCTURED_FIELDS = ['comparator', 'fiscalPeriod', 'metric', 'period', 'semanticKey', 'unit', 'value'] as const
const PROPOSAL_FIELDS = ['assessmentRefs', 'claimType', 'existingKnowledgeRefs', 'kind', 'proposalId', 'sourceCandidateIds', 'statement', 'subjectKey', 'structuredValue'] as const

export class EventResearchSemanticError extends Error {
  readonly retryable: boolean
  readonly diagnostics: readonly string[]

  constructor(message: string, diagnostics: readonly string[] = [], retryable = true) {
    super(message)
    this.name = 'EventResearchSemanticError'
    this.retryable = retryable
    this.diagnostics = diagnostics
  }
}

function telemetry(executor: ReasoningExecutor | undefined, operation: EventResearchReasoningTelemetry['operation'], values: Omit<EventResearchReasoningTelemetry, 'called' | 'operation' | 'model'>): EventResearchReasoningTelemetry {
  const runtime = executor as unknown as { runtimeMetadata?: () => { requestedModel?: string } } | undefined
  const model = typeof runtime?.runtimeMetadata === 'function' ? runtime.runtimeMetadata().requestedModel : undefined
  return { called: executor !== undefined, operation, ...(model === undefined ? {} : { model }), ...values }
}

function safeDiagnostics(error: unknown): readonly string[] {
  if (error instanceof EventResearchSemanticError && error.diagnostics.length > 0) return error.diagnostics.filter((item) => /^[A-Za-z0-9_.:,?=-]+$/.test(item)).slice(0, 24)
  if (error instanceof ReasoningExecutorError) return [`executor_${error.code}`]
  return ['event_research_reasoning_failed']
}

function isRecord(value: unknown): value is Record<string, unknown> { return Boolean(value) && typeof value === 'object' && !Array.isArray(value) }
function records(value: unknown): readonly Record<string, unknown>[] { return Array.isArray(value) ? value.filter(isRecord) : [] }
function strings(value: unknown): readonly string[] { return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [] }
function validLocalId(value: unknown): value is string { return typeof value === 'string' && LOCAL_ID.test(value) }
function uniqueSorted(values: readonly string[]): readonly string[] { return [...new Set(values)].sort() }
function exactArray(value: unknown, allowed: ReadonlySet<string>, nonEmpty = false): value is readonly string[] {
  const items = strings(value)
  return Array.isArray(value) && items.length === value.length && (!nonEmpty || items.length > 0) && items.every((item) => allowed.has(item))
}
function nonEmptyText(value: unknown, max = 2_000): value is string { return typeof value === 'string' && value.trim() !== '' && value.trim().length <= max }
function enumValue<T extends string>(value: unknown, values: readonly T[]): value is T { return typeof value === 'string' && (values as readonly string[]).includes(value) }
function keysAreAllowed(value: Record<string, unknown>, allowed: readonly string[]): boolean { return Object.keys(value).every((key) => allowed.includes(key)) }

export function parseEventReasoningObject(value: unknown, depth = 0): Record<string, unknown> {
  if (typeof value === 'string') {
    try {
      const cleaned = value.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
      return parseEventReasoningObject(JSON.parse(cleaned), depth)
    } catch {
      throw new EventResearchSemanticError('Event Research reasoning returned invalid JSON', ['output_json_invalid'])
    }
  }
  if (!isRecord(value)) throw new EventResearchSemanticError('Event Research reasoning must return an object', ['output_object_missing'])
  const wrapper = WRAPPERS.find((key) => value[key] !== undefined)
  if (wrapper === undefined) return value
  if (depth >= 2) throw new EventResearchSemanticError('Event Research wrapper depth exceeded', ['output_wrapper_depth_exceeded'])
  return parseEventReasoningObject(value[wrapper], depth + 1)
}

function sourceIds(input: EventEvidenceAssessmentInput | EventResearchSynthesisInput): readonly string[] {
  if ('sources' in input) return uniqueSorted(input.sources.map((source) => source.candidateId).filter((id) => typeof id === 'string' && id !== ''))
  return uniqueSorted([...input.evidence.sourceAssessments.map((item) => item.sourceCandidateId), ...input.evidence.verifiedFacts.flatMap((item) => item.sourceCandidateIds), ...input.evidence.contradictions.flatMap((item) => item.sourceCandidateIds)])
}

function claimIds(input: EventResearchSynthesisInput): readonly string[] { return uniqueSorted(input.existingKnowledge.map((claim) => claim.canonicalRef).filter((ref) => CLAIM_REF.test(ref))) }
function claimByRef(input: EventResearchSynthesisInput, ref: string): EventExistingKnowledgeClaim | undefined { return input.existingKnowledge.find((claim) => claim.canonicalRef === ref) }

function sourceIsOfficial(source: EventEvidenceSource | undefined): boolean {
  return source?.official === true || source?.kind === 'official_disclosure' || /cninfo/i.test(source?.provider ?? '')
}

function boundedValue(value: unknown, depth = 0): unknown {
  if (depth >= 4) return typeof value === 'string' ? value.slice(0, 400) : '[bounded]'
  if (typeof value === 'string') return value.slice(0, 1_200)
  if (typeof value === 'number' || typeof value === 'boolean' || value === null) return value
  if (Array.isArray(value)) return value.slice(0, 24).map((item) => boundedValue(item, depth + 1))
  if (isRecord(value)) {
    const bounded = Object.fromEntries(Object.entries(value).slice(0, 32).map(([key, item]) => [key, boundedValue(item, depth + 1)]))
    return JSON.stringify(bounded).length <= MAX_REPAIR_OUTPUT_CHARS ? bounded : { bounded: true, preview: JSON.stringify(bounded).slice(0, MAX_REPAIR_OUTPUT_CHARS - 80) }
  }
  return null
}

function repairInput(priorInvalidStructuredOutput: unknown, validatorDiagnostics: readonly string[]): Record<string, unknown> {
  return { attempt: 1, priorInvalidStructuredOutput: boundedValue(priorInvalidStructuredOutput), validatorDiagnostics: validatorDiagnostics.slice(0, 24) }
}

function modelSources(sources: readonly EventEvidenceSource[]): readonly Record<string, unknown>[] {
  return sources.slice(0, 12).map((source) => ({ candidateId: source.candidateId, title: source.title, provider: source.provider, kind: source.kind, publishedAt: source.publishedAt, url: source.url, excerpt: source.excerpt.slice(0, MAX_SOURCE_EXCERPT), ...(source.official === undefined ? {} : { official: source.official }) }))
}

function assessmentInstruction(repair: boolean, diagnostics: readonly string[]): string {
  const prefix = repair ? `Bounded repair attempt 1. Correct every deterministic diagnostic: ${diagnostics.join(', ') || 'output_contract_invalid'}. Return a complete replacement object.` : 'Return one complete candidate object.'
  return `${prefix} Assess only the supplied event anchor and source candidates. Return exactly sourceAssessments, verifiedFacts, and contradictions, in that order. Copy sourceCandidateId values exactly from the allowlist. Verdicts are supports, contradicts, context, or irrelevant; confidence must be a finite number from 0 through 1; evidenceRequirement is primary, corroborated, or single_source. Return no canonical IDs, no unsupported numbers, no source content outside the supplied excerpts, and no explanatory text outside JSON. verifiedFacts must contain at most ${MAX_VERIFIED_FACTS} items.`
}

function assessmentModelInput(input: EventEvidenceAssessmentInput, repair?: { readonly prior: unknown; readonly diagnostics: readonly string[] }): Record<string, unknown> {
  const value: Record<string, unknown> = { company: input.company, anchor: input.anchor, asOf: input.asOf, eventDate: input.eventDate, allowedSourceCandidateIds: sourceIds(input), sources: modelSources(input.sources), allowedVerdictValues: EVENT_EVIDENCE_VERDICTS, confidenceRange: { min: 0, max: 1, finite: true }, allowedEvidenceRequirementValues: EVENT_EVIDENCE_REQUIREMENTS, methodology: 'Code owns source identity, dates, verification level, and durable eligibility; the model only assesses bounded evidence.' }
  if (repair !== undefined) value.repair = repairInput(repair.prior, repair.diagnostics)
  return value
}

function assessmentContract(input: EventEvidenceAssessmentInput): Record<string, unknown> {
  return { type: 'object', required: ['sourceAssessments', 'verifiedFacts', 'contradictions'], allowedSourceCandidateIds: sourceIds(input), sourceAssessments: { type: 'array', item: { sourceCandidateId: sourceIds(input), verdict: EVENT_EVIDENCE_VERDICTS, confidence: { type: 'number', finite: true, min: 0, max: 1 }, evidenceRequirement: EVENT_EVIDENCE_REQUIREMENTS, rationale: 'non-empty string' } }, verifiedFacts: { type: 'array', maxItems: MAX_VERIFIED_FACTS, item: { factId: 'safe local id', statement: 'non-empty string', sourceCandidateIds: sourceIds(input), confidence: { type: 'number', finite: true, min: 0, max: 1 }, evidenceRequirement: EVENT_EVIDENCE_REQUIREMENTS } }, contradictions: { type: 'array', item: { contradictionId: 'optional safe local id', statement: 'non-empty string', sourceCandidateIds: sourceIds(input), rationale: 'optional non-empty string' } } }
}

function validateSourceAssessment(value: unknown, index: number, allowed: ReadonlySet<string>): EventSourceAssessment {
  const item = isRecord(value) ? value : {}
  const valid = keysAreAllowed(item, ['sourceCandidateId', 'verdict', 'confidence', 'rationale', 'evidenceRequirement']) && typeof item.sourceCandidateId === 'string' && allowed.has(item.sourceCandidateId) && enumValue(item.verdict, EVENT_EVIDENCE_VERDICTS) && typeof item.confidence === 'number' && Number.isFinite(item.confidence) && item.confidence >= 0 && item.confidence <= 1 && enumValue(item.evidenceRequirement, EVENT_EVIDENCE_REQUIREMENTS) && nonEmptyText(item.rationale, 1_000)
  if (!valid) throw new EventResearchSemanticError(`Invalid event source assessment ${index}`, [`source_assessment_${index}_invalid`])
  return { sourceCandidateId: item.sourceCandidateId as string, verdict: item.verdict as EventSourceAssessment['verdict'], confidence: item.confidence as number, rationale: (item.rationale as string).trim().slice(0, 1_000), evidenceRequirement: item.evidenceRequirement as EventEvidenceRequirement }
}

function validateStructuredShape(value: unknown, allowSemanticKey = true): value is EventStructuredValue {
  if (!isRecord(value) || !keysAreAllowed(value, STRUCTURED_FIELDS as readonly string[])) return false
  if (typeof value.metric !== 'string' || value.metric.trim() === '' || !('value' in value) || !('unit' in value) || (value.unit !== null && typeof value.unit !== 'string') || !('comparator' in value) || (value.comparator !== null && !['eq', 'gt', 'gte', 'lt', 'lte', 'approx'].includes(value.comparator as string))) return false
  if (typeof value.value === 'number' && !Number.isFinite(value.value)) return false
  for (const field of ['period', 'fiscalPeriod', 'semanticKey'] as const) if (value[field] !== undefined && value[field] !== null && typeof value[field] !== 'string') return false
  return allowSemanticKey || value.semanticKey === undefined || value.semanticKey === null
}

export function validateEventStructuredValue(value: unknown, expected: EventStructuredValue): value is EventStructuredValue {
  if (!validateStructuredShape(value)) return false
  const actual = value as EventStructuredValue
  const expectedKeys = Object.keys(expected).sort().join(',')
  if (Object.keys(actual).sort().join(',') !== expectedKeys) return false
  return actual.metric === expected.metric && actual.value === expected.value && actual.unit === expected.unit && actual.comparator === expected.comparator && actual.period === expected.period && actual.fiscalPeriod === expected.fiscalPeriod && actual.semanticKey === expected.semanticKey
}

export function validateEventEvidenceAssessment(value: unknown, input: EventEvidenceAssessmentInput): EventEvidenceAssessmentOutput {
  const object = parseEventReasoningObject(value)
  const allowed = new Set(sourceIds(input))
  if (!Array.isArray(object.sourceAssessments) || !Array.isArray(object.verifiedFacts) || !Array.isArray(object.contradictions)) throw new EventResearchSemanticError('Event evidence assessment arrays are required', ['assessment_arrays_missing'])
  const sourceAssessments = object.sourceAssessments.map((item, index) => validateSourceAssessment(item, index, allowed))
  if (new Set(sourceAssessments.map((item) => item.sourceCandidateId)).size !== sourceAssessments.length) throw new EventResearchSemanticError('Duplicate source assessments are not allowed', ['source_assessment_duplicate'])
  const facts: EventVerifiedFact[] = object.verifiedFacts.map((value, index) => {
    const item = isRecord(value) ? value : {}
    const refs = strings(item.sourceCandidateIds)
    const valid = keysAreAllowed(item, ['factId', 'statement', 'sourceCandidateIds', 'confidence', 'evidenceRequirement', 'structuredValue']) && validLocalId(item.factId) && nonEmptyText(item.statement, 2_000) && exactArray(item.sourceCandidateIds, allowed, true) && typeof item.confidence === 'number' && Number.isFinite(item.confidence) && item.confidence >= 0 && item.confidence <= 1 && enumValue(item.evidenceRequirement, EVENT_EVIDENCE_REQUIREMENTS) && (item.structuredValue === undefined || validateStructuredShape(item.structuredValue))
    if (!valid) throw new EventResearchSemanticError(`Invalid verified event fact ${index}`, [`verified_fact_${index}_invalid`])
    return { factId: item.factId as string, statement: (item.statement as string).trim().slice(0, 2_000), sourceCandidateIds: refs, confidence: item.confidence as number, evidenceRequirement: item.evidenceRequirement as EventEvidenceRequirement, ...(item.structuredValue === undefined ? {} : { structuredValue: item.structuredValue as EventStructuredValue }) }
  })
  if (facts.length > MAX_VERIFIED_FACTS || new Set(facts.map((item) => item.factId)).size !== facts.length) throw new EventResearchSemanticError('Verified event facts exceed the bounded contract', ['verified_fact_count_or_duplicate_invalid'])
  const contradictions: EventContradiction[] = object.contradictions.map((value, index) => {
    const item = isRecord(value) ? value : {}
    const refs = strings(item.sourceCandidateIds)
    const valid = keysAreAllowed(item, ['contradictionId', 'statement', 'sourceCandidateIds', 'rationale']) && (item.contradictionId === undefined || validLocalId(item.contradictionId)) && nonEmptyText(item.statement, 2_000) && exactArray(item.sourceCandidateIds, allowed, true) && (item.rationale === undefined || nonEmptyText(item.rationale, 1_000))
    if (!valid) throw new EventResearchSemanticError(`Invalid event contradiction ${index}`, [`contradiction_${index}_invalid`])
    return { ...(item.contradictionId === undefined ? {} : { contradictionId: item.contradictionId as string }), statement: (item.statement as string).trim().slice(0, 2_000), sourceCandidateIds: refs, ...(item.rationale === undefined ? {} : { rationale: (item.rationale as string).trim().slice(0, 1_000) }) }
  })
  if (contradictions.some((item) => item.contradictionId !== undefined) && new Set(contradictions.flatMap((item) => item.contradictionId === undefined ? [] : [item.contradictionId])).size !== contradictions.filter((item) => item.contradictionId !== undefined).length) throw new EventResearchSemanticError('Duplicate event contradictions are not allowed', ['contradiction_duplicate'])
  return { sourceAssessments, verifiedFacts: facts, contradictions }
}

export function deriveEventVerification(input: EventEvidenceAssessmentOutput, sources: readonly EventEvidenceSource[] = []): EventVerificationResult {
  const sourceMap = new Map(sources.map((source) => [source.candidateId, source]))
  const supporting = uniqueSorted(input.sourceAssessments.filter((item) => item.verdict === 'supports').map((item) => item.sourceCandidateId))
  const contradicting = uniqueSorted([...input.sourceAssessments.filter((item) => item.verdict === 'contradicts').map((item) => item.sourceCandidateId), ...input.contradictions.flatMap((item) => item.sourceCandidateIds)])
  const official = supporting.some((id) => sourceIsOfficial(sourceMap.get(id)))
  let verificationLevel: EventVerificationLevel = 'unverified'
  if (supporting.length > 0 && contradicting.length > 0) verificationLevel = 'conflicted'
  else if (official) verificationLevel = 'official_verified'
  else if (supporting.length >= 2) verificationLevel = 'corroborated'
  else if (supporting.length === 1) verificationLevel = 'single_source'
  return { verificationLevel, strongVerification: verificationLevel === 'official_verified' || verificationLevel === 'corroborated', supportingSourceCandidateIds: supporting, contradictingSourceCandidateIds: contradicting }
}

export const determineEventVerificationLevel = deriveEventVerification
export function validateEventVerificationResult(value: unknown): value is EventVerificationResult {
  if (!isRecord(value) || !enumValue(value.verificationLevel, ['official_verified', 'corroborated', 'single_source', 'conflicted', 'unverified'] as const) || typeof value.strongVerification !== 'boolean' || !Array.isArray(value.supportingSourceCandidateIds) || !Array.isArray(value.contradictingSourceCandidateIds)) return false
  const supporting = strings(value.supportingSourceCandidateIds); const contradicting = strings(value.contradictingSourceCandidateIds)
  return supporting.length === value.supportingSourceCandidateIds.length && contradicting.length === value.contradictingSourceCandidateIds.length && value.strongVerification === (value.verificationLevel === 'official_verified' || value.verificationLevel === 'corroborated')
}

export function isStrongEventVerification(level: EventVerificationLevel | EventVerificationResult): boolean { return typeof level === 'string' ? level === 'official_verified' || level === 'corroborated' : validateEventVerificationResult(level) && level.strongVerification }

function numericTokens(statement: string): readonly number[] {
  const withoutDates = statement.replace(/\b(?:19|20|21)\d{2}[-/.]\d{1,2}[-/.]\d{1,2}\b/g, '').replace(/\b\d{6}\b/g, '').replace(/\b(?:19|20|21)\d{2}\b/g, '')
  return [...withoutDates.matchAll(/[-+]?\d+(?:\.\d+)?/g)].map((match) => Number(match[0])).filter((value) => Number.isFinite(value))
}

export function hasUnsupportedNumericClaim(statement: string, allowedValues: readonly number[] = []): boolean {
  const allowed = allowedValues.flatMap((value) => [value, value * 100]).filter((value) => Number.isFinite(value))
  return numericTokens(statement).some((value) => !allowed.some((candidate) => Math.abs(candidate - value) < 1e-9))
}

export const containsUnsupportedNumericClaim = hasUnsupportedNumericClaim

export function eventOccurrenceStructuredValue(eventFingerprint: string, eventDate: string): EventStructuredValue {
  if (!validLocalId(eventFingerprint) || !/^\d{4}-\d{2}-\d{2}$/.test(eventDate)) throw new TypeError('event fingerprint and ISO event date are required')
  return { metric: `event_occurrence_${eventFingerprint}`, value: true, unit: 'event', comparator: 'eq', period: eventDate }
}

export function buildEventOccurrenceProposal(eventFingerprint: string, eventDate: string, sourceCandidateIds: readonly string[], statement = 'The selected event was verified.'): SemanticProductionProposal {
  if (!Array.isArray(sourceCandidateIds) || sourceCandidateIds.length === 0 || sourceCandidateIds.some((id) => !validLocalId(id))) throw new TypeError('at least one safe source candidate id is required')
  return { proposalId: `event-occurrence-${eventFingerprint}`, kind: 'claim', claimType: 'fact', subjectKey: 'company', statement: statement.trim().slice(0, 1_500), sourceCandidateIds: [...sourceCandidateIds], structuredValue: eventOccurrenceStructuredValue(eventFingerprint, eventDate) }
}

export function validateEventAssumptionUpdate(value: unknown, existingClaim: EventExistingKnowledgeClaim): value is EventAssumptionUpdate {
  if (!isRecord(value) || !keysAreAllowed(value, ['existingClaimRef', 'structuredValue']) || value.existingClaimRef !== existingClaim.canonicalRef || existingClaim.claimType !== 'assumption' || !isRecord(existingClaim.structuredValue) || !validateStructuredShape(value.structuredValue)) return false
  const current = existingClaim.structuredValue as unknown as EventStructuredValue
  const next = value.structuredValue as EventStructuredValue
  return next.metric === current.metric && next.unit === current.unit && next.comparator === current.comparator && next.period === current.period && next.fiscalPeriod === current.fiscalPeriod && next.semanticKey === current.semanticKey
}

export const isValidEventAssumptionUpdate = validateEventAssumptionUpdate

function durableDisposition(disposition: EventImpactAssessment['disposition']): boolean { return disposition !== 'no_change' && disposition !== 'research_gap' }
function compatibleDisposition(claimType: EventDurableClaimType, disposition: EventImpactAssessment['disposition']): boolean {
  if (claimType === 'assumption') return disposition === 'changes_assumption'
  if (claimType === 'risk') return disposition === 'new_risk' || disposition === 'affects_thesis'
  if (claimType === 'catalyst') return disposition === 'new_catalyst' || disposition === 'affects_thesis'
  return disposition === 'new_fact' || disposition === 'supports_existing' || disposition === 'contradicts_existing' || disposition === 'affects_thesis'
}

function allowedSupportingSources(input: EventResearchSynthesisInput): ReadonlySet<string> { return new Set(input.verification.supportingSourceCandidateIds) }

function validateAssessment(value: unknown, index: number, input: EventResearchSynthesisInput, sourceSet: ReadonlySet<string>, claimSet: ReadonlySet<string>): EventImpactAssessment {
  const item = isRecord(value) ? value : {}
  const sources = strings(item.sourceCandidateIds)
  const claims = strings(item.existingKnowledgeRefs)
  const valid = keysAreAllowed(item, ['assessmentId', 'disposition', 'existingKnowledgeRefs', 'sourceCandidateIds', 'rationale', 'directImpact', 'secondOrderImpact']) && validLocalId(item.assessmentId) && enumValue(item.disposition, EVENT_IMPACT_DISPOSITIONS) && exactArray(item.sourceCandidateIds, sourceSet) && exactArray(item.existingKnowledgeRefs, claimSet) && nonEmptyText(item.rationale, 1_000) && nonEmptyText(item.directImpact, 1_500) && nonEmptyText(item.secondOrderImpact, 1_500)
  if (!valid) throw new EventResearchSemanticError(`Invalid event impact assessment ${index}`, [`impact_assessment_${index}_invalid`])
  if (durableDisposition(item.disposition as EventImpactAssessment['disposition']) && (sources.length === 0 || !sources.every((id) => allowedSupportingSources(input).has(id)))) throw new EventResearchSemanticError(`Durable event impact lacks supporting evidence ${index}`, [`impact_assessment_${index}_evidence_required`])
  return { assessmentId: item.assessmentId as string, disposition: item.disposition as EventImpactAssessment['disposition'], existingKnowledgeRefs: claims, sourceCandidateIds: sources, rationale: (item.rationale as string).trim().slice(0, 1_000), directImpact: (item.directImpact as string).trim().slice(0, 1_500), secondOrderImpact: (item.secondOrderImpact as string).trim().slice(0, 1_500) }
}

function proposalDiagnostics(index: number, code: string): never { throw new EventResearchSemanticError(`Invalid event research proposal ${index}`, [`proposal_${index}_${code}`]) }

export function validateEventResearchProposal(value: unknown, index: number, input: EventResearchSynthesisInput, assessments: readonly EventImpactAssessment[]): EventResearchProposal {
  const item = isRecord(value) ? value : {}
  const sources = strings(item.sourceCandidateIds)
  const claims = strings(item.existingKnowledgeRefs)
  const assessmentRefs = strings(item.assessmentRefs)
  const sourceSet = new Set(sourceIds(input))
  const claimSet = new Set(claimIds(input))
  const assessmentMap = new Map(assessments.map((assessment) => [assessment.assessmentId, assessment]))
  const claimType = item.claimType
  const baseValid = keysAreAllowed(item, PROPOSAL_FIELDS) && validLocalId(item.proposalId) && item.kind === 'claim' && item.subjectKey === 'company' && enumValue(claimType, EVENT_DURABLE_CLAIM_TYPES) && nonEmptyText(item.statement, 1_500) && exactArray(item.sourceCandidateIds, sourceSet, true) && exactArray(item.existingKnowledgeRefs, claimSet) && Array.isArray(item.assessmentRefs) && assessmentRefs.length > 0 && assessmentRefs.length === item.assessmentRefs.length && assessmentRefs.every((ref) => assessmentMap.has(ref))
  if (!baseValid) proposalDiagnostics(index, 'shape_or_allowlist')
  if (input.verification.strongVerification !== true) proposalDiagnostics(index, 'verification_not_strong')
  if (!sources.every((id) => allowedSupportingSources(input).has(id))) proposalDiagnostics(index, 'source_not_supporting')
  if (new Set(assessmentRefs).size !== assessmentRefs.length) proposalDiagnostics(index, 'assessment_refs_duplicate')
  const referencedAssessments = assessmentRefs.map((ref) => assessmentMap.get(ref)!).filter(Boolean)
  if (!referencedAssessments.some((assessment) => durableDisposition(assessment.disposition))) proposalDiagnostics(index, 'durable_assessment_required')
  if (!referencedAssessments.every((assessment) => compatibleDisposition(claimType as EventDurableClaimType, assessment.disposition))) proposalDiagnostics(index, 'impact_disposition_incompatible')
  if (claimType === 'assumption') {
    if (claims.length !== 1) proposalDiagnostics(index, 'assumption_ref_count')
    const existing = claimByRef(input, claims[0]!)
    if (existing === undefined || !validateEventAssumptionUpdate({ existingClaimRef: claims[0], structuredValue: item.structuredValue }, existing)) proposalDiagnostics(index, 'assumption_update_invalid')
    const nextValue = item.structuredValue as EventStructuredValue
    if (hasUnsupportedNumericClaim(item.statement as string, typeof nextValue.value === 'number' ? [nextValue.value] : [])) proposalDiagnostics(index, 'unsupported_numeric_claim')
  } else {
    if (item.structuredValue !== undefined) proposalDiagnostics(index, 'unsupported_structured_value')
    if (hasUnsupportedNumericClaim(item.statement as string)) proposalDiagnostics(index, 'unsupported_numeric_claim')
  }
  return { proposalId: item.proposalId as string, kind: 'claim', claimType: claimType as EventDurableClaimType, subjectKey: 'company', statement: (item.statement as string).trim(), sourceCandidateIds: sources, existingKnowledgeRefs: claims, assessmentRefs, ...(item.structuredValue === undefined ? {} : { structuredValue: item.structuredValue as EventStructuredValue }) }
}

export function filterEventResearchProposals(values: readonly unknown[], input: EventResearchSynthesisInput, assessments: readonly EventImpactAssessment[]): readonly EventResearchProposal[] {
  const accepted: EventResearchProposal[] = []
  const types = new Set<string>()
  for (const [index, value] of values.entries()) {
    if (accepted.length >= MAX_PROPOSALS) break
    try {
      const proposal = validateEventResearchProposal(value, index, input, assessments)
      if (types.has(proposal.claimType)) continue
      types.add(proposal.claimType)
      accepted.push(proposal)
    } catch {
      // Proposal filtering is a deterministic fail-closed boundary.
    }
  }
  return accepted
}

function synthesisInstruction(repair: boolean, diagnostics: readonly string[]): string {
  const prefix = repair ? `Bounded repair attempt 1. Correct every deterministic diagnostic: ${diagnostics.join(', ') || 'output_contract_invalid'}. Return a complete replacement object.` : 'Return one complete synthesis object.'
  return `${prefix} Use only verified event facts, supplied evidence, and bounded Company Knowledge. Return exactly sections, assessments, and proposals. sections must contain the exact 16 required titles. Impact dispositions are copied exactly from: ${EVENT_IMPACT_DISPOSITIONS.join(', ')}. Proposals are local claim proposals only, with claimType viewpoint, risk, catalyst, or assumption. Copy all IDs exactly from supplied allowlists. Thesis impact is report-level and must not be a thesis proposal. Do not invent dates, canonical refs, calculations, or numeric claims. An assumption proposal must preserve every existing structured-value field except value. Return JSON only.`
}

function synthesisModelInput(input: EventResearchSynthesisInput, repair?: { readonly prior: unknown; readonly diagnostics: readonly string[] }): Record<string, unknown> {
  const claims = claimIds(input)
  const assumptions = uniqueSorted(input.existingKnowledge.filter((claim) => claim.claimType === 'assumption' && claims.includes(claim.canonicalRef)).map((claim) => claim.canonicalRef))
  const theses = uniqueSorted(input.existingKnowledge.filter((claim) => claim.claimType === 'thesis' && claims.includes(claim.canonicalRef)).map((claim) => claim.canonicalRef))
  const value: Record<string, unknown> = { company: input.company, anchor: input.anchor, eventFingerprint: input.eventFingerprint, eventDate: input.eventDate, verification: input.verification, verifiedFacts: input.evidence.verifiedFacts.slice(0, MAX_VERIFIED_FACTS), sourceAssessments: input.evidence.sourceAssessments, contradictions: input.evidence.contradictions, allowedSourceCandidateIds: sourceIds(input), allowedSupportingSourceCandidateIds: input.verification.supportingSourceCandidateIds, allowedExistingClaimRefs: claims, allowedAssumptionClaimRefs: assumptions, allowedThesisClaimRefs: theses, existingKnowledge: input.existingKnowledge.slice(0, MAX_EXISTING_CLAIMS).map((claim) => ({ canonicalRef: claim.canonicalRef, claimType: claim.claimType, statement: claim.statement?.slice(0, 600), structuredValue: claim.structuredValue })), methodology: 'Code owns verification, event dates, canonical identity, numeric equality, proposal admissibility, and persistence authority.' }
  if (repair !== undefined) value.repair = repairInput(repair.prior, repair.diagnostics)
  return value
}

function synthesisContract(input: EventResearchSynthesisInput): Record<string, unknown> {
  return { type: 'object', required: ['sections', 'assessments', 'proposals'], requiredSectionTitles: EVENT_RESEARCH_SECTIONS, allowedSourceCandidateIds: sourceIds(input), allowedSupportingSourceCandidateIds: input.verification.supportingSourceCandidateIds, allowedExistingClaimRefs: claimIds(input), allowedAssumptionClaimRefs: input.existingKnowledge.filter((claim) => claim.claimType === 'assumption').map((claim) => claim.canonicalRef), allowedImpactDispositionValues: EVENT_IMPACT_DISPOSITIONS, allowedProposalClaimTypes: EVENT_DURABLE_CLAIM_TYPES, proposals: { type: 'array', maxItems: MAX_PROPOSALS } }
}

export function validateEventResearchSynthesis(value: unknown, input: EventResearchSynthesisInput): EventResearchSynthesisOutput {
  const object = parseEventReasoningObject(value)
  if (!Array.isArray(object.sections) || !Array.isArray(object.assessments) || !Array.isArray(object.proposals)) throw new EventResearchSemanticError('Event research synthesis arrays are required', ['synthesis_arrays_missing'])
  const rawSections = records(object.sections)
  if (rawSections.length !== object.sections.length || rawSections.length !== EVENT_RESEARCH_SECTIONS.length) throw new EventResearchSemanticError('Event research requires exactly 16 sections', ['synthesis_section_count_invalid'])
  const byTitle = new Map<string, Record<string, unknown>>()
  const sourceSet = new Set(sourceIds(input))
  const claimSet = new Set(claimIds(input))
  if (!validateEventVerificationResult(input.verification) || input.verification.supportingSourceCandidateIds.some((id) => !sourceSet.has(id)) || input.verification.contradictingSourceCandidateIds.some((id) => !sourceSet.has(id))) throw new EventResearchSemanticError('Event verification references are outside the evidence set', ['verification_refs_invalid'])
  const sections: EventResearchSection[] = rawSections.map((item, index) => {
    const refs = strings(item.sourceCandidateIds); const claims = strings(item.existingKnowledgeRefs); const assessmentRefs = strings(item.assessmentRefs)
    const title = item.title
    const valid = keysAreAllowed(item, ['sectionId', 'title', 'markdown', 'sourceCandidateIds', 'existingKnowledgeRefs', 'assessmentRefs']) && validLocalId(item.sectionId) && typeof title === 'string' && (EVENT_RESEARCH_SECTIONS as readonly string[]).includes(title) && nonEmptyText(item.markdown, 2_000) && exactArray(item.sourceCandidateIds, sourceSet) && exactArray(item.existingKnowledgeRefs, claimSet) && Array.isArray(item.assessmentRefs) && assessmentRefs.length === item.assessmentRefs.length && assessmentRefs.every((ref) => validLocalId(ref))
    if (!valid) throw new EventResearchSemanticError(`Invalid event research section ${index}`, [`synthesis_section_${index}_invalid`])
    if (byTitle.has(title as string)) throw new EventResearchSemanticError(`Duplicate event research section ${index}`, [`synthesis_section_${index}_duplicate`])
    byTitle.set(title as string, item)
    return { sectionId: item.sectionId as string, title: title as EventResearchSection['title'], markdown: (item.markdown as string).trim().slice(0, 2_000), sourceCandidateIds: refs, existingKnowledgeRefs: claims, assessmentRefs }
  })
  if (EVENT_RESEARCH_SECTIONS.some((title) => !byTitle.has(title))) throw new EventResearchSemanticError('Event research section title set is incomplete', ['synthesis_section_titles_invalid'])
  const assessments = object.assessments.map((item, index) => validateAssessment(item, index, input, sourceSet, claimSet))
  if (new Set(assessments.map((item) => item.assessmentId)).size !== assessments.length) throw new EventResearchSemanticError('Duplicate event impact assessment IDs are not allowed', ['impact_assessment_duplicate'])
  const assessmentSet = new Set(assessments.map((assessment) => assessment.assessmentId))
  if (sections.some((section) => section.assessmentRefs.some((ref) => !assessmentSet.has(ref)))) throw new EventResearchSemanticError('Section assessment references must resolve to local assessments', ['synthesis_section_assessment_ref_invalid'])
  if (object.proposals.length > MAX_PROPOSALS) throw new EventResearchSemanticError('Too many event research proposals', ['proposal_count_exceeds_bound'])
  if (records(object.proposals).length !== object.proposals.length) throw new EventResearchSemanticError('Event research proposals contain non-objects', ['proposal_items_invalid'])
  const proposals = input.verification.strongVerification ? object.proposals.map((item, index) => validateEventResearchProposal(item, index, input, assessments)) : []
  if (new Set(proposals.map((proposal) => proposal.claimType)).size !== proposals.length) throw new EventResearchSemanticError('Only one proposal per event claim type is allowed', ['proposal_claim_type_duplicate'])
  return { sections, assessments, proposals }
}

export function toEventResearchGatewayProposal(proposal: EventResearchProposal): Omit<EventResearchProposal, 'existingKnowledgeRefs' | 'assessmentRefs'> {
  const { existingKnowledgeRefs: _existingKnowledgeRefs, assessmentRefs: _assessmentRefs, semanticKey: _semanticKey, ...gatewayProposal } = proposal as EventResearchProposal & { readonly semanticKey?: unknown }
  return gatewayProposal
}

export class EventEvidenceAssessmentSkill {
  constructor(private readonly executor?: ReasoningExecutor) {}

  fallback(repairAttempts = 0, diagnostics: readonly string[] = []): EventEvidenceAssessmentSkillResult {
    const output: EventEvidenceAssessmentOutput = { sourceAssessments: [], verifiedFacts: [], contradictions: [] }
    return { output, verification: deriveEventVerification(output), reasoning: telemetry(this.executor, 'event_evidence_assessment', { validated: false, applied: false, fallbackUsed: true, repairAttempts, ...(diagnostics.length === 0 ? {} : { diagnostic: diagnostics.join('; ').slice(0, 300), diagnostics }) }) }
  }

  async assess(input: EventEvidenceAssessmentInput): Promise<EventEvidenceAssessmentSkillResult> {
    if (this.executor === undefined) return this.fallback()
    let repairAttempts = 0; let prior: unknown = null; let diagnostics: readonly string[] = []
    const execute = (repair?: { readonly prior: unknown; readonly diagnostics: readonly string[] }) => this.executor!.execute({ operation: 'event_evidence_assessment', instruction: assessmentInstruction(repair !== undefined, repair === undefined ? [] : repair.diagnostics), input: assessmentModelInput(input, repair), outputContract: assessmentContract(input), metadata: { operationFamily: 'personal-research-v1', companySymbol: input.company.symbol } } satisfies ReasoningRequest)
    try {
      try {
        const result = await execute(); prior = parseEventReasoningObject(result.output)
        const output = validateEventEvidenceAssessment(prior, input)
        return { output, verification: deriveEventVerification(output, input.sources), reasoning: telemetry(this.executor, 'event_evidence_assessment', { validated: true, applied: true, fallbackUsed: false, repairAttempts }) }
      } catch (error) { diagnostics = safeDiagnostics(error) }
      repairAttempts = 1
      const result = await execute({ prior, diagnostics }); const output = validateEventEvidenceAssessment(parseEventReasoningObject(result.output), input)
      return { output, verification: deriveEventVerification(output, input.sources), reasoning: telemetry(this.executor, 'event_evidence_assessment', { validated: true, applied: true, fallbackUsed: false, repairAttempts }) }
    } catch (error) {
      const finalDiagnostics = [...diagnostics, ...safeDiagnostics(error)].slice(0, 24)
      return this.fallback(repairAttempts, finalDiagnostics)
    }
  }
}

export class EventResearchSynthesisSkill {
  constructor(private readonly executor?: ReasoningExecutor) {}

  fallback(repairAttempts = 0, diagnostics: readonly string[] = []): EventResearchSynthesisSkillResult {
    const output: EventResearchSynthesisOutput = { sections: EVENT_RESEARCH_SECTIONS.map((title) => ({ sectionId: eventResearchSectionId(title), title, markdown: `Research Gap / Unavailable: no validated synthesis is available for ${title}.`, sourceCandidateIds: [], existingKnowledgeRefs: [], assessmentRefs: [] })), assessments: [], proposals: [] }
    return { output, reasoning: telemetry(this.executor, 'event_research_synthesis', { validated: false, applied: false, fallbackUsed: true, repairAttempts, ...(diagnostics.length === 0 ? {} : { diagnostic: diagnostics.join('; ').slice(0, 300), diagnostics }) }) }
  }

  async synthesize(input: EventResearchSynthesisInput): Promise<EventResearchSynthesisSkillResult> {
    if (this.executor === undefined) return this.fallback()
    let repairAttempts = 0; let prior: unknown = null; let diagnostics: readonly string[] = []
    const execute = (repair?: { readonly prior: unknown; readonly diagnostics: readonly string[] }) => this.executor!.execute({ operation: 'event_research_synthesis', instruction: synthesisInstruction(repair !== undefined, repair === undefined ? [] : repair.diagnostics), input: synthesisModelInput(input, repair), outputContract: synthesisContract(input), metadata: { operationFamily: 'personal-research-v1', companySymbol: input.company.symbol, eventFingerprint: input.eventFingerprint } } satisfies ReasoningRequest)
    try {
      try { const result = await execute(); prior = parseEventReasoningObject(result.output); return { output: validateEventResearchSynthesis(prior, input), reasoning: telemetry(this.executor, 'event_research_synthesis', { validated: true, applied: true, fallbackUsed: false, repairAttempts }) } } catch (error) { diagnostics = safeDiagnostics(error) }
      repairAttempts = 1
      const result = await execute({ prior, diagnostics }); return { output: validateEventResearchSynthesis(parseEventReasoningObject(result.output), input), reasoning: telemetry(this.executor, 'event_research_synthesis', { validated: true, applied: true, fallbackUsed: false, repairAttempts }) }
    } catch (error) {
      return this.fallback(repairAttempts, [...diagnostics, ...safeDiagnostics(error)].slice(0, 24))
    }
  }
}

export function eventResearchSectionId(title: string): string { return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') }
