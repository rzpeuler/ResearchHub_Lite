export interface UnitDefinition {
  readonly source: string
  readonly canonical: string
  readonly factor: number
}

const UNITS: readonly UnitDefinition[] = [
  { source: '元', canonical: 'CNY', factor: 1 },
  { source: '万元', canonical: 'CNY', factor: 10_000 },
  { source: '亿元', canonical: 'CNY', factor: 100_000_000 },
  { source: '股', canonical: 'share_count', factor: 1 },
  { source: '万股', canonical: 'share_count', factor: 10_000 },
  { source: '亿股', canonical: 'share_count', factor: 100_000_000 },
  { source: '台', canonical: 'unit_count', factor: 1 },
  { source: '万台', canonical: 'unit_count', factor: 10_000 },
  { source: '辆', canonical: 'vehicle_count', factor: 1 },
  { source: '万辆', canonical: 'vehicle_count', factor: 10_000 },
  { source: '吨', canonical: 'ton', factor: 1 },
  { source: '万吨', canonical: 'ton', factor: 10_000 },
  { source: '%', canonical: '%', factor: 1 },
  { source: '百分点', canonical: 'percentage_points', factor: 1 },
  { source: 'bps', canonical: 'bps', factor: 1 },
  { source: '基点', canonical: 'bps', factor: 1 },
]

export interface ResolvedUnit {
  readonly source: string
  readonly canonical: string
  readonly factor: number
}

export function resolveUnit(rawUnit: string | undefined, evidenceText: string): ResolvedUnit | undefined {
  const explicit = rawUnit === undefined ? undefined : findUnit(rawUnit)
  if (explicit !== undefined) return explicit
  if (rawUnit !== undefined && rawUnit.trim() !== '') return undefined
  const matches = UNITS.filter((unit) => evidenceText.includes(unit.source)).sort((left, right) => right.source.length - left.source.length)
  const longest = matches[0]
  if (longest === undefined) return undefined
  const sameLength = matches.filter((unit) => unit.source.length === longest.source.length)
  return sameLength.length === 1 ? longest : undefined
}

export function findUnit(rawUnit: string): ResolvedUnit | undefined {
  const normalized = rawUnit.normalize('NFKC').trim().toLowerCase()
  const match = UNITS.find((unit) => unit.source.toLowerCase() === normalized)
  return match === undefined ? undefined : { ...match }
}

export function unitRegistry(): readonly UnitDefinition[] { return UNITS.map((unit) => ({ ...unit })) }
