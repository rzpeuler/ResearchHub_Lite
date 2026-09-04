import { hashKnowledgeObject } from '../../knowledge/storage/canonical-hash.ts'
import { normalizeSemanticText } from '../../knowledge/registry/id-allocation.ts'
import { KnowledgeIndexV03 } from '../../knowledge/query/index.ts'
import type { KnowledgeAssetCollectionV03 } from '../../knowledge/storage/v03-types.ts'
import type { KnowledgeClaimV03, KnowledgeEntityV03, KnowledgeRelationV03 } from '../../knowledge/schema/domain.ts'
import type { StructuredDocument } from '../../plugins/document/contracts.ts'
import type { KnowledgeCurationSkill } from '../../skills/knowledge-curation/skill.ts'
import type { ClaimCandidate, EntityCandidate, IncomingSourceContext, RelationCandidate, ReportMap, ResolutionCase, ResolutionOutcome, ResolvedCandidateGroup, SemanticCaseEvidence, SemanticResolutionResult, SemanticSourceProjection } from '../../skills/knowledge-curation/contracts.ts'
import { semanticOutcomeVocabulary } from '../../skills/knowledge-curation/validation.ts'
import type { AcceptedExtractionPlan, PotentialInvestmentThemeAssessment, ReviewCategory, ReviewItem } from './contracts.ts'
import { assessPotentialNewInvestmentTheme } from './investment-theme-policy.ts'
import type { ConsolidatedCandidateSupport } from './consolidation.ts'

type Dict = Record<string, unknown>
export type BindingState = 'BoundExisting' | 'PlannedNew' | 'Unresolved'
export interface EntityBinding {
  readonly candidateId: string
  readonly state: BindingState
  readonly ref?: string
  readonly plannedRef?: string
  readonly plausibleMatches: readonly string[]
}
export interface SemanticBasis {
  readonly outcome?: string
  readonly rationale: string
  readonly caseId?: string
  readonly caseKind?: string
}
export type ResolutionDisposition = 'create' | 'enrich_existing' | 'merge_evidence' | 'replace_state' | 'supersede' | 'no_op' | 'reject' | 'review'
export interface ResolutionIntent {
  readonly candidateRef: string
  readonly candidateKind: 'entity' | 'relation' | 'claim'
  readonly disposition: ResolutionDisposition
  readonly targetRef?: string
  readonly semanticBasis: SemanticBasis
  readonly evidenceRefs: readonly string[]
  readonly reviewDependencyRefs?: readonly string[]
}
export interface KnowledgeResolutionInput {
  readonly assets: KnowledgeAssetCollectionV03
  readonly document: StructuredDocument
  readonly groups: readonly ResolvedCandidateGroup[]
  readonly reportMap: ReportMap
  readonly incomingSourceContext?: IncomingSourceContext
  readonly plan: AcceptedExtractionPlan
  readonly rawRef: string
  readonly skill: KnowledgeCurationSkill
  readonly instructions?: string
  readonly maxResolutionAttempts?: number
  readonly maxResolutionCases?: number
  readonly maxEntityBindingCandidates?: number
  readonly maxContextTokens?: number
  readonly consolidationReviews?: readonly { readonly candidateId: string; readonly reason: string; readonly conflictingFields?: readonly string[] }[]
  readonly candidateSupport?: ReadonlyMap<string, ConsolidatedCandidateSupport>
}
export interface KnowledgeResolutionResult {
  readonly intents: readonly ResolutionIntent[]
  readonly bindings: ReadonlyMap<string, EntityBinding>
  readonly reviewItems: readonly ReviewItem[]
  readonly blocked: boolean
  readonly errors: readonly string[]
  readonly semanticCaseCalls: number
  readonly semanticCaseCount: number
  readonly summary: Readonly<Record<string, number>>
  readonly potentialNewInvestmentThemes: readonly PotentialInvestmentThemeAssessment[]
  readonly recommendedNewInvestmentThemes: readonly PotentialInvestmentThemeAssessment[]
}

const CASE_LIMIT = 32
const SYMMETRIC_RELATIONS = new Set(['competes_with', 'substitutes_for'])
function dict(value: unknown): Dict { return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Dict : {} }
function norm(value: unknown): string { return typeof value === 'string' ? normalizeSemanticText(value) : '' }
function unique(values: readonly string[]): string[] { return [...new Set(values)].sort() }
function active(value: { lifecycle?: { status?: string } }): boolean { return value.lifecycle?.status === undefined || value.lifecycle.status === 'active' }
function evidence(candidate: EntityCandidate | RelationCandidate | ClaimCandidate): string[] { return [...candidate.evidenceBlockRefs].sort() }
function plannedRef(candidate: EntityCandidate): string { return `planned-entity-${hashKnowledgeObject({ candidateId: candidate.candidateId, entityType: candidate.entityType, name: norm(candidate.name) }).slice(7, 23)}` }
function candidateNames(candidate: EntityCandidate): Set<string> { return new Set([candidate.name, ...(candidate.aliases ?? [])].map(norm).filter(Boolean)) }
function existingNames(entity: KnowledgeEntityV03): Set<string> { return new Set([entity.name, ...(entity.aliases ?? []), ...(entity.type === 'company' && entity.legalName ? [entity.legalName] : [])].map(norm).filter(Boolean)) }
function hardKey(candidate: EntityCandidate): string | undefined {
  if (candidate.entityType !== 'company') return undefined
  const fields = dict(candidate.semanticFields)
  const exchange = norm(fields.exchange)
  const ticker = norm(fields.ticker)
  return exchange && ticker ? `${exchange}|${ticker}` : undefined
}
function entityHardKey(entity: KnowledgeEntityV03): string | undefined {
  if (entity.type !== 'company') return undefined
  const exchange = norm(entity.exchange)
  const ticker = norm(entity.ticker)
  return exchange && ticker ? `${exchange}|${ticker}` : undefined
}
function plausibleEntities(index: KnowledgeIndexV03, candidate: EntityCandidate): KnowledgeEntityV03[] {
  const namesWanted = candidateNames(candidate)
  const fields = dict(candidate.semanticFields)
  const ticker = norm(fields.ticker)
  const exchange = norm(fields.exchange)
  return [...index.entities.values()].filter((entity) => {
    if (entity.type !== candidate.entityType) return false
    const byName = [...existingNames(entity)].some((value) => namesWanted.has(value))
    const byTicker = ticker !== '' && entity.type === 'company' && norm(entity.ticker) === ticker
    const byExchange = exchange !== '' && entity.type === 'company' && norm(entity.exchange) === exchange
    return byName || byTicker || byExchange
  }).filter(active).sort((a, b) => a.id.localeCompare(b.id))
}
function entityProjection(entity: KnowledgeEntityV03): unknown { return { type: entity.type, name: entity.name, aliases: [...(entity.aliases ?? [])].sort(), ...(entity.description == null ? {} : { description: entity.description }), ...(entity.type === 'investment_theme' ? { definition: entity.definition ?? null, inclusionCriteria: [...(entity.inclusionCriteria ?? [])].sort(), exclusionCriteria: [...(entity.exclusionCriteria ?? [])].sort() } : {}), ...(entity.type === 'company' ? { ticker: entity.ticker ?? null, exchange: entity.exchange ?? null, legalName: entity.legalName ?? null } : {}) } }
function candidateProjection(candidate: EntityCandidate | RelationCandidate | ClaimCandidate): unknown {
  if ('entityType' in candidate) return { kind: 'entity', type: candidate.entityType, name: candidate.name, aliases: [...(candidate.aliases ?? [])].sort(), description: candidate.description ?? null, semanticFields: candidate.semanticFields ?? null }
  if ('relationType' in candidate) return { kind: 'relation', type: candidate.relationType, source: candidate.source.mention, target: candidate.target.mention, attributes: candidate.attributes ?? null }
  return { kind: 'claim', type: candidate.claimType, statement: candidate.statement, subjects: candidate.subjectRefs.map((item) => item.mention).sort(), temporal: candidate.temporal ?? null, structuredValue: candidate.structuredValue ?? null }
}
function sourceProjection(source: { title?: string | null; institution?: string | null; author?: string | null; publishedAt?: string | null; sourceType?: SemanticSourceProjection['sourceType']; sourceReliability?: SemanticSourceProjection['reliability'] }): SemanticSourceProjection {
  return { title: source.title ?? null, institution: source.institution ?? null, author: source.author ?? null, publishedAt: source.publishedAt ?? null, sourceType: source.sourceType ?? null, reliability: source.sourceReliability ?? null }
}
function existingSourceProjections(index: KnowledgeIndexV03, sourceRefs: readonly string[] | undefined): SemanticSourceProjection[] {
  const seen = new Set<string>()
  const projections: SemanticSourceProjection[] = []
  for (const ref of sourceRefs ?? []) {
    const source = index.sources.get(ref)
    if (!source) continue
    const projection = sourceProjection(source)
    const key = hashKnowledgeObject(projection)
    if (!seen.has(key)) { seen.add(key); projections.push(projection) }
  }
  return projections.sort((a, b) => hashKnowledgeObject(a).localeCompare(hashKnowledgeObject(b)))
}
function caseEvidence(candidate: EntityCandidate | RelationCandidate | ClaimCandidate, plan: AcceptedExtractionPlan, document: StructuredDocument): { evidence: SemanticCaseEvidence[]; missingBlockIds: string[] } {
  const primary = new Set(plan.units.flatMap((unit) => unit.primaryBlockIds))
  const blocks = new Map(document.blocks.map((block) => [block.blockId, block]))
  const missingBlockIds: string[] = []
  const projected: SemanticCaseEvidence[] = []
  for (const blockId of evidence(candidate)) {
    const block = blocks.get(blockId)
    if (!block) { missingBlockIds.push(blockId); continue }
    projected.push({ blockId, blockType: block.type, sectionRef: block.sectionRef, page: block.page, role: primary.has(blockId) ? 'primary' : 'context', textExcerpt: block.text.slice(0, 800) })
  }
  return { evidence: projected, missingBlockIds }
}
function caseInput(caseId: string, caseKind: ResolutionCase['caseKind'], candidate: EntityCandidate | RelationCandidate | ClaimCandidate, existing: readonly { alias: string; projection: unknown }[], plan: AcceptedExtractionPlan, document: StructuredDocument, sourceContext: IncomingSourceContext, allowedOutcomes: readonly ResolutionOutcome[]): { resolutionCase: ResolutionCase; missingBlockIds: readonly string[] } {
  const evidenceProjection = caseEvidence(candidate, plan, document)
  return { resolutionCase: { caseId, caseKind, candidateProjection: candidateProjection(candidate), existingProjections: existing, evidence: evidenceProjection.evidence, sourceContext, schemaContextSlice: { caseKind, allowedOutcomes }, allowedOutcomes }, missingBlockIds: evidenceProjection.missingBlockIds }
}
function review(candidateId: string, kind: ReviewItem['kind'], rationale: string, dependency = false, refs: readonly string[] = [], origin: 'knowledge_resolution' | 'semantic_case' = 'knowledge_resolution', category: ReviewCategory = 'reconciliation_review'): ReviewItem {
  return { candidateId, kind, rationale, dependentCandidateIds: [...refs].sort(), stage: dependency ? 'knowledge_resolution_dependency' : origin === 'semantic_case' ? 'semantic_case' : 'knowledge_resolution', category, origin, dependency, reviewKey: ['knowledge-resolution', candidateId, dependency ? 'dependency' : 'root', category, rationale, ...refs].join('|') }
}
function intent(group: ResolvedCandidateGroup, disposition: ResolutionDisposition, rationale: string, targetRef: string | undefined, basis: Partial<SemanticBasis> = {}, dependencies: readonly string[] = []): ResolutionIntent {
  return { candidateRef: group.candidateId, candidateKind: group.kind, disposition, ...(targetRef === undefined ? {} : { targetRef }), semanticBasis: { rationale, ...basis }, evidenceRefs: evidence(group.candidate as EntityCandidate | RelationCandidate | ClaimCandidate), ...(dependencies.length === 0 ? {} : { reviewDependencyRefs: unique(dependencies) }) }
}
function bindingReview(group: ResolvedCandidateGroup, rationale: string, dependencies: readonly string[] = []): { intent: ResolutionIntent; review: ReviewItem } { return { intent: intent(group, 'review', rationale, undefined, {}, dependencies), review: review(group.candidateId, group.kind, rationale, dependencies.length > 0, dependencies, dependencies.length > 0 ? 'knowledge_resolution' : 'knowledge_resolution') } }
function fieldConflict(candidate: EntityCandidate, existing: KnowledgeEntityV03): string | undefined {
  const fields = dict(candidate.semanticFields)
  const pairs: Array<[string, unknown, unknown]> = [['description', candidate.description, existing.description]]
  if (candidate.entityType === 'company') for (const key of ['ticker', 'exchange', 'legalName']) pairs.push([key, fields[key], (existing as unknown as Dict)[key]])
  for (const [key, wanted, current] of pairs) if (wanted !== undefined && wanted !== null && current !== undefined && current !== null && norm(wanted) !== norm(current)) return `Entity ${key} conflicts with populated canonical state`
  return undefined
}
function hasEnrichment(candidate: EntityCandidate, existing: KnowledgeEntityV03): boolean {
  const existingValues = existingNames(existing)
  if (candidate.name && !existingValues.has(norm(candidate.name))) return true
  if ((candidate.aliases ?? []).some((value) => !existingValues.has(norm(value)))) return true
  if (candidate.description !== undefined && candidate.description !== null && (existing.description === undefined || existing.description === null)) return true
  const fields = dict(candidate.semanticFields)
  if (candidate.entityType === 'company') return ['ticker', 'exchange', 'legalName'].some((key) => fields[key] !== undefined && fields[key] !== null && ((existing as unknown as Dict)[key] === undefined || (existing as unknown as Dict)[key] === null))
  return false
}
function normalizeRelationEndpoints(type: string, source: string, target: string): [string, string] { return SYMMETRIC_RELATIONS.has(type) ? [source, target].sort() as [string, string] : [source, target] }
function relationMatches(index: KnowledgeIndexV03, candidate: RelationCandidate, source: string, target: string): KnowledgeRelationV03[] {
  const [left, right] = normalizeRelationEndpoints(candidate.relationType, source, target)
  return [...index.relations.values()].filter((relation) => { const [sourceRef, targetRef] = normalizeRelationEndpoints(relation.type, relation.sourceRef, relation.targetRef); return active(relation) && relation.type === candidate.relationType && sourceRef === left && targetRef === right }).sort((a, b) => a.id.localeCompare(b.id))
}
function attributeDiff(candidate: RelationCandidate, existing: KnowledgeRelationV03): 'none' | 'additive' | 'conflict' {
  const wanted = dict(candidate.attributes); const current = dict(existing.attributes)
  let additive = false
  for (const [key, value] of Object.entries(wanted)) { if (current[key] === undefined || current[key] === null) additive = true; else if (hashKnowledgeObject(current[key]) !== hashKnowledgeObject(value)) return 'conflict' }
  return additive ? 'additive' : 'none'
}
function claimIdentity(claim: { claimType: string; statement: string; subjectRefs: readonly string[]; temporal?: unknown; structuredValue?: unknown }): string { return hashKnowledgeObject({ claimType: claim.claimType, statement: norm(claim.statement), subjectRefs: unique(claim.subjectRefs), temporal: claim.temporal ?? null, structuredValue: claim.structuredValue ?? null }) }
function temporalCompatible(left: unknown, right: unknown): boolean {
  if (left == null || right == null) return true
  return hashKnowledgeObject(left) === hashKnowledgeObject(right)
}
function claimMatches(index: KnowledgeIndexV03, candidate: ClaimCandidate, subjects: readonly string[]): { exact: KnowledgeClaimV03[]; plausible: KnowledgeClaimV03[] } {
  const exactWanted = claimIdentity({ claimType: candidate.claimType, statement: candidate.statement, subjectRefs: subjects, temporal: candidate.temporal, structuredValue: candidate.structuredValue })
  const subjectSet = new Set(subjects)
  const all = [...index.claims.values()].filter(active).filter((claim) => claim.claimType === candidate.claimType && claim.subjectRefs.some((ref) => subjectSet.has(ref))).sort((a, b) => a.id.localeCompare(b.id))
  const exact = all.filter((claim) => claimIdentity(claim) === exactWanted)
  const plausible = all.filter((claim) => !exact.includes(claim) && temporalCompatible(claim.temporal, candidate.temporal)).sort((a, b) => {
    const aStatement = norm(a.statement) === norm(candidate.statement) ? 0 : 1
    const bStatement = norm(b.statement) === norm(candidate.statement) ? 0 : 1
    const aMetric = a.structuredValue?.metric && a.structuredValue.metric === candidate.structuredValue?.metric ? 0 : 1
    const bMetric = b.structuredValue?.metric && b.structuredValue.metric === candidate.structuredValue?.metric ? 0 : 1
    return aStatement - bStatement || aMetric - bMetric || a.id.localeCompare(b.id)
  })
  return { exact, plausible }
}
function isCapacitySafe(value: unknown, maxContextTokens: number | undefined): boolean { return maxContextTokens === undefined || JSON.stringify(value).length <= maxContextTokens * 4 }

export function resolveResolutionIntentBarrier(groups: readonly ResolvedCandidateGroup[], intents: readonly ResolutionIntent[], bindings: ReadonlyMap<string, EntityBinding>): { valid: boolean; errors: readonly string[] } {
  const errors: string[] = []
  const ids = new Set(groups.map((group) => group.candidateId))
  const byCandidate = new Map<string, ResolutionIntent[]>()
  for (const item of intents) byCandidate.set(item.candidateRef, [...(byCandidate.get(item.candidateRef) ?? []), item])
  for (const id of ids) { const matches = byCandidate.get(id) ?? []; if (matches.length !== 1) errors.push(matches.length === 0 ? `Missing ResolutionIntent for ${id}` : `Duplicate ResolutionIntent for ${id}`) }
  for (const item of intents) {
    if (!ids.has(item.candidateRef)) errors.push(`Unknown ResolutionIntent candidate ${item.candidateRef}`)
    if (item.disposition !== 'review' && item.disposition !== 'reject' && item.targetRef === undefined) errors.push(`Safe ResolutionIntent ${item.candidateRef} has no infrastructure target`)
    if (item.disposition !== 'review' && item.disposition !== 'reject' && item.targetRef?.startsWith('local-')) errors.push(`Unresolved local ref in safe ResolutionIntent ${item.candidateRef}`)
    if (item.disposition !== 'review' && item.disposition !== 'reject' && item.targetRef !== undefined && !/^(?:planned-(?:entity|relation|claim)-|(?:theme-group|entity|relation|claim|source|module):)/.test(item.targetRef)) errors.push(`ResolutionIntent ${item.candidateRef} has a non-infrastructure target ${item.targetRef}`)
    for (const dependency of item.reviewDependencyRefs ?? []) { const dependencyIntent = byCandidate.get(dependency)?.[0]; if (!dependencyIntent) errors.push(`ResolutionIntent ${item.candidateRef} has unknown review dependency ${dependency}`); else if (dependencyIntent.disposition !== 'review' && dependencyIntent.disposition !== 'reject') errors.push(`ResolutionIntent ${item.candidateRef} dependency ${dependency} is not isolated`) }
  }
  for (const [id, binding] of bindings) if (binding.state === 'Unresolved' && !byCandidate.get(id)?.some((item) => item.disposition === 'review')) errors.push(`Unresolved Entity binding ${id} is not isolated to Review`)
  return { valid: errors.length === 0, errors }
}

export async function resolveKnowledge(input: KnowledgeResolutionInput): Promise<KnowledgeResolutionResult> {
  const index = KnowledgeIndexV03.fromAssets(input.assets)
  const groups = [...input.groups].sort((a, b) => a.candidateId.localeCompare(b.candidateId))
  const intents: ResolutionIntent[] = []
  const reviews: ReviewItem[] = []
  const bindings = new Map<string, EntityBinding>()
  const errors: string[] = []
  const maxAttempts = input.maxResolutionAttempts ?? 2
  const maxCases = input.maxResolutionCases ?? CASE_LIMIT
  let semanticCaseCalls = 0
  let semanticCaseCount = 0
  const potentialNewInvestmentThemes: PotentialInvestmentThemeAssessment[] = []
  const recommendedNewInvestmentThemes: PotentialInvestmentThemeAssessment[] = []
  const entityGroups = groups.filter((group) => group.kind === 'entity')
  const maxEntityBindingCandidates = input.maxEntityBindingCandidates ?? 8
  const sourceContext: IncomingSourceContext = input.incomingSourceContext ?? { sourceType: (input.reportMap.sourceAssessment.sourceType as IncomingSourceContext['sourceType']) ?? null, reliability: input.reportMap.sourceAssessment.reliability ?? null }
  const consolidationReviews = new Map(input.consolidationReviews?.map((item) => [item.candidateId, item.reason] as const) ?? [])
  const addEntityResult = (group: ResolvedCandidateGroup, binding: EntityBinding, disposition: ResolutionDisposition, rationale: string, targetRef?: string, basis: Partial<SemanticBasis> = {}): void => { bindings.set(group.candidateId, binding); intents.push(intent(group, disposition, rationale, targetRef ?? binding.ref ?? binding.plannedRef, basis)); if (disposition === 'review') reviews.push(review(group.candidateId, group.kind, rationale, false, [], basis.caseKind === 'EntityBindingCase' ? 'semantic_case' : 'knowledge_resolution')) }
  const addThemeReview = (group: ResolvedCandidateGroup, rationale: string, category: ReviewCategory, plausibleMatches: readonly string[] = [], basis: Partial<SemanticBasis> = {}): void => {
    bindings.set(group.candidateId, { candidateId: group.candidateId, state: 'Unresolved', plausibleMatches })
    intents.push(intent(group, 'review', rationale, undefined, basis))
    reviews.push(review(group.candidateId, group.kind, rationale, false, [], basis.caseKind === 'InvestmentThemeCoverageCase' ? 'semantic_case' : 'knowledge_resolution', category))
  }
  const themeGroups = entityGroups.filter((group) => (group.candidate as EntityCandidate).entityType === 'investment_theme')
  const existingThemes = [...index.entities.values()].filter((entity): entity is Extract<KnowledgeEntityV03, { type: 'investment_theme' }> => entity.type === 'investment_theme' && active(entity)).sort((a, b) => a.id.localeCompare(b.id))
  const resolveInvestmentTheme = async (group: ResolvedCandidateGroup): Promise<void> => {
    const candidate = group.candidate as EntityCandidate
    const existing = existingThemes
    if (existing.length === 0) {
      const assessment = assessPotentialNewInvestmentTheme(candidate, input.candidateSupport?.get(group.candidateId), input.plan, input.document)
      potentialNewInvestmentThemes.push(assessment)
      if (assessment.recommendation === 'recommend') recommendedNewInvestmentThemes.push(assessment)
      addThemeReview(group, assessment.recommendationReason, 'theme_creation', [], { outcome: 'potential_new' })
      return
    }
    const projections = existing.map((entity, number) => ({ alias: `existing-theme-${String(number + 1).padStart(3, '0')}`, projection: entityProjection(entity) }))
    const caseId = `semantic-case-${hashKnowledgeObject({ kind: 'InvestmentThemeCoverageCase', candidateId: group.candidateId, existing: projections.map((item) => item.alias) }).slice(7, 23)}`
    const preparedCase = caseInput(caseId, 'InvestmentThemeCoverageCase', candidate, projections, input.plan, input.document, sourceContext, semanticOutcomeVocabulary('InvestmentThemeCoverageCase'))
    if (preparedCase.missingBlockIds.length > 0) { addThemeReview(group, `semantic_case_missing_evidence_block: ${preparedCase.missingBlockIds.join(', ')}`, 'theme_ambiguity', existing.map((item) => item.id), { caseId, caseKind: 'InvestmentThemeCoverageCase', outcome: 'ambiguous_existing' }); return }
    if (!isCapacitySafe(preparedCase.resolutionCase, input.maxContextTokens)) { addThemeReview(group, `investment_theme_coverage_context_incomplete: ${caseId} exceeds configured context capacity`, 'theme_ambiguity', existing.map((item) => item.id), { caseId, caseKind: 'InvestmentThemeCoverageCase', outcome: 'ambiguous_existing' }); return }
    if (semanticCaseCount >= maxCases) { addThemeReview(group, `InvestmentTheme coverage case limit ${maxCases} exceeded`, 'theme_ambiguity', existing.map((item) => item.id), { caseId, caseKind: 'InvestmentThemeCoverageCase', outcome: 'ambiguous_existing' }); return }
    semanticCaseCount += 1
    let result: SemanticResolutionResult | undefined
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) { semanticCaseCalls += 1; try { result = await input.skill.resolveSemanticCase({ resolutionCase: preparedCase.resolutionCase, instructions: input.instructions }); break } catch { /* bounded semantic failure remains an auditable Review */ } }
    if (result?.outcome === 'matches_existing') {
      const targetIndex = projections.findIndex((item) => item.alias === result!.targetAlias)
      if (targetIndex >= 0) {
        const target = existing[targetIndex]!
        const binding: EntityBinding = { candidateId: group.candidateId, state: 'BoundExisting', ref: target.id, plausibleMatches: existing.map((item) => item.id) }
        const conflict = fieldConflict(candidate, target)
        addEntityResult(group, binding, conflict ? 'review' : hasEnrichment(candidate, target) ? 'enrich_existing' : 'no_op', conflict ?? (hasEnrichment(candidate, target) ? 'Semantic InvestmentTheme binding with additive enrichment; themeGroupRef preserved' : 'Semantic InvestmentTheme binding; themeGroupRef preserved'), target.id, { caseId, caseKind: 'InvestmentThemeCoverageCase', outcome: result.outcome, rationale: result.rationale })
        return
      }
    }
    if (result?.outcome === 'potential_new') {
      const assessment = assessPotentialNewInvestmentTheme(candidate, input.candidateSupport?.get(group.candidateId), input.plan, input.document)
      potentialNewInvestmentThemes.push(assessment)
      if (assessment.recommendation === 'recommend') recommendedNewInvestmentThemes.push(assessment)
      addThemeReview(group, assessment.recommendationReason, 'theme_creation', existing.map((item) => item.id), { caseId, caseKind: 'InvestmentThemeCoverageCase', outcome: result.outcome, rationale: result.rationale })
      return
    }
    const rationale = result?.outcome === 'ambiguous_existing' ? result.rationale : result?.rationale ?? `InvestmentTheme coverage case ${caseId} failed after bounded retries`
    addThemeReview(group, rationale, 'theme_ambiguity', existing.map((item) => item.id), { caseId, caseKind: 'InvestmentThemeCoverageCase', outcome: result?.outcome ?? 'ambiguous_existing' })
  }
  for (const group of entityGroups) {
    const candidate = group.candidate as EntityCandidate
    const constraint = consolidationReviews.get(group.candidateId)
    if (constraint) { const result = bindingReview(group, constraint); bindings.set(group.candidateId, { candidateId: group.candidateId, state: 'Unresolved', plausibleMatches: [] }); intents.push(result.intent); reviews.push(result.review); continue }
    const key = hardKey(candidate)
    const hardMatches = key === undefined ? [] : [...index.entities.values()].filter((entity) => entityHardKey(entity) === key && active(entity))
    if (hardMatches.length > 1) { const rationale = `Knowledge integrity defect: hard Company key ${key} matches multiple canonical Entities`; bindings.set(group.candidateId, { candidateId: group.candidateId, state: 'Unresolved', plausibleMatches: hardMatches.map((item) => item.id) }); intents.push(intent(group, 'review', rationale, undefined)); reviews.push(review(group.candidateId, group.kind, rationale)); errors.push(rationale); continue }
    if (hardMatches.length === 1) { const existing = hardMatches[0]!; const conflict = fieldConflict(candidate, existing); const binding: EntityBinding = { candidateId: group.candidateId, state: 'BoundExisting', ref: existing.id, plausibleMatches: [existing.id] }; if (conflict) addEntityResult(group, binding, 'review', conflict); else addEntityResult(group, binding, hasEnrichment(candidate, existing) ? 'enrich_existing' : 'no_op', hasEnrichment(candidate, existing) ? 'Deterministic additive Entity enrichment' : 'Deterministic hard-key Entity match'); continue }
    if (candidate.entityType === 'investment_theme') { await resolveInvestmentTheme(group); continue }
    const plausible = plausibleEntities(index, candidate)
    if (plausible.length === 0) { const ref = plannedRef(candidate); addEntityResult(group, { candidateId: group.candidateId, state: 'PlannedNew', plannedRef: ref, plausibleMatches: [] }, 'create', 'No plausible canonical Entity match; planned new Entity', ref); continue }
    if (plausible.length > maxEntityBindingCandidates) { const rationale = `entity_plausible_match_overflow: ${plausible.length} plausible canonical Entities exceed bound ${maxEntityBindingCandidates}`; bindings.set(group.candidateId, { candidateId: group.candidateId, state: 'Unresolved', plausibleMatches: plausible.map((item) => item.id) }); intents.push(intent(group, 'review', rationale, undefined)); reviews.push(review(group.candidateId, group.kind, rationale)); continue }
    const aliases = plausible.map((item, number) => ({ alias: `existing-${String(number + 1).padStart(3, '0')}`, projection: entityProjection(item) }))
    const caseId = `semantic-case-${hashKnowledgeObject({ kind: 'EntityBindingCase', candidateId: group.candidateId, aliases: aliases.map((item) => item.alias) }).slice(7, 23)}`
    const preparedCase = caseInput(caseId, 'EntityBindingCase', candidate, aliases, input.plan, input.document, sourceContext, semanticOutcomeVocabulary('EntityBindingCase'))
    const resolutionCase = preparedCase.resolutionCase
    if (preparedCase.missingBlockIds.length > 0) { const rationale = `semantic_case_missing_evidence_block: ${preparedCase.missingBlockIds.join(', ')}`; bindings.set(group.candidateId, { candidateId: group.candidateId, state: 'Unresolved', plausibleMatches: plausible.map((item) => item.id) }); intents.push(intent(group, 'review', rationale, undefined, { caseId, caseKind: 'EntityBindingCase' })); reviews.push(review(group.candidateId, group.kind, rationale, false, [], 'semantic_case')); continue }
    if (!isCapacitySafe(resolutionCase, input.maxContextTokens)) { const rationale = `semantic_case_capacity_exceeded: ${caseId} exceeds configured context capacity`; bindings.set(group.candidateId, { candidateId: group.candidateId, state: 'Unresolved', plausibleMatches: plausible.map((item) => item.id) }); intents.push(intent(group, 'review', rationale, undefined, { caseId, caseKind: 'EntityBindingCase' })); reviews.push(review(group.candidateId, group.kind, rationale, false, [], 'semantic_case')); continue }
    if (semanticCaseCount >= maxCases) { const rationale = `Semantic resolution case limit ${maxCases} exceeded`; bindings.set(group.candidateId, { candidateId: group.candidateId, state: 'Unresolved', plausibleMatches: plausible.map((item) => item.id) }); intents.push(intent(group, 'review', rationale, undefined, { caseId, caseKind: 'EntityBindingCase' })); reviews.push(review(group.candidateId, group.kind, rationale, false, [], 'semantic_case')); continue }
    semanticCaseCount += 1
    let result: SemanticResolutionResult | undefined
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) { semanticCaseCalls += 1; try { result = await input.skill.resolveSemanticCase({ resolutionCase, instructions: input.instructions }); break } catch { /* final failure is represented as an auditable Review, not a workflow-wide block */ } }
    if (!result || result.outcome === 'uncertain') { const rationale = result?.rationale ?? `Semantic case ${caseId} failed after bounded retries`; bindings.set(group.candidateId, { candidateId: group.candidateId, state: 'Unresolved', plausibleMatches: plausible.map((item) => item.id) }); intents.push(intent(group, 'review', rationale, undefined, { caseId, caseKind: 'EntityBindingCase', outcome: result?.outcome })); reviews.push(review(group.candidateId, group.kind, rationale, false, [], 'semantic_case')); continue }
    if (result.outcome === 'distinct_from_all') { const ref = plannedRef(candidate); addEntityResult(group, { candidateId: group.candidateId, state: 'PlannedNew', plannedRef: ref, plausibleMatches: plausible.map((item) => item.id) }, 'create', result.rationale, ref, { caseId, caseKind: result.caseKind, outcome: result.outcome }); continue }
    const targetIndex = aliases.findIndex((item) => item.alias === result.targetAlias)
    if (result.outcome !== 'equivalent_to' || targetIndex < 0) { const rationale = 'Entity Binding returned an invalid or unmapped semantic target'; bindings.set(group.candidateId, { candidateId: group.candidateId, state: 'Unresolved', plausibleMatches: plausible.map((item) => item.id) }); intents.push(intent(group, 'review', rationale, undefined, { caseId, caseKind: 'EntityBindingCase', outcome: result.outcome })); reviews.push(review(group.candidateId, group.kind, rationale, false, [], 'semantic_case')); continue }
    const existing = plausible[targetIndex]!
    const conflict = fieldConflict(candidate, existing)
    const binding: EntityBinding = { candidateId: group.candidateId, state: 'BoundExisting', ref: existing.id, plausibleMatches: plausible.map((item) => item.id) }
    addEntityResult(group, binding, conflict ? 'review' : hasEnrichment(candidate, existing) ? 'enrich_existing' : 'no_op', conflict ?? (hasEnrichment(candidate, existing) ? 'Semantic Entity binding with additive enrichment' : 'Semantic Entity binding'), existing.id, { caseId, caseKind: result.caseKind, outcome: result.outcome, rationale: result.rationale })
  }
  const reviewOrReject = new Set(intents.filter((item) => item.disposition === 'review' || item.disposition === 'reject').map((item) => item.candidateRef))
  const entityRef = (ref: string): string | undefined => bindings.get(ref)?.ref ?? bindings.get(ref)?.plannedRef
  const dependentReview = (group: ResolvedCandidateGroup, dependencies: string[], rationale: string): void => { intents.push(intent(group, 'review', rationale, undefined, {}, dependencies)); reviews.push(review(group.candidateId, group.kind, rationale, true, dependencies)); reviewOrReject.add(group.candidateId) }
  for (const group of groups.filter((item) => item.kind === 'relation')) {
    const candidate = group.candidate as RelationCandidate
    if (consolidationReviews.has(group.candidateId)) { const rationale = consolidationReviews.get(group.candidateId)!; intents.push(intent(group, 'review', rationale, undefined)); reviews.push(review(group.candidateId, group.kind, rationale)); continue }
    const dependencies = [candidate.source.candidateRef, candidate.target.candidateRef].filter((ref) => reviewOrReject.has(ref) || entityRef(ref) === undefined)
    if (dependencies.length > 0) { dependentReview(group, dependencies, `Relation depends on unresolved Entity binding: ${dependencies.join(', ')}`); continue }
    const source = entityRef(candidate.source.candidateRef)!; const target = entityRef(candidate.target.candidateRef)!; const matches = relationMatches(index, candidate, source, target)
    if (matches.length > 1) { const rationale = 'Knowledge integrity defect: multiple active canonical Relations share the resolved identity'; intents.push(intent(group, 'review', rationale, undefined)); reviews.push(review(group.candidateId, group.kind, rationale)); errors.push(rationale); continue }
    if (matches.length === 0) { intents.push(intent(group, 'create', 'No canonical Relation matches the resolved endpoint identity', `planned-relation-${hashKnowledgeObject({ type: candidate.relationType, source, target }).slice(7, 23)}`)); continue }
    const existing = matches[0]!; const diff = attributeDiff(candidate, existing)
    if (diff === 'additive') { intents.push(intent(group, 'enrich_existing', 'Relation has only safely additive attributes', existing.id)); continue }
    if (diff === 'none') { intents.push(intent(group, 'merge_evidence', 'Relation identity is exact and evidence can be merged', existing.id)); continue }
    const alias = 'existing-001'; const caseId = `semantic-case-${hashKnowledgeObject({ kind: 'RelationConflictCase', candidateId: group.candidateId, existing: existing.id }).slice(7, 23)}`
    const preparedCase = caseInput(caseId, 'RelationConflictCase', candidate, [{ alias, projection: { type: existing.type, source: 'source', target: 'target', attributes: existing.attributes ?? null, sources: existingSourceProjections(index, existing.sourceRefs) } }], input.plan, input.document, sourceContext, semanticOutcomeVocabulary('RelationConflictCase'))
    const resolutionCase = preparedCase.resolutionCase
    if (preparedCase.missingBlockIds.length > 0 || !isCapacitySafe(resolutionCase, input.maxContextTokens) || semanticCaseCount >= maxCases) { const rationale = preparedCase.missingBlockIds.length > 0 ? `semantic_case_missing_evidence_block: ${preparedCase.missingBlockIds.join(', ')}` : !isCapacitySafe(resolutionCase, input.maxContextTokens) ? `semantic_case_capacity_exceeded: ${caseId} exceeds configured context capacity` : `Semantic resolution case limit ${maxCases} exceeded`; intents.push(intent(group, 'review', rationale, undefined, { caseId, caseKind: 'RelationConflictCase' })); reviews.push(review(group.candidateId, group.kind, rationale, false, [], 'semantic_case')); continue }
    semanticCaseCount += 1
    let result: SemanticResolutionResult | undefined
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) { semanticCaseCalls += 1; try { result = await input.skill.resolveSemanticCase({ resolutionCase, instructions: input.instructions }); break } catch { /* final failure is represented as an auditable Review, not a workflow-wide block */ } }
    const outcome = result?.outcome
    const basis = { caseId, caseKind: 'RelationConflictCase', ...(outcome === undefined ? {} : { outcome }), ...(result?.rationale === undefined ? {} : { rationale: result.rationale }) }
    if (outcome === 'equivalent') intents.push(intent(group, 'merge_evidence', result!.rationale, existing.id, basis))
    else if (outcome === 'state_changed') intents.push(intent(group, 'replace_state', result!.rationale, existing.id, basis))
    else if (outcome === 'invalid') intents.push(intent(group, 'reject', result!.rationale, undefined, basis))
    else { const rationale = result?.rationale ?? `Semantic case ${caseId} failed after bounded retries`; intents.push(intent(group, 'review', rationale, undefined, basis)); reviews.push(review(group.candidateId, group.kind, rationale, false, [], 'semantic_case')) }
  }
  for (const group of groups.filter((item) => item.kind === 'claim')) {
    const candidate = group.candidate as ClaimCandidate
    if (consolidationReviews.has(group.candidateId)) { const rationale = consolidationReviews.get(group.candidateId)!; intents.push(intent(group, 'review', rationale, undefined)); reviews.push(review(group.candidateId, group.kind, rationale)); continue }
    const dependencies = candidate.subjectRefs.map((subject) => subject.candidateRef).filter((ref) => reviewOrReject.has(ref) || entityRef(ref) === undefined)
    if (dependencies.length > 0) { dependentReview(group, dependencies, `Claim depends on unresolved Entity binding: ${dependencies.join(', ')}`); continue }
    const subjects = candidate.subjectRefs.map((subject) => entityRef(subject.candidateRef)!).sort(); const matches = claimMatches(index, candidate, subjects)
    if (matches.exact.length > 1) { const rationale = 'Knowledge integrity defect: multiple exact canonical Claims share the same identity'; intents.push(intent(group, 'review', rationale, undefined)); reviews.push(review(group.candidateId, group.kind, rationale)); errors.push(rationale); continue }
    if (matches.exact.length === 1) { intents.push(intent(group, 'merge_evidence', 'Claim exact identity matched deterministically; evidence will be merged', matches.exact[0]!.id)); continue }
    if (matches.plausible.length === 0) { intents.push(intent(group, 'create', 'No plausible Claim conflict was retrieved', `planned-claim-${hashKnowledgeObject({ candidateId: group.candidateId, identity: claimIdentity({ claimType: candidate.claimType, statement: candidate.statement, subjectRefs: subjects, temporal: candidate.temporal, structuredValue: candidate.structuredValue }) }).slice(7, 23)}`)); continue }
    if (matches.plausible.length > 8) { const rationale = `Claim conflict retrieval overflow: ${matches.plausible.length} compatible candidates exceed bound 8`; intents.push(intent(group, 'review', rationale, undefined)); reviews.push(review(group.candidateId, group.kind, rationale)); continue }
    const existing = matches.plausible.map((value, number) => ({ alias: `existing-${String(number + 1).padStart(3, '0')}`, projection: { claimType: value.claimType, statement: value.statement, subjects: value.subjectRefs.map(() => 'existing-subject'), temporal: value.temporal ?? null, structuredValue: value.structuredValue ?? null, sources: existingSourceProjections(index, value.sourceRefs) } }))
    const caseId = `semantic-case-${hashKnowledgeObject({ kind: 'ClaimConflictCase', candidateId: group.candidateId, existing: existing.map((item) => item.alias) }).slice(7, 23)}`
    const preparedCase = caseInput(caseId, 'ClaimConflictCase', candidate, existing, input.plan, input.document, sourceContext, semanticOutcomeVocabulary('ClaimConflictCase'))
    const resolutionCase = preparedCase.resolutionCase
    if (preparedCase.missingBlockIds.length > 0 || !isCapacitySafe(resolutionCase, input.maxContextTokens) || semanticCaseCount >= maxCases) { const rationale = preparedCase.missingBlockIds.length > 0 ? `semantic_case_missing_evidence_block: ${preparedCase.missingBlockIds.join(', ')}` : !isCapacitySafe(resolutionCase, input.maxContextTokens) ? `semantic_case_capacity_exceeded: ${caseId} exceeds configured context capacity` : `Semantic resolution case limit ${maxCases} exceeded`; intents.push(intent(group, 'review', rationale, undefined, { caseId, caseKind: 'ClaimConflictCase' })); reviews.push(review(group.candidateId, group.kind, rationale, false, [], 'semantic_case')); continue }
    semanticCaseCount += 1
    let result: SemanticResolutionResult | undefined
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) { semanticCaseCalls += 1; try { result = await input.skill.resolveSemanticCase({ resolutionCase, instructions: input.instructions }); break } catch { /* final failure is represented as an auditable Review, not a workflow-wide block */ } }
    const target = result?.targetAlias === undefined ? undefined : matches.plausible[existing.findIndex((item) => item.alias === result!.targetAlias)]?.id
    const outcome = result?.outcome; const basis = { caseId, caseKind: 'ClaimConflictCase', ...(outcome === undefined ? {} : { outcome }), ...(result?.rationale === undefined ? {} : { rationale: result.rationale }) }
    if (outcome === 'equivalent' && target) intents.push(intent(group, 'merge_evidence', result!.rationale, target, basis))
    else if (outcome === 'supersedes' && target) intents.push(intent(group, 'supersede', result!.rationale, target, basis))
    else if (outcome === 'coexists' || (outcome === 'contradicts' && (candidate.claimType === 'forecast' || candidate.claimType === 'viewpoint'))) intents.push(intent(group, 'create', result!.rationale, `planned-claim-${hashKnowledgeObject({ candidateId: group.candidateId, coexist: true }).slice(7, 23)}`, basis))
    else if (outcome === 'invalid') intents.push(intent(group, 'reject', result!.rationale, undefined, basis))
    else { const rationale = result?.rationale ?? `Semantic case ${caseId} failed after bounded retries`; intents.push(intent(group, 'review', rationale, undefined, basis)); reviews.push(review(group.candidateId, group.kind, rationale, false, [], 'semantic_case')) }
  }
  const barrier = resolveResolutionIntentBarrier(groups, intents, bindings)
  if (!barrier.valid) errors.push(...barrier.errors)
  return { intents: intents.sort((a, b) => a.candidateRef.localeCompare(b.candidateRef)), bindings, reviewItems: [...new Map(reviews.map((item) => [item.reviewKey, item])).values()].sort((a, b) => (a.reviewKey ?? '').localeCompare(b.reviewKey ?? '')), blocked: errors.length > 0 || !barrier.valid, errors, semanticCaseCalls, semanticCaseCount, summary: { entities: entityGroups.length, relations: groups.filter((group) => group.kind === 'relation').length, claims: groups.filter((group) => group.kind === 'claim').length, semanticCases: semanticCaseCount, semanticCaseCalls, intents: intents.length, reviews: reviews.length, investmentThemes: themeGroups.length, potentialNewInvestmentThemes: potentialNewInvestmentThemes.length, recommendedNewInvestmentThemes: recommendedNewInvestmentThemes.length }, potentialNewInvestmentThemes: potentialNewInvestmentThemes.sort((a, b) => a.candidateId.localeCompare(b.candidateId)), recommendedNewInvestmentThemes: recommendedNewInvestmentThemes.sort((a, b) => a.candidateId.localeCompare(b.candidateId)) }
}
