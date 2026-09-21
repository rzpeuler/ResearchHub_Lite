export const BUSINESS_ARCHETYPES = ['manufacturing', 'software_saas', 'platform_marketplace', 'consumer', 'retail', 'financial', 'resource_commodity', 'project_based', 'hybrid', 'unknown'] as const
export type BusinessArchetype = (typeof BUSINESS_ARCHETYPES)[number]

export const DRIVER_TYPES = ['volume', 'price', 'mix', 'customers', 'ARPU', 'transactions', 'GMV', 'take_rate', 'capacity', 'utilization', 'yield', 'store_count', 'same_store_sales', 'AUM', 'penetration', 'retention', 'churn', 'other', 'unknown'] as const
export type DriverType = (typeof DRIVER_TYPES)[number]
export type DriverMetric = 'revenue' | 'gross_profit' | 'operating_profit' | 'cash_flow'
export type DriverRelationshipType = 'multiplicative' | 'additive' | 'ratio' | 'qualitative_dependency' | 'unknown'
export type DriverAvailability = 'reported' | 'derived' | 'unavailable'
export type DriverConfidence = 'high' | 'medium' | 'low' | 'unknown'

export interface DriverObservation {
  readonly id: string
  readonly name: string
  readonly driverType: DriverType
  readonly segment: string
  readonly metric: DriverMetric
  readonly relationshipType: DriverRelationshipType
  readonly parentId?: string
  readonly unit: string
  readonly period: string
  readonly priorPeriod?: string
  readonly currentValue?: number
  readonly priorValue?: number
  readonly sourceRefs: readonly string[]
  readonly availability: DriverAvailability
  readonly confidence: DriverConfidence
  readonly qualitativeExplanation?: string
}

export interface OutcomeSeries {
  readonly metric: DriverMetric
  readonly unit: string
  readonly currentValue?: number
  readonly priorValue?: number
  readonly currentSourceRefs: readonly string[]
  readonly priorSourceRefs: readonly string[]
}

export interface DriverSegmentInput {
  readonly id: string
  readonly name: string
  readonly outcomes: readonly OutcomeSeries[]
  readonly drivers: readonly DriverObservation[]
}

export interface BusinessDriverAnalysisInput {
  readonly companyRef: string
  readonly archetype?: BusinessArchetype
  readonly currentPeriod: string
  readonly priorPeriod: string
  readonly segments: readonly DriverSegmentInput[]
  readonly asOf: string
}

export interface DriverContribution {
  readonly driverId: string
  readonly driverName: string
  readonly segment: string
  readonly metric: DriverMetric
  readonly amount: number
  readonly unit: string
  readonly method: 'explicit_additive' | 'multiplicative_pair'
  readonly sourceRefs: readonly string[]
}

export interface DriverMetricResult {
  readonly metric: DriverMetric
  readonly unit?: string
  readonly currentValue?: number
  readonly priorValue?: number
  readonly delta?: number
  readonly contributions: readonly DriverContribution[]
  readonly residual?: number
  readonly unavailableDrivers: readonly string[]
  readonly diagnostics: readonly string[]
  readonly status: 'complete' | 'partial' | 'unavailable'
}

export interface DriverSegmentResult {
  readonly id: string
  readonly name: string
  readonly metrics: readonly DriverMetricResult[]
  readonly sourceRefs: readonly string[]
}

export interface BusinessDriverAnalysisResult {
  readonly status: 'complete' | 'partial' | 'unavailable'
  readonly companyRef: string
  readonly archetype: BusinessArchetype
  readonly currentPeriod: string
  readonly priorPeriod: string
  readonly segments: readonly DriverSegmentResult[]
  readonly metrics: readonly DriverMetricResult[]
  readonly unresolvedDrivers: readonly string[]
  readonly diagnostics: readonly string[]
  readonly asOf: string
}
