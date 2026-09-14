# RHL-M3B-3B-TEST-048 — Controlled Docling setup stall stage diagnosis

TEST-047 is accepted as `COMPLETED` with `tests_status=FAILED` and final classification `DOCUMENT_PARSER_SMOKE_INCONCLUSIVE`. Its single controlled setup was interrupted while the pre- and post-interruption readiness state remained `MANAGED_PYTHON_MISSING`; no MIIT PDF fetch or normalization was attempted. `EXTERNAL_SETUP_STALLED` is a TEST-only recovery value, not native bootstrap evidence, so it is not treated as the root cause.

The ordinary non-mutating check equivalent returned `MANAGED_PYTHON_MISSING` with all bounded readiness fields false. Final runtime state had no final venv, managed Python, or models; the ignored staging parent existed with one stale run and no backup state. The most recent stale run had staged venv and Python, but no staged models. Its bounded Python probe reported Python 3.12.10, venv and pip available, and pinned Docling not importable. This directly localizes the interruption to `PIP_STAGE` under the approved conservative rules.

Two bounded package availability checks were performed because the localized stage was PIP: the system-Python pip index query failed with category `UNKNOWN`, while the HTTPS PyPI metadata request succeeded with HTTP 200. The evidence therefore does not independently prove a package-index/network outage. No package or model was installed or downloaded.

Bootstrap source audit found `commandHardTimeoutPresent=false` and `stageTelemetryPresent=false`. Combined with the observed external subprocess boundary and the absence of a proven package-index outage, the exact final classification is **`SETUP_STALL_BOOTSTRAP_TIMEOUT_OBSERVABILITY_GAP`**. This does not claim that the missing timeout caused TEST-047; it identifies the smallest repository-controlled gap needed to safely distinguish a long dependency operation from an uncontrolled stall.

Validation: the deterministic TEST-048 regression passed (10 tests); `npm run typecheck` passed; the diagnostic runner wrote the machine evidence; `npm run document-parser:check` was run as the required ordinary check and remains non-ready because the managed runtime is absent; `git diff --check` was run. No production, bootstrap, governance, architecture, MIIT, or ignored runtime state was modified.

Privacy review: persisted evidence contains only bounded booleans, counts, synthetic stale ordinals, candidate labels, version/status fields, elapsed buckets, safe error categories, and classification. It contains no absolute paths, user-profile paths, raw command output, environment/proxy values, credentials/tokens, package inventories, model contents, or document contents.

Recommended next step: one narrow IMPLEMENTATION adding bounded per-stage timeouts and safe stage telemetry to the existing bootstrap, without changing parser semantics.
