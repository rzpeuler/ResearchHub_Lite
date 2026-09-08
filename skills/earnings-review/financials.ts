export type EarningsPeriod = 'Q1' | 'H1' | 'Q3' | 'FY'
export type EarningsMetricName = 'revenue' | 'net_profit' | 'gross_margin' | 'operating_cash_flow' | 'eps' | 'revenue_yoy' | 'net_profit_yoy' | 'gross_margin_delta_bps' | 'operating_cash_flow_to_net_profit'
export type EarningsMetricUnit = 'CNY' | 'percent' | 'CNY_per_share' | 'ratio'

export interface EarningsPeriodSpec { readonly fiscalYear: number; readonly period: EarningsPeriod; readonly key: string; readonly endDate: string }
export interface VerifiedFinancialMetric { readonly metric: EarningsMetricName; readonly value: number; readonly unit: EarningsMetricUnit; readonly period: string; readonly comparator: 'eq' | 'approx'; readonly calculation: 'observed' | 'derived'; readonly sourceCandidateIds: readonly string[] }
export interface FinancialPeriodSnapshot { readonly period: string; readonly metrics: Readonly<Partial<Record<'revenue' | 'net_profit' | 'gross_margin' | 'operating_cash_flow' | 'eps', VerifiedFinancialMetric>>> }
export interface NormalizedFinancialData { readonly requested: EarningsPeriodSpec; readonly current?: FinancialPeriodSnapshot; readonly priorYear?: FinancialPeriodSnapshot; readonly diagnostics: readonly string[]; readonly sourceCandidateId: string }
export interface EarningsComputation { readonly metrics: readonly VerifiedFinancialMetric[]; readonly byMetric: Readonly<Record<string, VerifiedFinancialMetric>>; readonly unavailable: readonly string[] }

const PERIOD_DATES: Readonly<Record<EarningsPeriod, { readonly month: number; readonly day: number }>> = { Q1: { month: 3, day: 31 }, H1: { month: 6, day: 30 }, Q3: { month: 9, day: 30 }, FY: { month: 12, day: 31 } }
const PERIOD_ALIASES: Readonly<Record<EarningsPeriod, readonly string[]>> = { Q1: ['第一季度报告', '一季度报告', '一季度'], H1: ['半年度报告', '半年报', '中期报告'], Q3: ['第三季度报告', '三季度报告', '三季度'], FY: ['年度报告', '年报'] }
const FIELD_ALIASES: Readonly<Record<'revenue' | 'net_profit' | 'gross_margin' | 'operating_cash_flow' | 'eps', readonly string[]>> = {
  revenue: ['营业总收入', '营业收入', 'total_operating_revenue', 'operating_revenue', 'revenue'],
  net_profit: ['净利润', '归属于上市公司股东的净利润', 'net_profit', 'net profit'],
  gross_margin: ['销售毛利率', '毛利率', 'gross_margin', 'gross profit margin'],
  operating_cash_flow: ['经营活动产生的现金流量净额', '经营活动现金流量净额', 'net_cash_flows_from_operating_activities', 'operating_cash_flow'],
  eps: ['基本每股收益', '基本每股收益(元)', 'basic_eps', 'eps'],
}
const PERIOD_FIELDS = ['报告期', '报告日期', '报告期末', '日期', 'date', 'end_date', 'report_date', 'period', 'fiscal_period'] as const

export function earningsPeriodSpec(fiscalYear: number, period: EarningsPeriod): EarningsPeriodSpec {
  if (!Number.isInteger(fiscalYear) || fiscalYear < 1900 || fiscalYear > 2200) throw new TypeError('fiscalYear must be an integer between 1900 and 2200')
  if (!Object.prototype.hasOwnProperty.call(PERIOD_DATES, period)) throw new TypeError('period must be Q1, H1, Q3, or FY')
  const date = PERIOD_DATES[period]
  return { fiscalYear, period, key: `${fiscalYear}-${period}`, endDate: `${fiscalYear}-${String(date.month).padStart(2, '0')}-${String(date.day).padStart(2, '0')}` }
}

export function periodKey(fiscalYear: number, period: EarningsPeriod): string { return earningsPeriodSpec(fiscalYear, period).key }
export function periodTitleAliases(period: EarningsPeriod): readonly string[] { return PERIOD_ALIASES[period] }

export function normalizeAksharePeriod(value: unknown): string | undefined {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10)
  if (typeof value !== 'string' && typeof value !== 'number') return undefined
  const text = String(value).trim()
  const chinese = /^(\d{4})年(\d{1,2})月(\d{1,2})日/.exec(text)
  const separated = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/.exec(text)
  const match = chinese ?? separated
  if (!match) return undefined
  const year = Number(match[1]); const month = Number(match[2]); const day = Number(match[3])
  if (!Number.isInteger(year) || month < 1 || month > 12 || day < 1 || day > 31) return undefined
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function rowsOf(value: unknown): readonly Record<string, unknown>[] {
  if (Array.isArray(value)) return value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object' && !Array.isArray(item))
  if (value && typeof value === 'object' && !Array.isArray(value) && Array.isArray((value as Record<string, unknown>).data)) return rowsOf((value as Record<string, unknown>).data)
  return []
}
function valueFor(row: Record<string, unknown>, aliases: readonly string[]): unknown { for (const alias of aliases) if (Object.prototype.hasOwnProperty.call(row, alias)) return row[alias]; return undefined }
function numberValue(value: unknown): number | undefined {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined
  if (typeof value !== 'string' || value.trim() === '') return undefined
  const normalized = value.trim().replace(/,/g, '')
  if (!/^-?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?%?$/i.test(normalized)) return undefined
  const parsed = Number(normalized.replace(/%$/, ''))
  return Number.isFinite(parsed) ? parsed : undefined
}
function snapshot(row: Record<string, unknown>, period: string, sourceCandidateId: string, diagnostics: string[]): FinancialPeriodSnapshot {
  const metrics: Partial<Record<'revenue' | 'net_profit' | 'gross_margin' | 'operating_cash_flow' | 'eps', VerifiedFinancialMetric>> = {}
  const definitions: ReadonlyArray<readonly ['revenue' | 'net_profit' | 'gross_margin' | 'operating_cash_flow' | 'eps', EarningsMetricUnit]> = [['revenue', 'CNY'], ['net_profit', 'CNY'], ['gross_margin', 'percent'], ['operating_cash_flow', 'CNY'], ['eps', 'CNY_per_share']]
  for (const [metric, unit] of definitions) {
    const raw = valueFor(row, FIELD_ALIASES[metric]); if (raw === undefined || raw === null || raw === '') continue
    const value = numberValue(raw); if (value === undefined) { diagnostics.push(`Malformed ${metric} value for ${period}`); continue }
    metrics[metric] = { metric, value, unit, period, comparator: 'eq', calculation: 'observed', sourceCandidateIds: [sourceCandidateId] }
  }
  return { period, metrics }
}

export function normalizeAkshareFinancialData(value: unknown, requested: EarningsPeriodSpec, sourceCandidateId = `akshare-earnings-${requested.key}`): NormalizedFinancialData {
  const rows = rowsOf(value); const diagnostics: string[] = []; const wanted = new Map<string, Record<string, unknown>>(); const currentDate = requested.endDate; const priorDate = earningsPeriodSpec(requested.fiscalYear - 1, requested.period).endDate
  for (const row of rows) {
    const rawPeriod = valueFor(row, PERIOD_FIELDS); const date = normalizeAksharePeriod(rawPeriod)
    if (date === currentDate || date === priorDate) wanted.set(date, row)
  }
  const currentRow = wanted.get(currentDate); const priorRow = wanted.get(priorDate)
  if (!currentRow) diagnostics.push(`Exact financial period ${requested.key} was not found`)
  const current = currentRow === undefined ? undefined : snapshot(currentRow, requested.key, sourceCandidateId, diagnostics)
  const priorYear = priorRow === undefined ? undefined : snapshot(priorRow, `${requested.fiscalYear - 1}-${requested.period}`, sourceCandidateId, diagnostics)
  return { requested, ...(current === undefined ? {} : { current }), ...(priorYear === undefined ? {} : { priorYear }), diagnostics, sourceCandidateId }
}

function derived(metric: EarningsMetricName, value: number, unit: EarningsMetricUnit, period: string, sourceCandidateId: string): VerifiedFinancialMetric { return { metric, value, unit, period, comparator: 'eq', calculation: 'derived', sourceCandidateIds: [sourceCandidateId] } }
function yoy(current: VerifiedFinancialMetric | undefined, prior: VerifiedFinancialMetric | undefined, metric: EarningsMetricName, period: string, sourceCandidateId: string): VerifiedFinancialMetric | undefined { if (!current || !prior || current.unit !== prior.unit || prior.value === 0) return undefined; const value = (current.value - prior.value) / Math.abs(prior.value) * 100; return Number.isFinite(value) ? derived(metric, value, 'percent', period, sourceCandidateId) : undefined }

export function computeEarningsMetrics(data: NormalizedFinancialData): EarningsComputation {
  const metrics: VerifiedFinancialMetric[] = []; const unavailable: string[] = []; const current = data.current?.metrics ?? {}; const prior = data.priorYear?.metrics ?? {}; const period = data.requested.key; const source = data.sourceCandidateId
  for (const name of ['revenue', 'net_profit', 'gross_margin', 'operating_cash_flow', 'eps'] as const) { const metric = current[name]; if (metric) metrics.push(metric); else unavailable.push(name) }
  const revenueYoy = yoy(current.revenue, prior.revenue, 'revenue_yoy', period, source); revenueYoy ? metrics.push(revenueYoy) : unavailable.push('revenue_yoy')
  const profitYoy = yoy(current.net_profit, prior.net_profit, 'net_profit_yoy', period, source); profitYoy ? metrics.push(profitYoy) : unavailable.push('net_profit_yoy')
  if (current.gross_margin && prior.gross_margin && current.gross_margin.unit === 'percent' && prior.gross_margin.unit === 'percent') metrics.push(derived('gross_margin_delta_bps', (current.gross_margin.value - prior.gross_margin.value) * 100, 'ratio', period, source)); else unavailable.push('gross_margin_delta_bps')
  if (current.operating_cash_flow && current.net_profit && current.operating_cash_flow.unit === 'CNY' && current.net_profit.unit === 'CNY' && current.net_profit.value !== 0) metrics.push(derived('operating_cash_flow_to_net_profit', current.operating_cash_flow.value / current.net_profit.value, 'ratio', period, source)); else unavailable.push('operating_cash_flow_to_net_profit')
  return { metrics, byMetric: Object.fromEntries(metrics.map((metric) => [metric.metric, metric])), unavailable }
}

export function hasUsableExactPeriod(data: NormalizedFinancialData): boolean { return data.current !== undefined && Object.keys(data.current.metrics).length > 0 }
export function metricStructuredValues(computation: EarningsComputation): readonly Readonly<Record<string, unknown>>[] { return computation.metrics.map((metric) => ({ metric: metric.metric, value: metric.value, unit: metric.unit, period: metric.period, comparator: metric.comparator })) }
