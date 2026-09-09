import { isIP } from 'node:net'
import { KnowledgeBaseRegistry } from '../../knowledge/registry/registry.ts'
import { KnowledgeProductionGateway } from '../../knowledge/production/gateway.ts'
import type { KnowledgeAssetV04, KnowledgeEntityV04 } from '../../knowledge/schema/domain-v04.ts'
import type { KnowledgeProductionOutcome, ResolutionIntentSummary, SemanticProductionProposal } from '../../knowledge/production/contracts.ts'
import { readCanonicalV04Assets } from '../../knowledge/storage/canonical-v04-loader.ts'
import type { DailyResearchSignal, EventResearchSignalStore } from '../../plugins/daily-intelligence/contracts.ts'
import type { ResearchAcquisitionDiagnostic, ResearchAcquisitionPlugin, ResearchCompanyIdentity, ResearchSourceCandidate } from '../../plugins/research-acquisition/contracts.ts'
import { validateUsableAcquisitionPayload } from '../../plugins/research-acquisition/payload-validation.ts'
import { sha256 } from '../../plugins/research-acquisition/hash.ts'
import { normalizeExchange } from '../../skills/knowledge-curation/identity/company-identity.ts'
import { EventEvidenceAssessmentSkill, EventResearchSynthesisSkill, eventOccurrenceStructuredValue, eventResearchSectionId, filterEventResearchProposals, toEventResearchGatewayProposal } from '../../skills/event-research/index.ts'
import type { EventEvidenceAssessmentOutput, EventEvidenceSource, EventExistingKnowledgeClaim, EventImpactAssessment, EventResearchAnchorContext, EventResearchProposal, EventResearchSection, EventResearchSynthesisInput, EventResearchSynthesisOutput, EventVerificationResult } from '../../skills/event-research/contracts.ts'
import type { EventAnchor } from '../../app/services/contracts.ts'
import { EVENT_RESEARCH_REPORT_CONTRACT_NOTE, type EventAcquiredSource, type EventResearchProviderOutcome, type EventResearchReport, type EventResearchResolvedAnchor, type EventResearchTelemetry, type EventResearchWorkflowInput, type EventResearchWorkflowResult, type EventSourceRole } from './contracts.ts'

type Dict = Record<string, unknown>
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]*$/
const HTTP_URL = /^https?:\/\//i
const MAX_URL_LENGTH = 2_048
const MAX_ANCHOR_TITLE = 500
const MAX_ANCHOR_DESCRIPTION = 5_000
const MAX_ARTICLE_CONTENT = 50_000
const MAX_REFERENCE_ITEMS = 12
const MAX_SOURCE_ASSESSMENTS = 12
const MAX_VERIFIED_FACTS = 12
const MAX_CONTRADICTIONS = 12
const MAX_IMPACT_ASSESSMENTS = 12
const MAX_PROPOSALS = 4
const MAX_SYNTHESIS_SECTIONS = 16
const MAX_ACQUIRED_SOURCES = 12
const OUTPUT_INVALID = 'EVENT_RESEARCH_OUTPUT_INVALID'
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
function baseTelemetry(fingerprint = '', windowDays = DEFAULT_WINDOW_DAYS, diagnostics: readonly string[] = []): EventResearchTelemetry { return { companyCoverageResolved: false, anchorResolved: false, eventFingerprint: fingerprint, eventWindowDays: windowDays, discoveredCount: 0, selectedCount: 0, normalizedCount: 0, deduplicatedCount: 0, futureFilteredCount: 0, outsideWindowFilteredCount: 0, unknownDateCount: 0, sourceRoleCounts: { anchor_context: 0, verification: 0, supporting: 0, contradicting: 0, background: 0 }, providerTransportSucceeded: { cninfo: false, gdelt: false }, providerFetchSucceeded: { cninfo: false, gdelt: false }, providerSucceeded: { cninfo: false, gdelt: false }, providerFailed: { cninfo: false, gdelt: false }, providerUsableSourceCounts: { cninfo: 0, gdelt: 0 }, assessment: emptyReasoning('event_evidence_assessment'), synthesis: emptyReasoning('event_research_synthesis'), verification: emptyVerification(), verifiedFactCount: 0, contradictionCount: 0, existingKnowledgeCount: 0, proposalCandidateCount: 0, acceptedProposalCount: 0, eventOccurrenceProposalCount: 0, canonicalSourceCount: 0, canonicalClaimCount: 0, canonicalDeltaCount: 0, reportPersistence: 'deferred_report_contract', diagnostics } }
function baseResult(input: EventResearchWorkflowInput, status: EventResearchWorkflowResult['status'], telemetry = baseTelemetry()): EventResearchWorkflowResult { return { workflowRunId: input.workflowRunId, status, knowledgeBaseId: input.handle.knowledgeBaseId, knowledgeBaseRevision: input.handle.revision, proposalIds: [], committedIds: [], sourceIds: [], claimIds: [], errors: [], diagnostics: telemetry.diagnostics, providerOutcomes: [], acquiredSources: [], existingKnowledge: [], sections: [], assessments: [], resolutionIntents: [], telemetry } }
function abortIfNeeded(signal: AbortSignal | undefined): void { if (signal?.aborted) throw new Error('WORKFLOW_CANCELLED') }
function isoDate(value: unknown): string | undefined { const raw = text(value); if (!raw) return undefined; const calendar = /^(\d{4})-(\d{2})-(\d{2})(?=$|T|\s)/.exec(raw); if (calendar !== null) { const year = Number(calendar[1]); const month = Number(calendar[2]); const day = Number(calendar[3]); const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0); const daysInMonth = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1]; if (daysInMonth === undefined || day < 1 || day > daysInMonth) return undefined; if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw }
  const time = Date.parse(raw); if (Number.isNaN(time)) return undefined; return new Date(time).toISOString().slice(0, 10) }
function validDateTime(value: unknown): boolean { const raw = text(value); return raw !== '' && isoDate(raw) !== undefined && !Number.isNaN(Date.parse(raw)) }
function dayNumber(date: string): number { return Date.parse(`${date}T00:00:00.000Z`) }
function dayDistance(left: string, right: string): number { return Math.abs(dayNumber(left) - dayNumber(right)) / 86_400_000 }
function asOfDay(asOf: string): string | undefined { return isoDate(asOf) }
function dateOnly(value: unknown): boolean { return /^\d{4}-\d{2}-\d{2}$/.test(text(value)) }
function pointInTime(value: string): number { return dateOnly(value) ? Date.parse(`${value}T00:00:00.000Z`) : Date.parse(value) }
function pointInTimeNotAfterAsOf(value: string, asOf: string, calendarDateAllowed: boolean): boolean {
  if (calendarDateAllowed && dateOnly(value)) return value <= (asOfDay(asOf) ?? asOf)
  return pointInTime(value) <= pointInTime(asOf)
}
function inferExchange(symbol: string): string | undefined { return symbol.startsWith('6') ? 'SH' : symbol.startsWith('0') || symbol.startsWith('3') ? 'SZ' : symbol.startsWith('4') || symbol.startsWith('8') ? 'BJ' : undefined }

function normalizedCompany(input: ResearchCompanyIdentity): ResearchCompanyIdentity {
  const exchange = normalizeExchange(input.exchange ?? inferExchange(input.symbol) ?? '')
  return { symbol: input.symbol, name: input.name ?? input.symbol, exchange }
}

function ipv4Reserved(host: string): boolean {
  const octets = host.split('.').map((part) => Number(part))
  if (octets.length !== 4 || octets.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return true
  const [a, b, c] = octets
  return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && ((b === 0 && (c === 0 || c === 2)) || b === 168)) || (a === 198 && b >= 18 && b <= 19) || (a === 198 && b === 51 && c === 100) || (a === 203 && b === 0 && c === 113) || a >= 224
}

function ipv6Value(host: string): bigint | undefined {
  const normalizedHost = host.toLowerCase().replace(/^\[|\]$/g, '')
  if (normalizedHost.includes('%')) return undefined
  const halves = normalizedHost.split('::')
  if (halves.length > 2) return undefined
  const parse = (value: string): number[] => value === '' ? [] : value.split(':').flatMap((part) => {
    if (part.includes('.')) {
      const octets = part.split('.').map(Number)
      return octets.length === 4 && octets.every((item) => Number.isInteger(item) && item >= 0 && item <= 255) ? [(octets[0]! << 8) | octets[1]!, (octets[2]! << 8) | octets[3]!] : []
    }
    return /^[0-9a-f]{1,4}$/.test(part) ? [Number.parseInt(part, 16)] : []
  })
  const left = parse(halves[0]!)
  const right = halves.length === 2 ? parse(halves[1]!) : []
  if (left.length + right.length > 8 || (halves.length === 1 && left.length !== 8) || (halves.length === 2 && left.length + right.length === 8)) return undefined
  const parts = [...left, ...Array.from({ length: 8 - left.length - right.length }, () => 0), ...right]
  return parts.reduce((value, part) => (value << 16n) | BigInt(part), 0n)
}

function hostIsReserved(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '')
  if (host === '' || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal') || (!host.includes('.') && isIP(host) === 0)) return true
  const ipVersion = isIP(host)
  if (ipVersion === 4) return ipv4Reserved(host)
  if (ipVersion === 6) {
    const value = ipv6Value(host)
    if (value === undefined) return true
    const prefix = (bits: number): bigint => value >> BigInt(128 - bits)
    return value === 0n || value === 1n || prefix(7) === 0x7en || prefix(10) === 0x3fan || prefix(8) === 0xffn || prefix(32) === 0x20010db8n || (prefix(96) === 0xffffn && ipv4Reserved(`${Number((value >> 24n) & 255n)}.${Number((value >> 16n) & 255n)}.${Number((value >> 8n) & 255n)}.${Number(value & 255n)}`))
  }
  return false
}

function hasExplicitPort(value: string): boolean {
  const authority = /^[a-z][a-z0-9+.-]*:\/\/([^/?#]*)/i.exec(value)?.[1]
  if (authority === undefined) return false
  const hostPort = authority.slice(authority.lastIndexOf('@') + 1)
  return hostPort.startsWith('[') ? /^\[[^\]]+\]:\d*$/.test(hostPort) : /:\d*$/.test(hostPort)
}

function canonicalUrl(value: string | undefined): string | undefined {
  if (!value || value.length > MAX_URL_LENGTH || !HTTP_URL.test(value)) return undefined
  try {
    const url = new URL(value)
    if (url.username !== '' || url.password !== '' || url.port !== '' || hasExplicitPort(value) || hostIsReserved(url.hostname)) return undefined
    url.hash = ''
    url.hostname = url.hostname.toLowerCase()
    return url.toString().replace(/\/$/, '')
  } catch { return undefined }
}

function validateAnchorShape(anchor: EventAnchor): void {
  if (!isRecord(anchor) || typeof anchor.kind !== 'string' || !['daily_signal', 'article', 'url', 'user_event'].includes(anchor.kind)) throw new Error('EVENT_ANCHOR_INVALID')
  if (anchor.kind === 'daily_signal' && (!SAFE_ID.test(anchor.signalId) || text(anchor.signalId) === '')) throw new Error('EVENT_ANCHOR_INVALID')
  if ((anchor.kind === 'article' || anchor.kind === 'url') && canonicalUrl(anchor.url) === undefined) throw new Error('EVENT_ANCHOR_INVALID')
  if ((anchor.kind === 'article' || anchor.kind === 'url') && anchor.title !== undefined && text(anchor.title).length > MAX_ANCHOR_TITLE) throw new Error('EVENT_ANCHOR_INVALID')
  if (anchor.kind === 'article' && anchor.content !== undefined && text(anchor.content).length > MAX_ARTICLE_CONTENT) throw new Error('EVENT_ANCHOR_INVALID')
  if (anchor.kind === 'user_event' && (text(anchor.title) === '' || text(anchor.description) === '' || text(anchor.title).length > MAX_ANCHOR_TITLE || text(anchor.description).length > MAX_ANCHOR_DESCRIPTION)) throw new Error('EVENT_ANCHOR_INVALID')
  const dates = anchor.kind === 'user_event' ? [anchor.eventDate] : [anchor.kind === 'daily_signal' ? undefined : anchor.publishedAt]
  if (dates.some((date) => date !== undefined && isoDate(date) === undefined)) throw new Error('EVENT_DATE_INVALID')
}

function validateStoredSignal(signal: DailyResearchSignal): void {
  if (!validDateTime(signal.discoveredAt) || (signal.publishedAt !== undefined && !validDateTime(signal.publishedAt)) || (signal.source.publishedAt !== undefined && !validDateTime(signal.source.publishedAt))) throw new Error('EVENT_DATE_INVALID')
  if ((signal.contentRef !== undefined && canonicalUrl(signal.contentRef) === undefined) || (signal.source.url !== undefined && canonicalUrl(signal.source.url) === undefined)) throw new Error('EVENT_ANCHOR_INVALID')
}

function anchorDateNotAfterAsOf(value: string, asOf: string, calendarDateAllowed: boolean): boolean {
  return pointInTimeNotAfterAsOf(value, asOf, calendarDateAllowed)
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
    validateStoredSignal(signal)
    if (!signal.entities.includes(company.symbol)) throw new Error('EVENT_SIGNAL_COMPANY_MISMATCH')
    const context: EventResearchAnchorContext = { kind: 'daily_signal', title: text(signal.title) || anchor.signalId, description: text(signal.narrative ?? signal.excerpt), signalId: signal.signalId, ...(canonicalUrl(signal.contentRef ?? signal.source.url) === undefined ? {} : { url: canonicalUrl(signal.contentRef ?? signal.source.url) }), ...(signal.publishedAt === undefined ? {} : { publishedAt: signal.publishedAt }), ...(signal.publishedAt === undefined ? {} : { eventDate: isoDate(signal.publishedAt)! }) }
    if (signal.publishedAt !== undefined && !anchorDateNotAfterAsOf(signal.publishedAt, asOf, false)) throw new Error('EVENT_DATE_INVALID')
    return { context, sourceSignal: signal, identity: anchorIdentity(anchor, context) }
  }
  const url = anchor.kind === 'article' || anchor.kind === 'url' ? canonicalUrl(anchor.url)! : undefined
  const context: EventResearchAnchorContext = anchor.kind === 'user_event'
    ? { kind: 'user_event', title: text(anchor.title), description: text(anchor.description), ...(anchor.eventDate === undefined ? {} : { eventDate: isoDate(anchor.eventDate)! }) }
    : { kind: anchor.kind, title: text(anchor.title) || url!, ...(anchor.kind === 'article' && anchor.content !== undefined ? { description: text(anchor.content).slice(0, 1_500) } : {}), ...(url === undefined ? {} : { url }), ...(anchor.publishedAt === undefined ? {} : { publishedAt: anchor.publishedAt }), ...(anchor.publishedAt === undefined ? {} : { eventDate: isoDate(anchor.publishedAt)! }) }
  const anchorPoint = anchor.kind === 'user_event' ? anchor.eventDate : anchor.publishedAt
  if (anchorPoint !== undefined && !anchorDateNotAfterAsOf(anchorPoint, asOf, anchor.kind === 'user_event')) throw new Error('EVENT_DATE_INVALID')
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
interface AcquisitionProgress { readonly sources: EventAcquiredSource[]; readonly outcomes: EventResearchProviderOutcome[]; readonly diagnostics: ResearchAcquisitionDiagnostic[]; discoveredCount: number; selectedCount: number; futureFilteredCount: number; outsideWindowFilteredCount: number; unknownDateCount: number; deduplicatedCount: number }
function emptyAcquisitionProgress(): AcquisitionProgress { return { sources: [], outcomes: [], diagnostics: [], discoveredCount: 0, selectedCount: 0, futureFilteredCount: 0, outsideWindowFilteredCount: 0, unknownDateCount: 0, deduplicatedCount: 0 } }

async function acquireEventSources(input: EventResearchWorkflowInput, company: ResearchCompanyIdentity, context: EventResearchAnchorContext, asOf: string, windowDays: number, progress: AcquisitionProgress = emptyAcquisitionProgress()): Promise<AcquisitionResult> {
  const { diagnostics, outcomes, sources: acquired } = progress; const urls = new Set<string>(); const hashes = new Set<string>()
  for (const provider of PROVIDERS) {
    abortIfNeeded(input.signal)
    const plugin = input.acquisitionPlugins.find((candidate) => providerName(candidate) === provider)
    if (!plugin) { const missing = emptyProvider(provider, `${provider} acquisition plugin is not configured`); outcomes.push(missing.outcome); diagnostics.push(missing.diagnostic); continue }
    let discovered: readonly ResearchSourceCandidate[] = []
    let discoverySucceeded = false
    try { discovered = await plugin.discover({ company, asOf, limitPerKind: 6 }); discoverySucceeded = true; progress.discoveredCount += discovered.length } catch (error) { const reason = error instanceof Error ? error.message : String(error); outcomes.push({ provider, providerAttempted: true, providerSucceeded: false, providerEmpty: false, providerFailed: true, usableSourceCount: 0, transportSucceeded: false, fetchSucceeded: false }); diagnostics.push({ provider, status: 'failed', reason }); continue }
    const candidates: ResearchSourceCandidate[] = []
    for (const candidate of [...discovered].filter((item) => item.provider.toLocaleLowerCase('en-US') === provider).sort(candidateSort)) {
      const symbol = candidate.metadata?.companySymbol
      if (typeof symbol === 'string' && symbol !== company.symbol) continue
      const published = candidateDate(candidate)
      if (candidate.publishedAt !== undefined && published === undefined) { diagnostics.push({ provider, candidateId: candidate.candidateId, kind: candidate.kind, status: 'empty', reason: 'invalid publication date' }); continue }
      if (candidate.publishedAt !== undefined && pointInTime(candidate.publishedAt) > pointInTime(asOf)) { progress.futureFilteredCount++; continue }
      if (published === undefined) progress.unknownDateCount++
      if (published !== undefined && context.eventDate !== undefined && dayDistance(published, context.eventDate) > windowDays) { progress.outsideWindowFilteredCount++; continue }
      if (candidate.url !== undefined && canonicalUrl(candidate.url) === undefined) { diagnostics.push({ provider, candidateId: candidate.candidateId, kind: candidate.kind, status: 'empty', reason: 'unsafe source URL' }); continue }
      candidates.push(candidate)
      if (candidates.length >= 6) break
    }
    progress.selectedCount += candidates.length
    let usable = 0; let failed = false; let fetchSucceeded = false
    for (const candidate of candidates) {
      if (acquired.length >= MAX_ACQUIRED_SOURCES) break
      abortIfNeeded(input.signal)
      try {
        const fetched = await plugin.fetch(candidate); fetchSucceeded = true; const payload = validateUsableAcquisitionPayload(fetched.content); if (payload.status !== 'usable') { if (payload.status === 'failed') failed = true; diagnostics.push({ provider, candidateId: candidate.candidateId, kind: candidate.kind, status: payload.status, reason: payload.reason }); continue }
        const source = await plugin.normalize(fetched); const sourceUrlValue = source.canonicalUrl ?? source.candidate.url; const url = canonicalUrl(sourceUrlValue); if (sourceUrlValue !== undefined && url === undefined) { diagnostics.push({ provider, candidateId: candidate.candidateId, kind: candidate.kind, status: 'empty', reason: 'unsafe normalized source URL' }); continue } const hash = source.contentHash || sha256(source.content)
        if ((url !== undefined && urls.has(url)) || hashes.has(hash)) { progress.deduplicatedCount++; continue }
        if (url !== undefined) urls.add(url); hashes.add(hash); usable++
        const role: EventSourceRole = url !== undefined && context.url !== undefined && url === canonicalUrl(context.url) ? 'anchor_context' : provider === 'cninfo' ? 'verification' : 'supporting'
        acquired.push({ source: source.contentHash === hash ? source : { ...source, contentHash: hash }, role })
      } catch (error) { failed = true; diagnostics.push({ provider, candidateId: candidate.candidateId, kind: candidate.kind, status: 'failed', reason: error instanceof Error ? error.message : String(error) }) }
    }
    const providerSucceeded = discoverySucceeded && !failed
    outcomes.push({ provider, providerAttempted: true, providerSucceeded, providerEmpty: discovered.length === 0 || (usable === 0 && !failed), providerFailed: !providerSucceeded, usableSourceCount: usable, transportSucceeded: discoverySucceeded, fetchSucceeded })
  }
  return { sources: acquired, outcomes, diagnostics, discoveredCount: progress.discoveredCount, selectedCount: progress.selectedCount, futureFilteredCount: progress.futureFilteredCount, outsideWindowFilteredCount: progress.outsideWindowFilteredCount, unknownDateCount: progress.unknownDateCount, deduplicatedCount: progress.deduplicatedCount }
}

function sourceContext(acquired: readonly EventAcquiredSource[]): readonly EventEvidenceSource[] { return acquired.map(({ source }) => ({ candidateId: source.candidate.candidateId, title: source.title, provider: source.candidate.provider, kind: source.candidate.kind, url: canonicalUrl(source.canonicalUrl ?? source.candidate.url), publishedAt: source.candidate.publishedAt, excerpt: source.content.slice(0, 1_500), official: source.candidate.kind === 'official_disclosure' || source.candidate.provider.toLocaleLowerCase('en-US') === 'cninfo' })) }
function roleCounts(acquired: readonly EventAcquiredSource[]): Readonly<Record<EventSourceRole, number>> { const counts: Record<EventSourceRole, number> = { anchor_context: 0, verification: 0, supporting: 0, contradicting: 0, background: 0 }; for (const item of acquired) counts[item.role] += 1; return counts }

function assertOutputRefs(value: unknown, allowed: ReadonlySet<string>, label: string, max = MAX_REFERENCE_ITEMS): asserts value is readonly string[] {
  if (!Array.isArray(value) || value.length > max || value.some((item) => typeof item !== 'string') || new Set(value).size !== value.length || value.some((item) => !allowed.has(item))) throw new Error(`${OUTPUT_INVALID}:${label}`)
}

function validateAssessmentOutput(output: EventEvidenceAssessmentOutput, acquired: readonly EventAcquiredSource[]): void {
  const sourceSet = new Set(acquired.map(({ source }) => source.candidate.candidateId))
  if (output.sourceAssessments.length > MAX_SOURCE_ASSESSMENTS || output.verifiedFacts.length > MAX_VERIFIED_FACTS || output.contradictions.length > MAX_CONTRADICTIONS) throw new Error(`${OUTPUT_INVALID}:stage_a_count`)
  const assessmentIds = output.sourceAssessments.map((item) => item.sourceCandidateId)
  if (new Set(assessmentIds).size !== assessmentIds.length) throw new Error(`${OUTPUT_INVALID}:stage_a_source_assessments_duplicate`)
  for (const item of output.sourceAssessments) assertOutputRefs([item.sourceCandidateId], sourceSet, 'stage_a_source_assessment')
  const factIds = output.verifiedFacts.map((item) => item.factId)
  if (new Set(factIds).size !== factIds.length) throw new Error(`${OUTPUT_INVALID}:stage_a_fact_duplicate`)
  for (const item of output.verifiedFacts) assertOutputRefs(item.sourceCandidateIds, sourceSet, 'stage_a_fact_sources')
  const contradictionIds = output.contradictions.flatMap((item) => item.contradictionId === undefined ? [] : [item.contradictionId])
  if (new Set(contradictionIds).size !== contradictionIds.length) throw new Error(`${OUTPUT_INVALID}:stage_a_contradiction_duplicate`)
  for (const item of output.contradictions) assertOutputRefs(item.sourceCandidateIds, sourceSet, 'stage_a_contradiction_sources')
}

function validateSynthesisOutput(output: EventResearchSynthesisOutput, acquired: readonly EventAcquiredSource[], existing: readonly Dict[]): void {
  const sourceSet = new Set(acquired.map(({ source }) => source.candidate.candidateId))
  const claimSet = new Set(existing.map((item) => String(item.canonicalRef)).filter((ref) => ref.startsWith('claim:')))
  if (output.sections.length !== MAX_SYNTHESIS_SECTIONS || output.assessments.length > MAX_IMPACT_ASSESSMENTS || output.proposals.length > MAX_PROPOSALS) throw new Error(`${OUTPUT_INVALID}:stage_b_count`)
  const sectionIds = output.sections.map((item) => item.sectionId)
  if (new Set(sectionIds).size !== sectionIds.length) throw new Error(`${OUTPUT_INVALID}:stage_b_section_duplicate`)
  const assessmentIds = output.assessments.map((item) => item.assessmentId)
  if (new Set(assessmentIds).size !== assessmentIds.length) throw new Error(`${OUTPUT_INVALID}:stage_b_assessment_duplicate`)
  const assessmentSet = new Set(assessmentIds)
  for (const section of output.sections) {
    assertOutputRefs(section.sourceCandidateIds, sourceSet, 'stage_b_section_sources')
    assertOutputRefs(section.existingKnowledgeRefs, claimSet, 'stage_b_section_claims')
    assertOutputRefs(section.assessmentRefs, assessmentSet, 'stage_b_section_assessments')
  }
  for (const assessment of output.assessments) {
    assertOutputRefs(assessment.sourceCandidateIds, sourceSet, 'stage_b_assessment_sources')
    assertOutputRefs(assessment.existingKnowledgeRefs, claimSet, 'stage_b_assessment_claims')
  }
  const proposalIds = output.proposals.map((item) => item.proposalId)
  if (new Set(proposalIds).size !== proposalIds.length) throw new Error(`${OUTPUT_INVALID}:stage_b_proposal_duplicate`)
  for (const proposal of output.proposals) {
    assertOutputRefs(proposal.sourceCandidateIds, sourceSet, 'stage_b_proposal_sources')
    assertOutputRefs(proposal.existingKnowledgeRefs, claimSet, 'stage_b_proposal_claims')
    assertOutputRefs(proposal.assessmentRefs, assessmentSet, 'stage_b_proposal_assessments')
  }
}

function deriveStageARoles(acquired: readonly EventAcquiredSource[], assessment: EventEvidenceAssessmentOutput, anchor: EventResearchAnchorContext): readonly EventAcquiredSource[] {
  const supporting = new Set([...assessment.sourceAssessments.filter((item) => item.verdict === 'supports').map((item) => item.sourceCandidateId), ...assessment.verifiedFacts.flatMap((item) => item.sourceCandidateIds)])
  const contradicting = new Set([...assessment.sourceAssessments.filter((item) => item.verdict === 'contradicts').map((item) => item.sourceCandidateId), ...assessment.contradictions.flatMap((item) => item.sourceCandidateIds)])
  const anchorUrl = canonicalUrl(anchor.url)
  return acquired.map((item) => {
    const candidateId = item.source.candidate.candidateId
    const url = canonicalUrl(item.source.canonicalUrl ?? item.source.candidate.url)
    const role: EventSourceRole = contradicting.has(candidateId) ? 'contradicting' : supporting.has(candidateId) ? item.role === 'anchor_context' ? 'anchor_context' : item.role === 'verification' ? 'verification' : 'supporting' : anchorUrl !== undefined && url === anchorUrl ? 'anchor_context' : 'background'
    return { ...item, role }
  })
}

export function deriveDeterministicEventVerification(assessment: EventEvidenceAssessmentOutput, acquired: readonly EventAcquiredSource[], asOf: string, eventDate: string | undefined, windowDays = DEFAULT_WINDOW_DAYS): EventVerificationResult {
  const sourceMap = new Map(acquired.map(({ source }) => [source.candidate.candidateId, source] as const))
  const eligible = (id: string): boolean => {
    const source = sourceMap.get(id)
    if (!source || source.candidate.publishedAt === undefined) return false
    const date = candidateDate(source.candidate)
    if (date === undefined || pointInTime(source.candidate.publishedAt) > pointInTime(asOf)) return false
    return eventDate === undefined || dayDistance(date, eventDate) <= windowDays
  }
  const supporting = [...new Set(assessment.sourceAssessments.filter((item) => item.verdict === 'supports' && eligible(item.sourceCandidateId)).map((item) => item.sourceCandidateId))].sort()
  const contradicting = [...new Set([...assessment.sourceAssessments.filter((item) => item.verdict === 'contradicts').map((item) => item.sourceCandidateId), ...assessment.contradictions.flatMap((item) => item.sourceCandidateIds)].filter((id) => sourceMap.has(id)))].sort()
  const official = supporting.some((id) => sourceMap.get(id)?.candidate.kind === 'official_disclosure' || sourceMap.get(id)?.candidate.provider.toLocaleLowerCase('en-US') === 'cninfo')
  let verificationLevel: EventVerificationResult['verificationLevel'] = 'unverified'
  if (supporting.length > 0 && contradicting.length > 0) verificationLevel = 'conflicted'
  else if (official) verificationLevel = 'official_verified'
  else if (supporting.length >= 2) verificationLevel = 'corroborated'
  else if (supporting.length === 1) verificationLevel = 'single_source'
  return { verificationLevel, strongVerification: verificationLevel === 'official_verified' || verificationLevel === 'corroborated', supportingSourceCandidateIds: supporting, contradictingSourceCandidateIds: contradicting }
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

interface WorkflowAudit {
  acquisitionProgress?: AcquisitionProgress
  providerOutcomes: EventResearchProviderOutcome[]
  acquiredSources: EventAcquiredSource[]
  existingKnowledge: Dict[]
  evidence?: EventEvidenceAssessmentOutput
  verification?: EventVerificationResult
  sections: EventResearchSection[]
  assessments: EventImpactAssessment[]
  synthesis?: EventResearchSynthesisOutput
  resolutionIntents: ResolutionIntentSummary[]
  proposalIds: string[]
  committedIds: string[]
  sourceIds: string[]
  claimIds: string[]
  knowledgeBaseRevision: number
}

function emptyWorkflowAudit(input: EventResearchWorkflowInput): WorkflowAudit { return { providerOutcomes: [], acquiredSources: [], existingKnowledge: [], sections: [], assessments: [], resolutionIntents: [], proposalIds: [], committedIds: [], sourceIds: [], claimIds: [], knowledgeBaseRevision: input.handle.revision } }
function acquisitionDiagnostics(diagnostics: readonly ResearchAcquisitionDiagnostic[]): readonly string[] { return diagnostics.map((item) => `${item.provider}${item.candidateId ? `:${item.candidateId}` : ''}:${item.reason}`) }
function cancelledResult(input: EventResearchWorkflowInput, telemetry: EventResearchTelemetry, audit: WorkflowAudit): EventResearchWorkflowResult {
  const progress = audit.acquisitionProgress
  const auditedTelemetry = progress === undefined ? telemetry : { ...telemetry, discoveredCount: progress.discoveredCount, selectedCount: progress.selectedCount, normalizedCount: progress.sources.length, deduplicatedCount: progress.deduplicatedCount, futureFilteredCount: progress.futureFilteredCount, outsideWindowFilteredCount: progress.outsideWindowFilteredCount, unknownDateCount: progress.unknownDateCount, providerTransportSucceeded: Object.fromEntries(progress.outcomes.map((item) => [item.provider, item.transportSucceeded])), providerFetchSucceeded: Object.fromEntries(progress.outcomes.map((item) => [item.provider, item.fetchSucceeded])), providerSucceeded: Object.fromEntries(progress.outcomes.map((item) => [item.provider, item.providerSucceeded])), providerFailed: Object.fromEntries(progress.outcomes.map((item) => [item.provider, item.providerFailed])), providerUsableSourceCounts: Object.fromEntries(progress.outcomes.map((item) => [item.provider, item.usableSourceCount])) }
  return { ...baseResult(input, 'cancelled', auditedTelemetry), knowledgeBaseRevision: audit.knowledgeBaseRevision, proposalIds: audit.proposalIds, committedIds: audit.committedIds, sourceIds: audit.sourceIds, claimIds: audit.claimIds, errors: ['WORKFLOW_CANCELLED'], diagnostics: auditedTelemetry.diagnostics, providerOutcomes: audit.providerOutcomes, acquiredSources: audit.acquiredSources, existingKnowledge: audit.existingKnowledge, ...(audit.evidence === undefined ? {} : { evidence: audit.evidence }), ...(audit.verification === undefined ? {} : { verification: audit.verification }), sections: audit.sections, assessments: audit.assessments, ...(audit.synthesis === undefined ? {} : { synthesis: audit.synthesis }), resolutionIntents: audit.resolutionIntents }
}

export async function runEventResearch(input: EventResearchWorkflowInput): Promise<EventResearchWorkflowResult> {
  let telemetry = baseTelemetry('', input.eventWindowDays ?? DEFAULT_WINDOW_DAYS)
  const audit = emptyWorkflowAudit(input)
  try {
    const clock = nowOf(input); const now = clock(); const windowDays = validateInput(input, now); const asOf = input.asOf ?? now; const company = normalizedCompany(input.company)
    abortIfNeeded(input.signal)
    const coverage = await resolveExistingCoverage(input, company)
    telemetry = { ...telemetry, companyCoverageResolved: coverage.reason === undefined }
    if (coverage.reason) return { ...baseResult(input, 'blocked', telemetry), blockedReason: coverage.reason, errors: [coverage.reason === 'COMPANY_COVERAGE_NOT_FOUND' ? 'Existing canonical Company coverage was not found; run research_company first.' : coverage.reason === 'COMPANY_COVERAGE_AMBIGUOUS' ? 'Multiple canonical Company matches were found; Event Research is blocked until coverage is unambiguous.' : coverage.reason] }
    audit.existingKnowledge = [...coverage.claims]
    abortIfNeeded(input.signal)
    const anchor = await resolveAnchor(input, company, asOf); const eventFp = eventFingerprint(company, anchor.identity); const initialDate = anchor.context.eventDate; telemetry = { ...telemetry, anchorResolved: true, eventFingerprint: eventFp, ...(initialDate === undefined ? {} : { eventDate: initialDate }) }
    audit.acquiredSources = []
    abortIfNeeded(input.signal)
    const progress = emptyAcquisitionProgress(); audit.acquisitionProgress = progress; audit.providerOutcomes = progress.outcomes; audit.acquiredSources = progress.sources; const acquired = await acquireEventSources(input, company, anchor.context, asOf, windowDays, progress); const sources = sourceContext(acquired.sources); const assessmentSkill = await new EventEvidenceAssessmentSkill(input.reasoningExecutor).assess({ company, anchor: anchor.context, asOf, eventDate: initialDate, sources }); validateAssessmentOutput(assessmentSkill.output, acquired.sources); audit.evidence = assessmentSkill.output; abortIfNeeded(input.signal)
    const verification = deriveDeterministicEventVerification(assessmentSkill.output, acquired.sources, asOf, initialDate, windowDays); audit.verification = verification; const roledSources = deriveStageARoles(acquired.sources, assessmentSkill.output, anchor.context); audit.acquiredSources = [...roledSources]; const eventDate = initialDate ?? earliestVerifiedDate(verification, roledSources); const existing = coverage.claims
    const supportingSourceIds = new Set(verification.supportingSourceCandidateIds); const contradictingSourceIds = new Set(verification.contradictingSourceCandidateIds); const synthesisInput: EventResearchSynthesisInput = { company, anchor: anchor.context, eventFingerprint: eventFp, ...(eventDate === undefined ? {} : { eventDate }), verification, evidence: assessmentSkill.output, existingKnowledge: existing.map((item): EventExistingKnowledgeClaim => ({ canonicalRef: String(item.canonicalRef), claimType: String(item.claimType ?? ''), ...(typeof item.statement === 'string' ? { statement: item.statement } : {}), ...(Array.isArray(item.subjectRefs) ? { subjectRefs: item.subjectRefs.filter((ref): ref is string => typeof ref === 'string') } : {}), ...(isRecord(item.structuredValue) ? { structuredValue: item.structuredValue } : { structuredValue: null }) })), sources, supportingSourceExcerpts: sources.filter((item) => supportingSourceIds.has(item.candidateId)), contradictingSourceExcerpts: sources.filter((item) => contradictingSourceIds.has(item.candidateId)) }
    const synthesisSkill = await new EventResearchSynthesisSkill(input.reasoningExecutor).synthesize(synthesisInput); validateSynthesisOutput(synthesisSkill.output, roledSources, existing); audit.synthesis = synthesisSkill.output; audit.sections = [...synthesisSkill.output.sections]; audit.assessments = [...synthesisSkill.output.assessments]; abortIfNeeded(input.signal)
    const accepted = filterEventResearchProposals(synthesisSkill.output.proposals, synthesisInput, synthesisSkill.output.assessments); const proposals = accepted.map((proposal) => proposal.claimType === 'assumption' ? { ...proposal } : proposal); const gatewayInputProposals = gatewayProposals(proposals, eventFp, eventDate, verification, assessmentSkill.output); audit.proposalIds = gatewayInputProposals.map((proposal) => proposal.proposalId); const diagnostics = [...acquisitionDiagnostics(acquired.diagnostics), ...(eventDate === undefined ? ['EVENT_DATE_UNAVAILABLE: no deterministic anchor or verified supporting publication date'] : []), EVENT_RESEARCH_REPORT_CONTRACT_NOTE]
    telemetry = { ...telemetry, eventDate, discoveredCount: acquired.discoveredCount, selectedCount: acquired.selectedCount, normalizedCount: acquired.sources.length, deduplicatedCount: acquired.deduplicatedCount, futureFilteredCount: acquired.futureFilteredCount, outsideWindowFilteredCount: acquired.outsideWindowFilteredCount, unknownDateCount: acquired.unknownDateCount, sourceRoleCounts: roleCounts(roledSources), providerTransportSucceeded: Object.fromEntries(acquired.outcomes.map((item) => [item.provider, item.transportSucceeded])), providerFetchSucceeded: Object.fromEntries(acquired.outcomes.map((item) => [item.provider, item.fetchSucceeded])), providerSucceeded: Object.fromEntries(acquired.outcomes.map((item) => [item.provider, item.providerSucceeded])), providerFailed: Object.fromEntries(acquired.outcomes.map((item) => [item.provider, item.providerFailed])), providerUsableSourceCounts: Object.fromEntries(acquired.outcomes.map((item) => [item.provider, item.usableSourceCount])), assessment: assessmentSkill.reasoning, synthesis: synthesisSkill.reasoning, verification, verifiedFactCount: assessmentSkill.output.verifiedFacts.length, contradictionCount: assessmentSkill.output.contradictions.length, existingKnowledgeCount: existing.length, proposalCandidateCount: synthesisSkill.output.proposals.length, acceptedProposalCount: gatewayInputProposals.length, eventOccurrenceProposalCount: gatewayInputProposals.some((proposal) => proposal.proposalId === `event-occurrence-${eventFp}`) ? 1 : 0, diagnostics }
    let outcome = emptyOutcome(input)
    if (gatewayInputProposals.length > 0) {
      abortIfNeeded(input.signal)
      const referencedIds = new Set(gatewayInputProposals.flatMap((proposal) => proposal.sourceCandidateIds ?? [])); const evidenceBindings = roledSources.filter(({ source }) => referencedIds.has(source.candidate.candidateId)).map(({ source }) => ({ localSourceId: source.candidate.candidateId, source }))
      outcome = await new KnowledgeProductionGateway(new KnowledgeBaseRegistry()).submit({ handle: input.handle, producerType: 'event_research', producerRunId: input.workflowRunId, schemaProfile: { schemaVersion: '0.4', storageFormatVersion: '1', requiresRawProvenance: true }, entity: { localKey: 'company', entityType: 'company', name: company.name ?? company.symbol, aliases: [company.symbol], semanticFields: { ticker: company.symbol, exchange: company.exchange } }, proposals: gatewayInputProposals, evidenceBindings, asOf, now: clock }); audit.knowledgeBaseRevision = outcome.knowledgeBaseRevision; audit.committedIds = [...outcome.createdIds, ...outcome.updatedIds]; audit.sourceIds = Object.values(outcome.sourceRefsByLocalId); audit.claimIds = Object.values(outcome.claimRefsByProposalId); audit.resolutionIntents = [...outcome.resolutionIntents]
      telemetry = { ...telemetry, canonicalSourceCount: Object.keys(outcome.sourceRefsByLocalId).length, canonicalClaimCount: Object.keys(outcome.claimRefsByProposalId).length, canonicalDeltaCount: outcome.createdIds.length + outcome.updatedIds.length }
      const gatewayStatus = mapEventGatewayOutcomeStatus(outcome.status)
      if (gatewayStatus !== undefined) return { ...baseResult(input, gatewayStatus, telemetry), knowledgeBaseRevision: outcome.knowledgeBaseRevision, errors: outcome.errors, diagnostics, providerOutcomes: acquired.outcomes, acquiredSources: roledSources, existingKnowledge: existing, evidence: assessmentSkill.output, verification, sections: synthesisSkill.output.sections, assessments: synthesisSkill.output.assessments, synthesis: synthesisSkill.output, resolutionIntents: outcome.resolutionIntents, proposalIds: gatewayInputProposals.map((proposal) => proposal.proposalId) }
    }
    abortIfNeeded(input.signal)
    const report = buildReport(input, company, coverage.rootRef!, anchor, eventFp, eventDate, asOf, clock(), outcome, synthesisSkill.output.sections, accepted, roledSources, existing); const committedIds = [...outcome.createdIds, ...outcome.updatedIds]; audit.knowledgeBaseRevision = outcome.knowledgeBaseRevision; audit.committedIds = committedIds; audit.sourceIds = Object.values(outcome.sourceRefsByLocalId); audit.claimIds = Object.values(outcome.claimRefsByProposalId); audit.resolutionIntents = [...outcome.resolutionIntents]
    return { workflowRunId: input.workflowRunId, status: 'completed', knowledgeBaseId: input.handle.knowledgeBaseId, knowledgeBaseRevision: outcome.knowledgeBaseRevision, report, proposalIds: gatewayInputProposals.map((proposal) => proposal.proposalId), committedIds, sourceIds: Object.values(outcome.sourceRefsByLocalId), claimIds: Object.values(outcome.claimRefsByProposalId), errors: [], diagnostics, providerOutcomes: acquired.outcomes, acquiredSources: roledSources, existingKnowledge: existing, evidence: assessmentSkill.output, verification, sections: synthesisSkill.output.sections, assessments: synthesisSkill.output.assessments, synthesis: synthesisSkill.output, resolutionIntents: outcome.resolutionIntents, telemetry }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error); if (message === 'WORKFLOW_CANCELLED') return cancelledResult(input, telemetry, audit); const status: EventResearchWorkflowResult['status'] = ['COMPANY_COVERAGE_NOT_FOUND', 'COMPANY_COVERAGE_AMBIGUOUS', 'EVENT_SIGNAL_NOT_FOUND', 'EVENT_SIGNAL_COMPANY_MISMATCH', 'EVENT_ASOF_IN_FUTURE', 'EVENT_DATE_INVALID', 'EVENT_ANCHOR_INVALID'].includes(message) ? 'blocked' : 'failed'; const result = baseResult(input, status, telemetry); return { ...result, knowledgeBaseRevision: audit.knowledgeBaseRevision, errors: [message], providerOutcomes: audit.providerOutcomes, acquiredSources: audit.acquiredSources, existingKnowledge: audit.existingKnowledge, sections: audit.sections, assessments: audit.assessments, ...(audit.evidence === undefined ? {} : { evidence: audit.evidence }), ...(audit.verification === undefined ? {} : { verification: audit.verification }), ...(audit.synthesis === undefined ? {} : { synthesis: audit.synthesis }), ...(message === 'COMPANY_COVERAGE_NOT_FOUND' || message === 'COMPANY_COVERAGE_AMBIGUOUS' || message === 'EVENT_SIGNAL_NOT_FOUND' || message === 'EVENT_SIGNAL_COMPANY_MISMATCH' || message === 'EVENT_ASOF_IN_FUTURE' || message === 'EVENT_DATE_INVALID' || message === 'EVENT_ANCHOR_INVALID' ? { blockedReason: message as EventResearchWorkflowResult['blockedReason'] } : {}) }
  }
}

export const runEventResearchWorkflow = runEventResearch
export const resolveEventAnchor = resolveAnchor
export const resolveEventCompanyCoverage = resolveExistingCoverage
export const selectEventSources = acquireEventSources
