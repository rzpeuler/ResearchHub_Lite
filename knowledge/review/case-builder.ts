import { hashKnowledgeObject } from '../storage/canonical-hash.ts'
import { KnowledgeIndexV03 } from '../query/index.ts'
import type { KnowledgeAssetCollectionV03 } from '../storage/v03-types.ts'
import type { KnowledgeClaimV03, KnowledgeEntityV03, KnowledgeRelationV03 } from '../schema/domain.ts'
import type { ClaimCandidate, EntityCandidate, RelationCandidate, ResolvedCandidateGroup } from '../../skills/knowledge-curation/contracts.ts'
import type { ConsolidationReviewConstraint, PotentialInvestmentThemeAssessment, ReviewCategory, ReviewItem, ReviewOrigin } from '../../workflows/raw-document-knowledge-ingestion/contracts.ts'
import type { EntityBinding, ResolutionIntent } from '../../workflows/raw-document-knowledge-ingestion/knowledge-resolution.ts'
import type { ExistingKnowledgeProjection, ExistingKnowledgeProjectionPayload, ReviewCase, ReviewCaseActionability, ReviewCaseAdvisory, ReviewCaseAttributeConflict, ReviewCaseClassification, ReviewEvidenceBinding, ReviewProposalKind, ReviewSemanticPayload, ReviewSemanticProposal } from './contracts.ts'

export interface BuildReviewCasesInput {
  readonly knowledgeBaseId: string
  readonly producerRunId: string
  readonly producerType?: string
  readonly createdAt: string
  readonly rawRef: string
  readonly documentId: string
  readonly knowledgeBaseRevisionAtCreation: number
  readonly assets: KnowledgeAssetCollectionV03
  readonly groups: readonly ResolvedCandidateGroup[]
  readonly reviewItems: readonly ReviewItem[]
  readonly consolidationReviews?: readonly ConsolidationReviewConstraint[]
  readonly bindings?: ReadonlyMap<string, EntityBinding>
  readonly intents?: readonly ResolutionIntent[]
  readonly potentialNewInvestmentThemes?: readonly PotentialInvestmentThemeAssessment[]
}

interface RootReview { readonly key: string; readonly item: ReviewItem; readonly constraint?: ConsolidationReviewConstraint }
type Candidate = EntityCandidate | RelationCandidate | ClaimCandidate
type Projection = ExistingKnowledgeProjection

function normalized(value: string): string { return value.trim().toLocaleLowerCase().replace(/\s+/g, ' ') }
function proposalKind(group: ResolvedCandidateGroup): ReviewProposalKind { return group.kind }
function semanticType(group: ResolvedCandidateGroup): string { const candidate = group.candidate as Candidate; return 'entityType' in candidate ? candidate.entityType : 'relationType' in candidate ? candidate.relationType : candidate.claimType }
function candidateDependencies(group: ResolvedCandidateGroup): string[] {
  const candidate = group.candidate as Candidate
  if (group.kind === 'relation') { const value = candidate as RelationCandidate; return [value.source.candidateRef, value.target.candidateRef].sort() }
  if (group.kind === 'claim') return (candidate as ClaimCandidate).subjectRefs.map((item) => item.candidateRef).sort()
  return []
}
function bindingsFor(candidate: Candidate, rawRef: string, documentId: string): readonly ReviewEvidenceBinding[] {
  return [...new Set(candidate.evidenceBlockRefs)].sort().map((blockId) => ({ kind: 'raw_document_block' as const, rawRef, documentId, blockId }))
}
function makeProposal(group: ResolvedCandidateGroup, input: BuildReviewCasesInput, extraDependencies: readonly string[] = []): ReviewSemanticProposal {
  const candidate = structuredClone(group.candidate) as ReviewSemanticPayload
  const dependencyRefs = [...new Set([...candidateDependencies(group), ...extraDependencies].filter((ref) => input.groups.some((item) => item.candidateId === ref)))].sort()
  return { proposalId: group.candidateId, proposalKind: proposalKind(group), semanticType: semanticType(group) as ReviewSemanticProposal['semanticType'], semanticPayload: candidate, evidenceBindings: bindingsFor(candidate, input.rawRef, input.documentId), dependencyRefs }
}
function entityProjection(entity: KnowledgeEntityV03): ExistingKnowledgeProjection {
  const payload: ExistingKnowledgeProjectionPayload = { kind: 'entity', type: entity.type, name: entity.name, aliases: [...(entity.aliases ?? [])].sort(), ...(entity.description == null ? {} : { description: entity.description }), ...(entity.type === 'company' ? { ticker: entity.ticker ?? null, exchange: entity.exchange ?? null, legalName: entity.legalName ?? null } : {}), ...(entity.type === 'investment_theme' ? { definition: entity.definition ?? null, inclusionCriteria: [...(entity.inclusionCriteria ?? [])].sort(), exclusionCriteria: [...(entity.exclusionCriteria ?? [])].sort() } : {}) }
  return { canonicalRef: entity.id, kind: 'entity', semanticType: entity.type, payload }
}
function relationProjection(relation: KnowledgeRelationV03): ExistingKnowledgeProjection { return { canonicalRef: relation.id, kind: 'relation', semanticType: relation.type, payload: { kind: 'relation', type: relation.type, sourceRef: relation.sourceRef, targetRef: relation.targetRef, attributes: relation.attributes == null ? null : structuredClone(relation.attributes) as Readonly<Record<string, unknown>> } } }
function claimProjection(claim: KnowledgeClaimV03): ExistingKnowledgeProjection { return { canonicalRef: claim.id, kind: 'claim', semanticType: claim.claimType, payload: { kind: 'claim', claimType: claim.claimType, statement: claim.statement, subjectRefs: [...claim.subjectRefs].sort(), temporal: claim.temporal ?? null, structuredValue: claim.structuredValue == null ? null : structuredClone(claim.structuredValue) as unknown as Readonly<Record<string, unknown>> } } }
function rootKey(item: ReviewItem, constraint?: ConsolidationReviewConstraint): string { return item.reviewKey ?? constraint?.reviewKey ?? [item.candidateId, item.stage ?? '', item.category ?? 'other', normalized(item.rationale)].join('|') }
function actionability(category: ReviewCategory): ReviewCaseActionability { return category === 'theme_creation' || category === 'theme_ambiguity' ? 'research_followup' : category === 'schema_gap' ? 'schema_design' : 'knowledge_decision' }
function origin(item: ReviewItem): ReviewOrigin { return item.origin ?? 'planner' }
function isActionableRoot(item: ReviewItem): boolean {
  if (item.dependency === true || origin(item) === 'extraction_rejection' || origin(item) === 'consolidation_mirror' || origin(item) === 'dependency_isolation' || item.category === undefined) return false
  if (item.category === 'invalid_semantics' && /relation attributes are not schema 0\.3 valid|claim temporal is not schema 0\.3 admissible/i.test(item.rationale)) return false
  return true
}
function findRoots(input: BuildReviewCasesInput): RootReview[] {
  const groups = new Map(input.groups.map((group) => [group.candidateId, group]))
  const constraints = new Map<string, ConsolidationReviewConstraint>()
  for (const constraint of input.consolidationReviews ?? []) if (constraint.blocking) constraints.set(constraint.reviewKey, constraint)
  const roots = new Map<string, RootReview>()
  for (const constraint of constraints.values()) {
    const group = groups.get(constraint.candidateId); if (!group) continue
    const item: ReviewItem = { candidateId: group.candidateId, kind: group.kind, rationale: constraint.reason, dependentCandidateIds: [], stage: 'consolidation', category: constraint.category, origin: 'consolidation', dependency: false, reviewKey: constraint.reviewKey }
    roots.set(constraint.reviewKey, { key: constraint.reviewKey, item, constraint })
  }
  for (const item of input.reviewItems) if (groups.has(item.candidateId) && isActionableRoot(item)) roots.set(rootKey(item), { key: rootKey(item), item })
  for (const assessment of input.potentialNewInvestmentThemes ?? []) {
    if (!groups.has(assessment.candidateId)) continue
    const existing = [...roots.values()].find((root) => root.item.candidateId === assessment.candidateId && root.item.category === 'theme_creation')
    if (existing) continue
    const item: ReviewItem = { candidateId: assessment.candidateId, kind: 'entity', rationale: assessment.recommendationReason, dependentCandidateIds: [], stage: 'knowledge_resolution', category: 'theme_creation', origin: 'knowledge_resolution', dependency: false, reviewKey: `theme-creation|${assessment.candidateId}` }
    roots.set(item.reviewKey!, { key: item.reviewKey!, item })
  }
  return [...roots.values()].sort((left, right) => left.key.localeCompare(right.key))
}
function existingProjections(root: RootReview, group: ResolvedCandidateGroup, input: BuildReviewCasesInput, index: KnowledgeIndexV03): readonly Projection[] {
  const refs = new Set<string>()
  for (const ref of input.bindings?.get(group.candidateId)?.plausibleMatches ?? []) refs.add(ref)
  const target = input.intents?.find((intent) => intent.candidateRef === group.candidateId)?.targetRef
  if (target && !target.startsWith('planned-')) refs.add(target)
  if (root.constraint?.conflictingFields.length) {
    for (const ref of input.bindings?.get(group.candidateId)?.plausibleMatches ?? []) refs.add(ref)
  }
  const result: Projection[] = []
  for (const ref of [...refs].sort()) {
    const value = index.entities.get(ref) ?? index.relations.get(ref) ?? index.claims.get(ref)
    if (!value) continue
    if ('entityType' in (group.candidate as Candidate) && index.entities.has(ref)) result.push(entityProjection(value as KnowledgeEntityV03))
    else if (index.relations.has(ref)) result.push(relationProjection(value as KnowledgeRelationV03))
    else if (index.claims.has(ref)) result.push(claimProjection(value as KnowledgeClaimV03))
  }
  return result
}
function reverseDependents(input: BuildReviewCasesInput): Map<string, string[]> {
  const result = new Map<string, string[]>()
  for (const item of input.reviewItems) for (const dependency of item.dependentCandidateIds) result.set(dependency, [...(result.get(dependency) ?? []), item.candidateId])
  return result
}
function closure(root: RootReview, input: BuildReviewCasesInput): string[] {
  const groups = new Map(input.groups.map((group) => [group.candidateId, group])); const itemByCandidate = new Map(input.reviewItems.map((item) => [item.candidateId, item])); const reverse = reverseDependents(input); const seen = new Set<string>([root.item.candidateId]); const queue = [root.item.candidateId]
  while (queue.length > 0) {
    const current = queue.shift()!; const group = groups.get(current); if (!group) continue
    const next = [...candidateDependencies(group), ...(itemByCandidate.get(current)?.dependentCandidateIds ?? []), ...(reverse.get(current) ?? [])]
    for (const ref of next) if (groups.has(ref) && !seen.has(ref)) { seen.add(ref); queue.push(ref) }
  }
  return [...seen].filter((id) => id !== root.item.candidateId).sort()
}
function advisory(root: RootReview, assessment: PotentialInvestmentThemeAssessment | undefined): ReviewCaseAdvisory | undefined {
  if (assessment) return { novelty: assessment.noveltyState, recommendation: assessment.recommendation, recommendationReason: assessment.recommendationReason, suggestedNextAction: 'Build Theme', support: { supportingCandidateCount: assessment.support.supportingCandidateCount, supportingUnitCount: assessment.support.supportingUnitCount, supportingPrimaryBlockCount: assessment.support.supportingPrimaryBlockCount, supportingSectionCount: assessment.support.supportingSectionCount, evidenceBlockRefs: assessment.support.evidenceBlockRefs } }
  const conflict = root.constraint?.conflictValues
  if (conflict) { const value: ReviewCaseAttributeConflict = { fields: root.constraint.conflictingFields, left: conflict.left, right: conflict.right }; return { attributeConflict: value, suggestedNextAction: 'Review relation attributes' } }
  if (root.item.category === 'schema_gap') return { suggestedNextAction: 'Schema Design' }
  if (root.item.category === 'theme_ambiguity') return { suggestedNextAction: 'Review existing theme coverage' }
  return undefined
}
function assessmentFor(group: ResolvedCandidateGroup, input: BuildReviewCasesInput): PotentialInvestmentThemeAssessment | undefined { return (input.potentialNewInvestmentThemes ?? []).find((item) => item.candidateId === group.candidateId) }

export function buildReviewCases(input: BuildReviewCasesInput): readonly ReviewCase[] {
  const groups = new Map(input.groups.map((group) => [group.candidateId, group])); const index = KnowledgeIndexV03.fromAssets(input.assets); const cases: ReviewCase[] = []
  for (const root of findRoots(input)) {
    const rootGroup = groups.get(root.item.candidateId); if (!rootGroup) continue
    const dependentIds = closure(root, input); const rootProposal = makeProposal(rootGroup, input, root.item.dependentCandidateIds); const dependentProposals = dependentIds.map((id) => makeProposal(groups.get(id)!, input, input.reviewItems.find((item) => item.candidateId === id)?.dependentCandidateIds ?? []))
    const assessment = assessmentFor(rootGroup, input)
    const classification: ReviewCaseClassification = { category: root.item.category!, actionability: actionability(root.item.category!), origin: origin(root.item), stage: root.item.stage ?? 'review', rationale: root.item.rationale }
    const reviewCaseId = `review-case-${hashKnowledgeObject({ knowledgeBaseId: input.knowledgeBaseId, producerRunId: input.producerRunId, normalizedReviewKey: normalized(root.key) }).slice(7)}`
    cases.push({ version: '0.1', reviewCaseId, knowledgeBaseId: input.knowledgeBaseId, producerType: input.producerType ?? 'raw_document_knowledge_ingestion', producerRunId: input.producerRunId, createdAt: input.createdAt, classification, rootProposal, suspendedProposalBundle: { dependentProposals }, resolutionContext: { existingKnowledgeProjections: existingProjections(root, rootGroup, input, index), schemaVersionAtCreation: '0.3', knowledgeBaseRevisionAtCreation: input.knowledgeBaseRevisionAtCreation, context: { reviewKey: root.key, candidateId: root.item.candidateId, bindingState: input.bindings?.get(root.item.candidateId)?.state ?? 'none', plausibleMatchCount: input.bindings?.get(root.item.candidateId)?.plausibleMatches.length ?? 0 } }, impact: { dependentProposalCount: dependentProposals.length, affectedProposalRefs: dependentIds }, ...(advisory(root, assessment) === undefined ? {} : { advisory: advisory(root, assessment) }), state: { status: 'open' } })
  }
  return [...new Map(cases.map((item) => [item.reviewCaseId, item])).values()].sort((left, right) => left.reviewCaseId.localeCompare(right.reviewCaseId))
}
