import type { NormalizedResearchSource, ResearchCompanyIdentity, ResearchProviderOutcome } from '../contracts.ts'

export const EASTMONEY_REPORT_ENDPOINT = 'https://reportapi.eastmoney.com/report/list' as const
export const EASTMONEY_REPORT_PROVIDER = 'eastmoney-reportapi' as const

export type EastmoneyTimestampPrecision = 'datetime' | 'date'
export type EastmoneyForecastProviderField = 'predictThisYearEps' | 'predictNextYearEps' | 'predictNextTwoYearEps'

export interface EastmoneyEpsForecast {
  readonly fiscalYear: number
  readonly value: number
  readonly providerField: EastmoneyForecastProviderField
}

/** Provider-native report data retained after strict row validation. */
export interface EastmoneyResearchReportRecord {
  readonly infoCode: string
  readonly stockCode: string
  readonly stockName?: string
  readonly title: string
  readonly orgCode: string
  readonly orgName?: string
  readonly orgShortName: string
  readonly researcher?: string
  readonly publishDateRaw: string
  readonly publishedAt: string
  readonly timestampPrecision: EastmoneyTimestampPrecision
  readonly forecastBaseYear: number
  readonly epsForecasts: readonly EastmoneyEpsForecast[]
  readonly rating?: string
  readonly reportPdfUrl?: string
}

export interface EastmoneyEstimateSourceRequest {
  readonly company: ResearchCompanyIdentity
  readonly asOf: string
  readonly targetFiscalYear: number
  readonly maxPages?: number
}

export interface EastmoneyReportSourceClientOptions {
  readonly fetchImpl?: typeof fetch
  readonly endpoint?: string
  readonly now?: () => string
  readonly timeoutMs?: number
  readonly pageSize?: number
  readonly maxPages?: number
  readonly maxPayloadBytes?: number
}

export interface EastmoneyReportAcquisitionResult {
  readonly records: readonly EastmoneyResearchReportRecord[]
  readonly sources: readonly NormalizedResearchSource[]
  readonly diagnostics: readonly string[]
  readonly providerOutcome: ResearchProviderOutcome
  readonly forecastBaseYear?: number
  readonly truncated: boolean
}
