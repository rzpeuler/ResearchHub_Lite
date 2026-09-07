import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactElement } from 'react'
import { RuntimeClient, RuntimeClientError, type AttachmentRef, type ClientEvent, type ConversationMessage, type ConversationSummary, type KnowledgeBaseStatus, type KnowledgeObjectResponse, type KnowledgeSearchResponse, type ReviewDetail, type ReviewListResponse, type SessionState, type WorkflowRun } from './api/runtime-client'
import './styles.css'

type Panel = 'knowledge' | 'attachments' | 'workflow' | 'review'
type LoadState = 'loading' | 'ready' | 'error'
const terminalStatuses = new Set(['completed', 'completed_with_review', 'blocked', 'cancelled', 'failed'])
const knownTools: Record<string, string> = { researchhub_status: 'ResearchHub status', search_knowledge: 'Knowledge search', get_knowledge_object: 'Knowledge object lookup', ingest_document: 'Document ingestion', get_workflow_status: 'Workflow status', cancel_workflow: 'Workflow cancellation', list_review_cases: 'Review case list', get_review_case: 'Review case detail' }

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

export default function App(): ReactElement {
  const client = useMemo(() => new RuntimeClient(), [])
  const [loadState, setLoadState] = useState<LoadState>('loading')
  const [loadError, setLoadError] = useState('')
  const [session, setSession] = useState<SessionState>()
  const [conversations, setConversations] = useState<readonly ConversationSummary[]>([])
  const [messages, setMessages] = useState<readonly ConversationMessage[]>([])
  const [knowledgeBase, setKnowledgeBase] = useState<KnowledgeBaseStatus>()
  const [openReviewCases, setOpenReviewCases] = useState(0)
  const [knowledgeError, setKnowledgeError] = useState('')
  const [panel, setPanel] = useState<Panel>('knowledge')
  const [streaming, setStreaming] = useState(false)
  const [streamText, setStreamText] = useState('')
  const [thinking, setThinking] = useState(false)
  const [toolEvents, setToolEvents] = useState<readonly string[]>([])
  const [queue, setQueue] = useState({ steering: 0, followUp: 0 })
  const [composer, setComposer] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [knowledgeQuery, setKnowledgeQuery] = useState('')
  const [knowledgeResults, setKnowledgeResults] = useState<KnowledgeSearchResponse>()
  const [knowledgeObject, setKnowledgeObject] = useState<KnowledgeObjectResponse>()
  const [knowledgeBusy, setKnowledgeBusy] = useState(false)
  const [attachment, setAttachment] = useState<AttachmentRef>()
  const [attachmentBusy, setAttachmentBusy] = useState(false)
  const [workflowRunId, setWorkflowRunId] = useState('')
  const [workflow, setWorkflow] = useState<WorkflowRun>()
  const [reviews, setReviews] = useState<ReviewListResponse>()
  const [reviewDetail, setReviewDetail] = useState<ReviewDetail>()
  const [reviewsBusy, setReviewsBusy] = useState(false)
  const latestConversation = useRef('')

  const syncCurrent = useCallback(async (): Promise<void> => {
    const [current, messageResult, list] = await Promise.all([client.currentSession(), client.messages(), client.listConversations()])
    latestConversation.current = current.conversationId
    setSession(current)
    setMessages(messageResult.messages)
    setConversations(list)
  }, [client])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const bootstrap = await client.bootstrap()
        if (cancelled) return
        setSession(bootstrap.session)
        latestConversation.current = bootstrap.session.conversationId
        setConversations(bootstrap.conversations)
        setKnowledgeBase(bootstrap.knowledgeBase)
        setOpenReviewCases(bootstrap.openReviewCases ?? 0)
        setKnowledgeError(bootstrap.knowledgeError?.code === 'no_kb_mounted' ? 'No Knowledge Base mounted' : '')
        await syncCurrent()
        if (!cancelled) setLoadState('ready')
      } catch (caught) { if (!cancelled) { setLoadError(errorText(caught)); setLoadState('error') } }
    })()
    return () => { cancelled = true; client.clearToken() }
  }, [client, syncCurrent])

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

  useEffect(() => {
    if (loadState !== 'ready') return undefined
    return client.openEvents(handleEvent, () => { void syncCurrent().catch((caught) => setError(errorText(caught))) })
  }, [client, handleEvent, loadState, syncCurrent])

  useEffect(() => {
    if (!workflowRunId || !knowledgeBase) return undefined
    let stopped = false
    const poll = async (): Promise<void> => { try { const next = await client.workflow(workflowRunId); if (!stopped) setWorkflow(next) } catch (caught) { if (!stopped) setError(errorText(caught)) } }
    void poll()
    if (workflow && terminalStatuses.has(workflow.status)) return undefined
    const timer = window.setInterval(() => { void poll() }, 1000)
    return () => { stopped = true; window.clearInterval(timer) }
  }, [client, knowledgeBase, workflow, workflowRunId])

  useEffect(() => {
    if (panel !== 'review' || !knowledgeBase) return
    setReviewsBusy(true)
    void client.listReviews().then(setReviews).catch((caught) => setError(errorText(caught))).finally(() => setReviewsBusy(false))
  }, [client, knowledgeBase, panel])

  const runCommand = async (operation: 'prompt' | 'steer' | 'follow_up'): Promise<void> => {
    const text = composer.trim()
    if (!text || busy || (operation === 'prompt' && streaming)) return
    setBusy(true); setError('')
    try { await client.command(operation, text); setComposer(''); setStreaming(true); setThinking(false); setStreamText(''); setToolEvents([]) } catch (caught) { setError(errorText(caught)) } finally { setBusy(false) }
  }
  const abort = async (): Promise<void> => { setBusy(true); setError(''); try { await client.abort(); setStreaming(false); await syncCurrent() } catch (caught) { setError(errorText(caught)) } finally { setBusy(false) } }
  const newConversation = async (): Promise<void> => { setBusy(true); setError(''); try { await client.newConversation(); setStreaming(false); setStreamText(''); await syncCurrent() } catch (caught) { setError(errorText(caught)) } finally { setBusy(false) } }
  const switchConversation = async (conversationId: string): Promise<void> => { if (conversationId === session?.conversationId || busy) return; setBusy(true); setError(''); setStreaming(false); setStreamText(''); setThinking(false); setToolEvents([]); try { await client.switchConversation(conversationId); await syncCurrent() } catch (caught) { setError(errorText(caught)) } finally { setBusy(false) } }
  const searchKnowledge = async (event: React.FormEvent): Promise<void> => { event.preventDefault(); if (!knowledgeBase || !knowledgeQuery.trim()) return; setKnowledgeBusy(true); setError(''); try { setKnowledgeResults(await client.searchKnowledge(knowledgeQuery.trim())) } catch (caught) { setError(errorText(caught)) } finally { setKnowledgeBusy(false) } }
  const selectKnowledge = async (ref: string): Promise<void> => { setKnowledgeBusy(true); try { setKnowledgeObject(await client.getKnowledgeObject(ref)) } catch (caught) { setError(errorText(caught)) } finally { setKnowledgeBusy(false) } }
  const upload = async (file: File | undefined): Promise<void> => { if (!file) return; setAttachmentBusy(true); setError(''); try { setAttachment(await client.uploadAttachment(file)) } catch (caught) { setError(errorText(caught)) } finally { setAttachmentBusy(false) } }
  const addToKnowledge = async (): Promise<void> => { if (!attachment || !knowledgeBase) return; setBusy(true); setError(''); try { const result = await client.startProduction(attachment.attachmentId); setWorkflowRunId(result.runId); setWorkflow(result.workflow); setPanel('workflow') } catch (caught) { setError(errorText(caught)) } finally { setBusy(false) } }
  const cancelWorkflow = async (): Promise<void> => { if (!workflowRunId) return; setBusy(true); try { await client.cancelWorkflow(workflowRunId); setWorkflow(await client.workflow(workflowRunId)) } catch (caught) { setError(errorText(caught)) } finally { setBusy(false) } }
  const openReview = async (id: string): Promise<void> => { try { setReviewDetail(await client.getReview(id)) } catch (caught) { setError(errorText(caught)) } }

  if (loadState === 'loading') return <main className="state-screen"><div className="state-card"><span className="eyebrow">RESEARCHHUB RUNTIME</span><h1>Loading workspace</h1><p>Connecting to the local application runtime…</p><div className="loader" /></div></main>
  if (loadState === 'error') return <main className="state-screen"><div className="state-card"><span className="eyebrow">RUNTIME UNAVAILABLE</span><h1>ResearchHub could not start</h1><p>{loadError}</p><button onClick={() => window.location.reload()}>Reload page</button></div></main>

  const noKnowledge = !knowledgeBase
  return <main className="app-shell">
    <header className="topbar"><div><span className="brand-mark">RH</span><span className="brand-name">ResearchHub</span></div><div className="runtime-status"><span className="status-dot" /> Local Runtime <span className="status-sub">{session?.model?.modelId ?? 'ready'}</span></div></header>
    <div className="workspace-grid">
      <aside className="conversation-rail" aria-label="Conversations">
        <div className="rail-heading"><div><span className="eyebrow">WORKSPACE</span><h2>Conversations</h2></div><button className="icon-button" aria-label="New conversation" onClick={() => void newConversation()} disabled={busy}>＋</button></div>
        <button className="new-conversation" onClick={() => void newConversation()} disabled={busy}>＋ New conversation</button>
        <div className="history-label">History</div>
        <nav className="conversation-list">{conversations.map((conversation) => <button className={`conversation-item ${conversation.isActive ? 'active' : ''}`} key={conversation.conversationId} onClick={() => void switchConversation(conversation.conversationId)} disabled={busy}><span>{conversation.name || 'Untitled conversation'}</span><small>{conversation.messageCount} messages</small></button>)}</nav>
      </aside>
      <section className="conversation-pane" aria-label="Conversation">
        <div className="conversation-heading"><div><span className="eyebrow">AGENT SESSION</span><h1>{session?.name || 'Research conversation'}</h1></div><span className={`session-pill ${streaming ? 'live' : ''}`}>{streaming ? 'Streaming' : 'Idle'}</span></div>
        <div className="messages" aria-live="polite">{messages.length === 0 && !streaming ? <div className="empty-conversation"><div className="empty-orbit">✦</div><h2>Start with a research question</h2><p>Ask the Agent to explore the mounted Knowledge Base or help shape your next research step.</p></div> : messages.map((message, index) => <article className={`message ${message.role}`} key={`${message.timestamp ?? 'message'}-${index}`}><div className="message-meta">{message.role === 'user' ? 'You' : message.role === 'tool' ? toolLabel(message.toolName) : 'Agent'}{message.timestamp ? <time>{new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time> : null}</div><div className="message-body">{message.role === 'tool' ? <span className="tool-chip">{toolLabel(message.toolName)}</span> : message.content}</div></article>)}{streaming ? <article className="message assistant streaming-message"><div className="message-meta">Agent {thinking ? <span className="thinking-label">Thinking…</span> : null}</div><div className="message-body">{streamText || (thinking ? 'Thinking…' : 'Working…')}{streamText ? <span className="cursor" /> : null}</div>{toolEvents.length > 0 ? <div className="tool-trace">{toolEvents.map((item, index) => <span key={`${item}-${index}`}>{item}</span>)}</div> : null}</article> : null}</div>
        {error ? <div className="inline-error" role="alert">{error}<button onClick={() => setError('')}>Dismiss</button></div> : null}
        <div className="composer-wrap"><textarea aria-label="Message" value={composer} onChange={(event) => setComposer(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey && !streaming) { event.preventDefault(); void runCommand('prompt') } }} placeholder={streaming ? 'Write a steering instruction or follow-up…' : 'Ask the Agent anything about your research…'} rows={3} /><div className="composer-footer"><span>Enter to send · Shift+Enter for newline · queued: {queue.steering} steer / {queue.followUp} follow-up</span><div className="composer-actions">{streaming ? <><button className="secondary-action" onClick={() => void runCommand('steer')} disabled={busy || !composer.trim()}>Steer</button><button className="secondary-action" onClick={() => void runCommand('follow_up')} disabled={busy || !composer.trim()}>Follow up</button><button className="stop-action" onClick={() => void abort()} disabled={busy}>Stop</button></> : <button className="primary-action" onClick={() => void runCommand('prompt')} disabled={busy || !composer.trim()}>Send <span>↗</span></button>}</div></div></div>
      </section>
      <aside className="context-rail" aria-label="Context">
        <div className="context-heading"><span className="eyebrow">CONTEXT</span><span className="context-count">{openReviewCases > 0 ? `${openReviewCases} review${openReviewCases === 1 ? '' : 's'}` : 'Live'}</span></div>
        <div className="panel-tabs">{(['knowledge', 'attachments', 'workflow', 'review'] as Panel[]).map((item) => <button key={item} className={panel === item ? 'selected' : ''} onClick={() => setPanel(item)}>{item === 'knowledge' ? 'Knowledge' : item[0].toUpperCase() + item.slice(1)}{item === 'review' && openReviewCases > 0 ? <b>{openReviewCases}</b> : null}</button>)}</div>
        <div className="context-content">
          {panel === 'knowledge' ? <section className="context-section"><div className="section-title"><div><span className="eyebrow">CANONICAL CONTEXT</span><h2>Knowledge</h2></div><span className="rail-badge">{noKnowledge ? 'Unavailable' : 'Mounted'}</span></div>{noKnowledge ? <div className="notice"><strong>{knowledgeError || 'No Knowledge Base mounted'}</strong><p>The conversation remains available. Mount a Knowledge Base to search, inspect objects, and start production.</p></div> : <><form className="search-box" onSubmit={(event) => void searchKnowledge(event)}><input aria-label="Knowledge search" value={knowledgeQuery} onChange={(event) => setKnowledgeQuery(event.target.value)} placeholder="Search Knowledge…" /><button aria-label="Search Knowledge" disabled={knowledgeBusy || !knowledgeQuery.trim()}>⌕</button></form>{knowledgeResults ? <><div className="result-summary">{knowledgeResults.total} result{knowledgeResults.total === 1 ? '' : 's'}{knowledgeResults.truncated ? ' · results truncated' : ''}</div><div className="result-list">{knowledgeResults.results.map((result) => <button className="result-item" key={result.ref} onClick={() => void selectKnowledge(result.ref)}><span className="result-kind">{result.kind}</span><strong>{result.displayName || result.semanticType || result.ref}</strong><small>{result.summary || result.ref}</small></button>)}</div></> : <p className="muted">Search across ThemeGroup, Entity, Relation, Claim, Source, and Module.</p>}{knowledgeObject ? <div className="object-detail"><div className="detail-title"><span>{knowledgeObject.kind}</span><button onClick={() => setKnowledgeObject(undefined)}>Close</button></div><h3>{knowledgeObject.ref}</h3><p>{safeStructured(knowledgeObject.object)}</p>{knowledgeObject.truncation ? <small className="muted">Related data may be truncated by the Runtime.</small> : null}</div> : null}</>}</section> : null}
          {panel === 'attachments' ? <section className="context-section"><div className="section-title"><div><span className="eyebrow">SOURCE MATERIAL</span><h2>Attachments</h2></div></div><label className="drop-zone" onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); void upload(event.dataTransfer.files[0]) }}><input type="file" onChange={(event) => void upload(event.target.files?.[0])} /><span className="drop-icon">↑</span><strong>{attachmentBusy ? 'Uploading…' : 'Upload a document'}</strong><small>Drag and drop or choose a file</small></label>{attachment ? <div className="attachment-card"><div className="file-icon">DOC</div><div className="attachment-info"><strong>{attachment.filename}</strong><span>{attachment.mediaType} · {formatSize(attachment.size)}</span><small>SHA-256 {shortHash(attachment.sha256)}</small><small>{new Date(attachment.createdAt).toLocaleString()}</small></div><button className="primary-action compact" onClick={() => void addToKnowledge()} disabled={busy || noKnowledge}>Add to Knowledge</button>{noKnowledge ? <small className="muted">Requires a mounted Knowledge Base</small> : null}</div> : <p className="muted">Uploads are kept outside canonical Knowledge until you explicitly add one.</p>}</section> : null}
          {panel === 'workflow' ? <section className="context-section"><div className="section-title"><div><span className="eyebrow">PRODUCTION</span><h2>Workflow</h2></div></div>{!workflowRunId ? <div className="notice"><strong>No active Workflow</strong><p>Use Add to Knowledge on an uploaded attachment to start governed production.</p></div> : workflow ? <div className="workflow-card"><div className="workflow-status"><span className={`status-dot ${terminalStatuses.has(workflow.status) ? 'terminal' : ''}`} />{workflow.status.replaceAll('_', ' ')}</div><h3>{workflow.objective}</h3><dl><dt>Stage</dt><dd>{workflow.currentStage || 'Not reported'}</dd><dt>Progress</dt><dd>{workflow.progressSummary || 'Not reported'}</dd>{workflow.reviewCount !== undefined ? <><dt>Reviews</dt><dd>{workflow.reviewCount}</dd></> : null}</dl>{workflow.errorSummary ? <div className="inline-error">{workflow.errorSummary}</div> : null}{workflow.status === 'completed_with_review' && (workflow.reviewCount ?? 0) > 0 ? <button className="secondary-action full" onClick={() => setPanel('review')}>Open Review Inbox</button> : null}{!terminalStatuses.has(workflow.status) ? <button className="stop-action full" onClick={() => void cancelWorkflow()} disabled={busy}>Cancel Workflow</button> : null}</div> : <p className="muted">Loading Workflow status…</p>}</section> : null}
          {panel === 'review' ? <section className="context-section"><div className="section-title"><div><span className="eyebrow">READ-ONLY INBOX</span><h2>Review</h2></div></div>{noKnowledge ? <div className="notice"><strong>No Knowledge Base mounted</strong><p>Review cases will appear here when a mounted production run creates actionable decisions.</p></div> : reviewsBusy ? <p className="muted">Loading Review Inbox…</p> : reviews && reviews.cases.length > 0 ? <><div className="result-summary">{reviews.total} open case{reviews.total === 1 ? '' : 's'}{reviews.truncated ? ' · list truncated' : ''}</div><div className="review-list">{reviews.cases.map((item) => <button className="review-item" key={item.reviewCaseId} onClick={() => void openReview(item.reviewCaseId)}><strong>{item.category}</strong><span>{item.actionability} · {item.proposalKind}</span><small>{item.rationale}</small></button>)}</div>{reviewDetail ? <div className="object-detail"><div className="detail-title"><span>Review detail</span><button onClick={() => setReviewDetail(undefined)}>Close</button></div><h3>{reviewDetail.reviewCaseId}</h3><p><strong>Classification:</strong> {safeStructured(reviewDetail.classification)}</p><p><strong>Root proposal:</strong> {safeStructured(reviewDetail.rootProposal)}</p><p><strong>Evidence:</strong> {reviewDetail.evidenceBindings.length} binding(s)</p><p><strong>Impact:</strong> {safeStructured(reviewDetail.impact)}</p>{reviewDetail.advisory ? <p><strong>Advisory:</strong> {safeStructured(reviewDetail.advisory)}</p> : null}<p><strong>Dependent proposals:</strong> {reviewDetail.totalDependentProposals}</p><p className="muted">Review Inbox is read-only in v0.1. Decision controls are intentionally not available.</p></div> : null}</> : <div className="notice"><strong>No open Review cases</strong><p>Completed production with review will surface actionable cases here.</p></div>}</section> : null}
        </div>
      </aside>
    </div>
  </main>
}
