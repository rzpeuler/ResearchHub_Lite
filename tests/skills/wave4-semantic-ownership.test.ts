import assert from 'node:assert/strict'
import test from 'node:test'
import { MockReasoningExecutor } from '../../plugins/reasoning/mock/executor.ts'
import { executeThesisFormalize } from '../../skills/thesis_formalize/semantic.ts'
import { executeCatalystMap } from '../../skills/catalyst_map/semantic.ts'
import { executeThesisRefresh } from '../../skills/thesis_refresh/semantic.ts'

const capabilities = { maxContextTokens: 4000, maxOutputTokens: 2000, structuredOutputSupport: true, maxConcurrency: 1 }

test('thesis_formalize owns narrative-to-proposition transformation before deterministic formalization', async () => {
  const executor = new MockReasoningExecutor({ capabilities, responses: {
    thesis_formalize_semantic: {
      summary: 'Demand remains the primary thesis driver.',
      propositions: [
        { propositionId: 'p-demand', statement: 'Demand growth sustains revenue growth.', propositionType: 'business_driver', basis: 'verified_evidence', timeHorizon: 'near_term', sourceRefs: ['src-demand'], verificationCondition: 'Next reported period confirms demand growth.' },
        { propositionId: 'p-margin', statement: 'Operating leverage converts demand into margin expansion.', propositionType: 'financial_outcome', basis: 'inference', timeHorizon: 'medium_term', dependsOnPropositionRefs: ['p-demand'], verificationCondition: 'Margin expands after demand growth.' },
      ],
      researchGaps: [],
    },
  } })
  const result = await executeThesisFormalize({ narrative: 'Demand should drive revenue and later margin expansion.', evidence: [{ evidenceId: 'e1', statement: 'The filing reports demand growth.', sourceRefs: ['src-demand'], publishedAt: '2026-09-01' }], asOf: '2026-09-10' }, executor)
  assert.equal(result.status, 'complete')
  assert.equal(result.result?.propositions.length, 2)
  assert.deepEqual(result.result?.dependencies.map((item) => item.sourcePropositionRef), ['p-margin'])
  assert.equal('propositions' in (executor.calls[0]?.input as object), false)
})

test('catalyst_map owns event-to-proposition mapping from unlinked attributable evidence', async () => {
  const executor = new MockReasoningExecutor({ capabilities, responses: {
    catalyst_map_semantic: { catalysts: [{ eventId: 'event-earnings', catalystId: 'cat-earnings', eventType: 'earnings', description: 'Next earnings release tests demand.', targetPropositionRefs: ['p-demand'], targetExpectationGapRefs: ['gap-demand'], eventDate: '2026-10-20', status: 'scheduled', observable: 'Reported demand and revenue', sourceRefs: ['calendar-official'] }] },
  } })
  const result = await executeCatalystMap({ thesisRef: 'thesis:demo', propositions: [{ propositionId: 'p-demand', statement: 'Demand grows.' }], expectationGaps: [{ gapId: 'gap-demand', statement: 'Price implies faster growth.' }], asOf: '2026-09-21', events: [{ eventId: 'event-earnings', description: 'Official earnings calendar', eventType: 'earnings', eventDate: '2026-10-20', status: 'scheduled', observable: 'Reported demand and revenue', sourceRefs: ['calendar-official'] }] }, executor)
  assert.equal(result.status, 'complete')
  assert.deepEqual(result.result?.catalysts[0]?.targetPropositionRefs, ['p-demand'])
  assert.deepEqual(result.result?.catalysts[0]?.targetExpectationGapRefs, ['gap-demand'])
  const input = executor.calls[0]?.input as Record<string, unknown>
  assert.equal(JSON.stringify(input).includes('targetPropositionRefs'), false)
})

test('thesis_refresh owns target and relation classification from unlabeled point-in-time evidence', async () => {
  const executor = new MockReasoningExecutor({ capabilities, responses: {
    thesis_refresh_semantic: { evidence: [{ evidenceId: 'e-new', relation: 'supports', targetPropositionRefs: ['p-demand'], sourceRefs: ['filing-new'] }] },
  } })
  const result = await executeThesisRefresh({ priorSnapshot: { thesisId: 'thesis:demo', priorAsOf: '2026-09-01', propositions: [{ propositionId: 'p-demand', statement: 'Demand grows.', status: 'unchanged', loadBearing: true }, { propositionId: 'p-margin', statement: 'Margins expand.', status: 'unchanged' }] }, currentAsOf: '2026-09-21', evidence: [{ evidenceId: 'e-new', publishedAt: '2026-09-15', statement: 'Demand accelerated.', sourceRefs: ['filing-new'], metric: 'demand' }] }, executor)
  assert.equal(result.status, 'complete')
  assert.equal(result.result?.propositionDeltas[0]?.propositionRef, 'p-demand')
  assert.equal(result.result?.candidateTransition, 'strengthened')
  const input = executor.calls[0]?.input as Record<string, unknown>
  assert.equal(JSON.stringify(input).includes('"relation"'), false)
  assert.equal(JSON.stringify(input).includes('targetPropositionRefs'), false)
})

test('semantic ownership fails closed after one bounded repair on forged refs', async () => {
  const executor = new MockReasoningExecutor({ capabilities, responses: { catalyst_map_semantic: { catalysts: [{ eventId: 'event-1', catalystId: 'cat-1', eventType: 'earnings', description: 'Forged mapping', targetPropositionRefs: ['p-forged'], status: 'scheduled', observable: 'unknown', sourceRefs: ['src-1'], eventDate: '2026-10-01' }] } } })
  const result = await executeCatalystMap({ thesisRef: 'thesis:demo', propositions: [{ propositionId: 'p-real' }], asOf: '2026-09-21', events: [{ eventId: 'event-1', description: 'Official event', sourceRefs: ['src-1'], eventDate: '2026-10-01', status: 'scheduled', eventType: 'earnings', observable: 'reported result' }] }, executor)
  assert.equal(result.status, 'blocked')
  assert.equal(result.telemetry.repairAttempts, 1)
  assert.equal(executor.calls.length, 2)
})

test('refresh semantic stage preserves PIT safeguards for future evidence', async () => {
  const executor = new MockReasoningExecutor({ capabilities, responses: { thesis_refresh_semantic: { evidence: [{ evidenceId: 'e-future', relation: 'supports', targetPropositionRefs: ['p-demand'], sourceRefs: ['future-source'] }] } } })
  const result = await executeThesisRefresh({ priorSnapshot: { thesisId: 'thesis:demo', priorAsOf: '2026-09-01', propositions: [{ propositionId: 'p-demand', statement: 'Demand grows.' }] }, currentAsOf: '2026-09-21', evidence: [{ evidenceId: 'e-future', publishedAt: '2026-10-01', sourceRefs: ['future-source'], statement: 'Future result.' }] }, executor)
  assert.equal(result.status, 'complete')
  assert.equal(result.result?.candidateTransition, 'unchanged')
  assert.ok(result.result?.diagnostics.includes('future_evidence_was_not_applied'))
})
