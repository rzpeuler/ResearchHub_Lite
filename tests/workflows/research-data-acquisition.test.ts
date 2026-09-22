import assert from 'node:assert/strict'
import test from 'node:test'
import {
  candidateEligibility,
  resolveSourcePolicy,
  runResearchDataAcquisition,
  type DataRequirement,
  type SourceCandidate,
  type SourcePolicy,
} from '../../workflows/research-data-acquisition/index.ts'

const AS_OF = '2026-09-22T00:00:00.000Z'

function requirement(overrides: Partial<DataRequirement> = {}): DataRequirement {
  return {
    id: 'revenue-requirement',
    consumer: { workflow: 'company-research', capability: 'revenue' },
    subject: { companyId: 'company:fixture' },
    dataKind: 'metric',
    metricId: 'revenue',
    asOf: AS_OF,
    determinismClass: 'AUTHORITATIVE_NUMERIC',
    llmWebFallback: 'FORBIDDEN',
    ...overrides,
  }
}

function candidate(sourceId: string, fallbackLevel: SourceCandidate['fallbackLevel'], originAuthority: SourceCandidate['originAuthority'] = 'S1_OFFICIAL', overrides: Partial<SourceCandidate> = {}): SourceCandidate {
  return {
    sourceId,
    fallbackLevel,
    originAuthority,
    originPublisher: sourceId,
    operationId: `${sourceId}-operation`,
    supports: { dataKinds: ['metric'], metricIds: ['revenue'] },
    ...overrides,
  }
}

function policy(selectionMode: SourcePolicy['selectionMode'], candidates: readonly SourceCandidate[], requirementMatch: SourcePolicy['requirementMatch'] = { dataKind: 'metric' }): SourcePolicy {
  return { policyId: `${selectionMode.toLowerCase()}-policy`, requirementMatch, selectionMode, candidates }
}

const success = (data: unknown, source: Record<string, string> = {}) => ({ status: 'SUCCESS' as const, data, source })
const failed = (status: 'NO_DATA' | 'TIMEOUT' | 'RATE_LIMITED' | 'ACCESS_DENIED' | 'PARSE_ERROR' | 'STALE' | 'UNSUPPORTED') => ({ status })

test('exact metricId policy beats metricFamily policy', () => {
  const exact = { ...policy('FIRST_VALID', [], { metricId: 'revenue' }), policyId: 'exact' }
  const family = { ...policy('FIRST_VALID', [], { metricFamily: 'financials' }), policyId: 'family' }
  assert.equal(resolveSourcePolicy(requirement({ metricFamily: 'financials' }), [family, exact]).policy?.policyId, 'exact')
})

test('metricFamily policy beats generic dataKind policy', () => {
  const family = { ...policy('FIRST_VALID', [], { metricFamily: 'financials' }), policyId: 'family' }
  const generic = { ...policy('FIRST_VALID', [], { dataKind: 'metric' }), policyId: 'generic' }
  assert.equal(resolveSourcePolicy(requirement({ metricFamily: 'financials' }), [generic, family]).policy?.policyId, 'family')
})

test('same-specificity policies fail deterministically', () => {
  const left = { ...policy('FIRST_VALID', [], { metricId: 'revenue' }), policyId: 'left' }
  const right = { ...policy('FIRST_VALID', [], { metricId: 'revenue' }), policyId: 'right' }
  assert.deepEqual(resolveSourcePolicy(requirement(), [right, left]), { status: 'AMBIGUOUS_POLICY', specificity: 100, candidatePolicyIds: ['left', 'right'] })
})

test('no policy returns NO_REGISTERED_POLICY', async () => {
  const result = await runResearchDataAcquisition({ requirement: requirement(), policies: [], executor: async () => success(1) })
  assert.equal(result.unavailableReason, 'NO_REGISTERED_POLICY')
})

test('FIRST_VALID primary success prevents fallback invocation', async () => {
  const calls: string[] = []
  const primary = candidate('primary', 'PRIMARY')
  const fallback = candidate('fallback', 'FALLBACK_1')
  const result = await runResearchDataAcquisition({ requirement: requirement(), policies: [policy('FIRST_VALID', [fallback, primary])], executor: async (_r, c) => { calls.push(c.sourceId); return success({ value: 100 }) } })
  assert.deepEqual(calls, ['primary'])
  assert.equal(result.source?.fallbackLevel, 'PRIMARY')
  assert.equal(result.attempts.length, 1)
})

test('FIRST_VALID falls through NO_DATA, TIMEOUT, RATE_LIMITED, and period-invalid primary', async () => {
  for (const firstResult of [failed('NO_DATA'), failed('TIMEOUT'), failed('RATE_LIMITED'), success(1, { publishedAt: '2026-09-23T00:00:00.000Z' })]) {
    const calls: string[] = []
    const primary = candidate('primary', 'PRIMARY')
    const fallback = candidate('fallback', 'FALLBACK_1')
    const result = await runResearchDataAcquisition({ requirement: requirement(), policies: [policy('FIRST_VALID', [primary, fallback])], executor: async (_r, c) => { calls.push(c.sourceId); return c.sourceId === 'primary' ? firstResult : success({ value: 101 }) }, now: () => AS_OF })
    assert.deepEqual(calls, ['primary', 'fallback'])
    assert.equal(result.source?.sourceId, 'fallback')
  }
})

test('fallback success records FALLBACK_1 and its reason', async () => {
  const result = await runResearchDataAcquisition({ requirement: requirement(), policies: [policy('FIRST_VALID', [candidate('p', 'PRIMARY'), candidate('f1', 'FALLBACK_1')])], executor: async (_r, c) => c.sourceId === 'p' ? failed('NO_DATA') : success(7) })
  assert.equal(result.source?.fallbackLevel, 'FALLBACK_1')
  assert.equal(result.fallbackReason, 'PRIMARY_NO_DATA')
})

test('FIRST_VALID reaches FALLBACK_2 only after earlier failures', async () => {
  const result = await runResearchDataAcquisition({ requirement: requirement(), policies: [policy('FIRST_VALID', [candidate('p', 'PRIMARY'), candidate('f1', 'FALLBACK_1'), candidate('f2', 'FALLBACK_2')])], executor: async (_r, c) => c.sourceId === 'f2' ? success(8) : failed('NO_DATA') })
  assert.equal(result.source?.fallbackLevel, 'FALLBACK_2')
  assert.deepEqual(result.attempts.map((attempt) => attempt.fallbackLevel), ['PRIMARY', 'FALLBACK_1', 'FALLBACK_2'])
})

test('all FIRST_VALID candidates failing returns explicit unavailable result', async () => {
  const result = await runResearchDataAcquisition({ requirement: requirement(), policies: [policy('FIRST_VALID', [candidate('p', 'PRIMARY'), candidate('f1', 'FALLBACK_1'), candidate('f2', 'FALLBACK_2')])], executor: async () => failed('NO_DATA') })
  assert.equal(result.status, 'UNAVAILABLE')
  assert.equal(result.unavailableReason, 'DATA_NOT_PUBLISHED')
  assert.deepEqual(result.attempts.map((attempt) => attempt.sourceId), ['p', 'f1', 'f2'])
})

test('publishedAt equal to or before asOf is valid', async () => {
  for (const publishedAt of ['2026-09-22T00:00:00.000Z', '2026-09-21T00:00:00.000Z']) {
    const result = await runResearchDataAcquisition({ requirement: requirement(), policies: [policy('FIRST_VALID', [candidate('p', 'PRIMARY')])], executor: async () => success(1, { publishedAt }) })
    assert.equal(result.status, 'AVAILABLE')
  }
})

test('publishedAt after asOf becomes POINT_IN_TIME_INVALID and can fall through', async () => {
  const result = await runResearchDataAcquisition({ requirement: requirement(), policies: [policy('FIRST_VALID', [candidate('p', 'PRIMARY'), candidate('f1', 'FALLBACK_1')])], executor: async (_r, c) => c.sourceId === 'p' ? success(100, { publishedAt: '2026-09-23T00:00:00.000Z' }) : success(90, { publishedAt: '2026-09-22T00:00:00.000Z' }) })
  assert.equal(result.source?.sourceId, 'f1')
  assert.equal(result.attempts[0]?.status, 'POINT_IN_TIME_INVALID')
})

test('minimum S1 rejects S2, S3, and S4', () => {
  for (const authority of ['S2_PROFESSIONAL', 'S3_AGGREGATOR', 'S4_COMMUNITY'] as const) {
    assert.deepEqual(candidateEligibility(requirement({ minimumAuthority: 'S1_OFFICIAL' }), candidate('source', 'PRIMARY', authority)), { eligible: false, reason: 'INSUFFICIENT_AUTHORITY' })
  }
})

test('minimum S3 accepts S0, S1, S2, and S3', () => {
  for (const authority of ['S0_STATUTORY', 'S1_OFFICIAL', 'S2_PROFESSIONAL', 'S3_AGGREGATOR'] as const) assert.equal(candidateEligibility(requirement({ minimumAuthority: 'S3_AGGREGATOR' }), candidate('source', 'PRIMARY', authority)).eligible, true)
})

test('LLM_WEB EXTRACT_WITH_PROVENANCE rejects incomplete provenance', async () => {
  const result = await runResearchDataAcquisition({ requirement: requirement({ llmWebFallback: 'EXTRACT_WITH_PROVENANCE' }), policies: [policy('FIRST_VALID', [candidate('web', 'LLM_WEB', 'S0_STATUTORY')])], executor: async () => success(42, { originPublisher: 'National Bureau of Statistics', retrievalProvider: 'llm-web' }) })
  assert.equal(result.attempts[0]?.status, 'VALIDATION_ERROR')
  assert.equal(result.unavailableReason, 'INCOMPLETE_REQUIRED_FIELDS')
})

test('LLM_WEB acquisition retains original S0 authority with complete provenance', async () => {
  const result = await runResearchDataAcquisition({ requirement: requirement({ llmWebFallback: 'EXTRACT_WITH_PROVENANCE' }), policies: [policy('FIRST_VALID', [candidate('web', 'LLM_WEB', 'S0_STATUTORY')])], executor: async () => success(42, { originPublisher: 'National Bureau of Statistics', sourceUrl: 'https://example.test/report', publishedAt: AS_OF, retrievedAt: AS_OF, retrievalProvider: 'llm-web' }) })
  assert.equal(result.source?.fallbackLevel, 'LLM_WEB')
  assert.equal(result.source?.originAuthority, 'S0_STATUTORY')
  assert.equal(result.source?.retrievalProvider, 'llm-web')
})

test('numeric zero is valid and is not treated as missing', async () => {
  const result = await runResearchDataAcquisition({ requirement: requirement({ requiredFields: ['value'] }), policies: [policy('FIRST_VALID', [candidate('p', 'PRIMARY')])], executor: async () => success({ value: 0 }) })
  assert.equal(result.status, 'AVAILABLE')
  assert.equal((result.data as { readonly value?: number } | undefined)?.value, 0)
})

test('missing required numeric field produces validation failure', async () => {
  const result = await runResearchDataAcquisition({ requirement: requirement({ requiredFields: ['value'] }), policies: [policy('FIRST_VALID', [candidate('p', 'PRIMARY')])], executor: async () => success({ other: 0 }) })
  assert.equal(result.attempts[0]?.status, 'VALIDATION_ERROR')
  assert.equal(result.unavailableReason, 'INCOMPLETE_REQUIRED_FIELDS')
})

test('missing and zero remain distinct in required-field validation', async () => {
  const policies = [policy('FIRST_VALID', [candidate('p', 'PRIMARY')])]
  const zero = await runResearchDataAcquisition({ requirement: requirement({ requiredFields: ['value'] }), policies, executor: async () => success({ value: 0 }) })
  const missing = await runResearchDataAcquisition({ requirement: requirement({ requiredFields: ['value'] }), policies, executor: async () => success({}) })
  assert.equal(zero.attempts[0]?.status, 'SUCCESS')
  assert.equal(missing.attempts[0]?.status, 'VALIDATION_ERROR')
})

test('CROSS_CHECK retains agreeing observations and provenance', async () => {
  const result = await runResearchDataAcquisition({ requirement: requirement(), policies: [policy('CROSS_CHECK', [candidate('p', 'PRIMARY'), candidate('f1', 'FALLBACK_1')])], executor: async () => success({ value: 100 }) })
  assert.equal(result.crossCheckStatus, 'CONSISTENT')
  assert.equal(result.quality.crossChecked, true)
  assert.deepEqual(result.observations?.map((observation) => observation.source.sourceId), ['p', 'f1'])
})

test('CROSS_CHECK preserves conflicts and never averages numeric values', async () => {
  const result = await runResearchDataAcquisition({ requirement: requirement(), policies: [policy('CROSS_CHECK', [candidate('p', 'PRIMARY'), candidate('f1', 'FALLBACK_1')])], executor: async (_r, c) => success(c.sourceId === 'p' ? 100 : 120) })
  assert.equal(result.crossCheckStatus, 'CONFLICT')
  assert.equal(result.unavailableReason, 'SOURCE_CONFLICT')
  assert.equal(result.data, 100)
  assert.deepEqual(result.observations?.map((observation) => observation.data), [100, 120])
})

test('COLLECT_DIVERSE retains several successful source identities', async () => {
  const evidenceCandidates = [candidate('p', 'PRIMARY', 'S1_OFFICIAL', { supports: { dataKinds: ['evidence'] } }), candidate('f1', 'FALLBACK_1', 'S2_PROFESSIONAL', { supports: { dataKinds: ['evidence'] } }), candidate('f2', 'FALLBACK_2', 'S3_AGGREGATOR', { supports: { dataKinds: ['evidence'] } })]
  const result = await runResearchDataAcquisition({ requirement: requirement({ dataKind: 'evidence', metricId: undefined }), policies: [policy('COLLECT_DIVERSE', evidenceCandidates, { dataKind: 'evidence' })], executor: async (_r, c) => success({ source: c.sourceId }) })
  assert.equal(result.status, 'AVAILABLE')
  assert.deepEqual(result.sources?.map((source) => source.sourceId), ['p', 'f1', 'f2'])
  assert.deepEqual(result.observations?.map((observation) => (observation.data as { readonly source: string }).source), ['p', 'f1', 'f2'])
})

test('AUTHORITATIVE_NUMERIC rejects FULL_EVIDENCE_RESEARCH deterministically', async () => {
  await assert.rejects(() => runResearchDataAcquisition({ requirement: requirement({ llmWebFallback: 'FULL_EVIDENCE_RESEARCH' }), policies: [], executor: async () => success(1) }), /AUTHORITATIVE_NUMERIC cannot use FULL_EVIDENCE_RESEARCH/)
})

test('DISCOVERY_ONLY is representable but does not authorize acquisition', async () => {
  const calls: string[] = []
  const result = await runResearchDataAcquisition({ requirement: requirement({ llmWebFallback: 'DISCOVERY_ONLY' }), policies: [policy('FIRST_VALID', [candidate('web', 'LLM_WEB', 'S1_OFFICIAL')])], executor: async () => { calls.push('called'); return success(1) } })
  assert.equal(result.status, 'UNAVAILABLE')
  assert.deepEqual(calls, [])
})

test('semantic qualitative requirement can use FULL_EVIDENCE_RESEARCH', async () => {
  const result = await runResearchDataAcquisition({ requirement: requirement({ dataKind: 'evidence', metricId: undefined, determinismClass: 'SEMANTIC_QUALITATIVE', llmWebFallback: 'FULL_EVIDENCE_RESEARCH' }), policies: [policy('FIRST_VALID', [candidate('web', 'LLM_WEB', 'S1_OFFICIAL', { supports: { dataKinds: ['evidence'] } })], { dataKind: 'evidence' })], executor: async () => success('evidence') })
  assert.equal(result.status, 'AVAILABLE')
})

test('every attempted source has exactly one telemetry record and unattempted fallback is absent', async () => {
  const result = await runResearchDataAcquisition({ requirement: requirement(), policies: [policy('FIRST_VALID', [candidate('p', 'PRIMARY'), candidate('f1', 'FALLBACK_1'), candidate('f2', 'FALLBACK_2')])], executor: async (_r, c) => c.sourceId === 'p' ? success(1) : failed('NO_DATA') })
  assert.deepEqual(result.attempts.map((attempt) => attempt.sourceId), ['p'])
  assert.equal(new Set(result.attempts.map((attempt) => attempt.sourceId)).size, result.attempts.length)
})

test('executor exceptions become bounded failures and preserve fallback telemetry', async () => {
  const result = await runResearchDataAcquisition({ requirement: requirement(), policies: [policy('FIRST_VALID', [candidate('p', 'PRIMARY'), candidate('f1', 'FALLBACK_1')])], executor: async (_r, c) => { if (c.sourceId === 'p') throw new Error('fixture transport failure'); return success(2) } })
  assert.equal(result.source?.sourceId, 'f1')
  assert.equal(result.attempts[0]?.status, 'UNSUPPORTED')
  assert.match(result.attempts[0]?.diagnostic ?? '', /^EXECUTOR_THROWN:/)
  assert.equal(result.fallbackReason, 'PRIMARY_UNSUPPORTED')
})

test('malformed requirements fail before executor invocation', async () => {
  const invalid = requirement({ id: '', consumer: { workflow: '', capability: '' } })
  await assert.rejects(() => runResearchDataAcquisition({ requirement: invalid, policies: [], executor: async () => success(1) }), /INVALID_DATA_REQUIREMENT/)
})

test('metric requirements reject missing metric identity without over-validating evidence requests', async () => {
  await assert.rejects(() => runResearchDataAcquisition({ requirement: requirement({ metricId: undefined, metricFamily: undefined }), policies: [], executor: async () => success(1) }), /metricId or metricFamily/)
  const evidence = await runResearchDataAcquisition({ requirement: requirement({ dataKind: 'evidence', metricId: undefined }), policies: [policy('FIRST_VALID', [candidate('e', 'PRIMARY', 'S1_OFFICIAL', { supports: { dataKinds: ['evidence'] } })], { dataKind: 'evidence' })], executor: async () => success('ok') })
  assert.equal(evidence.status, 'AVAILABLE')
})

test('ambiguous policy resolution fails before any source is attempted', async () => {
  const calls: string[] = []
  const policies = [{ ...policy('FIRST_VALID', [candidate('left', 'PRIMARY')], { metricId: 'revenue' }), policyId: 'left-policy' }, { ...policy('FIRST_VALID', [candidate('right', 'PRIMARY')], { metricId: 'revenue' }), policyId: 'right-policy' }]
  const result = await runResearchDataAcquisition({ requirement: requirement(), policies, executor: async () => { calls.push('called'); return success(1) } })
  assert.equal(result.unavailableReason, 'AMBIGUOUS_POLICY')
  assert.deepEqual(calls, [])
})

test('ACCESS_DENIED and PARSE_ERROR are bounded fallback statuses', async () => {
  for (const status of ['ACCESS_DENIED', 'PARSE_ERROR'] as const) {
    const result = await runResearchDataAcquisition({ requirement: requirement(), policies: [policy('FIRST_VALID', [candidate('p', 'PRIMARY'), candidate('f1', 'FALLBACK_1')])], executor: async (_r, c) => c.sourceId === 'p' ? failed(status) : success(3) })
    assert.equal(result.attempts[0]?.status, status)
    assert.equal(result.source?.sourceId, 'f1')
  }
})

test('CROSS_CHECK reports insufficient corroboration for one valid observation', async () => {
  const result = await runResearchDataAcquisition({ requirement: requirement(), policies: [policy('CROSS_CHECK', [candidate('p', 'PRIMARY'), candidate('f1', 'FALLBACK_1')])], executor: async (_r, c) => c.sourceId === 'p' ? success(4) : failed('NO_DATA') })
  assert.equal(result.crossCheckStatus, 'INSUFFICIENT_CROSS_CHECK')
  assert.equal(result.status, 'PARTIAL')
  assert.equal(result.quality.crossChecked, false)
})

test('COLLECT_DIVERSE reports partial collection without discarding valid evidence', async () => {
  const candidates = [candidate('p', 'PRIMARY', 'S1_OFFICIAL', { supports: { dataKinds: ['evidence'] } }), candidate('f1', 'FALLBACK_1', 'S2_PROFESSIONAL', { supports: { dataKinds: ['evidence'] } })]
  const result = await runResearchDataAcquisition({ requirement: requirement({ dataKind: 'evidence', metricId: undefined }), policies: [policy('COLLECT_DIVERSE', candidates, { dataKind: 'evidence' })], executor: async (_r, c) => c.sourceId === 'p' ? success('kept') : failed('NO_DATA') })
  assert.equal(result.status, 'PARTIAL')
  assert.deepEqual(result.observations?.map((observation) => observation.data), ['kept'])
})

test('candidate metric support is enforced independently from source authority', async () => {
  const result = await runResearchDataAcquisition({ requirement: requirement({ metricId: 'gross_margin' }), policies: [policy('FIRST_VALID', [candidate('p', 'PRIMARY', 'S0_STATUTORY', { supports: { dataKinds: ['metric'], metricIds: ['revenue'] } })], { dataKind: 'metric' })], executor: async () => success(1) })
  assert.equal(result.status, 'UNAVAILABLE')
  assert.equal(result.attempts.length, 0)
})

test('origin publisher, origin authority, and retrieval provider remain separate fields', async () => {
  const result = await runResearchDataAcquisition({ requirement: requirement(), policies: [policy('FIRST_VALID', [candidate('official', 'PRIMARY', 'S1_OFFICIAL')])], executor: async () => success(5, { originPublisher: 'Official Statistics Bureau', retrievalProvider: 'fixture-plugin', sourceUrl: 'fixture://official/source' }) })
  assert.equal(result.source?.originPublisher, 'Official Statistics Bureau')
  assert.equal(result.source?.originAuthority, 'S1_OFFICIAL')
  assert.equal(result.source?.retrievalProvider, 'fixture-plugin')
  assert.equal(result.source?.sourceUrl, 'fixture://official/source')
})
