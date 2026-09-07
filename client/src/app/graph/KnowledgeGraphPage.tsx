import { Component, Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import type { ReactElement, ReactNode } from 'react'
import { Background, Controls, Handle, MiniMap, Panel, Position, ReactFlow } from '@xyflow/react'
import type { Edge, Node, NodeProps } from '@xyflow/react'
import { graphlib, layout } from '@dagrejs/dagre'
import { RuntimeClient, RuntimeClientError, type KnowledgeDirectoryProjection, type KnowledgeGraphEdge, type KnowledgeGraphEntityType, type KnowledgeGraphNode, type KnowledgeGraphProjection, type KnowledgeObjectResponse } from '../../api/runtime-client'
import '@xyflow/react/dist/style.css'

const entityTypes: readonly KnowledgeGraphEntityType[] = ['investment_theme', 'industry', 'company', 'product', 'technology']
const entityLabels: Readonly<Record<KnowledgeGraphEntityType, string>> = { investment_theme: 'Theme', industry: 'Industry', company: 'Company', product: 'Product', technology: 'Technology' }
type Selection = { readonly kind: 'node' | 'edge'; readonly ref: string } | undefined
type GraphNodeData = { readonly label: string; readonly secondaryLabel?: string; readonly entityType: KnowledgeGraphEntityType; readonly isRoot: boolean }
type FlowNode = Node<GraphNodeData, 'knowledge'>

class GraphErrorBoundary extends Component<{ readonly children: ReactNode }, { readonly message?: string }> {
  state: { readonly message?: string } = {}
  static getDerivedStateFromError(error: unknown): { readonly message: string } { return { message: error instanceof Error ? error.message : 'Unknown graph canvas error' } }
  render(): ReactNode { return this.state.message ? <div className="graph-empty-canvas"><strong>Graph canvas unavailable</strong><p>{this.state.message}</p></div> : this.props.children }
}

function queryState(): { readonly root?: string; readonly depth: 1 | 2 } {
  const params = new URLSearchParams(window.location.search)
  const depth = params.get('depth') === '2' ? 2 : 1
  const root = params.get('root') ?? undefined
  return { ...(root ? { root } : {}), depth }
}

function writeQuery(root: string | undefined, depth: 1 | 2): void {
  const params = new URLSearchParams()
  if (root) params.set('root', root)
  if (depth === 2) params.set('depth', '2')
  const query = params.toString()
  window.history.pushState({}, '', `/graph${query ? `?${query}` : ''}`)
}

function layoutGraph(nodes: readonly KnowledgeGraphNode[], edges: readonly KnowledgeGraphEdge[]): FlowNode[] {
  const graph = new graphlib.Graph({ multigraph: true }).setDefaultEdgeLabel(() => ({}))
  graph.setGraph({ rankdir: 'LR', nodesep: 32, ranksep: 90, marginx: 30, marginy: 30 })
  const width = 190
  const height = 74
  for (const node of nodes) graph.setNode(node.ref, { width, height })
  for (const edge of edges) graph.setEdge(edge.sourceRef, edge.targetRef, { width: 1, height: 1 }, edge.ref)
  layout(graph)
  return nodes.map((node) => {
    const position = graph.node(node.ref) as { readonly x: number; readonly y: number }
    return { id: node.ref, type: 'knowledge', position: { x: position.x - width / 2, y: position.y - height / 2 }, data: { label: node.label, ...(node.secondaryLabel ? { secondaryLabel: node.secondaryLabel } : {}), entityType: node.entityType, isRoot: node.isRoot } }
  })
}

function KnowledgeNode({ data }: NodeProps<FlowNode>): ReactElement {
  return <div className={`knowledge-flow-node ${data.isRoot ? 'root' : ''}`}><Handle type="target" position={Position.Left} className="graph-handle" /><span className="graph-node-type">{entityLabels[data.entityType]}</span><strong>{data.label}</strong>{data.secondaryLabel ? <small>{data.secondaryLabel}</small> : null}<Handle type="source" position={Position.Right} className="graph-handle" /></div>
}

const nodeTypes = { knowledge: KnowledgeNode }

function errorText(error: unknown): string { return error instanceof RuntimeClientError ? error.message : 'ResearchHub runtime operation failed' }
function displayRelationType(value: string): string { return value.replaceAll('_', ' ') }
function prettyJson(value: unknown): string { try { return JSON.stringify(value, null, 2).slice(0, 5000) } catch { return '[unavailable]' } }
type JsonRecord = Record<string, unknown>
function record(value: unknown): JsonRecord | undefined { return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as JsonRecord : undefined }
function textValue(value: unknown): string | undefined { return typeof value === 'string' && value.trim() !== '' ? value : undefined }
function stringList(value: unknown): string[] { return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item.trim() !== '') : [] }
function fieldRows(value: JsonRecord | undefined, fields: readonly string[]): readonly [string, string][] { return fields.flatMap((field) => { const item = textValue(value?.[field]); return item ? [[field, item] as const] : [] }) }
function truncationLabel(count: number, total: number | undefined, truncated: boolean | undefined, label: string): string { return truncated && total !== undefined ? `Showing ${count} of ${total} ${label}` : `${count} ${label}` }

function RelationCard({ value }: { readonly value: unknown }): ReactElement {
  const relation = record(value)
  const attributes = relation?.attributes
  const confidence = textValue(relation?.confidence) ?? (typeof relation?.confidence === 'number' ? String(relation.confidence) : undefined)
  const asOf = textValue(relation?.asOf)
  return <article className="graph-evidence-card"><strong>{displayRelationType(textValue(relation?.type) ?? 'relation')}</strong><dl className="graph-evidence-meta"><dt>Source</dt><dd>{textValue(relation?.sourceRef) ?? 'Unavailable'}</dd><dt>Target</dt><dd>{textValue(relation?.targetRef) ?? 'Unavailable'}</dd>{confidence ? <><dt>Confidence</dt><dd>{confidence}</dd></> : null}{asOf ? <><dt>As of</dt><dd>{asOf}</dd></> : null}</dl>{attributes !== undefined ? <div className="graph-evidence-attributes"><span>Attributes</span><pre>{prettyJson(attributes).slice(0, 900)}</pre></div> : null}</article>
}

function ClaimCard({ value }: { readonly value: unknown }): ReactElement {
  const claim = record(value)
  const temporal = record(claim?.temporal)
  const asOf = textValue(temporal?.asOf)
  return <article className="graph-evidence-card"><strong>{textValue(claim?.claimType) ?? 'Claim'}</strong>{textValue(claim?.statement) ? <p className="graph-evidence-statement">{claim?.statement as string}</p> : null}<dl className="graph-evidence-meta">{asOf ? <><dt>As of</dt><dd>{asOf}</dd></> : null}{typeof claim?.confidence === 'number' ? <><dt>Confidence</dt><dd>{claim.confidence}</dd></> : null}</dl></article>
}

function safeExternalUrl(value: unknown): string | undefined { const candidate = textValue(value); if (!candidate) return undefined; try { const url = new URL(candidate); return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : undefined } catch { return undefined } }
function SourceCard({ value }: { readonly value: unknown }): ReactElement {
  const source = record(value)
  const url = safeExternalUrl(source?.url)
  return <article className="graph-evidence-card"><strong>{textValue(source?.title) ?? 'Untitled source'}</strong><dl className="graph-evidence-meta">{textValue(source?.sourceType ?? source?.type) ? <><dt>Type</dt><dd>{textValue(source?.sourceType ?? source?.type)}</dd></> : null}{textValue(source?.publisher ?? source?.institution) ? <><dt>Publisher</dt><dd>{textValue(source?.publisher ?? source?.institution)}</dd></> : null}{textValue(source?.publishedAt) ? <><dt>Published</dt><dd>{textValue(source?.publishedAt)}</dd></> : null}</dl>{url ? <a className="graph-evidence-link" href={url} target="_blank" rel="noreferrer noopener">Open source</a> : null}</article>
}

function Directory({ directory, query, setQuery, onSearch, onFocus }: { readonly directory?: KnowledgeDirectoryProjection; readonly query: string; readonly setQuery: (value: string) => void; readonly onSearch: () => void; readonly onFocus: (ref: string) => void }): ReactElement {
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(() => new Set())
  useEffect(() => { setExpandedGroups(new Set(directory?.themeGroups.map((group) => group.ref) ?? [])) }, [directory])
  const section = (title: string, items: readonly { readonly ref: string; readonly name: string }[], total: number, truncated: boolean): ReactElement => <section className="graph-directory-section"><div className="graph-directory-title"><span>{title}</span><small>{total}{truncated ? '+' : ''}</small></div>{items.map((item) => <button className="graph-directory-item" key={item.ref} onClick={() => onFocus(item.ref)}><span>{item.name}</span><small>{item.ref}</small></button>)}</section>
  return <aside className="graph-directory" aria-label="Knowledge Directory"><div className="graph-panel-heading"><div><span className="eyebrow">BROWSE KNOWLEDGE</span><h2>Directory</h2></div></div><form className="graph-search" onSubmit={(event) => { event.preventDefault(); onSearch() }}><input aria-label="Search Knowledge" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search canonical Knowledge" /><button type="submit" aria-label="Search">⌕</button></form>{directory ? <div className="graph-directory-scroll">{directory.themeGroups.map((group) => { const expanded = expandedGroups.has(group.ref); const contentId = `theme-group-${group.ref.replaceAll(/[^a-zA-Z0-9_-]/g, '-')}`; return <section className="graph-directory-section" key={group.ref}><button type="button" className="graph-directory-title graph-directory-toggle" aria-expanded={expanded} aria-controls={contentId} onClick={() => setExpandedGroups((current) => { const next = new Set(current); if (next.has(group.ref)) next.delete(group.ref); else next.add(group.ref); return next })}><span><span aria-hidden="true">{expanded ? '▾' : '▸'}</span> {group.name}</span><small>ThemeGroup</small></button><div id={contentId} hidden={!expanded}>{group.themes.map((item) => <button className="graph-directory-item" key={item.ref} onClick={() => onFocus(item.ref)}><span>{item.name}</span><small>{item.ref}</small></button>)}{group.themes.length === 0 ? <p className="graph-directory-empty">No active themes</p> : null}</div></section> })}{section('Industries', directory.industries.items, directory.industries.total, directory.industries.truncated)}{section('Companies', directory.companies.items, directory.companies.total, directory.companies.truncated)}{section('Products', directory.products.items, directory.products.total, directory.products.truncated)}{section('Technologies', directory.technologies.items, directory.technologies.total, directory.technologies.truncated)}</div> : <p className="muted">Loading Directory…</p>}</aside>
}

function Filters({ projection, visibleTypes, setVisibleTypes, visibleRelations, setVisibleRelations }: { readonly projection?: KnowledgeGraphProjection; readonly visibleTypes: ReadonlySet<KnowledgeGraphEntityType>; readonly setVisibleTypes: (next: Set<KnowledgeGraphEntityType>) => void; readonly visibleRelations: ReadonlySet<string>; readonly setVisibleRelations: (next: Set<string>) => void }): ReactElement {
  const relationTypes = [...new Set((projection?.edges ?? []).map((edge) => edge.relationType))].sort((left, right) => left.localeCompare(right))
  const toggleType = (type: KnowledgeGraphEntityType): void => { const next = new Set(visibleTypes); if (next.has(type)) next.delete(type); else next.add(type); setVisibleTypes(next) }
  const toggleRelation = (type: string): void => { const next = new Set(visibleRelations); if (next.has(type)) next.delete(type); else next.add(type); setVisibleRelations(next) }
  return <div className="graph-filters"><span className="eyebrow">VIEW FILTERS</span><strong>Entity types</strong>{entityTypes.map((type) => <label key={type}><input type="checkbox" checked={visibleTypes.has(type)} onChange={() => toggleType(type)} />{entityLabels[type]}</label>)}{relationTypes.length > 0 ? <><strong>Relations</strong>{relationTypes.map((type) => <label key={type}><input type="checkbox" checked={visibleRelations.has(type)} onChange={() => toggleRelation(type)} />{displayRelationType(type)}</label>)}</> : null}</div>
}

export function KnowledgeInspector({ selection, projection, client, onFocus }: { readonly selection: Selection; readonly projection?: KnowledgeGraphProjection; readonly client: RuntimeClient; readonly onFocus: (ref: string) => void }): ReactElement {
  const selectedNode = selection?.kind === 'node' ? projection?.nodes.find((node) => node.ref === selection.ref) : undefined
  const selectedEdge = selection?.kind === 'edge' ? projection?.edges.find((edge) => edge.ref === selection.ref) : undefined
  const [detail, setDetail] = useState<KnowledgeObjectResponse>()
  const [error, setError] = useState('')
  useEffect(() => {
    const ref = selection?.ref
    if (!ref) { setDetail(undefined); setError(''); return }
    let cancelled = false
    setDetail(undefined); setError('')
    void client.getKnowledgeObject(ref).then((value) => { if (!cancelled) setDetail(value) }).catch((caught) => { if (!cancelled) setError(errorText(caught)) })
    return () => { cancelled = true }
  }, [client, selection?.ref])
  const object = record(detail?.object)
  const relationItems = detail ? selectedEdge ? [detail.object] : detail.relatedRelations ?? [] : []
  const claimItems = detail?.relatedClaims ?? []
  const sourceItems = detail?.supportingSources ?? []
  const relationTruncation = detail?.truncation?.relations
  const claimTruncation = detail?.truncation?.claims
  const sourceTruncation = detail?.truncation?.sources
  const provenanceItems = claimItems.flatMap((item) => { const claim = record(item); return Array.isArray(claim?.provenance) ? claim.provenance : [] })
  const objectProvenance = Array.isArray(object?.provenance) ? object.provenance : []
  const allProvenance = [...objectProvenance, ...provenanceItems]
  const entityRows = fieldRows(object, ['name', 'type', 'description', 'definition', 'legalName', 'ticker', 'exchange'])
  const aliases = stringList(object?.aliases)
  return <aside className="graph-inspector" aria-label="Knowledge Inspector"><div className="graph-panel-heading"><div><span className="eyebrow">CANONICAL DETAIL</span><h2>Inspector</h2></div><span className="read-only-badge">Read-only</span></div>{selectedNode ? <><span className="graph-inspector-type">{entityLabels[selectedNode.entityType]}</span><h3>{textValue(object?.name) ?? selectedNode.label}</h3><p className="graph-ref">{selectedNode.ref}</p><dl className="graph-meta"><dt>Lifecycle</dt><dd>{textValue(record(object?.lifecycle)?.status) ?? selectedNode.lifecycleStatus}</dd><dt>Context</dt><dd>{projection?.profile.replace('_', ' ')}</dd></dl><button className="secondary-action full" onClick={() => onFocus(selectedNode.ref)}>Focus this node</button></> : selectedEdge ? <><span className="graph-inspector-type">Relation</span><h3>{displayRelationType(textValue(object?.type) ?? selectedEdge.relationType)}</h3><p className="graph-ref">{selectedEdge.ref}</p><dl className="graph-meta"><dt>Source</dt><dd>{textValue(object?.sourceRef) ?? selectedEdge.sourceRef}</dd><dt>Target</dt><dd>{textValue(object?.targetRef) ?? selectedEdge.targetRef}</dd></dl></> : <div className="notice"><strong>Select a node or edge</strong><p>Canonical detail and evidence appear here. Claims and Sources remain Inspector-only.</p></div>}{selection ? <div className="graph-detail-result">{error ? <div className="inline-error">{error}</div> : detail ? <><span className="eyebrow">BOUNDED CANONICAL VIEW</span>{selectedNode ? <section className="graph-detail-section"><h4>Entity fields</h4><dl className="graph-meta">{entityRows.map(([field, value]) => <Fragment key={field}><dt>{field}</dt><dd>{value}</dd></Fragment>)}{aliases.length > 0 ? <><dt>Aliases</dt><dd>{aliases.join(', ')}</dd></> : null}</dl></section> : <section className="graph-detail-section"><h4>Relation detail</h4><RelationCard value={{ ...object, sourceRef: object?.sourceRef ?? selectedEdge?.sourceRef, targetRef: object?.targetRef ?? selectedEdge?.targetRef, type: object?.type ?? selectedEdge?.relationType }} /></section>}<section className="graph-detail-section"><h4>Relations</h4><p className="graph-section-summary">{truncationLabel(relationItems.length, relationTruncation?.total, relationTruncation?.truncated, 'relations')}</p>{relationItems.length > 0 ? relationItems.map((item, index) => <RelationCard key={textValue(record(item)?.id) ?? String(index)} value={item} />) : <p className="muted">No related relations in the bounded view.</p>}</section><section className="graph-detail-section"><h4>Claims</h4><p className="graph-section-summary">{truncationLabel(claimItems.length, claimTruncation?.total, claimTruncation?.truncated, 'claims')}</p>{claimItems.length > 0 ? claimItems.map((item, index) => <ClaimCard key={textValue(record(item)?.id) ?? String(index)} value={item} />) : <p className="muted">No related claims in the bounded view.</p>}</section><section className="graph-detail-section"><h4>Sources</h4><p className="graph-section-summary">{truncationLabel(sourceItems.length, sourceTruncation?.total, sourceTruncation?.truncated, 'sources')}</p>{sourceItems.length > 0 ? sourceItems.map((item, index) => <SourceCard key={textValue(record(item)?.id) ?? String(index)} value={item} />) : <p className="muted">No supporting sources in the bounded view.</p>}</section><section className="graph-detail-section"><h4>Provenance</h4>{allProvenance.length > 0 ? allProvenance.map((item, index) => { const provenance = record(item); return <dl className="graph-evidence-meta" key={String(index)}>{(['sourceRef', 'rawRef', 'locator', 'chunkRef'] as const).map((field) => textValue(provenance?.[field]) ? <Fragment key={field}><dt>{field}</dt><dd>{textValue(provenance?.[field])}</dd></Fragment> : null)}</dl> }) : <p className="muted">No provenance fields available.</p>}</section><details className="graph-raw-detail"><summary>Canonical object (debug)</summary><pre>{prettyJson(detail.object)}</pre></details></> : <p className="muted">Loading canonical detail…</p>}</div> : null}</aside>
}

export function KnowledgeGraphPage({ knowledgeBase, client }: { readonly knowledgeBase?: { readonly knowledgeBaseId: string }; readonly client: RuntimeClient }): ReactElement {
  const initial = useMemo(queryState, [])
  const [root, setRoot] = useState<string | undefined>(initial.root)
  const [depth, setDepth] = useState<1 | 2>(initial.depth)
  const [directory, setDirectory] = useState<KnowledgeDirectoryProjection>()
  const [projection, setProjection] = useState<KnowledgeGraphProjection>()
  const [query, setQuery] = useState('')
  const [searchResults, setSearchResults] = useState<readonly { readonly ref: string; readonly kind: string; readonly semanticType?: string; readonly displayName?: string }[]>([])
  const [selection, setSelection] = useState<Selection>()
  const [loadError, setLoadError] = useState('')
  const [busy, setBusy] = useState(false)
  const [visibleTypes, setVisibleTypes] = useState<Set<KnowledgeGraphEntityType>>(() => new Set(entityTypes))
  const [visibleRelations, setVisibleRelations] = useState<Set<string>>(() => new Set())

  useEffect(() => { const onPopState = (): void => { const state = queryState(); setRoot(state.root); setDepth(state.depth); setSelection(undefined) }; window.addEventListener('popstate', onPopState); return () => window.removeEventListener('popstate', onPopState) }, [])
  useEffect(() => { if (!knowledgeBase) return; let cancelled = false; setLoadError(''); void client.getKnowledgeDirectory().then((value) => { if (!cancelled) setDirectory(value) }).catch((caught) => { if (!cancelled) setLoadError(errorText(caught)) }); return () => { cancelled = true } }, [client, knowledgeBase])
  useEffect(() => {
    if (!knowledgeBase || !root) { setProjection(undefined); return }
    let cancelled = false
    setBusy(true); setLoadError('')
    void client.getKnowledgeGraph({ rootRef: root, depth }).then((value) => { if (!cancelled) { setProjection(value); setVisibleRelations(new Set(value.edges.map((edge) => edge.relationType))) } }).catch((caught) => { if (!cancelled) { setProjection(undefined); setLoadError(errorText(caught)) } }).finally(() => { if (!cancelled) setBusy(false) })
    return () => { cancelled = true }
  }, [client, depth, knowledgeBase, root])
  const focus = useCallback((ref: string): void => { setRoot(ref); setSelection(undefined); writeQuery(ref, depth) }, [depth])
  const updateDepth = (next: 1 | 2): void => { setDepth(next); writeQuery(root, next) }
  const search = (): void => {
    const value = query.trim()
    if (!value) { setSearchResults([]); return }
    void client.searchKnowledge(value).then((result) => {
      const supported = result.results.filter((item) => entityTypes.includes(item.semanticType as KnowledgeGraphEntityType)).map((item) => ({ ref: item.ref, kind: item.kind, ...(item.semanticType ? { semanticType: item.semanticType } : {}), ...(item.displayName ? { displayName: item.displayName } : {}) }))
      setSearchResults(supported)
    }).catch((caught) => setLoadError(errorText(caught)))
  }
  const visible = useMemo(() => {
    if (!projection) return { nodes: [] as FlowNode[], edges: [] as Edge[] }
    const nodeMap = new Map(projection.nodes.map((node) => [node.ref, node]))
    const graphNodes = projection.nodes.filter((node) => node.isRoot || visibleTypes.has(node.entityType))
    const graphEdges = projection.edges.filter((edge) => visibleRelations.has(edge.relationType) && nodeMap.has(edge.sourceRef) && nodeMap.has(edge.targetRef) && (nodeMap.get(edge.sourceRef)!.isRoot || visibleTypes.has(nodeMap.get(edge.sourceRef)!.entityType)) && (nodeMap.get(edge.targetRef)!.isRoot || visibleTypes.has(nodeMap.get(edge.targetRef)!.entityType)))
    return { nodes: layoutGraph(graphNodes, graphEdges), edges: graphEdges.map((edge) => ({ id: edge.ref, source: edge.sourceRef, target: edge.targetRef, label: edge.label, animated: false, style: { stroke: '#5a8580' }, labelStyle: { fill: '#8aa9a5', fontSize: 10 }, labelBgStyle: { fill: '#121e25', fillOpacity: .9, color: '#121e25' } })) }
  }, [projection, visibleRelations, visibleTypes])
  if (!knowledgeBase) return <main className="page-frame graph-page"><span className="eyebrow">KNOWLEDGE SURFACE</span><h1 id="graph-title">Knowledge Graph</h1><p>Explore canonical Themes, Industries, Companies, Products, Technologies and their relationships.</p><div className="notice graph-empty-state"><strong>No Knowledge Base mounted</strong><p>Mount a canonical Knowledge Base to browse the Directory and explore a rooted graph.</p></div></main>
  return <main className="graph-page-shell" aria-labelledby="graph-title"><header className="graph-page-header"><div><span className="eyebrow">KNOWLEDGE SURFACE</span><h1 id="graph-title">Knowledge Graph</h1><p>Read-only projection of active canonical Knowledge.</p></div><div className="graph-toolbar"><span className="eyebrow">DEPTH</span><button className={depth === 1 ? 'selected' : ''} onClick={() => updateDepth(1)}>1 hop</button><button className={depth === 2 ? 'selected' : ''} onClick={() => updateDepth(2)}>2 hops</button></div></header><div className="graph-layout"><Directory directory={directory} query={query} setQuery={setQuery} onSearch={search} onFocus={focus} /><section className="graph-workspace" aria-label="Knowledge Graph canvas">{searchResults.length > 0 ? <div className="graph-search-results"><span className="eyebrow">SEARCH RESULTS</span>{searchResults.map((item) => <button key={item.ref} onClick={() => { focus(item.ref); setSearchResults([]) }}><strong>{item.displayName ?? item.ref}</strong><small>{item.semanticType ?? item.kind}</small></button>)}</div> : null}{loadError ? <div className="inline-error graph-error">{loadError}</div> : null}{busy ? <div className="graph-overlay">Loading projection…</div> : null}{projection ? <GraphErrorBoundary><ReactFlow nodes={visible.nodes} edges={visible.edges} nodeTypes={nodeTypes} nodesConnectable={false} nodesDraggable={true} deleteKeyCode={null} onNodeClick={(_, node) => setSelection({ kind: 'node', ref: node.id })} onNodeDoubleClick={(_, node) => focus(node.id)} onEdgeClick={(_, edge) => setSelection({ kind: 'edge', ref: edge.id })} fitView fitViewOptions={{ padding: .2 }} minZoom={.2} maxZoom={2.2}><Background color="#29404b" gap={24} /><Controls showInteractive={false} /><MiniMap nodeColor={(node) => (node.data as GraphNodeData).isRoot ? '#72d2c4' : '#3d6562'} pannable zoomable /><Panel position="top-left" className="graph-canvas-note">{projection.nodes.length} nodes · {projection.edges.length} relations{projection.truncated ? ' · bounded' : ''}</Panel></ReactFlow></GraphErrorBoundary> : <div className="graph-empty-canvas"><strong>{root ? 'Projection unavailable' : 'Select a root to explore'}</strong><p>{root ? 'The selected root could not produce a graph projection.' : 'Select a Theme, Industry, Company, Product or Technology to explore.'}</p></div>}</section><div className="graph-right-column"><Filters projection={projection} visibleTypes={visibleTypes} setVisibleTypes={setVisibleTypes} visibleRelations={visibleRelations} setVisibleRelations={setVisibleRelations} /><KnowledgeInspector selection={selection} projection={projection} client={client} onFocus={focus} /></div></div></main>
}
