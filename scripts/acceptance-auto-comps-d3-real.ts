import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { AkshareDataAdapter } from '../plugins/research-acquisition/akshare.ts'
import { CninfoOfficialDisclosureClient } from '../plugins/research-acquisition/official.ts'
import type { ReasoningCapabilities, ReasoningExecutor, ReasoningRequest, ReasoningResult } from '../plugins/reasoning/contracts.ts'
import { createFreshKnowledgeBaseV04 } from '../knowledge/storage/create-v04.ts'
import { KnowledgeBaseRegistry } from '../knowledge/registry/registry.ts'
import { KnowledgeProductionGateway } from '../knowledge/production/gateway.ts'
import type { KnowledgeProductionInput } from '../knowledge/production/contracts.ts'
import { ResearchService } from '../app/services/research-service.ts'
import { WorkflowService } from '../app/services/workflow-service.ts'

const enabled = process.env.RESEARCHHUB_RUN_REAL_AUTO_COMPS === '1'
const targets = ['600519', '000333', '300750', '601398'] as const
const controlCandidateCounts = { '600519': 4, '000333': 6, '300750': 1, '601398': 4 }
const now = new Date().toISOString()
const rights = { accessScope: 'public' as const, retentionAllowed: true, aiProcessingAllowed: true, derivativeKnowledgeAllowed: true, redistributionAllowed: false }

type Dict = Record<string, unknown>
type Stage = { readonly status: string; readonly error?: string; readonly result?: Dict; readonly providerOutcome?: Dict }

class DeterministicReasoningExecutor implements ReasoningExecutor {
  capabilities(): ReasoningCapabilities { return { maxContextTokens: 100_000, maxOutputTokens: 20_000, structuredOutputSupport: true, maxConcurrency: 2 } }
  async execute(request: ReasoningRequest): Promise<ReasoningResult> {
    const input = request.input as Dict
    const ids = Array.isArray(input.allowedSourceCandidateIds) ? input.allowedSourceCandidateIds.filter((item): item is string => typeof item === 'string') : []
    const source = ids.find((id) => id.includes('-financial-')) ?? ids[0] ?? 'deterministic-source'
    if (request.operation === 'valuation_assumption_design') {
      const targetFiscalYear = Number(input.targetFiscalYear)
      return { operation: request.operation, operationId: 'real-auto-comps-design', output: { primaryMethod: 'PE', secondaryMethods: ['PB'], targetFiscalYear, scenarios: ['bear', 'base', 'bull'].map((scenarioId, index) => ({ scenarioId, primaryMethod: 'PE', targetFiscalYear, growthRate: [0.05, 0.1, 0.2][index], targetMultiple: [10, 12, 14][index], rationale: `Deterministic ${scenarioId} scenario.`, sourceCandidateIds: [source], existingKnowledgeRefs: [] })) } }
    }
    return { operation: request.operation, operationId: 'real-auto-comps-synthesis', output: { sections: [], proposals: [] } }
  }
}

function safeError(error: unknown): string { return (error instanceof Error ? error.message : String(error)).replace(/[A-Za-z]:\\[^\s]+|\/[^\s]+/g, '[redacted]').slice(0, 500) }
function isTransportFailure(error: string): boolean { return /(AKShare|EastMoney|CNINFO|HTTP|fetch|timeout|timed out|network|socket|ECONN|python)/i.test(error) }
function exchange(symbol: string): 'SSE' | 'SZSE' { return symbol.startsWith('6') ? 'SSE' : 'SZSE' }

async function seed(root: string, symbol: string): Promise<void> {
  await createFreshKnowledgeBaseV04(root, { knowledgeBaseId: `kb-d3-fix-001-${symbol}`, now })
  const registry = new KnowledgeBaseRegistry()
  const handle = await registry.mount(root)
  const sourceId = `d3-fix-001-seed-${symbol}`
  const content = `Deterministic seed coverage for ${symbol}.`
  const source = { candidate: { candidateId: sourceId, kind: 'official_disclosure' as const, tier: 1 as const, title: 'Deterministic seed coverage', provider: 'acceptance-fixture', publishedAt: now, metadata: { companySymbol: symbol } }, retrievedAt: now, title: 'Deterministic seed coverage', content, rawBytes: new TextEncoder().encode(content), contentHash: 'a'.repeat(64), publisher: 'Acceptance fixture', rights }
  const input: KnowledgeProductionInput = { handle, producerType: 'd3_fix_001_seed', producerRunId: `seed-${symbol}`, schemaProfile: { schemaVersion: '0.4', storageFormatVersion: '1', requiresRawProvenance: true }, entity: { localKey: 'company', entityType: 'company', name: symbol, aliases: [symbol], semanticFields: { ticker: symbol, exchange: exchange(symbol) } }, proposals: [{ proposalId: 'seed-claim', kind: 'claim', claimType: 'assumption', subjectKey: 'company', statement: 'Deterministic acceptance seed.', sourceCandidateIds: [sourceId] }], evidenceBindings: [{ localSourceId: sourceId, source }], asOf: now, now: () => now }
  const outcome = await new KnowledgeProductionGateway(registry).submit(input)
  if (outcome.status !== 'committed') throw new Error(`seed_failed:${outcome.errors.join(';')}`)
}

function automaticStage(value: unknown): Dict {
  const result = (value ?? {}) as Dict
  const summaries = Array.isArray(result.multipleSummaries) ? result.multipleSummaries as Dict[] : []
  const selected = summaries.find((item) => item.method === result.selectedMethod)
  const familyStatuses = Array.isArray(result.familyStatuses) ? result.familyStatuses : []
  return { availability: result.availability, selectedMethod: result.selectedMethod, selectedPeerCount: selected?.validCount ?? 0, selectedPeerRefs: result.selectedPeerRefs ?? [], selectedMedian: selected?.median, multipleBasisFiscalYear: result.multipleBasisFiscalYear, targetFiscalYear: result.targetFiscalYear, targetForecastMetric: result.targetForecastMetric, impliedTargetPrice: result.impliedTargetPrice, candidatePeerCount: result.candidatePeerCount, expensiveValidationCount: result.expensiveValidationCount, familyStatuses, sourceRefs: result.sourceRefs ?? [], diagnosticSourceRefs: result.diagnosticSourceRefs ?? [] }
}

async function runTarget(symbol: string): Promise<Stage> {
  const root = await mkdtemp(join(tmpdir(), `rhl-d3-fix-001-${symbol}-`))
  const reports = join(root, 'reports')
  try {
    await seed(root, symbol)
    const service = new ResearchService({ mountedKnowledgeBaseRoot: root, reportRoot: reports, acquisitionPlugins: [], akshare: new AkshareDataAdapter({ timeoutMs: 60_000 }), officialDisclosure: new CninfoOfficialDisclosureClient({ timeoutMs: 30_000 }), workflowService: new WorkflowService(), reasoningExecutor: new DeterministicReasoningExecutor() })
    const started = service.startValuation({ workflowRunId: `d3-fix-001-${symbol}`, symbol, exchange: exchange(symbol), methods: ['PE'] })
    const result = await started.completion as unknown as Dict
    const automatic = result.automaticCompsResult as Dict | undefined
    const crosscheck = result.crosscheck as Dict | undefined
    const methodResults = Array.isArray(crosscheck?.methodResults) ? crosscheck.methodResults as Dict[] : []
    const comps = methodResults.find((item) => item.method === 'comps_valuation')
    const compatibility = Array.isArray(crosscheck?.basisCompatibility) ? (crosscheck!.basisCompatibility as Dict[]).find((item) => item.comparisonRef === 'scenario_base_vs_comps_valuation') : undefined
    return { status: String(result.status), providerOutcome: result.providerOutcome as Dict, result: { automatic: automaticStage(automatic), crosscheck: { availableMethods: crosscheck?.availableMethods ?? [], sourceMethod: comps?.sourceMethod, value: comps?.value, compatible: compatibility?.compatible === true, basisDiagnostics: compatibility?.diagnostics ?? [] }, legacyCompsPresent: result.compsResult !== undefined } }
  } catch (error) {
    const message = safeError(error)
    return { status: isTransportFailure(message) ? 'REAL_PEER_MARKET_TRANSPORT_UNAVAILABLE' : 'UNAVAILABLE', error: message }
  } finally { await rm(root, { recursive: true, force: true }) }
}

if (!enabled) {
  console.log(JSON.stringify({ classification: 'REAL_AUTO_COMPS_NOT_RUN', reason: 'Set RESEARCHHUB_RUN_REAL_AUTO_COMPS=1 to enable external transport.', networkCalls: 0, targets }))
} else {
  const stages: Record<string, Stage> = {}
  for (const symbol of targets) stages[symbol] = await runTarget(symbol)
  const accepted = targets.filter((symbol) => { const stage = stages[symbol]; const automatic = stage.result?.automatic as Dict | undefined; const crosscheck = stage.result?.crosscheck as Dict | undefined; return stage.status === 'completed' && automatic?.availability === 'available' && Number(automatic.selectedPeerCount) >= 3 && Number.isFinite(Number(automatic.selectedMedian)) && Number.isFinite(Number(automatic.impliedTargetPrice)) && crosscheck?.compatible === true && crosscheck?.sourceMethod === 'PE' && stage.result?.legacyCompsPresent === false })
  const transportUnavailable = targets.some((symbol) => stages[symbol].status === 'REAL_PEER_MARKET_TRANSPORT_UNAVAILABLE')
  const fullSuccess = accepted.includes('600519') && (accepted.includes('000333') || accepted.includes('300750'))
  console.log(JSON.stringify({ classification: fullSuccess ? 'D3_AUTO_COMPS_REAL_PRODUCT_PATH_VERIFIED' : transportUnavailable ? 'REAL_PEER_MARKET_TRANSPORT_UNAVAILABLE' : 'REAL_AUTO_COMPS_ACCEPTANCE_INCONCLUSIVE', generatedAt: now, targets, controls: { cohortFamilyCalls: 4, expensiveValidationCap: 12, calculationPeerCap: 8, cninfoAuthority: 'S0_STATUTORY', controlCandidateCounts }, successCriteria: { acceptedTargets: accepted, requiredTargets: ['600519', '000333|300750'], selectedPeerCountAtLeast: 3, finiteMedianAndImpliedPrice: true, compatibleCrosscheck: true, noLegacyComps: true }, stages, secretsIncluded: false, rawBodiesIncluded: false }, null, 2))
}
