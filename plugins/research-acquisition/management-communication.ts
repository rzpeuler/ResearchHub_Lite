import type { ResearchCompanyIdentity } from './contracts.ts'
import { CninfoOfficialDisclosureClient, type OfficialDisclosureRecord } from './official.ts'
import type { AkshareDataClient, AkshareInstitutionalResearchRequest } from './akshare.ts'

export interface CninfoManagementCommunicationRecord {
  readonly ticker: string
  readonly title: string
  readonly publishedAt: string
  readonly retrievedAt: string
  readonly content: string
  readonly sourceUrl: string
  readonly sourceNativeId?: string
  readonly originPublisher?: string
}

export interface ManagementCommunicationSourceRequest {
  readonly company: ResearchCompanyIdentity
  readonly asOf: string
  readonly lookbackStartDate: string
}

export function createManagementCommunicationSourceOperations(
  cninfo: CninfoOfficialDisclosureClient,
  akshare: AkshareDataClient,
  now: () => string = () => new Date().toISOString(),
) {
  return {
    async cninfoIr(request: ManagementCommunicationSourceRequest): Promise<readonly CninfoManagementCommunicationRecord[]> {
      const records = (await cninfo.list({ company: request.company, asOf: request.asOf, limitPerKind: 20 }))
        .filter((record) => isBoundedCommunicationTitle(record.title))
      const result: CninfoManagementCommunicationRecord[] = []
      for (const record of records) {
        const document = cninfo.fetchDocument ? await cninfo.fetchDocument(record) : { content: await cninfo.fetch(record), bytes: new TextEncoder().encode(record.content ?? ''), mediaType: 'text/plain' }
        result.push({
          ticker: request.company.symbol,
          title: record.title,
          publishedAt: record.publishedAt,
          retrievedAt: now(),
          content: document.content,
          sourceUrl: record.url,
          ...(cninfoNativeId(record) === undefined ? {} : { sourceNativeId: cninfoNativeId(record) }),
          ...(record.issuer === undefined ? {} : { originPublisher: record.issuer }),
        })
      }
      return result
    },

    async exchangeQaSzse(request: ManagementCommunicationSourceRequest): Promise<unknown> {
      if (akshare.exchangeQaSzse === undefined) throw new Error('AKSHARE_SZSE_QA_OPERATION_UNAVAILABLE')
      return akshare.exchangeQaSzse({ symbol: request.company.symbol })
    },

    async exchangeQaSzseAnswer(questionId: string): Promise<unknown> {
      if (akshare.exchangeQaSzseAnswer === undefined) throw new Error('AKSHARE_SZSE_QA_ANSWER_OPERATION_UNAVAILABLE')
      return akshare.exchangeQaSzseAnswer({ symbol: questionId })
    },

    async exchangeQaSse(request: ManagementCommunicationSourceRequest): Promise<unknown> {
      if (akshare.exchangeQaSse === undefined) throw new Error('AKSHARE_SSE_QA_OPERATION_UNAVAILABLE')
      return akshare.exchangeQaSse({ symbol: request.company.symbol })
    },

    async eastmoneyInstitutionalResearch(request: ManagementCommunicationSourceRequest): Promise<unknown> {
      if (akshare.institutionalResearchDetail === undefined) throw new Error('AKSHARE_EASTMONEY_INSTITUTIONAL_RESEARCH_OPERATION_UNAVAILABLE')
      const input: AkshareInstitutionalResearchRequest = { date: request.lookbackStartDate.replaceAll('-', '') }
      return akshare.institutionalResearchDetail(input)
    },
  }
}

function isBoundedCommunicationTitle(title: string): boolean {
  const normalized = title.normalize('NFKC').replace(/\s+/g, '')
  return normalized.includes('投资者关系活动记录') || normalized.includes('业绩说明会')
}

function cninfoNativeId(record: OfficialDisclosureRecord): string | undefined {
  const match = /\/([^/?#]+?)(?:\.html?|\.pdf)?$/i.exec(record.url)
  return match?.[1] === undefined || match[1] === '' ? undefined : match[1]
}
