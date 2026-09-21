import assert from 'node:assert/strict'
import test from 'node:test'
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { CANONICAL_RESEARCH_SKILL_CATALOG, REQUIRED_RESEARCH_SKILL_SECTIONS } from '../../../app/services/research-skill-catalog.ts'
import { createResearchSkillRegistry } from '../../../app/services/skill-registry.ts'
import { createWorkflowDefinitionRegistry } from '../../../app/services/workflow-registry.ts'
import { ResearchDispatchService } from '../../../app/services/research-dispatch-service.ts'

test('canonical catalog has exactly 29 unique statuses and runtime is a strict implemented subset', () => {
  assert.equal(CANONICAL_RESEARCH_SKILL_CATALOG.length, 29)
  assert.equal(new Set(CANONICAL_RESEARCH_SKILL_CATALOG.map((item) => item.canonicalSkillId)).size, 29)
  assert.equal(CANONICAL_RESEARCH_SKILL_CATALOG.every((item) => ['IMPLEMENTED', 'PARTIAL', 'PLANNED'].includes(item.status)), true)
  const registry = createResearchSkillRegistry()
  const catalog = new Map(CANONICAL_RESEARCH_SKILL_CATALOG.map((item) => [item.canonicalSkillId, item]))
  for (const definition of registry.canonicalResearchCandidates()) {
    const item = catalog.get(definition.id)
    assert.ok(item)
    assert.equal(item?.status, 'IMPLEMENTED')
    assert.equal(item?.runtimeRegistered, true)
    assert.equal(definition.origin, 'canonical')
    assert.ok(definition.purpose)
    assert.ok(definition.invocationMatch)
    assert.ok(definition.inputs?.length)
    assert.ok(definition.produces?.length)
  }
  for (const item of CANONICAL_RESEARCH_SKILL_CATALOG.filter((entry) => !entry.runtimeRegistered)) assert.equal(registry.get(item.canonicalSkillId), undefined, item.canonicalSkillId)
})

test('every runtime canonical methodology contains the required contract sections', async () => {
  const registry = createResearchSkillRegistry()
  for (const definition of registry.canonicalResearchCandidates()) {
    const path = definition.skillMdPath
    assert.ok(path)
    const text = await readFile(path!, 'utf8')
    for (const section of REQUIRED_RESEARCH_SKILL_SECTIONS) assert.match(text, new RegExp(`^##\\s+${section.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}\\s*$`, 'mi'), `${definition.id}: ${section}`)
  }
})

test('Workflow metadata composes canonical peers without registering composite Skill IDs', () => {
  const registry = createResearchSkillRegistry()
  const workflows = createWorkflowDefinitionRegistry().list()
  assert.equal(workflows.every((workflow) => workflow.skillIds.every((id) => CANONICAL_RESEARCH_SKILL_CATALOG.some((item) => item.canonicalSkillId === id))), true)
  assert.deepEqual(workflows.find((item) => item.id === 'earnings_review')?.skillIds.slice(0, 4), ['consensus_expectations_analysis', 'earnings_variance_analysis', 'guidance_analysis', 'earnings_call_analysis'])
  assert.equal(registry.get('company-research'), undefined)
  assert.equal(registry.get('earnings-review'), undefined)
  assert.equal(registry.get('valuation'), undefined)
})

test('canonical Skill implementations do not directly invoke another Skill, the registry, or a Workflow', async () => {
  const root = join(process.cwd(), 'skills')
  const forbidden = /(?:skill-registry|ResearchSkillRegistry|workflows\/?|WorkflowService|invokeSkill|runSkill)/i
  for (const item of CANONICAL_RESEARCH_SKILL_CATALOG.filter((entry) => entry.runtimeRegistered)) {
    const directory = join(root, item.canonicalSkillId)
    for (const file of await readdir(directory)) {
      if (!file.endsWith('.ts')) continue
      const text = await readFile(join(directory, file), 'utf8')
      assert.equal(forbidden.test(text), false, `${item.canonicalSkillId}/${file}`)
    }
  }
})

test('narrow semantic routing selects the intended canonical Skill and composite requests select a Workflow', () => {
  const service = new ResearchDispatchService()
  const cases = [
    ['当前价格已经price in多少增长？', 'reverse_dcf_expectation_decode'],
    ['按我的收入利润预测给公司做DCF。', 'dcf_valuation'],
    ['这次收入为什么beat consensus？', 'earnings_variance_analysis'],
    ['管理层这次guidance相对上次有什么变化？', 'guidance_analysis'],
    ['这家公司到底靠什么赚钱？', 'business_model_map'],
    ['收入增长到底是销量、价格还是mix驱动？', 'business_driver_analysis'],
    ['当前最合理的经济单位是什么？', 'unit_economics'],
    ['我这个投资逻辑最容易错在哪里？', 'thesis_red_team'],
  ] as const
  for (const [query, expected] of cases) {
    const result = service.resolve({ query, mode: { type: 'free_research' } })
    assert.equal(result.decision.mode, 'skill_plan', query)
    assert.deepEqual(result.decision.skills.map((skill) => skill.id), [expected], query)
  }
  const composite = service.resolve({ query: '完整研究这家公司。', mode: { type: 'free_research' } })
  assert.equal(composite.decision.mode, 'workflow')
  assert.equal(composite.decision.workflow?.id, 'company_research')
})
