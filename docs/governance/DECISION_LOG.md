# ResearchHub_Lite — Decision Log

This log records only architecture/product decisions that materially constrain future engineering.

---

## RHL-VALIDATION-001-R7-EVIDENCE-FIX-001 — 2026-09-05

**Status:** Implemented / CTO acceptance pending

R7 product E2E remains `SUCCESS`; this task corrected the committed v1 evidence offline and did not rerun the real Workflow, Reasoning, Docling, Writer, or Replay. Extraction accepted candidates are sourced from `IngestionWorkflowResult.unitSummaries`, post-consolidation candidates and Resolution totals from `IngestionWorkflowResult.resolutionSummary`, normalized ReviewSummary from `IngestionWorkflowResult.reviewSummary`, and ChangeSet observations from the persisted ingestion log. Raw Claim temporal distribution and raw InvestmentTheme candidate/coverage outcomes are explicitly unavailable because the v1 recorder did not provide authoritative complete extraction output telemetry. Fabricated v1 Resolution intent binding/disposition totals were removed. No product outcome, architecture decision, Schema, Writer behavior, or historical evidence changed.

The corrected evidence records the unchanged R7 facts: revision `0→1`, `801` safe canonical creates, final counts `389/272/140` for Entity/Relation/Claim, full validation passed, zero planned-reference leaks, complete provenance, and exact replay `already_committed` with zero additional reasoning calls. Historical R1-R6 and timeout-smoke evidence remain immutable. CTO independent acceptance remains pending.

---

## RHL-VALIDATION-001-R7 — 2026-09-05

**Status:** Executed / SUCCESS / CTO acceptance pending

R7 used product baseline `a8586f0ef4710e377baf18947a11c0f7f79840ff`, the exact frozen PDF (`3,209,114` bytes; SHA-256 `998703cef102300518bb2edcbcc3e9bc26fa374f157b0714f3986c5028d78d63`), real Docling `2.116.0`, and real Codex CLI `0.152.1` with explicit `gpt-5.6-luna` and `high`. A fresh Schema 0.3 / Storage Format 1 Knowledge Base passed initial validation. The accepted plan covered all `1,523` document blocks in `17` ExtractionUnits; `18/18` real reasoning calls completed without timeout. Primary ingestion completed with review, and one staged, validated atomic ChangeSet committed revision `0` to `1`, creating `801` safe canonical objects (`389` Entity, `272` Relation, `140` Claim) plus one Source. No InvestmentTheme or ThemeGroup mutation occurred, and no planned-reference leak was persisted.

Post-write reload and full validation passed with exact Raw provenance for all `140` Claims and the Source. Exact replay returned `already_committed`, made zero additional real reasoning calls, preserved status, ReviewSummary, ChangeSet identity, revision, and durable counts. Classification is `SUCCESS` with CTO acceptance still pending. Historical R1-R6 and timeout-smoke evidence remain unchanged; no architecture decision is changed.

---

## RHL-FIX-INVESTMENT-THEME-CREATION-001-FIX-001 — 2026-09-04

**Status:** Implemented / CTO acceptance pending

The final CTO remediation preserves the existing InvestmentTheme novelty and recommendation design while correcting two contract issues. Materiality now resolves `supportingUnitIds` back to the accepted ExtractionPlan and counts only those Units' `primaryBlockIds`; primary ownership by an unrelated Unit and context blocks borrowed from another Unit cannot inflate `supportingPrimaryBlockCount`. Unknown supporting Unit IDs contribute zero primary support. The v0.1 recommendation threshold is unchanged: at least two supporting Units, or one supporting Unit with at least eight owned primary blocks.

The `InvestmentThemeCoverageCase` prompt now has an explicit three-outcome branch: `matches_existing`, `ambiguous_existing`, and `potential_new`. Multiple possible matches, uncertain coverage, incomplete Theme context, or insufficient evidence for novelty map to `ambiguous_existing`; `uncertain` is not instructed or accepted for this case. Other semantic case kinds retain their existing `uncertain` behavior. The validator vocabulary, Planner behavior, no-auto-creation ThemeGroup policy, Schema, Writer, ReasoningExecutor, and frozen architecture are unchanged.

Offline regressions cover cross-Unit context inflation (`1` supporting Unit, `1` primary block, `do_not_recommend`), strong single-Unit support (`1`, `8`, `recommend`), low-evidence multi-Unit support (`2`, `recommend`), prompt wording, and outcome validation. Historical R1-R6 and timeout-smoke evidence remain immutable. Real R7 is not authorized by this task.

---

## RHL-FIX-INVESTMENT-THEME-CREATION-001 — 2026-09-04

**Status:** Implemented / CTO acceptance pending

The R6 `InvestmentTheme must reference exactly one registered ThemeGroup` product defect is contained without changing Schema 0.3, Storage Format 1, Writer, or the frozen architecture. Raw ingestion now uses a bounded, case-local comparison set containing aliases plus definition/inclusion/exclusion context for every active existing `InvestmentTheme`; durable IDs, `themeGroupRef`, and unrelated Knowledge Base data are not sent to semantic reasoning. `matches_existing` binds to the canonical theme, while `ambiguous_existing` and `potential_new` remain Review. Missing or incomplete existing-theme context cannot produce novelty.

After deterministic consolidation, potential-new assessments record candidate, unit, primary-block, section, and evidence-block support. The advisory recommendation is `recommend` only at two supporting units, or one unit with at least eight supporting primary blocks; candidate count alone is insufficient. Weak or incidental support remains `do_not_recommend`, and duplicate candidates are assessed once after consolidation. Neither assessment path creates a durable ID.

Planner defense-in-depth converts any bypassed new `investment_theme` create intent into `theme_creation` Review. Dependent Relations and Claims remain isolated with the unresolved theme, while unrelated safe operations may continue. The ChangeSet therefore creates or updates zero `ThemeGroup` entities and creates zero new canonical `InvestmentTheme` entities. Existing-theme enrichment preserves its `themeGroupRef`. Future user-created themes are outside raw-ingestion scope and default to `Default ThemeGroup` when explicitly created; Theme management is not implemented by this task.

Historical R1-R6 and timeout-smoke evidence remain immutable. Validation for this task is offline only; real Docling/Codex/PDF/R7 execution is not included.

---

## RHL-FIX-CLAIM-TEMPORAL-001 — 2026-09-04

**Status:** Implemented / CTO acceptance pending

R5 remains historical `PRODUCT_DEFECT` evidence because three Claim temporal values passed the Candidate boundary and failed deterministic Schema 0.3 ChangeSet validation before Writer. The remediation aligns ClaimCandidate temporal validation with the existing canonical `Date.parse`-based date-like predicate, keeps semantic periods in `scope.label`, and adds a narrow Planner guard that isolates any bypassed malformed Claim as Review. Schema 0.3 vocabulary and canonical semantics are unchanged; R5 evidence remains immutable. The separate R6 validation result is recorded below.

---

## RHL-VALIDATION-001-R6 — 2026-09-04

**Status:** Executed / PRODUCT_DEFECT / CTO acceptance pending

R6 used the exact frozen PDF, a fresh `kb-rhl-validation-001-r6`, real Docling `2.116.0`, and real Codex CLI `0.152.1` with explicit `gpt-5.6-luna` and `high`. The accepted plan contained 21 ExtractionUnits, all 21 units completed, and all 23 recorded real reasoning calls passed without timeout. Extraction produced 582 Entity, 513 Relation, and 269 Claim candidates, with 8 deterministic rejections.

The run stopped before Writer at deterministic Schema 0.3 ChangeSet validation because `InvestmentTheme must reference exactly one registered ThemeGroup`. This is recorded as `PRODUCT_DEFECT`; it is distinct from the historical R5 temporal-scope defect. Fresh-KB revision remained 0, Writer invocation was zero, and no replay ran. Historical R1-R5 and timeout-smoke evidence remain immutable. No architecture decision is changed, and no production remediation is included in the validation task.

---

## Temporary Reasoning Runtime Policy — 2026-09-04

ResearchHub_Lite currently requests the Codex host configuration:

- Model: `gpt-5.6-luna`
- Reasoning effort: `high`

This is a temporary host-specific runtime policy. It is not a frozen Knowledge architecture dependency and must not be copied into Workflow, Knowledge Resolution, Knowledge Schema, or Skill semantic contracts. Future model or reasoning-host changes remain supported through `CodexReasoningExecutor` options and the runtime-neutral `ReasoningExecutor` boundary.

The policy is passed explicitly on each Codex CLI invocation rather than inherited from `config.toml`.

---

## RHL-VALIDATION-001-R5 — 2026-09-04

**Status:** Executed / PRODUCT_DEFECT / CTO acceptance pending

R5 used the exact frozen 103-page PDF, a fresh `kb-rhl-validation-001-r5`, real Docling `2.116.0`, and real Codex CLI `0.152.1` with explicit `gpt-5.6-luna` and `high`. Plan validation and all 18 serial ExtractionUnits completed without a reasoning timeout. The fresh Knowledge Resolution path required zero semantic resolution cases.

The run stopped before Writer at deterministic ChangeSet validation because three real extracted Claims failed the Schema 0.3 temporal-scope validator. This is recorded as `PRODUCT_DEFECT`: the deterministic production contract prevented safe progression after malformed Claim temporal data reached ChangeSet validation. Writer invocation was zero, no replay was run, and R1–R4 plus timeout-smoke evidence remain immutable. No architecture decision is changed; a separate remediation task is required before any new R5 attempt.

---

## RHL-FIX-REASONING-TIMEOUT-001-FIX-001 — 2026-09-04

**Status:** Implemented / CTO acceptance pending

The Codex ReasoningExecutor timeout lifecycle is finalized behind the existing Plugin boundary. After timeout, direct-child close/error events cannot settle the request before bounded process-tree termination completes. Windows retains bounded `taskkill /PID /T /F`; POSIX uses detached process-group termination with SIGTERM, bounded grace, SIGKILL fallback, and bounded forced-wait handling. Invocation-directory cleanup runs after timeout termination handling.

The accepted temporary runtime policy remains explicit `gpt-5.6-luna` with reasoning effort `high`. A bounded real smoke is recorded in `tests/validation/evidence/RHL_FIX_REASONING_TIMEOUT_001_SMOKE.json`. This task does not authorize R5, change historical R4 evidence, or alter Workflow, Knowledge Resolution, Schema, or Writer architecture.

---

## RHL-ADR-001 — No Custom Agent Runtime

**Status:** Accepted

Codex is the current execution/reasoning host.

ResearchHub_Lite does not build or migrate a custom Agent Runtime.

---

## RHL-ADR-002 — Lite v0.1 Scope

**Status:** Accepted

Lite v0.1 is limited to:

1. Raw Document → Canonical Knowledge Base ingestion.
2. Knowledge architecture and storage integrity.

Broader research product capabilities are outside current scope.

---

## RHL-ADR-003 — Workflow Is the Deterministic Control Plane

**Status:** Accepted

Workflow owns node ordering, routing, retries, blocked states, parallel scheduling, validation gates, write authorization, and completion.

The active reasoning host does not control arbitrary Workflow transitions.

---

## RHL-ADR-004 — Skill Owns Professional Semantic Methodology

**Status:** Accepted

Skill owns semantic reasoning methods such as report understanding, semantic decomposition, extraction, and reconciliation.

Skill does not own canonical persistence.

---

## RHL-ADR-005 — Plugin Owns External and Host Integration

**Status:** Accepted

External capabilities and reasoning-host-specific integration belong behind Plugin boundaries.

---

## RHL-ADR-006 — ReasoningExecutor Is an Agent Execution Abstraction

**Status:** Accepted

`ReasoningExecutor` is not defined as an LLM HTTP API wrapper.

It represents a programmatically invokable reasoning host.

---

## RHL-ADR-007 — Agent Portability Through ReasoningExecutor

**Status:** Accepted

Workflow and Skill remain host-neutral.

Codex-specific code is isolated behind a ReasoningExecutor implementation.

Future reasoning hosts should normally require only a replacement Plugin implementation.

---

## RHL-ADR-008 — Knowledge Is a Domain, Not an Execution Layer

**Status:** Accepted

Knowledge schema, validation, storage, Registry, provenance, query, ChangeSet, and Writer form deterministic domain/infrastructure code.

They are not a fourth Agent execution layer.

---

## RHL-ADR-009 — Schema 0.3 / Storage Format 1 Baseline

**Status:** Accepted

ResearchHub_Lite starts directly from Knowledge Schema 0.3 and Storage Format 1.

Legacy v0.2 compatibility and migration are excluded from initial scope.

---

## RHL-ADR-010 — Retire Fixed Chunk/Batch Extraction

**Status:** Accepted

The old `chunk → fixed batch → extraction` Workflow is retired.

Block remains useful as a provenance anchor, but does not determine reasoning-unit boundaries.

---

## RHL-ADR-011 — StructuredDocument and ExtractionUnit Are Independent

**Status:** Accepted

Section/Block represent document structure and provenance.

ExtractionUnit represents a semantic reasoning context.

ExtractionUnits may cross Section boundaries and may overlap by reference.

---

## RHL-ADR-012 — Understand + Plan Is a Semantic Operation

**Status:** Accepted

The reasoning system may jointly produce:

- `ReportMap`
- `ExtractionPlanProposal`

This is an explicitly authorized semantic decision point.

---

## RHL-ADR-013 — LLM Proposes; Deterministic Code Admits

**Status:** Accepted

The reasoning system may propose Unit count and semantic boundaries.

Deterministic code validates:

- reference existence;
- context/output budgets;
- hard Unit/concurrency limits;
- plan structure;
- execution admissibility.

Invalid but repairable plans may undergo bounded semantic repair.

---

## RHL-ADR-014 — Bounded Parallel Extraction

**Status:** Accepted

Multiple ExtractionUnits may execute in parallel under a configured concurrency limit.

Units are read-only and use only local candidate IDs.

---

## RHL-ADR-015 — One Semantic ChangeSet / One Atomic Commit

**Status:** Accepted

Each ingestion execution produces at most one semantic ChangeSet and one atomic Writer commit.

Extraction Units must never independently mutate the Knowledge Base.

---

## RHL-ADR-016 — Original Ingestion Workflow Is Reference-Only

**Status:** Accepted

The original ResearchHub monolithic ingestion `workflow.ts` is not ported wholesale.

It remains a reference for previously validated invariants such as:

- bounded retry;
- candidate isolation;
- canonical resolution discipline;
- ChangeSet safety;
- Writer exactly-once behavior;
- idempotency/replay;
- reload/full validation;
- provenance integrity.

---

## RHL-ADR-017 — Selective Migration, Not Repository Clone

**Status:** Accepted

ResearchHub_Lite selectively reuses proven assets.

Legacy runtime, compatibility, migration, and unrelated product layers must not be copied merely to satisfy old imports.

---

## RHL-ADR-018 — Knowledge Resolution Replaces Full-Set Reconciliation

**Status:** Implementation complete; CTO acceptance pending

After Candidate consolidation, deterministic infrastructure owns canonical Entity Binding, Knowledge Diff, Candidate graph reference resolution, ResolutionIntent generation, and the ResolutionIntent barrier. Reasoning may be invoked only for a bounded `EntityBindingCase`, `RelationConflictCase`, or `ClaimConflictCase` through `resolveSemanticCase`.

Reasoning receives case-local existing aliases rather than durable canonical IDs and never returns mutation actions. ChangeSet planning consumes only infrastructure-owned `ResolutionIntent` values. The historical R1/R2/R3 validation evidence remains immutable, and real R4 validation is deferred until independent CTO acceptance.

## RHL-ADR-019 — Knowledge Resolution Case Contract Hardening

**Status: Implementation complete; CTO acceptance pending**

Semantic Resolution Cases use deterministic excerpts from the already-parsed StructuredDocument and bounded incoming/existing Source metadata. Entity plausible retrieval computes complete membership before applying `maxEntityBindingCandidates`; overflow is isolated to Review. `semanticCaseCount` is independent from retry `semanticCaseCalls`, and model output rejects embedded durable canonical and RawRef tokens recursively. The mixed fresh-KB Entity/Relation/Claim regression remains zero-call and zero-Review; Schema 0.3 and Writer remain unchanged.
