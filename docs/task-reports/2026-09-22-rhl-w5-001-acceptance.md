# RHL-W5-001 ACCEPTANCE REPORT

Status: `IMPLEMENTED / SOL ACCEPTANCE PENDING`

## 1. Task identity and acceptance status

```text
task_id: RHL-W5-001
status: READY_FOR_SOL_REVIEW
baseline: d589bf15e9830fe57f73a6fdad9441c50d30abe5
branch: codex/w5-001-comps-research-quality
implementation_commit: bbf181b93d929934bfa46a8782552b247ec168ce
verified_remote_tip: bbf181b93d929934bfa46a8782552b247ec168ce
finalization_commit: pending
sync_status: READY_TO_SYNC
```

The implementation is complete on the isolated Wave 5 branch. Sol acceptance,
authenticated provider E2E, and final remote-tip verification remain pending.

## 2. Baseline and repository state

- Required accepted ancestor: `d589bf15e9830fe57f73a6fdad9441c50d30abe5`.
- Baseline was verified as a commit and is contained by
  `origin/codex/post-w4-001-product-readiness-audit`.
- `origin/main` at task start was `0b53e462cf5da00b568a7af52dec4375c7dfb5b9`.
- Implementation ran in isolated worktree
  `C:\Users\Administrator\Desktop\ResearchHub_Lite_W5_001`.
- Main worktree and the existing Post-W4 audit worktree were not modified.

## 3. Catalog responsibility correction

Before Wave 5 the catalog was 29 entries: 21 `IMPLEMENTED`, 4 `PARTIAL`, and 4
`PLANNED`. The catalog is now 26 entries: 22 `IMPLEMENTED`, 0 `PARTIAL`, and 4
`PLANNED`.

Removed from the canonical catalog:

- `evidence_normalization`: acquisition/shared evidence infrastructure.
- `valuation_crosscheck`: Valuation Workflow composition.
- `research_qc`: reusable Workflow-layer terminal gate.

The count decrease is an explicit responsibility correction, not deletion of
product capability. The four remaining planned entries are
`document_change_analysis`, `earnings_call_analysis`,
`financial_model_build_update`, and `model_audit`.

## 4. Comparable valuation implementation

`comps_valuation` is `IMPLEMENTED`, runtime registered, and independently
callable. It has an explicit contract for peer identity, source references,
point-in-time dates, comparable period, currency, metric units, share basis,
comparability dimensions, accepted/rejected peers, metric-specific diagnostics,
multiple distributions, selected method/basis, and implied value.

It reuses `skills/valuation/calculations/comps.ts`, never fabricates peers or
metrics, rejects dangling/empty sources, rejects future/period/unit/currency
mismatches, keeps negative EBITDA unavailable for EV/EBITDA while allowing
other valid multiples, and returns insufficient-data status instead of filling
the peer set synthetically.

## 5. ResearchQualityGate

`workflows/research-quality-gate.ts` is a reusable Workflow-layer component,
not a Skill. It runs before Gateway submission and does not reacquire data,
invoke Skills, mutate Knowledge, or average valuation methods.

It covers source-reference integrity, point-in-time future references, period,
unit and currency mismatches, forecast-to-valuation basis, optional unavailable
sections, expectation-to-thesis contradiction, thesis-to-catalyst dangling
propositions, and peer-count/weak-comparability diagnostics. `ERROR` diagnostics
make `eligibleForGateway` false; warnings and informational optional gaps remain
Gateway-eligible.

## 6. Workflow integration

The gate is integrated before the durable submission path for Valuation,
Company Research, Earnings Review, Industry Research, Event Research, Thesis
Lifecycle, and Daily Intelligence. Each result exposes the quality-gate result
for auditability. Workflow definitions expose a gate profile while their
`skillIds` contain only canonical Skills.

## 7. Valuation cross-check

Valuation now exposes Workflow-owned cross-check data containing available and
unavailable methods, selected primary method, conflicts, and
`automaticAveraging: false`. Cross-check logic remains inside Valuation
Workflow; no `valuation_crosscheck` Skill or averaging layer was introduced.

## 8. Routing and collision control

Direct comparable requests route to `comps_valuation`. Reverse DCF and growth /
price-implied requests remain excluded from the comparable route. Workflow
metadata no longer advertises the three reclassified IDs or planned
`earnings_call_analysis` as executable peer Skills.

## 9. Architecture invariants

- No custom Agent Runtime, Planner, generic Provider layer, vector database, or
  UI redesign was added.
- Pi-specific integration boundaries remain unchanged.
- Knowledge mutation remains Workflow -> Gateway -> validation -> Writer.
- The catalog, runtime registry, Workflow registry, and methodology section
  contracts remain aligned.

## 10. Tests and validation

Passed:

- `npm run typecheck`
- `npm test` — client 28/28; Node 1305/1305.
- `npm run client:typecheck`
- `npm run client:build`
- `git diff --check`
- Focused Wave 5 tests — 44/44.
- Daily-intelligence regression subset — 37/37.

The known `VAL-HTTP-001` test passed in the full suite; no unrelated timing
change was made.

## 11. Acceptance scenarios

- A: accepted comparable peers, distributions, median, and implied value —
  PASS.
- B: missing/future/period/currency/unit/weak evidence and metric-specific
  negative denominators — PASS.
- C: source, PIT, compatibility, forecast, expectation, catalyst, peer, and
  optional-section gate boundaries — PASS.
- D: direct comparable routing and reverse-DCF collision boundary — PASS.
- E: catalog and Workflow responsibility correction — PASS.

## 12. Documentation and governance

Updated authoritative architecture, catalog, migration, governance, and project
state documents. Added `docs/governance/RHL-W5-001.md` and this acceptance
report. The documentation explicitly records that the catalog count decreased
because responsibility ownership was corrected.

## 13. External validation and residual risk

Fixture and repository-level validation are complete. Authenticated external
provider execution and Sol acceptance are not claimed. Real peer-set acquisition
still depends on the caller supplying attributable, point-in-time peer inputs;
the implementation intentionally fails closed when those inputs are absent or
incompatible.

## 14. Final classification

```text
COMPS_VALUATION_READY: YES
CROSS_WORKFLOW_QUALITY_GATE_READY: YES
CATALOG_RECLASSIFICATION_COMPLETE: YES
VALUATION_WORKFLOW_CROSSCHECK_READY: YES
WAVE5_CORE_READY: YES
AUTHENTICATED_COMPS_E2E_READY: PENDING
CAN_CLOSE_WAVE5: NO
FINAL_STATUS: IMPLEMENTED / SOL ACCEPTANCE PENDING
```

Implementation commit `bbf181b93d929934bfa46a8782552b247ec168ce` is pushed and
was verified as the remote branch tip before this report finalization commit.
The finalization commit and its remote tip are recorded by the final sync step.
