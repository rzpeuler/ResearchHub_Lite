import { archiveRaw } from '../raw/raw-archive.ts'
import { readCanonicalV04Assets } from '../storage/canonical-v04-loader.ts'
import { hashKnowledgeObject } from '../storage/canonical-hash.ts'
import { allocateEntityId, allocateKnowledgeId, allocateSourceId, normalizeSemanticText, normalizeUrl } from '../registry/id-allocation.ts'
import { KnowledgeBaseRegistry } from '../registry/registry.ts'
import type { KnowledgeAssetV04, KnowledgeClaimV04, KnowledgeEntityV04, KnowledgeSourceV04 } from '../schema/domain-v04.ts'
import type { KnowledgeChangeSetV04, KnowledgeOperationV04, KnowledgeWriteResultV04 } from '../schema/mutation-v04.ts'
import { validateKnowledgeChangeSetV04 } from '../validation/v04-change-set-validator.ts'
import { writeKnowledgeBase } from '../writer/writer.ts'
import type { KnowledgeBaseHandle } from '../storage/handle.ts'
import { sha256 } from '../../plugins/research-acquisition/hash.ts'
import type { NormalizedResearchSource } from '../../plugins/research-acquisition/contracts.ts'
import type { KnowledgeProductionInput, KnowledgeProductionOutcome, ResolutionIntentSummary, SemanticProductionProposal } from './contracts.ts'

type Dict = Record<string, unknown>
type AssetMap = Map<string, KnowledgeAssetV04>
const safeId = /^[A-Za-z0-9][A-Za-z0-9._-]*$/

function record(value: unknown): value is Dict { return typeof value === 'object' && value !== null && !Array.isArray(value) }
function text(value: unknown): string { return typeof value === 'string' ? value.trim() : '' }
function identityText(value: unknown): string { return normalizeSemanticText(String(value ?? '')) }
function errorOutcome(input: KnowledgeProductionInput, status: 'blocked' | 'failed', errors: readonly string[], intents: readonly ResolutionIntentSummary[] = []): KnowledgeProductionOutcome {
  return { status, knowledgeBaseId: input.handle.knowledgeBaseId, knowledgeBaseRevision: input.handle.revision, baseRevision: input.handle.revision, createdIds: [], updatedIds: [], sourceRefsByLocalId: {}, claimRefsByProposalId: {}, entityRefsByLocalKey: {}, resolutionIntents: intents, errors }
}

function entityMatches(object: KnowledgeAssetV04, input: { name: string; aliases: readonly string[]; semanticFields?: Readonly<Record<string, unknown>> }): boolean {
  if (!object.id.startsWith('entity:') || !record(object)) return false
  const candidate = object as unknown as KnowledgeEntityV04 & Dict
  const names = [candidate.name, ...(Array.isArray(candidate.aliases) ? candidate.aliases : [])].map(identityText)
  return names.includes(identityText(input.name)) || input.aliases.some((alias) => names.includes(identityText(alias)))
}

function exactCompanyMatch(object: KnowledgeAssetV04, input: KnowledgeProductionInput): boolean {
  if (!object.id.startsWith('entity:') || !record(object)) return false
  const value = object as unknown as KnowledgeEntityV04 & Dict
  const fields = input.entity.semanticFields ?? {}
  const ticker = text(fields.ticker)
  const exchange = text(fields.exchange)
  return value.type === 'company' && ticker !== '' && identityText(value.ticker) === identityText(ticker) && (exchange === '' || identityText(value.exchange) === identityText(exchange))
}

function mergeEntity(existing: KnowledgeEntityV04, input: { name: string; aliases: readonly string[]; semanticFields?: Readonly<Record<string, unknown>> }): KnowledgeEntityV04 {
  const value = existing as unknown as KnowledgeEntityV04 & Dict
  const aliases = [...new Set([...(Array.isArray(value.aliases) ? value.aliases.filter((item): item is string => typeof item === 'string') : []), ...input.aliases.filter((item) => item.trim() !== '')])].sort()
  const fields = input.semanticFields ?? {}
  const merged: Dict = { ...value, aliases }
  for (const key of ['ticker', 'exchange', 'legalName']) if (typeof fields[key] === 'string' && fields[key] !== '' && (merged[key] === undefined || merged[key] === null || merged[key] === '')) merged[key] = fields[key]
  return merged as unknown as KnowledgeEntityV04
}

function sourceType(source: NormalizedResearchSource): KnowledgeSourceV04['sourceType'] {
  if (source.candidate.kind === 'official_disclosure') return 'official_disclosure'
  if (source.candidate.kind === 'structured_data') return 'industry_database'
  return source.candidate.kind === 'news' || source.candidate.kind === 'web_article' ? 'general_media' : 'general_media'
}

function acquisitionMethod(source: NormalizedResearchSource): NonNullable<KnowledgeSourceV04['acquisition']>['method'] {
  if (source.candidate.kind === 'official_disclosure') return 'official'
  if (source.candidate.kind === 'structured_data') return 'structured_data'
  if (source.candidate.kind === 'rss') return 'rss'
  return 'news_search'
}

function sourceObject(source: NormalizedResearchSource, id: string, rawRef: `raw-sha256-${string}`): KnowledgeSourceV04 {
  return {
    id: id as `source:${string}`,
    title: source.title,
    sourceType: sourceType(source),
    publisher: source.publisher,
    publishedAt: source.candidate.publishedAt ?? null,
    url: source.canonicalUrl ?? source.candidate.url ?? null,
    rawRefs: [rawRef],
    provider: source.candidate.provider,
    canonicalUrl: source.canonicalUrl ?? source.candidate.url ?? null,
    retrievedAt: source.retrievedAt,
    contentHash: source.contentHash,
    acquisition: { method: acquisitionMethod(source), discoveredAt: null, fetchedAt: source.retrievedAt, extractor: 'research-acquisition-normalizer' },
    rights: { ...source.rights, policyBasis: source.rights.policyBasis ?? 'personal_noncommercial_research' },
    lifecycle: { status: 'active' },
  }
}

function mergeSource(existing: KnowledgeSourceV04, incoming: KnowledgeSourceV04): KnowledgeSourceV04 {
  return { ...existing, rawRefs: [...new Set([...(existing.rawRefs ?? []), ...(incoming.rawRefs ?? [])])].sort(), contentHash: incoming.contentHash ?? existing.contentHash, retrievedAt: incoming.retrievedAt ?? existing.retrievedAt, rights: incoming.rights, acquisition: incoming.acquisition ?? existing.acquisition }
}

function temporalFor(proposal: SemanticProductionProposal, asOf: string | undefined): unknown {
  if (proposal.temporal !== undefined) return proposal.temporal
  return asOf === undefined ? undefined : { asOf, scope: { type: 'point_in_time', start: asOf, end: asOf, label: asOf } }
}

function validStructuredValue(value: unknown): Readonly<Record<string, unknown>> | undefined {
  if (!record(value)) return undefined
  if (typeof value.metric !== 'string') return undefined
  return value
}

function claimIdentity(proposal: SemanticProductionProposal, subjectRefs: readonly string[], asOf: string | undefined): Dict {
  return { claimType: proposal.claimType, statement: identityText(proposal.statement), subjectRefs: [...subjectRefs].sort(), temporal: temporalFor(proposal, asOf) ?? null, structuredValue: proposal.structuredValue ?? null }
}

function existingClaimMatch(object: KnowledgeAssetV04, identity: Dict): boolean {
  if (!object.id.startsWith('claim:')) return false
  const claim = object as KnowledgeClaimV04
  return hashKnowledgeObject({ claimType: claim.claimType, statement: identityText(claim.statement), subjectRefs: [...claim.subjectRefs].sort(), temporal: claim.temporal ?? null, structuredValue: claim.structuredValue ?? null }) === hashKnowledgeObject(identity)
}

function intent(id: string, disposition: ResolutionIntentSummary['disposition'], reason: string, fields: Partial<ResolutionIntentSummary> = {}): ResolutionIntentSummary {
  return { intentId: id, disposition, reason, ...fields }
}

function validateLocalProposals(proposals: readonly SemanticProductionProposal[]): readonly string[] {
  const errors: string[] = []
  const ids = new Set<string>()
  for (const proposal of proposals) {
    if (!safeId.test(proposal.proposalId) || /^(?:entity|relation|claim|source|raw|module|theme-group):/.test(proposal.proposalId) || ids.has(proposal.proposalId)) errors.push(`Proposal ID is not unique and local: ${proposal.proposalId}`)
    ids.add(proposal.proposalId)
    if (!safeId.test(proposal.subjectKey)) errors.push(`Proposal subjectKey is not safe: ${proposal.subjectKey}`)
    if (!['entity', 'claim', 'relation'].includes(proposal.kind)) errors.push(`Unsupported semantic proposal kind: ${proposal.kind}`)
  }
  for (const proposal of proposals) for (const link of [...proposal.supportsProposalIds ?? [], ...proposal.dependsOnProposalIds ?? [], ...proposal.contradictsProposalIds ?? []]) if (!ids.has(link)) errors.push(`Proposal link does not resolve locally: ${link}`)
  return errors
}

export class KnowledgeProductionGateway {
  constructor(private readonly registry: KnowledgeBaseRegistry = new KnowledgeBaseRegistry()) {}

  async projectExistingKnowledge(handle: KnowledgeBaseHandle, entity: { name?: string; symbol: string; exchange?: string }): Promise<readonly Dict[]> {
    const assets = await readCanonicalV04Assets(handle.rootRef)
    return assets.objects.filter((item) => item.value.id.startsWith('entity:') || item.value.id.startsWith('claim:')).filter((item) => {
      if (item.value.id.startsWith('entity:')) return entityMatches(item.value, { name: entity.name ?? entity.symbol, aliases: [entity.symbol] }) || exactCompanyMatch(item.value, { handle, entity: { localKey: 'company', entityType: 'company', name: entity.name ?? entity.symbol, aliases: [entity.symbol], semanticFields: { ticker: entity.symbol, exchange: entity.exchange } }, producerType: '', producerRunId: '', schemaProfile: { schemaVersion: '0.4', storageFormatVersion: '1', requiresRawProvenance: true }, proposals: [], evidenceBindings: [] })
      return true
    }).slice(0, 80).map((item) => {
      const value = item.value as unknown as Dict
      const projection: Dict = { kind: item.value.id.split(':', 1)[0], name: value.name ?? value.statement ?? null, aliases: Array.isArray(value.aliases) ? value.aliases.slice(0, 10) : [] }
      for (const field of ['type', 'ticker', 'exchange', 'claimType', 'publishedAt', 'sourceType']) if (value[field] !== undefined) projection[field] = value[field]
      if (typeof projection.statement === 'string') projection.statement = projection.statement.slice(0, 500)
      return projection
    })
  }

  async submit(input: KnowledgeProductionInput): Promise<KnowledgeProductionOutcome> {
    const now = input.now ?? (() => new Date().toISOString())
    const intents: ResolutionIntentSummary[] = []
    try {
      if (input.handle.schemaVersion !== '0.4' || input.handle.storageFormatVersion !== '1') return errorOutcome(input, 'blocked', ['Knowledge Production Gateway requires Schema 0.4 / Storage Format 1'])
      if (!safeId.test(input.producerRunId) || !safeId.test(input.producerType)) return errorOutcome(input, 'blocked', ['Producer identity is not safe'])
      const proposalErrors = validateLocalProposals(input.proposals)
      if (proposalErrors.length > 0) return errorOutcome(input, 'blocked', proposalErrors)
      const assets = await readCanonicalV04Assets(input.handle.rootRef)
      const objects: AssetMap = new Map(assets.objects.map((item) => [item.value.id, structuredClone(item.value)]))
      const operations: KnowledgeOperationV04[] = []
      const createdIds: string[] = []
      const updatedIds: string[] = []
      const entityRefsByLocalKey: Record<string, string> = {}
      const sourceRefsByLocalId: Record<string, string> = {}
      const claimRefsByProposalId: Record<string, string> = {}
      const rawRefsByLocalId = new Map<string, `raw-sha256-${string}`>()

      const entityInputs = new Map<string, KnowledgeProductionInput['entity']>([['company', input.entity]])
      for (const proposal of input.proposals) if (proposal.kind === 'entity' && proposal.entityName && proposal.entityType && !entityInputs.has(proposal.subjectKey)) entityInputs.set(proposal.subjectKey, { localKey: proposal.subjectKey, entityType: proposal.entityType, name: proposal.entityName, aliases: [], semanticFields: proposal.structuredValue ?? undefined })
      for (const [localKey, entityInput] of entityInputs) {
        const candidates = [...objects.values()].filter((object) => object.id.startsWith('entity:') && (localKey === input.entity.localKey ? exactCompanyMatch(object, input) : entityMatches(object, { ...entityInput, aliases: entityInput.aliases ?? [] })))
        if (candidates.length > 1) {
          intents.push(intent(`entity-${localKey}`, 'review_required', `Multiple canonical entities match local entity ${localKey}`, { localKey }))
          continue
        }
        const existing = candidates[0]
        const canonicalEntityName = entityInput.entityType === 'company' && text(entityInput.semanticFields?.ticker) ? text(entityInput.semanticFields?.ticker) : entityInput.name
        const ref = existing?.id ?? allocateEntityId(entityInput.entityType, canonicalEntityName)
        entityRefsByLocalKey[localKey] = ref
        if (existing) {
          const merged = mergeEntity(existing as KnowledgeEntityV04, { ...entityInput, aliases: entityInput.aliases ?? [] })
          intents.push(intent(`entity-${localKey}`, 'bound_existing', 'Bound to one deterministic canonical entity', { localKey, targetRef: ref }))
          if (hashKnowledgeObject(existing) !== hashKnowledgeObject(merged)) { objects.set(ref, merged); operations.push({ operationId: `update-entity-${operations.length + 1}`, type: 'update', knowledgeId: ref, expectedBeforeHash: hashKnowledgeObject(existing), object: merged }); updatedIds.push(ref) }
        } else {
          const created: KnowledgeEntityV04 = { id: ref as `entity:${string}`, type: entityInput.entityType, name: entityInput.name, aliases: [...new Set(entityInput.aliases)], ...(entityInput.semanticFields ?? {}), lifecycle: { status: 'active' } } as KnowledgeEntityV04
          objects.set(ref, created); operations.push({ operationId: `create-entity-${operations.length + 1}`, type: 'create', object: created }); createdIds.push(ref)
          intents.push(intent(`entity-${localKey}`, 'created_new', 'No deterministic canonical entity matched', { localKey, targetRef: ref }))
        }
      }
      if (!entityRefsByLocalKey[input.entity.localKey]) return errorOutcome(input, 'blocked', ['Company entity binding requires review before claims can be committed'], intents)

      for (const binding of input.evidenceBindings) {
        const isPdf = binding.source.candidate.url?.toLowerCase().endsWith('.pdf') === true
        const bytes = binding.source.rawBytes === undefined ? new TextEncoder().encode(binding.source.content) : Uint8Array.from(binding.source.rawBytes)
        const raw = await archiveRaw(input.handle, { bytes, originalFilename: binding.originalFilename ?? `${binding.localSourceId}${isPdf ? '.pdf' : '.txt'}`, mediaType: binding.mediaType ?? (isPdf ? 'application/pdf' : 'text/plain'), suppliedMetadata: { title: binding.source.title, institution: binding.source.publisher, publishedAt: binding.source.candidate.publishedAt ?? null, sourceUrl: binding.source.canonicalUrl ?? binding.source.candidate.url ?? null } }, { clock: now })
        rawRefsByLocalId.set(binding.localSourceId, raw.manifest.rawRef as `raw-sha256-${string}`)
        const candidates = [...objects.values()].filter((object) => object.id.startsWith('source:')).filter((object) => { const value = object as KnowledgeSourceV04; return value.contentHash === binding.source.contentHash || (value.canonicalUrl && binding.source.canonicalUrl && normalizeUrl(value.canonicalUrl) === normalizeUrl(binding.source.canonicalUrl) && value.publishedAt === (binding.source.candidate.publishedAt ?? null) && value.title === binding.source.title) })
        const incomingId = allocateSourceId({ sourceUrl: binding.source.canonicalUrl ?? binding.source.candidate.url, publishedAt: binding.source.candidate.publishedAt, title: binding.source.title, rawRef: raw.manifest.rawRef }).replace('source:doc-', 'source:research-')
        const existing = candidates[0]
        const source = sourceObject(binding.source, existing?.id ?? incomingId, raw.manifest.rawRef as `raw-sha256-${string}`)
        const finalSource = existing ? mergeSource(existing as KnowledgeSourceV04, source) : source
        sourceRefsByLocalId[binding.localSourceId] = finalSource.id
        objects.set(finalSource.id, finalSource)
        if (!existing) { operations.push({ operationId: `create-source-${operations.length + 1}`, type: 'create', object: finalSource }); createdIds.push(finalSource.id); intents.push(intent(`source-${binding.localSourceId}`, 'created_new', 'Archived and bound new evidence source', { localKey: binding.localSourceId, targetRef: finalSource.id })) }
        else if (hashKnowledgeObject(existing) !== hashKnowledgeObject(finalSource)) { operations.push({ operationId: `update-source-${operations.length + 1}`, type: 'update', knowledgeId: existing.id, expectedBeforeHash: hashKnowledgeObject(existing), object: finalSource }); updatedIds.push(existing.id); intents.push(intent(`source-${binding.localSourceId}`, 'bound_existing', 'Merged new raw evidence into existing source', { localKey: binding.localSourceId, targetRef: existing.id })) }
        else intents.push(intent(`source-${binding.localSourceId}`, 'bound_existing', 'Exact evidence source already exists', { localKey: binding.localSourceId, targetRef: existing.id }))
      }

      const claimProposals = input.proposals.filter((proposal) => proposal.kind === 'claim')
      const claimPlans: Array<{ proposal: SemanticProductionProposal; sourceRefs: `source:${string}`[]; subjectRef: string; existing?: KnowledgeClaimV04; ref: string }> = []
      for (const proposal of claimProposals) {
        const sourceRefs = (proposal.sourceCandidateIds ?? []).map((id) => sourceRefsByLocalId[id]).filter((id): id is `source:${string}` => id !== undefined)
        const subjectRef = entityRefsByLocalKey[proposal.subjectKey] ?? entityRefsByLocalKey[input.entity.localKey]
        if (!proposal.statement || !proposal.claimType || sourceRefs.length === 0 || !subjectRef) { intents.push(intent(`claim-${proposal.proposalId}`, 'review_required', 'Claim lacks a bound subject, source, or statement', { proposalId: proposal.proposalId })); continue }
        const identity = claimIdentity(proposal, [subjectRef], input.asOf)
        const existing = [...objects.values()].find((object) => existingClaimMatch(object, identity)) as KnowledgeClaimV04 | undefined
        const ref = existing?.id ?? allocateKnowledgeId('claim', identity).replace('claim:', 'claim:research-')
        claimRefsByProposalId[proposal.proposalId] = ref
        claimPlans.push({ proposal, sourceRefs, subjectRef, ...(existing === undefined ? {} : { existing }), ref })
      }
      for (const plan of claimPlans) {
        const { proposal, sourceRefs, subjectRef, existing, ref } = plan
        const supportRefs = (proposal.supportsProposalIds ?? []).map((id) => claimRefsByProposalId[id]).filter((id): id is `claim:${string}` => id !== undefined && id !== ref)
        const dependsRefs = (proposal.dependsOnProposalIds ?? []).map((id) => claimRefsByProposalId[id]).filter((id): id is `claim:${string}` => id !== undefined && id !== ref)
        const contradictsRefs = (proposal.contradictsProposalIds ?? []).map((id) => claimRefsByProposalId[id]).filter((id): id is `claim:${string}` => id !== undefined && id !== ref)
        const provenance = sourceRefs.map((sourceRef) => ({ sourceRef, rawRef: [...rawRefsByLocalId.entries()].find(([localId]) => sourceRefsByLocalId[localId] === sourceRef)?.[1], locator: null, chunkRef: null })).filter((item): item is { sourceRef: `source:${string}`; rawRef: `raw-sha256-${string}`; locator: null; chunkRef: null } => item.rawRef !== undefined)
        const claim: KnowledgeClaimV04 = { id: ref as `claim:${string}`, claimType: proposal.claimType!, statement: proposal.statement!, subjectRefs: [subjectRef as `entity:${string}`], primarySubjectRef: subjectRef as `entity:${string}`, ...(temporalFor(proposal, input.asOf) === undefined ? {} : { temporal: temporalFor(proposal, input.asOf) as KnowledgeClaimV04['temporal'] }), ...(validStructuredValue(proposal.structuredValue) === undefined ? {} : { structuredValue: validStructuredValue(proposal.structuredValue) as KnowledgeClaimV04['structuredValue'] }), sourceRefs: [...new Set(sourceRefs)], provenance, confidence: proposal.confidence ?? 0.5, ...(proposal.probability === undefined ? {} : { probability: proposal.probability }), ...(supportRefs.length ? { supportsClaimRefs: [...new Set(supportRefs)] } : {}), ...(dependsRefs.length ? { dependsOnClaimRefs: [...new Set(dependsRefs)] } : {}), ...(contradictsRefs.length ? { contradictsClaimRefs: [...new Set(contradictsRefs)] } : {}), lifecycle: { status: 'active' } }
        if (!existing) { objects.set(ref, claim); operations.push({ operationId: `create-claim-${operations.length + 1}`, type: 'create', object: claim }); createdIds.push(ref); intents.push(intent(`claim-${proposal.proposalId}`, 'created_new', 'Validated semantic claim identity and created canonical Claim', { proposalId: proposal.proposalId, targetRef: ref })) }
        else if (hashKnowledgeObject(existing) !== hashKnowledgeObject(claim)) { objects.set(ref, claim); operations.push({ operationId: `update-claim-${operations.length + 1}`, type: 'update', knowledgeId: ref, expectedBeforeHash: hashKnowledgeObject(existing), object: claim }); updatedIds.push(ref); intents.push(intent(`claim-${proposal.proposalId}`, 'bound_existing', 'Deterministic claim identity matched and evidence was merged', { proposalId: proposal.proposalId, targetRef: ref })) }
        else intents.push(intent(`claim-${proposal.proposalId}`, 'bound_existing', 'Exact semantic claim already exists', { proposalId: proposal.proposalId, targetRef: ref }))
      }

      if (operations.length === 0) return { status: 'no_changes', knowledgeBaseId: input.handle.knowledgeBaseId, knowledgeBaseRevision: input.handle.revision, baseRevision: input.handle.revision, createdIds: [], updatedIds: [], sourceRefsByLocalId, claimRefsByProposalId, entityRefsByLocalKey, resolutionIntents: intents, errors: [] }

      const changeSet: KnowledgeChangeSetV04 = { changeSetId: `changeset-${input.producerType}-${sha256(JSON.stringify({ run: input.producerRunId, entity: input.entity.name, operations: operations.map((operation) => operation.operationId) })).slice(0, 20)}`, workflowRunId: input.producerRunId, knowledgeBaseId: input.handle.knowledgeBaseId, schemaVersion: '0.4', storageFormatVersion: '1', expectedBaseRevision: input.handle.revision, operations, ingestionContext: { producerType: input.producerType, producerRunId: input.producerRunId, asOf: input.asOf ?? null } }
      const validation = await validateKnowledgeChangeSetV04(input.handle, changeSet, { mode: 'commit', now })
      if (validation.report.status === 'failed' || !validation.validatedChangeSet) return errorOutcome(input, 'blocked', validation.report.errors.map((error) => `${error.code}: ${error.message}`), intents)
      const write = await writeKnowledgeBase(input.handle, validation.validatedChangeSet, { registry: this.registry, clock: now }) as KnowledgeWriteResultV04
      if (write.status === 'failed' || write.status === 'rejected') return errorOutcome(input, 'failed', [write.error?.message ?? 'Shared Writer rejected the validated ChangeSet'], intents)
      return { status: write.status, knowledgeBaseId: input.handle.knowledgeBaseId, knowledgeBaseRevision: write.committedRevision, baseRevision: input.handle.revision, changeSetId: changeSet.changeSetId, createdIds: write.createdIds, updatedIds: write.updatedIds, sourceRefsByLocalId, claimRefsByProposalId, entityRefsByLocalKey, resolutionIntents: intents, errors: [] }
    } catch (error) {
      return errorOutcome(input, 'failed', [error instanceof Error ? error.message : String(error)], intents)
    }
  }
}
