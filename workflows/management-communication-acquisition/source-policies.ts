import type { DataRequirement, SourceCandidate, SourcePolicy } from '../research-data-acquisition/contracts.ts'

export const MANAGEMENT_COMMUNICATION_DOCUMENT_CAPABILITY = 'management_communication_documents' as const
export const EXCHANGE_QA_SZSE_CAPABILITY = 'exchange_qa_szse' as const
export const EXCHANGE_QA_SSE_CAPABILITY = 'exchange_qa_sse' as const

const documentCandidates: readonly SourceCandidate[] = [
  {
    sourceId: 'cninfo-official-ir',
    fallbackLevel: 'PRIMARY',
    originAuthority: 'S1_OFFICIAL',
    originPublisher: 'listed-company',
    operationId: 'cninfo_official_ir',
    supports: { dataKinds: ['document'] },
  },
  {
    sourceId: 'eastmoney-institutional-research',
    fallbackLevel: 'FALLBACK_2',
    originAuthority: 'S3_AGGREGATOR',
    originPublisher: 'listed-company',
    operationId: 'eastmoney_institutional_research',
    supports: { dataKinds: ['document'] },
  },
]

export function managementCommunicationDocumentPolicy(): SourcePolicy {
  return {
    policyId: 'd2-001-management-communication-documents',
    requirementMatch: { dataKind: 'document', capability: MANAGEMENT_COMMUNICATION_DOCUMENT_CAPABILITY },
    selectionMode: 'FIRST_VALID',
    candidates: documentCandidates,
  }
}

export function exchangeQAPolicy(exchange: 'SSE' | 'SZSE'): SourcePolicy {
  const szse = exchange === 'SZSE'
  const candidate: SourceCandidate = szse
    ? {
        sourceId: 'szse-hudongyi',
        fallbackLevel: 'PRIMARY',
        originAuthority: 'S1_OFFICIAL',
        originPublisher: 'listed-company',
        operationId: 'exchange_qa_szse',
        supports: { dataKinds: ['evidence'] },
      }
    : {
        sourceId: 'sse-einteraction',
        fallbackLevel: 'PRIMARY',
        originAuthority: 'S1_OFFICIAL',
        originPublisher: 'listed-company',
        operationId: 'exchange_qa_sse',
        supports: { dataKinds: ['evidence'] },
      }
  return {
    policyId: `d2-001-${szse ? 'szse' : 'sse'}-exchange-qa`,
    requirementMatch: { dataKind: 'evidence', capability: szse ? EXCHANGE_QA_SZSE_CAPABILITY : EXCHANGE_QA_SSE_CAPABILITY },
    selectionMode: 'FIRST_VALID',
    candidates: [candidate],
  }
}

export function isManagementCommunicationRequirement(requirement: DataRequirement): boolean {
  return requirement.consumer.workflow === 'management-communication-acquisition'
}
