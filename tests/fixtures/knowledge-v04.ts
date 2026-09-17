import type { NormalizedResearchSource, ResearchSourceCandidate } from '../../plugins/research-acquisition/contracts.ts'
import { sha256 } from '../../plugins/research-acquisition/hash.ts'
import type { KnowledgeProductionInput, SemanticProductionProposal } from '../../knowledge/production/contracts.ts'
import type { KnowledgeBaseHandle } from '../../knowledge/storage/handle.ts'

export const KNOWLEDGE_V04_NOW = '2026-09-18T00:00:00.000Z'
export const KNOWLEDGE_V04_AS_OF = '2026-09-17T12:00:00.000Z'

export const permissiveRights = {
  accessScope: 'public' as const,
  retentionAllowed: true,
  aiProcessingAllowed: true,
  derivativeKnowledgeAllowed: true,
  redistributionAllowed: false,
}

export function normalizedSource(id: string, title: string, content: string, kind: ResearchSourceCandidate['kind'] = 'official_disclosure', provider = 'fixture'): NormalizedResearchSource {
  const candidate: ResearchSourceCandidate = {
    candidateId: id,
    kind,
    tier: kind === 'official_disclosure' ? 1 : 2,
    title,
    provider,
    url: `https://example.test/knowledge-v04/${id}`,
    publishedAt: KNOWLEDGE_V04_AS_OF,
    metadata: { companySymbol: '600519', fixture: true },
  }
  return {
    candidate,
    retrievedAt: KNOWLEDGE_V04_NOW,
    title,
    content,
    canonicalUrl: candidate.url,
    contentHash: sha256(content),
    rawBytes: new TextEncoder().encode(content),
    publisher: provider,
    rights: permissiveRights,
  }
}

export function knowledgeV04Proposals(): readonly SemanticProductionProposal[] {
  return [
    { proposalId: 'security', kind: 'entity', subjectKey: 'security', entityType: 'security', entityName: '600519', structuredValue: { ticker: '600519', exchange: 'SSE', securityType: 'equity', currency: 'CNY' } },
    { proposalId: 'broker-a', kind: 'entity', subjectKey: 'broker-a', entityType: 'institution', entityName: 'Fixture Securities A', structuredValue: { institutionType: 'broker' } },
    { proposalId: 'broker-b', kind: 'entity', subjectKey: 'broker-b', entityType: 'institution', entityName: 'Fixture Securities B', structuredValue: { institutionType: 'broker' } },
    { proposalId: 'event-fy25', kind: 'event', subjectKey: 'company', eventType: 'earnings_release', statement: 'FY2025 earnings release published', sourceCandidateIds: ['earnings-release'], temporal: { occurredAt: KNOWLEDGE_V04_AS_OF, announcedAt: KNOWLEDGE_V04_AS_OF, fiscalPeriod: 'FY2025' } },
    { proposalId: 'revenue', kind: 'observation', subjectKey: 'company', observationType: 'metric', metricRef: 'metric:revenue', value: 1000000000, unit: 'CNY', period: 'FY2025', sourceCandidateIds: ['earnings-release'], temporal: { observedAt: KNOWLEDGE_V04_AS_OF, reportedAt: KNOWLEDGE_V04_AS_OF } },
    { proposalId: 'eps-a', kind: 'observation', subjectKey: 'company', observationType: 'estimate', metricRef: 'metric:eps', estimateValue: 10, unit: 'CNY/share', currency: 'CNY', fiscalPeriod: 'FY2026', institutionKey: 'broker-a', publishedAt: KNOWLEDGE_V04_AS_OF, sourceCandidateIds: ['estimate-a'] },
    { proposalId: 'eps-b', kind: 'observation', subjectKey: 'company', observationType: 'estimate', metricRef: 'metric:eps', estimateValue: 12, unit: 'CNY/share', currency: 'CNY', fiscalPeriod: 'FY2026', institutionKey: 'broker-b', publishedAt: KNOWLEDGE_V04_AS_OF, sourceCandidateIds: ['estimate-b'] },
    { proposalId: 'eps-consensus', kind: 'observation', subjectKey: 'company', observationType: 'consensus', metricRef: 'metric:eps', fiscalPeriod: 'FY2026', contributingProposalIds: ['eps-a', 'eps-b'] },
    { proposalId: 'earnings-claim', kind: 'claim', claimType: 'fact', subjectKey: 'company', statement: 'FY2025 revenue was CNY 1.0 billion.', sourceCandidateIds: ['earnings-release'], structuredValue: { metric: 'metric:revenue', value: 1000000000, unit: 'CNY', comparator: 'eq', period: 'FY2025', fiscalPeriod: 'FY2025' } },
    { proposalId: 'risk-claim', kind: 'claim', claimType: 'risk', subjectKey: 'company', statement: 'The FY2026 EPS range remains sensitive to estimate dispersion.', sourceCandidateIds: ['estimate-a', 'estimate-b'], structuredValue: { metric: 'metric:eps', value: 11, unit: 'CNY/share', comparator: 'eq', period: 'FY2026', fiscalPeriod: 'FY2026' } },
    { proposalId: 'thesis', kind: 'thesis', subjectKey: 'company', thesisTitle: 'Durable earnings compounding', thesisStatus: 'active', statement: 'The company can compound earnings if execution remains stable.' },
    { proposalId: 'edge-observation-claim', kind: 'reasoning_edge', subjectKey: 'eps-consensus', sourceProposalId: 'eps-consensus', targetKey: 'earnings-claim', edgeType: 'qualifies', confidence: 0.8, sourceCandidateIds: ['estimate-a'] },
    { proposalId: 'edge-claim-thesis', kind: 'reasoning_edge', subjectKey: 'earnings-claim', sourceProposalId: 'earnings-claim', targetKey: 'thesis', edgeType: 'supports', confidence: 0.9, sourceCandidateIds: ['earnings-release'] },
    { proposalId: 'edge-risk-thesis', kind: 'reasoning_edge', subjectKey: 'risk-claim', sourceProposalId: 'risk-claim', targetKey: 'thesis', edgeType: 'challenges', confidence: 0.7, sourceCandidateIds: ['estimate-a', 'estimate-b'] },
    { proposalId: 'ambiguous-review', kind: 'claim', claimType: 'viewpoint', subjectKey: 'company', statement: 'The market may be underestimating execution risk.', sourceCandidateIds: ['estimate-a'], resolution: 'review', structuredValue: { metric: 'metric:eps', value: 11, unit: 'CNY/share', comparator: 'eq', period: 'FY2026' } },
  ]
}

export function knowledgeV04Evidence(): KnowledgeProductionInput['evidenceBindings'] {
  return [
    { localSourceId: 'earnings-release', source: normalizedSource('earnings-release', 'Fixture FY2025 earnings release', 'Revenue and earnings release evidence.') },
    { localSourceId: 'estimate-a', source: normalizedSource('estimate-a', 'Fixture broker A estimate', 'Broker A FY2026 EPS estimate.') },
    { localSourceId: 'estimate-b', source: normalizedSource('estimate-b', 'Fixture broker B estimate', 'Broker B FY2026 EPS estimate.') },
  ]
}

export function knowledgeV04Input(handle: KnowledgeBaseHandle, runId = 'knowledge-v04-earnings-001'): KnowledgeProductionInput {
  return {
    handle,
    producerType: 'earnings_review',
    producerRunId: runId,
    schemaProfile: { schemaVersion: '0.4', storageFormatVersion: '1', requiresRawProvenance: true },
    entity: { localKey: 'company', entityType: 'company', name: 'Kweichow Moutai', aliases: ['600519'], semanticFields: { ticker: '600519', exchange: 'SSE' } },
    proposals: knowledgeV04Proposals(),
    evidenceBindings: knowledgeV04Evidence(),
    asOf: KNOWLEDGE_V04_AS_OF,
    now: () => KNOWLEDGE_V04_NOW,
  }
}
