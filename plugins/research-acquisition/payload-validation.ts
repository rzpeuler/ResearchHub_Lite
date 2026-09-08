import type { AcquisitionPayloadStatus } from './contracts.ts'

export interface UsableAcquisitionPayload {
  readonly status: AcquisitionPayloadStatus
  readonly reason: string
}

const EMPTY_TEXT = new Set(['', 'null', 'undefined'])

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function emptyLike(value: unknown): boolean {
  if (value === null || value === undefined) return true
  if (typeof value === 'string') return EMPTY_TEXT.has(value.trim().toLowerCase())
  if (typeof value !== 'object') return false
  if (Array.isArray(value)) return value.length === 0 || value.every(emptyLike)
  const entries = Object.entries(value)
  return entries.length === 0 || entries.every(([, child]) => child === null || child === undefined || (typeof child === 'string' && child.trim() === '') || (Array.isArray(child) && child.length === 0))
}

function providerError(value: Record<string, unknown>): boolean {
  const status = typeof value.status === 'string' ? value.status.toLowerCase() : ''
  const code = typeof value.code === 'string' ? value.code.toLowerCase() : ''
  return value.success === false || value.error !== undefined || value.error_code !== undefined || value.errmsg !== undefined || status === 'error' || status === 'failed' || code === 'error' || code === 'failed'
}

/** Classify provider output before it can become research evidence. */
export function validateUsableAcquisitionPayload(value: unknown): UsableAcquisitionPayload {
  if (record(value) && providerError(value)) return { status: 'failed', reason: 'provider-declared error payload' }
  if (emptyLike(value)) return { status: 'empty', reason: 'provider returned an empty payload' }
  if (record(value)) {
    for (const key of ['data', 'rows', 'records', 'results', 'items']) {
      if (key in value) {
        const nested = validateUsableAcquisitionPayload(value[key])
        if (nested.status !== 'usable') return nested
      }
    }
  }
  return { status: 'usable', reason: 'payload contains usable non-empty data' }
}

export function isUsableAcquisitionPayload(value: unknown): boolean {
  return validateUsableAcquisitionPayload(value).status === 'usable'
}
