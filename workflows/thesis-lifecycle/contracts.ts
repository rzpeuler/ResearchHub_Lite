import type { CatalystMapInput, CatalystMapResult } from '../../skills/catalyst_map/contracts.ts'
import type { ExpectationGapInput, ExpectationGapResult } from '../../skills/expectation_gap/contracts.ts'
import type { ThesisFormalizeInput, FormalizedThesisResult } from '../../skills/thesis_formalize/contracts.ts'
import type { ThesisRefreshInput, ThesisRefreshResult } from '../../skills/thesis_refresh/contracts.ts'

export type ThesisLifecycleMode = 'CREATE' | 'REFRESH'

export interface ThesisLifecycleInput {
  readonly mode: ThesisLifecycleMode
  readonly formalization?: ThesisFormalizeInput
  readonly expectationGap?: ExpectationGapInput
  readonly catalystMap?: CatalystMapInput
  readonly refresh?: ThesisRefreshInput
  /** Existing Thesis Red Team remains a Workflow peer; its result is injected by its bounded Workflow. */
  readonly redTeamResult?: unknown
}

export interface ThesisLifecycleResult {
  readonly status: 'completed' | 'blocked'
  readonly mode: ThesisLifecycleMode
  readonly steps: readonly {
    readonly skillId: 'thesis_formalize' | 'expectation_gap' | 'thesis_red_team' | 'catalyst_map' | 'thesis_refresh'
    readonly status: 'completed' | 'skipped' | 'blocked'
    readonly result?: unknown
  }[]
  readonly formalization?: FormalizedThesisResult
  readonly expectationGap?: ExpectationGapResult
  readonly catalystMap?: CatalystMapResult
  readonly refresh?: ThesisRefreshResult
  readonly diagnostics: readonly string[]
}
