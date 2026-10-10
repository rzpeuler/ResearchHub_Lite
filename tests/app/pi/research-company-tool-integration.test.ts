import assert from 'node:assert/strict'
import test from 'node:test'
import { createHash } from 'node:crypto'
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createResearchHubTools } from '../../../app/pi/tools.ts'
import { ResearchService } from '../../../app/services/research-service.ts'
import { SecurityIdentityResolver } from '../../../app/services/security-identity-resolver.ts'
import { WorkflowService } from '../../../app/services/workflow-service.ts'
import { createFreshKnowledgeBaseV04 } from '../../../knowledge/storage/create-v04.ts'
import { createSecurityIdentityDataResolver } from '../../../plugins/research-acquisition/security-identity-data.ts'
import type { AkshareDataClient } from '../../../plugins/research-acquisition/akshare.ts'
import type { ResearchAcquisitionPlugin } from '../../../plugins/research-acquisition/contracts.ts'

const AS_OF = '2026-10-09T08:00:00.000Z'

async function snapshotTree(root: string): Promise<readonly string[]> {
  const entries: string[] = []
  const visit = async (directory: string): Promise<void> => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const absolute = join(directory, entry.name)
      if (entry.isDirectory()) {
        entries.push(`dir:${absolute.slice(root.length)}`)
        await visit(absolute)
      } else if (entry.isFile()) {
        entries.push(`file:${absolute.slice(root.length)}:${createHash('sha256').update(await readFile(absolute)).digest('hex')}`)
      }
    }
  }
  await visit(root)
  return entries.sort()
}

test('Pi research_company Application Tool completes the real ResearchService Workflow and reloads its Report read-only', async () => {
  const root = await mkdtemp(join(tmpdir(), 'researchhub-pi-company-tool-kb-'))
  const reports = await mkdtemp(join(tmpdir(), 'researchhub-pi-company-tool-reports-'))
  try {
    await createFreshKnowledgeBaseV04(root, { knowledgeBaseId: 'kb-pi-company-tool', now: AS_OF })
    const akshare = {
      async securityDirectory() { return [{ symbol: '600519', name: '贵州茅台', exchange: 'SH' as const }] },
      async companyBasic() { return [{ item: 'industry', value: 'distilled spirits' }] },
      async financialData() { return [{ report_date: '2025-12-31', publication_date: '2026-03-10', operating_revenue: 100, net_profit: 20, basic_eps: 5 }] },
      async historicalMarketData() { return [] },
    } as unknown as AkshareDataClient
    const identityResolver = new SecurityIdentityResolver({
      mountedKnowledgeBaseRoot: root,
      now: () => new Date(AS_OF),
      dataResolverFactory: ({ now, signal }) => createSecurityIdentityDataResolver({ akshare, now, ...(signal === undefined ? {} : { signal }) }),
    })
    const candidate = { candidateId: 'pi-company-filing', kind: 'official_disclosure' as const, tier: 1 as const, title: 'Company filing fixture', url: 'https://example.test/company-filing', provider: 'cninfo', publishedAt: '2026-03-10T00:00:00.000Z', metadata: { companySymbol: '600519' } }
    const rights = { accessScope: 'public' as const, retentionAllowed: true, aiProcessingAllowed: true, derivativeKnowledgeAllowed: true, redistributionAllowed: false }
    const cninfo: ResearchAcquisitionPlugin = {
      name: 'pi-company-tool-fixture',
      discover: async () => [candidate],
      fetch: async (sourceCandidate) => ({ candidate: sourceCandidate, retrievedAt: AS_OF, content: 'Fixture disclosure: revenue was 100 and net profit was 20.', contentHash: 'a'.repeat(64) }),
      normalize: async (source) => ({ candidate: source.candidate, retrievedAt: source.retrievedAt, title: source.candidate.title, content: source.content, contentHash: source.contentHash!, canonicalUrl: source.candidate.url, publisher: 'CNINFO fixture', rights }),
    }
    const workflowService = new WorkflowService()
    const researchService = new ResearchService({
      mountedKnowledgeBaseRoot: root,
      reportRoot: reports,
      acquisitionPlugins: [cninfo],
      researchEvidenceProviders: { cninfo },
      akshare,
      workflowService,
      securityIdentityResolver: identityResolver,
    })
    const tools = createResearchHubTools({
      knowledgeService: {} as never,
      reviewService: {} as never,
      productionService: {} as never,
      workflowService,
      researchService,
      policyContext: { current: { structuredKnowledge: false, sourceLibrary: false, writeKnowledge: false } },
    })
    const before = await snapshotTree(root)
    const tool = tools.find((item) => item.name === 'research_company')
    assert.ok(tool)
    const response = await tool.execute('pi-company-tool-call', { workflowRunId: 'pi-company-tool-run', symbol: '600519', name: '贵州茅台', exchange: 'SH' }, undefined, undefined, {} as never)
    const result = JSON.parse(response.content[0]!.type === 'text' ? response.content[0]!.text : '{}') as { status: string; runId: string; reportId?: string }
    assert.equal(result.status, 'completed')
    assert.equal(result.runId, 'pi-company-tool-run')
    assert.ok(result.reportId)
    const run = workflowService.getWorkflowStatus(result.runId)
    assert.equal(run?.status, 'completed')
    const report = await researchService.getResearchReport(result.reportId!)
    assert.equal(report.workflowRunId, result.runId)
    assert.equal(report.reportType, 'company_research')
    assert.equal(report.verifiedSecurityIdentity?.symbol, '600519')
    assert.ok(report.sections.some((section) => section.evidenceLinks?.includes('https://example.test/company-filing')))
    assert.deepEqual(await snapshotTree(root), before, 'Pi Tool read-only policy must preserve the entire Knowledge file tree')
  } finally {
    await rm(root, { recursive: true, force: true })
    await rm(reports, { recursive: true, force: true })
  }
})
