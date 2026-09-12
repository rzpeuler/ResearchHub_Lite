# RHL-M3B-3A FIX-002 — Scope and Integration Evidence Closure

Status: IMPLEMENTED / CTO ACCEPTANCE PENDING

Baseline: `4a18f0af9198372485dff6686645493a0feb3be7` (verified at HEAD; branch and remote were aligned before work).  
Governance: `docs/governance/governance-manifest.yaml` version 1, template version 2.  
No commit, amend, rebase, push, or force-push was performed.

## Scope review of the five synchronized FIX-001 extras

These five files were outside FIX-001's prior declared scope. They are formally reviewed and authorized only as compatibility evidence in this FIX-002 closure; passing tests did not make the prior scope expansion automatically acceptable.

| File | Necessary for the acquisition-union migration? | Semantically neutral and minimal? | Supporting evidence |
| --- | --- | --- | --- |
| `plugins/daily-intelligence/acquisition.ts` | Yes. Company-scoped metadata now reads `company.symbol` only after narrowing; Industry discovery omits `companySymbol`. | Yes. Discovery, fetch, normalize, rights, and source semantics are otherwise unchanged. | `FIX-002 Daily acquisition preserves Company metadata and guards Industry identity`; full Daily Intelligence suite. |
| `plugins/daily-intelligence/market.ts` | Yes. Company and `BROAD_SCOPE` retain their established endpoints; Industry returns an empty Company-market candidate set. | Yes. No market redesign or provider behavior change. | `FIX-002 Daily market preserves Company and BROAD_SCOPE endpoints and returns no Industry candidates`; full Daily Intelligence suite. |
| `tests/plugins/daily-intelligence-fix-003.test.ts` | Yes. The fixture/provider guard is required to satisfy the new discriminated request union. | Yes. It narrows/guards the request and retains the original Company assertions. | Focused FIX-003 suite: 9/9 passed. |
| `tests/validation/daily-intelligence-fix-003-pi-e2e.ts` | Yes. Validation fixture must reject Industry requests without manufacturing a Company identity. | Yes. Only the request discriminant is narrowed; Company/Daily Intelligence semantics are unchanged. | Existing validation fixture remains type-safe; full Node matrix passed. |
| `tests/workflows/company-deep-research.test.ts` | Yes. The Company fixture must explicitly guard the union before reading `company.symbol`. | Yes. Existing genuine Company request and output assertions remain unchanged. | Company focused suite: 3/3 passed. |

No unnecessary edit was reverted. The two production edits are compatibility-only and the three test/validation edits are mechanical union narrowing/guards.

## Acquisition-union invariants retained

Company requests contain `company` and no `industry`; Industry requests contain `industry` and no `company`. No `{ symbol: 'INDUSTRY' }`, optional dual identity, unsafe acquisition-plugin cast, or equivalent type escape was introduced. Existing FIX-001 behavior remains covered: bounded GDELT, graceful Industry-empty CNINFO/RSS paths, exact AKShare Industry board matching, finite composition, deterministic deduplication, independent provider degradation, bounded diagnostics, and cross-wave aggregation.

## Direct Pi acceptance

`tests/app/pi/host.test.ts` now proves:

- `research_industry` is absent without `ResearchService` and present when configured.
- The actual tool definition delegates exactly once with the same bounded Application input.
- The parameter surface is limited to `IndustryResearchInput` fields and bounded run controls.
- The result is the existing normal text envelope containing only the bounded Application result; serialized output contains no raw/normalized source body, cookie, credential, authorization header, telemetry, or absolute path.
- Existing Pi tool tests remain intact.

## Application → Workflow → canonical Knowledge → graph projection

`tests/app/services/industry-research-integration.test.ts` uses a fresh Schema 0.4 / Storage 1 Knowledge Base, a deterministic fake `ReasoningExecutor`, and a mocked normalized acquisition plugin. It calls `ResearchService.startIndustryResearch`, which executes the accepted `runIndustryDeepResearch` path rather than stubbing Workflow output.

The completed run proves `industry_deep_research`, a relative report path, sixteen persisted report sections, bounded provider outcomes/diagnostics, a canonical Industry root, Product and Company Entities, evidence-backed `belongs_to_industry` and `business_exposure` Relations, and durable evidence-backed Claims. The test loads the root from canonical Knowledge, calls the unchanged `KnowledgeGraphService.getGraphProjection`, asserts `profile === 'industry_context'`, verifies canonical node/edge identity, and exercises depth/node/edge bounds while retaining the root.

The test also proves two-wave aggregation: one actionable first-pass gap causes a Wave-2 acquisition, and the Application result aggregates usable evidence from both waves with bounded diagnostics.

## Replay and cancellation

The Application fixture runs a semantically equivalent second request against the first canonical Industry ref. Canonical Entity, Relation, Claim, and Source counts remain stable; the graph node and edge identities remain stable. No separate graph store, report-derived graph, or private Workflow graph is used.

The runtime route suite adds direct cancellation for an accepted `/api/research-industry` run. Cancellation is observed through the existing `WorkflowService` mechanism and the mounted Knowledge Base revision remains unchanged. The existing convention remains: runtime-generated UUID run IDs are used when the caller does not provide a safe `workflowRunId`; supplied safe IDs remain accepted and are returned unchanged.

Default runtime composition is covered using a mounted valid Schema 0.4 Knowledge Base plus injected non-network model/reasoning runtime: `researchService` is configured and the generated Pi tool set exposes `research_industry`.

The missing-`ReasoningExecutor` pre-registration assertion from FIX-001 remains green and proves the failure occurs before Workflow registration or Knowledge revision change.

## Provider smoke

The acquisition-only smoke was rerun after the compatibility corrections. Evidence was generated from the bounded run at `2026-09-12T05:45:18.983Z` and written to `tests/validation/evidence/RHL_M3B_INDUSTRY_RESEARCH_PROVIDER_SMOKE.json` without response bodies, secrets, cookies, authorization headers, or private local paths:

- GDELT: `unavailable_or_degraded`, bounded timeout.
- CNINFO: `empty`.
- RSS gov.cn: `empty`.
- AKShare Industry: `unavailable_or_degraded`, bounded timeout.

No provider success was fabricated. External emptiness/degradation remains acceptable evidence.

## Validation

- Acquisition focused matrix: PASSED, 7 tests.
- Daily Intelligence focused regression: PASSED, 9 tests.
- Company Deep Research focused regression: PASSED, 3 tests.
- M3B-2 Industry deterministic Workflow acceptance: PASSED, 39 tests.
- Application services plus integration fixture: PASSED, 17 tests.
- KnowledgeGraphService focused regression: PASSED, 2 tests.
- Pi host focused regression: PASSED, 11 tests.
- Industry runtime route regression: PASSED, 3 tests.
- Acquisition-only provider smoke: PASSED with bounded degraded/empty evidence.
- `npm run typecheck`: PASSED.
- `npm run client:typecheck`: PASSED.
- `npm run test:node`: PASSED, 651 tests.
- `npm test`: PASSED, client 21 tests and Node 651 tests.
- `npm run client:build`: PASSED.
- `git diff --check`: PASSED.

## Changed files

- `tests/app/pi/host.test.ts`
- `tests/app/runtime/industry-research-route.test.ts`
- `tests/app/services/industry-research-integration.test.ts` (new)
- `tests/plugins/daily-intelligence-fix-003.test.ts`
- `tests/validation/evidence/RHL_M3B_INDUSTRY_RESEARCH_PROVIDER_SMOKE.json`
- `docs/task-reports/RHL-M3B-3A-FIX-002-SCOPE-AND-INTEGRATION-EVIDENCE-CLOSURE.md` (this report)

No production source, Workflow, Skill, KnowledgeGraphService, Schema, Storage, Gateway, Resolution, Validator, Writer, governance, architecture, client, or real Pi E2E file was changed.

## Remaining boundary

Final status is **IMPLEMENTED / CTO ACCEPTANCE PENDING**. Real Pi Industry E2E, PCB/AI-server/HDI real reasoning, final real-model eight-module/sixteen-section gate, and deterministic semantic replay under real reasoning remain M3B-3B and were not executed. No governance gap or external setup blocker was observed.
