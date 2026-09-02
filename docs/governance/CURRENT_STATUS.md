# ResearchHub_Lite — Current Status

## Phase

**Architecture Frozen / Migration Ready**

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
- Initial migration classification defined.
- Original ResearchHub source baseline identified as:
  `4c141172d6ba4123e909f0d8b9481072912e3ef2`.

## Not Started

- Knowledge Schema migration.
- Knowledge Storage Core migration.
- StructuredDocument implementation.
- Docling adaptation.
- ReasoningExecutor implementation.
- Codex reasoning plugin.
- Knowledge Curation adaptation.
- new deterministic ingestion Workflow implementation.
- Lite real Raw → Knowledge Base E2E validation.

## Current Architecture Baseline

- Knowledge Schema: 0.3
- Storage Format: 1
- Current reasoning host: Codex
- Custom Agent Runtime: none
- DSH/Harness dependency: none planned

## Next Authorized Engineering Task

**RHL-MIGRATION-002 — Knowledge Schema + Storage Core Migration**

No Workflow implementation should begin before the Knowledge Schema + Storage Core migration is reviewed and accepted.
