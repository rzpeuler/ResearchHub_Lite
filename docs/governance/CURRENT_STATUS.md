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
- Temporary Reasoning Runtime Policy: ResearchHub_Lite currently requests Codex model `gpt-5.6-luna` with reasoning effort `high`. This is host-specific runtime configuration, not a frozen Knowledge architecture dependency; future hosts/models remain replaceable through `ReasoningExecutor` configuration.

## Current Limitations

- `RHL-VALIDATION-001-R4` exercised the exact frozen PDF with real Docling 2.116.0 and real Codex CLI 0.152.1; preflight, Raw archival, parse, and Plan passed, but primary Extraction blocked at `unit-017` after two real Codex reasoning timeouts. Classification: `REASONING_FAILURE`; Writer was not invoked. This remains historical evidence of the ReasoningExecutor timeout-enforcement defect addressed by `RHL-FIX-REASONING-TIMEOUT-001`. Evidence is preserved in `tests/validation/evidence/rhl-validation-001-r4-real-e2e.json`.
- A complete real Codex validation remains pending because R5 stopped at the ChangeSet validation boundary; deterministic fake-host coverage and bounded Luna High smoke evidence are present.
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

After CTO review of the R5 `PRODUCT_DEFECT`, the next task is a separate remediation decision for the Claim temporal-scope contract. Do not treat R5 as successful or CTO accepted.
