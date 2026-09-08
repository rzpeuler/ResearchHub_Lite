export interface StructuredOutputDiagnostic {
  readonly code: 'json_string_normalized' | 'fenced_json_normalized' | 'wrapper_unwrapped' | 'invalid_json' | 'unsupported_shape'
}

export interface NormalizedStructuredOutput {
  readonly value: unknown
  readonly diagnostics: readonly StructuredOutputDiagnostic[]
}

/**
 * Normalize transport shapes only. This function never invents fields or
 * changes semantic values; operation validators remain the authority.
 */
export function normalizeReasoningStructuredOutput(input: unknown): NormalizedStructuredOutput {
  const diagnostics: StructuredOutputDiagnostic[] = []
  let value = input
  let depth = 0

  while (depth++ < 3) {
    if (typeof value === 'string') {
      const trimmed = value.trim()
      const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed)
      const json = (fenced?.[1] ?? trimmed).trim()
      try {
        value = JSON.parse(json)
        diagnostics.push({ code: fenced ? 'fenced_json_normalized' : 'json_string_normalized' })
        continue
      } catch {
        diagnostics.push({ code: 'invalid_json' })
        return { value: undefined, diagnostics }
      }
    }
    if (!value || typeof value !== 'object' || Array.isArray(value)) return { value, diagnostics }
    const record = value as Record<string, unknown>
    const wrapper = ['output', 'structuredOutput', 'data', 'result', 'response'].find((key) => key in record && Object.keys(record).length <= 2)
    if (wrapper === undefined) return { value, diagnostics }
    value = record[wrapper]
    diagnostics.push({ code: 'wrapper_unwrapped' })
  }

  diagnostics.push({ code: 'unsupported_shape' })
  return { value: undefined, diagnostics }
}
