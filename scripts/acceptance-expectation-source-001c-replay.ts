import { createHash } from 'node:crypto'

export interface WorkflowReplayCandidate {
  readonly status: string
  readonly semanticValue: unknown
}

export interface WorkflowReplayEvidence {
  readonly available: boolean
  readonly reason?: 'FULL_WORKFLOW_NOT_COMPLETED'
  readonly replayAHash: string | null
  readonly replayBHash: string | null
  readonly equal: boolean | null
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`
  if (value && typeof value === 'object') return `{${Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`).join(',')}}`
  return JSON.stringify(value)
}

function digest(value: unknown): string {
  return createHash('sha256').update(stable(value)).digest('hex')
}

export function workflowReplayEvidence(replayA?: WorkflowReplayCandidate, replayB?: WorkflowReplayCandidate): WorkflowReplayEvidence {
  const available = replayA?.status === 'completed' && replayB?.status === 'completed'
  const replayAHash = available ? digest(replayA.semanticValue) : null
  const replayBHash = available ? digest(replayB.semanticValue) : null
  return { available, ...(available ? {} : { reason: 'FULL_WORKFLOW_NOT_COMPLETED' as const }), replayAHash, replayBHash, equal: available ? replayAHash === replayBHash : null }
}
