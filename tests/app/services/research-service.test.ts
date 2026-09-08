import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createFreshKnowledgeBaseV04 } from '../../../knowledge/storage/create-v04.ts'
import { ResearchService } from '../../../app/services/research-service.ts'
import { WorkflowService } from '../../../app/services/workflow-service.ts'
import type { ResearchAcquisitionPlugin } from '../../../plugins/research-acquisition/contracts.ts'

test('Application Service exposes research_company through one Workflow path', async () => { const root = await mkdtemp(join(tmpdir(), 'researchhub-service-kb-')); const reports = await mkdtemp(join(tmpdir(), 'researchhub-service-reports-')); try { await createFreshKnowledgeBaseV04(root, { knowledgeBaseId: 'kb-service' }); const plugin: ResearchAcquisitionPlugin = { name: 'fixture-official', discover: async () => [], fetch: async (candidate) => ({ candidate, retrievedAt: new Date().toISOString(), content: '' }), normalize: async (source) => ({ candidate: source.candidate, retrievedAt: source.retrievedAt, title: source.candidate.title, content: source.content, contentHash: 'a'.repeat(64), publisher: source.candidate.provider, rights: { accessScope: 'public', retentionAllowed: true, aiProcessingAllowed: true, derivativeKnowledgeAllowed: true, redistributionAllowed: false } }) }; const workflowService = new WorkflowService(); const service = new ResearchService({ mountedKnowledgeBaseRoot: root, reportRoot: reports, acquisitionPlugins: [plugin], workflowService }); const started = service.startResearchCompany({ workflowRunId: 'service-run', symbol: '600519' }); const result = await started.completion; assert.equal(result.status, 'completed'); assert.equal(workflowService.getWorkflowStatus('service-run')?.status, 'completed'); assert.match(result.reportId ?? '', /600519/); assert.equal((await service.getResearchReport(result.reportId!)).reportId, result.reportId) } finally { await rm(root, { recursive: true, force: true }); await rm(reports, { recursive: true, force: true }) } })
