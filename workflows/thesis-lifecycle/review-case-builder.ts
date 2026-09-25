import { createHash } from 'node:crypto'
import type { KnowledgeAssetV04, KnowledgeClaimV04, KnowledgeEntityV04, KnowledgeRelationV04, KnowledgeThesisV04 } from '../../knowledge/schema/domain-v04.ts'
import type { KnowledgeAssetCollectionV04 } from '../../knowledge/storage/v04-types.ts'
import { KNOWLEDGE_SCHEMA_V03 } from '../../knowledge/schema/executable-schema.ts'
import { validateReviewCase } from '../../knowledge/review/validation.ts'
import type { CanonicalResearchEvidenceBinding, ReviewCase, ReviewClaimType, ThesisReviewedEvidence } from '../../knowledge/review/contracts.ts'
import type { ThesisRefreshAdapterResult, ThesisRefreshEvidenceLineage } from './refresh-adapter.ts'

export interface ThesisRefreshReviewCaseBuilderInput {
  readonly adapterResult: ThesisRefreshAdapterResult
  readonly assets: KnowledgeAssetCollectionV04
  readonly knowledgeBaseId: string
  readonly producerRunId: string
  readonly knowledgeBaseRevisionAtCreation: number
  readonly createdAt: string
}

export interface ThesisRefreshReviewCaseBuilderResult {
  readonly status: 'completed' | 'blocked'
  readonly cases: readonly ReviewCase[]
  readonly diagnostics: readonly string[]
}

const active = (asset: KnowledgeAssetV04): boolean => 'lifecycle' in asset && asset.lifecycle?.status === 'active'
const REVIEW_CLAIM_TYPES: ReadonlySet<string> = new Set([...KNOWLEDGE_SCHEMA_V03.claim.types, 'assumption', 'catalyst'])
const ordered = (values: readonly string[]): string[] => [...new Set(values)].sort((a, b) => a.localeCompare(b))
const hash = (value: unknown): string => createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 24)
const block = (diagnostic: string): ThesisRefreshReviewCaseBuilderResult => ({ status: 'blocked', cases: [], diagnostics: [diagnostic] })

function isReviewDelta(line: { readonly candidateStatus: string }): boolean { return line.candidateStatus !== 'unchanged' }

function activeEntity(ref: string, assets: KnowledgeAssetCollectionV04): KnowledgeEntityV04 | undefined {
  const matches = assets.objects.filter((item) => item.kind === 'entity' && item.value.id === ref)
  if (matches.length !== 1) return undefined
  const entity = matches[0]!.value as KnowledgeEntityV04
  return entity && active(entity) && typeof entity.name === 'string' && entity.name.trim() !== '' ? entity : undefined
}

function thesisIdentityIsValid(thesis: KnowledgeThesisV04, assets: KnowledgeAssetCollectionV04): boolean {
  return typeof thesis.title === 'string' && thesis.title.trim() !== '' && Array.isArray(thesis.subjectRefs) && thesis.subjectRefs.length > 0 && new Set(thesis.subjectRefs).size === thesis.subjectRefs.length && thesis.subjectRefs.every((ref) => activeEntity(ref, assets) !== undefined)
}

function claimSubjectMentions(claim: KnowledgeClaimV04, assets: KnowledgeAssetCollectionV04): { candidateRef: string; mention: string }[] | undefined {
  if (!Array.isArray(claim.subjectRefs) || claim.subjectRefs.length === 0 || new Set(claim.subjectRefs).size !== claim.subjectRefs.length) return undefined
  const result: { candidateRef: string; mention: string }[] = []
  for (const ref of claim.subjectRefs) {
    const matches = assets.objects.filter((loaded) => loaded.value.id === ref)
    if (matches.length !== 1) return undefined
    const item = matches[0]
    if (item?.kind === 'entity') {
      const entity = activeEntity(ref, assets)
      if (!entity) return undefined
      result.push({ candidateRef: ref, mention: entity.name })
      continue
    }
    if (item?.kind === 'relation') {
      const relation = item.value as KnowledgeRelationV04
      const source = activeEntity(relation.sourceRef, assets)
      const target = activeEntity(relation.targetRef, assets)
      if (!active(relation) || !source || !target || typeof relation.type !== 'string') return undefined
      result.push({ candidateRef: ref, mention: `${source.name} ${relation.type} ${target.name}` })
      continue
    }
    return undefined
  }
  return result
}

function isReviewClaimType(value: string): value is ReviewClaimType {
  return value !== 'thesis' && REVIEW_CLAIM_TYPES.has(value)
}

function canonicalBindings(evidence: readonly ThesisRefreshEvidenceLineage[]): CanonicalResearchEvidenceBinding[] {
  const values = new Map<string, CanonicalResearchEvidenceBinding>()
  for (const item of evidence) {
    for (const pair of item.sourceBindings) {
      const binding: CanonicalResearchEvidenceBinding = { kind: 'canonical_research_evidence', sourceRef: pair.sourceRef, rawRef: pair.rawRef, evidenceRef: item.evidenceRef }
      values.set(`${binding.sourceRef}\u0000${binding.rawRef}\u0000${binding.evidenceRef}`, binding)
    }
  }
  return [...values.values()].sort((a, b) => `${a.evidenceRef}\u0000${a.sourceRef}\u0000${a.rawRef}`.localeCompare(`${b.evidenceRef}\u0000${b.sourceRef}\u0000${b.rawRef}`))
}

function reviewedEvidence(evidence: readonly ThesisRefreshEvidenceLineage[]): ThesisReviewedEvidence[] {
  const values = new Map<string, ThesisReviewedEvidence>()
  for (const item of evidence) {
    const entry: ThesisReviewedEvidence = { evidenceRef: item.evidenceRef, relation: item.relation, targetClaimRefs: ordered(item.targetClaimRefs) }
    values.set(JSON.stringify(entry), entry)
  }
  return [...values.values()].sort((a, b) => a.evidenceRef.localeCompare(b.evidenceRef) || a.relation.localeCompare(b.relation))
}

/** Builds validated, Thesis-scoped v0.4 ReviewCases from verified adapter output only. */
export function buildThesisRefreshReviewCases(input: ThesisRefreshReviewCaseBuilderInput): ThesisRefreshReviewCaseBuilderResult {
  const result = input.adapterResult
  if (result.status !== 'completed' || !result.refresh || !result.priorSnapshot) return block('THESIS_REFRESH_RESULT_REQUIRED')
  const thesisItems = input.assets.objects.filter((item) => item.value.id === result.thesisRef)
  if (thesisItems.length !== 1 || thesisItems[0]?.kind !== 'thesis') return block('THESIS_REVIEW_THESIS_UNAVAILABLE')
  const thesis = thesisItems[0]!.value as KnowledgeThesisV04
  if (!active(thesis) || thesis.status === 'archived' || thesis.status === 'invalidated') return block('THESIS_REVIEW_THESIS_INACTIVE')
  if (!thesisIdentityIsValid(thesis, input.assets)) return block('THESIS_REVIEW_THESIS_IDENTITY_UNAVAILABLE')

  const reviewDeltas = result.refresh.propositionDeltas.filter(isReviewDelta).sort((a, b) => a.propositionRef.localeCompare(b.propositionRef))
  const transitionNeedsReview = result.refresh.candidateTransition !== 'unchanged'
  if (!transitionNeedsReview && reviewDeltas.length === 0) return { status: 'completed', cases: [], diagnostics: [] }
  const transition = result.refresh.candidateTransition
  // v0.4 has no canonical kill-criterion definition/binding, and REFRESH does
  // not receive one. Skill assessments therefore cannot be revalidated at
  // decision time; do not turn them into an ACCEPT-capable ReviewCase.
  if (transition === 'invalidation_condition_met') return block('THESIS_REVIEW_KILL_CRITERION_SOURCE_UNAVAILABLE')
  if (reviewDeltas.length === 0) return block('REVIEW_EVIDENCE_BINDING_UNAVAILABLE')
  const proposedThesisStatus = transition === 'weakened' ? 'weakening' : transition === 'possible_invalidation' ? 'challenged' : transition === 'strengthened' ? 'strengthening' : undefined
  const priorClaims = new Map(result.priorSnapshot.propositions.map((item) => [item.propositionId, item]))
  const changedRefs = ordered(reviewDeltas.map((delta) => delta.propositionRef))
  if (changedRefs.length === 0 || changedRefs.length > 64) return block('REVIEW_EVIDENCE_BINDING_UNAVAILABLE')
  const claims = new Map<string, KnowledgeClaimV04>()
  for (const ref of changedRefs) {
    const claimMatches = input.assets.objects.filter((item) => item.value.id === ref)
    if (claimMatches.length !== 1 || claimMatches[0]?.kind !== 'claim') return block('THESIS_REVIEW_AFFECTED_CLAIM_UNAVAILABLE')
    const claim = claimMatches[0].value as KnowledgeClaimV04
    if (!active(claim) || claim.lifecycle.status === 'superseded' || claim.supersededBy?.length) return block('THESIS_REVIEW_AFFECTED_CLAIM_UNAVAILABLE')
    if (!priorClaims.has(ref)) return block('THESIS_REVIEW_AFFECTED_CLAIM_NOT_IN_SNAPSHOT')
    if (!isReviewClaimType(claim.claimType)) return block('THESIS_REVIEW_CLAIM_TYPE_UNSUPPORTED')
    if (!claimSubjectMentions(claim, input.assets)) return block('THESIS_REVIEW_CLAIM_SUBJECT_UNAVAILABLE')
    claims.set(ref, claim)
  }
  const evidence = result.evidenceLineage.filter((item) => item.decision === 'included' && item.targetClaimRefs.some((ref) => changedRefs.includes(ref)))
  if (evidence.length === 0 || reviewDeltas.some((delta) => !evidence.some((item) => item.targetClaimRefs.includes(delta.propositionRef) && item.relation === delta.newEvidenceRelation))) return block('REVIEW_EVIDENCE_BINDING_UNAVAILABLE')
  const evidenceRefs = ordered(evidence.map((item) => item.evidenceRef))
  const bindings = canonicalBindings(evidence)
  if (evidenceRefs.length > 64 || bindings.length === 0 || bindings.length > 64 || evidence.some((item) => item.sourceBindings.length === 0 || !item.sourceBindings.every((pair) => bindings.some((binding) => binding.evidenceRef === item.evidenceRef && binding.sourceRef === pair.sourceRef && binding.rawRef === pair.rawRef)))) return block('REVIEW_EVIDENCE_BINDING_UNAVAILABLE')
  const reviewEvidence = reviewedEvidence(evidence)
  const affectedClaimRefs = ordered([...changedRefs, ...reviewEvidence.flatMap((item) => item.targetClaimRefs)])
  const rootClaimRef = changedRefs[0]!
  const claim = claims.get(rootClaimRef)!
  const subjects = claimSubjectMentions(claim, input.assets)
  if (!subjects) return block('THESIS_REVIEW_CLAIM_SUBJECT_UNAVAILABLE')
  const identity = { run: input.producerRunId, thesis: thesis.id, claims: changedRefs, evidence: evidenceRefs, transition, asOf: result.refresh.currentAsOf }
  const digest = hash(identity)
  const proposalId = `thesis-claim-${digest}`
  const rationale = `Thesis refresh classified ${changedRefs.join(', ')} as ${reviewDeltas.map((delta) => delta.candidateStatus).join(', ')}; human review is required before applying a semantic change.`
  const reviewCase: ReviewCase = {
    version: '0.1',
    reviewCaseId: `thesis-refresh-${digest}`,
    knowledgeBaseId: input.knowledgeBaseId,
    producerType: 'thesis_lifecycle',
    producerRunId: input.producerRunId,
    createdAt: input.createdAt,
    classification: { category: 'reconciliation_review', actionability: 'knowledge_decision', origin: 'semantic_case', stage: 'thesis_refresh', rationale },
    rootProposal: {
      proposalId,
      proposalKind: 'claim',
      semanticType: claim.claimType as ReviewClaimType,
      semanticPayload: {
        candidateId: proposalId,
        claimType: claim.claimType as ReviewClaimType,
        statement: claim.statement,
        subjectRefs: subjects,
        ...(claim.structuredValue ? { structuredValue: claim.structuredValue as unknown as Readonly<Record<string, unknown>> } : {}),
        evidenceBlockRefs: [],
        reason: rationale,
      },
      evidenceBindings: bindings,
      dependencyRefs: [],
    },
    suspendedProposalBundle: { dependentProposals: [] },
    resolutionContext: { existingKnowledgeProjections: [], schemaVersionAtCreation: '0.4', knowledgeBaseRevisionAtCreation: input.knowledgeBaseRevisionAtCreation },
    impact: { dependentProposalCount: 0, affectedProposalRefs: [] },
    thesisScope: {
      thesisRef: thesis.id,
      rootClaimRef: rootClaimRef as `claim:${string}`,
      affectedClaimRefs,
      evidenceRefs,
      reviewedEvidence: reviewEvidence,
      candidateTransition: transition,
      asOf: result.refresh.currentAsOf,
      ...(proposedThesisStatus === undefined ? {} : { proposedThesisStatus }),
    },
    state: { status: 'open' },
  }
  try { validateReviewCase(reviewCase) } catch { return block('THESIS_REVIEW_CASE_VALIDATION_FAILED') }
  return { status: 'completed', cases: [reviewCase], diagnostics: [] }
}
