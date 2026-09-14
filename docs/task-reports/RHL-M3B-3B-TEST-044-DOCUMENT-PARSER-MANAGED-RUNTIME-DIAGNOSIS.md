# RHL-M3B-3B-TEST-044 — Managed Docling parser runtime diagnosis

## Result

`COMPLETED`. TEST-043 is accepted as completed with `tests_status=FAILED` because its own report records the unrelated historical `VAL-HTTP-001` valuation timing/state assertion as the sole npm failure. Its authoritative classification remains `PRODUCT_QUALITY_BLOCKED_BY_EVIDENCE`.

The TEST-043 Workflow result is trusted: status `blocked`, two acquisition waves, zero Gateway submissions, zero canonical revision delta, and mandatory Industry Definition unavailable. IMPL-042 source acquisition remains accepted: all three approved MIIT PCB anchors were discovered and fetched with deterministic MIIT identities, tier 1, official MIIT URLs, and as-of eligibility. The two PDF normalization failures remain the smallest blocker and were not rerun against MIIT.

## Diagnostic observations

The production contract is unchanged and was inspected from source: Windows defaults to `.researchhub-document-parser/venv/Scripts/python.exe`, other platforms to `.researchhub-document-parser/venv/bin/python`; artifacts default to `.researchhub-document-parser/models`; the bridge is `plugins/document/parsers/docling/bridge/docling_bridge.py`; the bridge requires the artifacts directory and forces `HF_HUB_OFFLINE=1`.

On this Windows machine:

- Neither `RESEARCHHUB_PYTHON_EXECUTABLE` nor `RESEARCHHUB_DOCLING_ARTIFACTS_PATH` is configured.
- The default managed interpreter is absent, and the default managed artifacts directory is absent, non-directory, and empty (`entryCount=0`).
- The production bridge exists and is readable.
- Both bounded system candidates, `python` and `py -3`, executed successfully as Python `3.12.10`; both expose `venv` and `pip`, and both import Docling `2.116.0`.
- No document-parser bootstrap command exists in `package.json`, and no document-parser setup/bootstrap script exists under `scripts/`.
- The bridge smoke parse was skipped because the required managed interpreter and artifacts directory were unavailable. No MIIT HTTP request, model call, installation, download, virtual-environment creation, or persistent environment change occurred.

The sanitized machine evidence is [RHL_M3B_DOCUMENT_PARSER_MANAGED_RUNTIME_DIAGNOSIS.json](../../tests/validation/evidence/RHL_M3B_DOCUMENT_PARSER_MANAGED_RUNTIME_DIAGNOSIS.json).

## Classification

`REPOSITORY_BOOTSTRAP_GAP`.

This is the required precedence: the production managed interpreter is missing, a usable local Python prerequisite exists with `venv` and `pip`, and the repository has no bootstrap mechanism. It is not `EXTERNAL_PYTHON_RUNTIME_REQUIRED`; it is not a Docling parser logic defect; and the absent managed artifacts are not independently classified as the narrower artifact gap because the selected production interpreter is absent first.

## Validation

- `npx tsx --test tests/validation/document-parser-managed-runtime-diagnosis.test.ts` — passed, 3/3.
- `node --import tsx tests/validation/document-parser-managed-runtime-diagnosis.ts` — completed and wrote sanitized evidence.
- `npx tsx --test tests/plugins/document/docling-contract.test.ts` — passed, 2/2.
- `npx tsx --test tests/plugins/document/input-resolver.test.ts` — passed, 3/3.
- `npm run typecheck` — passed.
- `npm test` — passed in this run, 932/932; TEST-043's historical unrelated `VAL-HTTP-001` failure was not modified.
- `git diff --check` — passed.

The focused tests cover all six classifications, bootstrap-gap precedence, the narrower external-runtime rule, and privacy regression. Persisted evidence contains no absolute paths, profile paths, environment values, credentials, tokens, raw environment dump, or fixture text.

## Recommended next step

Implement one idempotent project-local managed Docling environment bootstrap/preflight mechanism, without changing parser semantics or source architecture; then rerun the smallest approved MIIT PDF normalization test.
