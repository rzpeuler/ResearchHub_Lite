import { mkdir, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { hashKnowledgeObject } from '../../knowledge/storage/canonical-hash.ts'
import { loadKnowledgeBaseManifest } from '../../knowledge/storage/manifest-loader.ts'
import { writeKnowledgeBaseV04 } from '../../knowledge/writer/writer-v04.ts'
import type { KnowledgeAssetV04, KnowledgeClaimV04, KnowledgeEntityV04, KnowledgeSourceV04 } from '../../knowledge/schema/domain-v04.ts'
import type { KnowledgeChangeSetV04, ValidatedKnowledgeChangeSetV04 } from '../../knowledge/schema/mutation-v04.ts'
import { assertKnowledgeV04Objects } from '../../knowledge/validation/v04-validator.ts'
import { KnowledgeBaseRegistry } from '../../knowledge/registry/registry.ts'
import { CompanyResearchSkill } from '../../skills/company-research/skill.ts'
import type { SemanticKnowledgeProposal } from '../../skills/company-research/contracts.ts'
import type { NormalizedResearchSource, ResearchSourceCandidate } from '../../plugins/research-acquisition/contracts.ts'
import { sha256 } from '../../plugins/research-acquisition/hash.ts'
import { validateResearchReport, writeResearchReport, type ResearchReport } from '../../app/services/research-report.ts'
import type { CompanyDeepResearchInput, CompanyDeepResearchResult } from './contracts.ts'

const safeId = /^[A-Za-z0-9][A-Za-z0-9._-]*$/

type AcquiredResearch = {
  readonly sources: readonly NormalizedResearchSource[]
  readonly financialData?: unknown
  readonly marketData?: unknown
}

const check = (input: CompanyDeepResearchInput): void => {
  if (!safeId.test(input.workflowRunId)) throw new Error('workflowRunId must be safe')
  if (input.handle.schemaVersion !== '0.4' || input.handle.storageFormatVersion !== '1') {
    throw new Error('Company Deep Research requires Schema 0.4 / Storage 1')
  }
  if (!input.company.symbol.trim()) throw new Error('company symbol is required')
}

const abortIfNeeded = (signal: AbortSignal | undefined): void => {
  if (signal?.aborted) throw new Error('WORKFLOW_CANCELLED')
}

const sourceType = (candidate: ResearchSourceCandidate): KnowledgeSourceV04['sourceType'] => {
  if (candidate.kind === 'official_disclosure') return 'official_disclosure'
  if (candidate.kind === 'structured_data') return 'industry_database'
  if (candidate.kind === 'web_article' || candidate.kind === 'news') return 'professional_media'
  return 'general_media'
}

function rawRef(content: string): string {
  return `raw-sha256-${sha256(content)}`
}

function sourceId(source: NormalizedResearchSource): `source:${string}` {
  return `source:research-${sha256(`${source.candidate.candidateId}|${source.contentHash}`).slice(0, 16)}`
}

function claimId(proposalId: string): `claim:${string}` {
  return `claim:research-${sha256(proposalId).slice(0, 16)}`
}

function entityId(symbol: string): string {
  return `entity:company-${symbol.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`
}

async function archiveRaw(root: string, content: string, ref: string): Promise<void> {
  await mkdir(join(root, 'raw'), { recursive: true })
  await writeFile(join(root, 'raw', `${ref}.json`), `${JSON.stringify({ rawRef: ref, content })}\n`, 'utf8')
}

async function acquireStructuredData(input: CompanyDeepResearchInput): Promise<AcquiredResearch> {
  if (!input.akshare) return { sources: [] }
  const now = input.now ?? (() => new Date().toISOString())
  const entries: Array<{ readonly key: string; readonly title: string; readonly value: unknown }> = []
  const readers = [
    ['basic', 'AKShare company basic information', input.akshare.companyBasic.bind(input.akshare)],
    ['financial', 'AKShare financial data', input.akshare.financialData.bind(input.akshare)],
    ['market', 'AKShare historical market data', input.akshare.historicalMarketData.bind(input.akshare)],
  ] as const
  for (const [key, title, read] of readers) {
    try {
      entries.push({ key, title, value: await read({ symbol: input.company.symbol }) })
    } catch {
      // One structured-data endpoint being unavailable is a report gap, not a workflow failure.
    }
  }
  const sources = entries.map((entry): NormalizedResearchSource => {
    const content = JSON.stringify(entry.value)
    const candidate: ResearchSourceCandidate = {
      candidateId: `akshare-${entry.key}-${input.company.symbol}`,
      kind: 'structured_data',
      tier: 2,
      title: entry.title,
      provider: 'akshare',
      metadata: { companySymbol: input.company.symbol, dataKind: entry.key },
    }
    return {
      candidate,
      retrievedAt: now(),
      title: entry.title,
      content,
      contentHash: sha256(content),
      publisher: 'AKShare',
      rights: {
        accessScope: 'public',
        retentionAllowed: true,
        aiProcessingAllowed: true,
        derivativeKnowledgeAllowed: true,
        redistributionAllowed: false,
      },
    }
  })
  return {
    sources,
    financialData: entries.find((entry) => entry.key === 'financial')?.value,
    marketData: entries.find((entry) => entry.key === 'market')?.value,
  }
}

async function acquire(input: CompanyDeepResearchInput): Promise<AcquiredResearch> {
  const limit = Math.max(1, Math.min(input.maxSources ?? 20, 50))
  const discovered: ResearchSourceCandidate[] = []
  for (const plugin of input.acquisitionPlugins) {
    abortIfNeeded(input.signal)
    try {
      discovered.push(...await plugin.discover({
        company: input.company,
        ...(input.asOf === undefined ? {} : { asOf: input.asOf }),
        limitPerKind: Math.min(10, limit),
      }))
    } catch {
      // A source family may be unavailable while the other families continue.
    }
  }
  const unique = [...new Map(discovered.map((item) => [item.candidateId, item])).values()].slice(0, limit)
  const now = input.now ?? (() => new Date().toISOString())
  for (const candidate of unique) {
    if (input.signalStore && ['news', 'official_disclosure', 'rss'].includes(candidate.kind)) {
      await input.signalStore.append({
        signalId: `signal-${candidate.candidateId}`,
        kind: candidate.kind === 'official_disclosure' ? 'announcement' : 'news',
        source: candidate,
        publishedAt: candidate.publishedAt,
        discoveredAt: now(),
        contentReference: candidate.url,
      })
    }
  }
  const normalized: NormalizedResearchSource[] = []
  for (const candidate of unique) {
    abortIfNeeded(input.signal)
    const plugin = input.acquisitionPlugins.find((item) => item.name.includes(
      candidate.kind === 'official_disclosure' ? 'official' :
      candidate.kind === 'rss' ? 'rss' :
      candidate.kind === 'news' ? 'gdelt' : '',
    )) ?? input.acquisitionPlugins[0]
    if (!plugin) continue
    try {
      normalized.push(await plugin.normalize(await plugin.fetch(candidate)))
    } catch {
      // An inaccessible candidate remains a non-fatal acquisition gap.
    }
  }
  const structured = await acquireStructuredData(input)
  return {
    sources: [...normalized, ...structured.sources].slice(0, limit),
    financialData: structured.financialData,
    marketData: structured.marketData,
  }
}

function makeSource(source: NormalizedResearchSource, ref: string): KnowledgeSourceV04 {
  return {
    id: sourceId(source),
    title: source.title,
    sourceType: sourceType(source.candidate),
    publisher: source.publisher,
    publishedAt: source.candidate.publishedAt ?? null,
    url: source.canonicalUrl ?? null,
    rawRefs: [ref as `raw-sha256-${string}`],
    provider: source.candidate.provider,
    canonicalUrl: source.canonicalUrl ?? null,
    retrievedAt: source.retrievedAt,
    contentHash: source.contentHash,
    acquisition: {
      method: source.candidate.kind === 'official_disclosure' ? 'official' :
        source.candidate.kind === 'structured_data' ? 'structured_data' :
        source.candidate.kind === 'rss' ? 'rss' : 'news_search',
      discoveredAt: null,
      fetchedAt: source.retrievedAt,
      extractor: 'bounded-research-acquisition',
    },
    rights: source.rights,
    lifecycle: { status: 'active' },
  }
}

function proposalToClaim(
  proposal: SemanticKnowledgeProposal,
  companyRef: `entity:${string}`,
  sources: ReadonlyMap<string, KnowledgeSourceV04>,
  claims: ReadonlyMap<string, string>,
): KnowledgeClaimV04 | undefined {
  if (proposal.kind !== 'claim' || !proposal.statement || !proposal.claimType) return undefined
  const sourceRefs = (proposal.sourceCandidateIds ?? [])
    .map((id) => sources.get(id)?.id)
    .filter((id): id is `source:${string}` => id !== undefined)
  if (sourceRefs.length === 0) return undefined
  return {
    id: claimId(proposal.proposalId),
    claimType: proposal.claimType,
    statement: proposal.statement,
    subjectRefs: [companyRef],
    primarySubjectRef: companyRef,
    sourceRefs,
    confidence: proposal.confidence ?? 0.5,
    ...(proposal.probability === undefined ? {} : { probability: proposal.probability }),
    supportsClaimRefs: (proposal.supportsProposalIds ?? []).map((id) => claims.get(id)).filter((id): id is `claim:${string}` => id !== undefined),
    dependsOnClaimRefs: (proposal.dependsOnProposalIds ?? []).map((id) => claims.get(id)).filter((id): id is `claim:${string}` => id !== undefined),
    contradictsClaimRefs: (proposal.contradictsProposalIds ?? []).map((id) => claims.get(id)).filter((id): id is `claim:${string}` => id !== undefined),
    lifecycle: { status: 'active' },
  }
}

export async function runCompanyDeepResearch(input: CompanyDeepResearchInput): Promise<CompanyDeepResearchResult> {
  try {
    check(input)
    abortIfNeeded(input.signal)
    const now = input.now ?? (() => new Date().toISOString())
    const asOf = input.asOf ?? now()
    const acquired = await acquire(input)
    const sources = acquired.sources
    abortIfNeeded(input.signal)
    for (const source of sources) await archiveRaw(input.handle.rootRef, source.content, rawRef(source.content))

    const sourceObjects = sources.map((source) => makeSource(source, rawRef(source.content)))
    const sourceByCandidate = new Map(sources.map((source, index) => [source.candidate.candidateId, sourceObjects[index]!]))
    const companyRef = entityId(input.company.symbol) as `entity:${string}`
    const company: KnowledgeEntityV04 = {
      id: companyRef,
      type: 'company',
      name: input.company.name ?? input.company.symbol,
      aliases: [input.company.symbol],
      ticker: input.company.symbol,
      exchange: input.company.exchange ?? 'A-share',
      lifecycle: { status: 'active' },
    }
    const research = new CompanyResearchSkill(now).run({
      company: input.company,
      asOf,
      sources,
      financialData: acquired.financialData,
      marketData: acquired.marketData,
    })
    const claimIdMap = new Map(
      research.proposals.filter((proposal) => proposal.kind === 'claim').map((proposal) => [proposal.proposalId, claimId(proposal.proposalId)]),
    )
    const claims = research.proposals
      .map((proposal) => proposalToClaim(proposal, companyRef, sourceByCandidate, claimIdMap))
      .filter((claim): claim is KnowledgeClaimV04 => claim !== undefined)
    const objects: KnowledgeAssetV04[] = [company, ...sourceObjects, ...claims]
    assertKnowledgeV04Objects(objects)

    const manifest = await loadKnowledgeBaseManifest(input.handle.rootRef)
    const changeSet: KnowledgeChangeSetV04 = {
      changeSetId: `changeset:research-${hashKnowledgeObject({ workflowRunId: input.workflowRunId, company: input.company, sources: sourceObjects.map((source) => source.id), claims: claims.map((claim) => claim.id) }).slice(-20)}`,
      workflowRunId: input.workflowRunId,
      knowledgeBaseId: input.handle.knowledgeBaseId,
      schemaVersion: '0.4',
      storageFormatVersion: '1',
      expectedBaseRevision: manifest.revision,
      operations: objects.map((object) => ({ type: 'create' as const, object })),
      ingestionContext: { producerType: 'company_deep_research', companySymbol: input.company.symbol },
    }
    const receipt: ValidatedKnowledgeChangeSetV04 = {
      changeSet,
      knowledgeBaseId: input.handle.knowledgeBaseId,
      schemaVersion: '0.4',
      baseRevision: manifest.revision,
      changeSetId: changeSet.changeSetId,
      changeSetHash: hashKnowledgeObject(changeSet),
    }
    const write = await writeKnowledgeBaseV04(input.handle, receipt, new KnowledgeBaseRegistry(), now)
    if (write.status !== 'committed' && write.status !== 'no_changes' && write.status !== 'already_committed') {
      return {
        workflowRunId: input.workflowRunId,
        status: 'blocked',
        knowledgeBaseId: input.handle.knowledgeBaseId,
        proposalIds: research.proposals.map((proposal) => proposal.proposalId),
        committedIds: [],
        sourceIds: sourceObjects.map((source) => source.id),
        claimIds: claims.map((claim) => claim.id),
        errors: [write.error?.message ?? 'Schema 0.4 Writer rejected the research ChangeSet'],
        research,
      }
    }

    const reportId = `company-research-${input.company.symbol.toLowerCase()}-${input.workflowRunId}`
    const sourceRefs = sourceObjects.map((source) => source.id)
    const claimRefs = claims.map((claim) => claim.id)
    const report: ResearchReport = validateResearchReport({
      reportId,
      reportType: 'company_research',
      subjectRefs: [companyRef],
      generatedAt: research.generatedAt,
      asOf,
      workflowRunId: input.workflowRunId,
      knowledgeBaseRevision: write.committedRevision,
      sourceRefs,
      claimRefs,
      methodology: 'Bounded official/structured/news acquisition with deterministic valuation and semantic proposal projection.',
      sections: research.sections.map((section) => ({
        id: section.id,
        title: section.title,
        markdown: section.markdown,
        sourceRefs: section.sourceCandidateIds.map((id) => sourceByCandidate.get(id)?.id).filter((id): id is `source:${string}` => id !== undefined),
        claimRefs: section.proposalIds.map((id) => claimIdMap.get(id)).filter((id): id is `claim:${string}` => id !== undefined),
      })),
      outputPath: `${reportId}.md`,
    })
    const outputPath = await writeResearchReport(report, resolve(input.reportRoot))
    return {
      workflowRunId: input.workflowRunId,
      status: 'completed',
      knowledgeBaseId: input.handle.knowledgeBaseId,
      knowledgeBaseRevision: write.committedRevision,
      report: { reportId, outputPath },
      proposalIds: research.proposals.map((proposal) => proposal.proposalId),
      committedIds: write.createdIds,
      sourceIds: sourceObjects.map((source) => source.id),
      claimIds: claims.map((claim) => claim.id),
      errors: [],
      research,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const status = message === 'WORKFLOW_CANCELLED' ? 'cancelled' : 'failed'
    return {
      workflowRunId: input.workflowRunId,
      status,
      knowledgeBaseId: input.handle.knowledgeBaseId,
      proposalIds: [],
      committedIds: [],
      sourceIds: [],
      claimIds: [],
      errors: [message],
    }
  }
}
