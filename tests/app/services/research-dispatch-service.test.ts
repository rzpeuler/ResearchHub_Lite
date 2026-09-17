import assert from 'node:assert/strict'
import test from 'node:test'
import { ResearchDispatchService, extractWorkflowArguments } from '../../../app/services/research-dispatch-service.ts'
import { createWorkflowDefinitionRegistry } from '../../../app/services/workflow-registry.ts'
import { ResearchSkillRegistry } from '../../../app/services/skill-registry.ts'

test('explicit Earnings Review extracts company, fiscal year, and half-year period', () => {
  const registry = createWorkflowDefinitionRegistry()
  const result = extractWorkflowArguments(registry.get('earnings_review')!, '帮我分析贵州茅台 2026 年半年报相比去年最重要的变化。')
  assert.deepEqual(result.arguments, { symbol: '600519', name: '贵州茅台', fiscalYear: 2026, period: 'H1' })
  assert.deepEqual(result.missingRequiredInputs, [])
})

test('Free Research prefers a matching existing Workflow over a Skill plan', () => {
  const resolved = new ResearchDispatchService().resolve({ query: '研究贵州茅台 2026 年半年报', mode: { type: 'free_research' }, contextPolicy: { structuredKnowledge: true, sourceLibrary: true }, persistencePolicy: { writeKnowledge: false } })
  assert.equal(resolved.decision.mode, 'workflow')
  assert.equal(resolved.decision.workflow?.id, 'earnings_review')
  assert.equal(resolved.summary.mode, 'Free Research')
})

test('explicit Workflow selection is never replaced by automatic routing', () => {
  const resolved = new ResearchDispatchService().resolve({ query: '研究贵州茅台 2026 年半年报', mode: { type: 'workflow', workflowId: 'valuation' }, contextPolicy: { structuredKnowledge: false, sourceLibrary: false }, persistencePolicy: { writeKnowledge: true } })
  assert.equal(resolved.decision.workflow?.id, 'valuation')
  assert.equal(resolved.decision.missingRequiredInputs.includes('symbol'), false)
  assert.deepEqual(resolved.decision.contextPolicy, { structuredKnowledge: false, sourceLibrary: false })
  assert.deepEqual(resolved.decision.persistencePolicy, { writeKnowledge: true })
})

test('Free Research falls back to an eligible research Skill, then to free mode', () => {
  const skill = new ResearchDispatchService({ skillRegistry: new ResearchSkillRegistry([{ id: 'custom-methodology', kind: 'research', researchCapability: 'custom_research', intentDescription: 'Custom methodology', whenToUse: 'custom-methodology', enabled: true, scope: 'researchhub' }]) }).resolve({ query: 'custom-methodology', mode: { type: 'free_research' } })
  assert.equal(skill.decision.mode, 'skill_plan')
  assert.deepEqual(skill.decision.skills.map((item) => item.id), ['custom-methodology'])
  const free = new ResearchDispatchService().resolve({ query: '请帮我整理一个完全泛化的想法' })
  assert.equal(free.decision.mode, 'free_research')
})

test('English FY notation and explicit Daily Intelligence are dispatched with complete arguments', () => {
  const service = new ResearchDispatchService()
  const earnings = service.resolve({ query: 'Review FY2026 earnings for 600519', mode: { type: 'free_research' } })
  assert.equal(earnings.decision.workflow?.id, 'earnings_review')
  assert.deepEqual(earnings.decision.workflow?.arguments, { symbol: '600519', name: '贵州茅台', fiscalYear: 2026, period: 'FY' })
  const daily = service.resolve({ query: '生成 morning brief 2026-09-17', mode: { type: 'workflow', workflowId: 'daily_intelligence' } })
  assert.deepEqual(daily.decision.workflow?.arguments, { briefType: 'morning', tradeDate: '2026-09-17' })
  assert.deepEqual(daily.decision.missingRequiredInputs, [])
})

test('started dispatch persists one ResearchBundle from the workflow result and forwards policy', async () => {
  const calls: unknown[] = []
  const store = new (class { readonly values = new Map<string, unknown>(); async put(bundle: { bundleId: string }) { this.values.set(bundle.bundleId, bundle) }; async get(id: string) { return this.values.get(id) }; async list() { return [...this.values.values()] } })()
  const research = ({ startEarningsReview: (input: unknown) => { calls.push(input); return { completion: Promise.resolve({ status: 'completed', report: { reportId: 'earnings-report', outputPath: 'earnings-report.md' }, research: { proposals: [{ proposalId: 'earnings-proposal', kind: 'claim' }] } }) } } } as never)
  const service = new ResearchDispatchService({ researchService: research, bundleStore: store as never })
  const started = service.start({ query: '贵州茅台 2026 年半年报', mode: { type: 'workflow', workflowId: 'earnings_review' }, contextPolicy: { structuredKnowledge: true, sourceLibrary: true }, persistencePolicy: { writeKnowledge: false } })
  await started.completion
  assert.equal((calls[0] as { writeKnowledge: boolean }).writeKnowledge, false)
  const bundle = await service.getBundle(`research-bundle-${started.runId!}`) as { report?: { reportId: string }; proposals: readonly { proposalId: string }[] }
  assert.equal(bundle.report?.reportId, 'earnings-report'); assert.deepEqual(bundle.proposals.map((item) => item.proposalId), ['earnings-proposal'])
})

test('session-bound ResearchBundle is finalized from the captured assistant output', async () => {
  const values = new Map<string, any>(); const store = { async put(bundle: any) { values.set(bundle.bundleId, bundle) }, async get(id: string) { return values.get(id) }, async list() { return [...values.values()] } }
  const service = new ResearchDispatchService({ bundleStore: store as never }); const started = service.start({ query: '整理一个泛化研究问题' }); assert.equal(started.status, 'free_research'); assert.ok(started.runId)
  await service.completeSessionResearch(started.runId!, 'captured assistant answer')
  const bundle = values.get(`research-bundle-${started.runId!}`); assert.equal(bundle.status, 'completed'); assert.deepEqual(bundle.structuredResult, { status: 'completed', executionBoundary: 'session', answer: 'captured assistant answer' })
})
