import { resolve } from 'node:path'
import { KnowledgeBaseRegistry } from '../../knowledge/registry/registry.ts'
import { KnowledgeProductionGateway, type KnowledgeProductionGateway as Gateway } from '../../knowledge/production/gateway.ts'
import { readCanonicalV04Assets } from '../../knowledge/storage/canonical-v04-loader.ts'
import type { KnowledgeAssetV04, KnowledgeClaimV04, KnowledgeEntityV04, KnowledgeObservationV04, KnowledgeSourceV04, RawRefV04 } from '../../knowledge/schema/domain-v04.ts'
import type { ReasoningExecutor } from '../../plugins/reasoning/contracts.ts'
import { verifyRaw } from '../../knowledge/raw/raw-archive.ts'
import { executeThesisFormalize } from '../../skills/thesis_formalize/semantic.ts'
import type { ThesisCreateCanonicalEvidenceBinding } from '../../workflows/thesis-lifecycle/create-production.ts'
import { createThesisProduction } from '../../workflows/thesis-lifecycle/create-production.ts'
import { ApplicationServiceError } from './contracts.ts'

export interface ThesisCreateInput {
  readonly workflowRunId: string
  readonly companyRef: `entity:${string}`
  readonly thesisTitle: string
  readonly narrative: string
  readonly evidenceRefs: readonly (`claim:${string}` | `observation:${string}`)[]
  readonly asOf: string
}

export interface ThesisCreateEvidenceDecision {
  readonly evidenceRef: string
  readonly decision: 'included' | 'excluded'
  readonly reason?: string
  readonly publishedAt?: string
  readonly sourceBindings: readonly { readonly sourceRef: string; readonly rawRef: string }[]
}

/** Bounded, report-ready ApplicationService result. The owning service persists it as a ResearchReport. */
export interface ThesisCreateServiceResult {
  readonly mode: 'CREATE'
  readonly runId: string
  readonly status: 'completed' | 'blocked' | 'failed'
  readonly companyRef: string
  readonly thesisTitle: string
  readonly asOf: string
  readonly thesisSummary?: string
  readonly thesisRef?: string
  readonly thesisInitialStatus?: 'active'
  readonly claimRefsByPropositionRef: Readonly<Record<string, string>>
  readonly qualifiesEdgeRefsByPropositionRef: Readonly<Record<string, string>>
  readonly evidenceRefsByPropositionRef: Readonly<Record<string, readonly string[]>>
  readonly membershipBindingConvention: 'claim_to_thesis_qualifies'
  readonly evidenceDecisions: readonly ThesisCreateEvidenceDecision[]
  readonly researchGaps: readonly { readonly gapId: string; readonly statement: string; readonly affectedPropositionRefs: readonly string[] }[]
  readonly knowledgeBaseId?: string
  readonly baseRevision?: number
  readonly committedRevision?: number
  readonly writerRunId?: string
  readonly diagnostics: readonly string[]
}

export interface ThesisCreateServiceOptions {
  readonly mountedKnowledgeBaseRoot: string
  readonly reasoningExecutor?: ReasoningExecutor
  readonly gateway?: Gateway
  readonly now?: () => string
}

const RUN_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,95}$/
const EVIDENCE_REF = /^(?:claim|observation):[A-Za-z0-9][A-Za-z0-9._-]*$/
const MAX_EVIDENCE = 40
const MAX_NARRATIVE = 8_000
const MAX_TITLE = 240
const isoDate = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value))
const sortedUnique = (values: readonly string[]): string[] => [...new Set(values)].sort((a, b) => a.localeCompare(b))

function normalize(input: ThesisCreateInput): ThesisCreateInput {
  if (!input || !RUN_ID.test(input.workflowRunId) || input.workflowRunId.includes('..')) throw new ApplicationServiceError('invalid_input', 'workflowRunId is invalid')
  if (typeof input.companyRef !== 'string' || !/^entity:[A-Za-z0-9][A-Za-z0-9._-]*$/.test(input.companyRef)) throw new ApplicationServiceError('invalid_input', 'companyRef must be a canonical Entity ref')
  if (typeof input.thesisTitle !== 'string' || !input.thesisTitle.trim() || input.thesisTitle.trim().length > MAX_TITLE) throw new ApplicationServiceError('invalid_input', 'thesisTitle must contain 1 to 240 characters')
  if (typeof input.narrative !== 'string' || !input.narrative.trim() || input.narrative.length > MAX_NARRATIVE) throw new ApplicationServiceError('invalid_input', 'narrative must contain 1 to 8000 characters')
  if (!Array.isArray(input.evidenceRefs) || input.evidenceRefs.length === 0 || input.evidenceRefs.length > MAX_EVIDENCE || input.evidenceRefs.some((ref) => typeof ref !== 'string' || !EVIDENCE_REF.test(ref)) || new Set(input.evidenceRefs).size !== input.evidenceRefs.length) throw new ApplicationServiceError('invalid_input', `evidenceRefs must contain 1 to ${MAX_EVIDENCE} unique canonical Claim/Observation refs`)
  if (!isoDate(input.asOf)) throw new ApplicationServiceError('invalid_input', 'asOf must be an ISO timestamp')
  return { ...input, thesisTitle: input.thesisTitle.trim(), narrative: input.narrative.trim(), evidenceRefs: sortedUnique(input.evidenceRefs) as ThesisCreateInput['evidenceRefs'] }
}

function activeAt(asset: { readonly lifecycle?: { readonly status?: string; readonly validFrom?: string | null; readonly validUntil?: string | null } }, time: number): boolean {
  if (asset.lifecycle?.status !== 'active') return false
  const from = asset.lifecycle.validFrom == null ? undefined : Date.parse(asset.lifecycle.validFrom)
  const until = asset.lifecycle.validUntil == null ? undefined : Date.parse(asset.lifecycle.validUntil)
  return (from === undefined || (Number.isFinite(from) && from <= time)) && (until === undefined || (Number.isFinite(until) && until > time))
}

interface AdmittedEvidence {
  readonly ref: `claim:${string}` | `observation:${string}`
  readonly statement: string
  readonly publishedAt: string
  readonly binding: ThesisCreateCanonicalEvidenceBinding
}

function evidenceStatement(value: KnowledgeClaimV04 | KnowledgeObservationV04): string {
  if (value.id.startsWith('claim:')) return (value as KnowledgeClaimV04).statement
  const observation = value as KnowledgeObservationV04
  if (observation.observationType === 'metric') return `Observed ${observation.metricRef}=${String(observation.value)}${observation.unit ? ` ${observation.unit}` : ''}${observation.period ? ` for ${observation.period}` : ''}.`
  if (observation.observationType === 'estimate') return `Estimate ${observation.metricRef}=${String(observation.estimateValue)}${observation.unit ? ` ${observation.unit}` : ''} for ${observation.fiscalPeriod}.`
  return `Consensus ${observation.metricRef} mean=${observation.mean} for ${observation.fiscalPeriod} as of ${observation.asOf}.`
}

async function admitEvidence(handle: Awaited<ReturnType<KnowledgeBaseRegistry['mount']>>, input: ThesisCreateInput, assets: readonly KnowledgeAssetV04[], now: string): Promise<{ readonly evidence: readonly AdmittedEvidence[]; readonly decisions: readonly ThesisCreateEvidenceDecision[] }> {
  const byId = new Map(assets.map((asset) => [asset.id, asset]))
  const asOfTime = Date.parse(input.asOf)
  const nowTime = Date.parse(now)
  const admitted: AdmittedEvidence[] = []
  const decisions: ThesisCreateEvidenceDecision[] = []
  for (const evidenceRef of input.evidenceRefs) {
    const evidence = byId.get(evidenceRef) as KnowledgeClaimV04 | KnowledgeObservationV04 | undefined
    if (!evidence || !(evidence.id.startsWith('claim:') || evidence.id.startsWith('observation:'))) throw new ApplicationServiceError('not_found', `Canonical evidence not found: ${evidenceRef}`)
    const scopeValid = evidence.id.startsWith('claim:')
      ? (evidence as KnowledgeClaimV04).subjectRefs.includes(input.companyRef)
      : (evidence as KnowledgeObservationV04).subjectRef === input.companyRef
    if (!scopeValid || !activeAt(evidence, nowTime) || !activeAt(evidence, asOfTime)) throw new ApplicationServiceError('invalid_input', `Evidence is inactive, outside the requested company, or not active at asOf: ${evidenceRef}`)
    const pairs = (evidence.provenance ?? []).filter((pair) => evidence.id.startsWith('claim:')
      ? (evidence as KnowledgeClaimV04).sourceRefs.includes(pair.sourceRef)
      : (evidence as KnowledgeObservationV04).sourceRef === pair.sourceRef)
    const orderedPairs = [...pairs].sort((a, b) => a.sourceRef.localeCompare(b.sourceRef) || a.rawRef.localeCompare(b.rawRef))
    let selected: { source: KnowledgeSourceV04; rawRef: RawRefV04 } | undefined
    for (const pair of orderedPairs) {
      const source = byId.get(pair.sourceRef) as KnowledgeSourceV04 | undefined
      if (!source || !activeAt(source, nowTime) || !activeAt(source, asOfTime) || !source.rawRefs?.includes(pair.rawRef) || !isoDate(source.publishedAt) || Date.parse(source.publishedAt) > asOfTime) continue
      const expiresAt = source.rights.expiresAt == null ? undefined : Date.parse(source.rights.expiresAt)
      if (expiresAt !== undefined && (!Number.isFinite(expiresAt) || expiresAt <= nowTime || expiresAt <= asOfTime)) continue
      if (!['public', 'authenticated'].includes(source.rights.accessScope) || source.rights.retentionAllowed !== true || source.rights.aiProcessingAllowed !== true || source.rights.derivativeKnowledgeAllowed !== true || source.usagePolicy.retainRaw !== true || source.usagePolicy.allowAiProcessing !== true || source.usagePolicy.allowDerivedKnowledge !== true) continue
      try { await verifyRaw(handle, pair.rawRef) } catch { continue }
      selected = { source, rawRef: pair.rawRef }
      break
    }
    if (!selected) throw new ApplicationServiceError('failed', `No active, rights-admitted, PIT-valid Source/Raw binding exists for ${evidenceRef}`)
    const ref = evidenceRef as AdmittedEvidence['ref']
    const binding: ThesisCreateCanonicalEvidenceBinding = { evidenceRef: ref, sourceRef: selected.source.id, rawRef: selected.rawRef, publishedAt: selected.source.publishedAt! }
    const statement = evidenceStatement(evidence).trim()
    if (!statement) throw new ApplicationServiceError('failed', `Canonical evidence has no usable statement: ${evidenceRef}`)
    admitted.push({ ref, statement, publishedAt: binding.publishedAt, binding })
    decisions.push({ evidenceRef, decision: 'included', publishedAt: binding.publishedAt, sourceBindings: [{ sourceRef: binding.sourceRef, rawRef: binding.rawRef }] })
  }
  return { evidence: admitted, decisions }
}

export class ThesisCreateService {
  private readonly registry = new KnowledgeBaseRegistry()
  constructor(private readonly options: ThesisCreateServiceOptions) {}

  async create(rawInput: ThesisCreateInput): Promise<ThesisCreateServiceResult> {
    const input = normalize(rawInput)
    const now = this.options.now ?? (() => new Date().toISOString())
    const base: Omit<ThesisCreateServiceResult, 'status' | 'diagnostics'> = {
      mode: 'CREATE', runId: input.workflowRunId, companyRef: input.companyRef, thesisTitle: input.thesisTitle, asOf: input.asOf,
      claimRefsByPropositionRef: {}, qualifiesEdgeRefsByPropositionRef: {}, evidenceRefsByPropositionRef: {}, membershipBindingConvention: 'claim_to_thesis_qualifies', evidenceDecisions: [], researchGaps: [],
    }
    if (!this.options.reasoningExecutor) return { ...base, status: 'blocked', diagnostics: ['THESIS_CREATE_REASONING_EXECUTOR_MISSING'] }
    try {
      const handle = await this.registry.mount(resolve(this.options.mountedKnowledgeBaseRoot))
      if (handle.schemaVersion !== '0.4' || handle.storageFormatVersion !== '1') return { ...base, status: 'blocked', diagnostics: ['THESIS_CREATE_REQUIRES_KB_V04'] }
      const loaded = await readCanonicalV04Assets(handle.rootRef)
      const byId = new Map(loaded.objects.map((item) => [item.value.id, item.value]))
      const company = byId.get(input.companyRef) as KnowledgeEntityV04 | undefined
      const currentTime = Date.parse(now())
      if (Date.parse(input.asOf) > currentTime) return { ...base, status: 'blocked', knowledgeBaseId: handle.knowledgeBaseId, baseRevision: handle.revision, diagnostics: ['THESIS_CREATE_AS_OF_IN_FUTURE'] }
      if (!company || company.type !== 'company' || !activeAt(company, currentTime) || typeof (company as { ticker?: unknown }).ticker !== 'string' || !(company as { ticker: string }).ticker.trim()) return { ...base, status: 'blocked', knowledgeBaseId: handle.knowledgeBaseId, baseRevision: handle.revision, diagnostics: ['THESIS_CREATE_COMPANY_REF_INVALID'] }
      const admitted = await admitEvidence(handle, input, loaded.objects.map((item) => item.value), now())
      const formalized = await executeThesisFormalize({
        narrative: input.narrative,
        evidence: admitted.evidence.map(({ ref, statement, publishedAt }) => ({ evidenceId: ref, statement, sourceRefs: [ref], publishedAt, basisHint: 'verified_evidence' as const })),
        thesisId: input.workflowRunId,
        asOf: input.asOf,
      }, this.options.reasoningExecutor)
      if (formalized.status !== 'complete' || !formalized.result || formalized.result.status === 'blocked') return { ...base, status: 'blocked', knowledgeBaseId: handle.knowledgeBaseId, baseRevision: handle.revision, evidenceDecisions: admitted.decisions, diagnostics: formalized.diagnostics.length ? formalized.diagnostics.slice(0, 16) : ['THESIS_CREATE_FORMALIZATION_BLOCKED'] }
      const allowedEvidence = new Set(admitted.evidence.map((item) => item.ref))
      for (const proposition of formalized.result.propositions) {
        if (proposition.sourceRefs.length === 0 || proposition.sourceRefs.some((ref) => !allowedEvidence.has(ref as AdmittedEvidence['ref']))) return { ...base, status: 'blocked', knowledgeBaseId: handle.knowledgeBaseId, baseRevision: handle.revision, evidenceDecisions: admitted.decisions, diagnostics: [`THESIS_CREATE_PROPOSITION_EVIDENCE_UNBOUND:${proposition.propositionId}`] }
      }
      const production = await createThesisProduction({
        handle,
        producerRunId: input.workflowRunId,
        thesisTitle: input.thesisTitle,
        formalization: formalized.result,
        evidenceBindings: [],
        existingEvidenceBindings: admitted.evidence.map((item) => item.binding),
        companyEntityRef: input.companyRef,
        asOf: input.asOf,
        now,
        gateway: this.options.gateway ?? new KnowledgeProductionGateway(),
      })
      const blocked = production.status === 'blocked' || production.status === 'failed'
      return {
        ...base,
        status: blocked ? (production.status === 'failed' ? 'failed' : 'blocked') : 'completed',
        thesisRef: production.thesisRef,
        ...(production.thesisRef ? { thesisSummary: formalized.result.summary, thesisInitialStatus: 'active' as const } : {}),
        claimRefsByPropositionRef: production.claimRefsByPropositionRef,
        qualifiesEdgeRefsByPropositionRef: production.qualifiesEdgeRefsByPropositionRef,
        evidenceRefsByPropositionRef: Object.fromEntries(formalized.result.propositions.map((item) => [item.propositionId, item.sourceRefs.slice(0, MAX_EVIDENCE)])),
        evidenceDecisions: admitted.decisions,
        researchGaps: formalized.result.researchGaps.map((gap) => ({ gapId: gap.gapId, statement: gap.statement.slice(0, 2_000), affectedPropositionRefs: gap.affectedPropositionRefs ?? [] })).slice(0, 40),
        knowledgeBaseId: handle.knowledgeBaseId,
        baseRevision: handle.revision,
        ...(production.gatewayOutcome ? { committedRevision: production.gatewayOutcome.knowledgeBaseRevision, writerRunId: input.workflowRunId } : {}),
        diagnostics: production.diagnostics.slice(0, 24),
      }
    } catch (error) {
      const diagnostic = error instanceof ApplicationServiceError ? `THESIS_CREATE_${error.code.toUpperCase()}` : 'THESIS_CREATE_SERVICE_FAILED'
      return { ...base, status: 'blocked', diagnostics: [diagnostic] }
    }
  }
}
