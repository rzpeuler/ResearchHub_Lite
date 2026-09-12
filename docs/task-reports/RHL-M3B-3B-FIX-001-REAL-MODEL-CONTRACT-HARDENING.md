# RHL-M3B-3B-FIX-001 — Real Model Contract Hardening

Status: REAL_MODEL_CONTRACT_BLOCKED / CTO REVIEW REQUIRED

## Diagnosis

The base acceptance at `5b7553353caf0450b9b5dd5917db0232d58f5ff2` is retained as valid failure evidence: actual `PiReasoningExecutor` execution began, the design operation ran twice, and the Workflow stopped before module execution, Gateway submission, canonical mutation, report persistence, graph acceptance, or replay. The accepted diagnosis was an under-specified model contract, not a guessed validator field.

## Implementation

- Added JSON-serializable structured contracts for Research Design, module analysis, and synthesis, including required fields, enums, bounds, frozen module/relation names, allowlist and local-ID rules, numeric discipline, and no-canonical-write boundaries.
- Added bounded source metadata/excerpt and Existing Knowledge projections, benign wrapper/JSON-string parsing, operation-specific instructions, and one-at-most repair with bounded prior output and diagnostics.
- Preserved the deterministic Workflow/Gateway validators and their existing rejection diagnostics; prompt contracts do not replace durable gates.
- Made Real Pi operation checks repair-aware: design 1–2, modules 8–32, synthesis 1–2, with all eight final module names still required.
- Added direct contract, wrapper, repair, and operation-count tests.

## Validation

Focused Skill and gate tests: PASS (31/31). Workflow and integration tests: PASS (41/41). `npm run typecheck`: PASS. `git diff --check`: PASS.

The actual rerun used the configured production selection path and `pi-coding-agent` runtime with `zhipu-openapi/glm-5.3-flash`. It executed the real Pi executor and made two design calls, but remained blocked before module analysis. No Gateway submission or canonical mutation occurred. The sanitized evidence is recorded in `tests/validation/evidence/RHL_M3B_INDUSTRY_RESEARCH_PI_E2E.json`.

## Remaining predicates

The real model did not produce a validated Research Design, so the eight-module, provenance, durable semantic, report, graph, and deterministic Workflow replay predicates could not be evaluated as passing. The harness now retains only validated observed candidates for acceptance reconstruction; the existing validation run still records a blocked replay because no final validated semantic bundle existed. The legacy direct Gateway replay path remains in the harness and should be replaced with the validation-only Workflow replay before CTO acceptance.

Full repository regression matrix passed: focused acceptance 72/72, `npm run test:node` 672/672, client tests 21/21, typechecks, client build, and `git diff --check`. Normal test commands remain free of automatic network dependencies.
