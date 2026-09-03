# ResearchHub_Lite — Current Status

## Phase

**Knowledge Core + Document + Reasoning/Curation + Deterministic Ingestion Implemented — RHL-MIGRATION-005 Independently CTO Accepted / Closed**

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

## Current Limitations

- A production Docling environment has not been exercised in this checkout.
- A real Codex invocation remains opt-in; deterministic fake-host coverage is present.
- `RHL-VALIDATION-001` was executed with the exact frozen PDF; it was blocked at deterministic ExtractionPlan coverage validation and remains historical evidence.
- `RHL-FIX-PLAN-001` was independently CTO accepted / closed.
- `RHL-VALIDATION-001-R2` was executed against the accepted product baseline and blocked at reconciliation because candidate `merged-entity-company` received more than one decision; CTO validation acceptance remains pending.

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

No subsequent migration task is authorized until CTO acceptance of `RHL-VALIDATION-001`.
