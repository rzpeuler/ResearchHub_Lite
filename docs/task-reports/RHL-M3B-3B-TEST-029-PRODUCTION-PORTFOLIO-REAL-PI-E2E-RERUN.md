# RHL-M3B-3B-TEST-029 — Production Portfolio Real Pi E2E Rerun

## Result

Final classification: `PORTFOLIO_E2E_PRODUCTION_DEFECT`.

The fresh TEST-029 process passed the Codex preflight (`codex-cli 0.154.0`, executable discovered from the environment, `codex exec --help` available). The single authorized live production run then reached real Pi reasoning and exercised the frozen provider composition, but did not reach a valid completed terminal result: no report was persisted and the temporary Knowledge Base revision remained unchanged. This is a project-controlled production Workflow/report/Knowledge boundary failure after successful CLI unblock.

Evidence: [RHL_M3B_INDUSTRY_PRODUCTION_PORTFOLIO_REAL_PI_E2E_RERUN.json](../../tests/validation/evidence/RHL_M3B_INDUSTRY_PRODUCTION_PORTFOLIO_REAL_PI_E2E_RERUN.json).

## Baseline and composition

- Baseline: `9311c1ffde8315aee63530b78685d68a88ecaee6`.
- Target: PCB Manufacturing; aliases Printed Circuit Board and 印制电路板; as-of `2026-09-14T00:00:00.000Z`; eight frozen search terms.
- Production order observed: Official disclosure, GDELT, MIIT, Gov.cn, Eastmoney, CPCA, then AKShare through the existing ResearchService path.
- No existing canonical Knowledge Base was mutated; the run used fresh temporary Schema 0.4 / Storage Format 1 and report roots.

## Live run and provider coverage

All seven production provider positions were attempted in the frozen order. Official disclosure and MIIT/Gov.cn returned empty results; GDELT and Eastmoney failed with sanitized transport/upstream errors; CPCA returned two usable normalized sources from `www.cpca.org.cn`; AKShare failed. The live run therefore had public evidence, but only one usable provider and did not produce durable canonical objects.

The live reasoning operation audit recorded one `industry_research_design`, eight `industry_module_analysis`, and two `industry_cross_module_synthesis` operations. The result did not expose a completed eight-module status summary, Gateway submission, Writer commit, or report, so the acceptance invariants cannot be claimed.

## Knowledge, report, and replay audit

The temporary Knowledge Base had zero Entity, Relation, Claim, and Source objects before and after the run; revision delta was zero. No durable numeric assertion or unsupported relation was persisted. Because there was no canonical result to replay, the deterministic replay terminated without mutation: zero live model calls, zero live acquisition-provider calls, zero revision delta, stable empty graph, and no semantic duplicates. The replay used captured normalized acquisition and structured reasoning outputs only.

The required user-facing report was not persisted (`type: null`, zero sections), so the sixteen-section report contract, explicit gaps/alternative views, methodology, and provenance cannot be accepted for this run.

## Privacy

Evidence contains only sanitized metadata, hashes, provider hosts, bounded safe errors, operation names/counts, and audit flags. It contains no raw source bodies, complete normalized documents, complete prompts or model outputs, reasoning traces, credentials, cookies, tokens, usernames, environment dumps, or private absolute paths.

## Validation

- `node --import tsx tests/validation/codex-cli-windows-resolution-smoke.ts` — PASSED.
- `npx tsx --test tests/validation/industry-production-portfolio-real-pi-e2e-rerun-after-cli-unblock.test.ts` — PASSED (5/5).
- `node --import tsx tests/validation/industry-production-portfolio-real-pi-e2e-rerun-after-cli-unblock.ts` — COMPLETED; classification recorded as production defect.
- `npx tsx --test tests/validation/industry-research-pi-e2e-gate.test.ts` — PASSED (19/19).
- `npm run typecheck` — PASSED.
- `npm test` — PASSED (860/860; client 21/21).
- `git diff --check` — PASSED; only a line-ending warning for existing smoke evidence was reported.

The unrelated valuation timing/status mismatch was not reproduced by this `npm test` run; no valuation files changed.

## Residual gap and next step

Residual gap: after successful Codex preflight and real Pi operation execution, the Industry Workflow returned no valid completed durable/report result, while two synthesis operations were observed. The smallest failing boundary is the production Industry Workflow completion-to-Gateway/report persistence path.

Recommended next step: investigate and fix the production Industry Workflow completion-to-Gateway/report persistence boundary, with a focused offline regression reproducing the observed two-synthesis/no-revision outcome before authorizing another live E2E.
