# RHL M3A-2 Valuation v1 — Validation Summary

Status: `IMPLEMENTED / CTO ACCEPTANCE PENDING`

The Valuation vertical is implemented on the frozen Research Coverage
architecture. It routes through `analyze_valuation` /
`POST /api/production/analyze-valuation`, resolves one exact existing Company,
calls the existing AKShare adapter's three structured methods, performs FY/PIT
normalization and method eligibility in code, invokes bounded Stage A and Stage
B Pi reasoning, calculates Bear/Base/Bull targets plus a 3x3 sensitivity matrix
deterministically, and submits only validated local proposals through the
existing Gateway and Writer path.

The focused matrix `V1–V63` passed `63/63`. The real Pi harness used the current
production model `zhipu-openapi/glm-5.3-flash`, the actual `PiReasoningExecutor`,
a fresh Schema 0.4 / Storage Format 1 Knowledge Base, deterministic AKShare
fixtures, seeded Company/Thesis/Assumption/Source coverage, and exited `0` with
`EXECUTED_PASS`. Stage A and Stage B were both validated and applied without
fallback or repair; the run produced 3 scenarios, 9 sensitivity cells, and 2
accepted durable claims while keeping one Company entity.

The non-blocking provider smoke reached the installed AKShare adapter but was
classified `PROVIDER_TRANSPORT_BLOCKED`: companyBasic and market transport were
blocked by the observed Eastmoney proxy disconnect, while financialData
transport returned an empty payload. This is recorded separately from product
usability and does not invalidate deterministic fixture or real-Pi evidence.

No Schema, Gateway, Writer, provider framework, generic layer, DCF, consensus,
canonical Valuation object, M3A-3, M3A-4, or user PDF change is part of this
task. CTO acceptance is still required before changing the governance state to
PASS / CLOSED.
