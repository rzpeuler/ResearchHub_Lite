import { calculateComparableCompany, calculateComparableSet, calculateImpliedEquityFromEvMultiple } from '../valuation/calculations/comps.ts'
import type { ComparableCompanyInput, ComparableCompanyResult, ComparableMultipleKind } from '../valuation/calculations/contracts.ts'
import { ValuationCalculationError } from '../valuation/calculations/errors.ts'
import { COMPARABILITY_DIMENSIONS, type AcceptedComparablePeer, type ComparablePeerCandidate, type ComparablePeerMetricDiagnostic, type CompsValuationInput, type CompsValuationResult, type ComparableTarget, type RejectedComparablePeer } from './contracts.ts'

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/
const METHODS: readonly ComparableMultipleKind[] = ['EV_REVENUE', 'EV_EBITDA', 'PE', 'PB', 'FCF_YIELD']
type FinancialMetric = keyof Omit<ComparableCompanyInput, 'id'>

function date(value: string, label: string): number {
  const parsed = Date.parse(value)
  if (Number.isNaN(parsed)) throw new ValuationCalculationError('INVALID_COMPARABLE_INPUT', `${label} must be a valid date`)
  return parsed
}

function samePeriod(left: ComparableTarget | ComparablePeerCandidate, right: ComparableTarget | ComparablePeerCandidate): boolean {
  return left.period.kind === right.period.kind && left.period.label === right.period.label && left.period.fiscalYear === right.period.fiscalYear
}

function metricFor(method: ComparableMultipleKind): FinancialMetric {
  if (method === 'EV_REVENUE') return 'revenue'
  if (method === 'EV_EBITDA') return 'ebitda'
  if (method === 'PE') return 'netIncome'
  if (method === 'PB') return 'bookEquity'
  return 'freeCashFlow'
}

function metricDiagnostic(method: ComparableMultipleKind, candidate: ComparablePeerCandidate): ComparablePeerMetricDiagnostic | undefined {
  const metric = metricFor(method)
  const value = candidate.financials[metric]
  if (value === undefined) return { method, reasonCode: 'METRIC_UNAVAILABLE' }
  if (method !== 'FCF_YIELD' && value <= 0) return { method, reasonCode: 'NON_POSITIVE_DENOMINATOR' }
  if (method === 'FCF_YIELD' && candidate.financials.marketCap <= 0) return { method, reasonCode: 'NON_POSITIVE_MARKET_CAP' }
  return undefined
}

function identity(candidate: ComparablePeerCandidate): string { return `${candidate.exchange}:${candidate.ticker}` }

function validateInput(input: CompsValuationInput): void {
  date(input.asOf, 'asOf')
  if (!SAFE_ID.test(input.subject.identity.companyId) || !SAFE_ID.test(input.subject.identity.ticker) || input.subject.identity.exchange.trim() === '') throw new ValuationCalculationError('INVALID_COMPARABLE_INPUT', 'subject identity is invalid')
  if (input.minimumPeerCount !== undefined && (!Number.isSafeInteger(input.minimumPeerCount) || input.minimumPeerCount < 1)) throw new ValuationCalculationError('INVALID_COMPARABLE_INPUT', 'minimumPeerCount must be positive')
  const sourceIds = new Set(input.sources.map((source) => source.candidate.candidateId))
  if (sourceIds.size !== input.sources.length) throw new ValuationCalculationError('INVALID_COMPARABLE_INPUT', 'source candidate IDs must be unique')
  const peerIds = new Set<string>()
  for (const peer of input.candidatePeers) {
    if (!SAFE_ID.test(peer.companyId) || !SAFE_ID.test(peer.ticker) || peer.exchange.trim() === '') throw new ValuationCalculationError('INVALID_COMPARABLE_INPUT', `peer identity is invalid: ${peer.companyId}`)
    const key = identity(peer)
    if (peerIds.has(key)) throw new ValuationCalculationError('INVALID_COMPARABLE_INPUT', `duplicate peer identity: ${key}`)
    peerIds.add(key)
  }
}

function rejection(candidate: ComparablePeerCandidate, reasonCodes: readonly string[]): RejectedComparablePeer { return { identity: { companyId: candidate.companyId, ticker: candidate.ticker, exchange: candidate.exchange, ...(candidate.name === undefined ? {} : { name: candidate.name }) }, sourceRefs: [...candidate.sourceRefs], reasonCodes: [...new Set(reasonCodes)].sort() } }

function accepted(candidate: ComparablePeerCandidate, result: ComparableCompanyResult): AcceptedComparablePeer {
  const metricDiagnostics = METHODS.map((method) => metricDiagnostic(method, candidate)).filter((value): value is ComparablePeerMetricDiagnostic => value !== undefined)
  return { identity: { companyId: candidate.companyId, ticker: candidate.ticker, exchange: candidate.exchange, ...(candidate.name === undefined ? {} : { name: candidate.name }) }, sourceRefs: [...candidate.sourceRefs], period: candidate.period, currency: candidate.currency, result, metricDiagnostics }
}

function targetMetric(target: ComparableTarget, method: ComparableMultipleKind): number {
  const metric = metricFor(method)
  const value = target.financials[metric]
  if (value === undefined || !Number.isFinite(value) || value <= 0) throw new ValuationCalculationError('METRIC_UNAVAILABLE', `target ${metric} is unavailable or non-positive`)
  return value
}

function selectedMultiple(summaries: CompsValuationResult['multipleSummaries'], selection: NonNullable<CompsValuationInput['selection']>): number | undefined {
  if (selection.basis === 'explicit_user_assumption') {
    if (selection.value === undefined || !Number.isFinite(selection.value) || selection.value <= 0) throw new ValuationCalculationError('INVALID_COMPARABLE_INPUT', 'explicit selected multiple must be positive')
    return selection.value
  }
  const summary = summaries.find((item) => item.kind === selection.method)
  if (!summary) return undefined
  return selection.basis === 'peer_min' ? summary.min : selection.basis === 'peer_max' ? summary.max : summary.median
}

function targetShares(target: ComparableTarget): number | undefined {
  return target.financials.dilutedShares
}

export function executeCompsValuation(input: CompsValuationInput): CompsValuationResult {
  validateInput(input)
  const cutoff = date(input.asOf, 'asOf')
  const sourceIds = new Set(input.sources.map((source) => source.candidate.candidateId))
  const acceptedPeers: AcceptedComparablePeer[] = []
  const rejectedPeers: RejectedComparablePeer[] = []
  for (const candidate of input.candidatePeers) {
    const reasons: string[] = []
    if (candidate.companyId.trim() === '' || candidate.ticker.trim() === '' || candidate.exchange.trim() === '') reasons.push('IDENTITY_UNRESOLVED')
    if (!candidate.sourceRefs.length) reasons.push('SOURCE_MISSING')
    else if (candidate.sourceRefs.some((sourceRef) => !sourceIds.has(sourceRef))) reasons.push('SOURCE_REF_DANGLING')
    if (date(candidate.retrievedAt, 'retrievedAt') > cutoff || date(candidate.asOf, 'peer asOf') > cutoff || (candidate.publishedAt !== undefined && date(candidate.publishedAt, 'publishedAt') > cutoff)) reasons.push('POST_ASOF_DATA')
    if (!samePeriod(input.subject, candidate)) reasons.push('PERIOD_MISMATCH')
    if (candidate.currency !== input.subject.currency) reasons.push('CURRENCY_MISMATCH')
    if (candidate.shareBasis !== input.subject.shareBasis) reasons.push('UNIT_MISMATCH')
    for (const key of ['marketCap', 'grossDebt', 'cash', 'revenue', 'ebitda', 'netIncome', 'bookEquity', 'freeCashFlow'] as const) if (candidate.metricUnits[key] !== undefined && input.subject.metricUnits[key] !== undefined && candidate.metricUnits[key] !== input.subject.metricUnits[key]) reasons.push('UNIT_MISMATCH')
    if (candidate.comparabilityEvidence.length === 0 || candidate.comparabilityEvidence.some((item) => !COMPARABILITY_DIMENSIONS.includes(item))) reasons.push('INSUFFICIENT_COMPARABILITY_EVIDENCE')
    if (reasons.length) { rejectedPeers.push(rejection(candidate, reasons)); continue }
    const financials = { id: identity(candidate), ...candidate.financials }
    try { acceptedPeers.push(accepted(candidate, calculateComparableCompany(financials))) } catch (error) { rejectedPeers.push(rejection(candidate, [error instanceof ValuationCalculationError ? error.code : 'INVALID_COMPARABLE_INPUT'])) }
  }
  const set = calculateComparableSet(acceptedPeers.map((peer) => ({ id: peer.identity.companyId, ...input.candidatePeers.find((candidate) => candidate.companyId === peer.identity.companyId)!.financials })))
  const diagnostics: string[] = []
  const selection = input.selection
  let selected: number | undefined
  let impliedValuation: CompsValuationResult['impliedValuation']
  if (selection) {
    selected = selectedMultiple(set.summaries, selection)
    const summary = set.summaries.find((item) => item.kind === selection.method)
    const minimum = input.minimumPeerCount ?? 1
    if (selected === undefined || !summary || summary.validCount < minimum) diagnostics.push('INSUFFICIENT_VALID_PEERS')
    else {
      const shares = targetShares(input.subject)
      if (selection.method === 'EV_REVENUE' || selection.method === 'EV_EBITDA') {
        if (shares === undefined || shares <= 0) diagnostics.push('DILUTED_SHARES_UNAVAILABLE')
        else impliedValuation = calculateImpliedEquityFromEvMultiple({ metric: targetMetric(input.subject, selection.method), selectedMultiple: selected, grossDebt: input.subject.financials.grossDebt, cash: input.subject.financials.cash, dilutedShares: shares, preferredStock: input.subject.financials.preferredStock, minorityInterest: input.subject.financials.minorityInterest })
      } else if (shares === undefined || shares <= 0) diagnostics.push('DILUTED_SHARES_UNAVAILABLE')
      else {
        const metric = targetMetric(input.subject, selection.method)
        const equityValue = selection.method === 'FCF_YIELD' ? metric / selected : metric * selected
        impliedValuation = { impliedEquityValue: equityValue, valuePerShare: equityValue / shares }
      }
    }
  }
  if (acceptedPeers.length === 0) diagnostics.push('INSUFFICIENT_VALID_PEERS')
  return { subject: input.subject, asOf: input.asOf, valuationBasis: input.subject.period, candidatePeers: input.candidatePeers.map((candidate) => ({ companyId: candidate.companyId, ticker: candidate.ticker, exchange: candidate.exchange, ...(candidate.name === undefined ? {} : { name: candidate.name }) })), acceptedPeers, rejectedPeers, multipleSummaries: set.summaries, ...(selection === undefined ? {} : { selectedMethod: selection.method, selectedMultiple: selected, selectedMultipleBasis: selection.basis }), ...(impliedValuation === undefined ? {} : { impliedValuation }), diagnostics: [...new Set(diagnostics)], sourceRefs: [...new Set(input.candidatePeers.flatMap((peer) => peer.sourceRefs))], availability: acceptedPeers.length === 0 ? 'unavailable' : selection && diagnostics.includes('INSUFFICIENT_VALID_PEERS') ? 'insufficient_data' : 'available' }
}
