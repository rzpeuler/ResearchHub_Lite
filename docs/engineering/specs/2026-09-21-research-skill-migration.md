# RHL-SKILL-ARCH-001 — Research Skill Migration Matrix

Baseline: `0b53e462cf5da00b568a7af52dec4375c7dfb5b9`  
Branch: `codex/skill-arch-001-single-level-research-skills`  
Knowledge Schema change: `NO`

## Current Skill Ownership Matrix

| Current Skill | Current responsibility | Composite? | Embedded methods | Workflow consumer | Canonical destination |
| --- | --- | --- | --- | --- | --- |
| `company-research` | 19-section company synthesis, local proposals, report material, bounded valuation gap | Yes | business model, segments, drivers, competition, financial quality narrative, capital allocation, thesis, valuation section | `company-deep-research` / `company_research` | Workflow composition; `business_model_map`, `business_driver_analysis`, and evidence-gated `unit_economics` are canonical peer methods |
| `industry-research` | Eight-module design, module analysis, cross-module synthesis, evidence/gap validation | Yes | market definition, size/growth, supply/demand, chain, competition, technology, mapping, risk | `industry-deep-research` / `industry_research` | Workflow composition; three industry catalog methods remain PARTIAL |
| `earnings-review` | Exact-period synthesis plus deterministic expectation and financial-quality integration | Yes | consensus, actual-vs-expectation, guidance, segment KPI delta, estimate revisions, financial quality | `earnings-review` / `earnings_review` | Four expectation methods runtime; financial quality PARTIAL |
| `valuation` | PIT basis, method eligibility, scenario assumptions, deterministic target prices/sensitivity, synthesis | Yes | WACC, FCFF, forward DCF, reverse DCF, multiples, scenarios, QC | `valuation` | DCF/reverse DCF/scenario/cross-check runtime; comps PARTIAL |
| `event-research` | Event anchor verification, evidence assessment, impact synthesis, durable proposal gate | Yes | event evidence, impact, catalyst/risk/assumption effects | `event-research` / `event_research` | Workflow responsibility; catalyst map PARTIAL |
| `daily-intelligence` | Signal acquisition/enrichment/ranking, change assessment, morning/evening report | Yes | signal normalization, change assessment, catalyst/risk/thesis updates | `daily-intelligence` / `daily_intelligence` | Workflow responsibility; evidence normalization and thesis/catalyst methods PARTIAL |
| `thesis-red-team` | Adversarial thesis attack design, evidence qualification, challenge synthesis, proposal gate | No after normalization | falsification, invalidation, disconfirming evidence, risk escalation | `thesis-red-team` / `thesis_red_team` | canonical `thesis_red_team` runtime Skill; lifecycle remains Workflow |
| `knowledge-curation` | Knowledge extraction/resolution prompts and validation | No, different namespace | identity, model, validation, semantic resolution | Knowledge Production workflows | Not part of the Research Skill catalog; preserve Knowledge Skill boundary |

## Workflow-to-Skill mapping

The existing Workflow IDs remain stable. They may compose only available
canonical Skills; planned methods are skipped and surfaced as gaps/metadata.

| Workflow | Canonical peer methods currently available | Planned/partial methods skipped |
| --- | --- | --- |
| Company Research | `business_model_map`, `business_driver_analysis`, `unit_economics`; `thesis_red_team` only when explicitly requested | management, capital allocation, financial quality, expectation gap, research QC |
| Earnings Review | `consensus_expectations_analysis`, `earnings_variance_analysis`, `guidance_analysis`, `estimate_revision_analysis` | `earnings_call_analysis`, `financial_quality_analysis`, expectation gap, thesis refresh |
| Valuation | `dcf_valuation`, `reverse_dcf_expectation_decode`, `scenario_valuation`, `valuation_crosscheck` | `comps_valuation` until peer contract closes |
| Industry Research | none promoted as independently executable; current eight-module Skill remains transitional | market structure, supply/demand cycle, competitive map |
| Event Research | none; current event Skill remains Workflow-owned | catalyst map |
| Daily Intelligence | none; current signal/report Skill remains Workflow-owned | evidence normalization, catalyst map, thesis refresh |
| Thesis Lifecycle | `thesis_red_team` when the lifecycle requests adversarial review | thesis formalization, expectation gap, catalyst map, thesis refresh |

This table distinguishes capability ownership from report section ownership. A
Company report section named “Valuation” does not make Company Research the
canonical owner of valuation arithmetic.

## Legacy exit conditions

Legacy composite IDs are transitional until all of the following are true:

1. Every responsibility is mapped to a canonical Skill, helper, Workflow,
   report assembler, or Knowledge projection boundary.
2. The consuming Workflow is reconnected to canonical peer results.
3. Existing report sections and terminal behavior are unchanged.
4. Knowledge projection and Gateway/Writer behavior are unchanged.
5. Focused and regression tests cover the migration.
6. Public API and client references have no dangling legacy IDs.
7. Dispatch does not select the legacy ID as a new narrow Skill.

Until then, compatibility is explicit and deprecated; it is never advertised
as a new canonical capability.

## Checkpoint execution plan

| Checkpoint | Deliverable | Gate |
| --- | --- | --- |
| P1 | Audit, architecture, catalog, migration matrix | docs self-review and diff check |
| P2 | Registry descriptor, catalog status, SKILL contract validator | focused registry tests |
| P3 | canonical Thesis Red Team metadata | thesis regressions |
| P4 | valuation canonical metadata and routing | valuation calculations/workflow regressions |
| P5 | earnings canonical metadata and routing | earnings/expectations regressions |
| P6 | company/industry ownership classification | company/industry regressions |
| P7 | Workflow mapping metadata | workflow mapping tests |
| P8 | Invocation Match fallback and semantic resolver integration | collision/routing tests |
| P9 | legacy non-preferred compatibility | API/dispatch regressions |
| P10 | E2E, full validation, acceptance report, push | complete RHL acceptance gate |

## Deferred capability policy

The migration must not fabricate implementation for transcript/Q&A analysis,
document diffs, full unit economics, management execution histories, full
financial model build/update, model audit, deep inventory/pricing cycle,
thesis refresh, or other methods listed as PARTIAL/PLANNED. Those statuses are
the durable roadmap and must remain visible in the catalog and final report.
