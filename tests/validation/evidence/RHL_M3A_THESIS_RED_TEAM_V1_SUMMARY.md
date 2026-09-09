# RHL M3A-4 Thesis Red Team v1 FIX-003 Evidence Summary

- Task: `RHL-PERSONAL-RESEARCH-V1-M3A-THESIS-RED-TEAM-001-FIX-003`
- Status: `IMPLEMENTED / CTO ACCEPTANCE PENDING`
- Real Pi E2E: `EXECUTED / PASS GATE`
- Model: `zhipu-openapi/glm-5.3-flash`; the run used the real `PiReasoningExecutor` and no synthetic semantic fallback.
- Stage A: real model output validated and applied; `fallbackUsed=false`, `repairAttempts=0`, 8 attack vectors and 6 invalidation conditions.
- Stage B semantic core: initial output required one bounded semantic repair because `failure_case` was missing; repaired output validated and applied with `fallbackUsed=false`, 10 challenges, 2 alternative explanations, and 1 failure case.
- Stage B proposal phase: initial candidates were deterministically rejected; proposal-only repair was called exactly once with frozen semantic core. The repair returned no admissible model candidate, so no synthetic proposal was created.
- Deterministic verdict: `materially_challenged`; qualified disconfirming evidence bound directly from code-owned verdict/challenge logic, independent of accepted model proposals.
- Durable outcome: 1 deterministic proposal submitted, 1 durable proposal applied, canonical Source delta 2, canonical Claim delta 1. Persisted state was used for the gate.
- Integrity: Thesis hash, ID, lifecycle, and sourceRefs unchanged; Company hash unchanged. Unknown-date, irrelevant/context, and Daily Signal durable gates remained closed.
- Report: `thesis_red_team`, persisted with exactly 16 sections; hypothesis failure-case provenance remained report-only and bounded to candidate/provider/title/date metadata.
- Provider smoke: CNINFO and GDELT passed separately as non-blocking seam checks.
- Validation: focused FIX-003 suite 39/39; full `npm test` passes with 21 client tests and 563 Node tests; root typecheck, client typecheck, and client build pass.

Real product acceptance authority is the Real PiReasoningExecutor product E2E; the gate helper unit test is not treated as product acceptance.
