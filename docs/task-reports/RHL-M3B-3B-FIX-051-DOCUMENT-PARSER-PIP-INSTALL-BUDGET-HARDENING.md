# RHL-M3B-3B-FIX-051 - Harden managed Docling pip install budget

## Acceptance of TEST-050

TEST-050 is accepted as COMPLETED with `tests_status=FAILED` as evidence-only. Its authoritative final classification is `DOCUMENT_PARSER_SETUP_TIMED_OUT`.

The TEST-050 repository scope is accepted: GitHub shows it is exactly one commit after FIX-049, with base `da2a80f9bfc363dcbb7f8ce9115564f8bfabdfd8` and head `89f1bc2ee18bea327adbaf687a3cd1f193780ffa`. The truncated `baseCommit` value recorded in the historical TEST-050 report/evidence is a non-semantic metadata typo. It is not ancestry evidence and the historical report, runner, and evidence were not modified.

The live TEST-050 facts remain authoritative: preflight was `MANAGED_PYTHON_MISSING`; setup was invoked exactly once; `VENV_CREATE` completed; `PIP_INSTALL` became active and terminated with `PIP_INSTALL_TIMEOUT`; post-setup preflight remained `MANAGED_PYTHON_MISSING`; and MIIT fetch/normalization were not attempted. FIX-049 telemetry was proven in that run: `PIP_INSTALL` was recorded as `TIMED_OUT`, `lastCompletedStage` was `VENV_CREATE`, and the reason was `PIP_INSTALL_TIMEOUT`.

TEST-050 validation evidence is accepted: deterministic TEST-050 tests 6/6, Docling contract 2/2, MIIT acquisition 12/12, typecheck, full `npm test` 953/953, and `git diff --check` passed. No real managed setup, pip install, model download, or MIIT fetch was performed for FIX-051.

## Implementation

Only the pip-install stage was hardened. The default outer `PIP_INSTALL` budget is now 1,800,000 ms (30 minutes); the existing finite, programmatic `pipInstall` override remains authoritative. Other stage defaults are unchanged.

The managed pip command still installs from `config/document-parser/requirements.txt` and now includes `--no-input`, `--progress-bar off`, `--timeout 30`, `--retries 2`, `--prefer-binary`, and the retained `--disable-pip-version-check`. No index, proxy, credential, trusted-host, dependency-closure, or package-management architecture changes were made. In particular, no `--no-deps` or `--only-binary` option was added.

FIX-049 subprocess hard-timeout and forced-termination behavior, runtime-only atomic telemetry, fixed stage vocabulary, RUNNING-before-command ordering, timeout/failure distinction, staged-runtime rollback/promotion rules, READY no-op behavior, managed paths, Docling pin `2.116.0`, model families `layout` and `tableformer`, and privacy boundaries are preserved. A pip timeout or ordinary pip failure still stops before dependency verification, model download, bridge smoke, and promotion.

## Modified files

- `scripts/document-parser-runtime.mjs` - 30-minute pip budget and bounded non-interactive/network flags shared by the plan and managed invocation.
- `tests/scripts/document-parser-runtime.test.ts` - deterministic coverage for defaults, flags, forbidden flags, override behavior, timeout telemetry/ordering, downstream stop, and failure classification.
- `docs/task-reports/RHL-M3B-3B-FIX-051-DOCUMENT-PARSER-PIP-INSTALL-BUDGET-HARDENING.md` - this report.

`scripts/document-parser-runtime.d.ts` required no change because its existing `SetupTimeouts.pipInstall` typing already exposes the override seam accurately.

## Validation

- `node scripts/document-parser-runtime.mjs --check` - PASSED; expected non-ready state `MANAGED_PYTHON_MISSING`.
- `npx tsx --test tests/scripts/document-parser-runtime.test.ts` - PASSED, 36/36.
- `npx tsx --test tests/plugins/document/docling-contract.test.ts` - PASSED, 2/2.
- `npx tsx --test tests/plugins/document/input-resolver.test.ts` - PASSED, 3/3.
- `npm run typecheck` - PASSED.
- `npm test` - FAILED, 952/953. The one failure is the pre-existing `VAL-HTTP-001` test in `tests/app/runtime/valuation-route.test.ts`; it was not investigated or modified, per task scope.
- `git diff --check` - PASSED; only normal LF-to-CRLF working-copy warnings were emitted.

Privacy regression coverage remains in the runtime test suite: captured CLI/result/telemetry data is bounded and does not persist raw output, absolute user paths, environment or proxy values, credentials/tokens, package-index URLs, cache paths, or dependency inventories.

Recommended next step: perform one controlled document-parser setup attempt using the hardened pip stage and then, only if READY, execute the single approved MIIT PCB definition PDF normalization smoke before any complete Industry product-quality Workflow rerun.
