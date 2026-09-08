import { KnowledgeIndexV03 } from '../../knowledge/query/index.ts'
import type { KnowledgeClaimV03, KnowledgeEntityV03, KnowledgeModuleV03, KnowledgeRelationV03, KnowledgeSourceV03, KnowledgeThemeGroupV03 } from '../../knowledge/schema/domain.ts'
import { KnowledgeBaseRegistry } from '../../knowledge/registry/registry.ts'
import { KnowledgeBaseLoaderV03 } from '../../knowledge/storage/loader.ts'
import { readCanonicalV04Assets } from '../../knowledge/storage/canonical-v04-loader.ts'
import type { KnowledgeAssetCollectionV03 } from '../../knowledge/storage/v03-types.ts'
import { ApplicationServiceError, type ApplicationKnowledgeKind, type ApplicationKnowledgeSearchResult, type KnowledgeBaseStatusView, type KnowledgeObjectView, type KnowledgeSearchInput, type KnowledgeSearchResult, type ApplicationLimit } from './contracts.ts'

const DEFAULT_SEARCH_LIMIT = 20
const HARD_SEARCH_LIMIT = 50
const DEFAULT_RELATED_LIMIT = 20
const HARD_RELATED_LIMIT = 20
type Asset = KnowledgeThemeGroupV03 | KnowledgeEntityV03 | KnowledgeRelationV03 | KnowledgeClaimV03 | KnowledgeSourceV03 | KnowledgeModuleV03

function limitOf(value: number | undefined, fallback: number, hard: number): number {
  if (value === undefined) return fallback
  if (!Number.isInteger(value) || value < 1) throw new ApplicationServiceError('invalid_input', `limit must be an integer between 1 and ${hard}`)
  return Math.min(value, hard)
}
function bounded<T>(items: readonly T[], limit: number): { readonly items: readonly T[]; readonly metadata: ApplicationLimit } {
  return { items: items.slice(0, limit), metadata: { limit, total: items.length, truncated: items.length > limit } }
}
function kindFor(ref: string): ApplicationKnowledgeKind | undefined {
  for (const [prefix, kind] of [['theme-group:', 'ThemeGroup'], ['entity:', 'Entity'], ['relation:', 'Relation'], ['claim:', 'Claim'], ['source:', 'Source'], ['module:', 'Module']] as const) if (ref.startsWith(prefix)) return kind
  return undefined
}
function mapName(kind: ApplicationKnowledgeKind, value: Asset): string | undefined {
  if (kind === 'ThemeGroup') return (value as KnowledgeThemeGroupV03).name
  if (kind === 'Entity') return (value as KnowledgeEntityV03).name
  if (kind === 'Source') return (value as KnowledgeSourceV03).title
  return undefined
}
function mapType(kind: ApplicationKnowledgeKind, value: Asset): string | undefined {
  if (kind === 'Entity') return (value as KnowledgeEntityV03).type
  if (kind === 'Relation') return (value as KnowledgeRelationV03).type
  if (kind === 'Claim') return (value as KnowledgeClaimV03).claimType
  if (kind === 'Source') return (value as KnowledgeSourceV03).sourceType
  if (kind === 'Module') return (value as KnowledgeModuleV03).type
  return undefined
}
function resultFor(kind: ApplicationKnowledgeKind, value: Asset): ApplicationKnowledgeSearchResult {
  const ref = value.id
  const semanticType = mapType(kind, value)
  const displayName = mapName(kind, value)
  let summary = displayName
  if (kind === 'Relation') { const relation = value as KnowledgeRelationV03; summary = `${relation.type}: ${relation.sourceRef} -> ${relation.targetRef}` }
  if (kind === 'Claim') summary = (value as KnowledgeClaimV03).statement
  if (kind === 'Module') summary = (value as KnowledgeModuleV03).type
  return { ref, kind, ...(semanticType === undefined ? {} : { semanticType }), ...(displayName === undefined ? {} : { displayName }), ...(summary === undefined ? {} : { summary: summary.slice(0, 240) }) }
}
function sourcesFor(index: KnowledgeIndexV03, refs: readonly string[] | undefined): KnowledgeSourceV03[] {
  return (refs ?? []).map((sourceRef) => index.sources.get(sourceRef as never)).filter((source): source is KnowledgeSourceV03 => source !== undefined)
}

export class KnowledgeService {
  private readonly registry = new KnowledgeBaseRegistry()
  private readonly loader = new KnowledgeBaseLoaderV03(this.registry)
  constructor(private readonly mountedKnowledgeBaseRoot?: string) {}

  private async index(): Promise<{ readonly handle: Awaited<ReturnType<KnowledgeBaseRegistry['mount']>>; readonly index: KnowledgeIndexV03 }> {
    if (!this.mountedKnowledgeBaseRoot) throw new ApplicationServiceError('no_kb_mounted', 'No canonical Knowledge Base is mounted')
    try {
      const handle = await this.registry.mount(this.mountedKnowledgeBaseRoot)
      if (handle.schemaVersion === '0.4') { const assets = await readCanonicalV04Assets(handle.rootRef); const projected = { rootDir: assets.rootDir, themeGroups: assets.objects.filter((item) => item.kind === 'theme_group').map((item) => ({ kind: item.kind, value: item.value, filePath: item.filePath, storageRef: item.storageRef })), entities: assets.objects.filter((item) => item.kind === 'entity').map((item) => ({ kind: item.kind, value: item.value, filePath: item.filePath, storageRef: item.storageRef })), relations: assets.objects.filter((item) => item.kind === 'relation').map((item) => ({ kind: item.kind, value: item.value, filePath: item.filePath, storageRef: item.storageRef })), claims: assets.objects.filter((item) => item.kind === 'claim').map((item) => ({ kind: item.kind, value: item.value, filePath: item.filePath, storageRef: item.storageRef })), modules: assets.objects.filter((item) => item.kind === 'module').map((item) => ({ kind: item.kind, value: item.value, filePath: item.filePath, storageRef: item.storageRef })), sources: assets.objects.filter((item) => item.kind === 'source').map((item) => ({ kind: item.kind, value: item.value, filePath: item.filePath, storageRef: item.storageRef })), registry: assets.registry }; return { handle, index: KnowledgeIndexV03.fromAssets(projected as unknown as KnowledgeAssetCollectionV03) } }
      return { handle, index: KnowledgeIndexV03.fromAssets(await this.loader.readAssets(handle)) }
    } catch (error) {
      if (error instanceof ApplicationServiceError) throw error
      throw new ApplicationServiceError('failed', 'Unable to load the mounted Knowledge Base', { cause: error })
    }
  }

  async status(): Promise<KnowledgeBaseStatusView> {
    const { handle, index } = await this.index()
    return {
      knowledgeBaseId: handle.knowledgeBaseId,
      rootRef: handle.rootRef,
      revision: handle.revision,
      status: handle.status,
      schemaVersion: handle.schemaVersion,
      storageFormatVersion: handle.storageFormatVersion,
      counts: { themeGroups: index.themeGroups.size, entities: index.entities.size, relations: index.relations.size, claims: index.claims.size, sources: index.sources.size, modules: index.modules.size },
    }
  }

  async searchKnowledge(input: KnowledgeSearchInput): Promise<KnowledgeSearchResult> {
    if (!input || typeof input.query !== 'string') throw new ApplicationServiceError('invalid_input', 'query is required')
    const limit = limitOf(input.limit, DEFAULT_SEARCH_LIMIT, HARD_SEARCH_LIMIT)
    const { index } = await this.index()
    const query = input.query.trim()
    const exact = query === '' ? undefined : [index.themeGroups, index.entities, index.relations, index.claims, index.sources, index.modules].find((map) => map.has(query))
    let matches: ApplicationKnowledgeSearchResult[]
    if (exact !== undefined) {
      const value = exact.get(query) as Asset
      const kind = kindFor(query)!
      matches = kind === 'Entity' && input.entityType !== undefined && (value as KnowledgeEntityV03).type !== input.entityType ? [] : [resultFor(kind, value)]
    } else {
      matches = [...index.entities.values()]
        .filter((entity) => input.entityType === undefined || entity.type === input.entityType)
        .filter((entity) => query === '' || [entity.id, entity.name, ...(entity.aliases ?? [])].join(' ').toLocaleLowerCase().includes(query.toLocaleLowerCase()))
        .sort((left, right) => left.id.localeCompare(right.id))
        .map((value) => resultFor('Entity', value))
    }
    const result = bounded(matches, limit)
    return { results: result.items, total: result.metadata.total, limit, truncated: result.metadata.truncated }
  }

  async getKnowledgeObject(ref: string, relatedLimit?: number): Promise<KnowledgeObjectView> {
    if (typeof ref !== 'string' || ref.trim() === '') throw new ApplicationServiceError('invalid_input', 'ref is required')
    const limit = limitOf(relatedLimit, DEFAULT_RELATED_LIMIT, HARD_RELATED_LIMIT)
    const { index } = await this.index()
    const kind = kindFor(ref)
    if (!kind) throw new ApplicationServiceError('not_found', `Knowledge object not found: ${ref}`)
    const value = this.value(index, kind, ref)
    if (value === undefined) throw new ApplicationServiceError('not_found', `Knowledge object not found: ${ref}`)
    const relatedRelations: KnowledgeRelationV03[] = []
    const relatedClaims: KnowledgeClaimV03[] = []
    const supportingSources: KnowledgeSourceV03[] = []
    const relatedEntities: KnowledgeEntityV03[] = []
    if (kind === 'Entity') {
      relatedRelations.push(...index.getRelations(ref))
      relatedClaims.push(...index.getClaims(ref))
      for (const relation of relatedRelations) { relatedEntities.push(index.entities.get(relation.sourceRef)!, index.entities.get(relation.targetRef)!); supportingSources.push(...sourcesFor(index, relation.sourceRefs)) }
      for (const claim of relatedClaims) supportingSources.push(...sourcesFor(index, claim.sourceRefs))
      supportingSources.push(...index.getSourcesFor(ref))
    } else if (kind === 'Relation') {
      relatedClaims.push(...index.getClaims(ref)); supportingSources.push(...sourcesFor(index, (value as KnowledgeRelationV03).sourceRefs))
      for (const claim of relatedClaims) supportingSources.push(...sourcesFor(index, claim.sourceRefs))
      relatedEntities.push(...[(value as KnowledgeRelationV03).sourceRef, (value as KnowledgeRelationV03).targetRef].map((entityRef) => index.entities.get(entityRef)).filter((entity): entity is KnowledgeEntityV03 => entity !== undefined))
    } else if (kind === 'Claim') {
      const claim = value as KnowledgeClaimV03
      supportingSources.push(...sourcesFor(index, claim.sourceRefs))
      for (const subjectRef of claim.subjectRefs) { const entity = index.entities.get(subjectRef); if (entity) relatedEntities.push(entity) }
    } else if (kind === 'Module') {
      const module = value as KnowledgeModuleV03
      supportingSources.push(...sourcesFor(index, module.sourceRefs))
      if (module.targetEntity) { const entity = index.entities.get(module.targetEntity); if (entity) relatedEntities.push(entity) }
    } else if (kind === 'ThemeGroup') {
      for (const entity of index.entities.values()) if (entity.type === 'investment_theme' && entity.themeGroupRef === ref) relatedEntities.push(entity)
    } else if (kind === 'Source') {
      for (const relation of index.relations.values()) if ((relation.sourceRefs ?? []).includes(ref as never)) relatedRelations.push(relation)
      for (const claim of index.claims.values()) if (claim.sourceRefs.includes(ref as never)) relatedClaims.push(claim)
    }
    const relationBound = bounded(uniqueById(relatedRelations), limit)
    const claimBound = bounded(uniqueById(relatedClaims), limit)
    const sourceBound = bounded(uniqueById(supportingSources), limit)
    const entityBound = bounded(uniqueById(relatedEntities), limit)
    return {
      ref, kind, object: value,
      ...(relationBound.items.length > 0 ? { relatedRelations: relationBound.items } : {}),
      ...(claimBound.items.length > 0 ? { relatedClaims: claimBound.items } : {}),
      ...(sourceBound.items.length > 0 ? { supportingSources: sourceBound.items } : {}),
      ...(entityBound.items.length > 0 ? { relatedEntities: entityBound.items } : {}),
      truncation: { relations: relationBound.metadata, claims: claimBound.metadata, sources: sourceBound.metadata, entities: entityBound.metadata },
    }
  }

  private value(index: KnowledgeIndexV03, kind: ApplicationKnowledgeKind, ref: string): Asset | undefined {
    if (kind === 'ThemeGroup') return index.themeGroups.get(ref)
    if (kind === 'Entity') return index.entities.get(ref)
    if (kind === 'Relation') return index.relations.get(ref)
    if (kind === 'Claim') return index.claims.get(ref)
    if (kind === 'Source') return index.sources.get(ref)
    return index.modules.get(ref)
  }
}

function uniqueById<T extends { readonly id: string }>(items: readonly T[]): T[] { return [...new Map(items.map((item) => [item.id, item])).values()].sort((left, right) => left.id.localeCompare(right.id)) }

export { DEFAULT_SEARCH_LIMIT, HARD_SEARCH_LIMIT, DEFAULT_RELATED_LIMIT, HARD_RELATED_LIMIT }
