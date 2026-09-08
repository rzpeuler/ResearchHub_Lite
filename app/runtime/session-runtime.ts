import { createAgentSessionRuntime, SessionManager, type AgentSession, type AgentSessionRuntime as PiAgentSessionRuntime, type CreateAgentSessionRuntimeFactory } from '@earendil-works/pi-coding-agent'
import { ApplicationServiceError } from '../services/contracts.ts'
import { createResearchHubPiSession } from '../pi/session.ts'
import { ClientEventAdapter, safeSummary, type ClientEventListener } from './client-events.ts'
import type { CurrentSessionState, ResearchHubSessionRuntimeOptions, SafeConversationMessage, SafeConversationSummary } from './contracts.ts'

const MAX_MESSAGE_TEXT = 50_000
const MAX_SESSION_NAME_LENGTH = 200
const PRODUCT_TOOL_SUMMARIES = new Map<string, string>([
  ['researchhub_status', 'ResearchHub status'],
  ['search_knowledge', 'Knowledge search'],
  ['get_knowledge_object', 'Knowledge object lookup'],
  ['ingest_document', 'Document ingestion'],
  ['get_workflow_status', 'Workflow status'],
  ['cancel_workflow', 'Workflow cancellation'],
  ['list_review_cases', 'Review case list'],
  ['get_review_case', 'Review case detail'],
])

export interface StartedPrompt {
  readonly accepted: Promise<void>
  readonly completion: Promise<void>
}

function textContent(value: unknown): string {
  if (typeof value === 'string') return value.slice(0, MAX_MESSAGE_TEXT)
  if (!Array.isArray(value)) return ''
  return value.filter((part): part is { readonly type: 'text'; readonly text: string } => {
    if (!part || typeof part !== 'object') return false
    const candidate = part as { readonly type?: unknown; readonly text?: unknown }
    return candidate.type === 'text' && typeof candidate.text === 'string'
  }).map((part) => part.text).join('').slice(0, MAX_MESSAGE_TEXT)
}

function timestamp(value: unknown): string | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined
  const date = new Date(value)
  return Number.isFinite(date.getTime()) ? date.toISOString() : undefined
}

function safeSessionName(value: unknown): string | undefined {
  if (value === undefined) return undefined
  const projected = safeSummary(value, MAX_SESSION_NAME_LENGTH).trim()
  return projected === '' ? undefined : projected
}

export function toSafeConversationMessage(message: unknown): SafeConversationMessage | undefined {
  if (!message || typeof message !== 'object') return undefined
  const candidate = message as { readonly role?: unknown; readonly content?: unknown; readonly timestamp?: unknown; readonly toolName?: unknown; readonly isError?: unknown }
  if (candidate.role === 'user' || candidate.role === 'assistant') return { role: candidate.role, content: safeSummary(textContent(candidate.content), MAX_MESSAGE_TEXT), timestamp: timestamp(candidate.timestamp) }
  if (candidate.role === 'toolResult' && typeof candidate.toolName === 'string') {
    const productSummary = PRODUCT_TOOL_SUMMARIES.get(candidate.toolName)
    if (productSummary === undefined) return undefined
    const failed = candidate.isError === true
    return { role: 'tool', content: `${productSummary}${failed ? ' failed' : ' completed'}`.slice(0, 120), timestamp: timestamp(candidate.timestamp), toolName: candidate.toolName, isError: failed }
  }
  return undefined
}

function summary(info: Awaited<ReturnType<typeof SessionManager.list>>[number], activeId: string): SafeConversationSummary {
  const name = safeSessionName(info.name)
  return { conversationId: info.id, ...(name === undefined ? {} : { name }), updatedAt: info.modified.toISOString(), messageCount: info.messageCount, isActive: info.id === activeId }
}

/** Thin application adapter over Pi's public AgentSessionRuntime. */
export class ResearchHubSessionRuntime {
  private readonly piRuntime: PiAgentSessionRuntime
  private disposed = false
  private disposing = false
  private replacementTail: Promise<void> = Promise.resolve()
  private readonly clientEventAdapters = new Set<ClientEventAdapter>()

  private constructor(piRuntime: PiAgentSessionRuntime) {
    this.piRuntime = piRuntime
    this.piRuntime.setRebindSession(async (session) => {
      for (const adapter of this.clientEventAdapters) adapter.rebind(session)
    })
  }

  static async create(options: ResearchHubSessionRuntimeOptions): Promise<ResearchHubSessionRuntime> {
    const createRuntime: CreateAgentSessionRuntimeFactory = async ({ cwd, sessionManager, sessionStartEvent }) => {
      const created = await createResearchHubPiSession({
        cwd,
        agentDir: options.agentDir,
        mountedKnowledgeBaseRoot: options.mountedKnowledgeBaseRoot,
        workspaceRoot: options.workspaceRoot,
        reasoningExecutor: options.reasoningExecutor,
        modelRuntime: options.modelRuntime,
        model: options.model,
        sessionManager,
        settingsManager: options.settingsManager,
        resourceLoader: options.resourceLoader,
        applicationServices: options.applicationServices,
        researchService: options.researchService,
        sessionStartEvent,
      })
      return { session: created.session, extensionsResult: created.extensionsResult, modelFallbackMessage: created.modelFallbackMessage, services: created.services, diagnostics: created.services.diagnostics }
    }
    const piRuntime = await createAgentSessionRuntime(createRuntime, { cwd: options.cwd, agentDir: options.agentDir, sessionManager: options.sessionManager })
    return new ResearchHubSessionRuntime(piRuntime)
  }

  get isDisposed(): boolean { return this.disposed }

  private get currentSession(): AgentSession { return this.piRuntime.session }
  private get currentSessionManager(): SessionManager { return this.piRuntime.session.sessionManager }

  getCurrentState(): CurrentSessionState {
    this.ensureOpen()
    const model = this.currentSession.model
    const name = safeSessionName(this.currentSession.sessionName)
    return {
      conversationId: this.currentSession.sessionId,
      ...(name === undefined ? {} : { name }),
      isStreaming: this.currentSession.isStreaming,
      isIdle: this.currentSession.isIdle,
      pendingMessageCount: this.currentSession.pendingMessageCount,
      thinkingLevel: this.currentSession.thinkingLevel,
      ...(model === undefined ? {} : { model: { provider: model.provider, modelId: model.id } }),
    }
  }

  async listConversations(): Promise<readonly SafeConversationSummary[]> {
    this.ensureOpen()
    const activeId = this.currentSession.sessionId
    if (!this.currentSessionManager.isPersisted()) return [{ conversationId: activeId, updatedAt: new Date().toISOString(), messageCount: this.currentSession.messages.length, isActive: true }]
    const sessions = await SessionManager.list(this.currentSessionManager.getCwd(), this.currentSessionManager.getSessionDir())
    return sessions.sort((left, right) => right.modified.getTime() - left.modified.getTime() || left.id.localeCompare(right.id)).map((info) => summary(info, activeId))
  }

  getCurrentMessages(): readonly SafeConversationMessage[] {
    this.ensureOpen()
    return this.currentSession.messages.map(toSafeConversationMessage).filter((message): message is SafeConversationMessage => message !== undefined)
  }

  /** Subscribe to the normalized, client-safe events for the active Pi session. */
  subscribeClientEvents(listener: ClientEventListener): () => void {
    this.ensureOpen()
    const adapter = new ClientEventAdapter()
    const unsubscribeListener = adapter.subscribe(listener)
    adapter.bind(this.currentSession)
    this.clientEventAdapters.add(adapter)
    return () => {
      unsubscribeListener()
      adapter.dispose()
      this.clientEventAdapters.delete(adapter)
    }
  }

  async createConversation(name?: string): Promise<CurrentSessionState> {
    return this.enqueueReplacement(async () => {
      const trimmedName = name?.trim()
      if (trimmedName !== undefined && trimmedName.length > MAX_SESSION_NAME_LENGTH) throw new ApplicationServiceError('invalid_input', 'conversation name is too long')
      const safeName = safeSessionName(trimmedName)
      await this.piRuntime.newSession({ setup: safeName ? async (manager) => { manager.appendSessionInfo(safeName) } : undefined })
      return this.getCurrentState()
    })
  }

  async switchConversation(conversationId: string): Promise<CurrentSessionState> {
    return this.enqueueReplacement(async () => {
      if (typeof conversationId !== 'string' || conversationId.trim() === '') throw new ApplicationServiceError('invalid_input', 'conversationId is required')
      if (!this.currentSessionManager.isPersisted()) throw new ApplicationServiceError('not_found', `Conversation not found: ${conversationId}`)
      const sessions = await SessionManager.list(this.currentSessionManager.getCwd(), this.currentSessionManager.getSessionDir())
      const selected = sessions.find((info) => info.id === conversationId)
      if (!selected) throw new ApplicationServiceError('not_found', `Conversation not found: ${conversationId}`)
      await this.piRuntime.switchSession(selected.path)
      return this.getCurrentState()
    })
  }

  async resumeConversation(conversationId: string): Promise<CurrentSessionState> { return this.switchConversation(conversationId) }
  startPrompt(text: string): StartedPrompt {
    this.ensureOpen()
    let acceptedSettled = false
    let resolveAccepted!: () => void
    let rejectAccepted!: (error: unknown) => void
    const accepted = new Promise<void>((resolve, reject) => { resolveAccepted = resolve; rejectAccepted = reject })
    // The runtime owns observation of both branches so a rejected command is
    // safe even when a caller only needs the acceptance result.
    void accepted.catch(() => undefined)
    const settleAccepted = (success: boolean): void => {
      if (acceptedSettled) return
      acceptedSettled = true
      if (success) resolveAccepted()
      else rejectAccepted(new ApplicationServiceError('conflict', 'Pi rejected the conversation prompt before acceptance'))
    }
    let completion: Promise<void>
    try {
      completion = Promise.resolve(this.currentSession.prompt(text, { preflightResult: settleAccepted }))
    } catch (error) {
      completion = Promise.reject(error)
    }
    void completion.catch((error) => {
      if (!acceptedSettled) {
        acceptedSettled = true
        rejectAccepted(error)
      }
    })
    return { accepted, completion }
  }
  async prompt(text: string): Promise<void> {
    const started = this.startPrompt(text)
    await started.accepted
    await started.completion
  }
  async steer(text: string): Promise<void> { this.ensureOpen(); return this.currentSession.steer(text) }
  async followUp(text: string): Promise<void> { this.ensureOpen(); return this.currentSession.followUp(text) }
  async abort(): Promise<void> { this.ensureOpen(); return this.currentSession.abort() }

  async dispose(): Promise<void> {
    if (this.disposed) return
    if (this.disposing) throw new ApplicationServiceError('failed', 'Application runtime is already disposing')
    this.disposing = true
    try {
      await this.piRuntime.dispose()
      this.disposed = true
    } finally {
      for (const adapter of this.clientEventAdapters) adapter.dispose()
      this.clientEventAdapters.clear()
      this.disposing = false
    }
  }

  private enqueueReplacement<T>(operation: () => Promise<T>): Promise<T> {
    const run = this.replacementTail.then(() => { this.ensureOpen(); return operation() }, () => { this.ensureOpen(); return operation() })
    this.replacementTail = run.then(() => undefined, () => undefined)
    return run
  }

  private ensureOpen(): void { if (this.disposed || this.disposing) throw new ApplicationServiceError('failed', 'Application runtime is closed') }
}

export async function createResearchHubSessionRuntime(options: ResearchHubSessionRuntimeOptions): Promise<ResearchHubSessionRuntime> { return ResearchHubSessionRuntime.create(options) }
