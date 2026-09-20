import { EastmoneyReportClient } from '../plugins/research-acquisition/expectations/eastmoney-report.ts'
import { projectEastmoneyEstimatePoints } from '../workflows/earnings-review/expectation-source-eastmoney.ts'

function shanghaiDate(value: Date): string {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(value).filter((item) => item.type !== 'literal').map((item) => [item.type, item.value]))
  return `${parts.year}-${parts.month}-${parts.day}`
}

if (process.env.RHL_REAL_EXPECTATION_SOURCE !== '1') {
  console.log('SKIP: set RHL_REAL_EXPECTATION_SOURCE=1 to run the gated network preflight')
} else {
  const now = new Date()
  const asOf = now.toISOString()
  const historicalAsOf = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString()
  const company = { symbol: '600519', name: '贵州茅台', exchange: 'SSE' as const }
  const calls: URL[] = []
  const client = new EastmoneyReportClient({ fetchImpl: async (input, init) => { calls.push(new URL(String(input))); return fetch(input, init) } })
  const provisionalTargetFiscalYear = now.getUTCFullYear()
  const current = await client.acquire({ company, asOf, targetFiscalYear: provisionalTargetFiscalYear })
  if (current.forecastBaseYear === undefined) throw new Error('real preflight did not return provider forecastBaseYear')
  const projectionTargetFiscalYear = current.forecastBaseYear
  const currentProjection = projectEastmoneyEstimatePoints({ acquisition: current, targetFiscalYear: projectionTargetFiscalYear })
  if (!current.providerOutcome.providerSucceeded || current.sources.length === 0 || currentProjection.estimates.length === 0) throw new Error(`real preflight did not produce a usable EPS estimate: ${JSON.stringify({ current, currentProjection })}`)
  const currentEndTime = shanghaiDate(now)
  if (calls[0]?.searchParams.get('endTime') !== currentEndTime) throw new Error(`current request did not use Shanghai endTime: ${calls[0]?.searchParams.get('endTime')}`)
  if (!current.records.every((item) => Date.parse(item.publishedAt) <= Date.parse(asOf))) throw new Error('current preflight included a report after asOf')
  const sourceIds = new Set(current.sources.map((item) => item.candidate.candidateId))
  for (const estimate of currentProjection.estimates) {
    if (!sourceIds.has(estimate.sourceCandidateIds[0] ?? '') || estimate.institutionKey === '' || estimate.unit !== 'CNY_per_share' || !Number.isFinite(estimate.value) || Date.parse(estimate.publishedAt) > Date.parse(asOf)) throw new Error(`real preflight estimate invariant failed: ${JSON.stringify(estimate)}`)
  }
  const historical = await client.acquire({ company, asOf: historicalAsOf, targetFiscalYear: current.forecastBaseYear })
  const historicalDatesValid = historical.records.every((item) => Date.parse(item.publishedAt) <= Date.parse(historicalAsOf))
  if (!historicalDatesValid) throw new Error('historical preflight included a report after asOf')
  const historicalEndTime = shanghaiDate(new Date(historicalAsOf))
  if (calls.at(-1)?.searchParams.get('endTime') !== historicalEndTime) throw new Error(`historical request did not use Shanghai endTime: ${calls.at(-1)?.searchParams.get('endTime')}`)
  console.log(JSON.stringify({
    symbol: company.symbol,
    asOf,
    provisionalTargetFiscalYear,
    projectionTargetFiscalYear,
    providerCurrentYear: current.forecastBaseYear,
    reportsReturned: current.records.length,
    usableNormalizedSources: current.sources.length,
    estimatePoints: currentProjection.estimates.length,
    distinctInstitutions: currentProjection.institutions.length,
    oldestPublication: current.records.map((item) => item.publishedAt).sort()[0],
    newestPublication: current.records.map((item) => item.publishedAt).sort().at(-1),
    diagnostics: currentProjection.diagnostics,
    historicalAsOf,
    historicalEndTime,
    historicalReports: historical.records.length,
    historicalEstimatePoints: projectEastmoneyEstimatePoints({ acquisition: historical, targetFiscalYear: historical.forecastBaseYear ?? current.forecastBaseYear }).estimates.length,
    historicalAllTimestampsAtOrBeforeAsOf: historicalDatesValid,
  }, null, 2))
}
