import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { AkshareDataAdapter } from '../plugins/research-acquisition/akshare.ts'
import { CninfoOfficialDisclosureClient } from '../plugins/research-acquisition/official.ts'
import { createManagementCommunicationSourceOperations } from '../plugins/research-acquisition/management-communication.ts'
import { mapDocumentType, runExchangeQa, runManagementCommunicationDocuments, type ManagementCommunicationAcquisitionSources } from '../workflows/management-communication-acquisition/index.ts'

const execFileAsync = promisify(execFile)
const gate = process.env.RESEARCHHUB_RUN_REAL_MANAGEMENT_COMMUNICATION
if (gate !== '1') {
  console.log(JSON.stringify({ status: 'GATE_DISABLED', requiredEnvironment: 'RESEARCHHUB_RUN_REAL_MANAGEMENT_COMMUNICATION=1' }, null, 2))
  process.exit(0)
}

const asOf = process.env.RESEARCHHUB_D2_AS_OF ?? new Date().toISOString()
const asOfDate = new Date(asOf)
const lookbackStartDate = new Date(asOfDate.getTime() - 7 * 86_400_000).toISOString().slice(0, 10)
const cninfo = new CninfoOfficialDisclosureClient({ pageSize: 20, timeoutMs: 15_000 })
const akshare = new AkshareDataAdapter({ timeoutMs: 60_000 })
const real = createManagementCommunicationSourceOperations(cninfo, akshare)
const captures: { cninfo?: unknown; szse?: unknown; sse?: unknown; eastmoney?: unknown } = {}
const errors: Record<string, string> = {}

const company = (ticker: string, exchange: 'SSE' | 'SZSE', name: string) => ({ company: { symbol: ticker, exchange, name }, asOf, lookbackStartDate })
const sources: ManagementCommunicationAcquisitionSources = {
  cninfoIr: async (request) => {
    if (captures.cninfo === undefined) captures.cninfo = await real.cninfoIr(request)
    return Array.isArray(captures.cninfo) ? captures.cninfo as never : []
  },
  exchangeQaSzse: async (request) => {
    if (captures.szse === undefined) captures.szse = await real.exchangeQaSzse(request)
    return captures.szse
  },
  exchangeQaSse: async (request) => {
    if (captures.sse === undefined) captures.sse = await real.exchangeQaSse(request)
    return captures.sse
  },
  exchangeQaSzseAnswer: real.exchangeQaSzseAnswer,
}

async function probe(name: string, operation: () => Promise<unknown>): Promise<{ readonly name: string; readonly attempted: true; readonly ok: boolean; readonly rowCount?: number; readonly fields?: readonly string[]; readonly error?: string }> {
  try {
    const value = await operation()
    const rows = Array.isArray(value) ? value : []
    return { name, attempted: true, ok: true, rowCount: rows.length, fields: rows[0] !== undefined && typeof rows[0] === 'object' && rows[0] !== null ? Object.keys(rows[0]) : [] }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    errors[name] = message
    return { name, attempted: true, ok: false, error: message.slice(0, 240) }
  }
}

const probes = [
  await probe('CNINFO_IR_LIVE', async () => { if (captures.cninfo === undefined) captures.cninfo = await real.cninfoIr(company('600519', 'SSE', '贵州茅台')); return captures.cninfo }),
  await probe('SZSE_QA_LIVE', async () => { if (captures.szse === undefined) captures.szse = await real.exchangeQaSzse(company('000001', 'SZSE', '平安银行')); return captures.szse }),
  await probe('SSE_QA_LIVE', async () => { if (captures.sse === undefined) captures.sse = await real.exchangeQaSse(company('600519', 'SSE', '贵州茅台')); return captures.sse }),
  await probe('EASTMONEY_METADATA_LIVE', async () => { if (captures.eastmoney === undefined) captures.eastmoney = await real.eastmoneyInstitutionalResearch(company('600519', 'SSE', '贵州茅台')); return captures.eastmoney }),
]

const workflowRuns = []
try {
  workflowRuns.push({ name: 'CNINFO_IR_WORKFLOW', result: await runManagementCommunicationDocuments({ request: { ticker: '600519', companyName: '贵州茅台', exchange: 'SSE', asOf, lookbackDays: 7 }, sources }) })
} catch (error) {
  errors.CNINFO_IR_WORKFLOW = error instanceof Error ? error.message : String(error)
}
try {
  workflowRuns.push({ name: 'SZSE_QA_WORKFLOW', result: await runExchangeQa({ request: { ticker: '000001', companyName: '平安银行', exchange: 'SZSE', asOf, lookbackDays: 7 }, sources }) })
} catch (error) {
  errors.SZSE_QA_WORKFLOW = error instanceof Error ? error.message : String(error)
}
try {
  workflowRuns.push({ name: 'SSE_QA_WORKFLOW', result: await runExchangeQa({ request: { ticker: '600519', companyName: '贵州茅台', exchange: 'SSE', asOf, lookbackDays: 7 }, sources }) })
} catch (error) {
  errors.SSE_QA_WORKFLOW = error instanceof Error ? error.message : String(error)
}
let pythonRuntime = 'unavailable'
let akshareVersion = 'unavailable'
try {
  const version = await execFileAsync('python', ['-c', "import sys,akshare; print(sys.version.split()[0]); print(getattr(akshare, '__version__', 'unknown'))"], { timeout: 10_000 })
  const lines = version.stdout.trim().split(/\r?\n/)
  pythonRuntime = lines[0] ?? pythonRuntime
  akshareVersion = lines[1] ?? akshareVersion
} catch (error) {
  errors.runtime = error instanceof Error ? error.message : String(error)
}

const summarizeWorkflow = (item: typeof workflowRuns[number]) => ({ name: item.name, status: item.result.status, normalizedRowCount: item.result.data.length, attemptPath: item.result.acquisition.attempts.map((attempt) => ({ sourceId: attempt.sourceId, fallbackLevel: attempt.fallbackLevel, status: attempt.status })), diagnostics: item.result.diagnostics.slice(0, 20), documentTypes: item.result.data.flatMap((value) => 'documentType' in value ? [mapDocumentType(value.title ?? '') ?? value.documentType] : []), publicationDates: item.result.data.map((value) => value.publishedAt).sort() })
const successfulProbeCount = probes.filter((probe) => probe.ok).length
const workflowAttempted = workflowRuns.length === 3
const output = {
  status: Object.keys(errors).length === 0 && successfulProbeCount === probes.length && workflowAttempted ? 'D2_ACQUISITION_PATH_VERIFIED' : 'LIVE_PROVIDER_LIMITATION_RECORDED',
  labels: probes.filter((probe) => probe.ok && probe.name !== 'EASTMONEY_METADATA_LIVE').map((probe) => probe.name === 'CNINFO_IR_LIVE' ? 'CNINFO_IR_LIVE_VERIFIED' : probe.name === 'SZSE_QA_LIVE' ? 'SZSE_QA_LIVE_VERIFIED' : 'SSE_QA_LIVE_VERIFIED'),
  runtime: { node: process.version, python: pythonRuntime, akshare: akshareVersion },
  asOf,
  lookbackStartDate,
  probes,
  workflows: workflowRuns.map(summarizeWorkflow),
  errors,
  privacy: { rawContentIncluded: false, credentialsIncluded: false, privateDataIncluded: false },
  noFabricatedLiveEvidence: true,
}
console.log(JSON.stringify(output, null, 2))
