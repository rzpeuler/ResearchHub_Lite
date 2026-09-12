# RHL-M3B-3A Industry Acquisition / Application / Graph Integration

Status: IMPLEMENTED / CTO ACCEPTANCE PENDING  
Baseline: `5d539130160689028aee55b7186f2add59f8e648`  
Commit/push: not performed; owned by ORCHESTRATOR.

## Implementation

- Extended the existing acquisition request with an explicit Industry identity while retaining the established Company shape and callers.
- GDELT now accepts bounded Industry name/alias/search terms and bounded result counts. CNINFO and RSS remain graceful empty/unsupported for Industry requests.
- Added `AkshareIndustryResearchPlugin`. It accepts only one exact board match, emits normalized `structured_data`, deterministic identity/metadata, AKShare publisher and public personal-research rights.
- Added `IndustryAcquisitionComposition`: finite provider/candidate/source budgets, stable URL/content-hash deduplication, independent provider failure degradation, bounded safe diagnostics and provider outcomes. It is used as the existing Workflow acquisition-wave callback and does not create a search loop.
- Added `IndustryResearchInput`, `ApplicationIndustryResearchResult`, and thin `ResearchService.startIndustryResearch` with Schema 0.4 / Storage 1 mounting, existing ReasoningExecutor injection, cancellation propagation, relative report paths and one Workflow registration.
- Added Pi `research_industry` and runtime aliases `POST /api/production/research-industry` and `POST /api/research-industry`, retaining existing runtime security and 202 background semantics.

## Compatibility and acceptance boundaries

Company acquisition behavior and existing Company Research, Pi, Application, graph and runtime tests remain green. No Workflow, Skill, KnowledgeGraphService, canonical schema, Writer, Resolver or governance source was changed. The Industry Workflow remains the authority for two waves, one-gap-fill, evidence gates and one Gateway submission. Canonical graph acceptance therefore continues through the existing `KnowledgeGraphService.getGraphProjection` path; no parallel graph or report-derived data path was introduced.

## Provider smoke

`tests/validation/industry-research-provider-smoke.ts` uses PCB / 印制电路板 / HDI, finite timeouts and result limits, and acquisition-only real public implementations. Evidence is in `tests/validation/evidence/RHL_M3B_INDUSTRY_RESEARCH_PROVIDER_SMOKE.json`. The observed run classified GDELT and AKShare as externally unavailable/degraded, and CNINFO/RSS as empty for the Industry request. No credentials or response bodies were recorded; this is external validation evidence, not fabricated provider success.

## Validation

- PASS: `npm run typecheck`
- PASS: Industry acquisition contract tests (3/3)
- PASS: existing focused acquisition/Application/Pi/graph tests (30/30)
- PASS: existing runtime tests (53/53)
- PASS: `node --import tsx tests/validation/industry-research-provider-smoke.ts` (evidence written; external providers degraded/empty as recorded)
- PASS: `git diff --check`

The complete repository matrix passed: `npm run test:node` 642/642, `npm test` client 21/21 plus Node 642/642, and `npm run client:build` succeeded. Real Pi model execution, deterministic real replay and final PCB-style acceptance are explicitly deferred to M3B-3B.

## Limitations / blockers

The current public environment did not provide a usable external GDELT or AKShare result during smoke, and RSS/CNINFO are intentionally unsupported/empty for this Industry target. This does not block deterministic implementation or offline contract tests. The runtime route and Pi integration are wired to the existing configured ResearchService; no model network policy was expanded.
