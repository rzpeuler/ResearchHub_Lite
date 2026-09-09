# RHL M3A-4 Thesis Red Team v1 FIX-002 Evidence Summary

- Task: `RHL-PERSONAL-RESEARCH-V1-M3A-THESIS-RED-TEAM-001-FIX-002`
- Real Pi E2E: `REAL_MODEL_CONTRACT_BLOCKED`
- Model: `zhipu-openapi/glm-5.3-flash`
- Exact active Company/Thesis resolution: passed; dependency projection 3 Claims, 1 critical assumption, 1 recent Signal.
- Stage A: real model first output passed semantic validation; `fallbackUsed=false`, `validated=true`, `applied=true`, `repairAttempts=0`.
- Stage B: real model first output passed the semantic core; six proposal candidates were deterministically rejected (`proposal_0_invalid` through `proposal_5_invalid`), with no repair or semantic fallback; `fallbackUsed=false`, `validated=true`, `applied=true`.
- No synthetic semantic fallback was used. No evidence, challenge, interpretation, verdict, or proposal was fabricated after model output processing.
- Durable write gate: closed because the real model omitted a failure case and produced no accepted durable proposal; canonical Source/Claim delta 0/0.
- Actual persisted Thesis hash and lifecycle were unchanged; Company hash was unchanged.
- Daily Signal, irrelevant source, and unknown-date source were not canonicalized.
- Report: `thesis_red_team`, exactly 16 sections, persisted as a blocked research-gap report.
- Raw bodies and secrets: excluded from evidence.
- Validation: full `npm test` passed, 555/555 tests; `npm run typecheck`, `npm run client:typecheck`, and `npm run client:build` passed.
- FIX-002 focused regressions: 31/31 passed, including single-source strength, unrelated-source rejection, irrelevant/context/unknown-date durable gates, invalidation binding, and existing-assumption field preservation.

This is honest blocked evidence, not a real-model acceptance pass. Final task status remains `IMPLEMENTED / CTO ACCEPTANCE PENDING`.
