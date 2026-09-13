import test from 'node:test'
import assert from 'node:assert/strict'
import { aggregateCoverage, classifyCoverage } from './govcn-query-coverage.ts'

test('coverage classification prioritizes selected hits over omitted hits', () => {
  assert.equal(classifyCoverage([{ productionSelected: true, pcbTargetMatchCount: 1 }, { productionSelected: false, pcbTargetMatchCount: 1 }]), 'PRODUCTION_SELECTION_ALREADY_COVERS_HIT')
  assert.equal(classifyCoverage([{ productionSelected: false, pcbTargetMatchCount: 1 }, { productionSelected: true, pcbTargetMatchCount: 0 }]), 'QUERY_SELECTION_GAP')
  assert.equal(classifyCoverage([{ productionSelected: false, pcbTargetMatchCount: 0 }]), 'SOURCE_COVERAGE_GAP')
  assert.equal(classifyCoverage([{ productionSelected: false, pcbTargetMatchCount: 1 }], true), 'LIVE_SOURCE_INCONCLUSIVE')
})

test('offline aggregation counts only valid positive target hits', () => {
  assert.deepEqual(aggregateCoverage([
    { termHash: 'a', termId: '1', requestCount: 1, httpOutcome: 'HTTP_200', parseOutcome: 'PARSED', boundedResultCount: 2, httpsGovCnCandidateCount: 2, pcbTargetMatchCount: 0, productionSelected: true },
    { termHash: 'b', termId: '2', requestCount: 1, httpOutcome: 'HTTP_200', parseOutcome: 'PARSED', boundedResultCount: 1, httpsGovCnCandidateCount: 1, pcbTargetMatchCount: 1, productionSelected: false },
  ]), { classification: 'QUERY_SELECTION_GAP', selectedHitCount: 0, omittedHitCount: 1 })
})
