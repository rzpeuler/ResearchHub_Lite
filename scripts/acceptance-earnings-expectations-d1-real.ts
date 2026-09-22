import { AkshareDataAdapter } from '../plugins/research-acquisition/akshare.ts'
import { assembleAutomaticEarningsExpectations } from '../workflows/earnings-review/automatic-expectations.ts'
import { AkshareEarningsExpectationsSource } from '../workflows/earnings-review/expectations-acquisition.ts'

const enabled = process.env.RESEARCHHUB_RUN_REAL_EXPECTATIONS === '1'
if (!enabled) {
  console.log(JSON.stringify({ status: 'SKIPPED', reason: 'set RESEARCHHUB_RUN_REAL_EXPECTATIONS=1 to enable live AKShare validation' }))
  process.exit(0)
}

const asOf = new Date().toISOString()
const company = { symbol: '600519', name: '贵州茅台', exchange: 'SSE' as const }
const source = new AkshareEarningsExpectationsSource({ akshare: new AkshareDataAdapter(), now: () => new Date().toISOString() })
const acquisition = await source.acquire({ company, asOf, targetFiscalYear: 2026 })
const assembly = assembleAutomaticEarningsExpectations({ projection: acquisition.projection, targetFiscalYear: 2026, analysisAsOf: asOf, resultPublishedAt: asOf })
console.log(JSON.stringify({
  status: acquisition.status.toUpperCase(),
  asOf,
  company: company.symbol,
  providerOutcomes: acquisition.providerOutcomes,
  attempts: acquisition.attempts.map((attempt) => ({ sourceId: attempt.sourceId, fallbackLevel: attempt.fallbackLevel, status: attempt.status, diagnostic: attempt.diagnostic })),
  estimateCount: acquisition.projection.estimates.length,
  epsEstimateCount: acquisition.projection.estimates.filter((estimate) => estimate.metric === 'eps').length,
  netProfitEstimateCount: acquisition.projection.estimates.filter((estimate) => estimate.metric === 'net_profit').length,
  institutionCount: new Set(acquisition.projection.estimates.map((estimate) => estimate.institutionKey)).size,
  assembly: { estimateCount: assembly.estimateCount, institutionCount: assembly.institutionCount, consensusSnapshotCount: assembly.consensusSnapshotCount, diagnostics: assembly.diagnostics.slice(0, 24) },
  diagnostics: acquisition.diagnostics.slice(0, 24),
}, null, 2))
