import { join } from 'node:path'
import { getAgentDir, ModelRuntime } from '@earendil-works/pi-coding-agent'
import { PiReasoningExecutor } from '../plugins/reasoning/pi/executor.ts'
import { selectProductionReasoningModel } from '../app/pi/model-selection.ts'
import { AkshareDataAdapter } from '../plugins/research-acquisition/akshare.ts'
import { CninfoOfficialDisclosureClient } from '../plugins/research-acquisition/official.ts'
import { createManagementCommunicationSources } from '../workflows/management-communication-acquisition/workflow.ts'
import { resolveManagementCommunication } from '../workflows/earnings-review/management-communication.ts'

const gate = process.env.RESEARCHHUB_RUN_REAL_D2_003
if (gate !== '1') {
  console.log(JSON.stringify({ status: 'GATE_DISABLED', requiredEnvironment: 'RESEARCHHUB_RUN_REAL_D2_003=1', rawContentIncluded: false, credentialsIncluded: false }, null, 2))
  process.exit(0)
}

const asOf = process.env.RESEARCHHUB_D2_AS_OF ?? new Date().toISOString()
const modelRuntime = await ModelRuntime.create({ authPath: join(getAgentDir(), 'auth.json'), modelsPath: join(getAgentDir(), 'models.json'), allowModelNetwork: true, refreshOnCreate: false })
const executor = new PiReasoningExecutor({ modelRuntime, model: selectProductionReasoningModel(modelRuntime) })
const cninfo = new CninfoOfficialDisclosureClient({ timeoutMs: 15_000 })
const akshare = new AkshareDataAdapter({ timeoutMs: 60_000 })
const result = await resolveManagementCommunication({ company: { symbol: '600519', name: '贵州茅台', exchange: 'SSE' }, analysisAsOf: asOf, fiscalYear: Number(process.env.RESEARCHHUB_D2_FISCAL_YEAR ?? 2026), period: (process.env.RESEARCHHUB_D2_PERIOD ?? 'FY') as 'Q1' | 'H1' | 'Q3' | 'FY', officialSources: [], reasoningExecutor: executor, sources: createManagementCommunicationSources(cninfo, akshare), lookbackDays: Number(process.env.RESEARCHHUB_D2_LOOKBACK_DAYS ?? 365) })
console.log(JSON.stringify({ status: result.status === 'available' || result.status === 'partial' ? 'D2_003_REAL_PATH_ATTEMPTED' : 'D2_003_REAL_PATH_UNAVAILABLE', asOf, model: executor.capabilities(), managementStatus: result.status, telemetry: result.telemetry, diagnostics: result.diagnostics.slice(0, 32), commentaryDeltaCount: result.commentaryDeltas.length, qaClusterCount: result.qaClusters.length, executionAssessmentCount: result.execution.assessments.length, rawContentIncluded: false, credentialsIncluded: false, noFabricatedLiveEvidence: true }, null, 2))
await modelRuntime.dispose()
