import { AkshareDataAdapter } from '../plugins/research-acquisition/akshare.ts'
import { resolveEarningsExpectations } from '../workflows/earnings-review/automatic-expectations.ts'
import type { EarningsReviewWorkflowInput } from '../workflows/earnings-review/contracts.ts'

const enabled = process.env.RESEARCHHUB_RUN_REAL_EXPECTATIONS === '1'
if (!enabled) {
  console.log(JSON.stringify({ status: 'SKIPPED', reason: 'set RESEARCHHUB_RUN_REAL_EXPECTATIONS=1 to enable live AKShare validation' }))
  process.exit(0)
}

const asOf = new Date().toISOString()
const company = { symbol: '600519', name: '贵州茅台', exchange: 'SSE' as const }
const workflow = { fiscalYear: 2026, akshare: new AkshareDataAdapter(), now: () => new Date().toISOString() } as unknown as EarningsReviewWorkflowInput
const resolved = await resolveEarningsExpectations({ workflow, company, analysisAsOf: asOf, resultPublishedAt: asOf })
const thsOutcome = resolved.providerOutcomes?.find((outcome) => outcome.provider === 'ths-institution-forecast')
const productPathVerified = resolved.mode === 'automatic' && thsOutcome?.providerSucceeded === true && resolved.estimateCount > 0
console.log(JSON.stringify({
  status: productPathVerified ? 'EXPECTATIONS_PRODUCT_PATH_VERIFIED' : 'ACQUISITION_ONLY_VERIFIED',
  acquisitionStatus: resolved.acquisitionStatus,
  normalResolverPath: true,
  automaticSourceInjectedManually: false,
  asOf,
  company: company.symbol,
  providerOutcomes: resolved.providerOutcomes ?? [],
  estimateCount: resolved.estimateCount,
  institutionCount: resolved.institutionCount,
  consensusSnapshotCount: resolved.consensusSnapshotCount,
  diagnostics: resolved.diagnostics.slice(0, 24),
}, null, 2))
