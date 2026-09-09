# RHL M3A-3 Event Research v1 — FIX-002 Validation Summary

Status: `FIX-002 IMPLEMENTED / CTO ACCEPTANCE PENDING`

FIX-002 closes the Stage B semantic-contract boundary on the accepted FIX-001
architecture. Stage B model output is `interpretations`, `assessments`, and
bounded `proposals`; the validated semantic core is independent from the
proposal candidate gate. Impact fields are explicit and required, legacy
`disposition` is not accepted, and the final frozen 16-section report remains
code-owned.

## Executed checks

Focused Event Research command:

```text
node --import tsx --test tests/workflows/event-research.test.ts tests/workflows/event-research-skill.test.ts
```

Observed result: `48/48 PASS`, including FIX-002 regressions for required
impact semantics, malformed proposal isolation, legacy section rejection,
fallback telemetry, safe diagnostics, and user-event identity stability.

Repository checks: full Node `520/520 PASS`, Client `21/21 PASS`,
`npm run typecheck PASS`, `npm run client:typecheck PASS`,
`npm run client:build PASS`, and `git diff --check PASS`.

## Real Pi gate

The executable harness uses `ResearchService.startEventResearch`, the actual
`WorkflowService`, `PiReasoningExecutor`, fresh Schema 0.4 / Storage 1
Knowledge, structured Assumption/Risk seed claims, a clustered Daily Signal,
official/supporting/irrelevant fixtures, and the full acceptance gate.

Authoritative result: `EXECUTED / PASS GATE`, process exit `0`, model
`zhipu-openapi/glm-5.3-flash`. Stage A and Stage B both validated/applied with
zero repair attempts. Direct impact count `1`, second-order impact count `1`,
affected Existing Knowledge count `3`, model-derived interpretation count
`11`, deterministic event occurrence included, entity count unchanged, Source
delta `+2`, Claim delta `+2`, report persisted with 16 sections, and no
irrelevant source canonicalized.

The harness also records safe Stage A/B diagnostics, first/repair structural
summaries, and proposal rejection diagnostics without raw model output or
secrets. Two optional model proposal candidates were rejected independently;
the deterministic event-occurrence Claim remained accepted.

## Provider smoke

The separate provider smoke remains non-blocking: CNINFO transport succeeded
with zero candidates and GDELT returned HTTP 429. No provider availability
observation is relabeled as product PASS.

## Evidence files

- `RHL_M3A_EVENT_RESEARCH_V1_PI_E2E.json` — harness-generated Real Pi gate.
- `RHL_M3A_EVENT_RESEARCH_V1_TEST_MATRIX.json` — row-level executable matrix.
- `RHL_M3A_EVENT_RESEARCH_V1_PROVIDER_SMOKE.json` — non-blocking provider smoke.
- `RHL_M3A_EVENT_RESEARCH_V1.json` — aggregate evidence record.
