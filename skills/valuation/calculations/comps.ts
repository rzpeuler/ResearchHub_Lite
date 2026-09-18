import type { ComparableCompanyInput, ComparableCompanyResult, ComparableCompanyRejection, ComparableMultipleKind, ComparableMultipleSummary, ComparableSetResult, ImpliedEquityFromEvMultipleInput, ImpliedEquityFromEvMultipleResult } from './contracts.ts'
import { calculationError, finiteInput, finiteResult, nonNegative } from './errors.ts'

function optionalNonNegative(value: number | undefined, label: string): number {
  return value === undefined ? 0 : nonNegative(value, label)
}

function optionalFinite(value: number | undefined, label: string): number | undefined {
  return value === undefined ? undefined : finiteInput(value, label)
}

export function calculateComparableCompany(input: ComparableCompanyInput): ComparableCompanyResult {
  const marketCap = nonNegative(input.marketCap, 'market cap')
  const grossDebt = nonNegative(input.grossDebt, 'gross debt')
  const cash = nonNegative(input.cash, 'cash')
  const preferredStock = optionalNonNegative(input.preferredStock, 'preferred stock')
  const minorityInterest = optionalNonNegative(input.minorityInterest, 'minority interest')
  const revenue = optionalFinite(input.revenue, 'revenue')
  const ebitda = optionalFinite(input.ebitda, 'EBITDA')
  const netIncome = optionalFinite(input.netIncome, 'net income')
  const bookEquity = optionalFinite(input.bookEquity, 'book equity')
  const freeCashFlow = optionalFinite(input.freeCashFlow, 'free cash flow')
  const enterpriseValue = finiteResult(marketCap + grossDebt + preferredStock + minorityInterest - cash, 'enterprise value')
  const invalidReasons: string[] = []
  const evRevenue = enterpriseValue > 0 && revenue !== undefined && revenue > 0 ? finiteResult(enterpriseValue / revenue, 'EV/Revenue') : undefined
  if (evRevenue === undefined) invalidReasons.push(revenue === undefined ? 'EV_REVENUE_UNAVAILABLE_REVENUE_MISSING' : revenue <= 0 ? 'EV_REVENUE_UNAVAILABLE_NON_POSITIVE_REVENUE' : 'EV_REVENUE_UNAVAILABLE_NON_POSITIVE_ENTERPRISE_VALUE')
  const evEbitda = enterpriseValue > 0 && ebitda !== undefined && ebitda > 0 ? finiteResult(enterpriseValue / ebitda, 'EV/EBITDA') : undefined
  if (evEbitda === undefined) invalidReasons.push(ebitda === undefined ? 'EV_EBITDA_UNAVAILABLE_EBITDA_MISSING' : ebitda <= 0 ? 'EV_EBITDA_UNAVAILABLE_NON_POSITIVE_EBITDA' : 'EV_EBITDA_UNAVAILABLE_NON_POSITIVE_ENTERPRISE_VALUE')
  const pe = marketCap > 0 && netIncome !== undefined && netIncome > 0 ? finiteResult(marketCap / netIncome, 'P/E') : undefined
  if (pe === undefined) invalidReasons.push(netIncome === undefined ? 'PE_UNAVAILABLE_NET_INCOME_MISSING' : netIncome <= 0 ? 'PE_UNAVAILABLE_NON_POSITIVE_NET_INCOME' : 'PE_UNAVAILABLE_NON_POSITIVE_MARKET_CAP')
  const pb = marketCap > 0 && bookEquity !== undefined && bookEquity > 0 ? finiteResult(marketCap / bookEquity, 'P/B') : undefined
  if (pb === undefined) invalidReasons.push(bookEquity === undefined ? 'PB_UNAVAILABLE_BOOK_EQUITY_MISSING' : bookEquity <= 0 ? 'PB_UNAVAILABLE_NON_POSITIVE_BOOK_EQUITY' : 'PB_UNAVAILABLE_NON_POSITIVE_MARKET_CAP')
  const fcfYield = marketCap > 0 && freeCashFlow !== undefined ? finiteResult(freeCashFlow / marketCap, 'FCF yield') : undefined
  if (fcfYield === undefined) invalidReasons.push(freeCashFlow === undefined ? 'FCF_YIELD_UNAVAILABLE_FREE_CASH_FLOW_MISSING' : 'FCF_YIELD_UNAVAILABLE_NON_POSITIVE_MARKET_CAP')
  return { id: input.id, enterpriseValue, ...(evRevenue === undefined ? {} : { evRevenue }), ...(evEbitda === undefined ? {} : { evEbitda }), ...(pe === undefined ? {} : { pe }), ...(pb === undefined ? {} : { pb }), ...(fcfYield === undefined ? {} : { fcfYield }), invalidReasons }
}

const MULTIPLE_FIELDS: readonly { readonly kind: ComparableMultipleKind; readonly field: keyof Pick<ComparableCompanyResult, 'evRevenue' | 'evEbitda' | 'pe' | 'pb' | 'fcfYield'> }[] = [
  { kind: 'EV_REVENUE', field: 'evRevenue' },
  { kind: 'EV_EBITDA', field: 'evEbitda' },
  { kind: 'PE', field: 'pe' },
  { kind: 'PB', field: 'pb' },
  { kind: 'FCF_YIELD', field: 'fcfYield' },
]

function median(values: readonly number[]): number {
  const sorted = [...values].sort((left, right) => left - right)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2
}

export function summarizeComparableSet(peers: readonly ComparableCompanyResult[], totalPeerCount = peers.length): readonly ComparableMultipleSummary[] {
  return MULTIPLE_FIELDS.flatMap(({ kind, field }) => {
    const values = peers.map((peer) => peer[field]).filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
    if (values.length === 0) return []
    return [{ kind, min: Math.min(...values), median: median(values), max: Math.max(...values), validCount: values.length, rejectedCount: totalPeerCount - values.length }]
  })
}

export function calculateComparableSet(inputs: readonly ComparableCompanyInput[]): ComparableSetResult {
  const peers: ComparableCompanyResult[] = []
  const rejections: ComparableCompanyRejection[] = []
  for (const input of inputs) {
    try {
      const peer = calculateComparableCompany(input)
      peers.push(peer)
      if (![peer.evRevenue, peer.evEbitda, peer.pe, peer.pb, peer.fcfYield].some((value) => value !== undefined)) rejections.push({ id: peer.id, reasons: peer.invalidReasons })
    } catch (error) {
      if (error instanceof Error) rejections.push({ id: input.id, reasons: [error instanceof Error && 'code' in error ? String((error as Error & { code: string }).code) : 'INVALID_COMPARABLE_INPUT'] })
      else rejections.push({ id: input.id, reasons: ['INVALID_COMPARABLE_INPUT'] })
    }
  }
  return { peers, summaries: summarizeComparableSet(peers, inputs.length), validPeerCount: inputs.length - rejections.length, rejectedPeerCount: rejections.length, rejections }
}

export function calculateImpliedEquityFromEvMultiple(input: ImpliedEquityFromEvMultipleInput): ImpliedEquityFromEvMultipleResult {
  const metric = finiteInput(input.metric, 'selected metric')
  if (metric <= 0) calculationError('INVALID_COMPARABLE_INPUT', 'selected metric must be positive')
  const selectedMultiple = finiteInput(input.selectedMultiple, 'selected multiple')
  if (selectedMultiple <= 0) calculationError('INVALID_COMPARABLE_INPUT', 'selected multiple must be positive')
  const grossDebt = nonNegative(input.grossDebt, 'gross debt')
  const cash = nonNegative(input.cash, 'cash')
  const preferredStock = optionalNonNegative(input.preferredStock, 'preferred stock')
  const minorityInterest = optionalNonNegative(input.minorityInterest, 'minority interest')
  const dilutedShares = finiteInput(input.dilutedShares, 'diluted shares')
  if (dilutedShares <= 0) calculationError('INVALID_DILUTED_SHARES', 'diluted shares must be positive')
  const impliedEnterpriseValue = finiteResult(metric * selectedMultiple, 'implied enterprise value')
  const equityValue = finiteResult(impliedEnterpriseValue - grossDebt + cash - preferredStock - minorityInterest, 'implied equity value')
  return { impliedEnterpriseValue, equityValue, valuePerShare: finiteResult(equityValue / dilutedShares, 'implied value per share') }
}

export const calculateComparableCompanySet = calculateComparableSet
