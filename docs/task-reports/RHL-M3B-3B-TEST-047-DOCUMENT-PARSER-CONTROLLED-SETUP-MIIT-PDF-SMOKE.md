# RHL-M3B-3B-TEST-047 — Controlled Docling setup and MIIT PDF smoke

- FIX-046 acceptance: COMPLETED; tests_status FAILED (the accepted unrelated VAL-HTTP-001 failure remains).
- Base/head: 5ded94e4c6ff7cce820521fb5182fe00cb9915d6.
- Pre-setup: MANAGED_PYTHON_MISSING; controlled setup invoked: true; setup result: INCONCLUSIVE (EXTERNAL_SETUP_STALLED).
- Post-setup: MANAGED_PYTHON_MISSING.
- Single approved MIIT PDF fetch/normalize: {"attempted":false} / {"attempted":false}.
- Final classification: **DOCUMENT_PARSER_SMOKE_INCONCLUSIVE**.

Privacy review: evidence is bounded and contains no absolute paths, environment values, package output, PDF bytes, or normalized full text. The runtime directory remains ignored and is not part of tracked changes.

Validation: deterministic TEST-047 tests, document-parser check, Docling contract, MIIT acquisition, typecheck, and diff-check were executed; their statuses are reported in the final result.

Recommended next step: diagnose the stalled pinned pip operation using bounded process/availability telemetry, without rerunning setup in TEST-047 or changing production code.
