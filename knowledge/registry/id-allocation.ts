import { createHash } from 'node:crypto'
import { canonicalSerialize } from '../storage/canonical-hash.ts'

export type KnowledgeIdNamespace = 'theme-group' | 'entity' | 'relation' | 'claim' | 'source' | 'module'

export function normalizeKnowledgeSlug(value: string): string {
  const ascii = value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase()
  return ascii || `item-${semanticHash(value).slice(0, 16)}`
}

/** Normalize text for semantic equality without deleting meaningful Unicode. */
export function normalizeSemanticText(value: string): string {
  return value.normalize('NFKC').trim().replace(/\s+/gu, ' ').toLowerCase()
}

export function semanticHash(value: unknown): string {
  const copy = stripDurableIdentity(value)
  return createHash('sha256').update(canonicalSerialize(copy)).digest('hex')
}

export function hashId(namespace: KnowledgeIdNamespace, value: unknown): string {
  return `${namespace}:${semanticHash(value).slice(0, 16)}`
}

export function allocateEntityId(type: string, name: string, discriminator?: unknown): string {
  const namespace = 'entity'
  const base = normalizeKnowledgeSlug(name)
  const typedBase = ['investment_theme', 'industry', 'company', 'product', 'technology'].includes(type) ? `${type}-${base}` : `entity-${base}`
  const semanticName = normalizeSemanticText(name)
  const hasNonAscii = /[^\u0000-\u007F]/u.test(semanticName)
  const hasAsciiSemantic = /[A-Za-z0-9]/u.test(semanticName)
  const mixedScript = hasNonAscii && hasAsciiSemantic
  const identityBase = mixedScript ? `${typedBase}-${semanticHash({ entityType: type, normalizedSemanticName: semanticName }).slice(0, 8)}` : typedBase
  if (discriminator === undefined) return `${namespace}:${identityBase}`
  return `${namespace}:${identityBase}-${semanticHash(discriminator).slice(0, 8)}`
}

export function allocateSourceId(input: { sourceUrl?: string | null; publishedAt?: string | null; title?: string | null; rawRef: string }): string {
  const identity = input.sourceUrl?.trim() ? `${normalizeUrl(input.sourceUrl)}|${input.publishedAt ?? ''}|${input.title ?? ''}` : input.rawRef
  return `source:doc-${semanticHash(identity).slice(0, 16)}`
}

export function allocateKnowledgeId(type: string, value: unknown): string {
  const namespace: KnowledgeIdNamespace = ['relation', 'module', 'claim', 'source', 'theme-group', 'entity'].includes(type) ? type as KnowledgeIdNamespace : 'claim'
  return hashId(namespace, value)
}

export function normalizeUrl(value: string): string {
  try {
    const url = new URL(value.trim())
    url.hash = ''
    return url.toString().replace(/\/$/, '')
  } catch {
    return value.trim()
  }
}

function stripDurableIdentity(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripDurableIdentity)
  if (!value || typeof value !== 'object') return value
  const result: Record<string, unknown> = {}
  for (const [key, child] of Object.entries(value)) {
    if (key === 'id' || key === 'knowledgeId' || key === 'sourceRefs' || key === 'rawRefs' || key === 'createdAt' || key === 'updatedAt') continue
    result[key] = stripDurableIdentity(child)
  }
  return result
}
