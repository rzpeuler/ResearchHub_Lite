# RHL-M3B-3B-IMPL-045 — Document Parser Managed Bootstrap

## Outcome

TEST-044 is accepted as authoritative. Its final classification, `REPOSITORY_BOOTSTRAP_GAP`, established that the production bridge was present while the default managed interpreter and model directory were absent; bounded system Python candidates were usable. This implementation adds the missing project-local bootstrap without changing parser, bridge, acquisition, Workflow, or Knowledge semantics.

## Design

`scripts/document-parser-runtime.mjs` is the sole entrypoint. `--check` is the default, read-only preflight; `--setup` is explicit and mutating. Automatic base-Python discovery is bounded to `py -3`/`python` on Windows and `python3`/`python` elsewhere, with an optional explicit `--python` candidate. The managed runtime remains `.researchhub-document-parser/venv`, and artifacts remain `.researchhub-document-parser/models`.

Setup stages venv and models under the ignored runtime directory, installs the tracked `docling==2.116.0` requirement, requests only Docling `layout` and `tableformer`, and runs the unchanged production bridge against a temporary tiny PDF with `HF_HUB_OFFLINE=1`. Promotion occurs only after the staged bridge smoke succeeds. A ready runtime is not removed after a failed refresh; incomplete staging is cleaned and cannot be mistaken for the final runtime. Repeated setup on a verified runtime performs no installation or download.

Preflight reports bounded JSON states: `READY`, `MANAGED_PYTHON_MISSING`, `DOCLING_DEPENDENCY_MISSING`, `ARTIFACTS_MISSING`, `BRIDGE_SMOKE_FAILED`, or `INCONCLUSIVE`. It never prints absolute paths, environment values, credentials, tokens, or raw command output.

## Modified files

- `.gitignore`
- `config/document-parser/requirements.txt`
- `scripts/document-parser-runtime.mjs`
- `scripts/document-parser-runtime.d.ts`
- `package.json`
- `tests/scripts/document-parser-runtime.test.ts`
- this report

No real package installation, model download, MIIT request, LLM call, commit, or push was performed. The required validation is offline and uses injected command execution for bootstrap tests.

## Validation

Validation evidence:

- `node scripts/document-parser-runtime.mjs --check`: PASS as a read-only preflight; reported `MANAGED_PYTHON_MISSING` because setup was intentionally not run.
- `npx tsx --test tests/scripts/document-parser-runtime.test.ts tests/plugins/document/docling-contract.test.ts tests/plugins/document/input-resolver.test.ts`: PASS, 10/10.
- `npm run typecheck`: PASS.
- `git diff --check`: PASS.
- `npm test`: client suite passed (4 files, 21 tests); the complete Node suite reached the pre-existing `VAL-HTTP-001 HTTP valuation route starts authoritative Workflow` failure and exceeded the execution time budget before a clean final exit. No historical test or unrelated production path was changed.

No real installation or model download occurred. The implementation specifically covers bounded candidate selection, dependency pinning, isolated venv planning, model-family restriction, read-only check mode, explicit setup mode, bounded failures, and privacy behavior.

## Recommended next step

Run one controlled execution of `npm run document-parser:setup`, then the smallest MIIT PDF normalization smoke test, before rerunning the complete Industry product-quality Workflow.
