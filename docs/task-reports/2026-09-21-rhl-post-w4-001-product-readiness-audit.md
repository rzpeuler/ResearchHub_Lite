# RHL-POST-W4-001 PRODUCT READINESS AUDIT

task_id: RHL-POST-W4-001
status: READY_FOR_SOL_REVIEW
audit_status: AUDIT_COMPLETE / SOL REVIEW PENDING
baseline: 4691ee82368cd66c35dd2f0ebcd337ef6fb1c678
branch: codex/post-w4-001-product-readiness-audit
implementation_commit: 5fcb6607fc6d79741faeef9f3bf6dcb0c14d3100
verified_remote_tip: 5fcb6607fc6d79741faeef9f3bf6dcb0c14d3100
sync_status: SYNCED
summary: `Read-only product readiness audit and Wave 5 governance planning; no runtime implementation changed.`
tests: `417 focused tests passed across Company, Earnings, Industry, Valuation, Event, Thesis and Daily suites; accepted W4 and expectation-source reports provide prior full-regression and real-source evidence.`
acceptance_criteria: `All required catalog, mission, remaining-Skill, dependency, reclassification, Wave 5, alternative-Wave 5, data-feasibility, architecture-boundary and external-readiness reviews are recorded in this report and its supporting matrices.`
governance_status: `SOL review pending; no catalog reclassification or feature implementation performed.`
blockers: `No audit blocker. Product-level blockers remain transcript-source availability, paired document-version availability, complete model-input coverage, and authenticated external acceptance.`

## Baseline and repository state

- Accepted ancestor: `4691ee82368cd66c35dd2f0ebcd337ef6fb1c678` (`4691ee8`).
- Audit branch: `codex/post-w4-001-product-readiness-audit`.
- Audit HEAD: pending final documentation commit.
- Remote HEAD: pending safe Git sync.
- `origin/main` at audit start: `0b53e462cf5da00b568a7af52dec4375c7dfb5b9`.
- Worktree: clean before audit documents; final clean state is required.
- The audit worktree was isolated from the accepted ancestor. `npm ci
  --ignore-scripts` was used only to provide local test dependencies; no
  tracked implementation changes resulted.

## Current catalog

The executable catalog contains 29 entries: 21 `IMPLEMENTED`, 4 `PARTIAL`,
and 4 `PLANNED`. The remaining entries are:

| Entry | Current state | Runtime evidence |
|---|---|---|
| `evidence_normalization` | `PARTIAL` | Existing acquisition/provider normalizers; no separate stable Skill result contract |
| `document_change_analysis` | `PLANNED` | No runtime registration or implementation |
| `earnings_call_analysis` | `PLANNED` | No transcript implementation or source |
| `financial_model_build_update` | `PLANNED` | No complete model implementation |
| `model_audit` | `PLANNED` | No runtime registration |
| `comps_valuation` | `PARTIAL` | Deterministic helper arithmetic exists; peer evidence contract is incomplete |
| `valuation_crosscheck` | `PARTIAL` | Workflow/report comparison exists; no independent canonical binding |
| `research_qc` | `PARTIAL` | Validators and terminal gates exist; no standalone Skill contract |

The detailed matrix is in `POST_W4_PRODUCT_READINESS_MATRIX.md`; the remaining
Skill matrix and dependency map are in `POST_W4_REMAINING_SKILL_MATRIX.md`.

## Product mission readiness

| Mission | Classification | Decision basis |
|---|---|---|
| Company Research | `USABLE_WITH_GAPS` | Strong company/industry depth and thesis entry points, but the company Workflow does not compose the full valuation/red-team/catalyst/lifecycle mission. |
| Earnings Review | `USABLE_WITH_GAPS` | Expectations, guidance, revisions and financial quality are strong; transcript/Q&A is absent. |
| Industry Research | `CORE_READY` | Core eight-module implementation and bounded evidence behavior are accepted; external provider readiness is separate. |
| Valuation | `USABLE_WITH_GAPS` | Current PE/PB/EV/EBITDA, scenario and reverse-DCF paths are usable; comps evidence binding and DCF product availability remain gaps. |
| Event Research | `CORE_READY` | Anchored event workflow is implemented with strict references, dates, roles and fail-closed Gateway behavior. |
| Thesis Lifecycle | `USABLE_WITH_GAPS` | Bounded formalize/refresh/red-team/catalyst behavior exists; continuous monitoring needs stronger evidence freshness and cross-domain QC. |
| Daily Intelligence | `USABLE_WITH_GAPS` | Bounded signal integration is implemented; provider coverage and one terminal cross-domain QC contract remain gaps. |

These classifications intentionally do not use `PRODUCT_READY` and do not
equate fixture success with authenticated provider/model readiness.

## Remaining Skill evaluation

### `evidence_normalization`

High reuse and high error sensitivity, but the repository already has the
correct acquisition-layer contracts: normalized sources, provider outcomes,
timestamps, hashes, rights metadata and diagnostics. Keep this as shared
infrastructure. Recommendation: `RECLASSIFY_TO_INFRASTRUCTURE`.

### `document_change_analysis`

High value for versioned event, earnings, daily and thesis evidence, but the
current source stack does not guarantee stable paired versions. Existing
earnings deltas, guidance deltas, estimate revisions and byte-preserving
document parsing are substitutes for narrower cases. Recommendation: P1 only
after a paired-disclosure contract is proven; no generic crawler/diff system.

### `earnings_call_analysis`

High user value but low current data feasibility. There is no transcript/Q&A
provider, transcript source kind, or accepted implementation. Recommendation:
P1 only with a stable permitted source; otherwise defer and retain explicit
unavailable behavior.

### `financial_model_build_update`

High theoretical value, but complete three-statement history/forecast inputs,
model graph, and forecast governance are not yet bounded for the current
product. Existing deterministic valuation, reverse DCF, scenarios, drivers,
unit economics and expectations are adequate substitutes for the current
scope. Recommendation: P2/defer.

### `model_audit`

It is downstream of a durable model build/update contract. Starting it now
would produce an audit of a model abstraction that does not exist. Recommendation:
P2/defer behind `financial_model_build_update`.

### `comps_valuation`

High value, high reuse, and the strongest immediate product gap with a real
deterministic foundation in `skills/valuation/calculations/comps.ts`. The
missing work is peer-set identity, period/unit/source evidence, rejection
diagnostics, PIT compatibility and Workflow binding. Recommendation: P0.

### `valuation_crosscheck`

Useful and already represented as secondary-method comparison in the valuation
Workflow. It consumes other outputs and should not own an independent semantic
execution contract. Recommendation: `RECLASSIFY_TO_WORKFLOW`.

### `research_qc`

Critical and broadly reusable, with existing validators, Gateway checks,
report validation and terminal gates. The missing piece is a unified,
typed, cross-domain terminal composition. Recommendation:
`RECLASSIFY_TO_WORKFLOW`; treat the work as a P0 Workflow quality gate, not a
new canonical Skill.

## Cross-domain quality risks

- Workflow composition can be incomplete even when every local Skill test is
  green.
- Comparable arithmetic can be correct while peer identity or period basis is
  wrong.
- PIT and source-reference checks are distributed and do not yet guarantee
  expectation, valuation, thesis, catalyst and final report agreement.
- Provider empty/failed states must remain explicit; no fallback may imply
  authenticated success.
- Continuous monitoring is not established merely by having a refresh Skill;
  it requires durable scheduling, source freshness, and bounded evidence.

## Data feasibility and external readiness

The expectation-source track is the strongest external-readiness evidence in
scope. Its closure reports record Eastmoney report acquisition with published
timestamps, PIT cutoff, pagination, identity-conflict handling, provider
outcomes, real 600519 and 300750 runs, 22 revisions/valuation impacts for the
primary run, and deterministic replay. They also record unavailable consensus
for one 300750 case and zero usable estimates for a 600519 FY2025 case without
fabrication. Historical surprise reconstruction remains limited by Eastmoney's
rolling forecast horizon.

This supports the expectation path; it does not establish transcript
availability, complete model inputs, universal provider coverage, or all
authenticated external paths. Those remain separate readiness gates.

## Dependency graph and priorities

The dependency order is:

```text
normalized acquisition sources
  -> PIT/period/unit/source validators
  -> comps_valuation
  -> valuation_crosscheck (Workflow composition)
all Workflow outputs
  -> research_qc (Workflow terminal gate)

paired official document versions -> document_change_analysis (conditional)
stable transcript/Q&A source -> earnings_call_analysis (conditional)
financial_model_build_update -> model_audit
```

Priority: P0 is `comps_valuation` plus Workflow-owned `research_qc`; P1 is
narrow document change analysis and source-gated earnings-call analysis; P2 is
model build/update and model audit. Reclassification is required for
normalization, valuation cross-check and QC.

## Recommended Wave 5

`High-Confidence Comparable Valuation and Cross-Workflow Quality Gate`.

The canonical next capability is `comps_valuation`. In the same bounded wave,
Workflow should own the reusable `research_qc` terminal gate, and
`valuation_crosscheck` should remain Workflow composition. Acceptance must
cover attributable peer identity, PIT/period/unit/source compatibility, no
synthetic peers, finite code-owned arithmetic, typed fail-closed diagnostics,
and cross-domain artifact integrity. No Agent Runtime, Planner, generic
Provider layer, vector store, Knowledge Schema, frontend canonical write, or
synthetic success is in scope.

## Alternative Wave 5

Conditional `Earnings Context and Versioned Evidence`: issue only after a
stable permitted transcript/Q&A source is available. It may include
`earnings_call_analysis` and a narrow `document_change_analysis` contract for
paired official disclosures. Without those source conditions, this is not
ready for an execution taskbook.

## Deferred

Defer complete three-statement model construction, model audit, generic
document crawling/diff, transcript analysis without a source, and any attempt
to inflate the canonical catalog by treating infrastructure or Workflow gates
as semantic Skills.

## Architecture recommendations

1. Preserve Workflow as deterministic composition and terminal-gate owner.
2. Preserve Skill as professional semantic methodology and Plugin as external
   capability integration.
3. Formalize shared evidence normalization in infrastructure contracts rather
   than a semantic catalog entry.
4. Reuse existing Gateway/Writer boundaries and keep Knowledge mutation
   canonical and validated.
5. Keep implementation readiness, provider readiness, model readiness and
   authenticated E2E as distinct acceptance dimensions.

## Tests and evidence used

The audit ran six focused commands with the following results: Company 19/19,
Earnings 114/114, Industry 92/92, Valuation 91/91, Event 49/49, and Thesis /
Daily 52/52. Total: 417/417 passed. Accepted W4 reports record the prior full
Node/client regression and the isolated `VAL-HTTP-001` result. The intermittent
`VAL-HTTP-001` was not changed or treated as a new defect by this audit.

Primary evidence paths include:

- `app/services/research-skill-catalog.ts`
- `app/services/skill-registry.ts`
- `app/services/workflow-registry.ts`
- `app/services/research-dispatch-service.ts`
- `skills/valuation/calculations/comps.ts`
- `workflows/valuation/workflow.ts`
- `plugins/research-acquisition/contracts.ts`
- `plugins/research-acquisition/expectations/contracts.ts`
- `docs/governance/WAVE2-CLOSURE.md`
- `docs/governance/WAVE3-001.md`
- `docs/governance/WAVE4-001.md`
- `docs/governance/WAVE4-001-FIX-001.md`
- `docs/task-reports/2026-09-21-expectation-source-close-001-track-closure.md`
- `docs/task-reports/2026-09-21-expectation-source-001c-env-001-parser-financial-unblock.md`

## External readiness

Implementation readiness is sufficient to plan the recommended Wave 5.
Authenticated external-data/model readiness is partial and must be rechecked
per source and environment. Transcript/Q&A and complete model-input paths are
not ready. Provider emptiness, schema drift, source cutoff, rights, and
rolling-horizon limitations remain first-class diagnostics.

## Final recommendation

`NEXT_WAVE`: `High-Confidence Comparable Valuation and Cross-Workflow Quality Gate`

`NEXT_WAVE_SKILLS`: `comps_valuation`; Workflow-owned `research_qc` terminal gate; `valuation_crosscheck` remains Workflow composition.

`DO_NOT_BUILD_YET`: `financial_model_build_update`, `model_audit`, generic `document_change_analysis`, `earnings_call_analysis` without a stable source, and standalone canonical Skills for normalization/QC/cross-checking.

`RECLASSIFICATION_REVIEW_REQUIRED`: `YES`

`READY_TO_ISSUE_WAVE5_TASKBOOK`: `YES, after SOL accepts this audit and the reclassification boundary`
