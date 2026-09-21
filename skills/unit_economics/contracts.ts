export const UNIT_TYPES = ['customer', 'subscription', 'seat', 'transaction', 'active_buyer', 'store', 'sqm', 'shipment', 'industrial_unit', 'room_night', 'seat_mile', 'trip', 'AUM', 'project', 'unknown'] as const
export type UnitType = (typeof UNIT_TYPES)[number]
export type UnitMetric = 'revenue' | 'gross_profit' | 'variable_cost' | 'operating_profit' | 'GMV' | 'transactions' | 'AUM' | 'other'
export type UnitValueAvailability = 'reported' | 'derived' | 'unavailable'

export interface UnitMetricObservation {
  readonly metric: UnitMetric
  readonly unit: string
  readonly currentValue?: number
  readonly priorValue?: number
  readonly currentPeriod: string
  readonly priorPeriod?: string
  readonly sourceRefs: readonly string[]
  readonly availability: UnitValueAvailability
}

export interface UnitDefinitionInput {
  readonly id: string
  readonly name: string
  readonly unitType: UnitType
  readonly scope: string
  readonly countUnit: string
  readonly currentCount?: number
  readonly priorCount?: number
  readonly currentCountSourceRefs: readonly string[]
  readonly priorCountSourceRefs: readonly string[]
  readonly metrics: readonly UnitMetricObservation[]
}

export interface UnitGrowthComponentInput {
  readonly kind: 'volume' | 'price' | 'mix' | 'other'
  readonly currentValue?: number
  readonly priorValue?: number
  readonly unit: string
  readonly sourceRefs: readonly string[]
  readonly availability: UnitValueAvailability
}

export interface UnitGrowthDecompositionInput {
  readonly unitId: string
  readonly revenueUnit: string
  readonly currentRevenue: number
  readonly priorRevenue: number
  readonly currentSourceRefs: readonly string[]
  readonly priorSourceRefs: readonly string[]
  readonly components: readonly UnitGrowthComponentInput[]
}

export interface OperatingLeverageInput {
  readonly currentRevenue: number
  readonly priorRevenue: number
  readonly currentGrossProfit?: number
  readonly priorGrossProfit?: number
  readonly currentOperatingProfit?: number
  readonly priorOperatingProfit?: number
  readonly unit: string
  readonly currentSourceRefs: readonly string[]
  readonly priorSourceRefs: readonly string[]
}

export interface UnitEconomicsInput {
  readonly companyRef: string
  readonly archetype?: string
  readonly currentPeriod: string
  readonly priorPeriod?: string
  readonly units: readonly UnitDefinitionInput[]
  readonly growthDecompositions?: readonly UnitGrowthDecompositionInput[]
  readonly operatingLeverage?: OperatingLeverageInput
  readonly asOf: string
}

export interface PerUnitMetricResult {
  readonly metric: UnitMetric
  readonly numeratorUnit: string
  readonly denominatorUnit: string
  readonly currentPerUnit?: number
  readonly priorPerUnit?: number
  readonly deltaPerUnit?: number
  readonly sourceRefs: readonly string[]
  readonly status: 'available' | 'unavailable'
  readonly diagnostics: readonly string[]
}

export interface UnitGrowthComponentResult {
  readonly kind: UnitGrowthComponentInput['kind']
  readonly amount?: number
  readonly unit: string
  readonly sourceRefs: readonly string[]
  readonly status: 'available' | 'unavailable'
  readonly diagnostics: readonly string[]
}

export interface UnitGrowthResult {
  readonly unitId: string
  readonly currentRevenue: number
  readonly priorRevenue: number
  readonly delta: number
  readonly components: readonly UnitGrowthComponentResult[]
  readonly residual?: number
  readonly status: 'complete' | 'partial' | 'unavailable'
  readonly diagnostics: readonly string[]
}

export interface OperatingLeverageResult {
  readonly deltaRevenue: number
  readonly deltaGrossProfit?: number
  readonly deltaOperatingProfit?: number
  readonly incrementalGrossMargin?: number
  readonly incrementalOperatingMargin?: number
  readonly status: 'complete' | 'partial' | 'unavailable'
  readonly diagnostics: readonly string[]
}

export interface UnitEconomicsUnitResult {
  readonly id: string
  readonly name: string
  readonly unitType: UnitType
  readonly scope: string
  readonly denominatorUnit: string
  readonly metrics: readonly PerUnitMetricResult[]
  readonly status: 'complete' | 'partial' | 'unavailable'
  readonly diagnostics: readonly string[]
}

export interface UnitEconomicsResult {
  readonly status: 'complete' | 'partial' | 'unavailable'
  readonly companyRef: string
  readonly archetype: string
  readonly currentPeriod: string
  readonly priorPeriod?: string
  readonly units: readonly UnitEconomicsUnitResult[]
  readonly growthDecompositions: readonly UnitGrowthResult[]
  readonly operatingLeverage?: OperatingLeverageResult
  readonly diagnostics: readonly string[]
  readonly asOf: string
}
