import type { AutomaticEquityCompsResult, CompsValuationResult } from '../../skills/comps_valuation/contracts.ts'
import type { ValuationAssumptionPlan, ValuationBasis, ValuationComputation, ValuationMethod } from '../../skills/valuation/contracts.ts'
import type { ValuationBasisCompatibility, ValuationCrosscheck, ValuationCrosscheckConflict, ValuationMethodResult } from './contracts.ts'

const scenarioMethod = 'scenario_base' as const
const compsMethod = 'comps_valuation' as const

function finite(value: number | undefined): value is number {
  return value !== undefined && Number.isFinite(value)
}

function scenarioResult(basis: ValuationBasis, plan: ValuationAssumptionPlan | undefined, computation: ValuationComputation | undefined): ValuationMethodResult | undefined {
  const scenario = computation?.scenarios.find((item) => item.scenarioId === 'base')
  if (!scenario || !finite(scenario.targetPrice) || !plan) return undefined
  return {
    method: scenarioMethod,
    sourceMethod: scenario.primaryMethod,
    value: scenario.targetPrice,
    unit: 'CNY/share',
    valuationDate: basis.valuationDate,
    period: `FY${scenario.targetFiscalYear}`,
    currency: 'CNY',
    basis: 'equity_per_share',
    scenario: 'base',
    sourceRefs: plan.scenarios.find((item) => item.scenarioId === 'base')?.sourceCandidateIds ?? [],
    diagnostics: [],
  }
}

function unavailableScenario(): ValuationMethodResult {
  return { method: scenarioMethod, unit: 'CNY/share', valuationDate: '', period: '', currency: 'CNY', basis: 'equity_per_share', sourceRefs: [], diagnostics: ['SCENARIO_BASE_UNAVAILABLE'] }
}

function compsResult(result: CompsValuationResult | undefined): ValuationMethodResult | undefined {
  if (!result || result.availability !== 'available' || !finite(result.impliedValuation?.valuePerShare)) return undefined
  return {
    method: compsMethod,
    value: result.impliedValuation.valuePerShare,
    unit: 'CNY/share',
    valuationDate: result.asOf,
    period: result.valuationBasis.label,
    currency: result.subject.currency,
    basis: 'equity_per_share',
    sourceRefs: result.acceptedPeers.flatMap((peer) => peer.sourceRefs),
    diagnostics: [],
  }
}

function automaticCompsResult(result: AutomaticEquityCompsResult | undefined, primaryMethod: ValuationMethod | undefined): ValuationMethodResult | undefined {
  if (!result || result.availability !== 'available' || !finite(result.impliedTargetPrice) || (primaryMethod !== undefined && result.selectedMethod !== primaryMethod)) return undefined
  return { method: compsMethod, sourceMethod: result.selectedMethod, value: result.impliedTargetPrice, unit: 'CNY/share', valuationDate: result.valuationDate, period: `FY${result.targetFiscalYear}`, currency: 'CNY', basis: 'equity_per_share', sourceRefs: result.sourceRefs, diagnostics: [`multipleBasisPeriod=FY${result.multipleBasisFiscalYear}`, ...result.diagnostics] }
}

function unavailableComps(result: CompsValuationResult | undefined): ValuationMethodResult {
  return {
    method: compsMethod,
    unit: 'CNY/share',
    valuationDate: result?.asOf ?? '',
    period: result?.valuationBasis.label ?? '',
    currency: result?.subject.currency ?? 'CNY',
    basis: 'equity_per_share',
    sourceRefs: [],
    diagnostics: [result === undefined ? 'COMPS_INPUT_UNAVAILABLE' : `COMPS_RESULT_${result.availability.toUpperCase()}`],
  }
}

function unavailableAutomaticComps(result: AutomaticEquityCompsResult | undefined): ValuationMethodResult {
  return { method: compsMethod, unit: 'CNY/share', valuationDate: '', period: result === undefined ? '' : `FY${result.targetFiscalYear}`, currency: 'CNY', basis: 'equity_per_share', sourceRefs: [], diagnostics: [result === undefined ? 'COMPS_INPUT_UNAVAILABLE' : `AUTO_COMPS_${result.availability.toUpperCase()}`, ...(result?.diagnostics ?? [])] }
}

function compatible(left: ValuationMethodResult, right: ValuationMethodResult): ValuationBasisCompatibility {
  const dimensions = {
    valuationDate: left.valuationDate === right.valuationDate,
    period: left.period === right.period,
    unit: left.unit === right.unit,
    currency: left.currency === right.currency,
    basis: left.basis === right.basis,
  }
  const diagnostics: string[] = []
  if (!dimensions.valuationDate) diagnostics.push('VALUATION_DATE_MISMATCH')
  if (!dimensions.period) diagnostics.push('PERIOD_MISMATCH')
  if (!dimensions.unit) diagnostics.push('UNIT_MISMATCH')
  if (!dimensions.currency) diagnostics.push('CURRENCY_MISMATCH')
  if (!dimensions.basis) diagnostics.push('EQUITY_ENTERPRISE_BASIS_MISMATCH')
  return {
    comparisonRef: `${left.method}_vs_${right.method}`,
    leftMethod: left.method,
    rightMethod: right.method,
    compatible: diagnostics.length === 0,
    left: { valuationDate: left.valuationDate, period: left.period, unit: left.unit, currency: left.currency, basis: left.basis },
    right: { valuationDate: right.valuationDate, period: right.period, unit: right.unit, currency: right.currency, basis: right.basis },
    diagnostics,
  }
}

function conflicts(left: ValuationMethodResult, right: ValuationMethodResult, basis: ValuationBasisCompatibility): ValuationCrosscheckConflict[] {
  if (!basis.compatible) return [{ code: 'BASIS_INCOMPATIBLE', methods: [left.method, right.method], message: `Valuation methods ${left.method} and ${right.method} cannot be compared on the supplied basis`, diagnostics: basis.diagnostics }]
  if (!finite(left.value) || !finite(right.value) || left.value === right.value) return []
  const absoluteSpread = Math.abs(left.value - right.value)
  const relativeSpread = Math.abs(right.value) > 0 ? absoluteSpread / Math.abs(right.value) : undefined
  return [{ code: 'VALUATION_METHOD_DISAGREEMENT', methods: [left.method, right.method], message: `Valuation methods ${left.method} and ${right.method} produce different values; no averaging was applied`, absoluteSpread, relativeSpread, diagnostics: [] }]
}

export function buildValuationCrosscheck(input: { readonly eligibleMethods: readonly ValuationMethod[]; readonly plan?: ValuationAssumptionPlan; readonly basis?: ValuationBasis; readonly computation?: ValuationComputation; readonly compsResult?: CompsValuationResult; readonly automaticCompsResult?: AutomaticEquityCompsResult }): ValuationCrosscheck {
  const observations: ValuationMethodResult[] = []
  const scenario = input.basis && input.plan && input.computation ? scenarioResult(input.basis, input.plan, input.computation) : undefined
  if (scenario) observations.push(scenario)
  const comps = input.compsResult !== undefined ? compsResult(input.compsResult) : automaticCompsResult(input.automaticCompsResult, input.plan?.primaryMethod)
  if (comps) observations.push(comps)
  const methodResults = [scenario ?? unavailableScenario(), ...(comps ? [comps] : [input.compsResult !== undefined ? unavailableComps(input.compsResult) : unavailableAutomaticComps(input.automaticCompsResult)])]
  const basisCompatibility: ValuationBasisCompatibility[] = []
  const disagreement: ValuationCrosscheckConflict[] = []
  for (let index = 0; index < observations.length; index += 1) {
    for (let next = index + 1; next < observations.length; next += 1) {
      const pair = compatible(observations[index]!, observations[next]!)
      basisCompatibility.push(pair)
      disagreement.push(...conflicts(observations[index]!, observations[next]!, pair))
    }
  }
  const availableMethods = methodResults.filter((item) => item.value !== undefined).map((item) => item.method)
  const unavailableMethods = methodResults.filter((item) => item.value === undefined).map((item) => item.method)
  return {
    availableMethods,
    unavailableMethods,
    methodResults,
    basisCompatibility,
    ...(input.plan?.primaryMethod === undefined ? {} : { selectedPrimary: input.plan.primaryMethod }),
    conflicts: disagreement,
    automaticAveraging: false,
  }
}
