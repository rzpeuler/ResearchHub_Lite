# TEST-040 — Direct Industry product-quality review after FIX-039

FIX-039 was treated as accepted, including its five deterministic validation-file updates. The unrelated VAL-HTTP-001 timing/state failure was not changed. TEST-038 remains immutable and is the comparison point: its direct Workflow reached two acquisition waves but mandatory Industry Definition remained unavailable, with Invalid Research Gap degradation.

## Execution

- Base commit: `add57c0ece6460658ee3d43540cdf8dda8b6e393`
- Target: PCB Manufacturing; aliases Printed Circuit Board and 印制电路板; as-of `2026-09-14T00:00:00.000Z`.
- One direct `runIndustryDeepResearch` execution was started with the production seven-provider order: official disclosure, GDELT, MIIT, Gov.cn, Eastmoney, CPCA, and AKShare backed by `AkshareDataAdapter`.
- Codex preflight passed: environment/native executable, `codex-cli 0.154.0`, version and `codex exec --help` available.
- Production selection was codex-cli, GPT-5.6 Luna, medium reasoning effort, without fallback.
- The live run made model/provider calls and returned provider/reasoning telemetry, but the test audit wrapper then failed while assembling the sanitized result (`numericalAudit is not defined`). No Workflow rerun was performed.

## Observed live evidence

GDELT returned HTTP 429, Eastmoney reported `fetch failed`, and AKShare reported its external Python/AKShare command failure. CPCA returned normalized material across both acquisition waves. The design and all eight module identities returned once; no observed identity exceeded the two-call limit and no captured model result contained an Invalid Research Gap marker. Because the wrapper failed before retaining the authoritative `IndustryDeepResearchResult`, mandatory Industry Definition, canonical invariants, and product dimensions cannot be asserted from this run.

The retained machine-readable evidence is [RHL_M3B_INDUSTRY_PRODUCT_QUALITY_DIRECT_PUBLIC_PORTFOLIO_AFTER_GAPID_FIX.json](../../tests/validation/evidence/RHL_M3B_INDUSTRY_PRODUCT_QUALITY_DIRECT_PUBLIC_PORTFOLIO_AFTER_GAPID_FIX.json). The report snapshot is explicitly not produced because no trustworthy report was persisted.

## Product-quality classification

`PRODUCT_QUALITY_LIVE_INCONCLUSIVE`

This classification is caused by the deterministic TEST-040 audit-wrapper failure, not by a production defect claim and not by the mere need for bounded repair. The run cannot support READY, FUNCTIONAL_BUT_EVIDENCE_THIN, or BLOCKED_BY_EVIDENCE without its authoritative Workflow result.

## Offline validation

The companion tests cover all five classifications, repaired-versus-repeated Research Gap handling, evidence blocking, gap-cause precedence, and numerical assertion auditing. They make zero model and network calls.

Privacy checks in the retained evidence report no raw bodies, hidden reasoning, credentials, or private absolute paths.

## Validation results

- `node --import tsx tests/validation/codex-cli-windows-resolution-smoke.ts` — passed.
- TEST-040 offline tests — 7 passed.
- Industry Skill tests — 24 passed.
- Industry Workflow tests — 42 passed.
- Codex CLI plugin tests — 26 passed.
- `npm run typecheck` — passed.
- `git diff --check` — passed.
- `npm test` — 914 passed, 1 failed: the accepted unrelated `VAL-HTTP-001` valuation-route timing/state assertion (`running` versus expected `blocked`). No valuation code or test was modified.

## Recommended next step

Repair the TEST-040 result-assembly variable reference, then perform the smallest live-model/runtime follow-up permitted by the orchestrator’s one-run policy before making an M3B readiness decision.
