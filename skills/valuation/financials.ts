import type { ValuationBasis, ValuationComputation, ValuationMethod, ValuationMethodEligibility, ValuationScenarioAssumption, ValuationScenarioId, ValuationScenarioResult, ValuationSensitivityCell } from './contracts.ts'

type Dict = Record<string, unknown>
const METHOD_SET = new Set<ValuationMethod>(['PE', 'PB', 'EV_EBITDA'])
const SCENARIOS: readonly ValuationScenarioId[] = ['bear', 'base', 'bull']
const DATE_ALIASES = ['报告期', '报告日期', '报告期末', '日期', 'date', 'end_date', 'report_date', 'period', 'fiscal_period'] as const
const PUBLICATION_ALIASES = ['公告日期', '公告日', '公告时间', 'publicationDate', 'publication_date', 'announcementDate', 'announcement_date', 'publish_date'] as const
const MARKET_DATE_ALIASES = ['日期', 'date', 'trade_date', '交易日期'] as const
const CLOSE_ALIASES = ['收盘', '收盘价', 'close', 'Close', '收盘价(元)'] as const
const EPS_ALIASES = ['基本每股收益', '基本每股收益(元)', 'EPS', 'eps', 'basic_eps'] as const
const BVPS_ALIASES = ['每股净资产', '每股净资产(元)', 'BVPS', 'bvps', 'book_value_per_share'] as const
const EBITDA_ALIASES = ['EBITDA', 'ebitda', '息税折旧摊销前利润', '息税折旧摊销前利润(EBITDA)'] as const
const NET_DEBT_ALIASES = ['净负债', '净负债(元)', 'net_debt', 'netDebt', 'net debt'] as const
const SHARES_ALIASES = ['总股本', '股本', 'shares', 'shares_outstanding', 'sharesOutstanding'] as const

export interface ValuationMarketObservation { readonly priceDate: string; readonly close: number }
export interface ValuationFinancialRow { readonly basisFiscalYear: number; readonly reportDate: string; readonly publicationDate?: string; readonly eps?: number; readonly bvps?: number; readonly ebitda?: number; readonly netDebt?: number; readonly shares?: number }
export interface NormalizedValuationData { readonly market?: ValuationMarketObservation; readonly financialRows: readonly ValuationFinancialRow[]; readonly diagnostics: readonly string[] }

function rowsOf(value: unknown): readonly Dict[] {
  if (Array.isArray(value)) return value.filter((item): item is Dict => Boolean(item) && typeof item === 'object' && !Array.isArray(item))
  if (value && typeof value === 'object' && !Array.isArray(value) && Array.isArray((value as Dict).data)) return rowsOf((value as Dict).data)
  return []
}
function first(row: Dict, aliases: readonly string[]): unknown { for (const alias of aliases) if (Object.prototype.hasOwnProperty.call(row, alias)) return row[alias]; return undefined }
function numberValue(value: unknown): number | undefined {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined
  if (typeof value !== 'string' || value.trim() === '') return undefined
  const parsed = Number(value.trim().replace(/,/g, '').replace(/%$/, ''))
  return Number.isFinite(parsed) ? parsed : undefined
}
export function normalizeValuationDate(value: unknown): string | undefined {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10)
  if (typeof value !== 'string' && typeof value !== 'number') return undefined
  const match = /^(\d{4})(?:-|年)?(\d{1,2})(?:-|月)?(\d{1,2})(?:日)?/.exec(String(value).trim().replace(/[/.]/g, '-'))
  if (!match) return undefined
  const year = Number(match[1]); const month = Number(match[2]); const day = Number(match[3])
  if (month < 1 || month > 12 || day < 1 || day > 31) return undefined
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}
function dateOf(row: Dict, aliases: readonly string[]): string | undefined { return normalizeValuationDate(first(row, aliases)) }

export function normalizeValuationMarketData(value: unknown, valuationDate: string): { readonly observation?: ValuationMarketObservation; readonly diagnostics: readonly string[] } {
  const diagnostics: string[] = []; const candidates = rowsOf(value).map((row) => ({ date: dateOf(row, MARKET_DATE_ALIASES), close: numberValue(first(row, CLOSE_ALIASES)) })).filter((item): item is { date: string; close: number } => item.date !== undefined && item.close !== undefined && item.close > 0 && Number.isFinite(item.close) && item.date <= valuationDate).sort((left, right) => left.date.localeCompare(right.date))
  if (candidates.length === 0) { diagnostics.push('VALUATION_MARKET_PRICE_UNAVAILABLE'); return { diagnostics } }
  const selected = candidates[candidates.length - 1]!; return { observation: { priceDate: selected.date, close: selected.close }, diagnostics }
}

export function normalizeValuationFinancialData(value: unknown): { readonly rows: readonly ValuationFinancialRow[]; readonly diagnostics: readonly string[] } {
  const diagnostics: string[] = []; const rows: ValuationFinancialRow[] = []
  for (const row of rowsOf(value)) {
    const reportDate = dateOf(row, DATE_ALIASES); if (reportDate === undefined || !reportDate.endsWith('-12-31')) continue
    const publicationDate = dateOf(row, PUBLICATION_ALIASES); const parsed = { basisFiscalYear: Number(reportDate.slice(0, 4)), reportDate, ...(publicationDate === undefined ? {} : { publicationDate }), ...(numberValue(first(row, EPS_ALIASES)) === undefined ? {} : { eps: numberValue(first(row, EPS_ALIASES)) }), ...(numberValue(first(row, BVPS_ALIASES)) === undefined ? {} : { bvps: numberValue(first(row, BVPS_ALIASES)) }), ...(numberValue(first(row, EBITDA_ALIASES)) === undefined ? {} : { ebitda: numberValue(first(row, EBITDA_ALIASES)) }), ...(numberValue(first(row, NET_DEBT_ALIASES)) === undefined ? {} : { netDebt: numberValue(first(row, NET_DEBT_ALIASES)) }), ...(numberValue(first(row, SHARES_ALIASES)) === undefined ? {} : { shares: numberValue(first(row, SHARES_ALIASES)) }) }
    rows.push(parsed)
  }
  if (rows.length === 0) diagnostics.push('VALUATION_FINANCIAL_BASIS_UNAVAILABLE')
  return { rows: rows.sort((left, right) => right.basisFiscalYear - left.basisFiscalYear), diagnostics }
}

export function selectValuationBasis(rows: readonly ValuationFinancialRow[], valuationDate: string, asOf?: string): { readonly basis?: ValuationFinancialRow; readonly publicationStatus?: ValuationBasis['publicationStatus']; readonly pointInTimeVerified: boolean; readonly diagnostics: readonly string[] } {
  const diagnostics: string[] = []; const historical = asOf !== undefined; const valuationCutoff = normalizeValuationDate(valuationDate) ?? valuationDate.slice(0, 10); const publicationCutoff = asOf ?? valuationCutoff; const datedRows = rows.filter((row) => row.reportDate <= valuationCutoff); const eligible = datedRows.filter((row) => { if (row.publicationDate === undefined) return !historical; return row.publicationDate <= publicationCutoff });
  if (datedRows.some((row) => row.publicationDate === undefined || row.publicationDate > publicationCutoff)) diagnostics.push('POINT_IN_TIME_PUBLICATION_UNVERIFIED')
  const basis = eligible[0]
  if (basis === undefined) { if (diagnostics.length === 0) diagnostics.push('POINT_IN_TIME_PUBLICATION_UNVERIFIED'); return { pointInTimeVerified: false, diagnostics } }
  return { basis, publicationStatus: historical ? 'verified' : basis.publicationDate === undefined ? 'current_snapshot_unverified' : 'verified', pointInTimeVerified: basis.publicationDate !== undefined && basis.publicationDate <= publicationCutoff, diagnostics }
}

export function buildValuationBasis(market: ValuationMarketObservation, financial: ValuationFinancialRow, valuationDate: string, publicationStatus: ValuationBasis['publicationStatus']): ValuationBasis {
  return { valuationDate, priceDate: market.priceDate, marketPrice: market.close, marketPriceUnit: 'CNY/share', basisFiscalYear: financial.basisFiscalYear, reportDate: financial.reportDate, publicationStatus, ...(financial.eps === undefined ? {} : { eps: financial.eps }), ...(financial.bvps === undefined ? {} : { bvps: financial.bvps }), ...(financial.ebitda === undefined ? {} : { ebitda: financial.ebitda }), ...(financial.netDebt === undefined ? {} : { netDebt: financial.netDebt }), ...(financial.shares === undefined ? {} : { shares: financial.shares }), units: { marketPrice: 'CNY/share', eps: 'CNY/share', bvps: 'CNY/share', ebitda: 'CNY', netDebt: 'CNY', shares: 'shares' } }
}

export function normalizeValuationData(marketValue: unknown, financialValue: unknown, valuationDate: string, asOf?: string): NormalizedValuationData {
  const market = normalizeValuationMarketData(marketValue, valuationDate); const financial = normalizeValuationFinancialData(financialValue); return { ...(market.observation === undefined ? {} : { market: market.observation }), financialRows: financial.rows, diagnostics: [...market.diagnostics, ...financial.diagnostics, ...selectValuationBasis(financial.rows, valuationDate, asOf).diagnostics] }
}

export function methodEligibility(basis: ValuationBasis): readonly ValuationMethodEligibility[] {
  return [
    { method: 'PE', eligible: basis.marketPrice > 0 && basis.eps !== undefined && Number.isFinite(basis.eps) && basis.eps > 0, reason: basis.eps !== undefined && basis.eps > 0 ? 'positive FY EPS' : 'FY EPS is unavailable or non-positive' },
    { method: 'PB', eligible: basis.marketPrice > 0 && basis.bvps !== undefined && Number.isFinite(basis.bvps) && basis.bvps > 0, reason: basis.bvps !== undefined && basis.bvps > 0 ? 'positive FY BVPS' : 'FY BVPS is unavailable or non-positive' },
    { method: 'EV_EBITDA', eligible: basis.marketPrice > 0 && basis.ebitda !== undefined && Number.isFinite(basis.ebitda) && basis.ebitda > 0 && basis.shares !== undefined && Number.isFinite(basis.shares) && basis.shares > 0 && basis.netDebt !== undefined && Number.isFinite(basis.netDebt), reason: basis.ebitda !== undefined && basis.ebitda > 0 && basis.shares !== undefined && basis.shares > 0 && basis.netDebt !== undefined && Number.isFinite(basis.netDebt) ? 'positive EBITDA with finite net debt and shares' : 'EBITDA, net debt, or shares are unavailable or invalid' },
  ]
}

export function referenceMultiples(basis: ValuationBasis): Readonly<Partial<Record<ValuationMethod, number>>> {
  const result: Partial<Record<ValuationMethod, number>> = {}; if (basis.eps !== undefined && basis.eps > 0) result.PE = basis.marketPrice / basis.eps; if (basis.bvps !== undefined && basis.bvps > 0) result.PB = basis.marketPrice / basis.bvps; if (basis.ebitda !== undefined && basis.ebitda > 0 && basis.netDebt !== undefined && Number.isFinite(basis.netDebt) && basis.shares !== undefined && basis.shares > 0) result.EV_EBITDA = (basis.marketPrice * basis.shares + basis.netDebt) / basis.ebitda; return Object.fromEntries(Object.entries(result).filter(([, value]) => Number.isFinite(value))) as Readonly<Partial<Record<ValuationMethod, number>>>
}

function numeric(value: number, label: string): number { if (!Number.isFinite(value)) throw new TypeError(`${label} is unavailable`); return value }
export function calculateTargetPrice(basis: ValuationBasis, method: ValuationMethod, targetFiscalYear: number, growthRate: number, targetMultiple: number): { readonly forecastMetric: number; readonly targetPrice: number; readonly impliedReturnPct: number } {
  if (!METHOD_SET.has(method) || !Number.isFinite(growthRate) || growthRate <= -1 || !Number.isFinite(targetMultiple) || targetMultiple <= 0 || !Number.isInteger(targetFiscalYear) || targetFiscalYear <= basis.basisFiscalYear) throw new TypeError('Invalid valuation calculation inputs')
  const periods = targetFiscalYear - basis.basisFiscalYear
  if (method === 'PE') { const forecastMetric = numeric(basis.eps ?? Number.NaN, 'EPS') * Math.pow(1 + growthRate, periods); const targetPrice = forecastMetric * targetMultiple; return { forecastMetric: numeric(forecastMetric, 'forecast EPS'), targetPrice: numeric(targetPrice, 'target price'), impliedReturnPct: numeric((targetPrice / basis.marketPrice - 1) * 100, 'implied return') } }
  if (method === 'PB') { const forecastMetric = numeric(basis.bvps ?? Number.NaN, 'BVPS') * Math.pow(1 + growthRate, periods); const targetPrice = forecastMetric * targetMultiple; return { forecastMetric: numeric(forecastMetric, 'forecast BVPS'), targetPrice: numeric(targetPrice, 'target price'), impliedReturnPct: numeric((targetPrice / basis.marketPrice - 1) * 100, 'implied return') } }
  const forecastMetric = numeric(basis.ebitda ?? Number.NaN, 'EBITDA') * Math.pow(1 + growthRate, periods); const targetEV = forecastMetric * targetMultiple; const targetPrice = (targetEV - numeric(basis.netDebt ?? Number.NaN, 'net debt')) / numeric(basis.shares ?? Number.NaN, 'shares'); return { forecastMetric: numeric(forecastMetric, 'forecast EBITDA'), targetPrice: numeric(targetPrice, 'target price'), impliedReturnPct: numeric((targetPrice / basis.marketPrice - 1) * 100, 'implied return') }
}

export function validateScenarioAssumptions(plan: { readonly primaryMethod: ValuationMethod; readonly targetFiscalYear: number; readonly scenarios: readonly ValuationScenarioAssumption[] }, eligibleMethods: readonly ValuationMethod[], basisFiscalYear: number): readonly string[] {
  const errors: string[] = []; if (!eligibleMethods.includes(plan.primaryMethod)) errors.push('primary method is not eligible'); if (plan.targetFiscalYear <= basisFiscalYear || plan.targetFiscalYear > basisFiscalYear + 3) errors.push('target fiscal year is outside the allowed horizon'); if (plan.scenarios.length !== 3 || new Set(plan.scenarios.map((item) => item.scenarioId)).size !== 3 || !SCENARIOS.every((id) => plan.scenarios.some((item) => item.scenarioId === id))) errors.push('exactly Bear/Base/Bull scenarios are required'); const ordered = SCENARIOS.map((id) => plan.scenarios.find((item) => item.scenarioId === id)).filter((item): item is ValuationScenarioAssumption => item !== undefined); for (const item of ordered) { if (item.primaryMethod !== plan.primaryMethod) errors.push(`${item.scenarioId} method mismatch`); if (item.targetFiscalYear !== plan.targetFiscalYear) errors.push(`${item.scenarioId} target fiscal year mismatch`); if (!Number.isFinite(item.growthRate) || item.growthRate <= -1) errors.push(`${item.scenarioId} growthRate invalid`); if (!Number.isFinite(item.targetMultiple) || item.targetMultiple <= 0) errors.push(`${item.scenarioId} targetMultiple invalid`); if (!item.rationale.trim()) errors.push(`${item.scenarioId} rationale missing`) } if (ordered.length === 3 && (ordered[0]!.growthRate > ordered[1]!.growthRate || ordered[1]!.growthRate > ordered[2]!.growthRate || ordered[0]!.targetMultiple > ordered[1]!.targetMultiple || ordered[1]!.targetMultiple > ordered[2]!.targetMultiple)) errors.push('scenario assumptions are not monotonic'); return errors
}

export function calculateValuation(basis: ValuationBasis, plan: { readonly primaryMethod: ValuationMethod; readonly secondaryMethods: readonly ValuationMethod[]; readonly targetFiscalYear: number; readonly scenarios: readonly ValuationScenarioAssumption[] }, eligibleMethods: readonly ValuationMethod[]): ValuationComputation {
  const errors = validateScenarioAssumptions(plan, eligibleMethods, basis.basisFiscalYear); if (errors.length) throw new TypeError(errors.join('; ')); const eligibility = methodEligibility(basis); const reference = referenceMultiples(basis); const scenarios: ValuationScenarioResult[] = SCENARIOS.map((id) => { const assumption = plan.scenarios.find((item) => item.scenarioId === id)!; return { scenarioId: id, primaryMethod: plan.primaryMethod, targetFiscalYear: plan.targetFiscalYear, growthRate: assumption.growthRate, targetMultiple: assumption.targetMultiple, ...calculateTargetPrice(basis, plan.primaryMethod, plan.targetFiscalYear, assumption.growthRate, assumption.targetMultiple) } }); if (scenarios[0]!.targetPrice > scenarios[1]!.targetPrice || scenarios[1]!.targetPrice > scenarios[2]!.targetPrice) throw new TypeError('scenario target prices are not monotonic'); const sensitivity: ValuationSensitivityCell[] = []; for (const growth of SCENARIOS) for (const multiple of SCENARIOS) { const growthAssumption = plan.scenarios.find((item) => item.scenarioId === growth)!; const multipleAssumption = plan.scenarios.find((item) => item.scenarioId === multiple)!; sensitivity.push({ cellId: `sensitivity-${growth}-${multiple}`, growthScenario: growth, multipleScenario: multiple, growthRate: growthAssumption.growthRate, targetMultiple: multipleAssumption.targetMultiple, targetPrice: calculateTargetPrice(basis, plan.primaryMethod, plan.targetFiscalYear, growthAssumption.growthRate, multipleAssumption.targetMultiple).targetPrice }) } const recomputed = scenarios.map((item) => calculateTargetPrice(basis, item.primaryMethod, item.targetFiscalYear, item.growthRate, item.targetMultiple).targetPrice); const deterministicRecomputeMatched = recomputed.every((value, index) => value === scenarios[index]!.targetPrice) && sensitivity.length === 9 && sensitivity.every((cell) => Number.isFinite(cell.targetPrice)); return { basis, eligibility, referenceMultiples: reference, scenarios, sensitivity, deterministicRecomputeMatched, unavailable: [] }
}
