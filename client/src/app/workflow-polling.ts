import type { WorkflowRun } from '../api/runtime-client'

export const terminalWorkflowStatuses: ReadonlySet<WorkflowRun['status']> = new Set(['completed', 'completed_with_review', 'blocked', 'cancelled', 'failed'])

export interface WorkflowPollingOptions {
  readonly runId: string
  readonly intervalMs?: number
  readonly fetchWorkflow: (runId: string) => Promise<WorkflowRun>
  readonly onUpdate: (workflow: WorkflowRun) => void
  readonly onError: (error: unknown) => void
}

/** Polls one WorkflowRun without overlapping requests or restarting on state updates. */
export function startWorkflowPolling(options: WorkflowPollingOptions): () => void {
  const intervalMs = options.intervalMs ?? 1000
  let stopped = false
  let timer: ReturnType<typeof setTimeout> | undefined

  const schedule = (): void => {
    if (stopped) return
    timer = setTimeout(() => { timer = undefined; void poll() }, intervalMs)
  }
  const poll = async (): Promise<void> => {
    if (stopped) return
    try {
      const next = await options.fetchWorkflow(options.runId)
      if (stopped) return
      options.onUpdate(next)
      if (!terminalWorkflowStatuses.has(next.status)) schedule()
    } catch (error) {
      if (stopped) return
      options.onError(error)
      schedule()
    }
  }

  void poll()
  return () => { stopped = true; if (timer !== undefined) clearTimeout(timer) }
}
