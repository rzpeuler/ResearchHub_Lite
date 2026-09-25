import { createHash } from 'node:crypto'
import { lstat, readFile, realpath } from 'node:fs/promises'
import { join, sep } from 'node:path'
import type { FormalizedThesisProposition, FormalizedThesisResult } from '../../skills/thesis_formalize/contracts.ts'
import { formalizeThesis } from '../../skills/thesis_formalize/calculations.ts'
import type { KnowledgeBaseHandle } from '../../knowledge/storage/handle.ts'
import { readCanonicalV04Assets } from '../../knowledge/storage/canonical-v04-loader.ts'
import type { KnowledgeAssetV04, KnowledgeClaimV04, KnowledgeEntityV04, KnowledgeReasoningEdgeV04, KnowledgeSourceV04, KnowledgeThesisV04, RawRefV04 } from '../../knowledge/schema/domain-v04.ts'
import { hashKnowledgeObject } from '../../knowledge/storage/canonical-hash.ts'
import { allocateKnowledgeId, normalizeSemanticText } from '../../knowledge/registry/id-allocation.ts'
import { KnowledgeProductionGateway } from '../../knowledge/production/gateway.ts'
import type { KnowledgeProductionOutcome, ProductionEvidenceBinding, SemanticProductionInputProposal } from '../../knowledge/production/contracts.ts'
import { validateUsableAcquisitionPayload } from '../../plugins/research-acquisition/payload-validation.ts'
import { sha256 } from '../../plugins/research-acquisition/hash.ts'
import { verifyRaw } from '../../knowledge/raw/raw-archive.ts'

export interface ThesisCreateProductionInput {
  readonly handle: KnowledgeBaseHandle
  readonly producerRunId: string
  readonly thesisTitle: string
  readonly formalization: FormalizedThesisResult
  readonly evidenceBindings: readonly ProductionEvidenceBinding[]
  /** Canonical evidence-to-Source/Raw bindings verified by the ApplicationService. */
  readonly existingEvidenceBindings?: readonly ThesisCreateCanonicalEvidenceBinding[]
  readonly companyEntityRef: `entity:${string}`
  readonly asOf: string
  readonly now?: () => string
  readonly gateway?: KnowledgeProductionGateway
}

export interface ThesisCreateCanonicalEvidenceBinding {
  readonly evidenceRef: `claim:${string}` | `observation:${string}`
  readonly sourceRef: `source:${string}`
  readonly rawRef: RawRefV04
  readonly publishedAt: string
}

export interface ThesisCreateProductionResult {
  readonly status: 'committed' | 'already_committed' | 'blocked' | 'failed'
  readonly thesisRef?: string
  readonly claimRefsByPropositionRef: Readonly<Record<string, string>>
  readonly qualifiesEdgeRefsByPropositionRef: Readonly<Record<string, string>>
  readonly gatewayOutcome?: KnowledgeProductionOutcome
  readonly diagnostics: readonly string[]
}

const block = (diagnostic: string): ThesisCreateProductionResult => ({ status: 'blocked', claimRefsByPropositionRef: {}, qualifiesEdgeRefsByPropositionRef: {}, diagnostics: [diagnostic] })
const safeRunId = /^[A-Za-z0-9][A-Za-z0-9._-]*$/
const activeAt = (entity: KnowledgeEntityV04, at: number): boolean => {
  const lifecycle = entity.lifecycle
  if (lifecycle?.status !== 'active') return false
  const from = lifecycle.validFrom == null ? undefined : Date.parse(lifecycle.validFrom)
  const until = lifecycle.validUntil == null ? undefined : Date.parse(lifecycle.validUntil)
  return (from === undefined || (Number.isFinite(from) && from <= at)) && (until === undefined || (Number.isFinite(until) && until > at))
}
const safeProposalId = (value: unknown): string => `thesis-${createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 32)}`

function claimTypeFor(proposition: FormalizedThesisProposition): 'fact' | 'forecast' | 'viewpoint' | 'risk' | 'assumption' | 'catalyst' | undefined {
  if (proposition.propositionType === 'catalyst') return 'catalyst'
  if (proposition.propositionType === 'risk') return 'risk'
  if (proposition.propositionType === 'earnings_expectation' || proposition.propositionType === 'valuation_expectation') return 'forecast'
  if (proposition.basis === 'verified_evidence') return 'fact'
  if (proposition.basis === 'inference') return 'viewpoint'
  if (proposition.basis === 'hypothesis') return 'assumption'
  return undefined
}

function canonicalFormalization(result: FormalizedThesisResult): FormalizedThesisResult {
  if (!result || !Array.isArray(result.propositions)) throw new Error('THESIS_FORMALIZATION_MISSING')
  return formalizeThesis({
    thesisId: result.thesisId,
    ...(result.localRef === undefined ? {} : { localRef: result.localRef }),
    summary: result.summary,
    propositions: result.propositions,
    researchGaps: result.researchGaps,
    ...(result.asOf === undefined ? {} : { asOf: result.asOf }),
  })
}

function mapSourceBindings(propositions: readonly FormalizedThesisProposition[], bindings: readonly ProductionEvidenceBinding[], existingBindings: readonly ThesisCreateCanonicalEvidenceBinding[], asOf: string): Map<string, ProductionEvidenceBinding> {
  const byRef = new Map<string, ProductionEvidenceBinding>()
  const existingRefs = new Set<string>(existingBindings.map((binding) => binding.evidenceRef))
  const asOfTime = Date.parse(asOf)
  if (!Number.isFinite(asOfTime)) throw new Error('THESIS_CREATE_AS_OF_INVALID')
  for (const binding of bindings) {
    const { source } = binding
    if (!binding.localSourceId.trim() || validateUsableAcquisitionPayload(source.content).status !== 'usable' || !['public', 'authenticated'].includes(source.rights.accessScope) || source.rights.retentionAllowed !== true || source.rights.aiProcessingAllowed !== true || source.rights.derivativeKnowledgeAllowed !== true) throw new Error('THESIS_CREATE_SOURCE_NOT_ADMITTED')
    const publishedAt = source.candidate.publishedAt
    if (!publishedAt || !Number.isFinite(Date.parse(publishedAt)) || Date.parse(publishedAt) > asOfTime) throw new Error('THESIS_CREATE_SOURCE_PIT_INVALID')
    for (const ref of [binding.localSourceId, source.candidate.candidateId]) {
      const prior = byRef.get(ref)
      if (prior && prior !== binding) throw new Error('THESIS_CREATE_SOURCE_REF_AMBIGUOUS')
      byRef.set(ref, binding)
    }
  }
  for (const proposition of propositions) {
    if (proposition.sourceRefs.length === 0) throw new Error(`THESIS_CREATE_BASIS_WITHOUT_EVIDENCE:${proposition.propositionId}`)
    for (const ref of proposition.sourceRefs) if (!byRef.has(ref) && !existingRefs.has(ref)) throw new Error(`THESIS_CREATE_SOURCE_BINDING_MISSING:${proposition.propositionId}:${ref}`)
  }
  return byRef
}

function canonicalEvidenceFor(proposition: FormalizedThesisProposition, bindings: readonly ThesisCreateCanonicalEvidenceBinding[]): ThesisCreateCanonicalEvidenceBinding[] {
  const byRef = new Map<string, ThesisCreateCanonicalEvidenceBinding>(bindings.map((binding) => [binding.evidenceRef, binding]))
  return [...new Map(proposition.sourceRefs.flatMap((ref) => { const binding = byRef.get(ref); return binding ? [[`${binding.sourceRef}|${binding.rawRef}`, binding] as const] : [] })).values()]
}

async function validateCanonicalEvidence(input: ThesisCreateProductionInput, formalization: FormalizedThesisResult): Promise<void> {
  const bindings = input.existingEvidenceBindings ?? []
  if (bindings.length === 0) return
  const assets = await readCanonicalV04Assets(input.handle.rootRef)
  const byId = new Map<string, KnowledgeAssetV04>(assets.objects.map((item) => [item.value.id, item.value]))
  const asOf = Date.parse(input.asOf)
  const seen = new Set<string>()
  for (const binding of bindings) {
    if (seen.has(binding.evidenceRef) || !Number.isFinite(Date.parse(binding.publishedAt)) || Date.parse(binding.publishedAt) > asOf) throw new Error('THESIS_CREATE_CANONICAL_EVIDENCE_PIT_INVALID')
    seen.add(binding.evidenceRef)
    const evidence = byId.get(binding.evidenceRef) as (KnowledgeClaimV04 | import('../../knowledge/schema/domain-v04.ts').KnowledgeObservationV04) | undefined
    const source = byId.get(binding.sourceRef) as KnowledgeSourceV04 | undefined
    const evidenceBindings = evidence?.provenance ?? []
    const evidenceOwnsSource = evidence?.id.startsWith('observation:')
      ? (evidence as import('../../knowledge/schema/domain-v04.ts').KnowledgeObservationV04).sourceRef === binding.sourceRef
      : Boolean(evidence && (evidence as KnowledgeClaimV04).sourceRefs.includes(binding.sourceRef))
    if (!evidence || !['claim:', 'observation:'].some((prefix) => evidence.id.startsWith(prefix)) || evidence.lifecycle?.status !== 'active' || !evidenceOwnsSource || !evidenceBindings.some((item) => item.sourceRef === binding.sourceRef && item.rawRef === binding.rawRef)) throw new Error('THESIS_CREATE_CANONICAL_EVIDENCE_BINDING_INVALID')
    if (!source || source.lifecycle?.status !== 'active' || !source.rawRefs?.includes(binding.rawRef) || source.publishedAt !== binding.publishedAt || !['public', 'authenticated'].includes(source.rights.accessScope) || source.rights.retentionAllowed !== true || source.rights.aiProcessingAllowed !== true || source.rights.derivativeKnowledgeAllowed !== true || source.usagePolicy?.retainRaw !== true || source.usagePolicy.allowAiProcessing !== true || source.usagePolicy.allowDerivedKnowledge !== true) throw new Error('THESIS_CREATE_CANONICAL_SOURCE_NOT_ADMITTED')
    await verifyRaw(input.handle, binding.rawRef)
  }
  for (const proposition of formalization.propositions) for (const ref of proposition.sourceRefs) {
    if (bindings.some((binding) => binding.evidenceRef === ref)) continue
    if (!(input.evidenceBindings ?? []).some((binding) => binding.localSourceId === ref || binding.source.candidate.candidateId === ref)) throw new Error(`THESIS_CREATE_CANONICAL_EVIDENCE_UNBOUND:${ref}`)
  }
}

function expectedSourceIdentity(binding: ProductionEvidenceBinding, ticker: string): string {
  const source = binding.source
  const metadata = source.candidate.metadata ?? {}
  const identity = {
    provider: normalizeSemanticText(source.candidate.provider), kind: source.candidate.kind,
    dataset: metadata.dataset ?? metadata.dataKind ?? source.candidate.kind,
    company: metadata.companySymbol ?? ticker ?? null,
    query: metadata.query ?? metadata.period ?? metadata.startDate ?? null,
    url: source.canonicalUrl ?? source.candidate.url ?? null,
    publishedAt: source.candidate.publishedAt ?? null,
    title: source.title,
    metadata: Object.fromEntries(Object.entries(metadata).filter(([key]) => !['retrievedAt', 'requestId'].includes(key)).sort()),
  }
  return hashKnowledgeObject(identity)
}

async function committedReplay(input: ThesisCreateProductionInput, company: KnowledgeEntityV04 & { ticker: string }, formalization: FormalizedThesisResult, sourceBindings: Map<string, ProductionEvidenceBinding>): Promise<ThesisCreateProductionResult | undefined> {
  let log: Record<string, unknown>
  const logsRoot = join(input.handle.rootRef, 'logs')
  const researchRoot = join(logsRoot, 'research')
  const logPath = join(researchRoot, `${input.producerRunId}.yaml`)
  try {
    for (const directory of [logsRoot, researchRoot]) {
      const stat = await lstat(directory)
      if (stat.isSymbolicLink() || !stat.isDirectory()) return block('THESIS_CREATE_REPLAY_LOG_PATH_INVALID')
    }
    const stat = await lstat(logPath)
    if (stat.isSymbolicLink() || !stat.isFile()) return block('THESIS_CREATE_REPLAY_LOG_PATH_INVALID')
    const [rootReal, logReal] = await Promise.all([realpath(input.handle.rootRef), realpath(logPath)])
    if (!logReal.startsWith(`${rootReal}${sep}`)) return block('THESIS_CREATE_REPLAY_LOG_PATH_INVALID')
    log = JSON.parse(await readFile(logPath, 'utf8')) as Record<string, unknown>
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
    return block('THESIS_CREATE_REPLAY_LOG_UNREADABLE')
  }
  const context = log.ingestionContext as Record<string, unknown> | undefined
  if (log.workflowRunId !== input.producerRunId || log.knowledgeBaseId !== input.handle.knowledgeBaseId || log.status !== 'completed' || context?.producerType !== 'thesis_lifecycle_create' || context.asOf !== input.asOf) return block('THESIS_CREATE_REPLAY_CONFLICT')

  try {
    const assets = await readCanonicalV04Assets(input.handle.rootRef)
    const byId = new Map<string, KnowledgeAssetV04>(assets.objects.map((item) => [item.value.id, item.value]))
    const thesisRef = allocateKnowledgeId('thesis', { subjectRefs: [input.companyEntityRef], title: input.thesisTitle.trim() })
    const thesis = byId.get(thesisRef) as KnowledgeThesisV04 | undefined
    if (!thesis || thesis.title !== input.thesisTitle.trim() || thesis.statement !== formalization.summary || thesis.status !== 'active' || thesis.subjectRefs.length !== 1 || thesis.subjectRefs[0] !== input.companyEntityRef) return block('THESIS_CREATE_REPLAY_CONFLICT')
    const sourceRefByBinding = new Map<ProductionEvidenceBinding, string>()
    const rawRefByBinding = new Map<ProductionEvidenceBinding, RawRefV04>()
    for (const binding of new Set(sourceBindings.values())) {
      const identity = expectedSourceIdentity(binding, company.ticker)
      const sourceRef = `source:research-${identity.slice(7, 23)}`
      const source = byId.get(sourceRef) as KnowledgeSourceV04 | undefined
      const bytes = binding.source.rawBytes === undefined ? new TextEncoder().encode(binding.source.content) : Uint8Array.from(binding.source.rawBytes)
      const rawRef = `raw-sha256-${sha256(bytes)}`
      if (!source || source.metadata?.researchSourceIdentity !== identity || !source.rawRefs?.includes(rawRef as RawRefV04)) return block('THESIS_CREATE_REPLAY_CONFLICT')
      await verifyRaw(input.handle, rawRef)
      sourceRefByBinding.set(binding, sourceRef)
      rawRefByBinding.set(binding, rawRef as RawRefV04)
    }
    const canonicalEvidence = input.existingEvidenceBindings ?? []
    for (const binding of canonicalEvidence) {
      const source = byId.get(binding.sourceRef) as KnowledgeSourceV04 | undefined
      if (!source?.rawRefs?.includes(binding.rawRef) || source.publishedAt !== binding.publishedAt) return block('THESIS_CREATE_REPLAY_CONFLICT')
      await verifyRaw(input.handle, binding.rawRef)
    }
    const claimRefsByPropositionRef: Record<string, string> = {}
    const qualifiesEdgeRefsByPropositionRef: Record<string, string> = {}
    const propositionsById = new Map(formalization.propositions.map((proposition) => [proposition.propositionId, proposition]))
    for (const proposition of formalization.propositions) {
      const claimType = claimTypeFor(proposition)
      if (!claimType) return block(`THESIS_CREATE_BASIS_UNMAPPABLE:${proposition.propositionId}`)
      const claimRef = allocateKnowledgeId('claim', { claimType, statement: normalizeSemanticText(proposition.statement), subjectRefs: [input.companyEntityRef], temporal: { asOf: input.asOf }, structuredValue: null }).replace('claim:', 'claim:research-')
      const claim = byId.get(claimRef) as KnowledgeClaimV04 | undefined
      const existingPairs = canonicalEvidenceFor(proposition, canonicalEvidence)
      const expectedSourceRefs = [...new Set([
        ...proposition.sourceRefs.flatMap((ref) => { const binding = sourceBindings.get(ref); return binding ? [sourceRefByBinding.get(binding)!] : [] }),
        ...existingPairs.map((binding) => binding.sourceRef),
      ])].sort((a, b) => a.localeCompare(b))
      const expectedProvenance = [...new Set([
        ...proposition.sourceRefs.flatMap((ref) => { const binding = sourceBindings.get(ref); return binding ? [`${sourceRefByBinding.get(binding)}|${rawRefByBinding.get(binding)}`] : [] }),
        ...existingPairs.map((binding) => `${binding.sourceRef}|${binding.rawRef}`),
      ])].sort()
      const actualProvenance = (claim?.provenance ?? []).map((item) => `${item.sourceRef}|${item.rawRef}`).sort()
      if (!claim || claim.claimType !== claimType || claim.statement !== proposition.statement.trim() || claim.lifecycle.status !== 'active' || JSON.stringify([...claim.sourceRefs].sort()) !== JSON.stringify(expectedSourceRefs) || JSON.stringify(actualProvenance) !== JSON.stringify(expectedProvenance)) return block('THESIS_CREATE_REPLAY_CONFLICT')
      const expectedClaimRef = (ref: string): string => {
        const dependency = propositionsById.get(ref)!
        return allocateKnowledgeId('claim', { claimType: claimTypeFor(dependency), statement: normalizeSemanticText(dependency.statement), subjectRefs: [input.companyEntityRef], temporal: { asOf: input.asOf }, structuredValue: null }).replace('claim:', 'claim:research-')
      }
      const expectedDependencies = proposition.dependsOnPropositionRefs.map(expectedClaimRef).sort()
      const expectedSupports = proposition.supportingPropositionRefs.map(expectedClaimRef).sort()
      if (JSON.stringify([...(claim.dependsOnClaimRefs ?? [])].sort()) !== JSON.stringify(expectedDependencies) || JSON.stringify([...(claim.supportsClaimRefs ?? [])].sort()) !== JSON.stringify(expectedSupports)) return block('THESIS_CREATE_REPLAY_CONFLICT')
      const edgeRef = allocateKnowledgeId('reasoning-edge', { type: 'qualifies', sourceRef: claimRef, targetRef: thesisRef })
      const edge = byId.get(edgeRef) as KnowledgeReasoningEdgeV04 | undefined
      if (!edge || edge.type !== 'qualifies' || edge.sourceRef !== claimRef || edge.targetRef !== thesisRef || edge.lifecycle.status !== 'active' || JSON.stringify([...(edge.sourceRefs ?? [])].sort()) !== JSON.stringify(expectedSourceRefs)) return block('THESIS_CREATE_REPLAY_CONFLICT')
      claimRefsByPropositionRef[proposition.propositionId] = claimRef
      qualifiesEdgeRefsByPropositionRef[proposition.propositionId] = edgeRef
    }
    return { status: 'already_committed', thesisRef, claimRefsByPropositionRef, qualifiesEdgeRefsByPropositionRef, diagnostics: [] }
  } catch { return block('THESIS_CREATE_REPLAY_CANONICAL_VERIFICATION_FAILED') }
}

/** Build, submit, and verify one bounded CREATE write through KnowledgeProductionGateway. */
export async function createThesisProduction(input: ThesisCreateProductionInput): Promise<ThesisCreateProductionResult> {
  let formalization: FormalizedThesisResult
  try { formalization = canonicalFormalization(input.formalization) } catch (error) { return block(error instanceof Error ? error.message : 'THESIS_FORMALIZATION_INVALID') }
  if (formalization.status === 'blocked' || !input.thesisTitle.trim()) return block('THESIS_CREATE_FORMALIZATION_OR_TITLE_INVALID')
  if (!safeRunId.test(input.producerRunId) || input.producerRunId.includes('..') || !Number.isFinite(Date.parse(input.asOf))) return block('THESIS_CREATE_RUN_OR_AS_OF_INVALID')
  if (formalization.asOf !== undefined && Date.parse(formalization.asOf) !== Date.parse(input.asOf)) return block('THESIS_CREATE_FORMALIZATION_AS_OF_MISMATCH')

  let sourceBindings: Map<string, ProductionEvidenceBinding>
  try {
    sourceBindings = mapSourceBindings(formalization.propositions, input.evidenceBindings, input.existingEvidenceBindings ?? [], input.asOf)
    await validateCanonicalEvidence(input, formalization)
  } catch (error) { return block(error instanceof Error ? error.message : 'THESIS_CREATE_EVIDENCE_INVALID') }

  let company: (KnowledgeEntityV04 & { ticker: string; exchange?: string }) | undefined
  try {
    const assets = await readCanonicalV04Assets(input.handle.rootRef)
    const loaded = assets.objects.find((item) => item.kind === 'entity' && item.value.id === input.companyEntityRef)?.value as KnowledgeEntityV04 | undefined
    const evaluatedAt = Date.parse((input.now ?? (() => new Date().toISOString()))())
    const ticker = (loaded as { ticker?: unknown } | undefined)?.ticker
    if (loaded?.type !== 'company' || !activeAt(loaded, evaluatedAt) || typeof ticker !== 'string' || !ticker.trim()) return block('THESIS_CREATE_COMPANY_REF_INVALID')
    company = loaded as KnowledgeEntityV04 & { ticker: string; exchange?: string }
  } catch { return block('THESIS_CREATE_COMPANY_REF_INVALID') }

  const thesisProposalId = safeProposalId({ run: input.producerRunId, thesisId: formalization.thesisId, kind: 'thesis' })
  const claimProposalIds = new Map(formalization.propositions.map((p) => [p.propositionId, safeProposalId({ run: input.producerRunId, thesisId: formalization.thesisId, propositionId: p.propositionId, kind: 'claim' })]))
  const edgeProposalIds = new Map(formalization.propositions.map((p) => [p.propositionId, safeProposalId({ run: input.producerRunId, thesisId: formalization.thesisId, propositionId: p.propositionId, kind: 'qualifies' })]))
  const claimTypesByProposition = new Map(formalization.propositions.map((proposition) => [proposition.propositionId, claimTypeFor(proposition)]))
  for (const proposition of formalization.propositions) if (!claimTypesByProposition.get(proposition.propositionId)) return block(`THESIS_CREATE_BASIS_UNMAPPABLE:${proposition.propositionId}`)
  const sourceIdsFor = (proposition: FormalizedThesisProposition): string[] => [...new Set(proposition.sourceRefs.flatMap((ref) => { const binding = sourceBindings.get(ref); return binding ? [binding.localSourceId] : [] }))].sort((a, b) => a.localeCompare(b))
  const replay = await committedReplay(input, company, formalization, sourceBindings)
  if (replay) return replay
  const proposals: SemanticProductionInputProposal[] = [
    { proposalId: thesisProposalId, kind: 'thesis', subjectKey: 'company', thesisTitle: input.thesisTitle.trim(), statement: formalization.summary, thesisStatus: 'active' },
    ...formalization.propositions.flatMap((proposition) => {
      const claimType = claimTypeFor(proposition)
      if (!claimType) return []
      return {
        proposalId: claimProposalIds.get(proposition.propositionId)!, kind: 'claim' as const, subjectKey: 'company', claimType, statement: proposition.statement.trim(),
        sourceCandidateIds: sourceIdsFor(proposition), existingEvidenceBindings: canonicalEvidenceFor(proposition, input.existingEvidenceBindings ?? []).map(({ sourceRef, rawRef }) => ({ sourceRef, rawRef })), temporal: { asOf: input.asOf },
        ...(proposition.dependsOnPropositionRefs.length ? { dependsOnProposalIds: proposition.dependsOnPropositionRefs.map((ref) => claimProposalIds.get(ref)!) } : {}),
        ...(proposition.supportingPropositionRefs.length ? { supportsProposalIds: proposition.supportingPropositionRefs.map((ref) => claimProposalIds.get(ref)!) } : {}),
      }
    }),
    ...formalization.propositions.map((proposition) => ({
      proposalId: edgeProposalIds.get(proposition.propositionId)!, kind: 'reasoning_edge' as const, edgeType: 'qualifies' as const,
      sourceProposalId: claimProposalIds.get(proposition.propositionId)!, targetKey: thesisProposalId, sourceCandidateIds: sourceIdsFor(proposition), existingEvidenceBindings: canonicalEvidenceFor(proposition, input.existingEvidenceBindings ?? []).map(({ sourceRef, rawRef }) => ({ sourceRef, rawRef })),
    })),
  ]
  if (proposals.length !== 1 + formalization.propositions.length * 2) return block('THESIS_CREATE_PROPOSAL_SET_INCOMPLETE')

  const outcome = await (input.gateway ?? new KnowledgeProductionGateway()).submit({
    handle: input.handle, producerType: 'thesis_lifecycle_create', producerRunId: input.producerRunId,
    schemaProfile: { schemaVersion: '0.4', storageFormatVersion: '1', requiresRawProvenance: true },
    entity: { localKey: 'company', entityType: 'company', name: company.name, aliases: company.aliases ?? [], semanticFields: { ticker: company.ticker, exchange: company.exchange }, existingEntityRef: input.companyEntityRef },
    proposals, evidenceBindings: [...new Set([...sourceBindings.values()])], asOf: input.asOf, now: input.now,
  })
  if (!['committed', 'already_committed', 'no_changes'].includes(outcome.status)) return { status: outcome.status === 'failed' ? 'failed' : 'blocked', claimRefsByPropositionRef: {}, qualifiesEdgeRefsByPropositionRef: {}, gatewayOutcome: outcome, diagnostics: outcome.errors.length ? outcome.errors : ['THESIS_CREATE_GATEWAY_DID_NOT_COMMIT'] }
  const thesisRef = outcome.thesisRefsByProposalId?.[thesisProposalId]
  const claimRefsByPropositionRef = Object.fromEntries([...claimProposalIds].flatMap(([ref, proposalId]) => { const canonicalRef = outcome.claimRefsByProposalId[proposalId]; return canonicalRef ? [[ref, canonicalRef]] : [] }))
  const qualifiesEdgeRefsByPropositionRef = Object.fromEntries([...edgeProposalIds].flatMap(([ref, proposalId]) => { const canonicalRef = outcome.reasoningEdgeRefsByProposalId?.[proposalId]; return canonicalRef ? [[ref, canonicalRef]] : [] }))
  if (!thesisRef || Object.keys(claimRefsByPropositionRef).length !== formalization.propositions.length || Object.keys(qualifiesEdgeRefsByPropositionRef).length !== formalization.propositions.length) return { status: 'blocked', claimRefsByPropositionRef, qualifiesEdgeRefsByPropositionRef, gatewayOutcome: outcome, diagnostics: ['THESIS_CREATE_CANONICAL_MAPPING_INCOMPLETE'] }

  try {
    const reloaded = await readCanonicalV04Assets(input.handle.rootRef)
    const byId = new Map<string, KnowledgeAssetV04>(reloaded.objects.map((item) => [item.value.id, item.value]))
    const thesis = byId.get(thesisRef) as unknown as { subjectRefs?: readonly string[]; title?: string } | undefined
    if (!thesis || thesis.title !== input.thesisTitle.trim() || !thesis.subjectRefs?.includes(input.companyEntityRef)) throw new Error('THESIS_CREATE_RELOAD_THESIS_MISMATCH')
    for (const proposition of formalization.propositions) {
      const claimRef = claimRefsByPropositionRef[proposition.propositionId]!
      const claim = byId.get(claimRef) as unknown as { claimType?: string; statement?: string; sourceRefs?: readonly string[] } | undefined
      if (!claim || claim.statement !== proposition.statement.trim() || claim.claimType !== claimTypeFor(proposition) || !claim.sourceRefs?.length) throw new Error(`THESIS_CREATE_RELOAD_CLAIM_MISMATCH:${proposition.propositionId}`)
      const edge = byId.get(qualifiesEdgeRefsByPropositionRef[proposition.propositionId]!) as unknown as { type?: string; sourceRef?: string; targetRef?: string } | undefined
      if (!edge || edge.type !== 'qualifies' || edge.sourceRef !== claimRef || edge.targetRef !== thesisRef) throw new Error(`THESIS_CREATE_RELOAD_EDGE_MISMATCH:${proposition.propositionId}`)
    }
  } catch (error) {
    return { status: 'failed', thesisRef, claimRefsByPropositionRef, qualifiesEdgeRefsByPropositionRef, gatewayOutcome: outcome, diagnostics: [error instanceof Error ? error.message : 'THESIS_CREATE_RELOAD_FAILED'] }
  }
  return { status: outcome.status === 'no_changes' ? 'already_committed' : outcome.status, thesisRef, claimRefsByPropositionRef, qualifiesEdgeRefsByPropositionRef, gatewayOutcome: outcome, diagnostics: [] }
}
