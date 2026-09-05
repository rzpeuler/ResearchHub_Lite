import { normalizeSemanticText } from '../../knowledge/registry/id-allocation.ts'
import type { EntityCandidate } from './contracts.ts'

export interface CompanyIdentityDiagnostic {
  readonly code: 'invalid_semantics'
  readonly message: string
}

export interface CompanyIdentityNormalizationResult {
  readonly candidate: EntityCandidate
  readonly diagnostics: readonly CompanyIdentityDiagnostic[]
}

const COMPANY_FIELDS = ['ticker', 'exchange', 'legalName'] as const
const EXCHANGE_ALIASES: Readonly<Record<string, string>> = {
  SH: 'SH',
  SSE: 'SH',
  SZ: 'SZ',
  SZSE: 'SZ',
  BJ: 'BJ',
  BSE: 'BJ',
  NQ: 'NQ',
  NEEQ: 'NQ',
}
const PARENTHESIZED_SECURITY_SUFFIX = /^(?<base>.+?)\s*[（(]\s*(?<ticker>\d{3,8})\.(?<exchange>[A-Za-z]{2,6})\s*[）)]\s*$/u
const BARE_SECURITY_SUFFIX = /^(?<base>.+?)\s+(?<ticker>\d{3,8})\.(?<exchange>[A-Za-z]{2,6})\s*$/u
const TRAILING_PARENTHESES = /^(?<base>.+?)\s*[（(](?<label>[^（）()]*)[）)]\s*$/u
const ASCII_ALIAS = /^[\x20-\x7E]*[A-Za-z][\x20-\x7E]*$/u

function clean(value: string): string { return value.trim().replace(/\s+/gu, ' ') }
function normalized(value: string): string { return normalizeSemanticText(value) }
function exchange(value: string): string { const upper = clean(value).toLocaleUpperCase('en-US'); return EXCHANGE_ALIASES[upper] ?? upper }
function isCompanyField(value: string): value is typeof COMPANY_FIELDS[number] { return (COMPANY_FIELDS as readonly string[]).includes(value) }
function fieldValue(value: unknown, field: string, diagnostics: CompanyIdentityDiagnostic[]): string | undefined {
  if (value === undefined || value === null) return undefined
  if (typeof value !== 'string') {
    diagnostics.push({ code: 'invalid_semantics', message: `Company semanticFields.${field} must be a string or null` })
    return undefined
  }
  const result = clean(value)
  return result === '' ? undefined : result
}
function aliases(candidate: EntityCandidate, name: string, additional: string | undefined): string[] | undefined {
  const values = [...(candidate.aliases ?? []), ...(additional === undefined ? [] : [additional])]
    .map(clean)
    .filter(Boolean)
  const result = [...new Map(values.map((value) => [normalized(value), value])).values()]
    .filter((value) => normalized(value) !== normalized(name))
    .sort((left, right) => normalized(left).localeCompare(normalized(right)) || left.localeCompare(right))
  if (candidate.aliases === undefined && result.length === 0) return undefined
  return result
}

export function normalizeExchange(value: string): string { return exchange(value) }

export function normalizeCompanyCandidateIdentity(candidate: EntityCandidate, allowedSemanticFields: readonly string[] = COMPANY_FIELDS): CompanyIdentityNormalizationResult {
  if (candidate.entityType !== 'company') {
    const keys = Object.keys(candidate.semanticFields ?? {})
    const unsupported = keys[0]
    if (unsupported !== undefined) return { candidate, diagnostics: [{ code: 'invalid_semantics', message: `Entity type ${candidate.entityType} does not allow semanticFields.${unsupported}` }] }
    return { candidate, diagnostics: [] }
  }

  const diagnostics: CompanyIdentityDiagnostic[] = []
  const rawFields = candidate.semanticFields ?? {}
  const unsupported = Object.keys(rawFields).find((key) => !allowedSemanticFields.includes(key) || !isCompanyField(key))
  if (unsupported !== undefined) diagnostics.push({ code: 'invalid_semantics', message: `Company semanticFields contains unsupported field ${unsupported}` })

  const ticker = fieldValue(rawFields.ticker, 'ticker', diagnostics)
  const suppliedExchange = fieldValue(rawFields.exchange, 'exchange', diagnostics)
  const legalName = fieldValue(rawFields.legalName, 'legalName', diagnostics)
  const normalizedTicker = ticker
  const normalizedExchange = suppliedExchange === undefined ? undefined : exchange(suppliedExchange)

  let name = clean(candidate.name)
  let bilingualAlias: string | undefined
  const security = PARENTHESIZED_SECURITY_SUFFIX.exec(name) ?? BARE_SECURITY_SUFFIX.exec(name)
  if (security?.groups?.base !== undefined && security.groups.ticker !== undefined && security.groups.exchange !== undefined) {
    const parsedTicker = security.groups.ticker
    const parsedExchange = exchange(security.groups.exchange)
    if (normalizedTicker !== undefined && normalizedTicker !== parsedTicker) diagnostics.push({ code: 'invalid_semantics', message: `Company ticker disagrees with trailing securities decoration: ${normalizedTicker} vs ${parsedTicker}` })
    if (normalizedExchange !== undefined && normalizedExchange !== parsedExchange) diagnostics.push({ code: 'invalid_semantics', message: `Company exchange disagrees with trailing securities decoration: ${normalizedExchange} vs ${parsedExchange}` })
    name = clean(security.groups.base)
    const normalizedFields: Record<string, string> = { ticker: parsedTicker, exchange: parsedExchange }
    if (legalName !== undefined) normalizedFields.legalName = legalName
    const result: EntityCandidate = { ...candidate, name, ...(aliases(candidate, name, undefined) === undefined ? {} : { aliases: aliases(candidate, name, undefined) }), semanticFields: normalizedFields }
    return { candidate: result, diagnostics }
  }

  const parentheses = TRAILING_PARENTHESES.exec(name)
  if (parentheses?.groups?.base !== undefined && parentheses.groups.label !== undefined) {
    const label = clean(parentheses.groups.label)
    if (ASCII_ALIAS.test(label)) { name = clean(parentheses.groups.base); bilingualAlias = label }
  }
  const normalizedFields: Record<string, string> = {}
  if (normalizedTicker !== undefined) normalizedFields.ticker = normalizedTicker
  if (normalizedExchange !== undefined) normalizedFields.exchange = normalizedExchange
  if (legalName !== undefined) normalizedFields.legalName = legalName
  const aliasValues = aliases(candidate, name, bilingualAlias)
  const result: EntityCandidate = { ...candidate, name, ...(aliasValues === undefined ? {} : { aliases: aliasValues }), ...(Object.keys(normalizedFields).length === 0 ? {} : { semanticFields: normalizedFields }) }
  return { candidate: result, diagnostics }
}

export function companySemanticFieldNames(): readonly string[] { return COMPANY_FIELDS }
