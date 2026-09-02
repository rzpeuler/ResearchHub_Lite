# ResearchHub_Lite

ResearchHub_Lite is the lightweight continuation of the ResearchHub Knowledge workstream.

Its purpose is deliberately narrow:

- ingest raw research documents;
- understand and extract durable investment knowledge;
- reconcile that knowledge with an existing Knowledge Base;
- validate provenance and canonical integrity;
- perform one safe atomic semantic write.

The project intentionally excludes the runtime and product surface area that created unnecessary engineering noise in the original ResearchHub.

## Current scope

ResearchHub_Lite v0.1 focuses on two outcomes:

1. **Raw Document → Canonical Knowledge Base Workflow**
2. **Knowledge Architecture and Storage Integrity**

## Architecture

Execution logic keeps three explicit responsibilities:

- **Workflow** — deterministic control plane and routing.
- **Skill** — professional semantic reasoning methodology.
- **Plugin** — deterministic external capability integration, including the active reasoning host.

Knowledge itself is a domain/infrastructure concern rather than a fourth execution layer.

The current reasoning host is Codex. ResearchHub_Lite does not build a custom Agent Runtime and does not bind its Workflow or Skill assets to Codex.

The portability seam is `ReasoningExecutor`:

```text
Workflow
   |
   +--> Skill --> ReasoningExecutor --> Codex / future agent
   |
   +--> Plugin
   |
   +--> Knowledge Domain
```

## Frozen ingestion direction

The current ingestion plan is:

```text
Intake & Raw Archive
        ↓
Parse Structured Document
        ↓
Understand + Plan
        ↓
Deterministic Plan Validation
        ↓
Bounded Parallel Extraction + Per-Unit Validation
        ↓
Candidate Consolidation
        ↓
Retrieve Existing Knowledge
        ↓
Reconcile
        ↓
Resolve References + Plan ChangeSet
        ↓
Final Deterministic Validation
        ↓
Atomic Write
        ↓
Reload & Verify
```

The important architecture rule is:

> LLM owns semantic decomposition; Workflow owns execution control; deterministic code owns plan admissibility and Knowledge integrity.

## Initial source baseline

The initial migration analysis is based on the original ResearchHub repository:

- Repository: `https://github.com/rzpeuler/ResearchHub`
- Baseline commit: `4c141172d6ba4123e909f0d8b9481072912e3ef2`

The target repository is:

- `https://github.com/rzpeuler/ResearchHub_Lite`

Migration is selective. ResearchHub_Lite is not a clone of the original repository.

## Governance

Start with `AGENTS.md`, then read `docs/governance/`.

The current engineering state is maintained in:

- `docs/governance/CURRENT_STATUS.md`

The authoritative architecture decisions are maintained in:

- `docs/governance/DECISION_LOG.md`
- `docs/governance/ARCHITECTURE.md`

The source-to-target migration policy is maintained in:

- `docs/governance/MIGRATION_MANIFEST.md`
