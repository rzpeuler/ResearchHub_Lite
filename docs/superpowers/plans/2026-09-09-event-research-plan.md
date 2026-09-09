# Personal Research v1 M3A-3 Event Research Implementation Plan

Base: `main` at `e8bdff39dbbd54b12ba162e3f054734d73beeb80`.
Branch: `codex/personal-research-v1-event-research`.

## Task 1: contracts and Daily Signal bridge

Files: `plugins/reasoning/contracts.ts`,
`plugins/daily-intelligence/contracts.ts`,
`plugins/daily-intelligence/signal-store.ts`, and
`app/services/contracts.ts`.

Add exactly `event_evidence_assessment` and
`event_research_synthesis`; add exact `getById` behavior; define narrow Event
Anchor/Input and application result contracts. Preserve existing Daily
append/list behavior and public compatibility.

Validation: contract/type checks and focused Daily Signal regression.

## Task 2: Event Research Skill

Files: new `skills/event-research/` files.

Implement bounded Stage A and Stage B contracts, safe parsing/validation,
one-repair telemetry, impact enums, structured assumption update rules,
numeric protection, and deterministic proposal/reference helpers. The Skill
owns semantic methodology; code remains authoritative for dates, verification,
identity, arithmetic, and admissibility.

Validation: pure contract and skill tests for forged refs, invalid enums,
repair bounds, impact requirements, and proposal bounds.

## Task 3: Event Research Workflow

Files: new `workflows/event-research/` files.

Implement exact Company resolution before providers/reasoning, anchor
resolution, deterministic fingerprint/date, targeted CNINFO/GDELT acquisition
with point-in-time and source caps, Existing Knowledge projection, Stage A and
deterministic verification, Stage B impact analysis, durable proposal
narrowing, Gateway/Writer submission, 16-section report generation, fallback,
cancellation, and telemetry. Reuse existing acquisition interfaces and
canonical mutation path; do not add generic framework or provider registry.

Validation: executable E1-E80 workflow tests, including replay slot stability,
zero-proposal evidence narrowing, provenance, and Daily Intelligence boundary.

## Task 4: Application/runtime composition

Files: `app/services/research-service.ts`, `app/pi/tools.ts`,
`app/runtime/application-runtime.ts`, `app/runtime/server.ts`, and narrow
runtime contracts/tests as required by existing patterns.

Register `startEventResearch`, Pi `research_event`, and the authoritative HTTP
event action. Preserve cancellation, safe request parsing, existing route
aliases/conventions, and shared service composition.

Validation: E81-E83 route/tool/service tests plus application typecheck/build.

## Task 5: architecture, provider smoke, Real Pi, evidence, governance

Files: the Event Research architecture document, focused tests and validation
harness/evidence, and the three governance documents.

Add executable E84-E88 regressions, the Real Pi harness and gate helper/tests,
the non-blocking CNINFO/GDELT provider smoke, row-level matrix and evidence
artifacts. Record `IMPLEMENTED / CTO ACCEPTANCE PENDING`; do not mark M3A-3
closed. Run the required full validation commands, then independently review
the complete branch for scope and frozen-architecture conformance.

## Integration order and review gates

Tasks 1 and 2 have disjoint write sets and may be implemented independently.
Task 3 follows their contracts. Task 4 follows Task 3's public workflow
surface. Task 5 follows all product code.

Each implementation task receives a spec-compliance review followed by a
code-quality review. Any finding is fixed and reviewed again before the next
task. Final integration verifies no forbidden files changed, the protected PDF
is unchanged and untracked, `git diff --check` passes, and the branch contains
the required evidence without claiming a false Real Pi pass.
