import { randomUUID } from 'node:crypto'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { pipeline } from 'node:stream/promises'
import { createReadStream } from 'node:fs'
import { lstat, realpath, stat } from 'node:fs/promises'
import { isAbsolute, join, relative, resolve } from 'node:path'
import { ApplicationServiceError, type IngestDocumentInput, type KnowledgeSearchInput, type ReviewCaseListInput } from '../services/contracts.ts'
import { createResearchHubApplicationRuntime, ResearchHubApplicationRuntime } from './application-runtime.ts'
import { AttachmentService, DEFAULT_MAX_ATTACHMENT_BYTES } from './attachment-service.ts'
import { ClientEventStream } from './event-stream.ts'
import { RuntimeSecurity, RuntimeSecurityError, assertLoopbackBindAddress, type LoopbackBindAddress } from './security.ts'
import type { CurrentSessionState, ResearchHubApplicationRuntimeOptions } from './contracts.ts'
import { safeIdentifier, safeSummary, type ClientEvent } from './client-events.ts'

const MAX_JSON_BYTES = 1_000_000
const MAX_MESSAGE_LENGTH = 50_000
const MAX_SESSION_NAME_LENGTH = 200
const TOKEN_HEADER = 'x-researchhub-runtime-token'
const MAX_SSE_PENDING_FRAMES = 64
const MAX_BACKGROUND_OPERATIONS = 128
const CLIENT_MIME_TYPES: Readonly<Record<string, string>> = { '.css': 'text/css; charset=utf-8', '.gif': 'image/gif', '.html': 'text/html; charset=utf-8', '.ico': 'image/x-icon', '.jpeg': 'image/jpeg', '.jpg': 'image/jpeg', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.map': 'application/json; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.txt': 'text/plain; charset=utf-8', '.webp': 'image/webp', '.woff': 'font/woff', '.woff2': 'font/woff2' }

export interface ResearchHubRuntimeServerOptions extends Omit<ResearchHubApplicationRuntimeOptions, 'cwd'> {
  readonly cwd?: string
  readonly runtime?: ResearchHubApplicationRuntime
  readonly bindAddress?: string
  readonly port?: number
  readonly clientRoot?: string
  readonly attachmentService?: AttachmentService
  readonly maxSseSubscribers?: number
}

export interface RuntimeServerInfo {
  readonly bindAddress: LoopbackBindAddress
  readonly port: number
  readonly origin: string
  readonly runtimeToken: string
}

interface SseClient {
  readonly response: ServerResponse
  unsubscribe: () => void
  heartbeat?: ReturnType<typeof setInterval>
  onClose: () => void
  onDrain: () => void
  readonly pendingFrames: string[]
  waitingForDrain: boolean
}
type RuntimeServerLifecycle = 'idle' | 'starting' | 'running' | 'closing' | 'closed'
interface BackgroundOperation { readonly completion: Promise<void>; readonly cancel: () => void | Promise<void> }

function httpStatus(code: string): number {
  if (code === 'invalid_input') return 400
  if (code === 'unauthorized_runtime_token') return 401
  if (code === 'not_found') return 404
  if (code === 'no_kb_mounted') return 503
  if (code === 'conflict' || code === 'cancelled') return 409
  return 500
}

function errorCode(error: unknown): string {
  if (error instanceof ApplicationServiceError) return error.code
  if (error instanceof RuntimeSecurityError) return 'unauthorized_runtime_token'
  return 'failed'
}

function safeError(error: unknown): { readonly code: string; readonly error: string } {
  const code = errorCode(error)
  if (code === 'unauthorized_runtime_token') return { code, error: 'Runtime request authorization failed' }
  if (error instanceof ApplicationServiceError) return { code, error: safeSummary(error.message, 300) || 'Application operation failed' }
  if (code === 'not_found') return { code, error: 'Resource not found' }
  return { code, error: 'ResearchHub runtime operation failed' }
}

function combineErrors(errors: readonly unknown[], message: string): unknown {
  if (errors.length === 1) return errors[0]
  return new AggregateError(errors, message)
}

function originFor(bindAddress: LoopbackBindAddress, port: number): string { return `http://${bindAddress === '::1' ? `[${bindAddress}]` : bindAddress}:${port}` }

function positiveInteger(value: string | null): number | undefined {
  if (value === null) return undefined
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : Number.NaN
}

function decodeSegment(value: string): string {
  try { return decodeURIComponent(value) } catch { throw new ApplicationServiceError('invalid_input', 'URL path segment is invalid') }
}

function isInsideStaticRoot(root: string, candidate: string): boolean {
  const child = relative(resolve(root), resolve(candidate))
  return child === '' || (!isAbsolute(child) && child !== '..' && !child.startsWith(`..${'\\'}`) && !child.startsWith(`..${'/'}`))
}

/** Local Node HTTP/SSE adapter over the shared Application Runtime and Services. */
export class ResearchHubRuntimeServer {
  private readonly options: ResearchHubRuntimeServerOptions
  private readonly clientRoot: string
  private readonly bindAddress: LoopbackBindAddress
  private readonly port: number
  private runtime?: ResearchHubApplicationRuntime
  private ownsRuntime: boolean
  private startPromise?: Promise<RuntimeServerInfo>
  private closePromise?: Promise<void>
  private attachmentService?: AttachmentService
  private httpServer?: Server
  private runtimeSecurity?: RuntimeSecurity
  private runtimeInfo?: RuntimeServerInfo
  private unsubscribeSessionEvents?: () => void
  private readonly eventStream: ClientEventStream
  private readonly sseClients = new Set<SseClient>()
  private readonly backgroundOperations = new Set<BackgroundOperation>()
  private lifecycle: RuntimeServerLifecycle = 'idle'

  constructor(options: ResearchHubRuntimeServerOptions) {
    this.options = options
    this.clientRoot = resolve(options.clientRoot ?? join(options.cwd ?? process.cwd(), 'dist', 'client'))
    this.bindAddress = assertLoopbackBindAddress(options.bindAddress ?? '127.0.0.1')
    const selectedPort = options.port ?? 0
    if (!Number.isInteger(selectedPort) || selectedPort < 0 || selectedPort > 65_535) throw new ApplicationServiceError('invalid_input', 'port must be an integer between 0 and 65535')
    this.port = selectedPort
    this.runtime = options.runtime
    this.ownsRuntime = options.runtime === undefined
    this.attachmentService = options.attachmentService
    this.eventStream = new ClientEventStream(options.maxSseSubscribers)
  }

  static async create(options: ResearchHubRuntimeServerOptions): Promise<ResearchHubRuntimeServer> {
    const server = new ResearchHubRuntimeServer(options)
    await server.start()
    return server
  }

  get origin(): string | undefined { return this.runtimeInfo?.origin }
  get runtimeToken(): string | undefined { return this.runtimeInfo?.runtimeToken }
  get security(): RuntimeSecurity | undefined { return this.runtimeSecurity }
  get address(): RuntimeServerInfo | undefined { return this.runtimeInfo }
  get applicationRuntime(): ResearchHubApplicationRuntime | undefined { return this.runtime }

  start(): Promise<RuntimeServerInfo> {
    if (this.lifecycle === 'closing') return Promise.reject(new ApplicationServiceError('conflict', 'Runtime server is closing'))
    if (this.lifecycle === 'closed') return Promise.reject(new ApplicationServiceError('failed', 'Runtime server is closed'))
    if (this.runtimeInfo) return Promise.resolve(this.runtimeInfo)
    if (this.startPromise) return this.startPromise
    this.lifecycle = 'starting'
    const startPromise = this.startInternal()
    this.startPromise = startPromise
    void startPromise.then(
      () => {
        if (this.startPromise !== startPromise) return
        this.startPromise = undefined
        if (this.lifecycle === 'starting') this.lifecycle = 'running'
      },
      () => {
        if (this.startPromise !== startPromise) return
        this.startPromise = undefined
        if (this.lifecycle === 'starting') this.lifecycle = 'idle'
      },
    )
    return startPromise
  }

  private async startInternal(): Promise<RuntimeServerInfo> {
    if (!this.runtime) {
      this.runtime = await createResearchHubApplicationRuntime({ cwd: this.options.cwd ?? process.cwd(), agentDir: this.options.agentDir, sessionDir: this.options.sessionDir, mountedKnowledgeBaseRoot: this.options.mountedKnowledgeBaseRoot, workspaceRoot: this.options.workspaceRoot, modelRuntime: this.options.modelRuntime, sessionManager: this.options.sessionManager, model: this.options.model, reasoningExecutor: this.options.reasoningExecutor, settingsManager: this.options.settingsManager, resourceLoader: this.options.resourceLoader })
      this.ownsRuntime = true
    }
    this.attachmentService ??= new AttachmentService({ workspaceRoot: this.runtime.workspaceRoot, forbiddenRoot: this.runtime.mountedKnowledgeBaseRoot, maxBytes: DEFAULT_MAX_ATTACHMENT_BYTES })
    if (this.runtime.mountedKnowledgeBaseRoot !== undefined) await this.attachmentService.assertCompatibleWithKnowledgeBase(this.runtime.mountedKnowledgeBaseRoot)
    this.httpServer = createServer((request, response) => { void this.handle(request, response) })
    try {
      const address = await new Promise<{ readonly port: number }>((resolve, reject) => {
        const onError = (error: Error) => { this.httpServer?.off('error', onError); reject(error) }
        this.httpServer!.once('error', onError)
        this.httpServer!.listen(this.port, this.bindAddress, () => {
          this.httpServer!.off('error', onError)
          const selected = this.httpServer!.address()
          if (!selected || typeof selected === 'string') { reject(new Error('Runtime server did not expose a TCP address')); return }
          resolve({ port: selected.port })
        })
      })
      const origin = originFor(this.bindAddress, address.port)
      this.runtimeSecurity = new RuntimeSecurity({ bindAddress: this.bindAddress, expectedOrigin: origin })
      this.unsubscribeSessionEvents = this.runtime.sessionRuntime.subscribeClientEvents((event) => this.eventStream.publish(event))
      this.runtimeInfo = { bindAddress: this.bindAddress, port: address.port, origin, runtimeToken: this.runtimeSecurity.runtimeToken }
      return this.runtimeInfo
    } catch (error) {
      const cleanupErrors: unknown[] = []
      try { await this.stopHttpServer() } catch (cleanupError) { cleanupErrors.push(cleanupError) }
      if (this.ownsRuntime && this.runtime) {
        try {
          await this.runtime.close()
          this.runtime = undefined
          this.ownsRuntime = false
        } catch (cleanupError) { cleanupErrors.push(cleanupError) }
      }
      throw combineErrors([error, ...cleanupErrors], 'Runtime server startup and cleanup failed')
    }
  }

  close(): Promise<void> {
    if (this.lifecycle === 'closed') return Promise.resolve()
    if (this.closePromise) return this.closePromise
    this.lifecycle = 'closing'
    const closePromise = this.closeInternal()
    this.closePromise = closePromise
    void closePromise.then(
      () => { if (this.closePromise === closePromise) this.closePromise = undefined },
      () => { if (this.closePromise === closePromise) this.closePromise = undefined },
    )
    return closePromise
  }

  private async closeInternal(): Promise<void> {
    const cleanupErrors: unknown[] = []
    if (this.startPromise) {
      try { await this.startPromise } catch (error) { cleanupErrors.push(error) }
    }
    await this.cancelAndSettleBackgroundOperations(cleanupErrors)
    try {
      this.unsubscribeSessionEvents?.()
      this.unsubscribeSessionEvents = undefined
    } catch (error) { cleanupErrors.push(error) }
    try {
      for (const client of [...this.sseClients]) this.removeSseClient(client)
    } catch (error) { cleanupErrors.push(error) }
    try { this.eventStream.clear() } catch (error) { cleanupErrors.push(error) }
    try { await this.stopHttpServer() } catch (error) { cleanupErrors.push(error) }
    // Background command/production promises have rejection handlers installed by
    // trackBackground; they are deliberately not awaited during process shutdown.
    if (this.ownsRuntime && this.runtime) {
      try {
        await this.runtime.close()
        this.runtime = undefined
        this.ownsRuntime = false
      } catch (error) { cleanupErrors.push(error) }
    }
    this.runtimeInfo = undefined
    this.runtimeSecurity = undefined
    if (cleanupErrors.length > 0) throw combineErrors(cleanupErrors, 'Runtime server cleanup failed')
    this.lifecycle = 'closed'
  }

  private async cancelAndSettleBackgroundOperations(errors: unknown[]): Promise<void> {
    const operations = [...this.backgroundOperations]
    const cancellationPromises: Promise<void>[] = []
    for (const operation of operations) {
      try {
        const result = operation.cancel()
        if (result !== undefined) cancellationPromises.push(Promise.resolve(result).catch((error) => { errors.push(error) }))
      } catch (error) { errors.push(error) }
    }
    await Promise.all(cancellationPromises)
    const settlements = await Promise.allSettled(operations.map((operation) => operation.completion))
    for (const settlement of settlements) if (settlement.status === 'rejected') errors.push(settlement.reason)
    this.backgroundOperations.clear()
  }

  async dispose(): Promise<void> { return this.close() }

  private async stopHttpServer(): Promise<void> {
    const server = this.httpServer
    if (!server) return
    const idle = server as Server & { closeIdleConnections?: () => void }
    idle.closeIdleConnections?.()
    try {
      await new Promise<void>((resolve, reject) => { server.close((error) => error ? reject(error) : resolve()) })
      this.httpServer = undefined
    } catch (error) {
      if (!server.listening) this.httpServer = undefined
      throw error
    }
  }

  private async handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    try {
      if (this.lifecycle !== 'running') throw new ApplicationServiceError(this.lifecycle === 'closing' ? 'conflict' : 'failed', this.lifecycle === 'closing' ? 'Runtime server is closing' : 'Runtime server is not ready')
      const security = this.runtimeSecurity
      if (!security || !this.runtime || !this.runtimeInfo) throw new ApplicationServiceError('failed', 'Runtime server is not ready')
      const url = new URL(request.url ?? '/', `http://${request.headers.host ?? '127.0.0.1'}`)
      if (request.method === 'OPTIONS') { this.validateRead(request); this.sendEmpty(response, 204); return }
      if (url.pathname === '/api/bootstrap') { this.validateBootstrap(request); await this.bootstrap(response); return }
      if (url.pathname === '/api/events' && request.method === 'GET') { this.validateRead(request); this.openEvents(response); return }
      if (this.isMutation(request.method, url.pathname)) this.validateMutation(request)
      else this.validateRead(request)
      if (url.pathname !== '/api' && !url.pathname.startsWith('/api/')) {
        if (await this.serveClient(request, response, url)) return
      }
      await this.route(request, response, url)
    } catch (error) {
      if (response.headersSent) { response.destroy(); return }
      this.sendError(response, error)
    }
  }

  private isMutation(method: string | undefined, pathname: string): boolean {
    if (method !== 'POST' && method !== 'PUT' && method !== 'PATCH' && method !== 'DELETE') return false
    return pathname.startsWith('/api/')
  }

  private async serveClient(request: IncomingMessage, response: ServerResponse, url: URL): Promise<boolean> {
    if (request.method !== 'GET' && request.method !== 'HEAD') return false
    let decodedPath: string
    try { decodedPath = decodeURIComponent(url.pathname) } catch { this.sendStaticNotFound(response); return true }
    if (decodedPath.includes('\u0000') || decodedPath.includes('\\')) { this.sendStaticNotFound(response); return true }
    const segments = decodedPath.split('/').filter((segment) => segment.length > 0)
    if (segments.includes('..')) { this.sendStaticNotFound(response); return true }
    const clientRoot = await realpath(this.clientRoot).catch(() => undefined)
    if (clientRoot === undefined || !(await lstat(clientRoot).then((info) => info.isDirectory() && !info.isSymbolicLink()).catch(() => false))) return false
    const requestedPath = segments.length === 0 ? join(this.clientRoot, 'index.html') : join(this.clientRoot, ...segments)
    let filePath = requestedPath
    let fileInfo = await lstat(filePath).catch(() => undefined)
    const isAsset = decodedPath === '/assets' || decodedPath.startsWith('/assets/')
    if (!fileInfo) {
      if (isAsset || /\.[^/]+$/.test(decodedPath)) { this.sendStaticNotFound(response); return true }
      filePath = join(this.clientRoot, 'index.html')
      fileInfo = await lstat(filePath).catch(() => undefined)
    }
    if (!fileInfo || fileInfo.isDirectory()) { this.sendStaticNotFound(response); return true }
    const resolvedPath = await realpath(filePath).catch(() => undefined)
    if (resolvedPath === undefined || !isInsideStaticRoot(clientRoot, resolvedPath)) { this.sendStaticNotFound(response); return true }
    const resolvedInfo = await stat(resolvedPath).catch(() => undefined)
    if (!resolvedInfo?.isFile()) { this.sendStaticNotFound(response); return true }
    const extension = resolvedPath.slice(resolvedPath.lastIndexOf('.')).toLowerCase()
    const headers = { ...this.runtimeSecurity!.corsHeaders(), 'Cache-Control': isAsset ? 'public, max-age=31536000, immutable' : 'no-store', 'Content-Type': CLIENT_MIME_TYPES[extension] ?? 'application/octet-stream', 'Content-Length': String(resolvedInfo.size) }
    response.writeHead(200, headers)
    if (request.method === 'HEAD') { response.end(); return true }
    await pipeline(createReadStream(resolvedPath), response)
    return true
  }

  private sendStaticNotFound(response: ServerResponse): void { if (response.writableEnded) return; response.writeHead(404, { ...this.runtimeSecurity!.corsHeaders(), 'Cache-Control': 'no-store', 'Content-Type': 'text/plain; charset=utf-8' }); response.end('Not found') }

  private validateBootstrap(request: IncomingMessage): void {
    this.validateRead(request)
  }

  private validateRead(request: IncomingMessage): void {
    const security = this.runtimeSecurity!
    const origin = typeof request.headers.origin === 'string' ? request.headers.origin : security.expectedOrigin
    security.validateRequest({ host: request.headers.host, origin }, 'read')
  }

  private validateMutation(request: IncomingMessage): void {
    this.runtimeSecurity!.validateRequest({ host: request.headers.host, origin: request.headers.origin, runtimeToken: request.headers[TOKEN_HEADER] as string | undefined }, 'mutation')
  }

  private async route(request: IncomingMessage, response: ServerResponse, url: URL): Promise<void> {
    const method = request.method ?? 'GET'
    const path = url.pathname
    if (method === 'GET' && (path === '/api/researchhub/status' || path === '/api/status')) { await this.sendJson(response, 200, await this.status()) ; return }
    if ((method === 'GET' || method === 'POST') && (path === '/api/knowledge/search' || path === '/api/search-knowledge')) { const input = (method === 'GET' ? this.searchInputFromQuery(url) : await this.readJson(request)) as KnowledgeSearchInput; await this.sendJson(response, 200, await this.runtime!.knowledgeService.searchKnowledge(input)); return }
    if (method === 'GET' && (path === '/api/knowledge/object' || path === '/api/knowledge/get')) { await this.sendJson(response, 200, await this.runtime!.knowledgeService.getKnowledgeObject(url.searchParams.get('ref') ?? '', positiveInteger(url.searchParams.get('relatedLimit')))); return }
    if (method === 'POST' && path === '/api/knowledge/object') { const input = await this.readJson(request); await this.sendJson(response, 200, await this.runtime!.knowledgeService.getKnowledgeObject(this.stringField(input, 'ref'), this.optionalPositive(input, 'relatedLimit'))); return }
    if (method === 'GET' && path.startsWith('/api/workflows/')) { const runId = decodeSegment(path.split('/')[3] ?? ''); const value = this.runtime!.workflowService.getWorkflowStatus(runId); if (!value) throw new ApplicationServiceError('not_found', 'Workflow run not found'); await this.sendJson(response, 200, value); return }
    if (method === 'POST' && (path === '/api/workflows/cancel' || /^\/api\/workflows\/[^/]+\/cancel$/.test(path))) { const body = await this.readJson(request); const runId = path === '/api/workflows/cancel' ? this.stringField(body, 'runId') : decodeSegment(path.split('/')[3]!); await this.sendJson(response, 200, this.runtime!.workflowService.cancelWorkflow(runId)); return }
    if (method === 'GET' && (path === '/api/reviews' || path === '/api/review-cases')) { await this.sendJson(response, 200, await this.runtime!.reviewService.listOpenReviewCases(this.reviewInputFromQuery(url))); return }
    if (method === 'GET' && (path.startsWith('/api/reviews/') || path.startsWith('/api/review-cases/'))) { const pieces = path.split('/'); await this.sendJson(response, 200, await this.runtime!.reviewService.getReviewCase(decodeSegment(pieces[3] ?? ''), positiveInteger(url.searchParams.get('dependentLimit')))); return }
    if (method === 'GET' && (path === '/api/conversations' || path === '/api/conversation/list')) { await this.sendJson(response, 200, { conversations: await this.runtime!.sessionRuntime.listConversations() }); return }
    if (method === 'GET' && (path === '/api/conversations/current' || path === '/api/conversation/current')) { await this.sendJson(response, 200, this.sessionState()); return }
    if (method === 'GET' && (path === '/api/conversations/messages' || path === '/api/conversation/messages')) { await this.sendJson(response, 200, { conversationId: this.sessionState().conversationId, messages: this.runtime!.sessionRuntime.getCurrentMessages() }); return }
    if (method === 'POST' && (path === '/api/conversations/new' || path === '/api/conversation/new')) { const body = await this.readJson(request); await this.sendJson(response, 200, await this.runtime!.sessionRuntime.createConversation(this.optionalString(body, 'name', MAX_SESSION_NAME_LENGTH))); return }
    if (method === 'POST' && (path === '/api/conversations/switch' || path === '/api/conversation/switch')) { const body = await this.readJson(request); await this.sendJson(response, 200, await this.runtime!.sessionRuntime.switchConversation(this.stringField(body, 'conversationId'))); return }
    if (method === 'POST' && (path === '/api/conversations/prompt' || path === '/api/conversation/prompt')) { await this.acceptConversationCommand(request, response, 'prompt'); return }
    if (method === 'POST' && (path === '/api/conversations/steer' || path === '/api/conversation/steer')) { await this.acceptConversationCommand(request, response, 'steer'); return }
    if (method === 'POST' && (path === '/api/conversations/follow_up' || path === '/api/conversation/follow_up' || path === '/api/conversations/follow-up' || path === '/api/conversation/follow-up')) { await this.acceptConversationCommand(request, response, 'followUp'); return }
    if (method === 'POST' && (path === '/api/conversations/abort' || path === '/api/conversation/abort')) { await this.runtime!.sessionRuntime.abort(); await this.sendJson(response, 200, { accepted: true, aborted: true, conversationId: this.sessionState().conversationId }); return }
    if (method === 'POST' && (path === '/api/attachments' || path === '/api/attachments/upload')) { const contentType = request.headers['content-type']; if (typeof contentType !== 'string') throw new ApplicationServiceError('invalid_input', 'multipart Content-Type is required'); const length = Number(request.headers['content-length']); if (Number.isFinite(length) && length > (this.attachmentService?.maxBytes ?? DEFAULT_MAX_ATTACHMENT_BYTES) + 1024 * 1024) throw new ApplicationServiceError('invalid_input', 'attachment request is too large'); const attachment = await this.attachmentService!.upload(request, contentType); await this.sendJson(response, 201, { attachment }); return }
    if (method === 'GET' && path.startsWith('/api/attachments/')) { const pieces = path.split('/'); const id = decodeSegment(pieces[3] ?? ''); if (pieces[4] === 'content') { await this.streamAttachment(response, id); return } await this.sendJson(response, 200, { attachment: await this.attachmentService!.getAttachment(id) }); return }
    if (method === 'POST' && (path === '/api/production/ingest' || path === '/api/production/ingest-document' || path === '/api/production/start-ingest' || path === '/api/workflows/ingest' || path === '/api/ingest-document' || path === '/api/ingestion')) { await this.startIngestion(request, response); return }
    this.sendError(response, new ApplicationServiceError('not_found', 'Runtime route not found'))
  }

  private async bootstrap(response: ServerResponse): Promise<void> {
    const session = this.sessionState()
    const conversations = await this.runtime!.sessionRuntime.listConversations()
    let knowledgeBase: unknown = undefined
    let openReviewCases: number | undefined
    let knowledgeError: { readonly code: string; readonly error: string } | undefined
    try { knowledgeBase = await this.runtime!.knowledgeService.status(); openReviewCases = await this.runtime!.reviewService.countOpenReviewCases() } catch (error) { knowledgeError = safeError(error) }
    await this.sendJson(response, 200, { runtime: this.runtimeInfo, origin: this.runtimeInfo!.origin, runtimeToken: this.runtimeInfo!.runtimeToken, session, conversations, ...(knowledgeBase === undefined ? {} : { knowledgeBase }), ...(openReviewCases === undefined ? {} : { openReviewCases }), ...(knowledgeError === undefined ? {} : { knowledgeError }) })
  }

  private async status(): Promise<unknown> { return { knowledgeBase: await this.runtime!.knowledgeService.status(), openReviewCases: await this.runtime!.reviewService.countOpenReviewCases() } }
  private sessionState(): CurrentSessionState { return this.runtime!.sessionRuntime.getCurrentState() }

  private searchInputFromQuery(url: URL): { readonly query: string; readonly entityType?: string; readonly limit?: number } { const limit = positiveInteger(url.searchParams.get('limit')); return { query: url.searchParams.get('query') ?? '', ...(url.searchParams.has('entityType') ? { entityType: url.searchParams.get('entityType')! } : {}), ...(limit === undefined ? {} : { limit }) } }
  private reviewInputFromQuery(url: URL): ReviewCaseListInput { const limit = positiveInteger(url.searchParams.get('limit')); return { ...(limit === undefined ? {} : { limit }), ...(url.searchParams.has('actionability') ? { actionability: url.searchParams.get('actionability')! as ReviewCaseListInput['actionability'] } : {}), ...(url.searchParams.has('category') ? { category: url.searchParams.get('category')! } : {}), ...(url.searchParams.has('producerRunId') ? { producerRunId: url.searchParams.get('producerRunId')! } : {}) } }

  private async acceptConversationCommand(request: IncomingMessage, response: ServerResponse, operation: 'prompt' | 'steer' | 'followUp'): Promise<void> {
    const body = await this.readJson(request)
    const text = this.stringField(body, 'text', MAX_MESSAGE_LENGTH) || this.stringField(body, 'prompt', MAX_MESSAGE_LENGTH)
    if (text.trim() === '') throw new ApplicationServiceError('invalid_input', 'conversation text is required')
    this.ensureRunning()
    const conversationId = this.runtime!.sessionRuntime.getCurrentState().conversationId
    const runId = randomUUID()
    if (operation === 'prompt') {
      const started = this.runtime!.sessionRuntime.startPrompt(text)
      await started.accepted
      this.trackBackground(started.completion, () => this.runtime!.sessionRuntime.abort())
    } else {
      const command = operation === 'steer' ? this.runtime!.sessionRuntime.steer(text) : this.runtime!.sessionRuntime.followUp(text)
      await command
      this.trackBackground(command, () => this.runtime!.sessionRuntime.abort())
    }
    await this.sendJson(response, 202, { accepted: true, conversationId, run: { runId, operation } })
  }

  private async startIngestion(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const body = await this.readJson(request)
    this.ensureRunning()
    const attachmentId = this.optionalString(body, 'attachmentId', 120)
    let input: IngestDocumentInput
    if (attachmentId !== undefined) {
      const attachment = await this.attachmentService!.getAttachment(attachmentId)
      input = { workflowRunId: randomUUID(), workspaceFile: await this.attachmentService!.resolveAttachmentPath(attachmentId), originalFilename: attachment.filename, mediaType: attachment.mediaType, instructions: this.optionalString(body, 'instructions', MAX_MESSAGE_LENGTH), sourceMetadata: this.sourceMetadata(body) }
    } else {
      const text = this.optionalString(body, 'text', 2_000_000)
      if (text === undefined) throw new ApplicationServiceError('invalid_input', 'attachmentId or text is required')
      input = { workflowRunId: randomUUID(), text, originalFilename: this.optionalString(body, 'originalFilename', 255), mediaType: this.optionalString(body, 'mediaType', 120), instructions: this.optionalString(body, 'instructions', MAX_MESSAGE_LENGTH), sourceMetadata: this.sourceMetadata(body) }
    }
    this.ensureRunning()
    const controller = new AbortController()
    const started = this.runtime!.productionService.startIngestDocument(input, controller.signal)
    this.trackBackground(started.completion, () => { controller.abort() })
    await this.sendJson(response, 202, { accepted: true, runId: started.runId, workflow: this.runtime!.workflowService.getWorkflowStatus(started.runId) })
  }

  private sourceMetadata(value: Record<string, unknown>): IngestDocumentInput['sourceMetadata'] | undefined { const raw = value.sourceMetadata; if (raw === undefined) return undefined; if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new ApplicationServiceError('invalid_input', 'sourceMetadata must be an object'); const input = raw as Record<string, unknown>; return { ...(this.optionalString(input, 'title', 500) === undefined ? {} : { title: this.optionalString(input, 'title', 500) }), ...(this.optionalString(input, 'institution', 500) === undefined ? {} : { institution: this.optionalString(input, 'institution', 500) }), ...(this.optionalString(input, 'author', 500) === undefined ? {} : { author: this.optionalString(input, 'author', 500) }), ...(this.optionalString(input, 'publishedAt', 100) === undefined ? {} : { publishedAt: this.optionalString(input, 'publishedAt', 100) }), ...(this.optionalString(input, 'sourceUrl', 2_000) === undefined ? {} : { sourceUrl: this.optionalString(input, 'sourceUrl', 2_000) }) } }

  private ensureRunning(): void { if (this.lifecycle !== 'running') throw new ApplicationServiceError(this.lifecycle === 'closing' ? 'conflict' : 'failed', this.lifecycle === 'closing' ? 'Runtime server is closing' : 'Runtime server is not ready') }
  private observeBackground(operation: Promise<unknown>): Promise<void> {
    return operation.then(() => undefined, (error) => { try { this.publishRuntimeError(error) } catch { /* preserve the settled operation */ } })
  }
  private trackBackground(operation: Promise<unknown>, cancel: () => void | Promise<void>): void {
    if (this.backgroundOperations.size >= MAX_BACKGROUND_OPERATIONS) {
      const observed = this.observeBackground(operation)
      void observed.then(() => undefined, () => undefined)
      try { const result = cancel(); if (result !== undefined) void Promise.resolve(result).catch(() => undefined) } catch { /* the operation is rejected below */ }
      throw new ApplicationServiceError('conflict', 'Runtime background operation limit reached')
    }
    const record: BackgroundOperation = {
      completion: this.observeBackground(operation),
      cancel,
    }
    this.backgroundOperations.add(record)
    void record.completion.then(() => { this.backgroundOperations.delete(record) }, () => { this.backgroundOperations.delete(record) })
  }
  private publishRuntimeError(error: unknown): void { if (this.lifecycle === 'closing' || this.lifecycle === 'closed') return; const conversationId = (() => { try { return (this.sessionState() as { conversationId: string }).conversationId } catch { return 'conversation' } })(); const code = errorCode(error) === 'cancelled' ? 'agent_aborted' : 'agent_error'; this.eventStream.publish({ eventId: `runtime:${randomUUID()}`, conversationId: safeIdentifier(conversationId, 'conversation'), timestamp: new Date().toISOString(), type: 'error', code, summary: code === 'agent_aborted' ? 'Agent request aborted' : 'Agent request failed' } satisfies ClientEvent) }

  private async readJson(request: IncomingMessage): Promise<Record<string, unknown>> { const length = Number(request.headers['content-length']); if (Number.isFinite(length) && length > MAX_JSON_BYTES) throw new ApplicationServiceError('invalid_input', 'JSON request is too large'); const chunks: Buffer[] = []; let total = 0; for await (const input of request) { const chunk = Buffer.isBuffer(input) ? input : Buffer.from(input); total += chunk.length; if (total > MAX_JSON_BYTES) throw new ApplicationServiceError('invalid_input', 'JSON request is too large'); chunks.push(chunk) } if (total === 0) return {}; try { const value: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8')); if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('object required'); return value as Record<string, unknown> } catch (error) { throw new ApplicationServiceError('invalid_input', 'JSON request is invalid', { cause: error }) } }
  private stringField(body: Record<string, unknown>, field: string, maxLength = 2_000_000): string { const value = body[field]; if (typeof value !== 'string' || value.length > maxLength) throw new ApplicationServiceError('invalid_input', `${field} is invalid`); return value }
  private optionalString(body: Record<string, unknown>, field: string, maxLength: number): string | undefined { const value = body[field]; if (value === undefined || value === null) return undefined; if (typeof value !== 'string' || value.length > maxLength) throw new ApplicationServiceError('invalid_input', `${field} is invalid`); return value }
  private optionalPositive(body: Record<string, unknown>, field: string): number | undefined { const value = body[field]; if (value === undefined) return undefined; if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1) throw new ApplicationServiceError('invalid_input', `${field} is invalid`); return value }

  private openEvents(response: ServerResponse): void {
    const client: SseClient = { response, unsubscribe: () => undefined, onClose: () => undefined, onDrain: () => undefined, pendingFrames: [], waitingForDrain: false }
    client.onDrain = () => this.flushSseClient(client)
    try {
      // Register first. A rejected subscription must not create a timer or a
      // response listener that would outlive the failed connection.
      client.unsubscribe = this.eventStream.subscribe((frame) => this.enqueueSseFrame(client, frame))
      this.sseClients.add(client)
      client.onClose = () => this.removeSseClient(client)
      response.once('close', client.onClose)
      response.writeHead(200, { ...this.runtimeSecurity!.corsHeaders(), 'Cache-Control': 'no-store', 'Content-Type': 'text/event-stream; charset=utf-8', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' })
      this.enqueueSseFrame(client, ': connected\n\n')
      client.heartbeat = setInterval(() => {
        if (response.destroyed || !response.writable) { this.removeSseClient(client); return }
        this.enqueueSseFrame(client, ': heartbeat\n\n')
      }, 15_000)
    } catch (error) {
      this.removeSseClient(client)
      throw error
    }
  }

  private enqueueSseFrame(client: SseClient, frame: string): void {
    if (!this.sseClients.has(client) || client.response.destroyed || !client.response.writable) { this.removeSseClient(client); return }
    if (client.waitingForDrain || client.pendingFrames.length > 0) {
      if (client.pendingFrames.length >= MAX_SSE_PENDING_FRAMES) { this.removeSseClient(client); return }
      client.pendingFrames.push(frame)
      return
    }
    this.writeSseFrame(client, frame)
  }

  private flushSseClient(client: SseClient): void {
    if (!this.sseClients.has(client) || client.response.destroyed || !client.response.writable) { this.removeSseClient(client); return }
    client.waitingForDrain = false
    while (client.pendingFrames.length > 0) {
      const frame = client.pendingFrames.shift()!
      try {
        if (!client.response.write(frame)) {
          client.waitingForDrain = true
          client.response.once('drain', client.onDrain)
          return
        }
      } catch { this.removeSseClient(client); return }
    }
  }

  private writeSseFrame(client: SseClient, frame: string): void {
    try {
      if (!client.response.write(frame)) {
        client.waitingForDrain = true
        client.response.once('drain', client.onDrain)
      }
    } catch { this.removeSseClient(client) }
  }

  private removeSseClient(client: SseClient): void {
    const wasRegistered = this.sseClients.delete(client)
    if (client.heartbeat !== undefined) { clearInterval(client.heartbeat); client.heartbeat = undefined }
    client.pendingFrames.length = 0
    client.waitingForDrain = false
    client.unsubscribe()
    client.response.off('close', client.onClose)
    client.response.off('drain', client.onDrain)
    if (wasRegistered && !client.response.destroyed) client.response.end()
  }

  private async streamAttachment(response: ServerResponse, attachmentId: string): Promise<void> {
    const opened = await this.attachmentService!.openAttachment(attachmentId)
    response.writeHead(200, { ...this.runtimeSecurity!.corsHeaders(), 'Cache-Control': 'no-store', 'Content-Type': opened.metadata.mediaType, 'Content-Length': String(opened.metadata.size), 'Content-Disposition': `attachment; filename="${opened.metadata.filename.replace(/"/g, '')}"` })
    await pipeline(createReadStream(opened.path), response)
  }

  private async sendJson(response: ServerResponse, status: number, value: unknown): Promise<void> { if (response.writableEnded) return; response.writeHead(status, { ...this.runtimeSecurity!.corsHeaders(), 'Cache-Control': 'no-store', 'Content-Type': 'application/json; charset=utf-8' }); response.end(JSON.stringify(value)) }
  private sendEmpty(response: ServerResponse, status: number): void { response.writeHead(status, { ...this.runtimeSecurity!.corsHeaders(), 'Cache-Control': 'no-store', Allow: 'GET,POST,OPTIONS', 'Access-Control-Allow-Headers': `Content-Type, ${TOKEN_HEADER}`, 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS' }); response.end() }
  private sendError(response: ServerResponse, error: unknown): void { const safe = safeError(error); response.writeHead(httpStatus(safe.code), { ...this.runtimeSecurity?.corsHeaders(), 'Cache-Control': 'no-store', 'Content-Type': 'application/json; charset=utf-8' }); response.end(JSON.stringify(safe)) }
}

export async function createResearchHubRuntimeServer(options: ResearchHubRuntimeServerOptions): Promise<ResearchHubRuntimeServer> { return ResearchHubRuntimeServer.create(options) }
export async function startResearchHubRuntimeServer(options: ResearchHubRuntimeServerOptions): Promise<{ readonly server: ResearchHubRuntimeServer; readonly info: RuntimeServerInfo }> { const server = await ResearchHubRuntimeServer.create(options); return { server, info: server.address! } }
