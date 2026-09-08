import { KnowledgeIndexV03 } from '../../knowledge/query/index.ts'
import type { KnowledgeEntityV03, KnowledgeRelationV03, RelationTypeV03 } from '../../knowledge/schema/domain.ts'
import { KnowledgeBaseRegistry } from '../../knowledge/registry/registry.ts'
import { KnowledgeBaseLoaderV03 } from '../../knowledge/storage/loader.ts'
import { readCanonicalV04Assets } from '../../knowledge/storage/canonical-v04-loader.ts'
import type { KnowledgeAssetCollectionV03 } from '../../knowledge/storage/v03-types.ts'
import { ApplicationServiceError, type KnowledgeDirectoryProjection, type KnowledgeDirectorySection, type KnowledgeGraphEdge, type KnowledgeGraphEntityType, type KnowledgeGraphNode, type KnowledgeGraphProfile, type KnowledgeGraphProjection, type KnowledgeGraphProjectionInput } from './contracts.ts'

export const GRAPH_DEFAULT_NODE_LIMIT = 60
export const GRAPH_HARD_NODE_LIMIT = 150
export const GRAPH_DEFAULT_EDGE_LIMIT = 120
export const GRAPH_HARD_EDGE_LIMIT = 300
export const DIRECTORY_DEFAULT_LIMIT = 30
export const DIRECTORY_HARD_LIMIT = 100

const GRAPH_ENTITY_TYPES = new Set<KnowledgeGraphEntityType>(['investment_theme', 'industry', 'company', 'product', 'technology'])
const PROFILE_BY_ENTITY: Readonly<Record<KnowledgeGraphEntityType, KnowledgeGraphProfile>> = {
  investment_theme: 'theme_context', industry: 'industry_context', company: 'company_context', product: 'product_context', technology: 'technology_context',
}
const PROFILE_RELATIONS: Readonly<Record<KnowledgeGraphProfile, ReadonlySet<RelationTypeV03>>> = {
  theme_context: new Set(['theme_exposure', 'business_exposure', 'upstream_of']),
  industry_context: new Set(['upstream_of', 'business_exposure', 'theme_exposure', 'belongs_to_industry', 'component_of', 'applied_in', 'depends_on', 'substitutes_for']),
  company_context: new Set(['business_exposure', 'offers_product', 'develops_technology', 'uses_technology', 'supplier_of', 'competes_with', 'owns_stake_in', 'upstream_of', 'theme_exposure']),
  product_context: new Set(['offers_product', 'component_of', 'applied_in', 'depends_on', 'substitutes_for', 'upstream_of']),
  technology_context: new Set(['develops_technology', 'uses_technology', 'applied_in', 'depends_on', 'component_of', 'substitutes_for', 'upstream_of']),
}

function boundedLimit(value: number | undefined, fallback: number, hard: number, name: string): number {
  if (value === undefined) return fallback
  if (!Number.isSafeInteger(value) || value < 1) throw new ApplicationServiceError('invalid_input', `${name} must be an integer between 1 and ${hard}`)
  return Math.min(value, hard)
}

function active(value: { readonly lifecycle?: { readonly status?: string } }): boolean {
  return value.lifecycle?.status === 'active'
}

function entityType(value: KnowledgeEntityV03): KnowledgeGraphEntityType | undefined {
  return GRAPH_ENTITY_TYPES.has(value.type as KnowledgeGraphEntityType) ? value.type as KnowledgeGraphEntityType : undefined
}

function secondaryLabel(value: KnowledgeEntityV03): string | undefined {
  if (value.type !== 'company') return undefined
  const details = [value.ticker, value.exchange].filter((item): item is string => typeof item === 'string' && item.trim() !== '')
  return details.length > 0 ? details.join(' · ') : undefined
}

function uniqueSorted<T extends { readonly id: string }>(items: Iterable<T>): T[] {
  return [...new Map([...items].map((item) => [item.id, item])).values()].sort((left, right) => left.id.localeCompare(right.id))
}

export class KnowledgeGraphService {
  private readonly registry = new KnowledgeBaseRegistry()
  private readonly loader = new KnowledgeBaseLoaderV03(this.registry)

  constructor(private readonly mountedKnowledgeBaseRoot?: string) {}

  private async loadIndex(): Promise<KnowledgeIndexV03> {
    if (!this.mountedKnowledgeBaseRoot) throw new ApplicationServiceError('no_kb_mounted', 'No canonical Knowledge Base is mounted')
    try {
      const handle = await this.registry.mount(this.mountedKnowledgeBaseRoot)
      if (handle.schemaVersion === '0.4') { const assets = await readCanonicalV04Assets(handle.rootRef); const projected = { rootDir: assets.rootDir, themeGroups: assets.objects.filter((item) => item.kind === 'theme_group').map((item) => ({ kind: item.kind, value: item.value, filePath: item.filePath, storageRef: item.storageRef })), entities: assets.objects.filter((item) => item.kind === 'entity').map((item) => ({ kind: item.kind, value: item.value, filePath: item.filePath, storageRef: item.storageRef })), relations: assets.objects.filter((item) => item.kind === 'relation').map((item) => ({ kind: item.kind, value: item.value, filePath: item.filePath, storageRef: item.storageRef })), claims: assets.objects.filter((item) => item.kind === 'claim').map((item) => ({ kind: item.kind, value: item.value, filePath: item.filePath, storageRef: item.storageRef })), modules: assets.objects.filter((item) => item.kind === 'module').map((item) => ({ kind: item.kind, value: item.value, filePath: item.filePath, storageRef: item.storageRef })), sources: assets.objects.filter((item) => item.kind === 'source').map((item) => ({ kind: item.kind, value: item.value, filePath: item.filePath, storageRef: item.storageRef })), registry: assets.registry }; return KnowledgeIndexV03.fromAssets(projected as unknown as KnowledgeAssetCollectionV03) }
      return KnowledgeIndexV03.fromAssets(await this.loader.readAssets(handle))
    } catch (error) {
      if (error instanceof ApplicationServiceError) throw error
      throw new ApplicationServiceError('failed', 'Unable to load the mounted Knowledge Base', { cause: error })
    }
  }

  async getDirectoryProjection(limit?: number): Promise<KnowledgeDirectoryProjection> {
    const sectionLimit = boundedLimit(limit, DIRECTORY_DEFAULT_LIMIT, DIRECTORY_HARD_LIMIT, 'limit')
    const index = await this.loadIndex()
    const activeEntities = [...index.entities.values()].filter(active).filter((value) => entityType(value) !== undefined).sort((left, right) => left.id.localeCompare(right.id))
    const section = (type: Exclude<KnowledgeGraphEntityType, 'investment_theme'>): KnowledgeDirectorySection => {
      const values = activeEntities.filter((value) => value.type === type)
      return { items: values.slice(0, sectionLimit).map((value) => ({ ref: value.id, name: value.name })), total: values.length, limit: sectionLimit, truncated: values.length > sectionLimit }
    }
    const groups = uniqueSorted([...index.themeGroups.values()].filter(active)).map((group) => ({
      ref: group.id,
      name: group.name,
      themes: activeEntities.filter((value) => value.type === 'investment_theme' && value.themeGroupRef === group.id).map((value) => ({ ref: value.id, name: value.name })),
    }))
    return { themeGroups: groups, industries: section('industry'), companies: section('company'), products: section('product'), technologies: section('technology') }
  }

  async getGraphProjection(input: KnowledgeGraphProjectionInput): Promise<KnowledgeGraphProjection> {
    if (!input || typeof input.rootRef !== 'string' || input.rootRef.trim() === '') throw new ApplicationServiceError('invalid_input', 'rootRef is required')
    const depth = input.depth ?? 1
    if (depth !== 1 && depth !== 2) throw new ApplicationServiceError('invalid_input', 'depth must be 1 or 2')
    const nodeLimit = boundedLimit(input.maxNodes, GRAPH_DEFAULT_NODE_LIMIT, GRAPH_HARD_NODE_LIMIT, 'maxNodes')
    const edgeLimit = boundedLimit(input.maxEdges, GRAPH_DEFAULT_EDGE_LIMIT, GRAPH_HARD_EDGE_LIMIT, 'maxEdges')
    const index = await this.loadIndex()
    const root = index.entities.get(input.rootRef)
    const rootType = root === undefined ? undefined : entityType(root)
    if (!root || !rootType) {
      const knownCanonicalRef = index.themeGroups.has(input.rootRef) || index.relations.has(input.rootRef) || index.claims.has(input.rootRef) || index.sources.has(input.rootRef) || index.modules.has(input.rootRef)
      if (root === undefined && !knownCanonicalRef) throw new ApplicationServiceError('not_found', `Knowledge graph root not found: ${input.rootRef}`)
      throw new ApplicationServiceError('invalid_input', 'Graph root must be a supported canonical Entity')
    }
    if (!active(root)) throw new ApplicationServiceError('not_found', `Knowledge graph root not found: ${input.rootRef}`)
    const profile = PROFILE_BY_ENTITY[rootType]
    const allowedRelations = PROFILE_RELATIONS[profile]
    const entities: Map<string, KnowledgeEntityV03> = new Map([...index.entities.values()].filter((value) => active(value) && entityType(value) !== undefined).map((value) => [value.id, value]))
    const relations = uniqueSorted([...index.relations.values()].filter((value) => active(value) && allowedRelations.has(value.type) && entities.has(value.sourceRef) && entities.has(value.targetRef)))
    const byEntity = new Map<string, KnowledgeRelationV03[]>()
    for (const relation of relations) {
      for (const ref of [relation.sourceRef, relation.targetRef]) byEntity.set(ref, [...(byEntity.get(ref) ?? []), relation])
    }
    const distance = new Map<string, number>([[root.id, 0]])
    let frontier: string[] = [root.id]
    for (let hop = 1; hop <= depth; hop += 1) {
      const next: string[] = []
      for (const ref of frontier.sort((left, right) => left.localeCompare(right))) {
        for (const relation of (byEntity.get(ref) ?? []).sort((left, right) => left.id.localeCompare(right.id))) {
          const neighbor = relation.sourceRef === ref ? relation.targetRef : relation.sourceRef
          if (!distance.has(neighbor)) { distance.set(neighbor, hop); next.push(neighbor) }
        }
      }
      frontier = next
    }
    const allNodes = [...distance.entries()].sort((left, right) => (left[1] - right[1]) || left[0].localeCompare(right[0]))
    const selectedRefs = new Set(allNodes.slice(0, nodeLimit).map(([ref]) => ref))
    selectedRefs.add(root.id)
    const nodeOrder = [...selectedRefs].sort((left, right) => {
      if (left === root.id) return -1
      if (right === root.id) return 1
      return ((distance.get(left) ?? depth + 1) - (distance.get(right) ?? depth + 1)) || left.localeCompare(right)
    })
    const edgePriority = (relation: KnowledgeRelationV03): number => {
      if (relation.sourceRef === root.id || relation.targetRef === root.id) return 1
      const sourceDistance = distance.get(relation.sourceRef) ?? 99
      const targetDistance = distance.get(relation.targetRef) ?? 99
      if (sourceDistance === 1 && targetDistance === 1) return 2
      return Math.max(sourceDistance, targetDistance) <= 2 ? 4 : 5
    }
    const eligibleEdges = relations.filter((relation) => distance.has(relation.sourceRef) && distance.has(relation.targetRef)).sort((left, right) => {
      const leftPriority = edgePriority(left)
      const rightPriority = edgePriority(right)
      return leftPriority - rightPriority || left.id.localeCompare(right.id)
    })
    const edges = eligibleEdges.filter((relation) => selectedRefs.has(relation.sourceRef) && selectedRefs.has(relation.targetRef)).slice(0, edgeLimit)
    const nodes: KnowledgeGraphNode[] = nodeOrder.map((ref) => {
      const value = entities.get(ref)!
      return { ref, entityType: entityType(value)!, label: value.name, ...(secondaryLabel(value) ? { secondaryLabel: secondaryLabel(value) } : {}), lifecycleStatus: value.lifecycle.status, isRoot: ref === root.id }
    })
    const graphEdges: KnowledgeGraphEdge[] = edges.map((relation) => ({ ref: relation.id, relationType: relation.type, sourceRef: relation.sourceRef, targetRef: relation.targetRef, label: relation.type.replaceAll('_', ' ') }))
    return { rootRef: root.id, profile, depth, nodes, edges: graphEdges, nodeTotal: allNodes.length, edgeTotal: eligibleEdges.length, nodeLimit, edgeLimit, truncated: allNodes.length > nodeLimit || eligibleEdges.length > edgeLimit }
  }
}
