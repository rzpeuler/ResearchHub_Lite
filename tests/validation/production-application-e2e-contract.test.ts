import test from 'node:test'
import assert from 'node:assert/strict'
import { attachmentDtoEvidence, captureProductionStart, captureProductionTerminal, classifyProductionTerminal } from './production-application-e2e-contract.ts'

test('production terminal evidence retains runId and safe errorSummary before classification', () => {
  const start = captureProductionStart({ runId: 'run-failed-001', workflow: { workflowType: 'raw_document_knowledge_ingestion', objective: 'report.pdf', status: 'running' } })
  const terminal = captureProductionTerminal({ runId: 'run-failed-001', status: 'failed', progressSummary: 'Workflow failed', errorSummary: 'workspaceFile C:\\private\\secret.txt rejected', reviewCount: 0, startedAt: '2026-09-07T00:00:00.000Z', updatedAt: '2026-09-07T00:00:01.000Z', completedAt: '2026-09-07T00:00:01.000Z' })
  assert.equal(start.runId, 'run-failed-001'); assert.equal(start.initialStatus, 'running'); assert.equal(terminal.runId, 'run-failed-001'); assert.equal(terminal.status, 'failed'); assert.equal(terminal.errorSummary, 'workspaceFile [path] rejected')
})

test('successful polling and failed workflow terminal are separate stages', () => {
  assert.deepEqual(classifyProductionTerminal('failed'), { pollStage: 'PASS', terminalStage: 'FAIL', classification: 'PRODUCT_DEFECT' })
  assert.deepEqual(classifyProductionTerminal('completed_with_review'), { pollStage: 'PASS', terminalStage: 'PASS', classification: 'SUCCESS' })
})

test('public AttachmentRef without workspaceRelativePath is the valid expected state', () => {
  assert.deepEqual(attachmentDtoEvidence({ attachmentId: 'attachment-001', filename: 'report.pdf', mediaType: 'application/pdf', size: 1, sha256: 'a'.repeat(64), createdAt: '2026-09-07T00:00:00.000Z' }), { publicDtoExposesWorkspaceReference: false, publicDtoExposesPath: false, publicDtoExposesAbsolutePath: false, valid: true })
})

test('public AttachmentRef exposing workspaceRelativePath fails the privacy regression', () => {
  const result = attachmentDtoEvidence({ attachmentId: 'attachment-001', workspaceRelativePath: 'uploads/attachment-001/report.pdf' })
  assert.equal(result.publicDtoExposesWorkspaceReference, true); assert.equal(result.valid, false)
})

test('public AttachmentRef exposing an absolute path fails the privacy regression', () => {
  const result = attachmentDtoEvidence({ attachmentId: 'attachment-001', path: 'C:\\workspace\\uploads\\attachment-001\\report.pdf' })
  assert.equal(result.publicDtoExposesPath, true); assert.equal(result.publicDtoExposesAbsolutePath, true); assert.equal(result.valid, false)
})
