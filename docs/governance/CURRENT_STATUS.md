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

## Current Limitations

- A production Docling environment has not been exercised in this checkout.
- A real Codex invocation remains opt-in; deterministic fake-host coverage is present.
- `RHL-VALIDATION-001` was executed with the exact frozen PDF; it was blocked at deterministic ExtractionPlan coverage validation and remains historical evidence.
- `RHL-FIX-PLAN-001` was independently CTO accepted / closed.
- `RHL-VALIDATION-001-R2` was executed against the accepted product baseline and blocked at the historical full-set reconciliation stage; this remains historical evidence and is not marked successful.
- `RHL-VALIDATION-001-R3` was executed against a fresh Knowledge Base with the exact frozen PDF, real Docling, and real Codex; it was blocked at the historical full-set reconciliation stage because the real output did not provide exactly one decision for every supplied candidate. Historical evidence is preserved; no real R4 was run in the refactor task.

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

After CTO acceptance, the next task is a fresh `RHL-VALIDATION-001-R4` run through Knowledge Resolution, ChangeSet, Writer, Reload, and Replay using the exact frozen PDF.
