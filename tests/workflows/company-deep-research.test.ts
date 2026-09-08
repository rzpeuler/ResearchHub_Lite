import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { KnowledgeBaseRegistry } from '../../knowledge/registry/registry.ts'
import { createFreshKnowledgeBaseV04, readCanonicalV04Assets } from '../../knowledge/storage/index.ts'
import { runCompanyDeepResearch } from '../../workflows/company-deep-research/index.ts'
import type { ResearchAcquisitionPlugin, ResearchSignal, ResearchSignalStore } from '../../plugins/research-acquisition/contracts.ts'

test('Company Deep Research produces atomic canonical Knowledge and a linked report', async () => {
  const root = await mkdtemp(join(tmpdir(), 'researchhub-company-'))
  const reports = await mkdtemp(join(tmpdir(), 'researchhub-company-reports-'))
  try {
    await createFreshKnowledgeBaseV04(root, { knowledgeBaseId: 'kb-company-test', now: '2026-09-08T00:00:00.000Z' })
    const handle = await new KnowledgeBaseRegistry().mount(root)
    const signals: ResearchSignal[] = []
    const signalStore: ResearchSignalStore = { append: async (signal) => { signals.push(signal) }, listForCompany: async () => signals }
    const plugin: ResearchAcquisitionPlugin = {
      name: 'fixture-official',
      discover: async () => [{ candidateId: 'official-1', kind: 'official_disclosure', tier: 1, title: 'Fixture filing', url: 'https://example.com/filing', provider: 'cninfo', publishedAt: '2026-09-07T00:00:00.000Z', metadata: { companySymbol: '600519' } }],
      fetch: async (candidate) => ({ candidate, retrievedAt: '2026-09-08T00:00:00.000Z', content: 'The company reported stable revenue and profit.', contentHash: 'b'.repeat(64) }),
      normalize: async (fetched) => ({ candidate: fetched.candidate, retrievedAt: fetched.retrievedAt, title: fetched.candidate.title, content: fetched.content, contentHash: fetched.contentHash!, canonicalUrl: fetched.candidate.url, publisher: fetched.candidate.provider, rights: { accessScope: 'public', retentionAllowed: true, aiProcessingAllowed: true, derivativeKnowledgeAllowed: true, redistributionAllowed: false } }),
    }
    const input = { workflowRunId: 'company-run-1', handle, company: { symbol: '600519', name: 'Fixture Company' }, acquisitionPlugins: [plugin], signalStore, reportRoot: reports, now: () => '2026-09-08T00:00:00.000Z' }
    const result = await runCompanyDeepResearch(input)
    assert.equal(result.status, 'completed', result.errors.join('; '))
    assert.ok(result.report?.outputPath)
    assert.ok(result.committedIds.length >= 2)
    assert.equal(signals.length, 1)
    const loaded = await readCanonicalV04Assets(root)
    assert.ok(loaded.objects.some((item) => item.value.id === 'entity:company-600519'))
    assert.ok(loaded.objects.some((item) => item.value.id.startsWith('source:research-')))
    assert.ok(loaded.objects.some((item) => item.value.id.startsWith('claim:research-')))
    assert.equal(result.knowledgeBaseRevision, 1)

    const replay = await runCompanyDeepResearch({ ...input, handle: await new KnowledgeBaseRegistry().mount(root) })
    assert.equal(replay.status, 'completed')
    assert.equal(replay.knowledgeBaseRevision, 1)
    const replayLoaded = await readCanonicalV04Assets(root)
    assert.equal(replayLoaded.objects.filter((item) => item.value.id.startsWith('source:research-')).length, 1)
  } finally {
    await rm(root, { recursive: true, force: true })
    await rm(reports, { recursive: true, force: true })
  }
})
