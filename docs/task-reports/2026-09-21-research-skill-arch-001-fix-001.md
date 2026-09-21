# RHL-SKILL-ARCH-001-FIX-001 REPORT

Delivery classification: `READY_FOR_SOL_REVIEW`

task_id: RHL-SKILL-ARCH-001-FIX-001
status: READY_FOR_SOL_REVIEW
baseline: a2aa726977e0c5ae424a6ec6b40be8734ed3b221
branch: codex/skill-arch-001-fix-001-runtime-skill-integrity
implementation_commit: 03a3546ccecdff15bec30575ead4e5202857fede
verified_remote_tip: 03a3546ccecdff15bec30575ead4e5202857fede
sync_status: SYNCED
summary: Closed runtime Research Skill integrity gaps by enforcing semantic Workflow availability, classifying executable boundaries, binding deterministic canonical Skills to existing implementations, downgrading unsupported direct entries, and adding actual-result fixture E2E coverage.
tests: architecture/dispatch 18 passed; focused Workflow/Knowledge E2E 222 passed; npm test client 28 passed and Node 1,213 passed; npm run typecheck, npm run client:typecheck, npm run client:build, and git diff --check pass.
acceptance_criteria: Semantic Workflow decisions require Workflow mapping plus registered research kind, enabled state, and IMPLEMENTED canonical status; deterministic runtime Skills expose callable authoritative bindings; unavailable entries are not advertised; direct semantic and deterministic result paths are fixture-tested; architecture boundaries remain unchanged.
governance_status: IMPLEMENTED / SOL ACCEPTANCE PENDING
blockers: Authenticated provider/model execution and Sol acceptance remain environment-dependent; baseline governance-manifest.yaml remains absent.

## Base

- Required ancestor: `a2aa726977e0c5ae424a6ec6b40be8734ed3b221`
- Isolated worktree: `C:\Users\Administrator\Desktop\ResearchHub_Lite_SKILL_ARCH_001_FIX_001`
- Main was not modified.

## Fix A — Semantic Workflow availability enforcement

`assertSemanticDecision` now requires every selected Workflow Skill to be both
mapped to that Workflow and executable in the current ResearchSkillRegistry.
Executable means `kind === research`, `enabled === true`, and for canonical
entries `catalogStatus === IMPLEMENTED`. Deterministic Workflow composition uses
the same executable subset, so mapped PARTIAL/PLANNED peers are not advertised.

Focused tests exercise reasoning proposals containing:

- `company_research + thesis_formalize`
- `earnings_review + earnings_call_analysis`
- `industry_research + industry_supply_demand_cycle`

Each is rejected by the bounded repair attempt and resolves through the existing
deterministic fallback without retaining the unavailable Skill.

## Fix B — Runtime execution audit

The previous 12 runtime-registered canonical entries were audited against their
actual direct execution boundary. The catalog now records `executionClass` and
`runtimeBinding`.

### SEMANTIC_EXECUTABLE

- `business_model_map`: existing session boundary loads the canonical
  methodology and captures a bounded evidence-backed result.
- `thesis_red_team`: existing bounded reasoning and Thesis Red Team Workflow
  implementation; no arithmetic is delegated to the model.

### DETERMINISTIC_EXECUTABLE

- `consensus_expectations_analysis` → `buildConsensusSnapshot`
- `earnings_variance_analysis` → `compareActualToExpectation`
- `guidance_analysis` → `buildGuidanceRevisionBridge`
- `estimate_revision_analysis` → `buildEstimateRevisionBridge`
- `dcf_valuation` → `calculateForwardDcf`
- `reverse_dcf_expectation_decode` → `calculateReverseDcf`
- `scenario_valuation` → `calculateValuation`

These bindings are exposed on the canonical registry definitions as callable
`runtimeExecutor` functions and reuse existing authoritative implementations.

### Downgraded to PARTIAL

- `business_driver_analysis`: no independently callable canonical driver
  decomposition binding exists.
- `unit_economics`: no independently callable canonical unit-economics
  calculation binding exists.
- `valuation_crosscheck`: Workflow/report comparison logic exists, but no direct
  canonical cross-check binding exists.

The catalog therefore changes from 12 IMPLEMENTED / 11 PARTIAL / 6 PLANNED to
9 IMPLEMENTED / 14 PARTIAL / 6 PLANNED. PARTIAL entries are not runtime
registered and cannot be selected by semantic or deterministic dispatch.

## Fix C — Actual-result acceptance

- Semantic result proof: fixture-backed request → `business_model_map` canonical
  Skill plan → methodology loading → bounded captured research result.
- Deterministic result proof: direct canonical `dcf_valuation` execution is
  compared with `calculateForwardDcf` for identical fixture inputs.
- External provider/model status: not attempted; fixture execution is clearly
  distinguished from authenticated external E2E.

## Architecture

- Flat Skill layer: preserved.
- Skill-to-Skill calls: none introduced.
- New Agent: none.
- New Planner: none.
- Capability layer: none.
- Knowledge Schema changed: no.
- Workflow remains the composition, lifecycle, report, and Knowledge boundary.

## Required regression

- Architecture and dispatch/service: 18 focused tests passed.
- Company, Earnings, Valuation, Industry, Thesis, and Knowledge Workflow/E2E:
  222 tests passed.
- Full Node: 1,213 passed, 0 failed.
- Client: 28 passed, 0 failed.
- Typecheck: root and client passed.
- Build: client production build passed, 176 modules transformed.
- Diff check: passed.

## Final classification

`IMPLEMENTED / SOL ACCEPTANCE PENDING`
