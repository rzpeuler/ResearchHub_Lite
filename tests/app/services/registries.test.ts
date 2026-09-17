import assert from 'node:assert/strict'
import test from 'node:test'
import { createResearchSkillRegistry } from '../../../app/services/skill-registry.ts'
import { createWorkflowDefinitionRegistry } from '../../../app/services/workflow-registry.ts'

test('Workflow Definition Registry exposes the current executable research set', () => {
  const registry = createWorkflowDefinitionRegistry()
  const ids = registry.list().map((definition) => definition.id)
  assert.deepEqual(ids, ['company_research', 'daily_intelligence', 'earnings_review', 'event_research', 'industry_research', 'thesis_red_team', 'valuation'])
  assert.deepEqual(registry.get('earnings_review')?.requiredInputs, ['symbol', 'fiscalYear', 'period'])
  const definition = registry.get('company_research')!
  ;(definition.inputSchema as Record<string, unknown>).symbol = { type: 'number' }
  assert.deepEqual(registry.get('company_research')?.inputSchema.symbol, { type: 'string', description: 'Six-digit A-share symbol' })
})

test('Research Skill Registry separates research and knowledge candidates', () => {
  const registry = createResearchSkillRegistry()
  assert.equal(registry.get('knowledge-curation')?.kind, 'knowledge')
  assert.equal(registry.researchCandidates().some((skill) => skill.id === 'knowledge-curation'), false)
  assert.equal(registry.researchCandidates().every((skill) => skill.kind === 'research' && skill.enabled && skill.scope === 'researchhub'), true)
  assert.equal(registry.list().some((skill) => skill.id.includes('.pi')), false)
})
