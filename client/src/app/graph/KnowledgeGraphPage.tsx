import { Component, useCallback, useEffect, useMemo, useState } from 'react'
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

function Directory({ directory, query, setQuery, onSearch, onFocus }: { readonly directory?: KnowledgeDirectoryProjection; readonly query: string; readonly setQuery: (value: string) => void; readonly onSearch: () => void; readonly onFocus: (ref: string) => void }): ReactElement {
  const section = (title: string, items: readonly { readonly ref: string; readonly name: string }[], total: number, truncated: boolean): ReactElement => <section className="graph-directory-section"><div className="graph-directory-title"><span>{title}</span><small>{total}{truncated ? '+' : ''}</small></div>{items.map((item) => <button className="graph-directory-item" key={item.ref} onClick={() => onFocus(item.ref)}><span>{item.name}</span><small>{item.ref}</small></button>)}</section>
  return <aside className="graph-directory" aria-label="Knowledge Directory"><div className="graph-panel-heading"><div><span className="eyebrow">BROWSE KNOWLEDGE</span><h2>Directory</h2></div></div><form className="graph-search" onSubmit={(event) => { event.preventDefault(); onSearch() }}><input aria-label="Search Knowledge" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search canonical Knowledge" /><button type="submit" aria-label="Search">⌕</button></form>{directory ? <div className="graph-directory-scroll">{directory.themeGroups.map((group) => <section className="graph-directory-section" key={group.ref}><div className="graph-directory-title"><span>{group.name}</span><small>Theme</small></div>{group.themes.map((item) => <button className="graph-directory-item" key={item.ref} onClick={() => onFocus(item.ref)}><span>{item.name}</span><small>{item.ref}</small></button>)}{group.themes.length === 0 ? <p className="graph-directory-empty">No active themes</p> : null}</section>)}{section('Industries', directory.industries.items, directory.industries.total, directory.industries.truncated)}{section('Companies', directory.companies.items, directory.companies.total, directory.companies.truncated)}{section('Products', directory.products.items, directory.products.total, directory.products.truncated)}{section('Technologies', directory.technologies.items, directory.technologies.total, directory.technologies.truncated)}</div> : <p className="muted">Loading Directory…</p>}</aside>
}

function Filters({ projection, visibleTypes, setVisibleTypes, visibleRelations, setVisibleRelations }: { readonly projection?: KnowledgeGraphProjection; readonly visibleTypes: ReadonlySet<KnowledgeGraphEntityType>; readonly setVisibleTypes: (next: Set<KnowledgeGraphEntityType>) => void; readonly visibleRelations: ReadonlySet<string>; readonly setVisibleRelations: (next: Set<string>) => void }): ReactElement {
  const relationTypes = [...new Set((projection?.edges ?? []).map((edge) => edge.relationType))].sort((left, right) => left.localeCompare(right))
  const toggleType = (type: KnowledgeGraphEntityType): void => { const next = new Set(visibleTypes); if (next.has(type)) next.delete(type); else next.add(type); setVisibleTypes(next) }
  const toggleRelation = (type: string): void => { const next = new Set(visibleRelations); if (next.has(type)) next.delete(type); else next.add(type); setVisibleRelations(next) }
  return <div className="graph-filters"><span className="eyebrow">VIEW FILTERS</span><strong>Entity types</strong>{entityTypes.map((type) => <label key={type}><input type="checkbox" checked={visibleTypes.has(type)} onChange={() => toggleType(type)} />{entityLabels[type]}</label>)}{relationTypes.length > 0 ? <><strong>Relations</strong>{relationTypes.map((type) => <label key={type}><input type="checkbox" checked={visibleRelations.has(type)} onChange={() => toggleRelation(type)} />{displayRelationType(type)}</label>)}</> : null}</div>
}

function Inspector({ selection, projection, client, onFocus }: { readonly selection: Selection; readonly projection?: KnowledgeGraphProjection; readonly client: RuntimeClient; readonly onFocus: (ref: string) => void }): ReactElement {
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
  return <aside className="graph-inspector" aria-label="Knowledge Inspector"><div className="graph-panel-heading"><div><span className="eyebrow">CANONICAL DETAIL</span><h2>Inspector</h2></div><span className="read-only-badge">Read-only</span></div>{selectedNode ? <><span className="graph-inspector-type">{entityLabels[selectedNode.entityType]}</span><h3>{selectedNode.label}</h3><p className="graph-ref">{selectedNode.ref}</p><dl className="graph-meta"><dt>Lifecycle</dt><dd>{selectedNode.lifecycleStatus}</dd><dt>Context</dt><dd>{projection?.profile.replace('_', ' ')}</dd></dl><button className="secondary-action full" onClick={() => onFocus(selectedNode.ref)}>Focus this node</button></> : selectedEdge ? <><span className="graph-inspector-type">Relation</span><h3>{displayRelationType(selectedEdge.relationType)}</h3><p className="graph-ref">{selectedEdge.ref}</p><dl className="graph-meta"><dt>Source</dt><dd>{selectedEdge.sourceRef}</dd><dt>Target</dt><dd>{selectedEdge.targetRef}</dd></dl></> : <div className="notice"><strong>Select a node or edge</strong><p>Canonical detail and evidence appear here. Claims and Sources remain Inspector-only.</p></div>}{selection ? <div className="graph-detail-result">{error ? <div className="inline-error">{error}</div> : detail ? <><span className="eyebrow">OBJECT READ</span><pre>{prettyJson(detail.object)}</pre>{detail.relatedClaims?.length ? <p>Claims: {detail.relatedClaims.length}</p> : null}{detail.supportingSources?.length ? <p>Sources: {detail.supportingSources.length}</p> : null}</> : <p className="muted">Loading canonical detail…</p>}</div> : null}</aside>
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
  return <main className="graph-page-shell" aria-labelledby="graph-title"><header className="graph-page-header"><div><span className="eyebrow">KNOWLEDGE SURFACE</span><h1 id="graph-title">Knowledge Graph</h1><p>Read-only projection of active canonical Knowledge.</p></div><div className="graph-toolbar"><span className="eyebrow">DEPTH</span><button className={depth === 1 ? 'selected' : ''} onClick={() => updateDepth(1)}>1 hop</button><button className={depth === 2 ? 'selected' : ''} onClick={() => updateDepth(2)}>2 hops</button></div></header><div className="graph-layout"><Directory directory={directory} query={query} setQuery={setQuery} onSearch={search} onFocus={focus} /><section className="graph-workspace" aria-label="Knowledge Graph canvas">{searchResults.length > 0 ? <div className="graph-search-results"><span className="eyebrow">SEARCH RESULTS</span>{searchResults.map((item) => <button key={item.ref} onClick={() => { focus(item.ref); setSearchResults([]) }}><strong>{item.displayName ?? item.ref}</strong><small>{item.semanticType ?? item.kind}</small></button>)}</div> : null}{loadError ? <div className="inline-error graph-error">{loadError}</div> : null}{busy ? <div className="graph-overlay">Loading projection…</div> : null}{projection ? <GraphErrorBoundary><ReactFlow nodes={visible.nodes} edges={visible.edges} nodeTypes={nodeTypes} nodesConnectable={false} nodesDraggable={true} deleteKeyCode={null} onNodeClick={(_, node) => setSelection({ kind: 'node', ref: node.id })} onNodeDoubleClick={(_, node) => focus(node.id)} onEdgeClick={(_, edge) => setSelection({ kind: 'edge', ref: edge.id })} fitView fitViewOptions={{ padding: .2 }} minZoom={.2} maxZoom={2.2}><Background color="#29404b" gap={24} /><Controls showInteractive={false} /><MiniMap nodeColor={(node) => (node.data as GraphNodeData).isRoot ? '#72d2c4' : '#3d6562'} pannable zoomable /><Panel position="top-left" className="graph-canvas-note">{projection.nodes.length} nodes · {projection.edges.length} relations{projection.truncated ? ' · bounded' : ''}</Panel></ReactFlow></GraphErrorBoundary> : <div className="graph-empty-canvas"><strong>{root ? 'Projection unavailable' : 'Select a root to explore'}</strong><p>{root ? 'The selected root could not produce a graph projection.' : 'Select a Theme, Industry, Company, Product or Technology to explore.'}</p></div>}</section><div className="graph-right-column"><Filters projection={projection} visibleTypes={visibleTypes} setVisibleTypes={setVisibleTypes} visibleRelations={visibleRelations} setVisibleRelations={setVisibleRelations} /><Inspector selection={selection} projection={projection} client={client} onFocus={focus} /></div></div></main>
}
