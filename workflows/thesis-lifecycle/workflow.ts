import { mapCatalysts } from '../../skills/catalyst_map/calculations.ts'
import { analyzeExpectationGap } from '../../skills/expectation_gap/calculations.ts'
import { formalizeThesis } from '../../skills/thesis_formalize/calculations.ts'
import { refreshThesis } from '../../skills/thesis_refresh/calculations.ts'
import type { ThesisLifecycleInput, ThesisLifecycleResult } from './contracts.ts'

function blocked(input: ThesisLifecycleInput | undefined, diagnostics: readonly string[]): ThesisLifecycleResult {
  return { status: 'blocked', mode: input?.mode === 'REFRESH' ? 'REFRESH' : 'CREATE', steps: [], diagnostics }
}

export function runThesisLifecycle(input: ThesisLifecycleInput | undefined): ThesisLifecycleResult {
  if (!input || !['CREATE', 'REFRESH'].includes(input.mode)) return blocked(input, ['THESIS_LIFECYCLE_MODE_INVALID'])
  const steps: ThesisLifecycleResult['steps'][number][] = []
  const diagnostics: string[] = []
  let formalization: ThesisLifecycleResult['formalization']
  let expectationGap: ThesisLifecycleResult['expectationGap']
  let catalystMap: ThesisLifecycleResult['catalystMap']
  let refresh: ThesisLifecycleResult['refresh']
  try {
    if (input.mode === 'CREATE') {
      if (!input.formalization) return blocked(input, ['THESIS_LIFECYCLE_FORMALIZATION_REQUIRED'])
      formalization = formalizeThesis(input.formalization)
      steps.push({ skillId: 'thesis_formalize', status: 'completed', result: formalization })
      if (input.expectationGap) { expectationGap = analyzeExpectationGap(input.expectationGap); steps.push({ skillId: 'expectation_gap', status: 'completed', result: expectationGap }) } else steps.push({ skillId: 'expectation_gap', status: 'skipped' })
      if (input.redTeamResult === undefined) { diagnostics.push('thesis_red_team_result_not_injected'); steps.push({ skillId: 'thesis_red_team', status: 'skipped' }) } else steps.push({ skillId: 'thesis_red_team', status: 'completed', result: input.redTeamResult })
      if (input.catalystMap) { catalystMap = mapCatalysts(input.catalystMap); steps.push({ skillId: 'catalyst_map', status: 'completed', result: catalystMap }) } else steps.push({ skillId: 'catalyst_map', status: 'skipped' })
    } else {
      if (!input.refresh) return blocked(input, ['THESIS_LIFECYCLE_REFRESH_REQUIRED'])
      if (input.expectationGap) { expectationGap = analyzeExpectationGap(input.expectationGap); steps.push({ skillId: 'expectation_gap', status: 'completed', result: expectationGap }) } else steps.push({ skillId: 'expectation_gap', status: 'skipped' })
      if (input.redTeamResult === undefined) steps.push({ skillId: 'thesis_red_team', status: 'skipped' }); else steps.push({ skillId: 'thesis_red_team', status: 'completed', result: input.redTeamResult })
      refresh = refreshThesis(input.refresh)
      steps.push({ skillId: 'thesis_refresh', status: refresh.status === 'blocked' ? 'blocked' : 'completed', result: refresh })
      if (input.catalystMap) { catalystMap = mapCatalysts(input.catalystMap); steps.push({ skillId: 'catalyst_map', status: 'completed', result: catalystMap }) } else steps.push({ skillId: 'catalyst_map', status: 'skipped' })
    }
  } catch (error) {
    diagnostics.push(error instanceof Error ? error.message : String(error))
    return { status: 'blocked', mode: input.mode, steps, ...(formalization === undefined ? {} : { formalization }), ...(expectationGap === undefined ? {} : { expectationGap }), ...(catalystMap === undefined ? {} : { catalystMap }), ...(refresh === undefined ? {} : { refresh }), diagnostics }
  }
  const resultStatus = [formalization?.status, expectationGap?.status, catalystMap?.status, refresh?.status].some((status) => status === 'blocked' || status === 'unavailable') ? 'blocked' : 'completed'
  return { status: resultStatus, mode: input.mode, steps, ...(formalization === undefined ? {} : { formalization }), ...(expectationGap === undefined ? {} : { expectationGap }), ...(catalystMap === undefined ? {} : { catalystMap }), ...(refresh === undefined ? {} : { refresh }), diagnostics }
}
