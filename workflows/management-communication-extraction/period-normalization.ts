export interface FiscalPeriodResolution {
  readonly fiscalPeriod?: string
  readonly diagnostic?: string
}

/** Reuses the Earnings Review convention: YYYY-Q1, YYYY-H1, YYYY-Q3, YYYY-FY. */
export function resolveFiscalPeriod(raw: string | undefined): FiscalPeriodResolution {
  if (raw === undefined || raw.trim() === '') return { diagnostic: 'FISCAL_PERIOD_MISSING' }
  const value = raw.normalize('NFKC').replace(/\s+/g, '').trim()
  const year = /^(\d{4})/.exec(value)?.[1]
  if (year === undefined) return { diagnostic: 'FISCAL_PERIOD_NOT_EXPLICIT' }
  if (/^\d{4}-(FY|H1|Q1|Q3)$/i.test(value)) return { fiscalPeriod: value.toUpperCase() }
  if (/^\d{4}-(H2|Q2|Q4)$/i.test(value)) return { diagnostic: 'FISCAL_PERIOD_UNAVAILABLE_IN_EXISTING_CONVENTION' }
  if (/全年|年度$/.test(value)) return { fiscalPeriod: `${year}-FY` }
  if (/上半年|半年度|半年$/.test(value)) return { fiscalPeriod: `${year}-H1` }
  if (/第一季度|一季度|Q1$/i.test(value)) return { fiscalPeriod: `${year}-Q1` }
  if (/第三季度|三季度|Q3$/i.test(value)) return { fiscalPeriod: `${year}-Q3` }
  if (/第二季度|二季度|Q2$/i.test(value)) return { diagnostic: 'FISCAL_PERIOD_Q2_UNAVAILABLE_IN_EXISTING_CONVENTION' }
  if (/第四季度|四季度|Q4$/i.test(value)) return { diagnostic: 'FISCAL_PERIOD_Q4_UNAVAILABLE_IN_EXISTING_CONVENTION' }
  if (/下半年/.test(value)) return { diagnostic: 'FISCAL_PERIOD_H2_UNAVAILABLE_IN_EXISTING_CONVENTION' }
  if (/今年|明年|本季度|下一季度|上季度/.test(value)) return { diagnostic: 'FISCAL_PERIOD_RELATIVE_AMBIGUOUS' }
  return { diagnostic: 'FISCAL_PERIOD_UNSUPPORTED' }
}
