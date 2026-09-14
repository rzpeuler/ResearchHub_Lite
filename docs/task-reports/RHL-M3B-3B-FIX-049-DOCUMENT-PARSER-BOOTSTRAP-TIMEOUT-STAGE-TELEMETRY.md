# RHL-M3B-3B-FIX-049 — Document Parser Bootstrap Timeout and Stage Telemetry

## Outcome

FIX-049 is implemented within the approved scope. TEST-048 is accepted as completed evidence with `tests_status=FAILED` and final classification `SETUP_STALL_BOOTSTRAP_TIMEOUT_OBSERVABILITY_GAP`.

TEST-048 remains authoritative: it was exactly one commit ahead of TEST-047 and contained only its runner, deterministic regression, sanitized evidence, and report. One stale staging run had a staged venv and staged Python 3.12.10 with venv and pip available, but Docling was not importable and staged models were absent. The interrupted setup boundary is therefore `PIP_STAGE`. The bounded pip-index probe was inconclusive (`UNKNOWN`), while the HTTPS PyPI metadata probe for the pinned package returned HTTP 200; no external PyPI outage was declared.

The repository-controlled gap was `commandHardTimeoutPresent=false` and `stageTelemetryPresent=false`. FIX-049 adds both without changing parser semantics, dependency/model policy, acquisition architecture, or managed runtime locations. Docling remains pinned to 2.116.0; model families remain `layout` and `tableformer`; `.researchhub-document-parser/venv` and `.researchhub-document-parser/models` remain the managed locations.

## Implementation

- Every external preflight/setup/final-verification subprocess receives a finite timeout through the command runner.
- Default budgets are 30 seconds for Python/probe operations, 2 minutes for venv creation, 10 minutes for pip installation, 15 minutes for model download, and 3 minutes for bridge/final verification.
- Timeout values are injectable through the programmatic `setup({ timeouts })` option only; no persistent environment-variable configuration was added.
- Timed-out children are terminated and receive a 250 ms forced-termination fallback. The command promise always resolves with `timedOut: true`; raw output is not returned by setup results or persisted telemetry.
- Timeout reasons include `BASE_PYTHON_PROBE_TIMEOUT`, `VENV_CREATION_TIMEOUT`, `PIP_INSTALL_TIMEOUT`, `DEPENDENCY_VERIFY_TIMEOUT`, `MODEL_DOWNLOAD_TIMEOUT`, `BRIDGE_SMOKE_TIMEOUT`, and `FINAL_VERIFICATION_TIMEOUT`.
- Existing non-timeout reasons remain bounded, including `BASE_PYTHON_MISSING`, `VENV_CREATION_FAILED`, `PIP_INSTALL_FAILED`, `MODEL_DOWNLOAD_FAILED`, `BRIDGE_SMOKE_FAILED`, and `PROMOTION_FAILED`.

Telemetry is runtime-only at `.researchhub-document-parser/setup-state.json`. It is atomically replaced and contains only `schemaVersion`, opaque `attemptId`, fixed-vocabulary `stage`, bounded `status`, `lastCompletedStage`, bounded `reason`, elapsed-time bucket, and `updatedAt`. Stages are `PRECHECK`, `BASE_PYTHON_PROBE`, `VENV_CREATE`, `PIP_INSTALL`, `DEPENDENCY_VERIFY`, `MODEL_DOWNLOAD`, `BRIDGE_SMOKE`, `PROMOTION`, `FINAL_VERIFY`, and `READY`. Setup writes `RUNNING` before each stage, records `SUCCEEDED` before entering the next stage, records `FAILED` or `TIMED_OUT` on bounded failure, and records `READY/SUCCEEDED` only after complete verification. Preflight and `--check` remain filesystem-read-only and do not create telemetry. A READY no-op setup does not reinstall dependencies or redownload models.

FIX-046 staging, backup, rollback, stale-staging handling, offline bridge smoke (`HF_HUB_OFFLINE=1`), and promotion-after-verification semantics are preserved. A timeout before promotion leaves the existing final runtime untouched; final-verification failure or timeout rolls back the promoted staged runtime.

## Modified files

- `scripts/document-parser-runtime.mjs`
- `scripts/document-parser-runtime.d.ts`
- `tests/scripts/document-parser-runtime.test.ts`
- `docs/task-reports/RHL-M3B-3B-FIX-049-DOCUMENT-PARSER-BOOTSTRAP-TIMEOUT-STAGE-TELEMETRY.md`

No adjacent files were required. No governance, architecture, application, plugin, skill, workflow, knowledge, client, configuration, package, protected PDF, or managed runtime files were modified.

## Deterministic test matrix

The focused suite covers finite timeout injection for every subprocess, a harmless local real-process timeout, base probe/venv/pip/dependency/model/bridge/final-verification timeout classification, downstream-stage stop conditions, telemetry RUNNING-before-command ordering, `lastCompletedStage` ordering, timeout telemetry, valid RUNNING state after simulated external interruption, READY telemetry, READY no-op behavior, read-only preflight/`--check`, privacy-safe outputs, staged bridge offline behavior, and FIX-046 promotion/rollback/retry behavior.

## Validation

- `npx tsx --test tests/scripts/document-parser-runtime.test.ts` — PASS, 33 tests.
- `npx tsx --test tests/plugins/document/docling-contract.test.ts` — PASS, 2 tests.
- `npx tsx --test tests/plugins/document/input-resolver.test.ts` — PASS, 3 tests.
- `npm run typecheck` — PASS.
- `npm test` — PASS, 947 tests.
- `git diff --check` — PASS.
- `node scripts/document-parser-runtime.mjs --check` — expected non-zero read-only result: `MANAGED_PYTHON_MISSING`; no telemetry or managed runtime mutation occurred.

Privacy checks passed: telemetry and setup result objects contain no absolute paths, staging paths, executable paths, command arguments, raw command output, environment/proxy values, credentials, tokens, package indexes/cache paths, or model inventories. No real managed Docling setup, package installation, model download, MIIT PDF fetch, Industry Workflow, Codex CLI, Pi, or LLM call occurred during FIX-049.

## Recommended next step

Rerun one controlled `document-parser:setup` attempt followed by the single approved MIIT PCB definition PDF normalization smoke, using the new timeout and telemetry evidence and still without running the complete Industry product-quality Workflow.
