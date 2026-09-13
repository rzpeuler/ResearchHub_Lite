import test from 'node:test'
import assert from 'node:assert/strict'
import { OfficialDisclosureResearchPlugin } from '../../plugins/research-acquisition/official.ts'
import { INDUSTRY, REQUEST, classifyAggregate, rankRelevantBoardNames } from './industry-acquisition-failure-isolation.ts'

test('Probe A proves CNINFO Industry capability absence without client invocation', async () => {
  let calls = 0
  const plugin = new OfficialDisclosureResearchPlugin({ list: async () => { calls++; throw new Error('must not call') }, fetch: async () => '' })
  assert.deepEqual(await plugin.discover(REQUEST), [])
  assert.equal(calls, 0)
})

test('aggregate classification covers setup, matching, sufficient, and mixed cases', () => {
  assert.deepEqual(classifyAggregate({ cninfoIntentionalAbsence: true, gdelt: { attempted: true, candidateCount: 0, classification: 'HTTP_SERVER_ERROR' }, akshare: { classification: 'AKSHARE_PACKAGE_UNAVAILABLE', candidateCount: 0, relevantBoardCandidates: 0 } }).classification, 'AKSHARE_EXTERNAL_SETUP_BLOCKER')
  assert.deepEqual(classifyAggregate({ cninfoIntentionalAbsence: true, gdelt: { attempted: true, candidateCount: 0, classification: 'DISCOVERY_SUCCEEDED_EMPTY' }, akshare: { classification: 'EXACT_NAME_MISMATCH_WITH_RELEVANT_BOARD_CANDIDATES', candidateCount: 0, relevantBoardCandidates: 2 } }), { classification: 'AKSHARE_MATCHING_RULE_BLOCKER_PROVEN', nextActionCategory: 'IMPLEMENT_BOUNDED_AKSHARE_INDUSTRY_ALIAS_MATCHING' })
  assert.deepEqual(classifyAggregate({ cninfoIntentionalAbsence: true, gdelt: { attempted: true, candidateCount: 1, classification: 'DISCOVERY_SUCCEEDED_WITH_RESULTS' }, akshare: { classification: 'SECTOR_DATA_EMPTY', candidateCount: 0, relevantBoardCandidates: 0 } }).nextActionCategory, 'RERUN_M3B_REAL_PI_GATE_WITHOUT_PRODUCTION_CHANGE')
  assert.deepEqual(classifyAggregate({ cninfoIntentionalAbsence: true, gdelt: { attempted: true, candidateCount: 0, classification: 'HTTP_SERVER_ERROR' }, akshare: { classification: 'AKSHARE_RUNTIME_FAILURE', candidateCount: 0, relevantBoardCandidates: 0 } }).classification, 'MIXED_ACQUISITION_BLOCKERS')
  assert.deepEqual(classifyAggregate({ cninfoIntentionalAbsence: true, gdelt: { attempted: true, candidateCount: 0, classification: 'DISCOVERY_SUCCEEDED_EMPTY' }, akshare: { classification: 'NO_RELEVANT_BOARD_CANDIDATE', candidateCount: 0, relevantBoardCandidates: 0 } }).classification, 'CURRENT_INDUSTRY_ACQUISITION_PATHS_INSUFFICIENT')
})

test('board relevance ranking is deterministic and bounded to twenty names', () => {
  const names = ['PCB', '印制电路板', '无关板块', ...Array.from({ length: 30 }, (_, index) => `PCB相关${index}`)]
  const first = rankRelevantBoardNames(names); const second = rankRelevantBoardNames([...names].reverse())
  assert.deepEqual(first, second); assert.ok(first.length <= 20); assert.ok(first.includes('PCB')); assert.ok(first.includes('印制电路板')); assert.ok(!first.includes('无关板块'))
})

test('production request semantics remain an Industry request with bounded terms', () => {
  assert.ok('industry' in REQUEST); assert.equal(REQUEST.asOf, '2026-09-12T00:00:00.000Z'); assert.equal(INDUSTRY.searchTerms.length, 8); assert.equal(REQUEST.limitPerKind, 24)
})
