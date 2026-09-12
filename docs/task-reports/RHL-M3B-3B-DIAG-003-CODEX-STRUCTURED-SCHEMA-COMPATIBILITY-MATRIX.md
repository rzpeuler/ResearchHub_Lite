# RHL-M3B-3B-DIAG-003 — Codex Structured Schema Compatibility Matrix

Status: COMPLETED (TEST evidence; M3B-3B and PCB semantic compatibility remain NOT PASS)

## Acceptance boundary

FIX-005 is accepted only for diagnostic hardening. Its recorded PCB attempt remains: `processStarted: true`, `exitState: nonzero_exit`, `semanticResultAvailable: false`, `failureClass: unknown_nonzero_exit`, one real model call, unchanged request fingerprints, and no schema-correction authorization. The PCB Manufacturing request was not rerun in DIAG-003.

## Matrix execution

The existing production Codex CLI executor and Pi completion boundary were used with `codex exec`, model `gpt-5.6-luna`, reasoning effort `medium`, ephemeral read-only sandbox, stdin semantic context, `--output-schema`, JSON event mode, bounded output, timeout and cleanup. CLI version was `codex-cli 0.152.1`.

Probe order was `MINIMAL_STRICT_CONTROL`, `OPTIONAL_PROPERTY_PROBE`, `CURRENT_DESIGN_SCHEMA_NEUTRAL`, and conditional `STRICT_REQUIRED_DESIGN_PROBE`. The matrix stopped after Probe 1 because the neutral minimal strict control started but exited non-zero without a recognized safe failure signal.

| Probe | Attempt | Sanitized outcome |
| --- | ---: | --- |
| MINIMAL_STRICT_CONTROL | 1 | `processStarted: true`; `exitState: nonzero_exit`; `semanticResultAvailable: false`; safe ReasoningExecutor code `reasoning_execution_failed`; `failureClass: unknown_nonzero_exit`; no structured event or safe provider error code; duration 6075 ms; schema fingerprint `6403f2b1cc6b62ac`, 107 bytes; no output persisted |
| OPTIONAL_PROPERTY_PROBE | 0 | Early stop required; optional-property acceptance is unknown |
| CURRENT_DESIGN_SCHEMA_NEUTRAL | 0 | Early stop required; no parser or validator run |
| STRICT_REQUIRED_DESIGN_PROBE | 0 | Conditional probe not permitted |

Actual call count: 1. No retries were made.

## Contract metadata

The imported current Design contract was read-only and remained fingerprint-identical: source fingerprint `9854f93073c44d96` (3320 source JSON bytes). The exact current production normalizer produced fingerprint `95e315657e862a7e` and 2111 bytes, matching the accepted baseline. No test-only schema transformation was executed.

Optional-property result: unknown, not rejected or accepted by this run. Conditional strict-required finding: not applicable.

## Classification and next action

Final classification: `BACKEND_FAILURE_DIAGNOSTIC_INCONCLUSIVE`.

Next action category: `REVIEW_BACKEND_RUNTIME_FAILURE`.

The minimal control did not establish general structured-output health, so no inference about optional object properties or Design-schema compatibility is justified. No production schema-normalizer change is authorized by this evidence.

## Scope and privacy controls

No Knowledge, Source/Raw, Gateway, Writer, ResearchReport, graph, Industry request, production model-selection, or production schema-normalizer mutation occurred. No production file was modified. The offline helper computed fingerprints and sizes before real execution and recursively built any strict-required copy only as a test utility; that copy was not executed in this stopped run.

Complete prompts, outputs, schemas, stdout, stderr, JSONL, credentials, authentication data, reasoning traces, and private paths were not persisted. Evidence is in `tests/validation/evidence/RHL_M3B_CODEX_CLI_STRUCTURED_SCHEMA_COMPATIBILITY_MATRIX.json`.

## Validation evidence

Focused matrix unit tests and repository typecheck passed before the real probe. The real probe itself exited successfully as a diagnostic runner and produced the evidence artifact above; its backend failure is recorded as task evidence, not as an implementation failure.

Required validation results: the focused Codex executor tests (7/7), Industry Research Skill tests (15/15), Pi E2E gate tests (19/19), client typecheck, client build, and `git diff --check` passed. `npm run test:node` reported 706/707 passing with one unrelated timing failure in `tests/app/runtime/valuation-route.test.ts` (`running` observed where `blocked` was expected). `npm test` likewise reported 706/707 passing, with one unrelated environment-sensitive timeout-tree cleanup failure in `tests/plugins/reasoning/reasoning.test.ts` (`EBUSY` while removing a temporary directory). No task-scope test failed.
