import { sha256 } from '../../plugins/research-acquisition/hash.ts'
import type { AkshareDataClient, AksharePeerComparisonFamily } from '../../plugins/research-acquisition/akshare.ts'
import type { OfficialDisclosureClient } from '../../plugins/research-acquisition/official.ts'
import type { NormalizedResearchSource, ResearchCompanyIdentity } from '../../plugins/research-acquisition/contracts.ts'
import { normalizeValuationFinancialData, normalizeValuationMarketData } from '../../skills/valuation/financials.ts'
import { resolveValuationBasisEvidence } from './basis-evidence.ts'
import { executeEquityMultipleComps, type AutomaticComparablePeer, type AutomaticComparableSubject, type AutomaticEquityCompsResult, type AutomaticPeerComparisonFamily, type AutomaticPeerCohortMembership, type AutomaticPeerGrowthProfile, type AutomaticPeerProfitabilityProfile, type AutomaticPeerScaleProfile, type AutomaticRejectedPeer } from '../../skills/comps_valuation/index.ts'

type Dict = Record<string, unknown>
type AutoFamily = AutomaticPeerComparisonFamily
const families: readonly AutoFamily[] = ['GROWTH', 'VALUATION', 'DUPONT', 'SCALE']
const familyRequest: Readonly<Record<AutoFamily, AksharePeerComparisonFamily>> = { GROWTH: 'growth', VALUATION: 'valuation', DUPONT: 'dupont', SCALE: 'scale' }
const AUTO_SOURCE_URL = 'https://datacenter.eastmoney.com/securities/api/data/v1/get'
const MAX_EXPENSIVE_VALIDATIONS = 12

export interface AutomaticCompsResolutionInput {
  readonly company: ResearchCompanyIdentity
  readonly valuationDate: string
  readonly basisFiscalYear: number
  readonly targetFiscalYear: number
  readonly selectedMethod: 'PE' | 'PB'
  readonly targetForecastMetric: number
  readonly targetSourceRefs: readonly string[]
  readonly akshare: AkshareDataClient
  readonly officialDisclosure?: OfficialDisclosureClient
  readonly retrievedAt: string
  readonly signal?: AbortSignal
  readonly now: string
}

export interface AutomaticCompsResolution {
  readonly result: AutomaticEquityCompsResult
  readonly sources: readonly NormalizedResearchSource[]
}

function rowsOf(value: unknown): readonly Dict[] {
  if (Array.isArray(value)) return value.filter((row): row is Dict => Boolean(row) && typeof row === 'object' && !Array.isArray(row))
  if (value && typeof value === 'object') {
    const object = value as Dict
    if (Array.isArray(object.data)) return rowsOf(object.data)
    if (object.result && typeof object.result === 'object') return rowsOf(object.result)
  }
  return []
}
function text(row: Dict, names: readonly string[]): string | undefined { for (const name of names) if (typeof row[name] === 'string' && row[name].trim()) return row[name].trim(); return undefined }
function number(row: Dict, names: readonly string[]): number | undefined { for (const name of names) { const value = row[name]; const parsed = typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value.replace(/,/g, '').replace(/%$/, '')) : Number.NaN; if (Number.isFinite(parsed)) return parsed } return undefined }
function positive(value: number | undefined): value is number { return value !== undefined && Number.isFinite(value) && value > 0 }
function exchangeOf(value: string | undefined): string | undefined { const match = value?.toUpperCase().match(/(?:^|\.)(SH|SZ|BSE)$/); return match?.[1] }
function tickerOf(value: string | undefined): string | undefined { const match = value?.toUpperCase().match(/\d{6}/); return match?.[0] }
function identityOf(row: Dict, target: string): { readonly ticker?: string; readonly exchange?: string; readonly companyId?: string; readonly name?: string } {
  const direct = text(row, ['SECUCODE', 'secuCode', 'SECURITY_CODE', 'securityCode'])
  const correlated = text(row, ['CORRE_SECUCODE', 'CORRE_SECURITY_CODE', 'correSecucode'])
  const selected = correlated && tickerOf(correlated) !== target ? correlated : direct ?? correlated
  const ticker = tickerOf(selected) ?? tickerOf(text(row, ['SECURITY_CODE', 'CORRE_SECURITY_CODE']))
  const exchange = exchangeOf(selected) ?? (ticker?.startsWith('6') ? 'SH' : ticker === undefined ? undefined : 'SZ')
  return { ticker, exchange, companyId: ticker && exchange ? `${ticker}.${exchange}` : undefined, name: text(row, ['SECURITY_NAME_ABBR', 'CORRE_SECURITY_NAME', 'SECURITY_NAME']) }
}
function source(candidateId: string, title: string, contentValue: unknown, company: ResearchCompanyIdentity, retrievedAt: string, metadata: Readonly<Record<string, unknown>>, options: { readonly kind?: 'structured_data' | 'official_disclosure'; readonly publisher?: string; readonly provider?: string; readonly sourceUrl?: string; readonly publishedAt?: string; readonly authority?: string } = {}): NormalizedResearchSource {
  const content = JSON.stringify(contentValue)
  return { candidate: { candidateId, kind: options.kind ?? 'structured_data', tier: options.kind === 'official_disclosure' ? 1 : 2, title, provider: options.provider ?? 'ResearchHub direct HTTP', ...(options.publishedAt === undefined ? {} : { publishedAt: options.publishedAt }), metadata: { companySymbol: company.symbol, originPublisher: options.publisher ?? 'EastMoney', originAuthority: options.authority ?? 'S3_AGGREGATOR', retrievalProvider: options.provider ?? 'ResearchHub direct HTTP', sourceUrl: options.sourceUrl ?? AUTO_SOURCE_URL, ...metadata } }, retrievedAt, title, content, canonicalUrl: options.sourceUrl ?? AUTO_SOURCE_URL, contentHash: sha256(content), publisher: options.publisher ?? 'EastMoney', rights: { accessScope: 'public', retentionAllowed: true, aiProcessingAllowed: true, derivativeKnowledgeAllowed: true, redistributionAllowed: false } }
}
function emptySubject(input: AutomaticCompsResolutionInput, sourceRefs: readonly string[] = input.targetSourceRefs): AutomaticComparableSubject { return { identity: { companyId: input.company.symbol, ticker: input.company.symbol, exchange: input.company.exchange ?? (input.company.symbol.startsWith('6') ? 'SSE' : 'SZSE'), ...(input.company.name === undefined ? {} : { name: input.company.name }) }, sourceRefs: [...sourceRefs] } }
function emptyResult(input: AutomaticCompsResolutionInput, availability: AutomaticEquityCompsResult['availability'], diagnostics: readonly string[], subject: AutomaticComparableSubject = emptySubject(input), counts = { candidatePeerCount: 0, expensiveValidationCount: 0 }): AutomaticEquityCompsResult { return { availability, subject, selectedMethod: input.selectedMethod, multipleBasisFiscalYear: input.basisFiscalYear, targetFiscalYear: input.targetFiscalYear, valuationDate: input.valuationDate, targetForecastMetric: input.targetForecastMetric, validPeers: [], rejectedPeers: [], multipleSummaries: [{ method: 'PE', validCount: 0, peerRefs: [] }, { method: 'PB', validCount: 0, peerRefs: [] }], sourceRefs: [...new Set([...input.targetSourceRefs])], diagnostics: [...new Set(diagnostics)], ...counts } }
export function unavailableAutomaticComps(input: Pick<AutomaticCompsResolutionInput, 'company' | 'valuationDate' | 'basisFiscalYear' | 'targetFiscalYear' | 'selectedMethod' | 'targetForecastMetric' | 'targetSourceRefs'>, diagnostics: readonly string[]): AutomaticEquityCompsResult { return emptyResult({ ...input, akshare: {} as AkshareDataClient, retrievedAt: input.valuationDate, now: input.valuationDate }, 'unavailable', diagnostics) }
function abort(signal: AbortSignal | undefined): void { if (signal?.aborted) throw new Error('WORKFLOW_CANCELLED') }

interface CandidateAggregate {
  readonly identity: { readonly companyId: string; readonly ticker: string; readonly exchange: string; readonly name?: string }
  readonly memberships: AutomaticPeerCohortMembership[]
  readonly rows: Partial<Record<AutoFamily, Dict>>
  readonly sourceRefs: string[]
}

function profile(candidate: CandidateAggregate): { readonly scale: AutomaticPeerScaleProfile; readonly growth?: AutomaticPeerGrowthProfile; readonly profitability?: AutomaticPeerProfitabilityProfile } {
  const growthRow = candidate.rows.GROWTH
  const dupontRow = candidate.rows.DUPONT
  const scaleRow = candidate.rows.SCALE
  const growth = growthRow === undefined ? undefined : { ...(number(growthRow, ['YYSR_3Y']) === undefined ? {} : { revenueGrowth3Y: number(growthRow, ['YYSR_3Y']) }), ...(number(growthRow, ['JLR_3Y']) === undefined ? {} : { netProfitGrowth3Y: number(growthRow, ['JLR_3Y']) }), ...(number(growthRow, ['MGSY_3Y']) === undefined ? {} : { epsGrowth3Y: number(growthRow, ['MGSY_3Y']) }) }
  const profitability = dupontRow === undefined ? undefined : { ...(number(dupontRow, ['ROE_AVG']) === undefined ? {} : { roe: number(dupontRow, ['ROE_AVG']) }), ...(number(dupontRow, ['XSJLL_AVG']) === undefined ? {} : { netMargin: number(dupontRow, ['XSJLL_AVG']) }), ...(number(dupontRow, ['TOAZZL_AVG']) === undefined ? {} : { assetTurnover: number(dupontRow, ['TOAZZL_AVG']) }) }
  return { scale: { ...(number(scaleRow ?? {}, ['TOTAL_CAP']) === undefined ? {} : { marketCap: number(scaleRow ?? {}, ['TOTAL_CAP']) }), ...(number(scaleRow ?? {}, ['FREECAP']) === undefined ? {} : { freeFloatMarketCap: number(scaleRow ?? {}, ['FREECAP']) }) }, ...(growth && Object.keys(growth).length ? { growth } : {}), ...(profitability && Object.keys(profitability).length ? { profitability } : {}) }
}

function hasProfile(value: ReturnType<typeof profile>): boolean { return value.growth !== undefined || value.profitability !== undefined }

export async function resolveAutomaticComps(input: AutomaticCompsResolutionInput): Promise<AutomaticCompsResolution> {
  if (!input.akshare.peerComparison) return { result: emptyResult(input, 'unavailable', ['AUTO_COMPS_PEER_COMPARISON_UNAVAILABLE']), sources: [] }
  const sources: NormalizedResearchSource[] = []
  const aggregates = new Map<string, CandidateAggregate>()
  let subjectMarketCap: number | undefined
  try {
    for (const family of families) {
      abort(input.signal)
      const raw = await input.akshare.peerComparison({ symbol: input.company.symbol, family: familyRequest[family] })
      const rows = rowsOf(raw)
      const familySourceId = `eastmoney-auto-comps-${input.company.symbol}-${family.toLowerCase()}-${input.valuationDate}`
      sources.push(source(familySourceId, `EastMoney automatic comparable ${family} snapshot`, raw, input.company, input.retrievedAt, { dataKind: 'automatic-comps-cohort', cohortFamily: family, reportDates: rows.map((row) => text(row, ['REPORT_DATE', 'report_date'])).filter((value): value is string => value !== undefined), rawIdentityFields: ['SECUCODE', 'CORRE_SECUCODE', 'CORRE_SECURITY_CODE'], rawFamily: family }, { provider: 'ResearchHub direct HTTP' }))
      const targetExchange = input.company.exchange?.toUpperCase() === 'SSE' ? 'SH' : input.company.exchange?.toUpperCase() === 'SZSE' ? 'SZ' : input.company.symbol.startsWith('6') ? 'SH' : 'SZ'
      for (const row of rows) {
        const identity = identityOf(row, input.company.symbol)
        if (!identity.companyId || !identity.ticker || !identity.exchange) continue
        if (identity.ticker === input.company.symbol && identity.exchange === targetExchange) { if (family === 'SCALE') subjectMarketCap = number(row, ['TOTAL_CAP']) ?? subjectMarketCap; continue }
        const existing = aggregates.get(identity.companyId)
        const aggregate = existing ?? { identity: { companyId: identity.companyId, ticker: identity.ticker, exchange: identity.exchange, ...(identity.name === undefined ? {} : { name: identity.name }) }, memberships: [], rows: {}, sourceRefs: [] }
        aggregate.rows[family] = row
        aggregate.memberships.push({ family, ...(text(row, ['REPORT_DATE', 'report_date']) === undefined ? {} : { reportDate: text(row, ['REPORT_DATE', 'report_date']) }), ...(text(row, ['REPORT_TYPE', 'report_type']) === undefined ? {} : { reportType: text(row, ['REPORT_TYPE', 'report_type']) }), sourceRef: familySourceId })
        aggregate.sourceRefs.push(familySourceId)
        aggregates.set(identity.companyId, aggregate)
      }
    }
  } catch (error) {
    if (error instanceof Error && error.message === 'WORKFLOW_CANCELLED') throw error
    return { result: emptyResult(input, 'unavailable', [`AUTO_COMPS_ACQUISITION_FAILED:${error instanceof Error ? error.message : String(error)}`]), sources }
  }
  const subject = { ...emptySubject(input, [...input.targetSourceRefs, ...sources.filter((item) => item.candidate.metadata?.cohortFamily !== undefined).map((item) => item.candidate.candidateId)]), ...(subjectMarketCap === undefined ? {} : { marketCap: subjectMarketCap }) }
  const rejected: AutomaticRejectedPeer[] = []
  const cheap: CandidateAggregate[] = []
  const ratios = new Map<string, number>()
  for (const candidate of aggregates.values()) {
    const reasons: string[] = []
    const familiesPresent = new Set(candidate.memberships.map((item) => item.family))
    const p = profile(candidate)
    if (familiesPresent.size < 2 || (!familiesPresent.has('GROWTH') && !familiesPresent.has('DUPONT'))) reasons.push('INSUFFICIENT_SOURCE_CONSENSUS')
    const marketCap = p.scale.marketCap
    if (!positive(subject.marketCap) || !positive(marketCap)) reasons.push('SCALE_PROFILE_UNAVAILABLE')
    else ratios.set(candidate.identity.companyId, marketCap / subject.marketCap)
    if (!hasProfile(p)) reasons.push('INSUFFICIENT_PROFILE_EVIDENCE')
    if (reasons.length) { rejected.push({ identity: candidate.identity, reasonCodes: reasons, sourceRefs: [...new Set(candidate.sourceRefs)] }); continue }
    cheap.push(candidate)
  }
  cheap.sort((left, right) => { const familyDelta = new Set(right.memberships.map((item) => item.family)).size - new Set(left.memberships.map((item) => item.family)).size; if (familyDelta) return familyDelta; const leftRatio = Math.abs(Math.log(ratios.get(left.identity.companyId) ?? 1)); const rightRatio = Math.abs(Math.log(ratios.get(right.identity.companyId) ?? 1)); return leftRatio - rightRatio || left.identity.ticker.localeCompare(right.identity.ticker) })
  const valid: AutomaticComparablePeer[] = []
  for (const candidate of cheap.slice(0, MAX_EXPENSIVE_VALIDATIONS)) {
    abort(input.signal)
    const peerCompany: ResearchCompanyIdentity = { symbol: candidate.identity.ticker, name: candidate.identity.name, exchange: candidate.identity.exchange }
    const peerRefs = [...new Set(candidate.sourceRefs)]
    try {
      const marketRaw = await input.akshare.historicalMarketData({ symbol: candidate.identity.ticker })
      const market = normalizeValuationMarketData(marketRaw, input.valuationDate)
      if (!market.observation) throw new Error('PEER_MARKET_UNAVAILABLE')
      const financialRaw = input.akshare.valuationFinancialIndicators ? await input.akshare.valuationFinancialIndicators({ symbol: candidate.identity.ticker }) : undefined
      const financial = normalizeValuationFinancialData(financialRaw)
      const row = financial.rows.find((item) => item.basisFiscalYear === input.basisFiscalYear)
      if (!row) throw new Error('PEER_FINANCIAL_BASIS_UNAVAILABLE')
      const publication = input.officialDisclosure?.resolveAnnualReportPublication ? await input.officialDisclosure.resolveAnnualReportPublication({ company: peerCompany, fiscalYear: input.basisFiscalYear }) : undefined
      if (!publication) throw new Error('PEER_BASIS_PUBLICATION_UNAVAILABLE')
      const evidence = resolveValuationBasisEvidence({ market: market.observation, financialRows: [row], publication, valuationDate: input.valuationDate, now: input.now, retrievedAt: input.retrievedAt, marketRetrievedAt: input.retrievedAt, marketSourceUrl: 'https://push2his.eastmoney.com/api/qt/kline/get', financialSourceUrl: 'https://datacenter.eastmoney.com/securities/api/data/get' })
      if (!evidence.basis || evidence.evidence.basisFiscalYear !== input.basisFiscalYear) throw new Error('PEER_BASIS_PERIOD_MISMATCH')
      const marketRef = `eastmoney-auto-comps-market-${candidate.identity.ticker}-${market.observation.priceDate}`
      const financialRef = `eastmoney-auto-comps-financial-${candidate.identity.ticker}-${input.basisFiscalYear}`
      sources.push(source(marketRef, `EastMoney automatic comparable market ${candidate.identity.ticker}`, market.observation, input.company, input.retrievedAt, { dataKind: 'automatic-comps-market', valuationEvidenceRole: 'market', basisFiscalYear: input.basisFiscalYear }, { provider: 'AKShare', sourceUrl: 'https://push2his.eastmoney.com/api/qt/kline/get' }))
      sources.push(source(financialRef, `EastMoney automatic comparable financial ${candidate.identity.ticker}`, row, input.company, input.retrievedAt, { dataKind: 'automatic-comps-financial', valuationEvidenceRole: 'financial', basisFiscalYear: input.basisFiscalYear, reportDate: row.reportDate }, { provider: 'AKShare', sourceUrl: 'https://datacenter.eastmoney.com/securities/api/data/get' }))
      const publicationRef = `cninfo-auto-comps-annual-report-${candidate.identity.ticker}-${input.basisFiscalYear}`
      sources.push(source(publicationRef, publication.reportTitle, publication, input.company, publication.retrievedAt, { dataKind: 'automatic-comps-annual-report', valuationEvidenceRole: 'financial', basisFiscalYear: input.basisFiscalYear }, { kind: 'official_disclosure', publisher: 'CNINFO', provider: 'CNINFO', sourceUrl: publication.sourceUrl, publishedAt: publication.officialPublishedAt, authority: 'S0_STATUTORY' }))
      const profiles = profile(candidate)
      valid.push({ identity: candidate.identity, cohortFamilyCount: new Set(candidate.memberships.map((item) => item.family)).size, cohortMembership: candidate.memberships, scale: { ...profiles.scale, ...(ratios.get(candidate.identity.companyId) === undefined ? {} : { marketCapToSubject: ratios.get(candidate.identity.companyId) }) }, ...(profiles.growth === undefined ? {} : { growth: profiles.growth }), ...(profiles.profitability === undefined ? {} : { profitability: profiles.profitability }), marketPrice: market.observation.close, marketPriceDate: market.observation.priceDate, ...(row.eps === undefined ? {} : { eps: row.eps }), ...(row.bvps === undefined ? {} : { bvps: row.bvps }), multipleBasisFiscalYear: input.basisFiscalYear, sourceRefs: [...new Set([...peerRefs, marketRef, financialRef, publicationRef])], diagnostics: evidence.diagnostics })
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      rejected.push({ identity: candidate.identity, reasonCodes: [reason.startsWith('PEER_') ? reason : 'PEER_VALIDATION_FAILED'], sourceRefs: peerRefs })
    }
  }
  const result = executeEquityMultipleComps({ subject, selectedMethod: input.selectedMethod, multipleBasisFiscalYear: input.basisFiscalYear, targetFiscalYear: input.targetFiscalYear, valuationDate: input.valuationDate, targetForecastMetric: input.targetForecastMetric, peers: valid, rejectedPeers: rejected, sourceRefs: [...input.targetSourceRefs, ...sources.map((item) => item.candidate.candidateId)] })
  return { result: { ...result, candidatePeerCount: aggregates.size, expensiveValidationCount: Math.min(cheap.length, MAX_EXPENSIVE_VALIDATIONS), diagnostics: [...result.diagnostics, ...(subjectMarketCap === undefined ? ['TARGET_SCALE_UNAVAILABLE'] : [])] }, sources }
}
