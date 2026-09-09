import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { CninfoOfficialDisclosureClient, OfficialDisclosureResearchPlugin } from '../../plugins/research-acquisition/official.ts'
import { GdeltResearchPlugin } from '../../plugins/research-acquisition/gdelt.ts'
import type { ResearchAcquisitionPlugin } from '../../plugins/research-acquisition/contracts.ts'

const repoRoot = resolve(import.meta.dirname, '../..')
const evidenceRoot = resolve(repoRoot, 'tests/validation/evidence')
const evidencePath = resolve(evidenceRoot, 'RHL_M3A_EVENT_RESEARCH_V1_PROVIDER_SMOKE.json')
const company = { symbol: '600519', name: '贵州茅台', exchange: 'SSE' }
const asOf = '2026-09-08T23:59:59.000Z'
const timeoutMs = 20_000

const fetchWithTimeout: typeof fetch = async (input, init) => {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try { return await fetch(input, { ...init, signal: controller.signal }) } finally { clearTimeout(timer) }
}

function safeError(error: unknown): string {
  const value = error instanceof Error ? error.message : String(error)
  return value.replace(/Bearer\s+[^\s]+/gi, 'Bearer [redacted]').replace(/(api[_-]?key|token|secret|password)=([^&\s]+)/gi, '$1=[redacted]').slice(0, 500)
}

async function probe(provider: string, plugin: ResearchAcquisitionPlugin) {
  const outcome: { provider: string; attempted: boolean; transportSucceeded: boolean; fetchAttempted: boolean; fetchSucceeded: boolean; normalizeSucceeded: boolean; candidateCount: number; usableCandidateCount: number; classification: string; error?: string } = { provider, attempted: true, transportSucceeded: false, fetchAttempted: false, fetchSucceeded: false, normalizeSucceeded: false, candidateCount: 0, usableCandidateCount: 0, classification: 'NOT_EXECUTED / BLOCKED' }
  try {
    const candidates = await plugin.discover({ company, asOf, limitPerKind: 6 })
    outcome.transportSucceeded = true
    outcome.candidateCount = candidates.length
    const first = candidates[0]
    if (first === undefined) { outcome.classification = 'TRANSPORT_SUCCEEDED / EMPTY'; return outcome }
    outcome.fetchAttempted = true
    try {
      const fetched = await plugin.fetch(first)
      outcome.fetchSucceeded = true
      const normalized = await plugin.normalize(fetched)
      outcome.normalizeSucceeded = true
      outcome.usableCandidateCount = normalized.content.trim() === '' ? 0 : 1
      outcome.classification = outcome.usableCandidateCount > 0 ? 'USABLE_EVIDENCE_OBSERVED' : 'TRANSPORT_SUCCEEDED / EMPTY'
    } catch (error) {
      outcome.classification = 'DISCOVERY_SUCCEEDED / FETCH_BLOCKED'
      outcome.error = safeError(error)
    }
  } catch (error) {
    outcome.classification = 'PROVIDER_TRANSPORT_BLOCKED'
    outcome.error = safeError(error)
  }
  return outcome
}

const startedAt = new Date().toISOString()
const providers: readonly [string, ResearchAcquisitionPlugin][] = [
  ['CNINFO', new OfficialDisclosureResearchPlugin(new CninfoOfficialDisclosureClient({ fetchImpl: fetchWithTimeout }))],
  ['GDELT', new GdeltResearchPlugin({ fetchImpl: fetchWithTimeout })],
]
const results = []
for (const [name, plugin] of providers) results.push(await probe(name, plugin))
const evidence = { generatedAt: new Date().toISOString(), startedAt, taskId: 'RHL-PERSONAL-RESEARCH-V1-M3A-EVENT-RESEARCH-001', classification: 'NON_BLOCKING_PROVIDER_SMOKE', company, asOf, bounds: { providers: ['CNINFO Official', 'GDELT'], limitPerProvider: 6, globalNormalizedSourceCap: 12, eventWindowDaysMaximum: 30 }, providers: results, nonBlocking: true, secretsIncluded: false, rawBodiesIncluded: false }
await mkdir(evidenceRoot, { recursive: true })
await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8')
console.log(JSON.stringify(evidence, null, 2))
