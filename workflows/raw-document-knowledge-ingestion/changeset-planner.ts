import { KNOWLEDGE_SCHEMA_V03 } from '../../knowledge/schema/executable-schema.ts'
import type { KnowledgeClaimV03, KnowledgeEntityV03, KnowledgeRelationV03, KnowledgeSourceV03 } from '../../knowledge/schema/domain.ts'
import type { KnowledgeChangeSetV03, KnowledgeOperationV03, KnowledgeSourceOperationV03 } from '../../knowledge/schema/mutation.ts'
import { allocateClaimId, allocateEntityId, allocateRelationId, allocateSourceId } from './id-helpers.ts'
import { hashKnowledgeObject } from '../../knowledge/storage/canonical-hash.ts'
import { KnowledgeIndexV03 } from '../../knowledge/query/index.ts'
import type { ReportMap, ReconciliationDecision, ResolvedCandidateGroup, EntityCandidate, RelationCandidate, ClaimCandidate } from '../../skills/knowledge-curation/contracts.ts'
import type { KnowledgeAssetCollectionV03 } from '../../knowledge/storage/v03-types.ts'
import type { AcceptedExtractionPlan, ReviewItem } from './contracts.ts'

export interface ChangeSetPlanningInput {
  readonly knowledgeBaseId: string
  readonly baseRevision: number
  readonly workflowRunId: string
  readonly rawRef: string
  readonly rawManifest: { readonly originalFilename: string | null; readonly suppliedMetadata: { readonly title: string | null; readonly institution: string | null; readonly author: string | null; readonly publishedAt: string | null; readonly sourceUrl: string | null } }
  readonly documentId: string
  readonly document: { readonly metadata: { readonly originalFilename: string | null; readonly title?: string | null } }
  readonly reportMap: ReportMap
  readonly plan: AcceptedExtractionPlan
  readonly groups: readonly ResolvedCandidateGroup[]
  readonly decisions: readonly ReconciliationDecision[]
  readonly assets: KnowledgeAssetCollectionV03
}

export interface ChangeSetPlanningResult {
  readonly changeSet?: KnowledgeChangeSetV03
  readonly reviewItems: readonly ReviewItem[]
  readonly safeOperationCount: number
  readonly summary: Readonly<Record<string, number>>
}

function sourceType(value: string | undefined): KnowledgeSourceV03['sourceType'] { return KNOWLEDGE_SCHEMA_V03.source.types.includes(value as never) ? value as KnowledgeSourceV03['sourceType'] : 'unknown' }
function reliability(value: string | undefined): KnowledgeSourceV03['sourceReliability'] { return KNOWLEDGE_SCHEMA_V03.source.reliabilities.includes(value as never) ? value as KnowledgeSourceV03['sourceReliability'] : 'unknown' }
function blockLocator(plan: AcceptedExtractionPlan, candidateBlocks: readonly string[]): string | null { const known = new Set(plan.units.flatMap((unit) => unit.primaryBlockIds)); return [...candidateBlocks].sort().find((id) => known.has(id)) ?? [...candidateBlocks].sort()[0] ?? null }
function allowedAttributes(type: string): Set<string> { const definition = KNOWLEDGE_SCHEMA_V03.relation.definitions[type as keyof typeof KNOWLEDGE_SCHEMA_V03.relation.definitions] as Record<string, unknown> | undefined; const attrs = definition?.attributes; return attrs && typeof attrs === 'object' ? new Set(Object.keys(attrs as object)) : new Set() }
function existingOfKind(group: ResolvedCandidateGroup, kind: 'entity' | 'relation' | 'claim'): Record<string, unknown> | undefined { return group.existingKnowledge?.find((value) => { const id = value && typeof value === 'object' ? (value as { id?: unknown }).id : undefined; return typeof id === 'string' && id.startsWith(`${kind}:`) }) as Record<string, unknown> | undefined }
function makeClaim(input: ChangeSetPlanningInput, candidate: ClaimCandidate, id: string, subjectRefs: readonly string[], sourceId: string, supersedes?: string): KnowledgeClaimV03 {
  return { id: id as KnowledgeClaimV03['id'], claimType: candidate.claimType, statement: candidate.statement, subjectRefs: [...new Set(subjectRefs)] as KnowledgeClaimV03['subjectRefs'], primarySubjectRef: subjectRefs[0] as KnowledgeClaimV03['primarySubjectRef'], sourceRefs: [sourceId as KnowledgeClaimV03['sourceRefs'][number]], provenance: candidate.evidenceBlockRefs.map((blockId) => ({ sourceRef: sourceId as KnowledgeClaimV03['sourceRefs'][number], rawRef: input.rawRef as KnowledgeClaimV03['provenance'] extends (infer T)[] ? T extends { rawRef: infer R } ? R : never : never, locator: blockLocator(input.plan, [blockId]), chunkRef: null })), lifecycle: { status: 'active' }, ...(supersedes === undefined ? {} : { supersedes: [supersedes as KnowledgeClaimV03['supersedes'] extends (infer T)[] ? T : never] }), ...(candidate.temporal === undefined || candidate.temporal === null ? {} : { temporal: structuredClone(candidate.temporal) }), ...(candidate.structuredValue === undefined || candidate.structuredValue === null ? {} : { structuredValue: structuredClone(candidate.structuredValue) }), ...(candidate.confidence === undefined ? {} : { confidence: candidate.confidence }) } as KnowledgeClaimV03
}

export function planKnowledgeChangeSet(input: ChangeSetPlanningInput): ChangeSetPlanningResult {
  const index = KnowledgeIndexV03.fromAssets(input.assets)
  const sourceId = allocateSourceId({ sourceUrl: input.rawManifest.suppliedMetadata.sourceUrl, publishedAt: input.rawManifest.suppliedMetadata.publishedAt, title: input.rawManifest.suppliedMetadata.title ?? input.document.metadata.title ?? input.rawManifest.originalFilename, rawRef: input.rawRef })
  const source: KnowledgeSourceV03 = {
    id: sourceId as KnowledgeSourceV03['id'],
    title: input.rawManifest.suppliedMetadata.title ?? input.document.metadata.title ?? input.rawManifest.originalFilename ?? input.documentId,
    sourceType: sourceType(input.reportMap.sourceAssessment.sourceType),
    institution: input.rawManifest.suppliedMetadata.institution,
    author: input.rawManifest.suppliedMetadata.author,
    publishedAt: input.rawManifest.suppliedMetadata.publishedAt,
    url: input.rawManifest.suppliedMetadata.sourceUrl,
    sourceReliability: reliability(input.reportMap.sourceAssessment.reliability),
    rawRefs: [input.rawRef as KnowledgeSourceV03['rawRefs'] extends (infer T)[] ? T : never],
    metadata: { workflowRunId: input.workflowRunId, documentId: input.documentId },
    lifecycle: { status: 'active' },
  }
  const sourceOperations: KnowledgeSourceOperationV03[] = []
  const existingSource = index.sources.get(sourceId)
  if (existingSource) sourceOperations.push({ operationId: 'source-merge-001', type: 'source_merge', sourceId, expectedBeforeHash: hashKnowledgeObject(existingSource), addRawRefs: [input.rawRef] })
  else sourceOperations.push({ operationId: 'source-create-001', type: 'source_create', source })

  const decisions = new Map(input.decisions.map((decision) => [decision.candidateId, decision]))
  const groups = new Map(input.groups.map((group) => [group.candidateId, group]))
  const reviewIds = new Set([...input.decisions].filter((decision) => decision.action === 'user_review').map((decision) => decision.candidateId))
  const dependentIds = new Map<string, string[]>()
  for (const group of input.groups) {
    if (group.kind === 'relation') for (const ref of [(group.candidate as RelationCandidate).source.candidateRef, (group.candidate as RelationCandidate).target.candidateRef]) dependentIds.set(ref, [...(dependentIds.get(ref) ?? []), group.candidateId])
    if (group.kind === 'claim') for (const ref of (group.candidate as ClaimCandidate).subjectRefs.map((subject) => subject.candidateRef)) dependentIds.set(ref, [...(dependentIds.get(ref) ?? []), group.candidateId])
  }
  const reviewItems: ReviewItem[] = []
  for (const id of [...reviewIds].sort()) { const decision = decisions.get(id)!; reviewItems.push({ candidateId: id, kind: groups.get(id)?.kind ?? 'unknown', rationale: decision.rationale, dependentCandidateIds: [...new Set(dependentIds.get(id) ?? [])].sort() }) }
  const blocked = new Set<string>([...reviewIds])
  for (const id of reviewIds) for (const dependent of dependentIds.get(id) ?? []) blocked.add(dependent)
  const entityIds = new Map<string, string>()
  const knowledgeOperations: KnowledgeOperationV03[] = []
  let operationNumber = 1
  const operationId = (prefix: string) => `${prefix}-${String(operationNumber++).padStart(3, '0')}`
  const shouldCreate = (group: ResolvedCandidateGroup, decision: ReconciliationDecision | undefined): boolean => Boolean(decision && (decision.action === 'create' || decision.action === 'keep_both' || (decision.action === 'duplicate' && !group.existingKnowledge?.length)))
  for (const group of input.groups.filter((item) => item.kind === 'entity').sort((a, b) => a.candidateId.localeCompare(b.candidateId))) {
    const decision = decisions.get(group.candidateId)
    if (!decision || blocked.has(group.candidateId)) continue
    const candidate = group.candidate as EntityCandidate
    const id = decision.action === 'keep_both' ? allocateEntityId(candidate.entityType, candidate.name, { rawRef: input.rawRef }) : allocateEntityId(candidate.entityType, candidate.name)
    entityIds.set(group.candidateId, id)
    if (!shouldCreate(group, decision)) continue
    const object: KnowledgeEntityV03 = { id: id as KnowledgeEntityV03['id'], type: candidate.entityType, name: candidate.name, aliases: candidate.aliases === undefined ? [] : [...new Set(candidate.aliases)].sort(), description: candidate.description ?? null, lifecycle: { status: 'active' }, ...(candidate.confidence === undefined ? {} : { metadata: { extractionConfidence: candidate.confidence } }) } as KnowledgeEntityV03
    if (!index.entities.has(id)) knowledgeOperations.push({ operationId: operationId('entity-create'), type: 'create', object })
  }
  for (const group of input.groups.filter((item) => item.kind === 'relation').sort((a, b) => a.candidateId.localeCompare(b.candidateId))) {
    const decision = decisions.get(group.candidateId); const candidate = group.candidate as RelationCandidate
    if (!decision || blocked.has(group.candidateId)) continue
    if (decision.action === 'merge_source') {
      const current = existingOfKind(group, 'relation')
      if (current && typeof current.id === 'string' && Array.isArray(current.sourceRefs)) knowledgeOperations.push({ operationId: operationId('relation-source-merge'), type: 'merge_source', knowledgeId: current.id, expectedBeforeHash: hashKnowledgeObject(current), addSourceRefs: [sourceId] })
      continue
    }
    const sourceRef = entityIds.get(candidate.source.candidateRef); const targetRef = entityIds.get(candidate.target.candidateRef)
    if (!sourceRef || !targetRef) continue
    const attrs = candidate.attributes ?? {}
    const allowed = allowedAttributes(candidate.relationType)
    if (Object.keys(attrs).some((key) => !allowed.has(key))) { reviewItems.push({ candidateId: group.candidateId, kind: group.kind, rationale: 'Unsupported semantic relation attributes require user review', dependentCandidateIds: [] }); continue }
    const id = allocateRelationId(candidate.relationType, sourceRef, targetRef, attrs)
    if (shouldCreate(group, decision) && !index.relations.has(id)) {
      const object: KnowledgeRelationV03 = { id: id as KnowledgeRelationV03['id'], type: candidate.relationType, sourceRef: sourceRef as KnowledgeRelationV03['sourceRef'], targetRef: targetRef as KnowledgeRelationV03['targetRef'], sourceRefs: [sourceId as KnowledgeRelationV03['sourceRefs'] extends (infer T)[] ? T : never], lifecycle: { status: 'active' }, ...(Object.keys(attrs).length === 0 ? {} : { attributes: structuredClone(attrs) }), ...(candidate.confidence === undefined ? {} : { confidence: candidate.confidence }) } as KnowledgeRelationV03
      knowledgeOperations.push({ operationId: operationId('relation-create'), type: 'create', object })
    }
  }
  for (const group of input.groups.filter((item) => item.kind === 'claim').sort((a, b) => a.candidateId.localeCompare(b.candidateId))) {
    const decision = decisions.get(group.candidateId); const candidate = group.candidate as ClaimCandidate
    if (!decision || blocked.has(group.candidateId)) continue
    const subjects = candidate.subjectRefs.map((subject) => entityIds.get(subject.candidateRef)).filter((value): value is string => value !== undefined)
    if (subjects.length !== candidate.subjectRefs.length) continue
    const identity = { claimType: candidate.claimType, statement: candidate.statement, subjectRefs: [...subjects].sort() }
    const id = allocateClaimId(identity)
    if (decision.action === 'merge_source') {
      const current = existingOfKind(group, 'claim')
      if (current && typeof current.id === 'string' && Array.isArray(current.sourceRefs)) knowledgeOperations.push({ operationId: operationId('claim-source-merge'), type: 'merge_source', knowledgeId: current.id, expectedBeforeHash: hashKnowledgeObject(current), addSourceRefs: [sourceId] })
      continue
    }
    if (decision.action === 'supersede') {
      const current = existingOfKind(group, 'claim')
      if (current && typeof current.id === 'string') knowledgeOperations.push({ operationId: operationId('claim-supersede'), type: 'supersede', knowledgeId: current.id, expectedBeforeHash: hashKnowledgeObject(current), replacement: makeClaim(input, candidate, id, subjects, sourceId, current.id) })
      continue
    }
    if (shouldCreate(group, decision) && !index.claims.has(id)) {
      const object = makeClaim(input, candidate, id, subjects, sourceId)
      knowledgeOperations.push({ operationId: operationId('claim-create'), type: 'create', object })
    }
  }
  const changeSetId = `changeset-${hashKnowledgeObject({ workflowRunId: input.workflowRunId, knowledgeBaseId: input.knowledgeBaseId, rawRef: input.rawRef, documentId: input.documentId, groups: input.groups.map((group) => ({ candidateId: group.candidateId, kind: group.kind, candidate: group.candidate })) }).slice('sha256:'.length, 'sha256:'.length + 16)}`
  const changeSet: KnowledgeChangeSetV03 = { changeSetId, workflowRunId: input.workflowRunId, knowledgeBaseId: input.knowledgeBaseId, schemaVersion: '0.3', storageFormatVersion: '1', expectedBaseRevision: input.baseRevision, requiresRawProvenance: true, sourceOperations, knowledgeOperations, ingestionContext: { documentId: input.documentId, rawRef: input.rawRef, extractionUnitCount: input.plan.units.length } }
  return { changeSet, reviewItems, safeOperationCount: sourceOperations.length + knowledgeOperations.length, summary: { sourceOperations: sourceOperations.length, knowledgeCreates: knowledgeOperations.filter((operation) => operation.type === 'create').length, reviewItems: reviewItems.length, blockedDependencies: blocked.size - reviewIds.size } }
}
