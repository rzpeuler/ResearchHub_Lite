import { resolve } from 'node:path'
import { KnowledgeBaseRegistry } from '../../knowledge/registry/registry.ts'
import { KnowledgeProductionGateway } from '../../knowledge/production/gateway.ts'
import { CompanyResearchSkill } from '../../skills/company-research/skill.ts'
import type { NormalizedResearchSource, ResearchSourceCandidate } from '../../plugins/research-acquisition/contracts.ts'
import { sha256 } from '../../plugins/research-acquisition/hash.ts'
import { validateResearchReport, writeResearchReport, type ResearchReport } from '../../app/services/research-report.ts'
import type { CompanyDeepResearchInput, CompanyDeepResearchResult } from './contracts.ts'

const safeId = /^[A-Za-z0-9][A-Za-z0-9._-]*$/
type AcquiredResearch = { readonly sources: readonly NormalizedResearchSource[]; readonly financialData?: unknown; readonly marketData?: unknown }

function check(input: CompanyDeepResearchInput): void {
  if (!safeId.test(input.workflowRunId)) throw new Error('workflowRunId must be safe')
  if (input.handle.schemaVersion !== '0.4' || input.handle.storageFormatVersion !== '1') throw new Error('Company Deep Research requires Schema 0.4 / Storage 1')
  if (!input.company.symbol.trim()) throw new Error('company symbol is required')
}

function abortIfNeeded(signal: AbortSignal | undefined): void { if (signal?.aborted) throw new Error('WORKFLOW_CANCELLED') }
function withinAsOf(publishedAt: string | undefined, asOf: string): boolean { return publishedAt === undefined || Number.isNaN(Date.parse(publishedAt)) || Date.parse(publishedAt) <= Date.parse(asOf) }

async function acquireStructuredData(input: CompanyDeepResearchInput): Promise<AcquiredResearch> {
  if (!input.akshare) return { sources: [] }
  const now = input.now ?? (() => new Date().toISOString())
  const entries: Array<{ readonly key: string; readonly title: string; readonly value: unknown }> = []
  const readers = [['basic', 'AKShare company basic information', input.akshare.companyBasic.bind(input.akshare)], ['financial', 'AKShare financial data', input.akshare.financialData.bind(input.akshare)], ['market', 'AKShare historical market data', input.akshare.historicalMarketData.bind(input.akshare)]] as const
  for (const [key, title, read] of readers) { try { entries.push({ key, title, value: await read({ symbol: input.company.symbol }) }) } catch { /* provider gaps remain explicit in the report */ } }
  const sources = entries.map((entry): NormalizedResearchSource => {
    const content = JSON.stringify(entry.value)
    const candidate: ResearchSourceCandidate = { candidateId: `akshare-${entry.key}-${input.company.symbol}`, kind: 'structured_data', tier: 2, title: entry.title, provider: 'akshare', metadata: { companySymbol: input.company.symbol, dataKind: entry.key } }
    return { candidate, retrievedAt: now(), title: entry.title, content, contentHash: sha256(content), publisher: 'AKShare', rights: { accessScope: 'public', retentionAllowed: true, aiProcessingAllowed: true, derivativeKnowledgeAllowed: true, redistributionAllowed: false } }
  })
  return { sources, financialData: entries.find((entry) => entry.key === 'financial')?.value, marketData: entries.find((entry) => entry.key === 'market')?.value }
}

async function acquire(input: CompanyDeepResearchInput, asOf: string): Promise<AcquiredResearch> {
  const limit = Math.max(1, Math.min(input.maxSources ?? 20, 50))
  const discovered: ResearchSourceCandidate[] = []
  for (const plugin of input.acquisitionPlugins) {
    abortIfNeeded(input.signal)
    try { discovered.push(...await plugin.discover({ company: input.company, asOf, limitPerKind: Math.min(10, limit) })) } catch { /* source family unavailable */ }
  }
  const unique = [...new Map(discovered.filter((candidate) => withinAsOf(candidate.publishedAt, asOf)).map((item) => [item.candidateId, item])).values()].slice(0, limit)
  const now = input.now ?? (() => new Date().toISOString())
  for (const candidate of unique) if (input.signalStore && ['news', 'official_disclosure', 'rss'].includes(candidate.kind)) await input.signalStore.append({ signalId: `signal-${candidate.candidateId}`, kind: candidate.kind === 'official_disclosure' ? 'announcement' : 'news', source: candidate, publishedAt: candidate.publishedAt, discoveredAt: now(), contentReference: candidate.url })
  const normalized: NormalizedResearchSource[] = []
  for (const candidate of unique) {
    abortIfNeeded(input.signal)
    const plugin = input.acquisitionPlugins.find((item) => item.name.includes(candidate.kind === 'official_disclosure' ? 'official' : candidate.kind === 'rss' ? 'rss' : candidate.kind === 'news' ? 'gdelt' : '')) ?? input.acquisitionPlugins[0]
    if (!plugin) continue
    try { normalized.push(await plugin.normalize(await plugin.fetch(candidate))) } catch { /* inaccessible evidence is a report gap */ }
  }
  const structured = await acquireStructuredData(input)
  return { sources: [...normalized.filter((source) => withinAsOf(source.candidate.publishedAt, asOf)), ...structured.sources].slice(0, limit), financialData: structured.financialData, marketData: structured.marketData }
}

export async function runCompanyDeepResearch(input: CompanyDeepResearchInput): Promise<CompanyDeepResearchResult> {
  try {
    check(input)
    abortIfNeeded(input.signal)
    const now = input.now ?? (() => new Date().toISOString())
    const asOf = input.asOf ?? now()
    const acquired = await acquire(input, asOf)
    abortIfNeeded(input.signal)
    const gateway = new KnowledgeProductionGateway(new KnowledgeBaseRegistry())
    const existingKnowledgeProjection = await gateway.projectExistingKnowledge(input.handle, input.company)
    const research = await new CompanyResearchSkill(now, input.reasoningExecutor).synthesize({ company: input.company, asOf, sources: acquired.sources, financialData: acquired.financialData, marketData: acquired.marketData, existingKnowledgeProjection })
    const outcome = await gateway.submit({ handle: input.handle, producerType: 'company_deep_research', producerRunId: input.workflowRunId, schemaProfile: { schemaVersion: '0.4', storageFormatVersion: '1', requiresRawProvenance: true }, entity: { localKey: 'company', entityType: 'company', name: input.company.name ?? input.company.symbol, aliases: [input.company.symbol], semanticFields: { ticker: input.company.symbol, exchange: input.company.exchange ?? 'A-share' } }, proposals: research.proposals, evidenceBindings: acquired.sources.map((source) => ({ localSourceId: source.candidate.candidateId, source })), asOf, now })
    if (outcome.status === 'blocked' || outcome.status === 'failed') return { workflowRunId: input.workflowRunId, status: 'blocked', knowledgeBaseId: input.handle.knowledgeBaseId, knowledgeBaseRevision: outcome.knowledgeBaseRevision, proposalIds: research.proposals.map((proposal) => proposal.proposalId), committedIds: [], sourceIds: Object.values(outcome.sourceRefsByLocalId), claimIds: Object.values(outcome.claimRefsByProposalId), errors: outcome.errors, research, resolutionIntents: outcome.resolutionIntents }
    const companyRef = outcome.entityRefsByLocalKey.company
    const reportId = `company-research-${input.company.symbol.toLowerCase()}-${input.workflowRunId}`
    const report: ResearchReport = validateResearchReport({ reportId, reportType: 'company_research', subjectRefs: companyRef ? [companyRef] : [], generatedAt: research.generatedAt, asOf, workflowRunId: input.workflowRunId, knowledgeBaseRevision: outcome.knowledgeBaseRevision, sourceRefs: Object.values(outcome.sourceRefsByLocalId), claimRefs: Object.values(outcome.claimRefsByProposalId), methodology: 'Bounded acquisition -> semantic proposal -> deterministic canonical binding -> validated ChangeSet -> shared Writer.', sections: research.sections.map((section) => ({ id: section.id, title: section.title, markdown: section.markdown, sourceRefs: section.sourceCandidateIds.map((id) => outcome.sourceRefsByLocalId[id]).filter((id): id is string => id !== undefined), claimRefs: section.proposalIds.map((id) => outcome.claimRefsByProposalId[id]).filter((id): id is string => id !== undefined) })), outputPath: `${reportId}.md` })
    const outputPath = await writeResearchReport(report, resolve(input.reportRoot))
    return { workflowRunId: input.workflowRunId, status: 'completed', knowledgeBaseId: input.handle.knowledgeBaseId, knowledgeBaseRevision: outcome.knowledgeBaseRevision, report: { reportId, outputPath }, proposalIds: research.proposals.map((proposal) => proposal.proposalId), committedIds: outcome.createdIds, sourceIds: Object.values(outcome.sourceRefsByLocalId), claimIds: Object.values(outcome.claimRefsByProposalId), errors: [], research, updatedIds: outcome.updatedIds, resolutionIntents: outcome.resolutionIntents }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { workflowRunId: input.workflowRunId, status: message === 'WORKFLOW_CANCELLED' ? 'cancelled' : 'failed', knowledgeBaseId: input.handle.knowledgeBaseId, proposalIds: [], committedIds: [], sourceIds: [], claimIds: [], errors: [message] }
  }
}
