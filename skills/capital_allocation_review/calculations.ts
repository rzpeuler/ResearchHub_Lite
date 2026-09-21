import type { CapitalAction, CapitalActionAssessment, CapitalAllocationInput, CapitalAllocationResult, CapitalMetric } from './contracts.ts'

const finite = (value: number | undefined): value is number => value !== undefined && Number.isFinite(value)
const text = (value: string | undefined): boolean => typeof value === 'string' && value.trim() !== ''
const unique = (values: readonly string[]): string[] => [...new Set(values.filter((value) => value.trim() !== ''))]
const date = (value: string | undefined): boolean => text(value) && !Number.isNaN(Date.parse(value!))

function metric(action: CapitalAction, name: CapitalMetric['metric'], value: number | undefined, unit: string, diagnostics: readonly string[], refs: readonly string[]): CapitalMetric {
  return { actionId: action.id, metric: name, ...(value !== undefined && Number.isFinite(value) ? { value } : {}), unit, sourceRefs: unique(refs), status: value !== undefined && Number.isFinite(value) && diagnostics.length === 0 ? 'available' : 'unavailable', diagnostics: unique(diagnostics) }
}

const valueEligible = (action: CapitalAction): boolean => action.actionType === 'organic_capex' || action.actionType === 'acquisition' || action.actionType === 'R&D'

function actionAssessment(action: CapitalAction, input: CapitalAllocationInput): CapitalActionAssessment {
  const diagnostics: string[] = []
  const metrics: CapitalMetric[] = []
  if (!date(action.date) || Date.parse(action.date) > Date.parse(input.asOf)) diagnostics.push('action date is outside the as-of boundary')
  if (action.sourceRefs.length === 0) diagnostics.push('capital action requires source references')
  if (!finite(action.amount) || action.amount < 0 || !text(action.unit)) diagnostics.push('capital action requires a non-negative finite amount and unit')
  const refs = unique([...action.sourceRefs, ...(input.context?.sourceRefs ?? [])])
  if (action.actionType === 'organic_capex') metrics.push(metric(action, 'capex_intensity', finite(input.context?.currentRevenue) && input.context!.currentRevenue! > 0 ? action.amount / input.context!.currentRevenue! : undefined, 'ratio', finite(input.context?.currentRevenue) && input.context!.currentRevenue! > 0 ? [] : ['current revenue is required for CapEx intensity'], refs))
  if (action.actionType === 'dividend') metrics.push(metric(action, 'dividend_payout', finite(input.context?.currentNetIncome) && input.context!.currentNetIncome! !== 0 ? action.amount / input.context!.currentNetIncome! : undefined, 'ratio', finite(input.context?.currentNetIncome) && input.context!.currentNetIncome! !== 0 ? [] : ['current net income is required for dividend payout'], refs))
  if (action.actionType === 'buyback') metrics.push(metric(action, 'buyback_yield', finite(input.context?.marketCapitalization) && input.context!.marketCapitalization! > 0 ? action.amount / input.context!.marketCapitalization! : undefined, 'ratio', finite(input.context?.marketCapitalization) && input.context!.marketCapitalization! > 0 ? [] : ['market capitalization is required for buyback yield'], refs))
  if (action.netDebtBefore !== undefined || action.netDebtAfter !== undefined) metrics.push(metric(action, 'net_debt_change', finite(action.netDebtAfter) && finite(action.netDebtBefore) ? action.netDebtAfter - action.netDebtBefore : undefined, action.unit, finite(action.netDebtAfter) && finite(action.netDebtBefore) ? [] : ['both net-debt observations are required'], refs))
  if (action.actionType === 'acquisition') metrics.push(metric(action, 'acquisition_spend', action.amount, action.unit, [], action.sourceRefs))
  if (action.sharesBefore !== undefined || action.sharesAfter !== undefined) metrics.push(metric(action, 'share_count_change', finite(action.sharesAfter) && finite(action.sharesBefore) ? action.sharesAfter - action.sharesBefore : undefined, 'shares', finite(action.sharesAfter) && finite(action.sharesBefore) ? [] : ['both share-count observations are required'], refs))
  const valueEvidence = {
    actionAmountSourceRefs: unique(action.sourceRefs),
    returnSourceRefs: unique(action.returnSourceRefs ?? []),
    hurdleSourceRefs: unique(action.hurdleSourceRefs ?? []),
    subsequentOutcomeSourceRefs: unique(action.subsequentOutcome?.sourceRefs ?? []),
  }
  const valueDiagnostics: string[] = []
  if (valueEligible(action)) {
    if (!finite(action.returnOnIncrementalCapital) || valueEvidence.returnSourceRefs.length === 0) valueDiagnostics.push('value assessment requires an attributable incremental return')
    if (!finite(action.hurdleRate) || valueEvidence.hurdleSourceRefs.length === 0) valueDiagnostics.push('value assessment requires an attributable hurdle')
    if (action.subsequentOutcome === undefined) valueDiagnostics.push('value assessment requires a subsequent operating or economic outcome')
    else if (!text(action.subsequentOutcome.metric) || !text(action.subsequentOutcome.unit) || !finite(action.subsequentOutcome.value) || action.subsequentOutcome.sourceRefs.length === 0) valueDiagnostics.push('subsequent outcome requires a finite value, unit, metric, and source references')
  }
  const valueAssessment: CapitalActionAssessment['valueAssessment'] = valueEligible(action) && diagnostics.length === 0 && valueDiagnostics.length === 0
    ? action.subsequentOutcome!.value < 0 || action.returnOnIncrementalCapital! < action.hurdleRate! ? 'value_destroyed' : 'value_supported'
    : 'inconclusive'
  return { actionId: action.id, actionType: action.actionType, valueAssessment, valueEvidence, metrics, diagnostics: unique([...diagnostics, ...valueDiagnostics]) }
}

export function assessCapitalAllocation(input: CapitalAllocationInput): CapitalAllocationResult {
  const diagnostics: string[] = []
  if (!text(input.companyRef) || !text(input.period) || !date(input.asOf)) diagnostics.push('companyRef, period, and ISO-compatible asOf are required')
  const ids = new Set<string>()
  for (const action of input.actions) {
    if (ids.has(action.id)) diagnostics.push(`duplicate capital action ${action.id}`)
    ids.add(action.id)
  }
  const actions = input.actions.map((action) => actionAssessment(action, input))
  const allDiagnostics = unique([...diagnostics, ...actions.flatMap((item) => item.diagnostics), ...actions.flatMap((item) => item.metrics.flatMap((metric) => metric.diagnostics))])
  const operationalDiagnostics = allDiagnostics.filter((item) => !item.startsWith('value assessment requires') && !item.startsWith('subsequent outcome requires'))
  const available = actions.flatMap((item) => item.metrics).filter((item) => item.status === 'available')
  const status: CapitalAllocationResult['status'] = actions.length === 0 || available.length === 0 ? 'unavailable' : operationalDiagnostics.length === 0 && actions.every((item) => item.metrics.every((metric) => metric.status === 'available' || metric.metric === 'net_debt_change' || metric.metric === 'share_count_change')) ? 'complete' : 'partial'
  return { status, companyRef: input.companyRef, period: input.period, actions, diagnostics: allDiagnostics, asOf: input.asOf }
}
