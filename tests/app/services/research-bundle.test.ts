import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createResearchBundle, FileResearchBundleStore } from '../../../app/services/research-bundle.ts'
import { defaultResearchContextPolicy, defaultResearchPersistencePolicy, validateResearchDispatchDecision } from '../../../app/services/research-dispatch-contracts.ts'

function decision() { return validateResearchDispatchDecision({ mode: 'workflow', workflow: { id: 'company_research', confidence: 1, arguments: { symbol: '600519' } }, skills: [], entities: [], missingRequiredInputs: [], contextPolicy: defaultResearchContextPolicy(), persistencePolicy: defaultResearchPersistencePolicy(), rationale: 'test' }) }

test('ResearchBundle derives report and proposals from one structured workflow result', async () => {
  const root = await mkdtemp(join(tmpdir(), 'rhl-bundle-'))
  try {
    const request = { query: '研究贵州茅台', mode: { type: 'workflow' as const, workflowId: 'company_research' }, contextPolicy: defaultResearchContextPolicy(), persistencePolicy: defaultResearchPersistencePolicy() }
    const d = decision()
    const bundle = createResearchBundle({ request, decision: d, summary: { mode: 'Explicit Workflow', workflowId: 'company_research', workflowLabel: 'Company Research', selectedSkillIds: [], argumentsStatus: 'extracted', argumentKeys: ['symbol'], contextPolicy: request.contextPolicy, persistencePolicy: request.persistencePolicy }, workflowRunId: 'run-1', result: { status: 'completed', report: { reportId: 'report-1', outputPath: 'report-1.md' }, research: { proposals: [{ proposalId: 'proposal-1', kind: 'claim', statement: 'Fact' }] } } })
    assert.equal(bundle.bundleId, 'research-bundle-run-1')
    assert.deepEqual(bundle.report, { reportId: 'report-1', reportPath: 'report-1.md' })
    assert.deepEqual(bundle.proposals.map((item) => item.proposalId), ['proposal-1'])
    const store = new FileResearchBundleStore(root); await store.put(bundle)
    assert.match(await readFile(join(root, 'research-bundle-run-1.json'), 'utf8'), /proposal-1/)
    assert.equal((await store.get(bundle.bundleId))?.workflowRunId, 'run-1')
    assert.equal((await store.list()).length, 1)
  } finally { await rm(root, { recursive: true, force: true }) }
})
