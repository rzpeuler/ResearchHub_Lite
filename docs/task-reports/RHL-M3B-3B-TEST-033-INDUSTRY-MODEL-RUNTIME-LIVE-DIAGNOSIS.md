# RHL-M3B-3B TEST-033 — Industry model/runtime live diagnosis

## Context and isolation

TEST-031 remains the accepted functional milestone. TEST-032 remains `PRODUCT_QUALITY_LIVE_INCONCLUSIVE`; its interruption is not treated as a production defect because the immediately preceding accepted path completed through Codex, Skill, Workflow, Gateway, Writer, and report persistence. TEST-033 exercised that same production Industry reasoning path exactly once, with public acquisition removed entirely.

The run used a fresh temporary Schema 0.4 / Storage Format 1 Knowledge Base and report directory, the frozen PCB target and `2026-09-14T00:00:00.000Z`, and one bounded in-memory normalized fixture. The fixture has public-retention-compatible rights, fixed publication time, stable candidate ID, publisher, and SHA-256 content hash; it is synthetic test material and is not market evidence.

## Preflight and runtime

The entrypoint performs shared Codex executable resolution, `codex --version`, and `codex exec --help` before model initialization. It selects the production Industry backend `codex-cli`, model `gpt-5.6-luna`, reasoning effort `medium`, with no fallback. Only sanitized preflight fields and operation lifecycle metadata are persisted. The real production `createIndustryProductionReasoningExecutor()` was wrapped at the existing test seam; prompts, outputs, hidden reasoning, stderr, and credentials were not persisted.

## Result

The machine-readable result is [RHL_M3B_INDUSTRY_MODEL_RUNTIME_LIVE_DIAGNOSIS.json](../../tests/validation/evidence/RHL_M3B_INDUSTRY_MODEL_RUNTIME_LIVE_DIAGNOSIS.json). It records exact counts for design, module analysis, and synthesis; repair inference; Workflow/module status; acquisition waves; Gateway submissions; revision delta; canonical object counts; report audit; and privacy flags.

This run's exact final classification is `MODEL_RUNTIME_EXTERNAL_INCONCLUSIVE`. Preflight passed and the real model path returned all observed operations, including bounded repairs, but the Workflow terminated before Gateway/report persistence on `V04_CANONICAL_INVALID: ... Claim structuredValue is not valid for Schema 0.4`. The smallest boundary is recorded as model-output contract validation: one live non-conforming candidate does not establish a deterministic adapter/schema contradiction. `MODEL_RUNTIME_PATH_HEALTHY` remains reserved for one Gateway submission, one bounded revision, canonical reload, and the sixteen-section `industry_research` report; only a concrete repository-controlled adapter, parser, contract, validation, lifecycle, or orchestration boundary is `MODEL_RUNTIME_PROJECT_DEFECT`.

Observed lifecycle counts were exactly design 1, module analysis 9, and synthesis 2; the ninth module call and second synthesis call were bounded repairs. The deterministic fixture acquisition wave was reached once. Gateway submissions, revision delta, canonical objects, and report sections were all zero because the run stopped at the model-output contract boundary.

## Offline validation and privacy

The deterministic offline tests make zero model and network calls. They cover completed lifecycle, external failure, concrete project defect, bounded repair followed by completion, and the fact that public-provider outcomes are not classifier inputs. The evidence contains no raw fixture body, complete prompt/output, reasoning trace, credential, token, cookie, environment dump, or private absolute path.

Validation passed: Codex Windows resolution smoke; TEST-033 offline tests 5/5; Industry Skill tests 18/18; Industry Workflow tests 40/40; `npm run typecheck`; `npm test` (879/879); and `git diff --check`. No commit or push was performed.

## Exactly one next step

Perform the smallest external/runtime follow-up supported by the sanitized failure category: inspect the Codex/Luna structured-output response for Schema 0.4 conformance, then rerun TEST-033 only if that external model/runtime condition changes; do not modify production contracts or expand sources.
