import { resolve } from 'node:path'
import { KnowledgeBaseRegistry } from '../../knowledge/registry/registry.ts'
import { KnowledgeProductionGateway } from '../../knowledge/production/gateway.ts'
import type { SemanticProductionProposal } from '../../knowledge/production/contracts.ts'
import type { KnowledgeProductionOutcome } from '../../knowledge/production/contracts.ts'
import { readCanonicalV04Assets } from '../../knowledge/storage/canonical-v04-loader.ts'
import type { NormalizedResearchSource, ResearchCompanyIdentity } from '../../plugins/research-acquisition/contracts.ts'
import { sha256 } from '../../plugins/research-acquisition/hash.ts'
import { validateUsableAcquisitionPayload } from '../../plugins/research-acquisition/payload-validation.ts'
import { normalizeExchange } from '../../skills/knowledge-curation/identity/company-identity.ts'
import { canonicalizeValuationViewpointStatement, deterministicValuationAssumptionStatement, deterministicValuationEvidence, expectedValuationAssumptionStructuredValue, expectedValuationViewpointStructuredValue, validateValuationStructuredValue, ValuationAssumptionDesignSkill, ValuationSynthesisSkill } from '../../skills/valuation/skill.ts'
import { VALUATION_REPORT_SECTIONS, type ValuationAssumptionPlan, type ValuationBasis, type ValuationComputation, type ValuationMethod, type ValuationSynthesisOutput, type ValuationSynthesisProposal } from '../../skills/valuation/contracts.ts'
import { buildValuationBasis, calculateValuation, methodEligibility, normalizeValuationFinancialData, normalizeValuationMarketData, referenceMultiples, selectValuationBasis } from '../../skills/valuation/financials.ts'
import { validateResearchReport, writeResearchReport, type ResearchReport, type ResearchReportSection } from '../../app/services/research-report.ts'
import type { ValuationProviderOutcome, ValuationTelemetrySnapshot, ValuationWorkflowInput, ValuationWorkflowResult } from './contracts.ts'

const safeId = /^[A-Za-z0-9][A-Za-z0-9._-]*$/
const DEFAULT_EXCHANGE = (symbol: string): string | undefined => symbol.startsWith('6') ? 'SH' : symbol.startsWith('0') || symbol.startsWith('3') ? 'SZ' : symbol.startsWith('4') || symbol.startsWith('8') ? 'BJ' : undefined
type Dict = Record<string, unknown>

function nowOf(input: ValuationWorkflowInput): () => string { return input.now ?? (() => new Date().toISOString()) }
function abortIfNeeded(signal: AbortSignal | undefined): void { if (signal?.aborted) throw new Error('WORKFLOW_CANCELLED') }
function rowsOf(value: unknown): readonly Dict[] { if (Array.isArray(value)) return value.filter((item): item is Dict => Boolean(item) && typeof item === 'object' && !Array.isArray(item)); if (value && typeof value === 'object' && !Array.isArray(value) && Array.isArray((value as Dict).data)) return rowsOf((value as Dict).data); return [] }
function normalizedCompany(company: ResearchCompanyIdentity): ResearchCompanyIdentity { const exchange = normalizeExchange(company.exchange ?? DEFAULT_EXCHANGE(company.symbol) ?? ''); return { symbol: company.symbol, name: company.name ?? company.symbol, exchange } }
function baseTelemetry(overrides: Partial<ValuationTelemetrySnapshot> = {}): ValuationTelemetrySnapshot { return { companyCoverageResolved: false, marketDataUsable: false, financialBasisUsable: false, pointInTimeVerified: false, eligibleMethods: [], assumptionDesign: { called: false, validated: false, applied: false, fallbackUsed: false, repairAttempts: 0, operation: 'valuation_assumption_design' }, computation: { scenarioCount: 0, calculatedScenarioCount: 0, sensitivityCellCount: 0, deterministicRecomputeStatus: 'unavailable' }, synthesis: { called: false, validated: false, applied: false, fallbackUsed: false, repairAttempts: 0, operation: 'valuation_synthesis' }, modelDerivedInterpretiveSectionCount: 0, proposalCandidateCount: 0, acceptedProposalCount: 0, canonicalSourceCount: 0, canonicalClaimCount: 0, ...overrides } }
function emptyProvider(): ValuationProviderOutcome { return { providerAttempted: false, transportSucceeded: false, companyBasicRowCount: 0, financialRowCount: 0, marketRowCount: 0, marketPriceFound: false, fiscalYearBasisFound: false, peEligible: false, pbEligible: false, evEbitdaEligible: false, usableForValuation: false } }
function companyMatch(value: Dict, company: ResearchCompanyIdentity): boolean { return value.type === 'company' && typeof value.ticker === 'string' && value.ticker === company.symbol && typeof value.exchange === 'string' && normalizeExchange(value.exchange) === company.exchange }
async function existingCompany(input: ValuationWorkflowInput, company: ResearchCompanyIdentity): Promise<{ readonly ref?: string; readonly claims: readonly Dict[]; readonly reason?: ValuationWorkflowResult['blockedReason'] }> { const assets = await readCanonicalV04Assets(input.handle.rootRef); const matches = assets.objects.filter((item) => companyMatch(item.value as unknown as Dict, company)); if (matches.length === 0) return { reason: 'COMPANY_COVERAGE_NOT_FOUND', claims: [] }; if (matches.length > 1) return { reason: 'COMPANY_COVERAGE_AMBIGUOUS', claims: [] }; const gateway = new KnowledgeProductionGateway(new KnowledgeBaseRegistry()); const projection = await gateway.projectExistingKnowledge(input.handle, company); return { ref: matches[0]!.value.id, claims: projection.filter((item) => item.kind === 'claim' && Array.isArray(item.subjectRefs) && item.subjectRefs.includes(matches[0]!.value.id)).slice(0, 40) }
}
function makeSource(candidateId: string, title: string, data: unknown, company: ResearchCompanyIdentity, retrievedAt: string, metadata: Readonly<Record<string, unknown>>): NormalizedResearchSource { const content = JSON.stringify(data); return { candidate: { candidateId, kind: 'structured_data', tier: 2, title, provider: 'akshare', metadata: { companySymbol: company.symbol, ...metadata } }, retrievedAt, title, content, contentHash: sha256(content), publisher: 'AKShare', rights: { accessScope: 'public', retentionAllowed: true, aiProcessingAllowed: true, derivativeKnowledgeAllowed: true, redistributionAllowed: false } } }
async function acquire(input: ValuationWorkflowInput, company: ResearchCompanyIdentity, valuationDate: string, asOf: string | undefined, clock: () => string): Promise<{ readonly marketValue: unknown; readonly financialValue: unknown; readonly basicValue: unknown; readonly sources: readonly NormalizedResearchSource[]; readonly providerOutcome: ValuationProviderOutcome; readonly diagnostics: readonly string[] }> {
  if (!input.akshare) return { marketValue: [], financialValue: [], basicValue: [], sources: [], providerOutcome: emptyProvider(), diagnostics: ['AKShare client is unavailable'] }
  let basicValue: unknown = []; let financialValue: unknown = []; let marketValue: unknown = []; let financialRetrievedAt: string | undefined; let marketRetrievedAt: string | undefined; let transportSucceeded = true; const diagnostics: string[] = []
  try { basicValue = await input.akshare.companyBasic({ symbol: company.symbol }); abortIfNeeded(input.signal) } catch (error) { if (error instanceof Error && error.message === 'WORKFLOW_CANCELLED') throw error; transportSucceeded = false; diagnostics.push(`companyBasic: ${error instanceof Error ? error.message : String(error)}`) } abortIfNeeded(input.signal)
  try { financialValue = await input.akshare.financialData({ symbol: company.symbol }); financialRetrievedAt = clock(); abortIfNeeded(input.signal) } catch (error) { if (error instanceof Error && error.message === 'WORKFLOW_CANCELLED') throw error; transportSucceeded = false; diagnostics.push(`financialData: ${error instanceof Error ? error.message : String(error)}`) } abortIfNeeded(input.signal)
  try { marketValue = await input.akshare.historicalMarketData({ symbol: company.symbol }); marketRetrievedAt = clock(); abortIfNeeded(input.signal) } catch (error) { if (error instanceof Error && error.message === 'WORKFLOW_CANCELLED') throw error; transportSucceeded = false; diagnostics.push(`historicalMarketData: ${error instanceof Error ? error.message : String(error)}`) } abortIfNeeded(input.signal)
  const market = normalizeValuationMarketData(marketValue, valuationDate); const financial = normalizeValuationFinancialData(financialValue); const selected = selectValuationBasis(financial.rows, valuationDate, asOf); const sources: NormalizedResearchSource[] = []
  if (validateUsableAcquisitionPayload(marketValue).status === 'usable' && market.observation && marketRetrievedAt) sources.push(makeSource(`akshare-valuation-market-${company.symbol}-${market.observation.priceDate}`, 'AKShare valuation market snapshot', { symbol: company.symbol, priceDate: market.observation.priceDate, close: market.observation.close, currency: 'CNY/share' }, company, marketRetrievedAt, { dataKind: 'valuation-market', valuationEvidenceRole: 'market', priceDate: market.observation.priceDate }))
  if (validateUsableAcquisitionPayload(financialValue).status === 'usable' && selected.basis && financialRetrievedAt) sources.push(makeSource(`akshare-valuation-financial-${company.symbol}-${selected.basis.basisFiscalYear}`, 'AKShare valuation financial basis snapshot', selected.basis, company, financialRetrievedAt, { dataKind: 'valuation-financial', valuationEvidenceRole: 'financial', basisFiscalYear: selected.basis.basisFiscalYear }))
  const outcome: ValuationProviderOutcome = { providerAttempted: true, transportSucceeded, companyBasicRowCount: rowsOf(basicValue).length, financialRowCount: rowsOf(financialValue).length, marketRowCount: rowsOf(marketValue).length, marketPriceFound: market.observation !== undefined, fiscalYearBasisFound: selected.basis !== undefined, peEligible: selected.basis !== undefined && selected.basis.eps !== undefined && selected.basis.eps > 0, pbEligible: selected.basis !== undefined && selected.basis.bvps !== undefined && selected.basis.bvps > 0, evEbitdaEligible: selected.basis !== undefined && selected.basis.ebitda !== undefined && selected.basis.ebitda > 0 && selected.basis.netDebt !== undefined && selected.basis.shares !== undefined && selected.basis.shares > 0, usableForValuation: market.observation !== undefined && selected.basis !== undefined }
  return { marketValue, financialValue, basicValue, sources, providerOutcome: outcome, diagnostics: [...diagnostics, ...market.diagnostics, ...financial.diagnostics, ...selected.diagnostics] }
}
function requestedMethods(input: ValuationWorkflowInput, eligible: readonly ValuationMethod[]): readonly ValuationMethod[] { if (input.methods === undefined) return eligible; return [...new Set(input.methods)].filter((method) => eligible.includes(method)) }
export function validProposal(proposal: ValuationSynthesisProposal, plan: ValuationAssumptionPlan, computation: ValuationComputation, sourceIds: ReadonlySet<string>, claimRefs: ReadonlySet<string>): boolean {
  const proposalSources = proposal.sourceCandidateIds ?? []
  if (proposal.kind !== 'claim' || proposal.subjectKey !== 'company' || (proposal.claimType !== 'assumption' && proposal.claimType !== 'viewpoint') || proposalSources.length === 0 || !proposalSources.every((id) => sourceIds.has(id)) || !proposal.existingKnowledgeRefs.every((ref) => claimRefs.has(ref))) return false
  if (proposal.claimType === 'assumption') {
    if (proposal.valuationAssumptionRefs.length !== 1 || !['base-growth', 'base-multiple'].includes(proposal.valuationAssumptionRefs[0] ?? '') || proposal.valuationResultRefs.length !== 0) return false
    const baseScenario = plan.scenarios.find((item) => item.scenarioId === 'base')
    if (baseScenario === undefined || !proposalSources.every((id) => baseScenario.sourceCandidateIds.includes(id))) return false
    return proposal.structuredValue === undefined || validateValuationStructuredValue(proposal.structuredValue, expectedValuationAssumptionStructuredValue(plan, proposal.valuationAssumptionRefs[0] as 'base-growth' | 'base-multiple'))
  }
  if (proposal.valuationAssumptionRefs.length !== 0 || proposal.valuationResultRefs.length !== 1 || proposal.valuationResultRefs[0] !== 'result-base') return false
  if (proposal.structuredValue === undefined) return true
  const metric = proposal.structuredValue && typeof proposal.structuredValue.metric === 'string' ? proposal.structuredValue.metric : undefined
  if (metric !== 'target_price' && metric !== 'implied_return_pct' && metric !== 'reference_multiple') return false
  return validateValuationStructuredValue(proposal.structuredValue, expectedValuationViewpointStructuredValue(plan, computation, metric))
}
export function toGatewayProposals(proposals: readonly ValuationSynthesisProposal[], plan: ValuationAssumptionPlan, computation: ValuationComputation): readonly SemanticProductionProposal[] {
  if (proposals.length > 3) throw new Error('proposal_count_exceeds_three')
  const converted: SemanticProductionProposal[] = proposals.map((proposal) => {
    if (typeof proposal.statement !== 'string' || proposal.statement.trim() === '') throw new Error('proposal_statement_missing')
    if (proposal.claimType === 'assumption' && (proposal.valuationAssumptionRefs.length !== 1 || (proposal.structuredValue !== undefined && !validateValuationStructuredValue(proposal.structuredValue, expectedValuationAssumptionStructuredValue(plan, proposal.valuationAssumptionRefs[0] as 'base-growth' | 'base-multiple'))))) throw new Error('proposal_structured_value_mismatch')
    const viewpointMetric = proposal.structuredValue && typeof proposal.structuredValue.metric === 'string' && ['target_price', 'implied_return_pct', 'reference_multiple'].includes(proposal.structuredValue.metric) ? proposal.structuredValue.metric as 'target_price' | 'implied_return_pct' | 'reference_multiple' : 'target_price'
    const structuredValue = proposal.claimType === 'assumption' ? expectedValuationAssumptionStructuredValue(plan, proposal.valuationAssumptionRefs[0] as 'base-growth' | 'base-multiple') : expectedValuationViewpointStructuredValue(plan, computation, viewpointMetric)
    if (proposal.claimType === 'viewpoint' && proposal.structuredValue !== undefined && !validateValuationStructuredValue(proposal.structuredValue, expectedValuationViewpointStructuredValue(plan, computation, viewpointMetric))) throw new Error('proposal_structured_value_mismatch')
    const statement = proposal.claimType === 'assumption' ? deterministicValuationAssumptionStatement(plan, 'base') : canonicalizeValuationViewpointStatement(proposal.statement, plan, computation)
    return { proposalId: proposal.proposalId, kind: 'claim' as const, claimType: proposal.claimType, subjectKey: proposal.subjectKey, statement, sourceCandidateIds: proposal.sourceCandidateIds, structuredValue: structuredValue as unknown as Readonly<Record<string, unknown>>, ...(proposal.temporal === undefined ? {} : { temporal: proposal.temporal }), ...(proposal.confidence === undefined ? {} : { confidence: proposal.confidence }), ...(proposal.probability === undefined ? {} : { probability: proposal.probability }), resolution: 'supersede' as const }
  })
  const ordered = [...converted].sort((left, right) => Number(right.claimType === 'assumption') - Number(left.claimType === 'assumption'))
  const submittedAssumptionIds = new Set(ordered.filter((proposal) => proposal.claimType === 'assumption').map((proposal) => proposal.proposalId))
  return ordered.map((proposal) => proposal.claimType === 'viewpoint' && submittedAssumptionIds.size > 0 ? { ...proposal, dependsOnProposalIds: [...submittedAssumptionIds] } : proposal)
}
function reportMarkdown(title: string, value: string): string { return `### ${title}\n\n${value}` }
function reportSections(company: ResearchCompanyIdentity, basis: ValuationBasis | undefined, eligible: readonly ValuationMethod[], plan: ValuationAssumptionPlan | undefined, computation: ValuationComputation | undefined, synthesis: ValuationSynthesisSkillResultLike | undefined, diagnostics: readonly string[]): ResearchReportSection[] { const comments = new Map<string, string>((synthesis?.sections ?? []).map((item) => [item.sectionId, item.markdown] as const)); const scenario = (id: string): ValuationComputation['scenarios'][number] | undefined => computation?.scenarios.find((item) => item.scenarioId === id); const num = (value: number | undefined) => value === undefined || !Number.isFinite(value) ? 'Unavailable' : String(value); const methodText = eligible.length ? eligible.join(', ') : 'Unavailable'; const safeModelText = (value: string | undefined, fallback: string) => value && plan && computation ? canonicalizeValuationViewpointStatement(value, plan, computation) : value ?? fallback; const safeModelView = safeModelText(comments.get('valuation-view'), 'Deterministic outputs are authoritative; qualitative interpretation is bounded to supplied evidence.'); const sections: Array<[string, string]> = [['Valuation Snapshot', basis ? reportMarkdown('Current price', `${num(basis.marketPrice)} CNY/share as of ${basis.priceDate}.`) : 'Unavailable'], ['Data Basis & Point-in-Time Status', basis ? `FY ${basis.basisFiscalYear} basis dated ${basis.reportDate}; publication status: ${basis.publicationStatus}. Valuation date: ${basis.valuationDate}.` : 'Unavailable'], ['Existing Research Context', safeModelText(comments.get('existing-research-context'), `Existing canonical Company research context for ${company.symbol} is bounded and company-only.`)], ['Method Eligibility', methodText], ['FY-Based Reference Multiples', computation ? `PE: ${num(computation.referenceMultiples.PE)}; PB: ${num(computation.referenceMultiples.PB)}; EV/EBITDA: ${num(computation.referenceMultiples.EV_EBITDA)}.` : 'Unavailable'], ['Primary Method Selection', plan ? `${plan.primaryMethod}; secondary cross-checks: ${plan.secondaryMethods.join(', ') || 'none'}.` : 'Unavailable'], ['Assumption Framework', plan ? plan.scenarios.map((item) => `${item.scenarioId}: growth ${item.growthRate}, multiple ${item.targetMultiple}`).join('; ') : 'Target-price assumptions unavailable.'], ['Bear Scenario', scenario('bear') ? `Target price: ${num(scenario('bear')!.targetPrice)} CNY/share; implied return: ${num(scenario('bear')!.impliedReturnPct)}%. ${scenario('bear')!.primaryMethod} calculation is code-owned.` : 'Unavailable'], ['Base Scenario', scenario('base') ? `Target price: ${num(scenario('base')!.targetPrice)} CNY/share; implied return: ${num(scenario('base')!.impliedReturnPct)}%. ${scenario('base')!.primaryMethod} calculation is code-owned.` : 'Unavailable'], ['Bull Scenario', scenario('bull') ? `Target price: ${num(scenario('bull')!.targetPrice)} CNY/share; implied return: ${num(scenario('bull')!.impliedReturnPct)}%. ${scenario('bull')!.primaryMethod} calculation is code-owned.` : 'Unavailable'], ['Target Price Range', computation ? `${num(scenario('bear')?.targetPrice)} – ${num(scenario('bull')?.targetPrice)} CNY/share.` : 'Unavailable'], ['Sensitivity Analysis', computation ? computation.sensitivity.map((cell) => `${cell.growthScenario}/${cell.multipleScenario}: ${num(cell.targetPrice)}`).join('; ') : 'Unavailable'], ['Secondary Method Cross-checks', plan && computation ? plan.secondaryMethods.map((method) => `${method} FY reference multiple: ${num(computation.referenceMultiples[method])}`).join('; ') || 'None available.' : 'Unavailable'], ['Changes vs Existing Research', safeModelText(comments.get('changes-vs-existing-research'), 'Valuation is a reproducible view over existing Company research; no unsupported canonical change is assumed.')], ['Valuation View', `${safeModelView}\n\nConsensus unavailable`], ['Risks / Limitations / Research Gaps', `${diagnostics.join('; ') || 'No deterministic data gap recorded.'}\n\nDCF: Unavailable / deferred in v1`]]; return VALUATION_REPORT_SECTIONS.map((title, index) => ({ id: title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''), title, markdown: sections[index]![1] })) }
type ValuationSynthesisSkillResultLike = Pick<ValuationSynthesisOutput, 'sections' | 'proposals'>
function preciseReportSections(sections: readonly ResearchReportSection[], sources: readonly NormalizedResearchSource[], existingClaims: readonly Dict[], synthesis: ValuationSynthesisSkillResultLike | undefined, sourceRefs: Readonly<Record<string, string>>, claimRefs: Readonly<Record<string, string>>, plan: ValuationAssumptionPlan | undefined): readonly ResearchReportSection[] {
  const byRole = (role: string) => sources.find((source) => source.candidate.metadata?.valuationEvidenceRole === role || source.candidate.metadata?.dataKind === `valuation-${role}`)?.candidate.candidateId
  const market = byRole('market'); const financial = byRole('financial'); const allDeterministic = [market, financial].filter((id): id is string => id !== undefined)
  const sourceRefsFor = (ids: readonly (string | undefined)[]) => ids.map((id) => id === undefined ? undefined : sourceRefs[id]).filter((id): id is string => id !== undefined)
  const knownClaims = new Set(existingClaims.map((claim) => typeof claim.canonicalRef === 'string' ? claim.canonicalRef : '').filter((id) => id.startsWith('claim:')))
  const claimRefsFor = (ids: readonly string[]) => ids.map((id) => knownClaims.has(id) ? id : claimRefs[id]).filter((id): id is string => id !== undefined)
  const modelSections = new Map((synthesis?.sections ?? []).map((section) => [section.sectionId, section] as const))
  const assumptionClaimIds = (synthesis?.proposals ?? []).filter((proposal) => proposal.claimType === 'assumption').map((proposal) => proposal.proposalId)
  const viewpointClaimIds = (synthesis?.proposals ?? []).filter((proposal) => proposal.claimType === 'viewpoint').map((proposal) => proposal.proposalId)
  return sections.map((section) => {
    let candidateIds: readonly (string | undefined)[] = []; let existingClaimIds: readonly string[] = []
    if (section.id === 'valuation-snapshot') candidateIds = [market]
    else if (section.id === 'data-basis-point-in-time-status') candidateIds = [market, financial]
    else if (['method-eligibility', 'fy-based-reference-multiples', 'secondary-method-cross-checks'].includes(section.id)) candidateIds = [financial]
    else if (section.id === 'primary-method-selection') candidateIds = [financial]
    else if (section.id === 'assumption-framework') { candidateIds = plan?.scenarios.find((item) => item.scenarioId === 'base')?.sourceCandidateIds ?? []; existingClaimIds = assumptionClaimIds }
    else if (['bear-scenario', 'base-scenario', 'bull-scenario'].includes(section.id)) candidateIds = [plan?.scenarios.find((item) => item.scenarioId === section.id.replace('-scenario', ''))?.sourceCandidateIds ?? []].flat()
    else if (['target-price-range', 'sensitivity-analysis'].includes(section.id)) candidateIds = allDeterministic
    else { const model = modelSections.get(section.id); candidateIds = model?.sourceCandidateIds ?? []; existingClaimIds = [...(model?.existingKnowledgeRefs ?? []), ...(section.id === 'valuation-view' ? viewpointClaimIds : [])] }
    return { ...section, sourceRefs: sourceRefsFor(candidateIds), claimRefs: claimRefsFor(existingClaimIds) }
  })
}
function check(input: ValuationWorkflowInput, now: string): void { if (!safeId.test(input.workflowRunId)) throw new Error('workflowRunId must be safe'); if (input.handle.schemaVersion !== '0.4' || input.handle.storageFormatVersion !== '1') throw new Error('Valuation requires Schema 0.4 / Storage 1'); if (!/^\d{6}$/.test(input.company.symbol)) throw new Error('company symbol must be a six-digit A-share symbol'); if (input.targetFiscalYear !== undefined && !Number.isInteger(input.targetFiscalYear)) throw new Error('VALUATION_TARGET_FISCAL_YEAR_INVALID'); if (input.asOf !== undefined && Number.isNaN(Date.parse(input.asOf))) throw new Error('asOf must be a valid date'); if (input.asOf !== undefined && Date.parse(input.asOf) > Date.parse(now)) throw new Error('VALUATION_ASOF_IN_FUTURE') }

export async function runValuation(input: ValuationWorkflowInput): Promise<ValuationWorkflowResult> {
  const provider = emptyProvider()
  try {
    const clock = nowOf(input); const now = clock()
    check(input, now)
    const company = normalizedCompany(input.company)
    abortIfNeeded(input.signal)
    const coverage = await existingCompany(input, company)
    abortIfNeeded(input.signal)
    if (coverage.reason) return { workflowRunId: input.workflowRunId, status: 'blocked', knowledgeBaseId: input.handle.knowledgeBaseId, knowledgeBaseRevision: input.handle.revision, proposalIds: [], committedIds: [], sourceIds: [], claimIds: [], errors: [], blockedReason: coverage.reason, diagnostics: [coverage.reason], providerOutcome: provider, telemetry: baseTelemetry() }

    const valuationDate = input.asOf ?? now
    const acquired = await acquire(input, company, valuationDate, input.asOf, clock)
    abortIfNeeded(input.signal)
    const market = normalizeValuationMarketData(acquired.marketValue, valuationDate)
    if (!market.observation) return { workflowRunId: input.workflowRunId, status: 'blocked', knowledgeBaseId: input.handle.knowledgeBaseId, knowledgeBaseRevision: input.handle.revision, proposalIds: [], committedIds: [], sourceIds: [], claimIds: [], errors: [], blockedReason: 'VALUATION_MARKET_PRICE_UNAVAILABLE', diagnostics: acquired.diagnostics, providerOutcome: acquired.providerOutcome, telemetry: baseTelemetry({ companyCoverageResolved: true }) }

    const financial = normalizeValuationFinancialData(acquired.financialValue)
    const selected = selectValuationBasis(financial.rows, valuationDate, input.asOf)
    const basis = selected.basis === undefined ? undefined : buildValuationBasis(market.observation, selected.basis, valuationDate, selected.publicationStatus!)
    const eligibility = basis ? methodEligibility(basis) : []
    const eligible = requestedMethods(input, eligibility.filter((item) => item.eligible).map((item) => item.method))
    if (basis && input.targetFiscalYear !== undefined && (input.targetFiscalYear <= basis.basisFiscalYear || input.targetFiscalYear > basis.basisFiscalYear + 3)) return { workflowRunId: input.workflowRunId, status: 'blocked', knowledgeBaseId: input.handle.knowledgeBaseId, knowledgeBaseRevision: input.handle.revision, proposalIds: [], committedIds: [], sourceIds: [], claimIds: [], errors: [], blockedReason: 'VALUATION_TARGET_FISCAL_YEAR_INVALID', diagnostics: ['VALUATION_TARGET_FISCAL_YEAR_INVALID'], providerOutcome: acquired.providerOutcome, basis, telemetry: baseTelemetry({ companyCoverageResolved: true, marketDataUsable: true, financialBasisUsable: true, pointInTimeVerified: selected.pointInTimeVerified }) }
    const targetFiscalYear = input.targetFiscalYear ?? (basis ? basis.basisFiscalYear + 1 : 0)
    const providerOutcome: ValuationProviderOutcome = { ...acquired.providerOutcome, marketPriceFound: true, fiscalYearBasisFound: basis !== undefined, peEligible: eligible.includes('PE'), pbEligible: eligible.includes('PB'), evEbitdaEligible: eligible.includes('EV_EBITDA'), usableForValuation: basis !== undefined && eligible.length > 0 }
    let telemetry = baseTelemetry({ companyCoverageResolved: true, marketDataUsable: true, financialBasisUsable: basis !== undefined, pointInTimeVerified: selected.pointInTimeVerified, eligibleMethods: eligible })
    let plan: ValuationAssumptionPlan | undefined
    let computation: ValuationComputation | undefined
    let synthesisOutput: ValuationSynthesisOutput = { sections: [], proposals: [] }
    let proposals: readonly ValuationSynthesisProposal[] = []

    if (basis && eligible.length > 0) {
      abortIfNeeded(input.signal)
      const design = await new ValuationAssumptionDesignSkill(input.reasoningExecutor).design({ company, valuationDate, basis, targetFiscalYear, eligibleMethods: eligible, referenceMultiples: referenceMultiples(basis), existingKnowledge: coverage.claims, sources: deterministicValuationEvidence(acquired.sources) })
      abortIfNeeded(input.signal)
      telemetry = { ...telemetry, primaryMethod: design.plan?.primaryMethod, assumptionDesign: design.reasoning }
      if (design.plan) {
        plan = design.plan
        try {
          computation = calculateValuation(basis, plan, eligible)
          telemetry = { ...telemetry, computation: { scenarioCount: computation.scenarios.length, calculatedScenarioCount: computation.scenarios.length, sensitivityCellCount: computation.sensitivity.length, deterministicRecomputeStatus: computation.deterministicRecomputeMatched ? 'matched' : 'mismatch' } }
          abortIfNeeded(input.signal)
          const synthesis = await new ValuationSynthesisSkill(input.reasoningExecutor).synthesize({ company, valuationDate, basis, targetFiscalYear, eligibleMethods: eligible, referenceMultiples: computation.referenceMultiples, existingKnowledge: coverage.claims, sources: deterministicValuationEvidence(acquired.sources), plan, computation })
          abortIfNeeded(input.signal)
          synthesisOutput = synthesis.output
           telemetry = { ...telemetry, synthesis: synthesis.reasoning, modelDerivedInterpretiveSectionCount: synthesis.output.sections.length, proposalCandidateCount: synthesis.output.proposals.length }
           const sourceIds = new Set(deterministicValuationEvidence(acquired.sources).map((source) => source.candidate.candidateId))
          const claimRefs = new Set(coverage.claims.map((claim) => String(claim.canonicalRef)))
          proposals = synthesis.output.proposals.filter((proposal) => validProposal(proposal, plan!, computation!, sourceIds, claimRefs))
        } catch (error) {
          telemetry = { ...telemetry, computation: { scenarioCount: plan.scenarios.length, calculatedScenarioCount: 0, sensitivityCellCount: 0, deterministicRecomputeStatus: 'unavailable' }, synthesis: { called: false, validated: false, applied: false, fallbackUsed: true, repairAttempts: 0, operation: 'valuation_synthesis' }, proposalCandidateCount: 0 }
          void error
        }
      }
    }

    const gateway = new KnowledgeProductionGateway(new KnowledgeBaseRegistry())
    let outcome: KnowledgeProductionOutcome = { status: 'no_changes', knowledgeBaseId: input.handle.knowledgeBaseId, knowledgeBaseRevision: input.handle.revision, baseRevision: input.handle.revision, createdIds: [], updatedIds: [], sourceRefsByLocalId: {}, claimRefsByProposalId: {}, entityRefsByLocalKey: {}, relationRefsByProposalId: {}, resolutionIntents: [], errors: [] }
    if (basis && plan && computation && proposals.length > 0) {
      const gatewayProposals = toGatewayProposals(proposals, plan, computation)
      abortIfNeeded(input.signal)
       outcome = await gateway.submit({ handle: input.handle, producerType: 'valuation', producerRunId: input.workflowRunId, schemaProfile: { schemaVersion: '0.4', storageFormatVersion: '1', requiresRawProvenance: true }, entity: { localKey: 'company', entityType: 'company', name: company.name ?? company.symbol, aliases: [company.symbol], semanticFields: { ticker: company.symbol, exchange: company.exchange } }, proposals: gatewayProposals, evidenceBindings: deterministicValuationEvidence(acquired.sources).filter((source) => gatewayProposals.some((proposal) => (proposal.sourceCandidateIds ?? []).includes(source.candidate.candidateId))).map((source) => ({ localSourceId: source.candidate.candidateId, source })), asOf: input.asOf, now: clock })
      telemetry = { ...telemetry, acceptedProposalCount: gatewayProposals.length, canonicalSourceCount: Object.keys(outcome.sourceRefsByLocalId).length, canonicalClaimCount: Object.keys(outcome.claimRefsByProposalId).length }
      if (outcome.status === 'blocked' || outcome.status === 'failed') return { workflowRunId: input.workflowRunId, status: 'blocked', knowledgeBaseId: input.handle.knowledgeBaseId, knowledgeBaseRevision: outcome.knowledgeBaseRevision, proposalIds: gatewayProposals.map((proposal) => proposal.proposalId), committedIds: [], sourceIds: Object.values(outcome.sourceRefsByLocalId), claimIds: Object.values(outcome.claimRefsByProposalId), errors: outcome.errors, diagnostics: acquired.diagnostics, providerOutcome, basis, plan, computation, synthesis: synthesisOutput, telemetry }
    }

    const reportId = `valuation-${company.symbol}-${targetFiscalYear}-${input.workflowRunId}`
    const report: ResearchReport = validateResearchReport({ reportId, reportType: 'valuation', subjectRefs: [coverage.ref!], generatedAt: now, asOf: valuationDate, workflowRunId: input.workflowRunId, knowledgeBaseRevision: outcome.knowledgeBaseRevision, sourceRefs: Object.values(outcome.sourceRefsByLocalId), claimRefs: Object.values(outcome.claimRefsByProposalId), methodology: 'AKShare structured valuation basis, deterministic method eligibility and calculations, bounded two-stage Pi interpretation, and Gateway-mediated canonical mutation.', sections: preciseReportSections(reportSections(company, basis, eligible, plan, computation, synthesisOutput, acquired.diagnostics), deterministicValuationEvidence(acquired.sources), coverage.claims, synthesisOutput, outcome.sourceRefsByLocalId, outcome.claimRefsByProposalId, plan), outputPath: `${reportId}.md` })
    const outputPath = await writeResearchReport(report, resolve(input.reportRoot))
    telemetry = { ...telemetry, acceptedProposalCount: Object.keys(outcome.claimRefsByProposalId).length, canonicalSourceCount: Object.keys(outcome.sourceRefsByLocalId).length, canonicalClaimCount: Object.keys(outcome.claimRefsByProposalId).length }
    return { workflowRunId: input.workflowRunId, status: 'completed', knowledgeBaseId: input.handle.knowledgeBaseId, knowledgeBaseRevision: outcome.knowledgeBaseRevision, report: { reportId, outputPath }, proposalIds: proposals.map((proposal) => proposal.proposalId), committedIds: [...outcome.createdIds, ...outcome.updatedIds], sourceIds: Object.values(outcome.sourceRefsByLocalId), claimIds: Object.values(outcome.claimRefsByProposalId), errors: [], diagnostics: acquired.diagnostics, providerOutcome, basis, plan, computation, synthesis: synthesisOutput, telemetry }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { workflowRunId: input.workflowRunId, status: message === 'WORKFLOW_CANCELLED' ? 'cancelled' : message === 'VALUATION_ASOF_IN_FUTURE' || message === 'VALUATION_TARGET_FISCAL_YEAR_INVALID' ? 'blocked' : 'failed', knowledgeBaseId: input.handle.knowledgeBaseId, knowledgeBaseRevision: input.handle.revision, proposalIds: [], committedIds: [], sourceIds: [], claimIds: [], errors: [message], ...(message === 'VALUATION_ASOF_IN_FUTURE' ? { blockedReason: 'VALUATION_ASOF_IN_FUTURE' as const } : message === 'VALUATION_TARGET_FISCAL_YEAR_INVALID' ? { blockedReason: 'VALUATION_TARGET_FISCAL_YEAR_INVALID' as const } : {}), diagnostics: [message], providerOutcome: provider, telemetry: baseTelemetry() }
  }
}
