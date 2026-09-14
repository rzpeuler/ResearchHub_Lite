# RHL-M3B-3B-FIX-046 - Document Parser Bootstrap Partial-Runtime Recovery

## Outcome

FIX-046 is implemented within the approved scope. The IMPL-045 acceptance finding was a deterministic promotion defect: setup removed only the managed Python executable, then attempted to rename the staged venv over the existing final `venv` directory. When an incomplete final venv directory existed, directory rename could fail because the destination directory still existed.

The adjacent `scripts/document-parser-runtime.d.ts` file is accepted as a reasonable non-protected change. It accurately declares the corrected project-local bootstrap API and does not alter runtime behavior or architecture.

## Recovery and promotion semantics

- The default command and `--check` remain read-only preflight paths.
- A verified `READY` runtime returns before venv creation, pip, model download, staging, or promotion.
- Setup keeps the accepted managed locations: `.researchhub-document-parser/venv` and `.researchhub-document-parser/models`, with Docling `2.116.0` and model families `layout` and `tableformer` unchanged.
- A unique staging directory is created under `.researchhub-document-parser/.staging`. Venv creation, pinned dependency installation, staged dependency/version probing, model download, non-empty artifact validation, and the production bridge smoke all complete before final mutation.
- The staged bridge smoke explicitly runs with `HF_HUB_OFFLINE=1`.
- Promotion uses bounded backup-and-replace semantics. Existing final `venv` and `models` directories are moved into the current invocation's staging backup, staged directories are moved into the final locations, and final `readyState` is rerun.
- Promotion and final verification failures return the bounded `PROMOTION_FAILED` reason. Staged components are removed and prior components are restored when possible; the next explicit setup remains able to retry.
- The current invocation's staging/backup root is removed in `finally`. Pre-existing staging is never inspected as the production runtime and cannot make `READY` true.
- `bootstrapPlan` now takes an explicit or semantic base-Python candidate for venv creation; it no longer claims that the not-yet-created managed Python creates its own venv.

## Deterministic test matrix

The runtime test suite covers:

- bounded base-Python absence, venv creation, pip, model download, staged bridge, promotion, and final verification failures;
- incomplete final venv recovery when the managed Python is absent;
- recovery when managed Docling is missing;
- recovery when final models are missing;
- rejection of arbitrary non-empty models when bridge smoke fails;
- verified READY repeated setup as a zero-mutation path;
- offline staged bridge smoke;
- failed staging preserving the existing final runtime;
- failed promotion rollback and successful subsequent setup recovery;
- stale/partial staging ignored by readiness;
- no promotion before staged bridge smoke succeeds; and
- bounded privacy-safe reasons with no raw stderr or profile-path leakage.

## Modified files

- `scripts/document-parser-runtime.mjs`
- `scripts/document-parser-runtime.d.ts` (accepted adjacent IMPL-045 declaration file)
- `tests/scripts/document-parser-runtime.test.ts`
- this report

No out-of-scope production, governance, architecture, validation, historical evidence, or protected files were modified.

## Validation

- `node scripts/document-parser-runtime.mjs --check`: PASS; returned `MANAGED_PYTHON_MISSING` without creating a runtime.
- `npx tsx --test tests/scripts/document-parser-runtime.test.ts`: PASS, 19/19.
- Combined focused command `npx tsx --test tests/scripts/document-parser-runtime.test.ts tests/plugins/document/docling-contract.test.ts tests/plugins/document/input-resolver.test.ts`: PASS, 24/24.
- `npm run typecheck`: PASS.
- `git diff --check`: PASS.
- `npm test`: client tests PASS (21/21); Node suite completed with 931 passed and one pre-existing `VAL-HTTP-001 HTTP valuation route starts authoritative Workflow` failure. The historical test and its implementation path were not modified.

## Privacy and execution boundary

Returned setup reasons are fixed bounded categories. No raw command stderr, absolute user-profile paths, credentials, tokens, proxy values, environment dumps, or installer secrets are returned. All bootstrap tests use injected command execution and temporary filesystem fixtures. No real document-parser setup, Python package installation, model artifact download, MIIT request, Industry product-quality Workflow, commit, or push was performed.

## Recommended next step

Run `npm run document-parser:setup` once under controlled conditions, followed by the smallest live MIIT PDF normalization smoke; do not run the complete Industry product-quality Workflow yet.
