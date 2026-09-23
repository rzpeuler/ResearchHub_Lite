import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { createFreshKnowledgeBaseV04 } from '../knowledge/storage/create-v04.ts'
import { IndustryOperatingObservationAcquisition, type IndustryOperatingObservation, type IndustryOperatingObservationAcquisitionPort } from '../plugins/research-acquisition/industry-operating-observations.ts'
import type { ReasoningCapabilities, ReasoningExecutor, ReasoningRequest, ReasoningResult } from '../plugins/reasoning/contracts.ts'
import { ResearchService } from '../app/services/research-service.ts'
import { WorkflowService } from '../app/services/workflow-service.ts'

const enabled = process.env.RESEARCHHUB_RUN_REAL_INDUSTRY_OBSERVATIONS === '1'
const now = '2026-09-23T00:00:00.000Z'
type Dict = Record<string, unknown>

class DeterministicIndustryReasoningExecutor implements ReasoningExecutor {
  capabilities(): ReasoningCapabilities { return { maxContextTokens: 100_000, maxOutputTokens: 20_000, structuredOutputSupport: true, maxConcurrency: 2 } }
  async execute(request: ReasoningRequest): Promise<ReasoningResult> {
    const input = request.input as Dict
    if (request.operation === 'industry_research_design') {
      const target = String((input.target as Dict | undefined)?.name ?? '')
      return { operation: request.operation, output: { definitionHypothesis: target, targetKind: 'industry', scope: { included: [target], excluded: [] }, moduleQuestions: { industry_definition: 'Define the industry.', market_size_growth: 'Measure market size and growth.', supply_demand_analysis: 'Assess supply, demand, and operating metrics.', industry_chain_analysis: 'Map the chain.', competitive_landscape: 'Assess competition.', technology_evolution: 'Assess technology.', company_mapping: 'Map companies.', risk_analysis: 'Assess risks.' }, keyMetrics: ['production', 'trade', 'price'], evidenceRequirements: ['official operating evidence'], searchTerms: [target], knownGaps: [], verificationCandidates: [] } }
    }
    const evidence = Array.isArray(input.evidence) ? input.evidence.filter((item): item is Dict => typeof item === 'object' && item !== null).map((item) => String(item.evidenceId)).filter(Boolean) : []
    if (request.operation === 'industry_module_analysis') {
      return { operation: request.operation, output: { module: String(input.module), status: evidence.length ? 'supported' : 'partial', analysis: 'Deterministic real-source acceptance reasoning; numeric truth remains code-owned.', evidenceIds: evidence, proposals: [], gaps: evidence.length ? [] : [{ gapId: `${String(input.module)}-missing-evidence`, module: String(input.module), question: 'What source evidence is available?', reason: 'No qualified source was available.', actionable: false }], reportMaterial: { markdown: evidence.length ? 'Qualified source evidence was supplied.' : 'No qualified source evidence was available.', evidenceIds: evidence, proposalIds: [] } } }
    }
    return { operation: request.operation, output: { executiveView: 'Deterministic product-path acceptance view.', analysis: 'Operating observations were supplied by the D4 acquisition seam.', evidenceIds: evidence, proposals: [], gaps: [], alternativeViews: [], reportMaterial: { markdown: 'D4 real product-path acceptance synthesis.', evidenceIds: evidence, proposalIds: [] } } }
  }
}

function observationSummary(items: readonly IndustryOperatingObservation[]): Dict {
  return { count: items.length, items: items.map((item) => ({ observationId: item.observationId, metricKey: item.metricKey, class: item.observationClass, value: item.value, qualifier: item.qualifier, unit: item.unit, period: [item.periodStart, item.periodEnd], aggregation: item.aggregation, product: item.productOrSegment, geography: item.geography, publisher: item.originPublisher, hostPlatform: item.hostPlatform, retrievalProvider: item.retrievalProvider, authority: item.sourceAuthority, determinismClass: item.determinismClass, sourceCandidateId: item.sourceCandidateId, sourceRef: item.sourceRef, publicationPit: item.publicationPit, valueVersionPit: item.valueVersionPit, upstreamDataSource: item.metadata.upstreamDataSource ?? null })) }
}

function errorText(error: unknown): string { return (error instanceof Error ? error.message : String(error)).slice(0, 500) }
function stageFrom(result: Dict): Dict {
  const observations = Array.isArray(result.operatingObservations) ? result.operatingObservations as IndustryOperatingObservation[] : []
  return { status: result.status, operatingObservationStatus: result.operatingObservationStatus, operatingObservationDiagnostics: result.operatingObservationDiagnostics ?? [], observations: observationSummary(observations), reportId: result.reportId ?? null }
}
function hasObservation(items: readonly IndustryOperatingObservation[], predicate: (item: IndustryOperatingObservation) => boolean): boolean { return items.some(predicate) }

async function runTarget(root: string, reports: string, name: string, acquisition: IndustryOperatingObservationAcquisitionPort): Promise<Dict> {
  const service = new ResearchService({ mountedKnowledgeBaseRoot: root, reportRoot: reports, acquisitionPlugins: [], workflowService: new WorkflowService(), reasoningExecutor: new DeterministicIndustryReasoningExecutor(), industryOperatingObservationAcquisition: acquisition })
  try {
    const result = await service.startIndustryResearch({ workflowRunId: `d4-real-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`, name, asOf: now }).completion as unknown as Dict
    const stage = stageFrom(result); const observations = Array.isArray(result.operatingObservations) ? result.operatingObservations as IndustryOperatingObservation[] : []
    stage.acceptance = name.includes('Lithium')
      ? { production: hasObservation(observations, (item) => item.metricKey === 'lithium_battery.total_output' && item.observationClass === 'PRODUCTION' && item.qualifier === 'LOWER_BOUND'), price: hasObservation(observations, (item) => item.metricKey === 'lithium_battery.lithium_carbonate_average_price' && item.observationClass === 'PRICE') }
      : { production: hasObservation(observations, (item) => item.metricKey === 'room_air_conditioner.production' && item.originPublisher === 'National Bureau of Statistics'), trade: hasObservation(observations, (item) => item.metricKey === 'air_conditioner.export_volume' && item.productOrSegment === '家用空调器' && item.originPublisher === 'CHEAA' && item.sourceAuthority === 'S2_PROFESSIONAL' && item.metadata.upstreamDataSource === 'GACC') }
    return stage
  } catch (error) { return { status: 'UNAVAILABLE', error: errorText(error) } }
}

async function main(): Promise<void> {
  if (!enabled) { console.log(JSON.stringify({ classification: 'REAL_D4_OPERATING_OBSERVATIONS_NOT_RUN', reason: 'Set RESEARCHHUB_RUN_REAL_INDUSTRY_OBSERVATIONS=1 to enable external transport.', networkCalls: 0 })); return }
  const root = await mkdtemp(join(tmpdir(), 'rhl-d4-real-')); const reports = join(root, 'reports'); const calls: string[] = []
  try {
    await createFreshKnowledgeBaseV04(root, { knowledgeBaseId: 'kb-d4-real-acceptance', now })
    const fetchImpl: typeof fetch = async (input, init) => { calls.push(String(input)); return fetch(input, init) }
    const acquisition = new IndustryOperatingObservationAcquisition({ fetchImpl, now: () => now, timeoutMs: 30_000 })
    const lithium = await runTarget(root, reports, 'Lithium battery industry', acquisition)
    const airConditioner = await runTarget(root, reports, 'Household air conditioner industry', acquisition)
    const lithiumAcceptance = lithium.acceptance as Dict | undefined; const airAcceptance = airConditioner.acceptance as Dict | undefined
    const lithiumMiitGate = (lithium.operatingObservationDiagnostics as string[] | undefined)?.some((item) => item.includes('HTTP_403_ACCESS_GATE')) === true
    const bothPassed = lithium.status === 'completed' && airConditioner.status === 'completed' && lithiumAcceptance?.production === true && lithiumAcceptance?.price === true && airAcceptance?.production === true && airAcceptance?.trade === true
    const classification = bothPassed ? 'D4_INDUSTRY_OPERATING_REAL_PRODUCT_PATH_VERIFIED' : lithiumMiitGate ? 'REAL_MIIT_HTTP_403_ACCESS_GATE' : calls.length === 0 ? 'REAL_D4_OPERATING_TRANSPORT_UNAVAILABLE' : 'REAL_D4_INDUSTRY_OPERATING_PARTIAL'
    console.log(JSON.stringify({ classification, generatedAt: now, networkCalls: calls.length, targets: { lithium, airConditioner }, successCriteria: { lithium: ['PRODUCTION', 'PRICE'], householdAirConditioner: ['NBS PRODUCTION', 'CHEAA TRADE'] }, secretsIncluded: false, rawBodiesIncluded: false }, null, 2))
  } finally { await rm(root, { recursive: true, force: true }) }
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main()
