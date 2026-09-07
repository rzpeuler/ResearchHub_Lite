import { access, realpath } from 'node:fs/promises'
import { isAbsolute, join, relative, resolve } from 'node:path'
import { KnowledgeBaseRegistry } from '../../knowledge/registry/registry.ts'
import { KnowledgeCurationSkill } from '../../skills/knowledge-curation/skill.ts'
import { runRawDocumentKnowledgeIngestion } from '../../workflows/raw-document-knowledge-ingestion/workflow.ts'
import type { IngestionWorkflowResult } from '../../workflows/raw-document-knowledge-ingestion/contracts.ts'
import type { ReasoningExecutor } from '../../plugins/reasoning/contracts.ts'
import { ApplicationServiceError, type ApplicationProductionResult, type IngestDocumentInput } from './contracts.ts'
import { WorkflowService, type WorkflowOutcome } from './workflow-service.ts'

const SAFE_RUN_ID = /^[A-Za-z0-9][A-Za-z0-9._-]*$/
const MAX_DOCUMENT_TEXT_BYTES = 2_000_000
function inside(root: string, candidate: string): boolean { const rel = relative(resolve(root), resolve(candidate)); return rel === '' || (rel !== '..' && !rel.startsWith(`..${'\\'}`) && !rel.startsWith(`..${'/'}`)) }
function combineSignals(left: AbortSignal | undefined, right: AbortSignal): { readonly signal: AbortSignal; readonly dispose: () => void } {
  const controller = new AbortController(); const abort = () => controller.abort()
  if (left?.aborted || right.aborted) controller.abort()
  left?.addEventListener('abort', abort, { once: true }); right.addEventListener('abort', abort, { once: true })
  return { signal: controller.signal, dispose: () => { left?.removeEventListener('abort', abort); right.removeEventListener('abort', abort) } }
}
function cancellationResult(runId: string): ApplicationProductionResult { return { runId, status: 'cancelled', reviewCount: 0, reviewCaseIds: [], summary: 'Workflow was cancelled before canonical commit' } }

export interface ProductionServiceOptions {
  readonly mountedKnowledgeBaseRoot?: string
  readonly workspaceRoot?: string
  readonly cwd?: string
  readonly reasoningExecutor: ReasoningExecutor
  readonly workflowService: WorkflowService
  readonly workflowRunner?: typeof runRawDocumentKnowledgeIngestion
}

export class ProductionService {
  private readonly registry = new KnowledgeBaseRegistry()
  private readonly workspaceRoot: string
  constructor(private readonly options: ProductionServiceOptions) { this.workspaceRoot = resolve(options.workspaceRoot ?? join(options.cwd ?? process.cwd(), 'workspace')) }
  startIngestDocument(input: IngestDocumentInput, callerSignal?: AbortSignal): { readonly runId: string; readonly completion: Promise<ApplicationProductionResult> } {
    if (!this.options.mountedKnowledgeBaseRoot) throw new ApplicationServiceError('no_kb_mounted', 'No canonical Knowledge Base is mounted')
    if (!input || typeof input.workflowRunId !== 'string' || !SAFE_RUN_ID.test(input.workflowRunId)) throw new ApplicationServiceError('invalid_input', 'workflowRunId must be a safe deterministic identifier')
    const hasText = typeof input.text === 'string'
    const hasFile = typeof input.workspaceFile === 'string'
    if (hasText === hasFile) throw new ApplicationServiceError('invalid_input', 'Exactly one of text or workspaceFile is required')
    if (hasText && (input.text!.trim() === '' || Buffer.byteLength(input.text!, 'utf8') > MAX_DOCUMENT_TEXT_BYTES)) throw new ApplicationServiceError('invalid_input', 'text must be non-empty and at most 2 MB')
    this.options.workflowService.register({ runId: input.workflowRunId, workflowType: 'raw_document_knowledge_ingestion', objective: input.originalFilename ?? input.workspaceFile ?? 'ResearchHub document ingestion' })
    const onCallerAbort = () => { try { this.options.workflowService.cancelWorkflow(input.workflowRunId) } catch { /* the run may already be terminal */ } }
    callerSignal?.addEventListener('abort', onCallerAbort, { once: true })
    const completion = this.options.workflowService.start(input.workflowRunId, async (activeSignal): Promise<WorkflowOutcome & { readonly workflow: IngestionWorkflowResult }> => {
      const combined = combineSignals(callerSignal, activeSignal)
      try {
        if (combined.signal.aborted) throw new ApplicationServiceError('cancelled', 'Workflow was cancelled before start')
        const handle = await this.registry.mount(this.options.mountedKnowledgeBaseRoot!)
        const documentInput = hasText
          ? { type: 'text' as const, text: input.text!, originalFilename: input.originalFilename ?? 'researchhub-prompt.txt', mediaType: input.mediaType ?? 'text/plain' }
          : { type: 'file' as const, reference: await this.resolveWorkspaceFile(input.workspaceFile!) }
        const executor: ReasoningExecutor = { capabilities: () => this.options.reasoningExecutor.capabilities(), execute: async (request) => {
          if (combined.signal.aborted) throw new ApplicationServiceError('cancelled', 'Workflow was cancelled')
          const signalAware = this.options.reasoningExecutor as ReasoningExecutor & { execute(request: Parameters<ReasoningExecutor['execute']>[0], signal?: AbortSignal): ReturnType<ReasoningExecutor['execute']> }
          const response = await signalAware.execute(request, combined.signal)
          if (combined.signal.aborted) throw new ApplicationServiceError('cancelled', 'Workflow was cancelled')
          return response
        } }
        const workflow = await (this.options.workflowRunner ?? runRawDocumentKnowledgeIngestion)({ handle, documentInput, skill: new KnowledgeCurationSkill({ executor }), workflowRunId: input.workflowRunId, instructions: input.instructions, sourceMetadata: input.sourceMetadata, signal: combined.signal })
        if (workflow.status === 'completed' || workflow.status === 'completed_with_review') {
          this.options.workflowService.markAuthoritativeTerminal(input.workflowRunId, workflow.status, { summary: summaryFor(workflow), reviewCount: workflow.reviewCases?.length ?? 0, errorSummary: workflow.errors.length > 0 ? workflow.errors.join('; ').slice(0, 500) : undefined })
          return { status: workflow.status, summary: summaryFor(workflow), reviewCount: workflow.reviewCases?.length ?? 0, errorSummary: workflow.errors.length > 0 ? workflow.errors.join('; ').slice(0, 500) : undefined, workflow }
        }
        if (combined.signal.aborted || activeSignal.aborted || callerSignal?.aborted) throw new ApplicationServiceError('cancelled', 'Workflow was cancelled')
        return { status: workflow.status, summary: summaryFor(workflow), reviewCount: workflow.reviewCases?.length ?? 0, errorSummary: workflow.errors.length > 0 ? workflow.errors.join('; ').slice(0, 500) : undefined, workflow }
      } finally { combined.dispose() }
    }).then((outcome) => projectResult(input.workflowRunId, outcome.workflow)).catch((error) => error instanceof ApplicationServiceError && error.code === 'cancelled' ? cancellationResult(input.workflowRunId) : Promise.reject(error)).finally(() => callerSignal?.removeEventListener('abort', onCallerAbort))
    if (callerSignal?.aborted) this.options.workflowService.cancelWorkflow(input.workflowRunId)
    // A browser request may intentionally abandon the completion promise. Mark the
    // returned promise as observed while preserving its rejection for callers that
    // do await it; the runtime also attaches its own lifecycle handler.
    completion.catch(() => undefined)
    return { runId: input.workflowRunId, completion }
  }
  async ingestDocument(input: IngestDocumentInput, callerSignal?: AbortSignal): Promise<ApplicationProductionResult> {
    return this.startIngestDocument(input, callerSignal).completion
  }
  private async resolveWorkspaceFile(reference: string): Promise<string> {
    if (reference.trim() === '') throw new ApplicationServiceError('invalid_input', 'workspaceFile must be non-empty')
    const lexical = isAbsolute(reference) ? resolve(reference) : resolve(this.workspaceRoot, reference)
    const cwdCandidate = this.options.cwd && !inside(this.workspaceRoot, lexical) ? resolve(this.options.cwd, reference) : lexical
    const candidate = inside(this.workspaceRoot, cwdCandidate) ? cwdCandidate : lexical
    if (!inside(this.workspaceRoot, candidate) || inside(this.options.mountedKnowledgeBaseRoot!, candidate)) throw new ApplicationServiceError('invalid_input', 'workspaceFile must remain inside workspaceRoot and outside the canonical Knowledge Base')
    try { await access(candidate); const [workspaceReal, candidateReal, kbReal] = await Promise.all([realpath(this.workspaceRoot), realpath(candidate), realpath(this.options.mountedKnowledgeBaseRoot!)])
      if (!inside(workspaceReal, candidateReal) || inside(kbReal, candidateReal)) throw new ApplicationServiceError('invalid_input', 'workspaceFile symlink escapes the allowed workspace boundary')
      return candidateReal
    } catch (error) { if (error instanceof ApplicationServiceError) throw error; throw new ApplicationServiceError('invalid_input', 'workspaceFile cannot be read within the allowed workspace', { cause: error }) }
  }
}
function summaryFor(result: IngestionWorkflowResult): string { if (result.status === 'completed_with_review') return 'Document ingestion completed with ReviewCases'; if (result.status === 'blocked') return 'Document ingestion was blocked by deterministic Knowledge governance'; return 'Document ingestion completed' }
function projectResult(runId: string, result: IngestionWorkflowResult): ApplicationProductionResult { const reviewCaseIds = (result.reviewCases ?? []).map((item) => item.reviewCaseId).sort(); return { runId, status: result.status, knowledgeBaseId: result.knowledgeBaseId, ...(result.rawRef === undefined ? {} : { rawRef: result.rawRef }), ...(result.documentId === undefined ? {} : { documentId: result.documentId }), ...(result.changeSetId === undefined ? {} : { changeSetId: result.changeSetId }), ...(result.baseRevision === undefined ? {} : { baseRevision: result.baseRevision }), ...(result.committedRevision === undefined ? {} : { committedRevision: result.committedRevision }), reviewCount: reviewCaseIds.length, reviewCaseIds, summary: summaryFor(result), ...(result.errors.length === 0 ? {} : { errorSummary: result.errors.join('; ').slice(0, 500) }) } }
