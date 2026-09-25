import test from 'node:test'
import assert from 'node:assert/strict'
import { createResearchHubTools } from '../../../app/pi/tools.ts'
import { WorkflowService } from '../../../app/services/workflow-service.ts'

async function call(tool: ReturnType<typeof createResearchHubTools>[number], params: Record<string, unknown>) {
  return tool.execute('thesis-tool-test', params, undefined, undefined, {} as never)
}

test('Pi exposes bounded Thesis query, refresh, decision, and existing report tools through scoped services', async () => {
  const received: { create?: unknown; refresh?: unknown; decision?: unknown } = {}
  const thesisQueryService = { listTheses: async (limit?: number) => ({ theses: [], total: 0, limit, truncated: false, revision: 0 }), getThesis: async (thesisRef: string) => ({ thesisRef, propositions: [], revision: 0 }) } as never
  const researchService = {
    startThesisLifecycleCreate: (input: unknown) => { received.create = input; return { runId: 'thesis-create-test', completion: Promise.resolve({ status: 'blocked', runId: 'thesis-create-test' }) } },
    startThesisLifecycleRefresh: (input: unknown) => { received.refresh = input; return { runId: 'thesis-refresh-test', completion: Promise.resolve({ status: 'blocked', runId: 'thesis-refresh-test' }) } },
    getResearchReport: async (reportId: string) => ({ reportId }),
  } as never
  const thesisDecisionService = { decide: async (input: unknown) => { received.decision = input; return { status: 'deferred', errors: [] } } } as never
  const tools = createResearchHubTools({ knowledgeService: {} as never, productionService: {} as never, reviewService: {} as never, workflowService: new WorkflowService(), researchService, thesisQueryService, thesisDecisionService, policyContext: { current: { structuredKnowledge: true, sourceLibrary: false, writeKnowledge: true } } })
  const named = (name: string) => { const tool = tools.find((item) => item.name === name); assert.ok(tool, `missing ${name}`); return tool }
  const list = await call(named('list_theses'), { limit: 5 })
  assert.deepEqual(JSON.parse(list.content[0]!.type === 'text' ? list.content[0]!.text : ''), { theses: [], total: 0, limit: 5, truncated: false, revision: 0 })
  const detail = await call(named('get_thesis'), { thesisRef: 'thesis:exact' })
  assert.deepEqual(JSON.parse(detail.content[0]!.type === 'text' ? detail.content[0]!.text : ''), { thesisRef: 'thesis:exact', propositions: [], revision: 0 })
  const createInput = { workflowRunId: 'thesis-create-test', companyRef: 'entity:company', thesisTitle: 'Title', narrative: 'Narrative', evidenceRefs: ['claim:evidence'], asOf: '2026-09-24T00:00:00.000Z' }
  const create = await call(named('create_thesis'), createInput)
  assert.equal((create as unknown as { isError?: boolean }).isError, false)
  assert.deepEqual(received.create, createInput)
  const refresh = await call(named('refresh_thesis'), { thesisRef: 'thesis:exact', asOf: '2026-09-24T00:00:00.000Z', evidenceRefs: ['claim:evidence'] })
  assert.equal((refresh as unknown as { isError?: boolean }).isError, false); assert.deepEqual(received.refresh, { thesisRef: 'thesis:exact', asOf: '2026-09-24T00:00:00.000Z', evidenceRefs: ['claim:evidence'] })
  const decision = await call(named('decide_thesis_review_case'), { reviewCaseId: 'review-case-exact', decision: 'DEFER', note: 'later' })
  assert.deepEqual(received.decision, { reviewCaseId: 'review-case-exact', decision: 'DEFER', note: 'later' })
  assert.equal(JSON.parse(decision.content[0]!.type === 'text' ? decision.content[0]!.text : '').status, 'deferred')
  assert.ok(named('get_research_report'))
  const rejectedLimit = await call(named('list_theses'), { limit: 51 })
  assert.equal((rejectedLimit as unknown as { isError?: boolean }).isError, true)
  const disabledCreateTools = createResearchHubTools({ knowledgeService: {} as never, productionService: {} as never, reviewService: {} as never, workflowService: new WorkflowService(), researchService, thesisQueryService, thesisDecisionService, policyContext: { current: { structuredKnowledge: true, sourceLibrary: false, writeKnowledge: false } } })
  const disabledCreate = await call(disabledCreateTools.find((item) => item.name === 'create_thesis')!, createInput)
  assert.equal((disabledCreate as unknown as { isError?: boolean }).isError, true)
  const refreshCallsBeforeReadOnly = received.refresh
  const readOnlyRefreshTools = createResearchHubTools({ knowledgeService: {} as never, productionService: {} as never, reviewService: {} as never, workflowService: new WorkflowService(), researchService, thesisQueryService, thesisDecisionService, policyContext: { current: { structuredKnowledge: true, sourceLibrary: false, writeKnowledge: false } } })
  const disabledRefresh = await call(readOnlyRefreshTools.find((item) => item.name === 'refresh_thesis')!, { thesisRef: 'thesis:exact', asOf: '2026-09-24T00:00:00.000Z' })
  assert.equal((disabledRefresh as unknown as { isError?: boolean }).isError, true)
  assert.deepEqual(received.refresh, refreshCallsBeforeReadOnly, 'read-only ResearchRequest must not start a potentially mutating REFRESH')
  const disabledAccept = await call(readOnlyRefreshTools.find((item) => item.name === 'decide_thesis_review_case')!, { reviewCaseId: 'review-case-exact', decision: 'ACCEPT' })
  assert.equal((disabledAccept as unknown as { isError?: boolean }).isError, true)
  assert.deepEqual(received.decision, { reviewCaseId: 'review-case-exact', decision: 'DEFER', note: 'later' }, 'read-only ResearchRequest must keep the ACCEPT write gate')
  const unspecifiedPolicyTools = createResearchHubTools({ knowledgeService: {} as never, productionService: {} as never, reviewService: {} as never, workflowService: new WorkflowService(), researchService, thesisQueryService, thesisDecisionService, policyContext: {} })
  const refreshWithoutCurrentPolicy = await call(unspecifiedPolicyTools.find((item) => item.name === 'refresh_thesis')!, { thesisRef: 'thesis:exact', asOf: '2026-09-24T00:00:00.000Z' })
  assert.equal((refreshWithoutCurrentPolicy as unknown as { isError?: boolean }).isError, false, 'unspecified policy must preserve existing refresh behavior')
  assert.deepEqual(received.refresh, { thesisRef: 'thesis:exact', asOf: '2026-09-24T00:00:00.000Z' })
  const names = tools.map((tool) => tool.name)
  assert.equal(names.includes('create_thesis'), true)
  assert.equal(names.includes('write_knowledge'), false)
})
