import { Type } from '@earendil-works/pi-ai'
import { defineTool, type ToolDefinition } from '@earendil-works/pi-coding-agent'
import { resolve } from 'node:path'
import { KnowledgeBaseRegistry } from '../../knowledge/registry/registry.ts'
import { KnowledgeBaseLoaderV03 } from '../../knowledge/storage/loader.ts'
import { listOpenReviewCases } from '../../knowledge/review/store.ts'
import { KnowledgeCurationSkill } from '../../skills/knowledge-curation/skill.ts'
import { runRawDocumentKnowledgeIngestion } from '../../workflows/raw-document-knowledge-ingestion/workflow.ts'
import type { ReasoningExecutor } from '../../plugins/reasoning/contracts.ts'

const safeWorkflowId = /^[A-Za-z0-9][A-Za-z0-9._-]*$/
const MAX_PROMPT_TEXT_BYTES = 2_000_000

export interface ResearchHubPiToolContext {
  readonly mountedKnowledgeBaseRoot?: string
  readonly reasoningExecutor: ReasoningExecutor
}

function textResult(value: unknown, isError = false) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(value) }], details: undefined, isError }
}

function resolveMountedRoot(context: ResearchHubPiToolContext, requestedRoot: string | undefined): string | undefined {
  if (context.mountedKnowledgeBaseRoot !== undefined) {
    if (requestedRoot !== undefined && resolve(requestedRoot) !== resolve(context.mountedKnowledgeBaseRoot)) throw new Error('A Pi session cannot override its mounted Knowledge Base root')
    return context.mountedKnowledgeBaseRoot
  }
  return undefined
}

function assertWorkflowInput(text: string, workflowRunId: string): void {
  if (text.trim().length === 0 || Buffer.byteLength(text, 'utf8') > MAX_PROMPT_TEXT_BYTES) throw new Error('text must be non-empty and at most 2 MB')
  if (!safeWorkflowId.test(workflowRunId)) throw new Error('workflowRunId must be a safe deterministic identifier')
}

export function createResearchHubTools(context: ResearchHubPiToolContext): ToolDefinition[] {
  const status = defineTool({
    name: 'researchhub_status',
    label: 'ResearchHub status',
    description: 'Read mounted ResearchHub Knowledge Base identity, revision, canonical asset counts, metadata, and open ReviewCase count. This tool never mutates data.',
    promptSnippet: 'Inspect ResearchHub canonical Knowledge Base status',
    parameters: Type.Object({ rootRef: Type.Optional(Type.String()) }),
    execute: async (_toolCallId, params) => {
      const rootRef = resolveMountedRoot(context, params.rootRef)
      if (!rootRef) return textResult({ error: 'No Knowledge Base is mounted' }, true)
      const registry = new KnowledgeBaseRegistry()
      const handle = await registry.mount(rootRef)
      const assets = await new KnowledgeBaseLoaderV03(registry).readAssets(handle)
      const openReviewCases = await listOpenReviewCases(handle.rootRef)
      return textResult({
        knowledgeBase: { id: handle.knowledgeBaseId, rootRef: handle.rootRef, revision: handle.revision, status: handle.status, schemaVersion: handle.schemaVersion, storageFormatVersion: handle.storageFormatVersion },
        counts: { themeGroups: assets.themeGroups.length, entities: assets.entities.length, relations: assets.relations.length, claims: assets.claims.length, sources: assets.sources.length, modules: assets.modules.length },
        metadata: { assetCount: assets.themeGroups.length + assets.entities.length + assets.relations.length + assets.claims.length + assets.sources.length + assets.modules.length },
        openReviewCases: openReviewCases.length,
      })
    },
  })

  const ingest = defineTool({
    name: 'researchhub_ingest_text',
    label: 'ResearchHub ingest text',
    description: 'Run the bounded deterministic Raw Document to Knowledge Base ingestion workflow for supplied text. This is the controlled ResearchHub operation; it is not arbitrary code or file execution.',
    promptSnippet: 'Ingest supplied research text through ResearchHub Workflow',
    parameters: Type.Object({
      text: Type.String(),
      originalFilename: Type.Optional(Type.String()),
      workflowRunId: Type.String(),
      rootRef: Type.Optional(Type.String()),
    }),
    execute: async (_toolCallId, params, signal) => {
      const rootRef = resolveMountedRoot(context, params.rootRef)
      if (!rootRef) return textResult({ error: 'No Knowledge Base is mounted' }, true)
      assertWorkflowInput(params.text, params.workflowRunId)
      if (signal?.aborted) return textResult({ error: 'ResearchHub operation cancelled before Workflow start' }, true)
      const handle = await new KnowledgeBaseRegistry().mount(rootRef)
      const executor: ReasoningExecutor = {
        capabilities: () => context.reasoningExecutor.capabilities(),
        execute: async (request) => {
          if (signal?.aborted) throw new Error('ResearchHub Workflow cancelled')
          const signalAware = context.reasoningExecutor as ReasoningExecutor & { execute(request: Parameters<ReasoningExecutor['execute']>[0], signal?: AbortSignal): ReturnType<ReasoningExecutor['execute']> }
          const result = await signalAware.execute(request, signal)
          if (signal?.aborted) throw new Error('ResearchHub Workflow cancelled')
          return result
        },
      }
      const result = await runRawDocumentKnowledgeIngestion({
        handle,
        documentInput: { type: 'text', text: params.text, originalFilename: params.originalFilename ?? 'researchhub-prompt.txt', mediaType: 'text/plain' },
        skill: new KnowledgeCurationSkill({ executor }),
        workflowRunId: params.workflowRunId,
        signal,
      })
      if (signal?.aborted) return textResult({ error: 'ResearchHub Workflow was cancelled' }, true)
      return textResult(result)
    },
  })
  return [status, ingest]
}
