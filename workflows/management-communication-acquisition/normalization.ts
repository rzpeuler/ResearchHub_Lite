import { sha256 } from '../../plugins/research-acquisition/hash.ts'
import type { CninfoManagementCommunicationRecord } from '../../plugins/research-acquisition/management-communication.ts'
import type { ManagementCommunicationAcquisitionRequest, ExchangeQAPair, ManagementCommunicationDocument, NormalizationBatch, CommunicationProvenance, ManagementCommunicationDocumentType } from './contracts.ts'

type Row = Readonly<Record<string, unknown>>

const DOCUMENT_TYPE_TOKENS: readonly [string, ManagementCommunicationDocumentType][] = [
  ['投资者关系活动记录表', 'INVESTOR_RELATIONS_RECORD'],
  ['投资者关系活动记录', 'INVESTOR_RELATIONS_RECORD'],
  ['业绩说明会', 'EARNINGS_BRIEFING'],
]

export function normalizeCninfoDocuments(
  records: readonly CninfoManagementCommunicationRecord[],
  request: ManagementCommunicationAcquisitionRequest,
): NormalizationBatch<ManagementCommunicationDocument> {
  const diagnostics: string[] = []
  const values: ManagementCommunicationDocument[] = []
  for (const record of records) {
    const documentType = mapDocumentType(record.title)
    if (documentType === undefined) {
      diagnostics.push(`unmapped_documentType:cninfo:${record.title.slice(0, 120)}`)
      continue
    }
    const publishedAt = normalizeTimestamp(record.publishedAt)
    const retrievedAt = normalizeTimestamp(record.retrievedAt)
    if (publishedAt === undefined) {
      diagnostics.push(`invalid_publishedAt:cninfo:${record.sourceNativeId ?? record.sourceUrl}`)
      continue
    }
    if (retrievedAt === undefined) {
      diagnostics.push(`invalid_retrievedAt:cninfo:${record.sourceNativeId ?? record.sourceUrl}`)
      continue
    }
    if (isAfterAsOf(publishedAt, request.asOf)) {
      diagnostics.push(`future_publishedAt:cninfo:${record.sourceNativeId ?? record.sourceUrl}`)
      continue
    }
    if (record.content.trim() === '') {
      diagnostics.push(`empty_content:cninfo:${record.sourceNativeId ?? record.sourceUrl}`)
      continue
    }
    const source: CommunicationProvenance = {
      originPublisher: record.originPublisher ?? request.companyName ?? request.ticker,
      hostPlatform: 'CNINFO',
      retrievalProvider: 'cninfo-official-client',
      authority: 'S1_OFFICIAL',
      disclosureClass: 'OFFICIAL_IR',
      sourceUrl: record.sourceUrl,
      ...(record.sourceNativeId === undefined ? {} : { sourceNativeId: record.sourceNativeId }),
    }
    const idIdentity = record.sourceNativeId ?? `${request.ticker}|${publishedAt}|${record.title}|${record.sourceUrl}`
    values.push({
      id: `management-communication:cninfo:${sha256(idIdentity).slice(0, 32)}`,
      ticker: request.ticker,
      documentType,
      publishedAt,
      retrievedAt,
      title: record.title,
      content: record.content,
      source,
    })
  }
  return { values, diagnostics: boundedDiagnostics(diagnostics) }
}

export function normalizeEastmoneyInstitutionalResearch(
  raw: unknown,
  request: ManagementCommunicationAcquisitionRequest,
  retrievedAtValue: string,
): NormalizationBatch<ManagementCommunicationDocument> {
  const diagnostics: string[] = []
  const values: ManagementCommunicationDocument[] = []
  const retrievedAt = normalizeTimestamp(retrievedAtValue)
  if (retrievedAt === undefined) return { values: [], diagnostics: ['invalid_retrievedAt:eastmoney-institutional-research'] }
  for (const row of rows(raw)) {
    const ticker = normalizeTicker(read(row, ['代码', '股票代码', 'SECURITY_CODE', 'stockCode', 'ticker']))
    if (ticker !== request.ticker) {
      diagnostics.push(`ticker_mismatch:eastmoney-institutional-research:${ticker ?? 'missing'}`)
      continue
    }
    const publishedAt = normalizeTimestamp(read(row, ['公告日期', 'NOTICE_DATE', 'publishedAt']))
    if (publishedAt === undefined) {
      diagnostics.push(`missing_or_invalid_publishedAt:eastmoney-institutional-research:${ticker}`)
      continue
    }
    if (isAfterAsOf(publishedAt, request.asOf)) {
      diagnostics.push(`future_publishedAt:eastmoney-institutional-research:${ticker}:${publishedAt}`)
      continue
    }
    const eventDate = normalizeTimestamp(read(row, ['调研日期', 'RECEIVE_START_DATE', 'eventDate']))
    const sourceContent = stableSerialize(row)
    const title = `${text(read(row, ['名称', 'SECURITY_NAME_ABBR', 'stockName'])) ?? request.ticker} 机构调研`
    const source: CommunicationProvenance = {
      originPublisher: request.companyName ?? request.ticker,
      hostPlatform: 'EastMoney',
      retrievalProvider: 'AKShare',
      authority: 'S3_AGGREGATOR',
      disclosureClass: 'AGGREGATED_IR',
      sourceUrl: 'https://data.eastmoney.com/jgdy/xx.html',
    }
    const identity = `${request.ticker}|${publishedAt}|${eventDate ?? ''}|${sourceContent}`
    values.push({
      id: `management-communication:eastmoney:${sha256(identity).slice(0, 32)}`,
      ticker: request.ticker,
      documentType: mapDocumentType(title, 'eastmoney-institutional-research')!,
      ...(eventDate === undefined ? {} : { eventDate }),
      publishedAt,
      retrievedAt,
      title,
      content: sourceContent,
      ...optionalParticipants(row),
      source,
    })
  }
  return { values, diagnostics: boundedDiagnostics(diagnostics) }
}

export function normalizeExchangeQaRows(
  raw: unknown,
  request: ManagementCommunicationAcquisitionRequest,
  platform: ExchangeQAPair['platform'],
  retrievedAtValue: string,
): NormalizationBatch<ExchangeQAPair> {
  const diagnostics: string[] = []
  const values: ExchangeQAPair[] = []
  const retrievedAt = normalizeTimestamp(retrievedAtValue)
  if (retrievedAt === undefined) return { values: [], diagnostics: [`invalid_retrievedAt:${platform}`] }
  for (const row of rows(raw)) {
    const ticker = normalizeTicker(read(row, ['股票代码', '证券代码', '代码', 'stockCode', 'SECURITY_CODE', 'ticker']))
    if (ticker === undefined) {
      diagnostics.push(`missing_ticker:${platform}`)
      continue
    }
    if (ticker !== request.ticker) {
      diagnostics.push(`ticker_mismatch:${platform}:${ticker}`)
      continue
    }
    const question = text(read(row, ['提问', '问题', 'question', 'questionContent', 'mainContent']))
    const answer = text(read(row, ['回答', '回答内容', '答复', 'answer', 'replyContent', 'attachedContent']))
    if (question === undefined) {
      diagnostics.push(`empty_question:${platform}`)
      continue
    }
    if (answer === undefined) {
      diagnostics.push(`empty_answer:${platform}`)
      continue
    }
    const questionAtValue = read(row, ['提问时间', '问题时间', 'questionAt', 'questionDate'])
    const questionAt = questionAtValue === undefined ? undefined : normalizeTimestamp(questionAtValue)
    if (questionAtValue !== undefined && questionAt === undefined) {
      diagnostics.push(`invalid_questionAt:${platform}`)
      continue
    }
    const answeredAt = normalizeTimestamp(read(row, ['回答时间', '答复时间', '更新时间', 'answeredAt', 'replyDate', 'attachedPubDate']))
    if (answeredAt === undefined) {
      diagnostics.push(`missing_or_invalid_answeredAt:${platform}`)
      continue
    }
    const rawPublishedAt = read(row, ['publishedAt', 'publicAt', 'publicationTime', '发布时间'])
    const explicitPublishedAt = rawPublishedAt === undefined ? undefined : normalizeTimestamp(rawPublishedAt)
    if (rawPublishedAt !== undefined && explicitPublishedAt === undefined) {
      diagnostics.push(`invalid_publishedAt:${platform}`)
      continue
    }
    // These exchange endpoints expose answer/update time as the public reply time;
    // only this concrete source rule permits the deterministic equivalence.
    const publishedAt = explicitPublishedAt ?? answeredAt
    if (isAfterAsOf(publishedAt, request.asOf)) {
      diagnostics.push(`future_publishedAt:${platform}:${publishedAt}`)
      continue
    }
    const sourceNativeId = text(read(row, ['问题编号', '回答ID', 'indexId', 'attachedId', 'questionId', 'id', '序号']))
    const source: CommunicationProvenance = {
      originPublisher: request.companyName ?? request.ticker,
      hostPlatform: platform === 'SZSE_HUDONGYI' ? 'CNINFO' : 'SSE_EINTERACTION',
      retrievalProvider: 'AKShare',
      authority: 'S1_OFFICIAL',
      disclosureClass: 'EXCHANGE_INTERACTION',
      sourceUrl: sourceNativeId === undefined
        ? platform === 'SZSE_HUDONGYI' ? 'https://irm.cninfo.com.cn/' : 'https://sns.sseinfo.com/'
        : platform === 'SZSE_HUDONGYI' ? `https://irm.cninfo.com.cn/ircs/question/questionDetail?questionId=${encodeURIComponent(sourceNativeId)}` : 'https://sns.sseinfo.com/',
      ...(sourceNativeId === undefined ? {} : { sourceNativeId }),
    }
    const identity = sourceNativeId === undefined ? `${platform}|${ticker}|${publishedAt}|${question}|${answer}` : `${platform}|${sourceNativeId}`
    values.push({
      id: `exchange-qa:${platform === 'SZSE_HUDONGYI' ? 'szse' : 'sse'}:${sha256(identity).slice(0, 32)}`,
      ticker,
      question,
      ...(questionAt === undefined ? {} : { questionAt }),
      answer,
      answeredAt,
      publishedAt,
      retrievedAt,
      platform,
      source,
    })
  }
  return { values, diagnostics: boundedDiagnostics(diagnostics) }
}

export function mapDocumentType(title: string, endpoint?: 'eastmoney-institutional-research'): ManagementCommunicationDocumentType | undefined {
  if (endpoint === 'eastmoney-institutional-research') return 'INVESTOR_RELATIONS_RECORD'
  const normalized = title.normalize('NFKC').replace(/\s+/g, '')
  return DOCUMENT_TYPE_TOKENS.find(([token]) => normalized.includes(token))?.[1]
}

function optionalParticipants(row: Row): Pick<ManagementCommunicationDocument, 'participants' | 'managementParticipants'> {
  const participants = splitPeople(read(row, ['调研机构', 'RECEIVE_OBJECT', 'investigators']))
  const managementParticipants = splitPeople(read(row, ['接待人员', 'RECEPTIONIST', 'receptionist']))
  return {
    ...(participants.length === 0 ? {} : { participants }),
    ...(managementParticipants.length === 0 ? {} : { managementParticipants }),
  }
}

function rows(value: unknown): readonly Row[] {
  if (Array.isArray(value)) return value.filter(isRow)
  if (isRow(value) && Array.isArray(value.data)) return value.data.filter(isRow)
  return []
}

function isRow(value: unknown): value is Row {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function read(row: Row, aliases: readonly string[]): unknown {
  for (const alias of aliases) if (Object.prototype.hasOwnProperty.call(row, alias)) return row[alias]
  return undefined
}

function text(value: unknown): string | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  if (typeof value !== 'string') return undefined
  const normalized = value.replace(/\s+/g, ' ').trim()
  return normalized === '' ? undefined : normalized
}

function normalizeTicker(value: unknown): string | undefined {
  const valueText = text(value)
  if (valueText === undefined) return undefined
  const digits = valueText.replace(/\.0+$/, '')
  return /^\d{6}$/.test(digits) ? digits : undefined
}

function normalizeTimestamp(value: unknown): string | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return normalizeEpoch(value)
  const raw = text(value)
  if (raw === undefined) return undefined
  if (/^\d{10,13}$/.test(raw)) return normalizeEpoch(Number(raw))
  const chinese = /^(\d{4})[年/-](\d{1,2})[月/-](\d{1,2})日?(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/.exec(raw)
  if (chinese) {
    const iso = new Date(Date.UTC(Number(chinese[1]), Number(chinese[2]) - 1, Number(chinese[3]), Number(chinese[4] ?? 0), Number(chinese[5] ?? 0), Number(chinese[6] ?? 0)))
    return Number.isNaN(iso.getTime()) ? undefined : iso.toISOString()
  }
  const parsed = Date.parse(raw)
  return Number.isNaN(parsed) ? undefined : new Date(parsed).toISOString()
}

function normalizeEpoch(value: number): string | undefined {
  const date = new Date(Math.abs(value) < 1_000_000_000_000 ? value * 1_000 : value)
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString()
}

function isAfterAsOf(publishedAt: string, asOf: string): boolean {
  const published = Date.parse(publishedAt)
  const cutoff = Date.parse(asOf)
  return Number.isNaN(published) || Number.isNaN(cutoff) || published > cutoff
}

function splitPeople(value: unknown): readonly string[] {
  const source = text(value)
  if (source === undefined) return []
  return [...new Set(source.split(/[;,，；、]/).map((item) => item.trim()).filter(Boolean))].sort((left, right) => left.localeCompare(right))
}

function boundedDiagnostics(values: readonly string[]): readonly string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right)).slice(0, 64)
}

function stableSerialize(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(',')}]`
  if (typeof value === 'object' && value !== null) {
    return `{${Object.keys(value as Row).sort().map((key) => `${JSON.stringify(key)}:${stableSerialize((value as Row)[key])}`).join(',')}}`
  }
  return JSON.stringify(value)
}
