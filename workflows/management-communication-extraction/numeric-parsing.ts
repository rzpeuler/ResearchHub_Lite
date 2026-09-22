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
  const matches = [...normalized.matchAll(/[+-]?\d+(?:\.\d+)?/g)]
  if (matches.length !== 2) return undefined
  const left = Number(matches[0]![0]); const right = Number(matches[1]![0])
  if (!Number.isFinite(left) || !Number.isFinite(right)) return undefined
  return [{ value: left, rawToken: matches[0]![0] }, { value: right, rawToken: matches[1]![0] }]
}

export function numericTokenInText(raw: string | undefined, text: string): boolean {
  if (typeof raw !== 'string' || raw.trim() === '') return false
  const normalizedRaw = raw.normalize('NFKC').replaceAll(',', '').replaceAll('，', '').trim()
  const normalizedText = text.normalize('NFKC').replaceAll(',', '').replaceAll('，', '')
  if (normalizedText.includes(normalizedRaw)) return true
  const numbers = [...normalizedRaw.matchAll(/[+-]?\d+(?:\.\d+)?/g)].map((match) => match[0])
  return numbers.length > 0 && numbers.every((number) => normalizedText.includes(number))
}
