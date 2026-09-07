import test from 'node:test'
import assert from 'node:assert/strict'
import { classifyReasoningError, classifyWorkflowFailure, deriveFailurePhase, sanitizeReasoningCall, sanitizeWorkflowView } from './production-workflow-diagnosis.ts'

function terminal(errorSummary?: string) { return sanitizeWorkflowView({ runId: 'run-001', workflowType: 'raw_document_knowledge_ingestion', objective: 'validation.pdf', status: 'failed', progressSummary: 'Workflow failed', ...(errorSummary === undefined ? {} : { errorSummary }), startedAt: '2026-09-07T00:00:00.000Z', updatedAt: '2026-09-07T00:00:02.000Z', completedAt: '2026-09-07T00:00:02.000Z' }) }

test('workflow diagnosis classifies provider failures as environment blocked', () => {
  for (const message of ['HTTP 429 quota exceeded', 'HTTP 401 authentication_failed', 'provider timeout']) {
    const view = terminal(message)
    assert.equal(classifyWorkflowFailure({ terminal: view, reasoningCalls: [], canonicalRevision: 0, rawPresent: true }).classification, 'ENVIRONMENT_BLOCKED')
  }
})

test('workflow diagnosis classifies invalid model output and deterministic writer errors as product candidates', () => {
  assert.equal(classifyWorkflowFailure({ terminal: terminal('reasoning_output_invalid'), reasoningCalls: [], canonicalRevision: 0, rawPresent: true }).classification, 'PRODUCT_DEFECT')
  assert.equal(classifyWorkflowFailure({ terminal: terminal('Writer invariant failed at changeset validation'), reasoningCalls: [], canonicalRevision: 0, rawPresent: true }).classification, 'PRODUCT_DEFECT')
})

test('poll success and terminal failure remain separate concepts', () => {
  const view = terminal('HTTP 429 quota exceeded')
  assert.equal(view.status, 'failed')
  assert.equal(view.runId, 'run-001')
  assert.equal(view.errorSummary?.present, true)
  assert.equal(view.errorSummary?.category, 'rate_limited')
})

test('reasoning diagnostics preserve safe operation metadata without payloads', () => {
  const call = sanitizeReasoningCall({ operation: 'extractKnowledge', startedAt: '2026-09-07T00:00:01.000Z', durationMs: 1200, status: 'failed', errorCode: 'reasoning_timeout', safeMessage: 'provider timeout; rawOutput=hidden' })
  assert.deepEqual(call, { operation: 'extractKnowledge', startedAt: '2026-09-07T00:00:01.000Z', durationMs: 1200, status: 'failed', errorCode: 'reasoning_timeout', category: 'timeout', safeMessage: 'Provider reasoning timed out' })
  assert.equal('rawOutput' in call, false)
})

test('reasoning error classifier distinguishes invalid output from provider timeout', () => {
  assert.equal(classifyReasoningError({ code: 'reasoning_output_invalid', message: 'invalid JSON' }).category, 'reasoning_output_invalid')
  assert.equal(classifyReasoningError({ code: 'reasoning_timeout', message: 'timed out' }).environment, true)
})

test('missing terminal error summary requests observability rather than guessing', () => {
  const result = classifyWorkflowFailure({ terminal: terminal(), reasoningCalls: [], canonicalRevision: 0, rawPresent: true })
  assert.equal(result.classification, 'PRODUCTION_OBSERVABILITY_CHANGE_REQUIRED')
  assert.equal(deriveFailurePhase({ terminal: terminal(), reasoningCalls: [], canonicalRevision: 0, rawPresent: true }), 'UNKNOWN')
})

test('workspace boundary rejection with an otherwise valid controlled path is a production wiring defect', () => {
  const result = classifyWorkflowFailure({ terminal: terminal('workspaceFile must remain inside workspaceRoot and outside the canonical Knowledge Base'), reasoningCalls: [], canonicalRevision: 0, rawPresent: false, pathBoundary: { runtimeProductionWorkspaceSame: true, attachmentInsideRuntimeWorkspace: true, attachmentInsideProductionWorkspace: true, attachmentOutsideCanonicalKnowledge: true, attachmentPathMatchesResolvedPath: true } })
  assert.equal(result.classification, 'PRODUCT_DEFECT')
  assert.equal(result.failurePhase, 'INPUT_RESOLUTION')
  assert.match(result.rootCauseSummary, /path-wiring\/boundary defect/)
})

test('canonical attachment path mismatch identifies the Windows input-resolution boundary', () => {
  const result = classifyWorkflowFailure({ terminal: terminal('workspaceFile must remain inside workspaceRoot and outside the canonical Knowledge Base'), reasoningCalls: [], canonicalRevision: 0, rawPresent: false, pathBoundary: { runtimeProductionWorkspaceSame: true, attachmentInsideRuntimeWorkspace: true, attachmentInsideProductionWorkspace: false, attachmentOutsideCanonicalKnowledge: true, attachmentPathMatchesResolvedPath: false } })
  assert.equal(result.classification, 'PRODUCT_DEFECT')
  assert.match(result.rootCauseSummary, /canonical attachment path/)
})
