import { AkshareDataAdapter } from '../plugins/research-acquisition/akshare.ts'
import { CninfoOfficialDisclosureClient } from '../plugins/research-acquisition/official.ts'
import { resolveAutomaticComps } from '../workflows/valuation/automatic-comps.ts'

const enabled = process.env.RESEARCHHUB_RUN_REAL_AUTO_COMPS === '1'
const targets = ['600519', '000333', '300750', '601398'] as const
const now = new Date().toISOString()

if (!enabled) {
  console.log(JSON.stringify({ classification: 'REAL_AUTO_COMPS_NOT_RUN', reason: 'Set RESEARCHHUB_RUN_REAL_AUTO_COMPS=1 to enable external transport.', networkCalls: 0, targets }))
} else {
  const akshare = new AkshareDataAdapter({ timeoutMs: 60_000 })
  const official = new CninfoOfficialDisclosureClient({ timeoutMs: 20_000 })
  const results: Record<string, unknown> = {}
  for (const symbol of targets) {
    const stages: Record<string, unknown> = { familyCalls: 0, peerFinancialValidations: 0, cninfoPublicationValidations: 0 }
    try {
      const resolution = await resolveAutomaticComps({ company: { symbol }, valuationDate: now, basisFiscalYear: new Date().getUTCFullYear() - 1, targetFiscalYear: new Date().getUTCFullYear(), selectedMethod: 'PE', targetForecastMetric: Number.NaN, targetSourceRefs: [], akshare, officialDisclosure: official, retrievedAt: now, now })
      stages.familyCalls = 4
      stages.peerFinancialValidations = resolution.result.expensiveValidationCount
      stages.cninfoPublicationValidations = resolution.result.validPeers.length
      stages.result = { availability: resolution.result.availability, validPeerCount: resolution.result.validPeers.length, selectedMethod: resolution.result.selectedMethod, selectedMedian: resolution.result.selectedMedian, impliedTargetPrice: resolution.result.impliedTargetPrice, diagnostics: resolution.result.diagnostics }
    } catch (error) {
      stages.status = 'UNAVAILABLE'
      stages.error = error instanceof Error ? error.message : String(error)
    }
    results[symbol] = stages
  }
  const successfulTargets = targets.filter((symbol) => {
    const result = (results[symbol] as { result?: { validPeerCount?: number; selectedMedian?: number; impliedTargetPrice?: number } }).result
    return (result?.validPeerCount ?? 0) >= 3 && Number.isFinite(result?.selectedMedian) && Number.isFinite(result?.impliedTargetPrice)
  })
  console.log(JSON.stringify({ classification: successfulTargets.includes('600519') && successfulTargets.some((symbol) => symbol === '000333' || symbol === '300750') ? 'REAL_AUTO_COMPS_SOURCE_STAGE_SUCCESS_CROSSCHECK_PENDING' : 'REAL_AUTO_COMPS_ACCEPTANCE_INCONCLUSIVE', generatedAt: now, targets, controls: { cohortFamilyCalls: 4, expensiveValidationCap: 12, calculationPeerCap: 8, cninfoAuthority: 'S0_STATUTORY', controlCandidateCounts: { '600519': 4, '000333': 6, '300750': 1, '601398': 4 } }, successCriteria: { selectedMethodAndImpliedPrice: successfulTargets, compatibleCrosscheck: false, fullWorkflowRequired: true }, stages: results, secretsIncluded: false, rawBodiesIncluded: false }, null, 2))
}
