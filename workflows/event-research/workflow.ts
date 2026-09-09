import { KnowledgeBaseRegistry } from '../../knowledge/registry/registry.ts'
import { KnowledgeProductionGateway } from '../../knowledge/production/gateway.ts'
import type { KnowledgeAssetV04, KnowledgeEntityV04 } from '../../knowledge/schema/domain-v04.ts'
import type { KnowledgeProductionOutcome, SemanticProductionProposal } from '../../knowledge/production/contracts.ts'
import { readCanonicalV04Assets } from '../../knowledge/storage/canonical-v04-loader.ts'
import type { DailyResearchSignal, EventResearchSignalStore } from '../../plugins/daily-intelligence/contracts.ts'
import type { ResearchAcquisitionDiagnostic, ResearchAcquisitionPlugin, ResearchCompanyIdentity, ResearchSourceCandidate } from '../../plugins/research-acquisition/contracts.ts'
import { validateUsableAcquisitionPayload } from '../../plugins/research-acquisition/payload-validation.ts'
import { sha256 } from '../../plugins/research-acquisition/hash.ts'
import { normalizeExchange } from '../../skills/knowledge-curation/identity/company-identity.ts'
import { EventEvidenceAssessmentSkill, EventResearchSynthesisSkill, eventOccurrenceStructuredValue, eventResearchSectionId, filterEventResearchProposals, toEventResearchGatewayProposal } from '../../skills/event-research/index.ts'
import type { EventEvidenceAssessmentOutput, EventEvidenceSource, EventExistingKnowledgeClaim, EventResearchAnchorContext, EventResearchProposal, EventResearchSynthesisInput, EventResearchSection, EventVerificationResult } from '../../skills/event-research/contracts.ts'
import type { EventAnchor } from '../../app/services/contracts.ts'
import { EVENT_RESEARCH_REPORT_CONTRACT_NOTE, type EventAcquiredSource, type EventResearchProviderOutcome, type EventResearchReport, type EventResearchResolvedAnchor, type EventResearchTelemetry, type EventResearchWorkflowInput, type EventResearchWorkflowResult, type EventSourceRole } from './contracts.ts'

type Dict = Record<string, unknown>
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]*$/
const HTTP_URL = /^https?:\/\//i
const DEFAULT_WINDOW_DAYS = 7
const MAX_WINDOW_DAYS = 30
const PROVIDERS = ['cninfo', 'gdelt'] as const
const CLAIM_PRIORITY = new Map([['thesis', 0], ['assumption', 1], ['risk', 2], ['catalyst', 3], ['viewpoint', 4], ['trend', 5], ['fact', 6]])

function isRecord(value: unknown): value is Dict { return Boolean(value) && typeof value === 'object' && !Array.isArray(value) }
function text(value: unknown): string { return typeof value === 'string' ? value.normalize('NFKC').trim() : '' }
function normalized(value: unknown): string { return text(value).toLocaleLowerCase('en-US') }
function nowOf(input: EventResearchWorkflowInput): () => string { return input.now ?? (() => new Date().toISOString()) }
function emptyVerification(): EventVerificationResult { return { verificationLevel: 'unverified', strongVerification: false, supportingSourceCandidateIds: [], contradictingSourceCandidateIds: [] } }
function emptyReasoning(operation: 'event_evidence_assessment' | 'event_research_synthesis') { return { called: false, validated: false, applied: false, fallbackUsed: false, repairAttempts: 0, operation } as const }
function emptyOutcome(input: EventResearchWorkflowInput): KnowledgeProductionOutcome { return { status: 'no_changes', knowledgeBaseId: input.handle.knowledgeBaseId, knowledgeBaseRevision: input.handle.revision, baseRevision: input.handle.revision, createdIds: [], updatedIds: [], sourceRefsByLocalId: {}, claimRefsByProposalId: {}, entityRefsByLocalKey: {}, resolutionIntents: [], errors: [] } }
function baseTelemetry(fingerprint = '', windowDays = DEFAULT_WINDOW_DAYS, diagnostics: readonly string[] = []): EventResearchTelemetry { return { companyCoverageResolved: false, anchorResolved: false, eventFingerprint: fingerprint, eventWindowDays: windowDays, discoveredCount: 0, selectedCount: 0, normalizedCount: 0, deduplicatedCount: 0, futureFilteredCount: 0, outsideWindowFilteredCount: 0, unknownDateCount: 0, sourceRoleCounts: { anchor_context: 0, verification: 0, supporting: 0, contradicting: 0, background: 0 }, providerTransportSucceeded: { cninfo: false, gdelt: false }, providerFetchSucceeded: { cninfo: false, gdelt: false }, assessment: emptyReasoning('event_evidence_assessment'), synthesis: emptyReasoning('event_research_synthesis'), verification: emptyVerification(), verifiedFactCount: 0, contradictionCount: 0, existingKnowledgeCount: 0, proposalCandidateCount: 0, acceptedProposalCount: 0, eventOccurrenceProposalCount: 0, canonicalSourceCount: 0, canonicalClaimCount: 0, canonicalDeltaCount: 0, reportPersistence: 'deferred_report_contract', diagnostics } }
function baseResult(input: EventResearchWorkflowInput, status: EventResearchWorkflowResult['status'], telemetry = baseTelemetry()): EventResearchWorkflowResult { return { workflowRunId: input.workflowRunId, status, knowledgeBaseId: input.handle.knowledgeBaseId, knowledgeBaseRevision: input.handle.revision, proposalIds: [], committedIds: [], sourceIds: [], claimIds: [], errors: [], diagnostics: telemetry.diagnostics, providerOutcomes: [], acquiredSources: [], existingKnowledge: [], sections: [], assessments: [], resolutionIntents: [], telemetry } }
function abortIfNeeded(signal: AbortSignal | undefined): void { if (signal?.aborted) throw new Error('WORKFLOW_CANCELLED') }
function isoDate(value: unknown): string | undefined { const raw = text(value); if (!raw) return undefined; const calendar = /^(\d{4})-(\d{2})-(\d{2})(?=$|T|\s)/.exec(raw); if (calendar !== null) { const year = Number(calendar[1]); const month = Number(calendar[2]); const day = Number(calendar[3]); const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0); const daysInMonth = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1]; if (daysInMonth === undefined || day < 1 || day > daysInMonth) return undefined; if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw }
  const time = Date.parse(raw); if (Number.isNaN(time)) return undefined; return new Date(time).toISOString().slice(0, 10) }
function validDateTime(value: unknown): boolean { const raw = text(value); return raw !== '' && isoDate(raw) !== undefined && !Number.isNaN(Date.parse(raw)) }
function dayNumber(date: string): number { return Date.parse(`${date}T00:00:00.000Z`) }
function dayDistance(left: string, right: string): number { return Math.abs(dayNumber(left) - dayNumber(right)) / 86_400_000 }
function asOfDay(asOf: string): string | undefined { return isoDate(asOf) }
function inferExchange(symbol: string): string | undefined { return symbol.startsWith('6') ? 'SH' : symbol.startsWith('0') || symbol.startsWith('3') ? 'SZ' : symbol.startsWith('4') || symbol.startsWith('8') ? 'BJ' : undefined }

function normalizedCompany(input: ResearchCompanyIdentity): ResearchCompanyIdentity {
  const exchange = normalizeExchange(input.exchange ?? inferExchange(input.symbol) ?? '')
  return { symbol: input.symbol, name: input.name ?? input.symbol, exchange }
}

function canonicalUrl(value: string | undefined): string | undefined {
  if (!value || !HTTP_URL.test(value)) return undefined
  try { const url = new URL(value); url.hash = ''; url.hostname = url.hostname.toLowerCase(); return url.toString().replace(/\/$/, '') } catch { return undefined }
}

function validateAnchorShape(anchor: EventAnchor): void {
  if (!isRecord(anchor) || typeof anchor.kind !== 'string' || !['daily_signal', 'article', 'url', 'user_event'].includes(anchor.kind)) throw new Error('EVENT_ANCHOR_INVALID')
  if (anchor.kind === 'daily_signal' && (!SAFE_ID.test(anchor.signalId) || text(anchor.signalId) === '')) throw new Error('EVENT_ANCHOR_INVALID')
  if ((anchor.kind === 'article' || anchor.kind === 'url') && canonicalUrl(anchor.url) === undefined) throw new Error('EVENT_ANCHOR_INVALID')
  if (anchor.kind === 'article' && anchor.content !== undefined && text(anchor.content).length > 8_000) throw new Error('EVENT_ANCHOR_INVALID')
  if (anchor.kind === 'user_event' && (text(anchor.title) === '' || text(anchor.description) === '' || text(anchor.title).length > 500 || text(anchor.description).length > 8_000)) throw new Error('EVENT_ANCHOR_INVALID')
  const dates = anchor.kind === 'user_event' ? [anchor.eventDate] : [anchor.kind === 'daily_signal' ? undefined : anchor.publishedAt]
  if (dates.some((date) => date !== undefined && isoDate(date) === undefined)) throw new Error('EVENT_DATE_INVALID')
}

function anchorIdentity(anchor: EventAnchor, context: EventResearchAnchorContext): string {
  if (anchor.kind === 'daily_signal') return `daily_signal:${anchor.signalId}`
  if (anchor.kind === 'article' || anchor.kind === 'url') return `${anchor.kind}:${canonicalUrl(anchor.url)}`
  return `user_event:${normalized(context.title)}|${normalized(context.description)}|${context.eventDate ?? ''}`
}

async function resolveAnchor(input: EventResearchWorkflowInput, company: ResearchCompanyIdentity, asOf: string): Promise<EventResearchResolvedAnchor> {
  const anchor = input.anchor
  validateAnchorShape(anchor)
  if (anchor.kind === 'daily_signal') {
    const store: EventResearchSignalStore | undefined = input.dailySignalStore ?? input.signalStore
    const signal: DailyResearchSignal | undefined = store === undefined ? undefined : await store.getById(anchor.signalId)
    if (signal === undefined) throw new Error('EVENT_SIGNAL_NOT_FOUND')
    if (!signal.entities.includes(company.symbol)) throw new Error('EVENT_SIGNAL_COMPANY_MISMATCH')
    const publishedAt = signal.publishedAt ?? signal.discoveredAt
    const context: EventResearchAnchorContext = { kind: 'daily_signal', title: text(signal.title) || anchor.signalId, description: text(signal.narrative ?? signal.excerpt), signalId: signal.signalId, ...(canonicalUrl(signal.contentRef ?? signal.source.url) === undefined ? {} : { url: canonicalUrl(signal.contentRef ?? signal.source.url) }), ...(signal.publishedAt === undefined ? {} : { publishedAt: signal.publishedAt }), ...(isoDate(publishedAt) === undefined ? {} : { eventDate: isoDate(publishedAt) }) }
    if (context.eventDate !== undefined && context.eventDate > (asOfDay(asOf) ?? asOf)) throw new Error('EVENT_DATE_INVALID')
    return { context, sourceSignal: signal, identity: anchorIdentity(anchor, context) }
  }
  const url = anchor.kind === 'article' || anchor.kind === 'url' ? canonicalUrl(anchor.url)! : undefined
  const context: EventResearchAnchorContext = anchor.kind === 'user_event'
    ? { kind: 'user_event', title: text(anchor.title), description: text(anchor.description), ...(anchor.eventDate === undefined ? {} : { eventDate: isoDate(anchor.eventDate)! }) }
    : { kind: anchor.kind, title: text(anchor.title) || url!, ...(anchor.kind === 'article' && anchor.content !== undefined ? { description: text(anchor.content).slice(0, 1_500) } : {}), ...(url === undefined ? {} : { url }), ...(anchor.publishedAt === undefined ? {} : { publishedAt: anchor.publishedAt }), ...(anchor.publishedAt === undefined ? {} : { eventDate: isoDate(anchor.publishedAt)! }) }
  if (context.eventDate !== undefined && context.eventDate > (asOfDay(asOf) ?? asOf)) throw new Error('EVENT_DATE_INVALID')
  return { context, identity: anchorIdentity(anchor, context) }
}

function companyMatch(value: KnowledgeAssetV04, company: ResearchCompanyIdentity): value is KnowledgeEntityV04 {
  if (!value.id.startsWith('entity:')) return false
  const entity = value as KnowledgeEntityV04
  return entity.type === 'company' && normalized(entity.ticker) === normalized(company.symbol) && normalizedExchange(entity.exchange) === normalizedExchange(company.exchange)
}
function normalizedExchange(value: unknown): string { return normalizeExchange(text(value)) }

async function resolveExistingCoverage(input: EventResearchWorkflowInput, company: ResearchCompanyIdentity): Promise<{ readonly rootRef?: string; readonly claims: readonly Dict[]; readonly reason?: EventResearchWorkflowResult['blockedReason'] }> {
  const assets = await readCanonicalV04Assets(input.handle.rootRef)
  const matches = assets.objects.map((item) => item.value).filter((value): value is KnowledgeAssetV04 => isRecord(value) && companyMatch(value, company))
  if (matches.length === 0) return { claims: [], reason: 'COMPANY_COVERAGE_NOT_FOUND' }
  if (matches.length > 1) return { claims: [], reason: 'COMPANY_COVERAGE_AMBIGUOUS' }
  const rootRef = matches[0]!.id
  const projection = await new KnowledgeProductionGateway(new KnowledgeBaseRegistry()).projectExistingKnowledge(input.handle, company)
  const claims = projection.filter((value) => value.kind === 'claim' && Array.isArray(value.subjectRefs) && value.subjectRefs.includes(rootRef)).sort((left, right) => (CLAIM_PRIORITY.get(String(left.claimType)) ?? 99) - (CLAIM_PRIORITY.get(String(right.claimType)) ?? 99) || String(left.canonicalRef).localeCompare(String(right.canonicalRef))).slice(0, 60)
  return { rootRef, claims }
}

function providerName(plugin: ResearchAcquisitionPlugin): 'cninfo' | 'gdelt' | undefined { const name = plugin.name.toLocaleLowerCase('en-US'); if (name.includes('cninfo') || name.includes('official')) return 'cninfo'; if (name.includes('gdelt')) return 'gdelt'; return undefined }
function emptyProvider(provider: string, reason: string): { readonly outcome: EventResearchProviderOutcome; readonly diagnostic: ResearchAcquisitionDiagnostic } { return { outcome: { provider, providerAttempted: false, providerSucceeded: false, providerEmpty: true, providerFailed: false, usableSourceCount: 0, transportSucceeded: false, fetchSucceeded: false }, diagnostic: { provider, status: 'empty', reason } } }
function candidateDate(candidate: ResearchSourceCandidate): string | undefined { return candidate.publishedAt === undefined ? undefined : isoDate(candidate.publishedAt) }
function candidateSort(left: ResearchSourceCandidate, right: ResearchSourceCandidate): number { const l = Date.parse(left.publishedAt ?? ''); const r = Date.parse(right.publishedAt ?? ''); return (Number.isNaN(r) ? -1 : r) - (Number.isNaN(l) ? -1 : l) || left.candidateId.localeCompare(right.candidateId) }

interface AcquisitionResult { readonly sources: readonly EventAcquiredSource[]; readonly outcomes: readonly EventResearchProviderOutcome[]; readonly diagnostics: readonly ResearchAcquisitionDiagnostic[]; readonly discoveredCount: number; readonly selectedCount: number; readonly futureFilteredCount: number; readonly outsideWindowFilteredCount: number; readonly unknownDateCount: number; readonly deduplicatedCount: number }

async function acquireEventSources(input: EventResearchWorkflowInput, company: ResearchCompanyIdentity, context: EventResearchAnchorContext, asOf: string, windowDays: number): Promise<AcquisitionResult> {
  const diagnostics: ResearchAcquisitionDiagnostic[] = []; const outcomes: EventResearchProviderOutcome[] = []; const acquired: EventAcquiredSource[] = []; const urls = new Set<string>(); const hashes = new Set<string>(); let discoveredCount = 0; let selectedCount = 0; let futureFilteredCount = 0; let outsideWindowFilteredCount = 0; let unknownDateCount = 0; let deduplicatedCount = 0
  for (const provider of PROVIDERS) {
    abortIfNeeded(input.signal)
    const plugin = input.acquisitionPlugins.find((candidate) => providerName(candidate) === provider)
    if (!plugin) { const missing = emptyProvider(provider, `${provider} acquisition plugin is not configured`); outcomes.push(missing.outcome); diagnostics.push(missing.diagnostic); continue }
    let discovered: readonly ResearchSourceCandidate[] = []
    try { discovered = await plugin.discover({ company, asOf, limitPerKind: 6 }); discoveredCount += discovered.length } catch (error) { const reason = error instanceof Error ? error.message : String(error); outcomes.push({ provider, providerAttempted: true, providerSucceeded: false, providerEmpty: false, providerFailed: true, usableSourceCount: 0, transportSucceeded: false, fetchSucceeded: false }); diagnostics.push({ provider, status: 'failed', reason }); continue }
    const candidates: ResearchSourceCandidate[] = []
    for (const candidate of [...discovered].filter((item) => item.provider.toLocaleLowerCase('en-US') === provider).sort(candidateSort)) {
      const symbol = candidate.metadata?.companySymbol
      if (typeof symbol === 'string' && symbol !== company.symbol) continue
      const published = candidateDate(candidate)
      if (candidate.publishedAt !== undefined && published === undefined) { diagnostics.push({ provider, candidateId: candidate.candidateId, kind: candidate.kind, status: 'empty', reason: 'invalid publication date' }); continue }
      if (candidate.publishedAt !== undefined && Date.parse(candidate.publishedAt) > Date.parse(asOf)) { futureFilteredCount++; continue }
      if (published === undefined) unknownDateCount++
      if (published !== undefined && context.eventDate !== undefined && dayDistance(published, context.eventDate) > windowDays) { outsideWindowFilteredCount++; continue }
      if (candidate.url !== undefined && canonicalUrl(candidate.url) === undefined) { diagnostics.push({ provider, candidateId: candidate.candidateId, kind: candidate.kind, status: 'empty', reason: 'unsafe source URL' }); continue }
      candidates.push(candidate)
      if (candidates.length >= 6) break
    }
    selectedCount += candidates.length
    let usable = 0; let failed = false; let fetchSucceeded = false
    for (const candidate of candidates) {
      if (acquired.length >= 12) break
      abortIfNeeded(input.signal)
      try {
        const fetched = await plugin.fetch(candidate); fetchSucceeded = true; const payload = validateUsableAcquisitionPayload(fetched.content); if (payload.status !== 'usable') { diagnostics.push({ provider, candidateId: candidate.candidateId, kind: candidate.kind, status: payload.status, reason: payload.reason }); continue }
        const source = await plugin.normalize(fetched); const url = canonicalUrl(source.canonicalUrl ?? source.candidate.url); const hash = source.contentHash || sha256(source.content)
        if ((url !== undefined && urls.has(url)) || hashes.has(hash)) { deduplicatedCount++; continue }
        if (url !== undefined) urls.add(url); hashes.add(hash); usable++
        const role: EventSourceRole = url !== undefined && context.url !== undefined && url === canonicalUrl(context.url) ? 'anchor_context' : provider === 'cninfo' ? 'verification' : 'supporting'
        acquired.push({ source: source.contentHash === hash ? source : { ...source, contentHash: hash }, role })
      } catch (error) { failed = true; diagnostics.push({ provider, candidateId: candidate.candidateId, kind: candidate.kind, status: 'failed', reason: error instanceof Error ? error.message : String(error) }) }
    }
    outcomes.push({ provider, providerAttempted: true, providerSucceeded: true, providerEmpty: discovered.length === 0 || (candidates.length === 0 && !failed), providerFailed: failed, usableSourceCount: usable, transportSucceeded: true, fetchSucceeded })
  }
  return { sources: acquired, outcomes, diagnostics, discoveredCount, selectedCount, futureFilteredCount, outsideWindowFilteredCount, unknownDateCount, deduplicatedCount }
}

function sourceContext(acquired: readonly EventAcquiredSource[]): readonly EventEvidenceSource[] { return acquired.map(({ source }) => ({ candidateId: source.candidate.candidateId, title: source.title, provider: source.candidate.provider, kind: source.candidate.kind, url: canonicalUrl(source.canonicalUrl ?? source.candidate.url), publishedAt: source.candidate.publishedAt, excerpt: source.content.slice(0, 1_500), official: source.candidate.kind === 'official_disclosure' || source.candidate.provider.toLocaleLowerCase('en-US') === 'cninfo' })) }
function roleCounts(acquired: readonly EventAcquiredSource[]): Readonly<Record<EventSourceRole, number>> { const counts: Record<EventSourceRole, number> = { anchor_context: 0, verification: 0, supporting: 0, contradicting: 0, background: 0 }; for (const item of acquired) counts[item.role] += 1; return counts }

export function deriveDeterministicEventVerification(assessment: EventEvidenceAssessmentOutput, acquired: readonly EventAcquiredSource[], asOf: string, eventDate: string | undefined, windowDays = DEFAULT_WINDOW_DAYS): EventVerificationResult {
  const sourceMap = new Map(acquired.map(({ source }) => [source.candidate.candidateId, source] as const)); const eligible = (id: string): boolean => { const source = sourceMap.get(id); if (!source) return false; const date = candidateDate(source.candidate); if (date === undefined) return false; if (Date.parse(source.candidate.publishedAt ?? '') > Date.parse(asOf)) return false; return eventDate === undefined || dayDistance(date, eventDate) <= windowDays }; const supporting = [...new Set(assessment.sourceAssessments.filter((item) => item.verdict === 'supports' && eligible(item.sourceCandidateId)).map((item) => item.sourceCandidateId))].sort(); const contradicting = [...new Set([...assessment.sourceAssessments.filter((item) => item.verdict === 'contradicts').map((item) => item.sourceCandidateId), ...assessment.contradictions.flatMap((item) => item.sourceCandidateIds)].filter((id) => sourceMap.has(id)))].sort(); const official = supporting.some((id) => sourceMap.get(id)?.candidate.kind === 'official_disclosure' || sourceMap.get(id)?.candidate.provider.toLocaleLowerCase('en-US') === 'cninfo'); let verificationLevel: EventVerificationResult['verificationLevel'] = 'unverified'; if (supporting.length > 0 && contradicting.length > 0) verificationLevel = 'conflicted'; else if (official) verificationLevel = 'official_verified'; else if (supporting.length >= 2) verificationLevel = 'corroborated'; else if (supporting.length === 1) verificationLevel = 'single_source'; return { verificationLevel, strongVerification: verificationLevel === 'official_verified' || verificationLevel === 'corroborated', supportingSourceCandidateIds: supporting, contradictingSourceCandidateIds: contradicting }
}

function earliestVerifiedDate(verification: EventVerificationResult, acquired: readonly EventAcquiredSource[]): string | undefined { return acquired.map(({ source }) => source).filter((source) => verification.supportingSourceCandidateIds.includes(source.candidate.candidateId)).map((source) => candidateDate(source.candidate)).filter((date): date is string => date !== undefined).sort()[0] }
function eventFingerprint(company: ResearchCompanyIdentity, identity: string): string { return `event-${sha256(JSON.stringify({ version: 1, company: { symbol: company.symbol, exchange: company.exchange }, identity })).slice(0, 24)}` }
export const computeEventFingerprint = eventFingerprint
export const deterministicEventFingerprint = eventFingerprint

function reportSections(sections: readonly EventResearchSection[], anchor: EventResearchAnchorContext, acquired: readonly EventAcquiredSource[], proposals: readonly EventResearchProposal[], existing: readonly Dict[], sourceRefs: Readonly<Record<string, string>>, claimRefs: Readonly<Record<string, string>>): import('../../app/services/research-report.ts').ResearchReportSection[] {
  const knownClaims = new Set(existing.map((item) => String(item.canonicalRef)).filter((ref) => ref.startsWith('claim:'))); const proposalByAssessment = new Map<string, string[]>(); for (const proposal of proposals) for (const assessment of proposal.assessmentRefs) proposalByAssessment.set(assessment, [...(proposalByAssessment.get(assessment) ?? []), proposal.proposalId])
  return sections.map((section) => { const proposalIds = section.assessmentRefs.flatMap((ref) => proposalByAssessment.get(ref) ?? []); const existingRefs = section.existingKnowledgeRefs.filter((ref) => knownClaims.has(ref)); const claimRefsForSection = [...new Set([...existingRefs, ...proposalIds.map((id) => claimRefs[id]).filter((ref): ref is string => ref !== undefined)])]; const urls = section.sourceCandidateIds.map((id) => acquired.find(({ source }) => source.candidate.candidateId === id)?.source.canonicalUrl ?? acquired.find(({ source }) => source.candidate.candidateId === id)?.source.candidate.url).map((url) => canonicalUrl(url)).filter((url): url is string => url !== undefined); const evidenceLinks = [...new Set([...urls, ...section.sourceCandidateIds.filter((id) => sourceRefs[id] === undefined).map((id) => `evidence:${id}`), ...(section.title === 'Event Anchor & Scope' && anchor.url ? [anchor.url] : [])])]; return { id: section.sectionId || eventResearchSectionId(section.title), title: section.title, markdown: section.markdown, sourceRefs: section.sourceCandidateIds.map((id) => sourceRefs[id]).filter((ref): ref is string => ref !== undefined), claimRefs: claimRefsForSection, ...(anchor.kind === 'daily_signal' && anchor.signalId ? { signalRefs: [anchor.signalId] } : {}), evidenceLinks } })
}

function buildReport(input: EventResearchWorkflowInput, company: ResearchCompanyIdentity, rootRef: string, anchor: EventResearchResolvedAnchor, eventFp: string, eventDate: string | undefined, asOf: string, generatedAt: string, outcome: KnowledgeProductionOutcome, sections: readonly EventResearchSection[], proposals: readonly EventResearchProposal[], acquired: readonly EventAcquiredSource[], existing: readonly Dict[]): EventResearchReport {
  const reportId = `event-research-${company.symbol}-${eventFp}-${input.workflowRunId}`; const mappedSections = reportSections(sections, anchor.context, acquired, proposals, existing, outcome.sourceRefsByLocalId, outcome.claimRefsByProposalId); return { reportId, reportType: 'event_research', subjectRefs: [rootRef], generatedAt, asOf, workflowRunId: input.workflowRunId, knowledgeBaseRevision: outcome.knowledgeBaseRevision, sourceRefs: Object.values(outcome.sourceRefsByLocalId), claimRefs: Object.values(outcome.claimRefsByProposalId), methodology: 'Exact canonical Company and bounded Event Anchor resolution, targeted CNINFO/GDELT evidence acquisition, deterministic point-in-time verification, bounded two-stage Event Research reasoning, and Gateway-mediated canonical mutation.', sections: mappedSections, outputPath: `${reportId}.md`, anchor: input.anchor, eventFingerprint: eventFp, ...(eventDate === undefined ? {} : { eventDate }) }
}

function gatewayProposals(proposals: readonly EventResearchProposal[], eventFp: string, eventDate: string | undefined, verification: EventVerificationResult, assessment: EventEvidenceAssessmentOutput): SemanticProductionProposal[] {
  const result: SemanticProductionProposal[] = []
  const supporting = new Set(verification.supportingSourceCandidateIds)
  const hasSupportingVerifiedFact = assessment.verifiedFacts.some((fact) => fact.sourceCandidateIds.some((sourceId) => supporting.has(sourceId)))
  if (verification.strongVerification && eventDate !== undefined && hasSupportingVerifiedFact) result.push({ proposalId: `event-occurrence-${eventFp}`, kind: 'claim', claimType: 'fact', subjectKey: 'company', statement: `The anchored event occurred on ${eventDate}.`, sourceCandidateIds: verification.supportingSourceCandidateIds, structuredValue: eventOccurrenceStructuredValue(eventFp, eventDate), temporal: { type: 'point_in_time', start: eventDate, end: eventDate, label: eventDate } })
  for (const proposal of proposals) { const gateway = toEventResearchGatewayProposal(proposal) as SemanticProductionProposal; result.push(proposal.claimType === 'assumption' ? { ...gateway, resolution: 'supersede' } : gateway) }
  return result
}

export function mapEventGatewayOutcomeStatus(status: KnowledgeProductionOutcome['status']): EventResearchWorkflowResult['status'] | undefined { return status === 'failed' ? 'failed' : status === 'blocked' ? 'blocked' : undefined }

function validateInput(input: EventResearchWorkflowInput, now: string): number {
  if (!SAFE_ID.test(input.workflowRunId)) throw new Error('workflowRunId must be safe')
  if (input.handle.schemaVersion !== '0.4' || input.handle.storageFormatVersion !== '1') throw new Error('Event Research requires Schema 0.4 / Storage 1')
  if (!/^\d{6}$/.test(input.company.symbol)) throw new Error('company symbol must be a six-digit A-share symbol')
  const windowDays = input.eventWindowDays ?? DEFAULT_WINDOW_DAYS
  if (!Number.isInteger(windowDays) || windowDays < 0 || windowDays > MAX_WINDOW_DAYS) throw new Error('EVENT_DATE_INVALID')
  if (!validDateTime(now)) throw new Error('now must be a valid date')
  if (input.asOf !== undefined && !validDateTime(input.asOf)) throw new Error('EVENT_DATE_INVALID')
  if (input.asOf !== undefined && Date.parse(input.asOf) > Date.parse(now)) throw new Error('EVENT_ASOF_IN_FUTURE')
  validateAnchorShape(input.anchor)
  return windowDays
}

export async function runEventResearch(input: EventResearchWorkflowInput): Promise<EventResearchWorkflowResult> {
  let telemetry = baseTelemetry('', input.eventWindowDays ?? DEFAULT_WINDOW_DAYS)
  try {
    const clock = nowOf(input); const now = clock(); const windowDays = validateInput(input, now); const asOf = input.asOf ?? now; const company = normalizedCompany(input.company)
    abortIfNeeded(input.signal)
    const coverage = await resolveExistingCoverage(input, company)
    telemetry = { ...telemetry, companyCoverageResolved: coverage.reason === undefined }
    if (coverage.reason) return { ...baseResult(input, 'blocked', telemetry), blockedReason: coverage.reason, errors: [coverage.reason === 'COMPANY_COVERAGE_NOT_FOUND' ? 'Existing canonical Company coverage was not found; run research_company first.' : coverage.reason === 'COMPANY_COVERAGE_AMBIGUOUS' ? 'Multiple canonical Company matches were found; Event Research is blocked until coverage is unambiguous.' : coverage.reason] }
    abortIfNeeded(input.signal)
    const anchor = await resolveAnchor(input, company, asOf); const eventFp = eventFingerprint(company, anchor.identity); const initialDate = anchor.context.eventDate; telemetry = { ...telemetry, anchorResolved: true, eventFingerprint: eventFp, ...(initialDate === undefined ? {} : { eventDate: initialDate }) }
    abortIfNeeded(input.signal)
    const acquired = await acquireEventSources(input, company, anchor.context, asOf, windowDays); const sources = sourceContext(acquired.sources); const assessmentSkill = await new EventEvidenceAssessmentSkill(input.reasoningExecutor).assess({ company, anchor: anchor.context, asOf, eventDate: initialDate, sources }); abortIfNeeded(input.signal)
    const verification = deriveDeterministicEventVerification(assessmentSkill.output, acquired.sources, asOf, initialDate, windowDays); const eventDate = initialDate ?? earliestVerifiedDate(verification, acquired.sources); const existing = coverage.claims
    const supportingSourceIds = new Set(verification.supportingSourceCandidateIds); const contradictingSourceIds = new Set(verification.contradictingSourceCandidateIds); const synthesisInput: EventResearchSynthesisInput = { company, anchor: anchor.context, eventFingerprint: eventFp, ...(eventDate === undefined ? {} : { eventDate }), verification, evidence: assessmentSkill.output, existingKnowledge: existing.map((item): EventExistingKnowledgeClaim => ({ canonicalRef: String(item.canonicalRef), claimType: String(item.claimType ?? ''), ...(typeof item.statement === 'string' ? { statement: item.statement } : {}), ...(Array.isArray(item.subjectRefs) ? { subjectRefs: item.subjectRefs.filter((ref): ref is string => typeof ref === 'string') } : {}), ...(isRecord(item.structuredValue) ? { structuredValue: item.structuredValue } : { structuredValue: null }) })), sources, supportingSourceExcerpts: sources.filter((item) => supportingSourceIds.has(item.candidateId)), contradictingSourceExcerpts: sources.filter((item) => contradictingSourceIds.has(item.candidateId)) }
    const synthesisSkill = await new EventResearchSynthesisSkill(input.reasoningExecutor).synthesize(synthesisInput); abortIfNeeded(input.signal)
    const accepted = filterEventResearchProposals(synthesisSkill.output.proposals, synthesisInput, synthesisSkill.output.assessments); const proposals = accepted.map((proposal) => proposal.claimType === 'assumption' ? { ...proposal } : proposal); const gatewayInputProposals = gatewayProposals(proposals, eventFp, eventDate, verification, assessmentSkill.output); const diagnostics = [...acquired.diagnostics.map((item) => `${item.provider}${item.candidateId ? `:${item.candidateId}` : ''}:${item.reason}`), ...(eventDate === undefined ? ['EVENT_DATE_UNAVAILABLE: no deterministic anchor or verified supporting publication date'] : []), EVENT_RESEARCH_REPORT_CONTRACT_NOTE]
    telemetry = { ...telemetry, eventDate, discoveredCount: acquired.discoveredCount, selectedCount: acquired.selectedCount, normalizedCount: acquired.sources.length, deduplicatedCount: acquired.deduplicatedCount, futureFilteredCount: acquired.futureFilteredCount, outsideWindowFilteredCount: acquired.outsideWindowFilteredCount, unknownDateCount: acquired.unknownDateCount, sourceRoleCounts: roleCounts(acquired.sources), providerTransportSucceeded: Object.fromEntries(acquired.outcomes.map((item) => [item.provider, item.transportSucceeded])), providerFetchSucceeded: Object.fromEntries(acquired.outcomes.map((item) => [item.provider, item.fetchSucceeded])), assessment: assessmentSkill.reasoning, synthesis: synthesisSkill.reasoning, verification, verifiedFactCount: assessmentSkill.output.verifiedFacts.length, contradictionCount: assessmentSkill.output.contradictions.length, existingKnowledgeCount: existing.length, proposalCandidateCount: synthesisSkill.output.proposals.length, acceptedProposalCount: gatewayInputProposals.length, eventOccurrenceProposalCount: gatewayInputProposals.some((proposal) => proposal.proposalId === `event-occurrence-${eventFp}`) ? 1 : 0, diagnostics }
    let outcome = emptyOutcome(input)
    if (gatewayInputProposals.length > 0) {
      const referencedIds = new Set(gatewayInputProposals.flatMap((proposal) => proposal.sourceCandidateIds ?? [])); const evidenceBindings = acquired.sources.filter(({ source }) => referencedIds.has(source.candidate.candidateId)).map(({ source }) => ({ localSourceId: source.candidate.candidateId, source }))
      outcome = await new KnowledgeProductionGateway(new KnowledgeBaseRegistry()).submit({ handle: input.handle, producerType: 'event_research', producerRunId: input.workflowRunId, schemaProfile: { schemaVersion: '0.4', storageFormatVersion: '1', requiresRawProvenance: true }, entity: { localKey: 'company', entityType: 'company', name: company.name ?? company.symbol, aliases: [company.symbol], semanticFields: { ticker: company.symbol, exchange: company.exchange } }, proposals: gatewayInputProposals, evidenceBindings, asOf, now: clock })
      telemetry = { ...telemetry, canonicalSourceCount: Object.keys(outcome.sourceRefsByLocalId).length, canonicalClaimCount: Object.keys(outcome.claimRefsByProposalId).length, canonicalDeltaCount: outcome.createdIds.length + outcome.updatedIds.length }
      const gatewayStatus = mapEventGatewayOutcomeStatus(outcome.status)
      if (gatewayStatus !== undefined) return { ...baseResult(input, gatewayStatus, telemetry), knowledgeBaseRevision: outcome.knowledgeBaseRevision, errors: outcome.errors, diagnostics, providerOutcomes: acquired.outcomes, acquiredSources: acquired.sources, existingKnowledge: existing, evidence: assessmentSkill.output, verification, sections: synthesisSkill.output.sections, assessments: synthesisSkill.output.assessments, synthesis: synthesisSkill.output, resolutionIntents: outcome.resolutionIntents, proposalIds: gatewayInputProposals.map((proposal) => proposal.proposalId) }
    }
    const report = buildReport(input, company, coverage.rootRef!, anchor, eventFp, eventDate, asOf, clock(), outcome, synthesisSkill.output.sections, accepted, acquired.sources, existing); const committedIds = [...outcome.createdIds, ...outcome.updatedIds]
    return { workflowRunId: input.workflowRunId, status: 'completed', knowledgeBaseId: input.handle.knowledgeBaseId, knowledgeBaseRevision: outcome.knowledgeBaseRevision, report, proposalIds: gatewayInputProposals.map((proposal) => proposal.proposalId), committedIds, sourceIds: Object.values(outcome.sourceRefsByLocalId), claimIds: Object.values(outcome.claimRefsByProposalId), errors: [], diagnostics, providerOutcomes: acquired.outcomes, acquiredSources: acquired.sources, existingKnowledge: existing, evidence: assessmentSkill.output, verification, sections: synthesisSkill.output.sections, assessments: synthesisSkill.output.assessments, synthesis: synthesisSkill.output, resolutionIntents: outcome.resolutionIntents, telemetry }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error); const status: EventResearchWorkflowResult['status'] = message === 'WORKFLOW_CANCELLED' ? 'cancelled' : ['COMPANY_COVERAGE_NOT_FOUND', 'COMPANY_COVERAGE_AMBIGUOUS', 'EVENT_SIGNAL_NOT_FOUND', 'EVENT_SIGNAL_COMPANY_MISMATCH', 'EVENT_ASOF_IN_FUTURE', 'EVENT_DATE_INVALID', 'EVENT_ANCHOR_INVALID'].includes(message) ? 'blocked' : 'failed'; const result = baseResult(input, status, telemetry); return { ...result, errors: [message], ...(message === 'COMPANY_COVERAGE_NOT_FOUND' || message === 'COMPANY_COVERAGE_AMBIGUOUS' || message === 'EVENT_SIGNAL_NOT_FOUND' || message === 'EVENT_SIGNAL_COMPANY_MISMATCH' || message === 'EVENT_ASOF_IN_FUTURE' || message === 'EVENT_DATE_INVALID' || message === 'EVENT_ANCHOR_INVALID' ? { blockedReason: message as EventResearchWorkflowResult['blockedReason'] } : {}) }
  }
}

export const runEventResearchWorkflow = runEventResearch
export const resolveEventAnchor = resolveAnchor
export const resolveEventCompanyCoverage = resolveExistingCoverage
export const selectEventSources = acquireEventSources
