import assert from 'node:assert/strict'
import test from 'node:test'
import { analyzeCompetitiveMarketMap, type CompetitiveMarketMapInput } from '../../skills/competitive_market_map/index.ts'

const refs = (name: string): readonly string[] => [`source:${name}`]
const player = (id: string, overrides: Partial<CompetitiveMarketMapInput['players'][number]> = {}): CompetitiveMarketMapInput['players'][number] => ({ id, name: id, status: 'active', geography: 'China', positioning: { segments: ['enterprise'], valueProposition: 'workflow automation', differentiators: ['integration'], sourceRefs: refs(`${id}-positioning`) }, peerEvidence: { samePurchaseDecision: true, sameWorkflow: true, sameEconomics: true, customerOverlap: true, sourceRefs: refs(`${id}-peer`) }, events: [], sourceRefs: refs(id), ...overrides })
const base = (overrides: Partial<CompetitiveMarketMapInput> = {}): CompetitiveMarketMapInput => ({ marketRef: 'market:workflow-automation', asOf: '2026-09-21T00:00:00.000Z', boundary: { marketName: 'Enterprise workflow automation', included: ['software sold to enterprises'], excluded: ['consumer apps'], geography: 'China', period: '2026-H1', sourceRefs: refs('boundary') }, segmentation: { axis: 'buyer', values: ['enterprise'], sourceRefs: refs('segmentation') }, players: [player('alpha'), player('beta')], whitespace: { unmetNeed: 'present', economicSignal: 'attractive', explanation: 'documented unmet workflow need and explicit willingness-to-pay evidence', sourceRefs: refs('whitespace') }, ...overrides })

test('maps attributable peers and preserves competitive events', () => {
  const result = analyzeCompetitiveMarketMap(base({ players: [player('alpha', { events: [{ id: 'entry-1', type: 'entry', description: 'entered the segment', period: '2026-H1', sourceRefs: refs('entry') }] }), player('beta', { status: 'acquired', events: [{ id: 'deal-1', type: 'acquisition', description: 'acquired by a strategic buyer', period: '2026-H1', sourceRefs: refs('deal') }] })] }))
  assert.equal(result.status, 'complete')
  assert.deepEqual(result.peerAssessments.map((item) => item.isAttributablePeer), [true, true])
  assert.deepEqual(result.events.map((item) => item.type), ['entry', 'acquisition'])
  assert.equal(result.whitespace?.conclusion, 'supported_whitespace')
})

test('same broad industry label is not enough for peer status', () => {
  const result = analyzeCompetitiveMarketMap(base({ players: [player('alpha'), player('label-only', { peerEvidence: { samePurchaseDecision: true, sameWorkflow: false, sameEconomics: false, customerOverlap: false, sourceRefs: refs('label-only') } })] }))
  assert.equal(result.peerAssessments.find((item) => item.playerId === 'label-only')?.isAttributablePeer, false)
  assert.match(result.peerAssessments.find((item) => item.playerId === 'label-only')?.reasons.join(' ') ?? '', /workflow|economics|overlap/)
})

test('invalid status, future evidence, and missing sources fail closed', () => {
  const result = analyzeCompetitiveMarketMap(base({ players: [player('bad', { status: 'invalid' as never, sourceRefs: [], events: [{ id: 'future', type: 'pivot', description: 'future pivot', period: '2027-01-01', sourceRefs: refs('future') }] })] }))
  assert.equal(result.status, 'unavailable')
  assert.ok(result.diagnostics.some((item) => item.includes('player bad')))
  assert.ok(result.diagnostics.some((item) => item.includes('event future')))
})

test('no players plus unmet need without economic evidence is not declared a huge opportunity', () => {
  const result = analyzeCompetitiveMarketMap(base({ players: [], whitespace: { unmetNeed: 'present', economicSignal: 'unknown', explanation: 'users report an unmet need, but willingness to pay and returns are not evidenced', sourceRefs: refs('gap') } }))
  assert.equal(result.status, 'complete')
  assert.equal(result.whitespace?.conclusion, 'inconclusive')
  assert.match(result.whitespace?.explanation ?? '', /willingness|returns/)
})

test('economic unattractiveness is kept distinct from unmet need', () => {
  const result = analyzeCompetitiveMarketMap(base({ players: [], whitespace: { unmetNeed: 'present', economicSignal: 'unattractive', explanation: 'need is documented but explicit economics show inadequate returns', sourceRefs: refs('economics') } }))
  assert.equal(result.whitespace?.conclusion, 'economically_unattractive')
})
