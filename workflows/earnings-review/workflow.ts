import { resolve } from 'node:path'
import { KnowledgeBaseRegistry } from '../../knowledge/registry/registry.ts'
import { KnowledgeProductionGateway } from '../../knowledge/production/gateway.ts'
import type { KnowledgeAssetV04, KnowledgeEntityV04 } from '../../knowledge/schema/domain-v04.ts'
import type { KnowledgeProductionOutcome } from '../../knowledge/production/contracts.ts'
import { readCanonicalV04Assets } from '../../knowledge/storage/canonical-v04-loader.ts'
import type { NormalizedResearchSource, ResearchAcquisitionDiagnostic, ResearchCompanyIdentity, ResearchProviderOutcome, ResearchSourceCandidate } from '../../plugins/research-acquisition/contracts.ts'
import { validateUsableAcquisitionPayload } from '../../plugins/research-acquisition/payload-validation.ts'
import { sha256 } from '../../plugins/research-acquisition/hash.ts'
import { normalizeCompanyCandidateIdentity } from '../../skills/knowledge-curation/identity/company-identity.ts'
import { EarningsReviewSkill, EarningsReviewSemanticError } from '../../skills/earnings-review/skill.ts'
import { computeEarningsMetrics, earningsPeriodSpec, hasUsableExactPeriod, metricStructuredValues, normalizeAkshareFinancialData, type EarningsPeriod, type EarningsPeriodSpec, type EarningsComputation } from '../../skills/earnings-review/financials.ts'
import { validateResearchReport, writeResearchReport, type ResearchReport } from '../../app/services/research-report.ts'
import type { EarningsImpactAssessment, EarningsReviewProposal, EarningsReviewSection } from '../../skills/earnings-review/contracts.ts'
import type { ResearchReportSection } from '../../app/services/research-report.ts'
import type { EarningsReviewTelemetry, EarningsReviewWorkflowInput, EarningsReviewWorkflowResult } from './contracts.ts'

const safeId = /^[A-Za-z0-9][A-Za-z0-9._-]*$/
const CLAIM_PRIORITY = new Map([['thesis', 0], ['assumption', 1], ['risk', 2], ['catalyst', 3], ['fact', 4], ['viewpoint', 5], ['trend', 6]])

export interface EarningsFilingSelection { readonly candidates: readonly ResearchSourceCandidate[]; readonly diagnostics: readonly string[]; readonly exactPeriodMatched: boolean; readonly futureFilteredCount: number }

function nowOf(input: EarningsReviewWorkflowInput): () => string { return input.now ?? (() => new Date().toISOString()) }
function emptyReasoning(): EarningsReviewTelemetry['reasoning'] { return { called: false, validated: false, applied: false, fallbackUsed: false, repairAttempts: 0, operation: 'earnings_review_synthesis' } }
function baseTelemetry(): EarningsReviewTelemetry { return { reasoning: emptyReasoning(), assessmentCount: 0, validAssessmentCount: 0, durableAssessmentCount: 0, proposalCandidateCount: 0, acceptedProposalCount: 0, canonicalSourceCount: 0, canonicalClaimCount: 0, officialEvidenceStatus: 'unavailable', structuredFinancialEvidenceStatus: 'unavailable', consensusStatus: 'unavailable' } }
function resultBase(input: EarningsReviewWorkflowInput, status: EarningsReviewWorkflowResult['status'], telemetry = baseTelemetry()): EarningsReviewWorkflowResult { return { workflowRunId: input.workflowRunId, status, knowledgeBaseId: input.handle.knowledgeBaseId, knowledgeBaseRevision: input.handle.revision, proposalIds: [], committedIds: [], sourceIds: [], claimIds: [], errors: [], selectionDiagnostics: [], acquisitionDiagnostics: [], telemetry, providerOutcomes: [] } }
function check(input: EarningsReviewWorkflowInput): void { if (!safeId.test(input.workflowRunId)) throw new Error('workflowRunId must be safe'); if (!/^\d{6}$/.test(input.company.symbol)) throw new Error('company symbol must be a six-digit A-share symbol'); if (input.handle.schemaVersion !== '0.4' || input.handle.storageFormatVersion !== '1') throw new Error('Earnings Review requires Schema 0.4 / Storage 1'); earningsPeriodSpec(input.fiscalYear, input.period); if (input.asOf !== undefined && Number.isNaN(Date.parse(input.asOf))) throw new Error('asOf must be a valid date') }
function abortIfNeeded(signal: AbortSignal | undefined): void { if (signal?.aborted) throw new Error('WORKFLOW_CANCELLED') }
function normalizeCompany(company: ResearchCompanyIdentity): ResearchCompanyIdentity {
  const normalized = normalizeCompanyCandidateIdentity({ candidateId: 'earnings-review-company', entityType: 'company', name: company.name ?? company.symbol, semanticFields: { ticker: company.symbol, ...(company.exchange === undefined ? {} : { exchange: company.exchange }) }, evidenceBlockRefs: [], reason: 'Earnings Review input identity normalization' })
  if (normalized.diagnostics.length > 0) throw new Error(`Company identity is unresolved: ${normalized.diagnostics.map((item) => item.message).join('; ')}`)
  const fields = normalized.candidate.semanticFields ?? {}; const ticker = typeof fields.ticker === 'string' ? fields.ticker : company.symbol; const exchange = typeof fields.exchange === 'string' ? fields.exchange : undefined
  if (!exchange) throw new Error(`Company exchange is unresolved for symbol ${ticker}`)
  return { symbol: ticker, name: normalized.candidate.name, exchange }
}
function normalizedText(value: unknown): string { return typeof value === 'string' ? value.normalize('NFKC').trim().toLowerCase() : '' }
function publishedBefore(candidate: ResearchSourceCandidate, asOf: string): boolean { if (!candidate.publishedAt) return true; const published = Date.parse(candidate.publishedAt); return !Number.isNaN(published) && published <= Date.parse(asOf) }
function metadataMatches(candidate: ResearchSourceCandidate, period: EarningsPeriodSpec): boolean {
  const metadata = candidate.metadata ?? {}; const fiscalYear = metadata.fiscalYear ?? metadata.year; const rawPeriod = metadata.period ?? metadata.fiscalPeriod; const yearOkay = fiscalYear === undefined || Number(fiscalYear) === period.fiscalYear; const periodOkay = rawPeriod === undefined || normalizedText(rawPeriod) === normalizedText(period.period) || normalizedText(rawPeriod) === normalizedText(period.key)
  return yearOkay && periodOkay
}
function titleMatches(candidate: ResearchSourceCandidate, period: EarningsPeriodSpec): boolean {
  const title = candidate.title.normalize('NFKC'); const year = String(period.fiscalYear); if (!title.includes(year) || !metadataMatches(candidate, period)) return false
  const aliases: Readonly<Record<EarningsPeriod, readonly string[]>> = { Q1: ['第一季度报告', '一季度报告', '一季度'], H1: ['半年度报告', '半年报', '中期报告'], Q3: ['第三季度报告', '三季度报告', '三季度'], FY: ['年度报告', '年报'] }
  return aliases[period.period].some((alias) => title.includes(alias))
}
function kindForFiling(candidate: ResearchSourceCandidate): 'full' | 'summary' | 'correction' | 'other' {
  const title = candidate.title.normalize('NFKC'); if (/摘要|摘要公告|英文版/u.test(title)) return 'summary'; if (/更正|补充|勘误/u.test(title)) return 'correction'; return 'full'
}
function candidateSort(left: ResearchSourceCandidate, right: ResearchSourceCandidate): number { const leftTime = Date.parse(left.publishedAt ?? ''); const rightTime = Date.parse(right.publishedAt ?? ''); return (Number.isNaN(rightTime) ? 0 : rightTime) - (Number.isNaN(leftTime) ? 0 : leftTime) || left.candidateId.localeCompare(right.candidateId) }

export function selectOfficialEarningsFilings(candidates: readonly ResearchSourceCandidate[], requestedInput: EarningsPeriodSpec | { readonly fiscalYear: number; readonly period: EarningsPeriod }, asOf: string): EarningsFilingSelection {
  const requested = 'key' in requestedInput ? requestedInput : earningsPeriodSpec(requestedInput.fiscalYear, requestedInput.period)
  const diagnostics: string[] = []; let futureFilteredCount = 0; const eligible: ResearchSourceCandidate[] = []
  for (const candidate of candidates) { if (candidate.kind !== 'official_disclosure') continue; if (!publishedBefore(candidate, asOf)) { futureFilteredCount += 1; continue } if (titleMatches(candidate, requested)) eligible.push(candidate) }
  const unique = [...new Map(eligible.map((candidate) => [candidate.candidateId, candidate])).values()]; const full = unique.filter((candidate) => kindForFiling(candidate) === 'full').sort(candidateSort); const corrections = unique.filter((candidate) => kindForFiling(candidate) === 'correction').sort(candidateSort); const summaries = unique.filter((candidate) => kindForFiling(candidate) === 'summary').sort(candidateSort)
  let selected: ResearchSourceCandidate[] = []
  if (full.length > 0) selected = [full[0]!, ...corrections.slice(0, 2)]
  else if (summaries.length > 0) { selected = [summaries[0]!]; diagnostics.push('Full exact-period filing unavailable; selected deterministic summary fallback') }
  else diagnostics.push(`No exact official filing matched ${requested.key}`)
  if (futureFilteredCount > 0) diagnostics.push(`Excluded ${futureFilteredCount} future-published filing candidate(s)`)
  return { candidates: selected, diagnostics, exactPeriodMatched: selected.length > 0, futureFilteredCount }
}

async function acquireOfficial(input: EarningsReviewWorkflowInput, company: ResearchCompanyIdentity, period: EarningsPeriodSpec, asOf: string): Promise<{ sources: readonly NormalizedResearchSource[]; selection: EarningsFilingSelection; diagnostics: readonly ResearchAcquisitionDiagnostic[]; outcome: ResearchProviderOutcome }> {
  const plugin = input.acquisitionPlugins.find((item) => item.name.toLowerCase().includes('official'))
  if (!plugin) return { sources: [], selection: { candidates: [], diagnostics: ['Official disclosure plugin is not configured'], exactPeriodMatched: false, futureFilteredCount: 0 }, diagnostics: [{ provider: 'cninfo', status: 'failed', reason: 'Official disclosure plugin is not configured' }], outcome: { provider: 'cninfo', providerAttempted: false, providerSucceeded: false, providerEmpty: false, providerFailed: true, usableSourceCount: 0 } }
  const diagnostics: ResearchAcquisitionDiagnostic[] = []; let discovered: readonly ResearchSourceCandidate[] = []
  try { discovered = await plugin.discover({ company, asOf, limitPerKind: Math.min(input.maxSources ?? 20, 20) }) } catch (error) { const reason = error instanceof Error ? error.message : String(error); return { sources: [], selection: { candidates: [], diagnostics: [reason], exactPeriodMatched: false, futureFilteredCount: 0 }, diagnostics: [{ provider: 'cninfo', status: 'failed', reason }], outcome: { provider: 'cninfo', providerAttempted: true, providerSucceeded: false, providerEmpty: false, providerFailed: true, usableSourceCount: 0 } } }
  const selection = selectOfficialEarningsFilings(discovered, period, asOf); const sources: NormalizedResearchSource[] = []
  for (const candidate of selection.candidates) {
    abortIfNeeded(input.signal)
    try { const fetched = await plugin.fetch(candidate); const payload = validateUsableAcquisitionPayload(fetched.content); if (payload.status !== 'usable') { diagnostics.push({ provider: candidate.provider, candidateId: candidate.candidateId, kind: candidate.kind, status: payload.status, reason: payload.reason }); continue }; sources.push(await plugin.normalize(fetched)) } catch (error) { diagnostics.push({ provider: candidate.provider, candidateId: candidate.candidateId, kind: candidate.kind, status: 'failed', reason: error instanceof Error ? error.message : String(error) }) }
  }
  return { sources, selection, diagnostics, outcome: { provider: 'cninfo', providerAttempted: true, providerSucceeded: sources.length > 0, providerEmpty: discovered.length === 0 || (selection.candidates.length === 0 && diagnostics.length === 0), providerFailed: diagnostics.some((item) => item.status === 'failed'), usableSourceCount: sources.length } }
}

async function acquireStructured(input: EarningsReviewWorkflowInput, company: ResearchCompanyIdentity, period: EarningsPeriodSpec): Promise<{ source?: NormalizedResearchSource; computation?: EarningsComputation; outcome: ResearchProviderOutcome; diagnostic?: ResearchAcquisitionDiagnostic }> {
  if (!input.akshare) return { outcome: { provider: 'akshare', providerAttempted: false, providerSucceeded: false, providerEmpty: false, providerFailed: false, usableSourceCount: 0 } }
  try {
    const raw = await input.akshare.financialData({ symbol: company.symbol }); const candidateId = `akshare-earnings-${company.symbol}-${period.key}`; const normalized = normalizeAkshareFinancialData(raw, period, candidateId); const computation = computeEarningsMetrics(normalized)
    if (!hasUsableExactPeriod(normalized)) return { computation, outcome: { provider: 'akshare', providerAttempted: true, providerSucceeded: false, providerEmpty: true, providerFailed: false, usableSourceCount: 0 }, diagnostic: { provider: 'akshare', candidateId, kind: 'structured_data', status: 'empty', reason: normalized.diagnostics.join('; ') || `No usable exact-period financial data for ${period.key}` } }
    const snapshot = { requested: period, current: normalized.current ?? null, priorYear: normalized.priorYear ?? null, verifiedMetrics: metricStructuredValues(computation), unavailable: computation.unavailable }
    const content = JSON.stringify(snapshot); const candidate: ResearchSourceCandidate = { candidateId, kind: 'structured_data', tier: 2, title: `AKShare earnings financial snapshot ${period.key}`, provider: 'akshare', metadata: { companySymbol: company.symbol, dataKind: 'earnings_financial', period: period.key } }
    return { source: { candidate, retrievedAt: (input.now ?? (() => new Date().toISOString()))(), title: candidate.title, content, contentHash: sha256(content), publisher: 'AKShare', rights: { accessScope: 'public', retentionAllowed: true, aiProcessingAllowed: true, derivativeKnowledgeAllowed: true, redistributionAllowed: false } }, computation, outcome: { provider: 'akshare', providerAttempted: true, providerSucceeded: true, providerEmpty: false, providerFailed: false, usableSourceCount: 1 } }
  } catch (error) { return { outcome: { provider: 'akshare', providerAttempted: true, providerSucceeded: false, providerEmpty: false, providerFailed: true, usableSourceCount: 0 }, diagnostic: { provider: 'akshare', kind: 'structured_data', status: 'failed', reason: error instanceof Error ? error.message : String(error) } } }
}

function isCompany(object: KnowledgeAssetV04, company: ResearchCompanyIdentity): object is KnowledgeEntityV04 { if (!object.id.startsWith('entity:')) return false; const value = object as KnowledgeEntityV04; return value.type === 'company' && normalizedText(value.ticker) === normalizedText(company.symbol) && normalizedText(value.exchange) === normalizedText(company.exchange) }
async function existingCoverage(input: EarningsReviewWorkflowInput, company: ResearchCompanyIdentity): Promise<{ rootRef?: string; claims: readonly Record<string, unknown>[]; projection: readonly Record<string, unknown>[]; reason?: EarningsReviewWorkflowResult['blockedReason'] }> {
  const assets = await readCanonicalV04Assets(input.handle.rootRef); const matches = assets.objects.map((item) => item.value).filter((object): object is KnowledgeAssetV04 => isCompany(object, company)); if (matches.length === 0) return { reason: 'COMPANY_COVERAGE_NOT_FOUND', claims: [], projection: [] }; if (matches.length > 1) return { reason: 'COMPANY_COVERAGE_AMBIGUOUS', claims: [], projection: [] }
  const rootRef = matches[0]!.id; const gateway = new KnowledgeProductionGateway(new KnowledgeBaseRegistry()); const projection = await gateway.projectExistingKnowledge(input.handle, company); const claims = projection.filter((item) => item.kind === 'claim' && Array.isArray(item.subjectRefs) && item.subjectRefs.includes(rootRef)).sort((left, right) => (CLAIM_PRIORITY.get(String(left.claimType)) ?? 99) - (CLAIM_PRIORITY.get(String(right.claimType)) ?? 99) || String(left.canonicalRef).localeCompare(String(right.canonicalRef))).slice(0, 40)
  return { rootRef, claims, projection }
}

function evidenceTier(candidateId: string, sources: readonly NormalizedResearchSource[]): 1 | 2 | undefined { const source = sources.find((item) => item.candidate.candidateId === candidateId); if (!source) return undefined; return source.candidate.kind === 'official_disclosure' ? 1 : source.candidate.kind === 'structured_data' && source.candidate.metadata?.period !== undefined ? 2 : undefined }
export function validateEarningsImpactAssessments(assessments: readonly EarningsImpactAssessment[], claims: readonly Record<string, unknown>[], sources: readonly NormalizedResearchSource[]): { readonly valid: readonly EarningsImpactAssessment[]; readonly durable: readonly EarningsImpactAssessment[] } {
  const claimMap = new Map(claims.map((claim) => [String(claim.canonicalRef), claim])); const valid: EarningsImpactAssessment[] = []; const durable: EarningsImpactAssessment[] = []
  for (const assessment of assessments) {
    const refsValid = assessment.existingKnowledgeRefs.every((ref) => /^claim:[^\s]+$/.test(ref) && claimMap.has(ref)); const evidenceValid = assessment.sourceCandidateIds.length > 0 && assessment.sourceCandidateIds.every((id) => evidenceTier(id, sources) !== undefined); if (!refsValid || !evidenceValid) continue
    const referenced = assessment.existingKnowledgeRefs.map((ref) => claimMap.get(ref)!).filter(Boolean); const needsExisting = ['supports_existing', 'contradicts_existing', 'changes_assumption', 'affects_thesis'].includes(assessment.disposition); const correctType = assessment.disposition === 'changes_assumption' ? referenced.some((claim) => claim.claimType === 'assumption') : assessment.disposition === 'affects_thesis' ? referenced.some((claim) => claim.claimType === 'thesis') : true
    if (needsExisting && referenced.length === 0) continue; valid.push(assessment)
    const eligible = assessment.disposition !== 'no_change' && assessment.disposition !== 'research_gap' && (!needsExisting || correctType) && assessment.sourceCandidateIds.some((id) => evidenceTier(id, sources) === 1 || evidenceTier(id, sources) === 2)
    if (eligible) durable.push(assessment)
  }
  return { valid, durable }
}
function claimTypeCompatible(proposal: EarningsReviewProposal, assessments: ReadonlyMap<string, EarningsImpactAssessment>): boolean {
  const claimType = proposal.claimType; if (!claimType) return false; const refs = proposal.assessmentRefs.map((ref) => assessments.get(ref)).filter((item): item is EarningsImpactAssessment => item !== undefined).filter((item) => item.disposition !== 'no_change' && item.disposition !== 'research_gap'); if (!refs.length) return false
  return refs.every((assessment) => assessment.disposition === 'new_fact' ? claimType === 'fact' : assessment.disposition === 'changes_assumption' ? claimType === 'assumption' : assessment.disposition === 'affects_thesis' ? claimType === 'thesis' : assessment.disposition === 'new_catalyst' ? claimType === 'catalyst' : assessment.disposition === 'new_risk' ? claimType === 'risk' : ['fact', 'viewpoint', 'risk', 'catalyst'].includes(claimType))
}
function structuredValueMatches(proposal: EarningsReviewProposal, computation: EarningsComputation): boolean { if (proposal.structuredValue === undefined || proposal.structuredValue === null) return true; const value = proposal.structuredValue; if (typeof value.metric !== 'string' || typeof value.value !== 'number' || !Number.isFinite(value.value) || typeof value.unit !== 'string' || typeof value.period !== 'string') return false; const expected = computation.byMetric[value.metric]; return expected !== undefined && expected.value === value.value && expected.unit === value.unit && expected.period === value.period }
export function filterEarningsReviewProposals(proposals: readonly EarningsReviewProposal[], assessments: readonly EarningsImpactAssessment[], claims: readonly Record<string, unknown>[], sources: readonly NormalizedResearchSource[], computation: EarningsComputation): readonly EarningsReviewProposal[] {
  const byId = new Map(assessments.map((assessment) => [assessment.assessmentId, assessment])); const durable = new Set(validateEarningsImpactAssessments(assessments, claims, sources).durable.map((assessment) => assessment.assessmentId)); const seen = new Set<string>(); const accepted: EarningsReviewProposal[] = []
  for (const proposal of proposals) {
    const sourceIds = proposal.sourceCandidateIds ?? []; const refs = proposal.assessmentRefs ?? []; const validRefs = refs.length > 0 && refs.every((ref) => byId.has(ref)); const durableRefs = refs.filter((ref) => durable.has(ref)); const sourceSet = new Set(durableRefs.flatMap((ref) => byId.get(ref)?.sourceCandidateIds ?? [])); const validSources = sourceIds.length > 0 && sourceIds.every((id) => sources.some((source) => source.candidate.candidateId === id)) && sourceIds.every((id) => sourceSet.has(id))
    if (proposal.kind !== 'claim' || proposal.subjectKey !== 'company' || !safeId.test(proposal.proposalId) || seen.has(proposal.proposalId) || !proposal.statement?.trim() || !validRefs || durableRefs.length === 0 || !validSources || !claimTypeCompatible(proposal, byId) || !structuredValueMatches(proposal, computation)) continue
    seen.add(proposal.proposalId); accepted.push({ ...proposal, assessmentRefs: refs, sourceCandidateIds: sourceIds, temporal: undefined })
  }
  return accepted
}

function reportSections(sections: readonly EarningsReviewSection[], proposals: readonly EarningsReviewProposal[], sources: readonly NormalizedResearchSource[], outcomeSources: Readonly<Record<string, string>>, outcomeClaims: Readonly<Record<string, string>>): ResearchReportSection[] {
  return sections.map((section) => {
    const sectionAssessmentRefs = new Set(section.assessmentRefs)
    const sectionProposalIds = proposals.filter((proposal) => proposal.assessmentRefs.some((assessmentRef) => sectionAssessmentRefs.has(assessmentRef))).map((proposal) => proposal.proposalId)
    return { id: section.id, title: section.title, markdown: section.markdown, sourceRefs: section.sourceCandidateIds.map((id) => outcomeSources[id]).filter((id): id is string => id !== undefined), claimRefs: sectionProposalIds.map((proposalId) => outcomeClaims[proposalId]).filter((id): id is string => id !== undefined), evidenceLinks: section.sourceCandidateIds.flatMap((id) => { const source = sources.find((item) => item.candidate.candidateId === id); return source?.candidate.url ? [source.candidate.url] : [`evidence:${id}`] }) }
  })
}

export async function runEarningsReview(input: EarningsReviewWorkflowInput): Promise<EarningsReviewWorkflowResult> {
  let telemetry = baseTelemetry();
  try {
    check(input); const company = normalizeCompany(input.company); const now = nowOf(input); const asOf = input.asOf ?? now(); const period = earningsPeriodSpec(input.fiscalYear, input.period); abortIfNeeded(input.signal)
    const coverage = await existingCoverage(input, company); if (coverage.reason) return { ...resultBase(input, 'blocked', telemetry), blockedReason: coverage.reason, errors: [coverage.reason === 'COMPANY_COVERAGE_NOT_FOUND' ? 'Existing canonical Company coverage was not found; run research_company first.' : 'Multiple canonical Company matches were found; Earnings Review is blocked until coverage is unambiguous.'] }
    const official = await acquireOfficial(input, company, period, asOf); const structured = await acquireStructured(input, company, period); const sources = [...official.sources, ...(structured.source === undefined ? [] : [structured.source])]; const selectionDiagnostics = official.selection.diagnostics; const acquisitionDiagnostics = [...official.diagnostics, ...(structured.diagnostic === undefined ? [] : [structured.diagnostic])]; telemetry = { ...telemetry, officialEvidenceStatus: official.selection.futureFilteredCount > 0 && official.sources.length === 0 ? 'future_filtered' : official.sources.length > 0 ? 'available' : 'unavailable', structuredFinancialEvidenceStatus: structured.source === undefined ? 'unavailable' : 'available' }
    if (sources.length === 0) return { ...resultBase(input, 'blocked', telemetry), blockedReason: 'EARNINGS_PERIOD_EVIDENCE_UNAVAILABLE', errors: ['EARNINGS_PERIOD_EVIDENCE_UNAVAILABLE: no exact-period official filing or usable exact-period structured financial evidence was available.'], providerOutcomes: [official.outcome, structured.outcome], selectionDiagnostics, acquisitionDiagnostics, telemetry }
    abortIfNeeded(input.signal)
    const computation = structured.computation ?? { metrics: [], byMetric: {}, unavailable: ['all structured financial metrics'] }; const skillInput = { company, period, officialSources: official.sources.map((source) => ({ candidateId: source.candidate.candidateId, title: source.title, publishedAt: source.candidate.publishedAt, content: source.content, url: source.candidate.url })), financialMetrics: { verified: metricStructuredValues(computation) }, existingKnowledgeClaims: coverage.claims }
    const skill = new EarningsReviewSkill(now, input.reasoningExecutor); let semantic
    try { semantic = await skill.synthesize(skillInput, computation) } catch (error) { const reason = error instanceof EarningsReviewSemanticError ? error.message : 'semantic reasoning failed'; semantic = skill.fallback(skillInput, computation, reason) }
    const assessments = semantic.assessments; const assessmentValidation = validateEarningsImpactAssessments(assessments, coverage.claims, sources); const validAssessments = assessmentValidation.valid; const durableAssessments = assessmentValidation.durable; const candidates = filterEarningsReviewProposals(semantic.proposals, durableAssessments, coverage.claims, sources, computation); telemetry = { ...telemetry, reasoning: semantic.reasoning, assessmentCount: assessments.length, validAssessmentCount: validAssessments.length, durableAssessmentCount: durableAssessments.length, proposalCandidateCount: semantic.proposals.length, acceptedProposalCount: candidates.length }
    const gateway = new KnowledgeProductionGateway(new KnowledgeBaseRegistry()); let outcome: KnowledgeProductionOutcome = { status: 'no_changes', knowledgeBaseId: input.handle.knowledgeBaseId, knowledgeBaseRevision: input.handle.revision, baseRevision: input.handle.revision, createdIds: [], updatedIds: [], sourceRefsByLocalId: {}, claimRefsByProposalId: {}, entityRefsByLocalKey: {}, relationRefsByProposalId: {}, resolutionIntents: [], errors: [] }
    if (candidates.length > 0) {
      const referencedSourceIds = new Set(candidates.flatMap((proposal) => proposal.sourceCandidateIds ?? [])); const bindings = sources.filter((source) => referencedSourceIds.has(source.candidate.candidateId)).map((source) => ({ localSourceId: source.candidate.candidateId, source })); const submitted = await gateway.submit({ handle: input.handle, producerType: 'earnings_review', producerRunId: input.workflowRunId, schemaProfile: { schemaVersion: '0.4', storageFormatVersion: '1', requiresRawProvenance: true }, entity: { localKey: 'company', entityType: 'company', name: company.name ?? company.symbol, aliases: [company.symbol], semanticFields: { ticker: company.symbol, exchange: company.exchange } }, proposals: candidates.map(({ assessmentRefs: _assessmentRefs, ...proposal }) => proposal), evidenceBindings: bindings, asOf, now }); outcome = submitted
      if (submitted.status === 'blocked' || submitted.status === 'failed') return { ...resultBase(input, 'blocked', { ...telemetry, canonicalSourceCount: Object.keys(submitted.sourceRefsByLocalId).length, canonicalClaimCount: Object.keys(submitted.claimRefsByProposalId).length }), errors: submitted.errors, providerOutcomes: [official.outcome, structured.outcome], selectionDiagnostics, acquisitionDiagnostics, sections: semantic.sections, assessments }
    }
    const reportId = `earnings-review-${company.symbol}-${period.key}-${input.workflowRunId}`; const report: ResearchReport = validateResearchReport({ reportId, reportType: 'earnings_review', subjectRefs: [coverage.rootRef!], generatedAt: now(), asOf, workflowRunId: input.workflowRunId, knowledgeBaseRevision: outcome.knowledgeBaseRevision, sourceRefs: Object.values(outcome.sourceRefsByLocalId), claimRefs: Object.values(outcome.claimRefsByProposalId), methodology: 'Exact-period official disclosure plus period-scoped AKShare financial normalization, deterministic computation, bounded Earnings Review reasoning, and Gateway-mediated canonical mutation.', sections: reportSections(semantic.sections, candidates, sources, outcome.sourceRefsByLocalId, outcome.claimRefsByProposalId), outputPath: `${reportId}.md` }); const outputPath = await writeResearchReport(report, resolve(input.reportRoot)); const committed = [...outcome.createdIds, ...outcome.updatedIds]; telemetry = { ...telemetry, canonicalSourceCount: Object.keys(outcome.sourceRefsByLocalId).length, canonicalClaimCount: Object.keys(outcome.claimRefsByProposalId).length }
    return { workflowRunId: input.workflowRunId, status: 'completed', knowledgeBaseId: input.handle.knowledgeBaseId, knowledgeBaseRevision: outcome.knowledgeBaseRevision, report: { reportId, outputPath }, proposalIds: candidates.map((proposal) => proposal.proposalId), committedIds: committed, sourceIds: Object.values(outcome.sourceRefsByLocalId), claimIds: Object.values(outcome.claimRefsByProposalId), errors: [], selectionDiagnostics, acquisitionDiagnostics, sections: semantic.sections, assessments, telemetry, providerOutcomes: [official.outcome, structured.outcome] }
  } catch (error) { const message = error instanceof Error ? error.message : String(error); if (message === 'WORKFLOW_CANCELLED') return { ...resultBase(input, 'cancelled', telemetry), errors: [message] }; return { ...resultBase(input, 'failed', telemetry), errors: [message] } }
}
