import { ReasoningExecutorError } from './errors.ts'
import type { ReasoningCapabilities } from './contracts.ts'

export function validateReasoningCapabilities(value: ReasoningCapabilities): ReasoningCapabilities {
  if (!value || typeof value !== 'object') invalid('capabilities must be an object')
  const candidate = value as unknown as Record<string, unknown>
  for (const key of ['maxContextTokens', 'maxOutputTokens', 'maxConcurrency']) {
    const item = candidate[key]
    if (typeof item !== 'number' || !Number.isSafeInteger(item) || item <= 0) invalid(`${key} must be a positive safe integer`)
  }
  if (typeof candidate.structuredOutputSupport !== 'boolean') invalid('structuredOutputSupport must be boolean')
  return Object.freeze({
    maxContextTokens: candidate.maxContextTokens as number,
    maxOutputTokens: candidate.maxOutputTokens as number,
    structuredOutputSupport: candidate.structuredOutputSupport as boolean,
    maxConcurrency: candidate.maxConcurrency as number,
  })
}

function invalid(message: string): never {
  throw new ReasoningExecutorError('reasoning_configuration_invalid', message)
}
