# RHL-M3B-3B-FIX-001 — Real Model Contract Hardening

Status: REAL_MODEL_CONTRACT_BLOCKED / CTO REVIEW REQUIRED

## Scope and diagnosis

The prior acceptance at `5b7553353caf0450b9b5dd5917db0232d58f5ff2` is retained as valid failure evidence: the actual `PiReasoningExecutor` invoked `industry_research_design` twice, then stopped before module execution, Gateway submission, canonical mutation, report persistence, graph acceptance, or replay. The failure was not promoted to acceptance.

The implementation finding was an under-specified real-model request contract, not an unproven guessed validator field. This change retains the frozen M3B architecture and deterministic gates. Industry reasoning now exposes structured bounded contracts and operation-specific evidence-only instructions; bounded JSON-safe context and prior-candidate repair context are supplied. The shared Industry parser is strict JSON-only, permits only the fixed benign wrapper set to bounded depth, and is reused by validation reconstruction. Existing canonical-ID, evidence, proposal-link, report-material, resolution-ownership, and durable-gate rules remain authoritative.

The validation harness now validates observed attempts in execution order and retains only the last validated design/module/synthesis candidate. Replay uses a second `ResearchService` with a deterministic validation-only executor returning those captured validated semantics; it does not call Pi or directly perform a producer-Gateway replay. Replay rejects unexpected operations/modules. Numeric audit covers structured and narrative Claim observations and persisted report sections while excluding canonical IDs, dates, A-share tickers, and structural section numbering. Persisted evidence contains only bounded summaries and sanitized metadata.

## Validation evidence

Focused Skill tests: PASS (12/12).

Workflow and gate suites at the starting baseline: PASS (39/39 and 19/19). TypeScript typecheck and `git diff --check`: PASS after the hardening changes.

The required real rerun was executed with the configured production model-selection path. Runtime metadata was `pi-coding-agent`, requested model `zhipu-openapi/glm-5.3-flash`. It made exactly two design calls and no module or synthesis calls. Final classification is `REAL_MODEL_CONTRACT_BLOCKED`; no Gateway submission, revision, canonical object, report, or graph mutation occurred. The sanitized machine evidence is [RHL_M3B_INDUSTRY_RESEARCH_PI_E2E.json](../../tests/validation/evidence/RHL_M3B_INDUSTRY_RESEARCH_PI_E2E.json).

Remaining acceptance predicates are therefore unproven/failed for this run: completed Workflow, Industry diagnosis, eight final modules, Industry Definition, one Gateway and one Writer revision, durable Claim and required Relations, canonical semantic set, persisted sixteen-section report, graph projection, and successful deterministic Workflow replay. Privacy predicates passed in the persisted evidence. This is a model-contract failure requiring CTO review, not a justification to weaken validation or expand architecture.

No commit or push was performed; synchronization remains owned by the orchestrator.
