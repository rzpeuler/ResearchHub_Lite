import { mkdir, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { createFreshKnowledgeBaseV04, readCanonicalV04Assets } from '../../knowledge/storage/index.ts'
import { KnowledgeBaseRegistry } from '../../knowledge/registry/registry.ts'
import { CninfoOfficialDisclosureClient, OfficialDisclosureResearchPlugin } from '../../plugins/research-acquisition/official.ts'
import { GdeltResearchPlugin } from '../../plugins/research-acquisition/gdelt.ts'
import { AkshareDataAdapter } from '../../plugins/research-acquisition/akshare.ts'
import { runCompanyDeepResearch } from '../../workflows/company-deep-research/workflow.ts'

const smokeId = new Date().toISOString().replace(/[:.]/g, '-')
const root = resolve('runtime-data', `personal-research-real-smoke-${smokeId}`, 'kb')
const reportRoot = resolve('runtime-data', `personal-research-real-smoke-${smokeId}`, 'reports')
await mkdir(reportRoot, { recursive: true })
await createFreshKnowledgeBaseV04(root, { knowledgeBaseId: 'kb-real-smoke-600519', name: 'Personal Research real-network smoke' })
const result = await runCompanyDeepResearch({ workflowRunId: 'real-smoke-600519', handle: await new KnowledgeBaseRegistry().mount(root), company: { symbol: '600519', name: '贵州茅台', exchange: 'SSE' }, acquisitionPlugins: [new OfficialDisclosureResearchPlugin(new CninfoOfficialDisclosureClient()), new GdeltResearchPlugin()], akshare: new AkshareDataAdapter(), reportRoot, maxSources: 6 })
const assets = await readCanonicalV04Assets(root)
const canonicalSources = assets.objects.filter((item) => item.kind === 'source').map((item) => { const value = item.value as { id: string; provider?: string; sourceType?: string }; return { id: value.id, provider: value.provider, sourceType: value.sourceType } })
const evidence = { generatedAt: new Date().toISOString(), company: '600519', providersAttempted: ['cninfo', 'gdelt', 'akshare'], status: result.status, errors: result.errors, report: result.report, sourceIds: result.sourceIds, claimIds: result.claimIds, committedIds: result.committedIds, knowledgeBaseRevision: result.knowledgeBaseRevision, canonicalSources, canonicalCounts: { entities: assets.objects.filter((item) => item.kind === 'entity').length, sources: assets.objects.filter((item) => item.kind === 'source').length, claims: assets.objects.filter((item) => item.kind === 'claim').length } }
const evidencePath = join(reportRoot, 'smoke-evidence.json'); await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`); console.log(JSON.stringify({ ...evidence, evidencePath }, null, 2))
