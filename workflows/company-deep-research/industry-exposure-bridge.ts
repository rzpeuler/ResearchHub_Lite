export type CompanyIndustryExposureType = 'revenue' | 'capacity' | 'customer' | 'product' | 'technology' | 'geographic' | 'input_cost'

export interface IndustryDriverObservation {
  readonly id: string
  readonly name: string
  readonly delta?: number
  readonly unit: string
  readonly period: string
  readonly sourceRefs: readonly string[]
}

export interface CompanyExposureObservation {
  readonly type: CompanyIndustryExposureType
  readonly description: string
  readonly value?: number
  readonly unit: string
  readonly sourceRefs: readonly string[]
}

export interface ExposureSensitivity {
  /** Output units per one exposure-unit multiplied by one driver-unit. */
  readonly value?: number
  readonly outputUnit: string
  readonly sourceRefs: readonly string[]
}

export interface IndustryExposureBridgeItem {
  readonly id: string
  readonly driver: IndustryDriverObservation
  readonly exposure: CompanyExposureObservation
  readonly sensitivity?: ExposureSensitivity
  readonly qualitativeDependency: string
}

export interface CompanyIndustryExposureInput {
  readonly companyRef: string
  readonly industryRef: string
  readonly asOf: string
  readonly items: readonly IndustryExposureBridgeItem[]
}

export interface IndustryExposureFinancialImpact {
  readonly value: number
  readonly unit: string
  readonly formula: string
  readonly sourceRefs: readonly string[]
}

export interface IndustryExposureBridgeResult {
  readonly status: 'complete' | 'partial' | 'unavailable'
  readonly companyRef: string
  readonly industryRef: string
  readonly items: readonly (IndustryExposureBridgeItem & { readonly financialImpact?: IndustryExposureFinancialImpact })[]
  readonly qualitativeDependencies: readonly string[]
  readonly diagnostics: readonly string[]
  readonly asOf: string
}

const finite = (value: number | undefined): value is number => value !== undefined && Number.isFinite(value)
const text = (value: string | undefined): boolean => typeof value === 'string' && value.trim() !== ''
const date = (value: string | undefined): boolean => text(value) && !Number.isNaN(Date.parse(value!))
const periodValid = (value: string, asOf: string): boolean => text(value) && (!date(value) || Date.parse(value) <= Date.parse(asOf))
const unique = (values: readonly string[]): string[] => [...new Set(values.filter((value) => text(value)))]

function itemDiagnostics(item: IndustryExposureBridgeItem, asOf: string): string[] {
  const diagnostics: string[] = []
  if (!text(item.id) || !text(item.driver.id) || !text(item.driver.name) || !text(item.driver.unit) || !periodValid(item.driver.period, asOf) || item.driver.sourceRefs.length === 0) diagnostics.push(`bridge ${item.id} lacks a valid sourced industry driver`)
  if (!text(item.exposure.description) || !text(item.exposure.unit) || item.exposure.sourceRefs.length === 0 || (item.exposure.value !== undefined && !finite(item.exposure.value))) diagnostics.push(`bridge ${item.id} lacks a valid sourced company exposure`)
  if (item.sensitivity !== undefined && (!text(item.sensitivity.outputUnit) || item.sensitivity.sourceRefs.length === 0 || (item.sensitivity.value !== undefined && !finite(item.sensitivity.value)))) diagnostics.push(`bridge ${item.id} has invalid sensitivity evidence`)
  if (!text(item.qualitativeDependency)) diagnostics.push(`bridge ${item.id} requires a qualitative dependency explanation`)
  return diagnostics
}

export function calculateCompanyIndustryExposureBridge(input: CompanyIndustryExposureInput): IndustryExposureBridgeResult {
  const diagnostics: string[] = []
  if (!text(input.companyRef) || !text(input.industryRef) || !date(input.asOf)) diagnostics.push('companyRef, industryRef, and ISO-compatible asOf are required')
  for (const item of input.items) diagnostics.push(...itemDiagnostics(item, input.asOf))
  const validItems = input.items.filter((item) => itemDiagnostics(item, input.asOf).length === 0)
  const items = validItems.map((item) => {
    const refs = unique([...item.driver.sourceRefs, ...item.exposure.sourceRefs, ...(item.sensitivity?.sourceRefs ?? [])])
    const canCalculate = finite(item.driver.delta) && finite(item.exposure.value) && item.sensitivity !== undefined && finite(item.sensitivity.value)
    if (!canCalculate) return item
    const value = item.exposure.value! * item.driver.delta! * item.sensitivity!.value!
    return { ...item, financialImpact: { value, unit: item.sensitivity!.outputUnit, formula: `${item.exposure.value} ${item.exposure.unit} × ${item.driver.delta} ${item.driver.unit} × ${item.sensitivity.value} = ${value} ${item.sensitivity.outputUnit}`, sourceRefs: refs } }
  })
  const qualitativeDependencies = unique(validItems.filter((item) => !items.find((result) => result.id === item.id && 'financialImpact' in result)).map((item) => `${item.id}: ${item.qualitativeDependency}`))
  const status: IndustryExposureBridgeResult['status'] = validItems.length === 0 ? 'unavailable' : diagnostics.length === 0 && validItems.length === input.items.length ? 'complete' : 'partial'
  return { status, companyRef: input.companyRef, industryRef: input.industryRef, items, qualitativeDependencies, diagnostics: unique(diagnostics), asOf: input.asOf }
}

export function renderCompanyIndustryExposureBridge(result: IndustryExposureBridgeResult): string {
  if (result.status === 'unavailable') return 'Industry exposure bridge: unavailable because no valid driver-to-company exposure evidence was supplied.'
  const lines = result.items.map((item) => {
    const impact = item.financialImpact === undefined ? `Qualitative dependency: ${item.qualitativeDependency}` : `Financial implication: ${item.financialImpact.formula}`
    return `- ${item.driver.name} → ${item.exposure.description}. ${impact}`
  })
  return ['Industry exposure bridge', ...lines, ...(result.diagnostics.length === 0 ? [] : [`Diagnostics: ${result.diagnostics.join('; ')}`])].join('\n')
}
