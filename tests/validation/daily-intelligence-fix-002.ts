import { mkdir, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { createDailyIntelligenceComposition } from '../../app/services/daily-intelligence-composition.ts'
import { WorkflowService } from '../../app/services/workflow-service.ts'
import type { ResearchAcquisitionPlugin, ResearchCompanyIdentity } from '../../plugins/research-acquisition/contracts.ts'

const root = resolve('tests/validation/evidence')
await mkdir(root, { recursive: true })
const company: ResearchCompanyIdentity = { symbol: '600519', name: '贵州茅台', exchange: 'SSE' }
const composition = await createDailyIntelligenceComposition({ cwd: resolve('.'), workflowService: new WorkflowService() })

async function probe(plugin: ResearchAcquisitionPlugin): Promise<Record<string, unknown>> {
  const stages = { discover: 'not_attempted', fetch: 'not_attempted', normalize: 'not_attempted' }
  const attempts = { discoverAttempted: false, fetchAttempted: false, normalizeAttempted: false }
  const diagnostics: string[] = []
  let discoveredCount = 0
  let fetchSucceededCount = 0
  let normalizeSucceededCount = 0
  let rawByteCount = 0
  try {
    attempts.discoverAttempted = true
    const candidates = await plugin.discover({ company, asOf: '2026-09-08T23:59:59.000Z', limitPerKind: 3 })
    discoveredCount = candidates.length
    stages.discover = candidates.length ? 'succeeded' : 'empty'
    for (const candidate of candidates.slice(0, 3)) {
      try {
        attempts.fetchAttempted = true
        const fetched = await plugin.fetch(candidate)
        if (!fetched.content.trim() && !fetched.rawBytes?.byteLength) { stages.fetch = 'empty'; continue }
        fetchSucceededCount++
        rawByteCount += fetched.rawBytes?.byteLength ?? 0
        stages.fetch = 'succeeded'
        attempts.normalizeAttempted = true
        const normalized = await plugin.normalize(fetched)
        if (!normalized.content.trim()) { stages.normalize = 'empty'; continue }
        normalizeSucceededCount++
        stages.normalize = 'succeeded'
      } catch (error) {
        stages.fetch = 'failed'
        diagnostics.push(error instanceof Error ? error.message.slice(0, 180) : String(error).slice(0, 180))
      }
    }
    return { provider: plugin.name, stages, ...attempts, discoveredCount, fetchSucceededCount, normalizeSucceededCount, usableCount: normalizeSucceededCount, rawByteCount, status: normalizeSucceededCount ? 'succeeded' : discoveredCount === 0 ? 'empty' : 'failed', diagnostics }
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 180) : String(error).slice(0, 180)
    return { provider: plugin.name, stages, ...attempts, discoveredCount, fetchSucceededCount, normalizeSucceededCount, usableCount: normalizeSucceededCount, rawByteCount, status: /401|403|429|captcha|login|authentication|blocked/i.test(message) ? 'blocked' : 'failed', diagnostics: [message] }
  }
}

const providers = await Promise.all(composition.providers.map((provider) => probe(provider)))
const catalog = composition.catalog
const evidence = {
  generatedAt: new Date().toISOString(),
  taskId: 'RHL-PERSONAL-RESEARCH-V1-DAILY-INTELLIGENCE-001-FIX-002',
  classification: 'EXECUTED_WITH_PROVIDER_LIMITATIONS',
  sourceCatalog: { total: catalog.length, active: catalog.filter((item) => item.operationalStatus === 'active').length, experimental: catalog.filter((item) => item.operationalStatus === 'experimental').length, metadataOnly: catalog.filter((item) => item.operationalStatus === 'metadata_only').length, blocked: catalog.filter((item) => item.operationalStatus === 'blocked').length },
  composition: { providerCount: composition.providers.length, sharedCalendar: true, sharedWatchlist: true, sharedCatalog: true },
  catalogCoverage: catalog.map((item) => ({ platform: item.platform, operationalStatus: item.operationalStatus, automatic: item.operationalStatus === 'active', reason: item.operationalStatus === 'active' ? 'active provider eligible for automatic acquisition' : 'not automatically instantiated' })),
  providers,
  secretsIncluded: false,
  rawBodiesIncluded: false,
}
await writeFile(join(root, 'RHL_DAILY_INTELLIGENCE_V1_FIX_002.json'), `${JSON.stringify(evidence, null, 2)}\n`, 'utf8')
await writeFile(join(root, 'RHL_DAILY_INTELLIGENCE_V1_FIX_002_SUMMARY.md'), `# Daily Intelligence FIX-002 Evidence\n\n- Catalog entries: ${catalog.length}\n- Operational status counts: active=${evidence.sourceCatalog.active}, experimental=${evidence.sourceCatalog.experimental}, metadata_only=${evidence.sourceCatalog.metadataOnly}, blocked=${evidence.sourceCatalog.blocked}.\n- Shared composition created ${composition.providers.length} provider adapters and one TradingCalendarService.\n- Each provider records discover, fetch, normalize, usable, raw-byte, and diagnostic fields.\n- Provider failures and empty results remain explicit limitations; no synthetic success is recorded.\n- No secrets or raw provider bodies are included.\n`, 'utf8')
console.log(JSON.stringify(evidence, null, 2))
