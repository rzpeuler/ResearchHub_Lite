import { KnowledgeError } from '../storage/errors.ts'
import type {
  KnowledgeEntityV03,
  KnowledgeRelationV03,
  KnowledgeClaimV03,
  KnowledgeModuleV03,
  KnowledgeSourceV03,
  KnowledgeThemeGroupV03,
  EntityTypeV03,
  RelationTypeV03,
  ClaimTypeV03,
} from '../schema/domain.ts'
import type { KnowledgeAssetCollectionV03 } from '../storage/v03-types.ts'
import type { KnowledgeAssetCollectionV04 } from '../storage/v04-types.ts'
import type { KnowledgeAssetV04, KnowledgeClaimV04, KnowledgeEventV04, KnowledgeObservationV04, KnowledgeThesisV04 } from '../schema/domain-v04.ts'

export class KnowledgeIndexV03 {
  readonly themeGroups = new Map<string, KnowledgeThemeGroupV03>()
  readonly entities = new Map<string, KnowledgeEntityV03>()
  readonly relations = new Map<string, KnowledgeRelationV03>()
  readonly claims = new Map<string, KnowledgeClaimV03>()
  readonly modules = new Map<string, KnowledgeModuleV03>()
  readonly sources = new Map<string, KnowledgeSourceV03>()
  readonly registry = new Map<string, string>()

  private readonly relationsByEntity = new Map<string, KnowledgeRelationV03[]>()
  private readonly claimsBySubject = new Map<string, KnowledgeClaimV03[]>()

  static fromAssets(assets: KnowledgeAssetCollectionV03): KnowledgeIndexV03 {
    const index = new KnowledgeIndexV03()
    for (const asset of assets.themeGroups) index.add(index.themeGroups, asset.value.id, asset.value, asset.filePath)
    for (const asset of assets.entities) index.add(index.entities, asset.value.id, asset.value, asset.filePath)
    for (const asset of assets.relations) {
      index.add(index.relations, asset.value.id, asset.value, asset.filePath)
      index.reverse(index.relationsByEntity, asset.value.sourceRef, asset.value)
      index.reverse(index.relationsByEntity, asset.value.targetRef, asset.value)
    }
    for (const asset of assets.claims) {
      index.add(index.claims, asset.value.id, asset.value, asset.filePath)
      for (const subjectRef of asset.value.subjectRefs) index.reverse(index.claimsBySubject, subjectRef, asset.value)
    }
    for (const asset of assets.modules) index.add(index.modules, asset.value.id, asset.value, asset.filePath)
    for (const asset of assets.sources) index.add(index.sources, asset.value.id, asset.value, asset.filePath)
    for (const entry of assets.registry) index.registry.set(entry.id, entry.storageRef)
    return index
  }

  getThemeGroup(ref: string): KnowledgeThemeGroupV03 {
    const value = this.themeGroups.get(ref)
    if (!value) throw new KnowledgeError('NotFound', `ThemeGroup not found: ${ref}`)
    return value
  }

  getEntity(ref: string): KnowledgeEntityV03 {
    const value = this.entities.get(ref)
    if (!value) throw new KnowledgeError('NotFound', `Entity not found: ${ref}`)
    return value
  }

  searchEntities(query: string, type?: EntityTypeV03): KnowledgeEntityV03[] {
    const normalized = query.trim().toLocaleLowerCase()
    return [...this.entities.values()]
      .filter((entity) => type === undefined || entity.type === type)
      .filter((entity) => normalized === '' || [entity.id, entity.name, ...(entity.aliases ?? [])].join(' ').toLocaleLowerCase().includes(normalized))
      .sort((left, right) => left.id.localeCompare(right.id))
  }

  getRelations(ref: string, type?: RelationTypeV03): KnowledgeRelationV03[] {
    if (!this.entities.has(ref)) throw new KnowledgeError('NotFound', `Entity not found: ${ref}`)
    return (this.relationsByEntity.get(ref) ?? []).filter((relation) => type === undefined || relation.type === type).sort((left, right) => left.id.localeCompare(right.id))
  }

  getClaims(subjectRef: string, type?: ClaimTypeV03): KnowledgeClaimV03[] {
    if (!this.entities.has(subjectRef) && !this.relations.has(subjectRef)) throw new KnowledgeError('NotFound', `Knowledge subject not found: ${subjectRef}`)
    return (this.claimsBySubject.get(subjectRef) ?? []).filter((claim) => type === undefined || claim.claimType === type).sort((left, right) => left.id.localeCompare(right.id))
  }

  getSource(ref: string): KnowledgeSourceV03 {
    const value = this.sources.get(ref)
    if (!value) throw new KnowledgeError('NotFound', `Source not found: ${ref}`)
    return value
  }

  getSourcesFor(ref: string): KnowledgeSourceV03[] {
    const value = this.entities.get(ref) ?? this.relations.get(ref) ?? this.claims.get(ref) ?? this.modules.get(ref)
    if (!value) throw new KnowledgeError('NotFound', `Knowledge item not found: ${ref}`)
    const sourceRefs = 'sourceRefs' in value && Array.isArray(value.sourceRefs) ? value.sourceRefs : []
    return sourceRefs.map((sourceRef) => this.sources.get(sourceRef)).filter((source): source is KnowledgeSourceV03 => source !== undefined).sort((left, right) => left.id.localeCompare(right.id))
  }

  private add<T>(map: Map<string, T>, id: string, value: T, filePath: string): void {
    if (map.has(id)) throw new KnowledgeError('SchemaError', `Duplicate Knowledge ID: ${id}`, filePath)
    map.set(id, value)
  }

  private reverse<T>(map: Map<string, T[]>, key: string, value: T): void {
    const values = map.get(key) ?? []
    values.push(value)
    map.set(key, values)
  }
}

export type KnowledgeQueryKindV04 = 'theme_group' | 'entity' | 'relation' | 'claim' | 'source' | 'module' | 'event' | 'observation' | 'thesis' | 'reasoning_edge'

/** Bounded read model for Schema 0.4; it never mutates canonical Knowledge. */
export class KnowledgeIndexV04 {
  readonly objects = new Map<string, KnowledgeAssetV04>()
  readonly byKind = new Map<KnowledgeQueryKindV04, KnowledgeAssetV04[]>()
  private readonly reverseRefs = new Map<string, string[]>()

  static fromAssets(assets: KnowledgeAssetCollectionV04): KnowledgeIndexV04 {
    const index = new KnowledgeIndexV04()
    for (const loaded of assets.objects) { index.objects.set(loaded.value.id, loaded.value); const kind = loaded.kind as KnowledgeQueryKindV04; index.byKind.set(kind, [...(index.byKind.get(kind) ?? []), loaded.value]); for (const ref of referencedRefs(loaded.value)) index.reverseRefs.set(ref, [...(index.reverseRefs.get(ref) ?? []), loaded.value.id]) }
    for (const values of index.byKind.values()) values.sort((left, right) => left.id.localeCompare(right.id))
    return index
  }

  get(ref: string): KnowledgeAssetV04 { const value = this.objects.get(ref); if (!value) throw new KnowledgeError('NotFound', `Knowledge item not found: ${ref}`); return value }
  search(query: string, kind?: KnowledgeQueryKindV04): KnowledgeAssetV04[] { const needle = query.trim().toLocaleLowerCase(); const values = kind === undefined ? [...this.objects.values()] : [...(this.byKind.get(kind) ?? [])]; return values.filter((value) => needle === '' || JSON.stringify(value).toLocaleLowerCase().includes(needle)).sort((left, right) => left.id.localeCompare(right.id)) }
  getBySubject(subjectRef: string, kind?: KnowledgeQueryKindV04): KnowledgeAssetV04[] { const values = this.search('', kind).filter((value) => subjectRefs(value).includes(subjectRef)); return values }
  getReferences(ref: string): KnowledgeAssetV04[] { return (this.reverseRefs.get(ref) ?? []).map((id) => this.objects.get(id)).filter((value): value is KnowledgeAssetV04 => value !== undefined).sort((left, right) => left.id.localeCompare(right.id)) }
  traverseReferences(ref: string, depth = 1): KnowledgeAssetV04[] { const visited = new Set<string>([ref]); let frontier = [ref]; for (let level = 0; level < Math.max(0, Math.min(depth, 4)); level += 1) { const next = frontier.flatMap((item) => referencedRefs(this.get(item))).filter((item) => !visited.has(item)); next.forEach((item) => visited.add(item)); frontier = next } return [...visited].filter((item) => item !== ref).map((item) => this.objects.get(item)).filter((value): value is KnowledgeAssetV04 => value !== undefined).sort((left, right) => left.id.localeCompare(right.id)) }
  getKnowledgeAsOf(asOf: string): KnowledgeAssetV04[] { if (Number.isNaN(Date.parse(asOf))) throw new KnowledgeError('SchemaError', `Invalid asOf timestamp: ${asOf}`); const timestamp = Date.parse(asOf); return [...this.objects.values()].filter((value) => { const lifecycle = (value as unknown as { lifecycle?: { validFrom?: string | null; validUntil?: string | null; status?: string } }).lifecycle; const validFrom = lifecycle?.validFrom ? Date.parse(lifecycle.validFrom) : Number.NEGATIVE_INFINITY; const validUntil = lifecycle?.validUntil ? Date.parse(lifecycle.validUntil) : Number.POSITIVE_INFINITY; if (timestamp < validFrom || timestamp > validUntil) return false; const temporal = temporalFields(value); return temporal.length === 0 || temporal.some((item) => Date.parse(item) <= timestamp) }).sort((left, right) => left.id.localeCompare(right.id)) }
}

function subjectRefs(value: KnowledgeAssetV04): string[] { if (value.id.startsWith('event:')) return (value as KnowledgeEventV04).subjectRefs; if (value.id.startsWith('observation:')) return [(value as KnowledgeObservationV04).subjectRef]; if (value.id.startsWith('thesis:')) return (value as KnowledgeThesisV04).subjectRefs; if (value.id.startsWith('claim:')) return (value as KnowledgeClaimV04).subjectRefs; return [] }
function referencedRefs(value: KnowledgeAssetV04): string[] { const raw = value as unknown as Record<string, unknown>; const refs: string[] = []; for (const key of ['sourceRef', 'targetRef', 'subjectRef', 'institutionRef', 'analystRef', 'revisionOf']) if (typeof raw[key] === 'string') refs.push(raw[key] as string); for (const key of ['sourceRefs', 'subjectRefs', 'participantRefs', 'contributingObservationRefs', 'supportsClaimRefs', 'dependsOnClaimRefs', 'contradictsClaimRefs']) if (Array.isArray(raw[key])) refs.push(...raw[key].filter((item): item is string => typeof item === 'string')); return [...new Set(refs)] }
function temporalFields(value: KnowledgeAssetV04): string[] { const raw = value as unknown as Record<string, unknown>; const temporal = raw.temporal; const values = temporal && typeof temporal === 'object' && !Array.isArray(temporal) ? Object.values(temporal as Record<string, unknown>) : []; for (const key of ['asOf', 'publishedAt', 'reportedAt', 'observedAt', 'recordedAt', 'createdAt', 'updatedAt']) if (typeof raw[key] === 'string') values.push(raw[key]); return values.filter((item): item is string => typeof item === 'string' && !Number.isNaN(Date.parse(item))) }
