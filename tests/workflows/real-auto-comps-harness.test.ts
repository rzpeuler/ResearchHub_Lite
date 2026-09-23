import assert from 'node:assert/strict'
import test from 'node:test'
import { classifyOverallRealAcceptance, classifyTargetMarketStage } from '../../scripts/acceptance-auto-comps-d3-real.ts'

test('real automatic comps harness classifies known target market transport failure precisely', () => {
  assert.equal(classifyTargetMarketStage({ blockedReason: 'VALUATION_MARKET_PRICE_UNAVAILABLE', providerOutcome: { transportSucceeded: false, marketRowCount: 0, marketPriceFound: false } }), 'REAL_TARGET_MARKET_TRANSPORT_UNAVAILABLE')
  assert.equal(classifyTargetMarketStage({ blockedReason: 'VALUATION_MARKET_PRICE_UNAVAILABLE', providerOutcome: { transportSucceeded: true, marketRowCount: 0, marketPriceFound: false } }), undefined)
  assert.equal(classifyTargetMarketStage({ blockedReason: 'OTHER', providerOutcome: { transportSucceeded: false, marketRowCount: 0, marketPriceFound: false } }), undefined)
})

test('real automatic comps harness preserves success, target transport, peer transport, and mixed classifications', () => {
  assert.equal(classifyOverallRealAcceptance({ target: { status: 'REAL_TARGET_MARKET_TRANSPORT_UNAVAILABLE' } }, []), 'REAL_TARGET_MARKET_TRANSPORT_UNAVAILABLE')
  assert.equal(classifyOverallRealAcceptance({ peer: { status: 'REAL_PEER_MARKET_TRANSPORT_UNAVAILABLE' } }, []), 'REAL_PEER_MARKET_TRANSPORT_UNAVAILABLE')
  assert.equal(classifyOverallRealAcceptance({ target: { status: 'completed' }, peer: { status: 'completed' } }, ['600519', '300750']), 'D3_AUTO_COMPS_REAL_PRODUCT_PATH_VERIFIED')
  assert.equal(classifyOverallRealAcceptance({ target: { status: 'completed' }, peer: { status: 'completed' } }, ['600519']), 'REAL_AUTO_COMPS_ACCEPTANCE_INCONCLUSIVE')
})
