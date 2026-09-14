# RHL-M3B-3B-TEST-038 — public-portfolio TypeError boundary diagnosis

## Result

TEST-037 is accepted as a valid `PRODUCT_QUALITY_LIVE_INCONCLUSIVE` execution. Its generic outer-catch `TypeError` is preserved as immutable historical evidence and is not treated as production-fix evidence. TEST-038 uses the direct production `runIndustryDeepResearch` path and the unchanged seven-provider composition, with fresh temporary Schema 0.4 / Storage Format 1 knowledge and report roots outside the repository.

The executable evidence is [RHL_M3B_INDUSTRY_PUBLIC_PORTFOLIO_TYPEERROR_BOUNDARY_DIAGNOSIS.json](../tests/validation/evidence/RHL_M3B_INDUSTRY_PUBLIC_PORTFOLIO_TYPEERROR_BOUNDARY_DIAGNOSIS.json). The live result, sanitized provider shape audit, exact exception message, bounded stack frames, Workflow state, canonical validation, and report state are authoritative there.

## Isolation and instrumentation

Target was PCB Manufacturing, aliases Printed Circuit Board and 印制电路板, `asOf=2026-09-14T00:00:00.000Z`, with the same eight search terms and provider order: official disclosure, GDELT, MIIT, Gov.cn, Eastmoney, CPCA, and AKShare. Backend was codex-cli, GPT-5.6 Luna, medium reasoning, without fallback. Preflight recorded only executable source/kind, version availability/version, and help availability. At most one direct live Workflow execution was attempted.

Markers cover only existing calls: preflight, both acquisition waves, provider discover/fetch/normalize, design/module/synthesis reasoning, Workflow gate, Gateway/canonical, report persistence, Workflow return, and test audit. Normalized sources record field presence/types and bounded nested shape keys only; article content and complete metadata are not retained.

## Boundary evidence

The completed live run reached design, both acquisition waves, and fourteen Codex reasoning calls, but the mandatory Industry Definition remained unavailable; Gateway and report persistence were not reached. GDELT and AKShare threw external provider errors, while Eastmoney and CPCA returned seven normalized sources. The shape audit found the production normalized `metadata` field missing on all seven returned sources; no `.some()` TypeError was reproduced, no Error stack escaped the direct Workflow, and no project-relative smallest failing frame exists. The exact result is therefore `TYPEERROR_EXTERNAL_OR_MODEL_INCONCLUSIVE`, not a production diagnosis. A stack frame is considered project evidence only when its sanitized path is repository-relative. No raw absolute path, body, token, cookie, credential, or hidden reasoning trace is persisted.

## Validation

The deterministic test covers private-path stack sanitization, provider/reasoning/Workflow/persistence/service/audit classification, and missing/wrong-shaped normalized fields. Focused diagnosis tests passed 3/3; Industry Skill tests passed 21/21; Industry Workflow tests passed 41/41; Codex CLI tests passed 25/25; the full suite passed 903/903. Typecheck initially found nullable test assertions, which were corrected; final typecheck and `git diff --check` are recorded after that correction. The live run completed with a valid diagnostic artifact but did not reach canonical persistence or report generation; this is external/model-inconclusive evidence and does not authorize a production change.

## Exactly one next step

Run exactly one bounded TEST follow-up focused on reproducing the Industry Definition reasoning/provider boundary with the existing seven-provider composition, without expanding source coverage or modifying production code.
