export type RuntimeErrorCode = 'invalid_input' | 'not_found' | 'cancelled' | 'failed' | 'conflict' | 'no_kb_mounted' | 'unauthorized_runtime_token'

export interface RuntimeErrorBody { readonly code: RuntimeErrorCode | string; readonly error: string }

export class RuntimeClientError extends Error {
  readonly code: string
  readonly status: number
  constructor(code: string, message: string, status: number) {
    super(message)
    this.name = 'RuntimeClientError'
    this.code = code
    this.status = status
  }
}

export interface ConversationSummary { readonly conversationId: string; readonly name?: string; readonly updatedAt: string; readonly messageCount: number; readonly isActive: boolean }
export interface SessionState { readonly conversationId: string; readonly name?: string; readonly isStreaming: boolean; readonly isIdle: boolean; readonly pendingMessageCount: number; readonly thinkingLevel: string; readonly model?: { readonly provider: string; readonly modelId: string } }
export interface ConversationMessage { readonly role: 'user' | 'assistant' | 'tool'; readonly content: string; readonly timestamp?: string; readonly toolName?: string; readonly isError?: boolean }
export interface KnowledgeBaseStatus { readonly knowledgeBaseId: string; readonly rootRef: string; readonly revision: number; readonly status: string; readonly schemaVersion: string; readonly storageFormatVersion: string; readonly counts: Readonly<Record<string, number>> }
export interface KnowledgeSearchResult { readonly ref: string; readonly kind: string; readonly semanticType?: string; readonly displayName?: string; readonly summary?: string }
export interface KnowledgeSearchResponse { readonly results: readonly KnowledgeSearchResult[]; readonly total: number; readonly limit: number; readonly truncated: boolean }
export interface KnowledgeObjectResponse { readonly ref: string; readonly kind: string; readonly object: unknown; readonly relatedRelations?: readonly unknown[]; readonly relatedClaims?: readonly unknown[]; readonly supportingSources?: readonly unknown[]; readonly relatedEntities?: readonly unknown[]; readonly truncation?: Readonly<Record<string, { readonly limit: number; readonly total: number; readonly truncated: boolean }>> }
export type KnowledgeGraphEntityType = 'investment_theme' | 'industry' | 'company' | 'product' | 'technology'
export interface KnowledgeGraphNode { readonly ref: string; readonly entityType: KnowledgeGraphEntityType; readonly label: string; readonly secondaryLabel?: string; readonly lifecycleStatus: string; readonly isRoot: boolean }
export interface KnowledgeGraphEdge { readonly ref: string; readonly relationType: string; readonly sourceRef: string; readonly targetRef: string; readonly label: string }
export interface KnowledgeGraphProjection { readonly rootRef: string; readonly profile: string; readonly depth: 1 | 2; readonly nodes: readonly KnowledgeGraphNode[]; readonly edges: readonly KnowledgeGraphEdge[]; readonly nodeTotal: number; readonly edgeTotal: number; readonly nodeLimit: number; readonly edgeLimit: number; readonly truncated: boolean }
export interface KnowledgeDirectoryItem { readonly ref: string; readonly name: string }
export interface KnowledgeDirectorySection { readonly items: readonly KnowledgeDirectoryItem[]; readonly total: number; readonly limit: number; readonly truncated: boolean }
export interface KnowledgeDirectoryProjection { readonly themeGroups: readonly { readonly ref: string; readonly name: string; readonly themes: readonly KnowledgeDirectoryItem[] }[]; readonly industries: KnowledgeDirectorySection; readonly companies: KnowledgeDirectorySection; readonly products: KnowledgeDirectorySection; readonly technologies: KnowledgeDirectorySection }
export type WorkflowStatus = 'pending' | 'running' | 'completed' | 'completed_with_review' | 'blocked' | 'cancelled' | 'failed'
export interface WorkflowRun { readonly runId: string; readonly workflowType: string; readonly objective: string; readonly status: WorkflowStatus; readonly currentStage?: string; readonly progressSummary?: string; readonly startedAt: string; readonly updatedAt: string; readonly completedAt?: string; readonly reviewCount?: number; readonly errorSummary?: string }
export interface ReviewSummary { readonly reviewCaseId: string; readonly producerRunId: string; readonly producerType: string; readonly createdAt: string; readonly category: string; readonly actionability: string; readonly origin: string; readonly rationale: string; readonly proposalKind: string; readonly semanticType: string; readonly dependentProposalCount: number; readonly suggestedNextAction?: string; readonly status: string }
export interface ReviewListResponse { readonly cases: readonly ReviewSummary[]; readonly total: number; readonly limit: number; readonly truncated: boolean }
export interface ReviewDetail { readonly reviewCaseId: string; readonly producerRunId: string; readonly producerType: string; readonly createdAt: string; readonly classification: unknown; readonly rootProposal: unknown; readonly evidenceBindings: readonly unknown[]; readonly existingKnowledgeProjections: readonly unknown[]; readonly impact: unknown; readonly advisory?: unknown; readonly state: unknown; readonly totalDependentProposals: number; readonly dependentProposalSamples: readonly unknown[]; readonly dependentProposals: readonly unknown[]; readonly dependentsTruncated: boolean }
export interface AttachmentRef { readonly attachmentId: string; readonly filename: string; readonly mediaType: string; readonly size: number; readonly sha256: string; readonly createdAt: string }
export interface ClientEvent { readonly eventId: string; readonly conversationId: string; readonly timestamp: string; readonly type: string; readonly role?: 'user' | 'assistant'; readonly summary?: string; readonly status?: string; readonly toolCallId?: string; readonly name?: string; readonly isError?: boolean; readonly steeringCount?: number; readonly followUpCount?: number; readonly code?: string }
export interface BootstrapResponse { readonly runtime: { readonly origin: string; readonly runtimeToken: string }; readonly origin: string; readonly session: SessionState; readonly conversations: readonly ConversationSummary[]; readonly knowledgeBase?: KnowledgeBaseStatus; readonly openReviewCases?: number; readonly knowledgeError?: RuntimeErrorBody }

type FetchResponseLike = Pick<Response, 'ok' | 'status' | 'json'>
type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<FetchResponseLike>
type HeaderBag = { set: (name: string, value: string) => void; has: (name: string) => boolean; forEach: (callback: (value: string, key: string) => void) => void }
type EventSourceLike = { onopen: ((event: Event) => void) | null; onerror: ((event: Event) => void) | null; close: () => void; addEventListener: (type: string, listener: (event: MessageEvent<string>) => void) => void; removeEventListener: (type: string, listener: (event: MessageEvent<string>) => void) => void }
type EventSourceFactory = (url: string) => EventSourceLike

function createHeaders(input?: HeadersInit): HeaderBag {
  const constructor = globalThis.Headers
  if (typeof constructor === 'function') return new constructor(input)
  const values = new Map<string, string>()
  const add = (name: string, value: string): void => { values.set(name.toLowerCase(), value) }
  if (Array.isArray(input)) input.forEach(([name, value]) => add(name, value))
  else if (input !== undefined) Object.entries(input).forEach(([name, value]) => add(name, String(value)))
  return { set: (name, value) => add(name, value), has: (name) => values.has(name.toLowerCase()), forEach: (callback) => values.forEach((value, key) => callback(value, key)) }
}

function xhrFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<FetchResponseLike> {
  const constructor = globalThis.XMLHttpRequest
  if (typeof constructor !== 'function') return Promise.reject(new Error('Browser network APIs are unavailable'))
  return new Promise((resolve, reject) => {
    const request = new constructor()
    request.open(init.method ?? 'GET', String(input), true)
    createHeaders(init.headers).forEach((value, key) => request.setRequestHeader(key, value))
    request.onload = () => resolve({ ok: request.status >= 200 && request.status < 300, status: request.status, json: async () => JSON.parse(request.responseText) })
    request.onerror = () => reject(new Error('ResearchHub Runtime network request failed'))
    request.ontimeout = () => reject(new Error('ResearchHub Runtime network request timed out'))
    request.send(init.body as XMLHttpRequestBodyInit | null | undefined)
  })
}

function defaultFetch(input: RequestInfo | URL, init?: RequestInit): Promise<FetchResponseLike> {
  const fetchFunction = globalThis.fetch
  if (typeof fetchFunction === 'function') return fetchFunction(input, init)
  return xhrFetch(input, init)
}

const defaultEventSourceFactory: EventSourceFactory = (url) => {
  const constructor = globalThis.EventSource
  if (typeof constructor !== 'function') return { onopen: null, onerror: null, close: () => undefined, addEventListener: () => undefined, removeEventListener: () => undefined }
  return new constructor(url)
}

function isRecord(value: unknown): value is Record<string, unknown> { return Boolean(value) && typeof value === 'object' && !Array.isArray(value) }
function stringValue(value: unknown): string | undefined { return typeof value === 'string' ? value : undefined }
function safeErrorMessage(value: unknown): string { return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, 300) : 'ResearchHub runtime operation failed' }

function safeEvent(value: unknown): ClientEvent | undefined {
  if (!isRecord(value) || typeof value.eventId !== 'string' || typeof value.conversationId !== 'string' || typeof value.timestamp !== 'string' || typeof value.type !== 'string') return undefined
  const allowed = new Set(['agent.started', 'agent.completed', 'message.started', 'message.delta', 'message.completed', 'tool.started', 'tool.updated', 'tool.completed', 'queue.updated', 'session.changed', 'thinking.status', 'error'])
  if (!allowed.has(value.type)) return undefined
  const role = stringValue(value.role)
  const event: ClientEvent = {
    eventId: value.eventId,
    conversationId: value.conversationId,
    timestamp: value.timestamp,
    type: value.type,
    ...(role === 'user' || role === 'assistant' ? { role } : {}),
    ...(stringValue(value.summary) === undefined ? {} : { summary: stringValue(value.summary) }),
    ...(stringValue(value.status) === undefined ? {} : { status: stringValue(value.status) }),
    ...(stringValue(value.toolCallId) === undefined ? {} : { toolCallId: stringValue(value.toolCallId) }),
    ...(stringValue(value.name) === undefined ? {} : { name: stringValue(value.name) }),
    ...(typeof value.isError === 'boolean' ? { isError: value.isError } : {}),
    ...(Number.isSafeInteger(value.steeringCount) ? { steeringCount: value.steeringCount as number } : {}),
    ...(Number.isSafeInteger(value.followUpCount) ? { followUpCount: value.followUpCount as number } : {}),
    ...(stringValue(value.code) === undefined ? {} : { code: stringValue(value.code) }),
  }
  return event
}

export function parseClientEvent(data: string): ClientEvent | undefined { try { return safeEvent(JSON.parse(data)) } catch { return undefined } }

export class RuntimeClient {
  private readonly fetchImpl: FetchLike
  private runtimeToken?: string

  constructor(fetchImpl: FetchLike = defaultFetch) { this.fetchImpl = fetchImpl }

  private async request<T>(path: string, init: RequestInit = {}, mutation = false): Promise<T> {
    const headers = createHeaders(init.headers)
    headers.set('Accept', 'application/json')
    if (mutation) {
      if (this.runtimeToken === undefined) throw new RuntimeClientError('unauthorized_runtime_token', 'Runtime authorization is not ready', 401)
      headers.set('X-ResearchHub-Runtime-Token', this.runtimeToken)
    }
    const isFormData = typeof globalThis.FormData === 'function' && init.body instanceof globalThis.FormData
    if (init.body !== undefined && !headers.has('Content-Type') && !isFormData) headers.set('Content-Type', 'application/json')
    const response = await this.fetchImpl(path, { ...init, headers: headers as unknown as HeadersInit })
    let body: unknown
    try { body = await response.json() } catch { body = undefined }
    if (!response.ok) {
      const error = isRecord(body) ? body as unknown as RuntimeErrorBody : undefined
      const message = response.status === 401 ? 'ResearchHub Runtime authorization expired. Reload the page.' : safeErrorMessage(error?.error)
      throw new RuntimeClientError(error?.code ?? 'failed', message, response.status)
    }
    return body as T
  }

  async bootstrap(): Promise<BootstrapResponse> { const value = await this.request<BootstrapResponse>('/api/bootstrap'); this.runtimeToken = value.runtime.runtimeToken; return value }
  clearToken(): void { this.runtimeToken = undefined }
  async listConversations(): Promise<readonly ConversationSummary[]> { return (await this.request<{ conversations: readonly ConversationSummary[] }>('/api/conversations')).conversations }
  async currentSession(): Promise<SessionState> { return this.request<SessionState>('/api/conversations/current') }
  async messages(): Promise<{ readonly conversationId: string; readonly messages: readonly ConversationMessage[] }> { return this.request('/api/conversations/messages') }
  async newConversation(name?: string): Promise<SessionState> { return this.mutate<SessionState>('/api/conversations/new', { ...(name ? { name } : {}) }) }
  async switchConversation(conversationId: string): Promise<SessionState> { return this.mutate<SessionState>('/api/conversations/switch', { conversationId }) }
  async command(operation: 'prompt' | 'steer' | 'follow_up', text: string): Promise<{ readonly accepted: boolean; readonly conversationId: string; readonly run: { readonly runId: string; readonly operation: string } }> { return this.mutate(operation === 'follow_up' ? '/api/conversations/follow_up' : `/api/conversations/${operation}`, { text }) }
  async abort(): Promise<{ readonly accepted: boolean; readonly aborted: boolean }> { return this.mutate('/api/conversations/abort', {}) }
  async searchKnowledge(query: string, entityType?: string): Promise<KnowledgeSearchResponse> { const params = new URLSearchParams({ query }); if (entityType) params.set('entityType', entityType); return this.request(`/api/knowledge/search?${params.toString()}`) }
  async getKnowledgeObject(ref: string): Promise<KnowledgeObjectResponse> { return this.request(`/api/knowledge/object?${new URLSearchParams({ ref }).toString()}`) }
  async getKnowledgeDirectory(): Promise<KnowledgeDirectoryProjection> { return this.request('/api/knowledge/directory') }
  async getKnowledgeGraph(input: { readonly rootRef: string; readonly depth?: 1 | 2; readonly maxNodes?: number; readonly maxEdges?: number }): Promise<KnowledgeGraphProjection> { const params = new URLSearchParams({ rootRef: input.rootRef }); if (input.depth !== undefined) params.set('depth', String(input.depth)); if (input.maxNodes !== undefined) params.set('maxNodes', String(input.maxNodes)); if (input.maxEdges !== undefined) params.set('maxEdges', String(input.maxEdges)); return this.request(`/api/knowledge/graph?${params.toString()}`) }
  async listReviews(): Promise<ReviewListResponse> { return this.request('/api/reviews') }
  async getReview(reviewCaseId: string): Promise<ReviewDetail> { return this.request(`/api/reviews/${encodeURIComponent(reviewCaseId)}`) }
  async workflow(runId: string): Promise<WorkflowRun> { return this.request(`/api/workflows/${encodeURIComponent(runId)}`) }
  async cancelWorkflow(runId: string): Promise<unknown> { return this.mutate('/api/workflows/cancel', { runId }) }
  async uploadAttachment(file: File): Promise<AttachmentRef> { const form = new FormData(); form.append('file', file, file.name); const value = await this.request<{ attachment: AttachmentRef }>('/api/attachments', { method: 'POST', body: form }, true); return value.attachment }
  async startProduction(attachmentId: string): Promise<{ readonly accepted: boolean; readonly runId: string; readonly workflow?: WorkflowRun }> { return this.mutate('/api/production/ingest', { attachmentId }) }
  openEvents(onEvent: (event: ClientEvent) => void, onReconnect: () => void, eventSourceFactory: EventSourceFactory = defaultEventSourceFactory): () => void {
    const source = eventSourceFactory('/api/events')
    const eventTypes = ['agent.started', 'agent.completed', 'message.started', 'message.delta', 'message.completed', 'tool.started', 'tool.updated', 'tool.completed', 'queue.updated', 'session.changed', 'thinking.status', 'error']
    const listener = (event: MessageEvent<string>) => { const parsed = parseClientEvent(event.data); if (parsed) onEvent(parsed) }
    source.onopen = onReconnect
    eventTypes.forEach((type) => source.addEventListener(type, listener))
    return () => { source.close(); eventTypes.forEach((type) => source.removeEventListener(type, listener)); source.onopen = null; source.onerror = null }
  }
  private mutate<T>(path: string, value: unknown): Promise<T> { return this.request<T>(path, { method: 'POST', body: JSON.stringify(value) }, true) }
}
