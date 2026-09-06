# ResearchHub_Lite

ResearchHub_Lite is the active clean foundation for the ResearchHub Agent-first investment research application. It is built on the Pi Coding Agent and preserves the deterministic Knowledge architecture needed for safe durable research.

## Product model

```text
User
  → Pi Coding Agent
  → Free Research / Knowledge Query / Knowledge Production
```

- **Free Research** is exploratory and non-persistent by default.
- **Knowledge Query** is read-only and returns bounded Knowledge projections or references.
- **Knowledge Production** is explicit durable work that enters a product-level Application Tool and deterministic Workflow.

Review is downstream governance for Knowledge Production, not a fourth research mode. Canonical persistence requires explicit Knowledge Production intent; an upload or attachment is not automatically ingestion.

## Current architecture

Pi Coding Agent is the canonical application host. ResearchHub directly reuses Pi's Agent loop, `ModelRuntime`, authentication, provider/model catalog, file-backed settings, Skills/Extensions, normal coding-agent tools, and session/runtime facilities. Agent-host portability is not a current product requirement.

ResearchHub owns the product semantics:

- `app/pi/` — Pi application session and product-level tools;
- `workflows/` — deterministic lifecycle, routing, validation, and write authorization;
- `skills/` — ResearchHub semantic research Skills;
- `plugins/` — document, evidence, and host integration;
- `knowledge/` — Schema, provenance, resolution, validation, and canonical persistence;
- `runtime-data/` — runtime Knowledge Base data;
- `tests/` — deterministic and integration regressions.

The next engineering direction is `app/services/`, a thin Application Service layer shared by Pi Application Tools and future UI/API surfaces. It is not implemented by this documentation task.

`ReasoningExecutor` remains the Workflow semantic-operation boundary and deterministic testing seam. It is not a product-level host-portability architecture. Conversation context and Workflow semantic context remain separate even when they share Pi `ModelRuntime`.

Application Tools expose product actions such as query, ingestion, workflow status/cancel, and Review reads. They must not expose Knowledge mutation primitives such as `create_entity`, `create_relation`, `create_claim`, `create_changeset`, `commit_changeset`, or `write_registry`.

Pi Agent Skills under `.pi/skills/` are host/Agent capabilities. ResearchHub Skills under `skills/` provide domain methodology. Neither changes the canonical mutation boundary: durable Knowledge changes pass through the ResearchHub Knowledge Production path, validated ChangeSet, and Writer.

Workspace files, uploads, and attachments may be read or analyzed during Free Research. Formal canonical ingestion starts only after explicit Knowledge Production intent and establishes the required Raw/Source provenance.

## Current ingestion direction

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
Deterministic Knowledge Resolution + bounded Semantic Cases
        ↓
Resolve References + Plan ChangeSet
        ↓
Final Deterministic Validation
        ↓
Atomic Write
        ↓
Reload & Verify
```

LLM reasoning owns semantic decomposition; Workflow owns execution control; deterministic code owns plan admissibility and Knowledge integrity.

## Governance and architecture

Start with [AGENTS.md](AGENTS.md), then read the governance and architecture documents:

- [ResearchHub Application Interaction Architecture v0.1](docs/architecture/RESEARCHHUB_APPLICATION_INTERACTION_ARCHITECTURE_V0.1.md)
- [Knowledge Production Architecture v0.1](docs/architecture/KNOWLEDGE_PRODUCTION_ARCHITECTURE_V0.1.md)
- [Review Governance v0.1](docs/architecture/REVIEW_GOVERNANCE_V0.1.md)
- [Governance Architecture](docs/governance/ARCHITECTURE.md)
- [Current Status](docs/governance/CURRENT_STATUS.md)

Migration material remains available as historical, selective reuse guidance; ResearchHub_Lite is not a clone of the original ResearchHub.
