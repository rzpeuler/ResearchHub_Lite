# RHL-M3B-3B-TEST-050 — Controlled Docling setup and MIIT PDF smoke after telemetry

- FIX-049 acceptance: COMPLETED; returned tests_status FAILED is retained as evidence-only and non-blocking.
- Base commit: da2a80f9bfc363dcbb7f8ce9114f8bfabdfd8.
- Pre-run state: {"finalVenvExists":false,"finalManagedPythonExists":false,"finalModelsExists":false,"finalModelsNonEmpty":false,"staleStagingCount":1,"setupTelemetryPresent":false}.
- Setup invocation count: 1; bounded result: {"status":"INCONCLUSIVE","reason":"PIP_INSTALL_TIMEOUT"}.
- Authoritative telemetry: pre=null; post={"schemaVersion":1,"stage":"PIP_INSTALL","status":"TIMED_OUT","lastCompletedStage":"VENV_CREATE","reason":"PIP_INSTALL_TIMEOUT","elapsedBucket":"GTE_120S"}.
- Post-setup readiness: MANAGED_PYTHON_MISSING.
- MIIT smoke: fetch={"attempted":false}; normalize={"attempted":false}; relevance={"pcbIdentity":false,"scopeBoundary":false}.
- Privacy review: bounded evidence contains no absolute paths, executable or staging paths, environment/proxy values, credentials, raw setup output, raw PDF bytes, normalized full text, or model inventories.
- Validation results: TEST-050 deterministic tests 6/6 passed; `npm run document-parser:check` returned the expected non-ready preflight (`MANAGED_PYTHON_MISSING`) after the timed-out run; Docling contract 2/2 passed; MIIT acquisition 12/12 passed; typecheck passed; full `npm test` passed 953/953; `git diff --check` passed.
- Tracked-file audit: TEST-050 tests, evidence, and this report only; runtime state remains ignored and unsynchronized.
- Final classification: **DOCUMENT_PARSER_SETUP_TIMED_OUT**.

Validation commands are recorded in the Luna result.

Recommended next step: perform one stage-specific follow-up for PIP_INSTALL_TIMEOUT, without changing unrelated production code.
