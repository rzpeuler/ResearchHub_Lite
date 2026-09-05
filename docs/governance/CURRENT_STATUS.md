# ResearchHub_Lite — Current Status

## Phase

**Knowledge Core + Document + Reasoning/Curation + Deterministic Ingestion Implemented — RHL-REFACTOR-KNOWLEDGE-RESOLUTION-001 Complete / CTO Acceptance Pending**

## Completed

- Lite v0.1 product scope frozen.
- Workflow / Skill / Plugin boundaries frozen.
- Knowledge Domain boundary frozen.
- Codex defined as current reasoning host rather than Workflow owner.
- `ReasoningExecutor` portability seam frozen.
- Raw Document → Canonical Knowledge ingestion Workflow v0.1 frozen.
- `StructuredDocument → Understand + Plan → ExtractionPlan` direction frozen.
- Fixed `chunk → batch → extraction` architecture retired.
- LLM semantic decomposition vs deterministic admissibility boundary frozen.
- Bounded parallel ExtractionUnit model frozen.
- One ChangeSet / one atomic Writer commit invariant frozen.
- Knowledge Schema 0.3 migrated into Lite.
- Storage Format 1 deterministic Knowledge Core migrated.
- Raw SHA-256 identity and immutable/idempotent Raw archive migrated.
- v0.3-only Knowledge Base loading and Registry handling migrated.
- canonical hashing and deterministic ID allocation migrated.
- mutation lock and atomic root transaction migrated.
- Writer v0.3 safety semantics migrated, including revision/stale-target/idempotency/staging boundaries.
- Legacy v0.2 loaders, compatibility, migration framework, DSH/Harness/runtime dependencies remain excluded.
- `RHL-MIGRATION-002` independently reviewed and accepted at commit:
  `c85a222a178280a0b11b4a5a049554c485ea0cc8`.
- StructuredDocument and Document Plugin / Docling adaptation implemented in `RHL-MIGRATION-003`.
- Runtime-neutral ReasoningExecutor, isolated Codex adapter, Mock executor, and Knowledge Curation Skill implemented in `RHL-MIGRATION-004`; independently accepted / closed.
- Deterministic Schema 0.3 Knowledge validation and ChangeSet validation implemented under `knowledge/validation/` in `RHL-MIGRATION-005`.
- Raw Document → Canonical Knowledge deterministic Workflow implemented under `workflows/raw-document-knowledge-ingestion/`, including bounded extraction, consolidation, focused retrieval, review isolation, one ChangeSet, staged Writer validation, reload validation, and replay handling.
- `RHL-MIGRATION-005` implementation plus `RHL-MIGRATION-005-FIX-002`, `RHL-MIGRATION-005-FIX-003`, `RHL-MIGRATION-005-FIX-004`, `RHL-MIGRATION-005-FIX-005`, and `RHL-MIGRATION-005-FIX-006` are complete; `RHL-MIGRATION-005` is independently CTO accepted / closed.
- `RHL-FIX-IDENTITY-001` and `RHL-FIX-IDENTITY-001-FIX-001` are independently CTO accepted / closed: Unicode-safe semantic identity, deterministic mixed-script canonical IDs, collision-safe consolidation, exact Unicode retrieval, and pre-reconciliation candidate uniqueness checks are covered by offline tests.
- `RHL-REFACTOR-KNOWLEDGE-RESOLUTION-001` is implementation-complete pending CTO independent acceptance: full-set post-extraction Reconciliation was retired and replaced by deterministic Entity Binding, Entity/Relation/Claim Diff, bounded semantic cases, deterministic ResolutionIntent policy/barrier, and ResolutionIntent-driven ChangeSet planning.
- `RHL-REFACTOR-KNOWLEDGE-RESOLUTION-001-FIX-001` is implemented pending CTO independent acceptance: semantic cases now carry bounded real document excerpts and source projections, Entity plausible retrieval overflows to Review without truncation, semantic case/retry accounting is separate, durable-ref token leakage is rejected recursively, and the mixed fresh-KB scale regression is covered offline.
- `RHL-FIX-REASONING-TIMEOUT-001` is implemented: Codex process-tree termination and wall-clock timeout enforcement are covered by tests; the Codex host plugin now explicitly requests model `gpt-5.6-luna` with reasoning effort `high` and exposes safe runtime metadata.
- `RHL-FIX-REASONING-TIMEOUT-001-FIX-001` is implemented pending CTO independent acceptance: timeout settlement is owned by the bounded termination path, POSIX termination includes SIGTERM/grace/SIGKILL fallback, descendant cleanup is covered, and a bounded real Luna High smoke is recorded in `tests/validation/evidence/RHL_FIX_REASONING_TIMEOUT_001_SMOKE.json`. R5 remains unauthorized until CTO acceptance.
- `RHL-VALIDATION-001-R5` was executed independently against a fresh KB with the exact frozen PDF, real Docling 2.116.0, and real Codex CLI 0.152.1 / Luna High. Plan and all 18 ExtractionUnits completed with no timeout, but deterministic ChangeSet validation rejected three extracted Claims with invalid temporal scope before Writer; classification: `PRODUCT_DEFECT`. Evidence is preserved in `tests/validation/evidence/rhl-validation-001-r5-real-e2e.json` and `tests/validation/evidence/RHL_VALIDATION_001_R5_SUMMARY.md`; CTO acceptance is pending and no R5 replay was run.
- `RHL-FIX-CLAIM-TEMPORAL-001` is implemented pending CTO acceptance: ClaimCandidate temporal typing and validation now align with the existing Schema 0.3 `Date.parse` admissibility semantics, semantic period labels remain in `scope.label`, malformed temporal Claims are isolated at Candidate validation and by a Planner defense-in-depth guard, and Writer/Knowledge Resolution/Schema semantics remain unchanged. R5 remains historical `PRODUCT_DEFECT` evidence; R6 validation is recorded below.
- `RHL-VALIDATION-001-R6` was executed independently against a fresh `kb-rhl-validation-001-r6` with the exact frozen PDF, real Docling 2.116.0, and real Codex CLI 0.152.1 / `gpt-5.6-luna` / `high`. Plan and all 21 ExtractionUnits completed with 23/23 real reasoning calls passed and no timeout. Deterministic ChangeSet validation then stopped before Writer because `InvestmentTheme must reference exactly one registered ThemeGroup`; classification: `PRODUCT_DEFECT`. Revision remained 0, no Writer or replay ran, and historical R1-R5 plus timeout-smoke evidence remained unchanged. Evidence is preserved in `tests/validation/evidence/rhl-validation-001-r6-real-e2e.json` and `tests/validation/evidence/RHL_VALIDATION_001_R6_SUMMARY.md`; CTO acceptance is pending.
- `RHL-VALIDATION-001-R7` was executed independently against a fresh `kb-rhl-validation-001-r7` on product baseline `a8586f0ef4710e377baf18947a11c0f7f79840ff` with the exact frozen PDF, real Docling 2.116.0, and real Codex CLI 0.152.1 / `gpt-5.6-luna` / `high`. The accepted plan covered all 1,523 blocks in 17 ExtractionUnits; 18/18 real reasoning calls completed without timeout. Primary status was `completed_with_review`; one validated atomic ChangeSet committed revision 0→1 with 801 safe canonical creates, zero InvestmentTheme/ThemeGroup mutations, and no planned-reference leak. Reload/full validation, provenance, and exact replay passed; replay added zero reasoning calls, preserved the ChangeSet and ReviewSummary, returned `already_committed`, and left revision/counts unchanged. Classification: `SUCCESS`; CTO acceptance is pending. Evidence is preserved in `tests/validation/evidence/rhl-validation-001-r7-real-e2e.json` and `tests/validation/evidence/RHL_VALIDATION_001_R7_SUMMARY.md`.
- `RHL-FIX-CONSOLIDATION-REVIEW-SCOPE-001` is implemented pending CTO independent acceptance: optional Entity description/legalName variants are non-blocking field-level Reviews with conservative omission, Company ticker/exchange conflicts remain blocking, safe hard-field enrichment is preserved, downstream dependencies are isolated only for blocking identity issues, and Consolidation Review keys are normalized across lifecycle mirrors. Review samples are bounded to five while counts remain complete; no Schema, Writer, architecture, or reasoning operation changed.
- `RHL-VALIDATION-001-R7-EVIDENCE-FIX-001` corrected R7 evidence telemetry offline without rerunning the real Workflow, Reasoning, Docling, Writer, or Replay. Product outcome remains `SUCCESS`; extraction accepted candidates, post-consolidation candidates, normalized ReviewSummary, and persisted ChangeSet observations now identify their authoritative sources. Raw Claim temporal distribution and raw InvestmentTheme/coverage outcomes are explicitly marked unavailable where v1 recorder telemetry was incomplete or non-authoritative; fabricated Resolution intent binding/disposition totals were removed. CTO independent acceptance remains pending.
- `RHL-FIX-INVESTMENT-THEME-CREATION-001` is implemented pending CTO independent acceptance: raw ingestion now compares `InvestmentTheme` candidates against bounded case-local projections of all active existing themes, routes matched/covered themes to the existing canonical entity, and routes ambiguous or potential-new themes to Review. Raw ingestion never creates a new `InvestmentTheme` or `ThemeGroup`; existing theme enrichment preserves `themeGroupRef`. Consolidated support metrics produce advisory `potentialNewInvestmentThemes` and materially supported `recommendedNewInvestmentThemes` without creating durable IDs. Planner defense-in-depth converts any bypassed new-theme create intent into `theme_creation` Review while unrelated safe operations continue. Future user-created themes remain a separate Theme management concern and default to `Default ThemeGroup` when explicitly created.
- `RHL-FIX-INVESTMENT-THEME-CREATION-001-FIX-001` is implemented pending CTO independent acceptance: `supportingPrimaryBlockCount` now counts only primary blocks owned by the consolidated candidate's supporting ExtractionUnits, so borrowed context and unrelated Unit ownership cannot inflate materiality. The `InvestmentThemeCoverageCase` prompt now maps uncertain or insufficient coverage to `ambiguous_existing`; other semantic case kinds retain `uncertain`. Thresholds, vocabulary, Planner behavior, ThemeGroup policy, and architecture are unchanged.
- Temporary Reasoning Runtime Policy: ResearchHub_Lite currently requests Codex model `gpt-5.6-luna` with reasoning effort `high`. This is host-specific runtime configuration, not a frozen Knowledge architecture dependency; future hosts/models remain replaceable through `ReasoningExecutor` configuration.

## Current Limitations

- `RHL-VALIDATION-001-R4` exercised the exact frozen PDF with real Docling 2.116.0 and real Codex CLI 0.152.1; preflight, Raw archival, parse, and Plan passed, but primary Extraction blocked at `unit-017` after two real Codex reasoning timeouts. Classification: `REASONING_FAILURE`; Writer was not invoked. This remains historical evidence of the ReasoningExecutor timeout-enforcement defect addressed by `RHL-FIX-REASONING-TIMEOUT-001`. Evidence is preserved in `tests/validation/evidence/rhl-validation-001-r4-real-e2e.json`.
- R7 provides a successful complete real Codex validation with review items; CTO independent acceptance remains pending. R6 remains immutable historical `PRODUCT_DEFECT` evidence, and its remediation is covered by the R7 result.
- The R7 amplification root cause is addressed in the Workflow: description-only conflicts no longer cascade into dependent Relation/Claim Reviews, and repeated Consolidation/Resolution/Planner representations share one normalized Review identity. R7 evidence remains unchanged; the R7-shaped behavior is covered by offline regression tests.
- R7 v1 recorder telemetry did not capture complete extraction Candidate outputs. The corrected v2 evidence therefore does not infer raw Claim temporal distributions or raw InvestmentTheme candidate/coverage outcomes from zero-valued recorder fields; this is an evidence limitation only, not a product outcome change.
- R6 exposed a separate deterministic ChangeSet product defect: an extracted `InvestmentTheme` did not reference exactly one registered `ThemeGroup`. The remediation contains this at the Workflow/Knowledge Resolution/Planner boundary; Writer and Schema remain unchanged, and historical R6 evidence remains immutable.
- The final R6 InvestmentTheme remediation has offline regression coverage for cross-Unit context inflation, strong single-Unit support, two-Unit support, prompt vocabulary, and outcome validation; R7 confirmed zero raw/persisted InvestmentTheme and ThemeGroup mutations on the fresh baseline.
- `RHL-VALIDATION-001` was executed with the exact frozen PDF; it was blocked at deterministic ExtractionPlan coverage validation and remains historical evidence.
- `RHL-FIX-PLAN-001` was independently CTO accepted / closed.
- `RHL-VALIDATION-001-R2` was executed against the accepted product baseline and blocked at the historical full-set reconciliation stage; this remains historical evidence and is not marked successful.
- `RHL-VALIDATION-001-R3` was executed against a fresh Knowledge Base with the exact frozen PDF, real Docling, and real Codex; it was blocked at the historical full-set reconciliation stage because the real output did not provide exactly one decision for every supplied candidate. Historical evidence is preserved.

## Current Architecture Baseline

- Knowledge Schema: 0.3
- Storage Format: 1
- Current reasoning host: Codex
- Custom Agent Runtime: none
- DSH/Harness dependency: none
- Knowledge Core runtime dependency on LLM/Agent/PDF/network: none
- Historical 157-review result does not authorize canonical Schema expansion.
- Review-reduction direction remains Candidate/Resolution-first rather than ontology-first.

## Next Pending After CTO Acceptance

`RHL-FIX-CONSOLIDATION-REVIEW-SCOPE-001` is implemented and remains pending CTO independent acceptance. R7 product classification remains `SUCCESS`; R7 evidence is unchanged. Do not treat R5 or R6 as successful; after acceptance the next recommended task is `RHL-FIX-RELATION-ATTRIBUTE-ADMISSIBILITY-001`; no next task is started automatically.
