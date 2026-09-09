# RHL M3A-2 Valuation v1 — FIX-001 Validation Summary

Status: `FIX-001 IMPLEMENTED / CTO ACCEPTANCE PENDING`

FIX-001 preserves the accepted Valuation path: Pi/HTTP -> ResearchService ->
existing Company coverage -> AKShare -> bounded Stage A -> deterministic
calculation -> bounded Stage B -> proposal-referenced Gateway/Writer ->
`valuation` ResearchReport. It closes cross-run Claim slot stability using the
existing Claim type, Company subject, structured metric, and structured period;
separates actual Source retrieval time from historical valuation context;
stabilizes evidence-snapshot Source identity; and keeps unused `companyBasic`
telemetry out of durable evidence.

The focused Valuation suite passes `78/78`, including executable tests for
cross-run slot/source identity, Source retrieval time, exact structured values,
numeric statement authority, accepted-only dependencies, local-field stripping,
zero-durable evidence, bounded Stage A repair, unauthorized arithmetic,
forged Stage B refs, max-three proposals, actual Pi tool routing, and the
actual HTTP route. The row-level matrix contains one executable PASS row per
test and no source-text-only routing proof.

The Real Pi harness uses the actual `PiReasoningExecutor` with model
`zhipu-openapi/glm-5.3-flash`, deterministic `NOW=2026-09-09T00:00:00.000Z`
and `AS_OF=2026-09-08T00:00:00.000Z`, a fresh Schema 0.4 / Storage 1 Knowledge
Base, and deterministic AKShare fixtures. It classified `EXECUTED / PASS GATE`
with process exit `0`: the gate proved a real `PiReasoningExecutor` and
`pi-coding-agent` runtime; Stage A and B called/validated/applied without fallback
or repair, PE selected from eligible methods, 3 calculated scenarios, 9
sensitivity cells, matched deterministic recompute, 3 model-derived sections,
1 accepted durable proposal, baseline/final entity counts `1/1`, Source delta
`+1`, Claim delta `+1`, and no canonicalized unused companyBasic Source.

The separate non-blocking AKShare smoke classified `PROVIDER_TRANSPORT_BLOCKED`:
companyBasic and historical market transport failed at the observed Eastmoney
proxy boundary, while financialData transport succeeded with an empty payload.
This remains separate from deterministic fixture and Real Pi product evidence.

No Schema, Gateway, Writer, Provider Framework, generic valuation framework,
DCF, consensus integration, canonical Valuation object, M3A-3, M3A-4, M3B,
Theme, frontend, scheduler, queue, or user PDF change is part of this task.
