export interface ParsedNumeric {
  readonly value: number
  readonly rawToken: string
}

const NUMBER_PATTERN = /[+-]?\d+(?:\.\d+)?/

export function parseNumericToken(raw: string | undefined): ParsedNumeric | undefined {
  if (typeof raw !== 'string' || raw.trim() === '') return undefined
  const normalized = raw.normalize('NFKC').replaceAll(',', '').replaceAll('，', '').trim()
  const match = NUMBER_PATTERN.exec(normalized)
  if (match === null) return undefined
  const value = Number(match[0])
  return Number.isFinite(value) ? { value, rawToken: match[0] } : undefined
}

export function parseNumericRange(raw: string | undefined): readonly [ParsedNumeric, ParsedNumeric] | undefined {
  if (typeof raw !== 'string' || raw.trim() === '') return undefined
  const normalized = raw.normalize('NFKC').replaceAll(',', '').replaceAll('，', '')
  const matches = [...normalized.matchAll(/\d+(?:\.\d+)?/g)]
  if (matches.length !== 2) return undefined
  const left = Number(matches[0]![0]); const right = Number(matches[1]![0])
  if (!Number.isFinite(left) || !Number.isFinite(right)) return undefined
  return [{ value: left, rawToken: matches[0]![0] }, { value: right, rawToken: matches[1]![0] }]
}

/**
 * Proves that two numeric endpoints participate in one bounded range
 * expression in the cited text. Endpoint presence alone is insufficient.
 * Supported connectors are -, en/em dash, ~, full-width ~, 至, and 到;
 * short unit/percent text may occur immediately before or after the
 * connector (for example 10亿元至12亿元 and 10%-20%).
 */
export function numericRangeExpressionInText(rawLow: string | undefined, rawHigh: string | undefined, text: string): boolean {
  const low = parseNumericToken(rawLow)
  const high = parseNumericToken(rawHigh)
  if (low === undefined || high === undefined) return false
  const normalized = normalizeNumericText(text)
  const tokens = [...normalized.matchAll(/\d+(?:\.\d+)?/g)].map((match) => ({
    value: Number(match[0]),
    start: match.index ?? 0,
    end: (match.index ?? 0) + match[0].length,
  }))
  for (let index = 0; index + 1 < tokens.length; index += 1) {
    const left = tokens[index]!
    const right = tokens[index + 1]!
    if (left.value !== low.value || right.value !== high.value) continue
    const between = normalized.slice(left.end, right.start)
    if (/^[^\d,.;，。！？!?]{0,24}(?:-|–|—|~|～|至|到)[^\d,.;，。！？!?]{0,24}$/u.test(between)) return true
  }
  return false
}

export function numericTokenInText(raw: string | undefined, text: string): boolean {
  if (typeof raw !== 'string' || raw.trim() === '') return false
  const normalizedRaw = raw.normalize('NFKC').replaceAll(',', '').replaceAll('，', '').trim()
  const normalizedText = text.normalize('NFKC').replaceAll(',', '').replaceAll('，', '')
  if (normalizedText.includes(normalizedRaw)) return true
  const numbers = [...normalizedRaw.matchAll(/[+-]?\d+(?:\.\d+)?/g)].map((match) => match[0])
  return numbers.length > 0 && numbers.every((number) => normalizedText.includes(number))
}

function normalizeNumericText(value: string): string {
  return value.normalize('NFKC').replaceAll(',', '').replaceAll('，', '')
}
