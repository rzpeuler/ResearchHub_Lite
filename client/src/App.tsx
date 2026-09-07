import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactElement } from 'react'
import { RuntimeClient, RuntimeClientError, type AttachmentRef, type ClientEvent, type ConversationMessage, type ConversationSummary, type KnowledgeBaseStatus, type ReviewDetail, type ReviewListResponse, type SessionState, type WorkflowRun } from './api/runtime-client'
import { startWorkflowPolling, terminalWorkflowStatuses } from './app/workflow-polling'
import './styles.css'

type Route = 'research' | 'graph' | 'reviews'
type ResearchContextPanel = 'attachments' | 'workflow' | 'review'
type LoadState = 'loading' | 'ready' | 'error'
const knownTools: Record<string, string> = { researchhub_status: 'ResearchHub status', search_knowledge: 'Knowledge search', get_knowledge_object: 'Knowledge object lookup', ingest_document: 'Document ingestion', get_workflow_status: 'Workflow status', cancel_workflow: 'Workflow cancellation', list_review_cases: 'Review case list', get_review_case: 'Review case detail' }

function routeForPath(pathname: string): Route { return pathname === '/graph' ? 'graph' : pathname === '/reviews' ? 'reviews' : 'research' }
function routePath(route: Route): string { return route === 'research' ? '/research' : `/${route}` }
function errorText(error: unknown): string { return error instanceof RuntimeClientError ? error.message : 'ResearchHub runtime operation failed' }
function toolLabel(name: string | undefined): string { return name === undefined ? 'Tool execution' : knownTools[name] ?? 'Tool execution' }
function formatSize(size: number): string { if (size < 1024) return `${size} B`; if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`; return `${(size / (1024 * 1024)).toFixed(1)} MB` }
function shortHash(value: string): string { return value.length > 16 ? `${value.slice(0, 8)}…${value.slice(-8)}` : value }
function safeStructured(value: unknown, depth = 0): string {
  if (depth > 3) return '[truncated]'
  if (typeof value === 'string') return value.replace(/(?:[A-Za-z]:[\\/]|\\\\|\.\.?[\\/])[^\s"']+/g, '[path]').slice(0, 700)
  if (value === null || typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) return `[${value.slice(0, 6).map((item) => safeStructured(item, depth + 1)).join(', ')}]`
  if (typeof value === 'object') return Object.entries(value as Record<string, unknown>).slice(0, 12).map(([key, item]) => /path|root|workspace|directory|filename/i.test(key) ? `${key}: [redacted]` : `${key}: ${safeStructured(item, depth + 1)}`).join(' · ')
  return '[unavailable]'
}

interface TopBarProps { readonly route: Route; readonly knowledgeBase?: KnowledgeBaseStatus; readonly onNavigate: (route: Route) => void }
function TopBar({ route, knowledgeBase, onNavigate }: TopBarProps): ReactElement {
  const links: readonly [Route, string][] = [['research', 'Research'], ['graph', 'Knowledge Graph'], ['reviews', 'Reviews']]
  return <header className="topbar"><div className="topbar-left"><div className="brand"><span className="brand-mark">RH</span><span className="brand-name">ResearchHub</span></div><nav className="primary-nav" aria-label="Primary"><ul>{links.map(([item, label]) => <li key={item}><a className={route === item ? 'nav-link active' : 'nav-link'} href={routePath(item)} aria-current={route === item ? 'page' : undefined} onClick={(event) => { event.preventDefault(); onNavigate(item) }}>{label}</a></li>)}</ul></nav></div><div className="runtime-status"><span className="status-dot" /> <span>Local Runtime</span><span className="status-sub">{knowledgeBase ? 'KB mounted' : 'No KB mounted'}</span></div></header>
}

function GraphPage({ knowledgeBase }: { readonly knowledgeBase?: KnowledgeBaseStatus }): ReactElement {
  return <main className="page-frame graph-page" aria-labelledby="graph-title"><span className="eyebrow">KNOWLEDGE SURFACE</span><h1 id="graph-title">Knowledge Graph</h1><p>Explore canonical Themes, Industries, Companies, Products, Technologies and their relationships.</p><div className="notice"><strong>{knowledgeBase ? 'Knowledge Base mounted' : 'No Knowledge Base mounted'}</strong><p>Knowledge Graph visualization will be enabled in the next phase.</p></div></main>
}

interface ReviewsPageProps { readonly knowledgeBase?: KnowledgeBaseStatus; readonly reviews?: ReviewListResponse; readonly reviewDetail?: ReviewDetail; readonly reviewsBusy: boolean; readonly onSelect: (reviewCaseId: string) => void; readonly onCloseDetail: () => void }
function ReviewsPage({ knowledgeBase, reviews, reviewDetail, reviewsBusy, onSelect, onCloseDetail }: ReviewsPageProps): ReactElement {
  return <main className="page-frame review-page" aria-labelledby="reviews-title"><div className="page-heading"><div><span className="eyebrow">GOVERNANCE</span><h1 id="reviews-title">Review Inbox</h1></div><span className="read-only-badge">Read-only</span></div>{!knowledgeBase ? <div className="notice"><strong>No Knowledge Base mounted</strong><p>Review cases will appear here when a mounted production run creates actionable decisions.</p></div> : reviewsBusy ? <p className="muted">Loading Review Inbox…</p> : <div className="review-layout"><section aria-label="Open ReviewCases"><div className="section-title"><div><span className="eyebrow">OPEN CASES</span><h2>{reviews?.total ?? 0} review{(reviews?.total ?? 0) === 1 ? '' : 's'}</h2></div></div>{reviews && reviews.cases.length > 0 ? <div className="result-list">{reviews.cases.map((item) => <button className="review-item" key={item.reviewCaseId} onClick={() => onSelect(item.reviewCaseId)}><strong>{item.category}</strong><span>{item.actionability} · {item.proposalKind}</span><small>{item.rationale}</small><small>{item.producerType} · {new Date(item.createdAt).toLocaleString()}</small></button>)}</div> : <div className="notice"><strong>No open Review cases</strong><p>Completed production with review will surface actionable cases here.</p></div>}</section>{reviewDetail ? <section className="review-detail" aria-label="ReviewCase detail"><div className="detail-title"><span>Review detail</span><button onClick={onCloseDetail}>Close</button></div><h2>{reviewDetail.reviewCaseId}</h2><p><strong>Classification:</strong> {safeStructured(reviewDetail.classification)}</p><p><strong>Root proposal:</strong> {safeStructured(reviewDetail.rootProposal)}</p><p><strong>Evidence:</strong> {reviewDetail.evidenceBindings.length} binding(s)</p><p><strong>Existing Knowledge:</strong> {reviewDetail.existingKnowledgeProjections.length} projection(s)</p><p><strong>Impact:</strong> {safeStructured(reviewDetail.impact)}</p>{reviewDetail.advisory ? <p><strong>Advisory:</strong> {safeStructured(reviewDetail.advisory)}</p> : null}<p><strong>Dependent proposals:</strong> {reviewDetail.totalDependentProposals}</p><p className="muted">Review Inbox is read-only in v0.1. Decision controls are intentionally not available.</p></section> : <div className="notice detail-empty"><strong>Select a ReviewCase</strong><p>Review details are bounded and read-only.</p></div>}</div>}</main>
}

interface ResearchPageProps {
  readonly session?: SessionState
  readonly conversations: readonly ConversationSummary[]
  readonly messages: readonly ConversationMessage[]
  readonly streaming: boolean
  readonly thinking: boolean
  readonly streamText: string
  readonly toolEvents: readonly string[]
  readonly queue: { readonly steering: number; readonly followUp: number }
  readonly composer: string
  readonly busy: boolean
  readonly error: string
  readonly attachment?: AttachmentRef
  readonly attachmentBusy: boolean
  readonly workflowRunId: string
  readonly workflow?: WorkflowRun
  readonly knowledgeBase?: KnowledgeBaseStatus
  readonly openReviewCases: number
  readonly contextPanel: ResearchContextPanel
  readonly setComposer: (value: string) => void
  readonly setContextPanel: (value: ResearchContextPanel) => void
  readonly newConversation: () => void
  readonly switchConversation: (conversationId: string) => void
  readonly runCommand: (operation: 'prompt' | 'steer' | 'follow_up') => void
  readonly abort: () => void
  readonly upload: (file: File | undefined) => void
  readonly addToKnowledge: () => void
  readonly cancelWorkflow: () => void
  readonly dismissError: () => void
  readonly onNavigate: (route: Route) => void
}

function ResearchPage(props: ResearchPageProps): ReactElement {
  const noKnowledge = !props.knowledgeBase
  return <main className="workspace-grid"><aside className="conversation-rail" aria-label="Conversations"><div className="rail-heading"><div><span className="eyebrow">WORKSPACE</span><h2>Conversations</h2></div><button className="icon-button" aria-label="New conversation" onClick={props.newConversation} disabled={props.busy}>＋</button></div><button className="new-conversation" onClick={props.newConversation} disabled={props.busy}>＋ New conversation</button><div className="history-label">History</div><nav className="conversation-list" aria-label="Conversation history">{props.conversations.map((conversation) => <button className={`conversation-item ${conversation.isActive ? 'active' : ''}`} key={conversation.conversationId} onClick={() => props.switchConversation(conversation.conversationId)} disabled={props.busy}><span>{conversation.name || 'Untitled conversation'}</span><small>{conversation.messageCount} messages</small></button>)}</nav></aside><section className="conversation-pane" aria-label="Conversation"><div className="conversation-heading"><div><span className="eyebrow">AGENT SESSION</span><h1>{props.session?.name || 'Research conversation'}</h1></div><span className={`session-pill ${props.streaming ? 'live' : ''}`}>{props.streaming ? 'Streaming' : 'Idle'}</span></div><div className="messages" aria-live="polite">{props.messages.length === 0 && !props.streaming ? <div className="empty-conversation"><div className="empty-orbit">✦</div><h2>Start with a research question</h2><p>Ask the Agent to explore the research context or help shape your next research step.</p></div> : props.messages.map((message, index) => <article className={`message ${message.role}`} key={`${message.timestamp ?? 'message'}-${index}`}><div className="message-meta">{message.role === 'user' ? 'You' : message.role === 'tool' ? toolLabel(message.toolName) : 'Agent'}{message.timestamp ? <time>{new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time> : null}</div><div className="message-body">{message.role === 'tool' ? <span className="tool-chip">{toolLabel(message.toolName)}</span> : message.content}</div></article>)}{props.streaming ? <article className="message assistant streaming-message"><div className="message-meta">Agent {props.thinking ? <span className="thinking-label">Thinking…</span> : null}</div><div className="message-body">{props.streamText || (props.thinking ? 'Thinking…' : 'Working…')}{props.streamText ? <span className="cursor" /> : null}</div>{props.toolEvents.length > 0 ? <div className="tool-trace">{props.toolEvents.map((item, index) => <span key={`${item}-${index}`}>{item}</span>)}</div> : null}</article> : null}</div>{props.error ? <div className="inline-error" role="alert">{props.error}<button onClick={props.dismissError}>Dismiss</button></div> : null}<div className="composer-wrap"><textarea aria-label="Message" value={props.composer} onChange={(event) => props.setComposer(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey && !props.streaming) { event.preventDefault(); props.runCommand('prompt') } }} placeholder={props.streaming ? 'Write a steering instruction or follow-up…' : 'Ask the Agent anything about your research…'} rows={3} /><div className="composer-footer"><span>Enter to send · Shift+Enter for newline · queued: {props.queue.steering} steer / {props.queue.followUp} follow-up</span><div className="composer-actions">{props.streaming ? <><button className="secondary-action" onClick={() => props.runCommand('steer')} disabled={props.busy || !props.composer.trim()}>Steer</button><button className="secondary-action" onClick={() => props.runCommand('follow_up')} disabled={props.busy || !props.composer.trim()}>Follow up</button><button className="stop-action" onClick={props.abort} disabled={props.busy}>Stop</button></> : <button className="primary-action" onClick={() => props.runCommand('prompt')} disabled={props.busy || !props.composer.trim()}>Send <span>↗</span></button>}</div></div></div></section><aside className="context-rail" aria-label="Research context"><div className="context-heading"><div><span className="eyebrow">RESEARCH CONTEXT</span><span className="context-count">{props.openReviewCases > 0 ? `${props.openReviewCases} review${props.openReviewCases === 1 ? '' : 's'}` : 'Live'}</span></div></div>{noKnowledge ? <div className="notice context-kb-notice"><strong>No Knowledge Base mounted</strong><p>Free Research remains available; Knowledge Production and Reviews require a mounted Knowledge Base.</p></div> : null}<div className="panel-tabs research-tabs"><button className={props.contextPanel === 'attachments' ? 'selected' : ''} onClick={() => props.setContextPanel('attachments')}>Attachments</button><button className={props.contextPanel === 'workflow' ? 'selected' : ''} onClick={() => props.setContextPanel('workflow')}>Workflow</button><button className={props.contextPanel === 'review' ? 'selected' : ''} onClick={() => props.setContextPanel('review')}>Review{props.openReviewCases > 0 ? <b>{props.openReviewCases}</b> : null}</button></div><div className="context-content">{props.contextPanel === 'attachments' ? <section className="context-section"><div className="section-title"><div><span className="eyebrow">SOURCE MATERIAL</span><h2>Attachments</h2></div></div><label className="drop-zone" onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); props.upload(event.dataTransfer.files[0]) }}><input type="file" onChange={(event) => props.upload(event.target.files?.[0])} /><span className="drop-icon">↑</span><strong>{props.attachmentBusy ? 'Uploading…' : 'Upload a document'}</strong><small>Drag and drop or choose a file</small></label>{props.attachment ? <div className="attachment-card"><div className="file-icon">DOC</div><div className="attachment-info"><strong>{props.attachment.filename}</strong><span>{props.attachment.mediaType} · {formatSize(props.attachment.size)}</span><small>SHA-256 {shortHash(props.attachment.sha256)}</small><small>{new Date(props.attachment.createdAt).toLocaleString()}</small></div><button className="primary-action compact" onClick={props.addToKnowledge} disabled={props.busy || noKnowledge}>Add to Knowledge</button>{noKnowledge ? <small className="muted">Requires a mounted Knowledge Base</small> : null}</div> : <p className="muted">Uploads are kept outside canonical Knowledge until you explicitly add one.</p>}</section> : null}{props.contextPanel === 'workflow' ? <section className="context-section"><div className="section-title"><div><span className="eyebrow">PRODUCTION</span><h2>Workflow</h2></div></div>{!props.workflowRunId ? <div className="notice"><strong>No active Workflow</strong><p>Use Add to Knowledge on an uploaded attachment to start governed production.</p></div> : props.workflow ? <div className="workflow-card"><div className="workflow-status"><span className={`status-dot ${terminalWorkflowStatuses.has(props.workflow.status) ? 'terminal' : ''}`} />{props.workflow.status.replaceAll('_', ' ')}</div><h3>{props.workflow.objective}</h3><dl><dt>Stage</dt><dd>{props.workflow.currentStage || 'Not reported'}</dd><dt>Progress</dt><dd>{props.workflow.progressSummary || 'Not reported'}</dd>{props.workflow.reviewCount !== undefined ? <><dt>Reviews</dt><dd>{props.workflow.reviewCount}</dd></> : null}</dl>{props.workflow.errorSummary ? <div className="inline-error">{props.workflow.errorSummary}</div> : null}{props.workflow.status === 'completed_with_review' && (props.workflow.reviewCount ?? 0) > 0 ? <button className="secondary-action full" onClick={() => props.onNavigate('reviews')}>View Reviews</button> : null}{!terminalWorkflowStatuses.has(props.workflow.status) ? <button className="stop-action full" onClick={props.cancelWorkflow} disabled={props.busy}>Cancel Workflow</button> : null}</div> : <p className="muted">Loading Workflow status…</p>}</section> : null}{props.contextPanel === 'review' ? <section className="context-section"><div className="section-title"><div><span className="eyebrow">GOVERNANCE</span><h2>Reviews</h2></div><span className="rail-badge">Read-only</span></div><div className="notice"><strong>{props.openReviewCases > 0 ? `${props.openReviewCases} items need review` : 'No open Review cases'}</strong><p>{noKnowledge ? 'No Knowledge Base mounted.' : 'Open the Review Inbox to inspect actionable cases.'}</p>{props.openReviewCases > 0 ? <button className="secondary-action full" onClick={() => props.onNavigate('reviews')}>View Reviews</button> : null}</div></section> : null}</div></aside></main>
}

export default function App(): ReactElement {
  const client = useMemo(() => new RuntimeClient(), [])
  const [route, setRoute] = useState<Route>(() => routeForPath(window.location.pathname))
  const [loadState, setLoadState] = useState<LoadState>('loading')
  const [loadError, setLoadError] = useState('')
  const [session, setSession] = useState<SessionState>()
  const [conversations, setConversations] = useState<readonly ConversationSummary[]>([])
  const [messages, setMessages] = useState<readonly ConversationMessage[]>([])
  const [knowledgeBase, setKnowledgeBase] = useState<KnowledgeBaseStatus>()
  const [openReviewCases, setOpenReviewCases] = useState(0)
  const [streaming, setStreaming] = useState(false)
  const [streamText, setStreamText] = useState('')
  const [thinking, setThinking] = useState(false)
  const [toolEvents, setToolEvents] = useState<readonly string[]>([])
  const [queue, setQueue] = useState({ steering: 0, followUp: 0 })
  const [composer, setComposer] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [attachment, setAttachment] = useState<AttachmentRef>()
  const [attachmentBusy, setAttachmentBusy] = useState(false)
  const [workflowRunId, setWorkflowRunId] = useState('')
  const [workflow, setWorkflow] = useState<WorkflowRun>()
  const [contextPanel, setContextPanel] = useState<ResearchContextPanel>('attachments')
  const [reviews, setReviews] = useState<ReviewListResponse>()
  const [reviewDetail, setReviewDetail] = useState<ReviewDetail>()
  const [reviewsBusy, setReviewsBusy] = useState(false)
  const latestConversation = useRef('')
  const workflowRef = useRef<WorkflowRun | undefined>(undefined)
  workflowRef.current = workflow

  const syncCurrent = useCallback(async (): Promise<void> => {
    const [current, messageResult, list] = await Promise.all([client.currentSession(), client.messages(), client.listConversations()])
    latestConversation.current = current.conversationId
    setSession(current)
    setMessages(messageResult.messages)
    setConversations(list)
  }, [client])

  const navigate = useCallback((nextRoute: Route): void => { const path = routePath(nextRoute); if (window.location.pathname !== path) window.history.pushState({}, '', path); setRoute(nextRoute) }, [])

  useEffect(() => { const onPopState = (): void => setRoute(routeForPath(window.location.pathname)); window.addEventListener('popstate', onPopState); return () => window.removeEventListener('popstate', onPopState) }, [])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const bootstrap = await client.bootstrap()
        if (cancelled) return
        setSession(bootstrap.session); latestConversation.current = bootstrap.session.conversationId; setConversations(bootstrap.conversations); setKnowledgeBase(bootstrap.knowledgeBase); setOpenReviewCases(bootstrap.openReviewCases ?? 0)
        await syncCurrent()
        if (!cancelled) setLoadState('ready')
      } catch (caught) { if (!cancelled) { setLoadError(errorText(caught)); setLoadState('error') } }
    })()
    return () => { cancelled = true; client.clearToken() }
  }, [client, syncCurrent])

  useEffect(() => {
    if (loadState !== 'ready' || route !== 'reviews' || !knowledgeBase) { setReviews(undefined); setReviewDetail(undefined); return }
    setReviewsBusy(true)
    void client.listReviews().then(setReviews).catch((caught) => setError(errorText(caught))).finally(() => setReviewsBusy(false))
  }, [client, knowledgeBase, loadState, route])

  const handleEvent = useCallback((event: ClientEvent): void => {
    if (event.conversationId !== latestConversation.current && event.type !== 'session.changed') return
    if (event.type === 'agent.started') { setStreaming(true); setThinking(false); setStreamText(''); setToolEvents([]) }
    if (event.type === 'message.delta') { setStreaming(true); setThinking(false); setStreamText((old) => `${old}${event.summary ?? ''}`) }
    if (event.type === 'thinking.status') { setStreaming(true); setThinking(true) }
    if (event.type.startsWith('tool.')) setToolEvents((old) => [...old.slice(-3), `${event.type.replace('tool.', '')}: ${toolLabel(event.name)}`])
    if (event.type === 'queue.updated') setQueue({ steering: event.steeringCount ?? 0, followUp: event.followUpCount ?? 0 })
    if (event.type === 'agent.completed' || event.type === 'error') { setStreaming(false); setThinking(false); void syncCurrent().catch((caught) => setError(errorText(caught))) }
    if (event.type === 'session.changed') { setStreaming(false); setStreamText(''); setThinking(false); void syncCurrent().catch((caught) => setError(errorText(caught))) }
  }, [syncCurrent])

  useEffect(() => { if (loadState !== 'ready') return undefined; return client.openEvents(handleEvent, () => { void syncCurrent().catch((caught) => setError(errorText(caught))) }) }, [client, handleEvent, loadState, syncCurrent])

  useEffect(() => {
    const knownWorkflow = workflowRef.current
    if (!workflowRunId || !knowledgeBase || (knownWorkflow?.runId === workflowRunId && terminalWorkflowStatuses.has(knownWorkflow.status))) return undefined
    return startWorkflowPolling({ runId: workflowRunId, fetchWorkflow: (runId) => client.workflow(runId), onUpdate: setWorkflow, onError: (caught) => setError(errorText(caught)) })
  }, [client, knowledgeBase, workflowRunId])

  const runCommand = async (operation: 'prompt' | 'steer' | 'follow_up'): Promise<void> => { const text = composer.trim(); if (!text || busy || (operation === 'prompt' && streaming)) return; setBusy(true); setError(''); try { await client.command(operation, text); setComposer(''); setStreaming(true); setThinking(false); setStreamText(''); setToolEvents([]) } catch (caught) { setError(errorText(caught)) } finally { setBusy(false) } }
  const abort = async (): Promise<void> => { setBusy(true); setError(''); try { await client.abort(); setStreaming(false); await syncCurrent() } catch (caught) { setError(errorText(caught)) } finally { setBusy(false) } }
  const newConversation = async (): Promise<void> => { setBusy(true); setError(''); try { await client.newConversation(); setStreaming(false); setStreamText(''); await syncCurrent() } catch (caught) { setError(errorText(caught)) } finally { setBusy(false) } }
  const switchConversation = async (conversationId: string): Promise<void> => { if (conversationId === session?.conversationId || busy) return; setBusy(true); setError(''); setStreaming(false); setStreamText(''); setThinking(false); setToolEvents([]); try { await client.switchConversation(conversationId); await syncCurrent() } catch (caught) { setError(errorText(caught)) } finally { setBusy(false) } }
  const upload = async (file: File | undefined): Promise<void> => { if (!file) return; setAttachmentBusy(true); setError(''); try { setAttachment(await client.uploadAttachment(file)) } catch (caught) { setError(errorText(caught)) } finally { setAttachmentBusy(false) } }
  const addToKnowledge = async (): Promise<void> => { if (!attachment || !knowledgeBase) return; setBusy(true); setError(''); try { const result = await client.startProduction(attachment.attachmentId); setWorkflowRunId(result.runId); setWorkflow(result.workflow); setContextPanel('workflow') } catch (caught) { setError(errorText(caught)) } finally { setBusy(false) } }
  const cancelWorkflow = async (): Promise<void> => { if (!workflowRunId) return; setBusy(true); try { await client.cancelWorkflow(workflowRunId); setWorkflow(await client.workflow(workflowRunId)) } catch (caught) { setError(errorText(caught)) } finally { setBusy(false) } }
  const selectReview = async (reviewCaseId: string): Promise<void> => { try { setReviewDetail(await client.getReview(reviewCaseId)) } catch (caught) { setError(errorText(caught)) } }

  if (loadState === 'loading') return <main className="state-screen"><div className="state-card"><span className="eyebrow">RESEARCHHUB RUNTIME</span><h1>Loading workspace</h1><p>Connecting to the local application runtime…</p><div className="loader" /></div></main>
  if (loadState === 'error') return <main className="state-screen"><div className="state-card"><span className="eyebrow">RUNTIME UNAVAILABLE</span><h1>ResearchHub could not start</h1><p>{loadError}</p><button onClick={() => window.location.reload()}>Reload page</button></div></main>
  return <div className="app-shell"><TopBar route={route} knowledgeBase={knowledgeBase} onNavigate={navigate} />{route === 'research' ? <ResearchPage session={session} conversations={conversations} messages={messages} streaming={streaming} thinking={thinking} streamText={streamText} toolEvents={toolEvents} queue={queue} composer={composer} busy={busy} error={error} attachment={attachment} attachmentBusy={attachmentBusy} workflowRunId={workflowRunId} workflow={workflow} knowledgeBase={knowledgeBase} openReviewCases={openReviewCases} contextPanel={contextPanel} setComposer={setComposer} setContextPanel={setContextPanel} newConversation={() => void newConversation()} switchConversation={(id) => void switchConversation(id)} runCommand={(operation) => void runCommand(operation)} abort={() => void abort()} upload={(file) => void upload(file)} addToKnowledge={() => void addToKnowledge()} cancelWorkflow={() => void cancelWorkflow()} dismissError={() => setError('')} onNavigate={navigate} /> : route === 'graph' ? <GraphPage knowledgeBase={knowledgeBase} /> : <ReviewsPage knowledgeBase={knowledgeBase} reviews={reviews} reviewDetail={reviewDetail} reviewsBusy={reviewsBusy} onSelect={(id) => void selectReview(id)} onCloseDetail={() => setReviewDetail(undefined)} />}</div>
}
