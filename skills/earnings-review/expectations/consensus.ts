import { selectLatestEstimatesPerInstitution } from './matching.ts'
import type { ConsensusCalculationInput, ConsensusCalculationResult, ConsensusSnapshot } from './contracts.ts'

function finite(value: number): boolean { return Number.isFinite(value) }

/** Build a reproducible point-in-time consensus from one latest estimate per institution. */
export function buildConsensusSnapshot(input: ConsensusCalculationInput): ConsensusCalculationResult {
  const selection = selectLatestEstimatesPerInstitution(input)
  const diagnostics = [...selection.diagnostics]
  if (!Number.isInteger(input.minimumCount) || input.minimumCount < 2) diagnostics.push('minimumCount_must_be_at_least_2')
  if (selection.selected.length < input.minimumCount) diagnostics.push('consensus_minimum_count_not_met')
  const units = new Set(selection.selected.map((estimate) => estimate.unit))
  if (units.size > 1) diagnostics.push('consensus_units_must_match')
  if (diagnostics.length > 0) return { selectedEstimates: selection.selected, diagnostics: [...new Set(diagnostics)] }
  const values = selection.selected.map((estimate) => estimate.value).sort((left, right) => left - right)
  const sum = values.reduce((total, value) => total + value, 0)
  const mean = sum / values.length
  const middle = Math.floor(values.length / 2)
  const median = values.length % 2 === 1 ? values[middle]! : (values[middle - 1]! + values[middle]!) / 2
  const low = values[0]!
  const high = values[values.length - 1]!
  const variance = values.reduce((total, value) => total + (value - mean) ** 2, 0) / values.length
  const dispersion = Math.sqrt(variance)
  if (![mean, median, low, high, dispersion].every(finite)) return { selectedEstimates: selection.selected, diagnostics: ['consensus_result_must_be_finite'] }
  const snapshot: ConsensusSnapshot = { metric: input.metric, fiscalPeriod: input.fiscalPeriod, asOf: input.asOf, mean, median, high, low, count: selection.selected.length, dispersion, contributingEstimateIds: selection.selected.map((estimate) => estimate.estimateId) }
  return { snapshot, selectedEstimates: selection.selected, diagnostics: [] }
}

export const calculateConsensus = buildConsensusSnapshot
