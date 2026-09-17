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
