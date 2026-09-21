import {
  THESIS_AVAILABILITY,
  THESIS_EVIDENCE_BASES,
  THESIS_PROPOSITION_TYPES,
  ThesisFormalizationError,
  type FormalizedThesisProposition,
  type FormalizedThesisResult,
  type ThesisDependency,
  type ThesisFormalizeInput,
  type ThesisPropositionInput,
  type ThesisResearchGap,
} from './contracts.ts'

const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,95}$/
const MAX_PROPOSITIONS = 40
const MAX_GAPS = 40
const text = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0
const unique = (values: readonly string[]): readonly string[] => [...new Set(values)].sort((a, b) => a.localeCompare(b))
const refs = (value: readonly string[] | undefined): readonly string[] => unique((value ?? []).filter((item): item is string => text(item)))

function assertInput(input: ThesisFormalizeInput): void {
  if (!input || !text(input.summary)) throw new ThesisFormalizationError('THESIS_SUMMARY_MISSING')
  if (!Array.isArray(input.propositions) || input.propositions.length === 0 || input.propositions.length > MAX_PROPOSITIONS) throw new ThesisFormalizationError('THESIS_PROPOSITIONS_INVALID')
  if ((input.researchGaps?.length ?? 0) > MAX_GAPS) throw new ThesisFormalizationError('THESIS_RESEARCH_GAPS_INVALID')
  if (input.asOf !== undefined && (typeof input.asOf !== 'string' || Number.isNaN(Date.parse(input.asOf)))) throw new ThesisFormalizationError('THESIS_ASOF_INVALID')
}

function assertPropositionShape(proposition: ThesisPropositionInput, allRefs: ReadonlySet<string>): void {
  if (!ID.test(proposition.propositionId) || !text(proposition.statement) || proposition.statement.length > 4_000) throw new ThesisFormalizationError('THESIS_PROPOSITION_INVALID')
  if (!THESIS_PROPOSITION_TYPES.includes(proposition.propositionType) || !THESIS_EVIDENCE_BASES.includes(proposition.basis)) throw new ThesisFormalizationError('THESIS_PROPOSITION_ENUM_INVALID')
  if (!text(proposition.timeHorizon)) throw new ThesisFormalizationError('THESIS_TIME_HORIZON_MISSING')
  const sourceRefs = refs(proposition.sourceRefs)
  if (proposition.basis === 'verified_evidence' && sourceRefs.length === 0) throw new ThesisFormalizationError('VERIFIED_PROPOSITION_SOURCE_MISSING')
  for (const ref of [...refs(proposition.dependsOnPropositionRefs), ...refs(proposition.supportingPropositionRefs)]) {
    if (!allRefs.has(ref)) throw new ThesisFormalizationError('THESIS_PROPOSITION_REF_DANGLING')
    if (ref === proposition.propositionId) throw new ThesisFormalizationError('THESIS_PROPOSITION_SELF_DEPENDENCY')
  }
  if (proposition.verificationTime !== undefined && (typeof proposition.verificationTime !== 'string' || Number.isNaN(Date.parse(proposition.verificationTime)))) throw new ThesisFormalizationError('THESIS_VERIFICATION_TIME_INVALID')
  if (proposition.availability !== undefined && !THESIS_AVAILABILITY.includes(proposition.availability)) throw new ThesisFormalizationError('THESIS_AVAILABILITY_INVALID')
}

function assertGaps(gaps: readonly ThesisResearchGap[] | undefined, propositionRefs: ReadonlySet<string>): readonly ThesisResearchGap[] {
  const values = gaps ?? []
  const ids = new Set<string>()
  return values.map((gap) => {
    if (!ID.test(gap.gapId) || !text(gap.statement)) throw new ThesisFormalizationError('THESIS_RESEARCH_GAP_INVALID')
    if (ids.has(gap.gapId)) throw new ThesisFormalizationError('THESIS_RESEARCH_GAP_DUPLICATE')
    ids.add(gap.gapId)
    const affectedPropositionRefs = refs(gap.affectedPropositionRefs)
    if (affectedPropositionRefs.some((ref) => !propositionRefs.has(ref))) throw new ThesisFormalizationError('THESIS_RESEARCH_GAP_REF_DANGLING')
    return { ...gap, affectedPropositionRefs }
  })
}

function assertAcyclic(propositions: readonly ThesisPropositionInput[]): void {
  const edges = new Map(propositions.map((item) => [item.propositionId, [...refs(item.dependsOnPropositionRefs), ...refs(item.supportingPropositionRefs)]]))
  const visiting = new Set<string>()
  const visited = new Set<string>()
  const visit = (ref: string): void => {
    if (visiting.has(ref)) throw new ThesisFormalizationError('THESIS_DEPENDENCY_CYCLE')
    if (visited.has(ref)) return
    visiting.add(ref)
    for (const next of edges.get(ref) ?? []) visit(next)
    visiting.delete(ref)
    visited.add(ref)
  }
  for (const proposition of propositions) visit(proposition.propositionId)
}

export function formalizeThesis(input: ThesisFormalizeInput): FormalizedThesisResult {
  assertInput(input)
  const propositionRefs = new Set(input.propositions.map((item) => item.propositionId))
  if (propositionRefs.size !== input.propositions.length) throw new ThesisFormalizationError('THESIS_PROPOSITION_DUPLICATE')
  for (const proposition of input.propositions) assertPropositionShape(proposition, propositionRefs)
  assertAcyclic(input.propositions)
  const researchGaps = assertGaps(input.researchGaps, propositionRefs)
  const downstream = new Map<string, number>([...propositionRefs].map((ref) => [ref, 0]))
  for (const proposition of input.propositions) for (const ref of [...refs(proposition.dependsOnPropositionRefs), ...refs(proposition.supportingPropositionRefs)]) downstream.set(ref, (downstream.get(ref) ?? 0) + 1)
  const propositions: readonly FormalizedThesisProposition[] = input.propositions.map((proposition) => {
    const downstreamPropositionCount = downstream.get(proposition.propositionId) ?? 0
    return {
      ...proposition,
      sourceRefs: refs(proposition.sourceRefs),
      existingKnowledgeRefs: refs(proposition.existingKnowledgeRefs),
      dependsOnPropositionRefs: refs(proposition.dependsOnPropositionRefs),
      supportingPropositionRefs: refs(proposition.supportingPropositionRefs),
      availability: proposition.availability ?? (proposition.basis === 'verified_evidence' ? 'available' : 'insufficient_evidence'),
      downstreamPropositionCount,
      loadBearing: proposition.loadBearing === true || downstreamPropositionCount > 0,
    }
  })
  const dependencies: readonly ThesisDependency[] = propositions.flatMap((proposition) => [
    ...proposition.dependsOnPropositionRefs.map((targetPropositionRef) => ({ dependencyId: `${proposition.propositionId}->${targetPropositionRef}:depends_on`, sourcePropositionRef: proposition.propositionId, targetPropositionRef, relation: 'depends_on' as const })),
    ...proposition.supportingPropositionRefs.map((targetPropositionRef) => ({ dependencyId: `${proposition.propositionId}->${targetPropositionRef}:supports`, sourcePropositionRef: proposition.propositionId, targetPropositionRef, relation: 'supports' as const })),
  ])
  const loadBearingPropositionRefs = propositions.filter((item) => item.loadBearing).map((item) => item.propositionId).sort()
  const diagnostics = [
    ...(researchGaps.length ? ['research_gaps_present'] : []),
    ...(propositions.some((item) => item.availability !== 'available') ? ['proposition_evidence_incomplete'] : []),
  ]
  return {
    status: diagnostics.length ? 'partial' : 'complete',
    thesisId: input.thesisId ?? input.localRef ?? 'thesis:input',
    ...(input.localRef === undefined ? {} : { localRef: input.localRef }),
    summary: input.summary.trim(),
    propositions,
    dependencies,
    researchGaps,
    loadBearingPropositionRefs,
    diagnostics,
    ...(input.asOf === undefined ? {} : { asOf: input.asOf }),
  }
}

export type ThesisFormalizeResult = ReturnType<typeof formalizeThesis>
