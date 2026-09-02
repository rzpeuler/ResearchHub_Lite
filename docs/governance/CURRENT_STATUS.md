# ResearchHub_Lite — Current Status

## Phase

**Knowledge Core + Document + Reasoning/Curation Contracts Implemented — CTO Review Pending**

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
- Runtime-neutral ReasoningExecutor, isolated Codex adapter, Mock executor, and Knowledge Curation Skill implemented in `RHL-MIGRATION-004`; CTO acceptance pending.

## Current Limitations

- Full Knowledge validation, ChangeSet validation, and staged-state validation have not yet been migrated.
- A production Docling environment has not been exercised in this checkout.
- A real Codex invocation remains opt-in; deterministic fake-host coverage is present.
- New deterministic ingestion Workflow is not implemented.
- Lite real Raw → Knowledge Base E2E validation has not yet been run.

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

**RHL-MIGRATION-005 — Knowledge Validation + Deterministic Ingestion Workflow**

The next task must add deterministic Knowledge validation and Workflow control without moving routing, retries, acceptance, or persistence into the ReasoningExecutor or Skill.
