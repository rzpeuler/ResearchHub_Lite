# RHL M3A-3 Event Research v1 — Task 5 Validation Summary

Status: `IMPLEMENTED / CTO ACCEPTANCE PENDING`

## Scope

Task 5 is documentation and validation-asset work for the implemented Event
Research vertical. The architecture record documents the single-Company,
single-Event-Anchor boundary; exact Daily Signal `getById` bridge; URL safety;
CNINFO/GDELT bounds; Stage A evidence assessment; deterministic verification;
event fingerprint/date; Stage B impact synthesis; proposal/evidence gate;
16-section report; fallback/cancellation; telemetry; and Pi/HTTP entrypoints.

No `app/`, `workflows/`, `skills/`, `plugins/`, Schema, Gateway, or Writer file
was changed by Task 5. The current working tree already contained Task 2/3
changes; validation evidence identifies this as `pre-commit-working-tree`.

## Executed checks

Focused Event Research command:

```text
node --import tsx --test tests/workflows/event-research.test.ts tests/workflows/event-research-skill.test.ts
```

Observed result: `51/51 PASS` (20 Skill tests, 23 Workflow tests, app/gate
tests included). The
row-level matrix expands the executable assertions into E1–E86 requirement
rows and includes the Skill rows.

Repository checks: Client `21/21 PASS`, full discovered Node `518/518 PASS`,
`npx tsc --noEmit PASS`, and
`git diff --check PASS`. These are working-tree observations and are not an
acceptance claim for pre-existing Task 2/3 code.

## Real Pi gate

`tests/validation/event-research-pi-e2e.ts` uses the actual
`PiReasoningExecutor`, the selected production model
`zhipu-openapi/glm-5.3-flash`, fresh Schema 0.4 / Storage 1 Knowledge, one
seeded Daily Signal, one official fixture, one supporting/context fixture, and
one irrelevant fixture. It executed Stage A and Stage B and proved strong
official verification and no canonicalization of the irrelevant source.

The authoritative gate result is `REAL_MODEL_CONTRACT_BLOCKED`, exit `1`:
Stage B required its bounded fallback. The report contract is now admitted and
the typed 16-section result persisted, but the real-model gate remains blocked;
this is intentionally not `EXECUTED / PASS GATE`.

## Provider smoke

The separate non-blocking smoke invokes the existing CNINFO Official and GDELT
adapters with a six-per-provider request bound. CNINFO transport succeeded but
returned zero candidates. GDELT returned HTTP 429. These results are recorded
as provider availability observations only and do not change the product gate.

## Evidence files

- `RHL_M3A_EVENT_RESEARCH_V1.json` — sanitized aggregate record.
- `RHL_M3A_EVENT_RESEARCH_V1_PI_E2E.json` — harness-generated Real Pi result.
- `RHL_M3A_EVENT_RESEARCH_V1_PROVIDER_SMOKE.json` — live, non-blocking smoke.
- `RHL_M3A_EVENT_RESEARCH_V1_TEST_MATRIX.json` — row-level executable matrix.
- This summary.

E87 is blocked by the actual Real Pi gate. E88 is executed as a non-blocking
smoke with provider-level outcomes; no unavailable provider result is relabeled
as PASS.
