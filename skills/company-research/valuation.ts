export interface RelativeValuationInput { readonly metric: number; readonly peerMultiples: readonly number[]; readonly selectedMultiple?: number }
export interface RelativeValuationResult { readonly multiple: number; readonly impliedValue: number; readonly peerCount: number }
export function relativeValuation(input: RelativeValuationInput): RelativeValuationResult {
  if (!Number.isFinite(input.metric) || input.metric < 0) throw new TypeError('metric must be a finite non-negative number')
  const peers = input.peerMultiples.filter((value) => Number.isFinite(value) && value > 0).sort((a, b) => a - b)
  if (peers.length === 0) throw new TypeError('peerMultiples must contain a positive finite multiple')
  const multiple = input.selectedMultiple ?? peers[Math.floor(peers.length / 2)]!
  if (!Number.isFinite(multiple) || multiple <= 0) throw new TypeError('selectedMultiple must be positive')
  return { multiple, impliedValue: metricValue(input.metric, multiple), peerCount: peers.length }
}

export interface ScenarioValuationCase { readonly name: string; readonly earnings: number; readonly multiple: number; readonly probability?: number }
export interface ScenarioValuationResult { readonly cases: readonly (ScenarioValuationCase & { readonly value: number; readonly probability: number })[]; readonly expectedValue: number }
export function scenarioValuation(cases: readonly ScenarioValuationCase[]): ScenarioValuationResult {
  if (cases.length === 0) throw new TypeError('At least one scenario is required')
  const normalized = cases.map((item) => { if (!item.name.trim() || !Number.isFinite(item.earnings) || !Number.isFinite(item.multiple) || item.multiple <= 0) throw new TypeError('Scenario inputs are invalid'); const probability = item.probability ?? 1 / cases.length; if (!Number.isFinite(probability) || probability < 0 || probability > 1) throw new TypeError('Scenario probability must be between 0 and 1'); return { ...item, value: metricValue(item.earnings, item.multiple), probability } })
  const total = normalized.reduce((sum, item) => sum + item.probability, 0); if (Math.abs(total - 1) > 1e-9) throw new TypeError('Scenario probabilities must sum to 1')
  return { cases: normalized, expectedValue: normalized.reduce((sum, item) => sum + item.value * item.probability, 0) }
}
function metricValue(metric: number, multiple: number): number { const value = metric * multiple; if (!Number.isFinite(value)) throw new TypeError('valuation result is not finite'); return value }
