# ResearchHub_Lite — Project Overview

## 1. Project Positioning

ResearchHub_Lite is the active clean foundation for the ResearchHub Agent-first investment research application. It preserves the useful Knowledge architecture and deterministic integrity of the Lite workstream without restoring the runtime and product complexity of the original ResearchHub.

Personal Research v1 Daily Intelligence M2 is PASS / CLOSED by CTO acceptance: Morning and Evening Briefs are bounded by the configured watchlist and public-source catalog, use the shared Runtime/CLI/Scheduler/Pi composition, expose real semantic telemetry with explicit unavailable provider states and no fabricated consensus, and require Change Assessment durable eligibility before canonical proposal submission.

Pi Coding Agent is the canonical application host. ResearchHub directly reuses Pi's Agent loop, ModelRuntime, settings, authentication, provider/model catalog, Skills/Extensions, and session/runtime facilities. Agent-host portability is not a current product requirement.

Production Baseline v1 is established by CTO decision. The accepted compositional baseline is recorded in `docs/governance/PRODUCTION_BASELINE_V1.md`; its product implementation baseline is `5319d130952f4c784f5829890591b64dcd5f72a4`, its accepted pre-freeze repository/governance baseline is `3d6f0212b7500b11d806b444dadbf550af1e80de`, and the freeze decision is recorded by commit `0697dee129b539857b9104ffffef85693a4382e5`.

Repository physical ownership is frozen in [`docs/architecture/RESEARCHHUB_LITE_REPOSITORY_LAYOUT_V1.md`](../architecture/RESEARCHHUB_LITE_REPOSITORY_LAYOUT_V1.md). The layout is a physical mapping of existing architecture, not a new architecture layer; no migration is implied by the freeze.

## 2. Product Interaction Model

The primary user interactions are:

1. **Free Research** — exploratory analysis, non-persistent by default.
2. **Knowledge Query** — read-only access to bounded canonical Knowledge projections or references.
3. **Knowledge Production** — explicit durable research that may change canonical Knowledge through the governed production path.

Review is downstream Knowledge Production governance, not a fourth research mode. Canonical persistence requires explicit Knowledge Production intent. Upload and attachment handling are separate from formal canonical ingestion.

## 3. Product Boundaries and Deferred Work

The Lite simplification remains intentional:

- no custom Agent Runtime;
- no DSH / DeepSeek Harness;
- no generic Capability, Provider, Planner, ResearchManager, or Agent/Candidate framework layers;
- no host-portability abstraction;
- deterministic Knowledge integrity through ChangeSet, Validation, and Writer.

The following remain deferred unless separately approved:

- Theme Framework implementation;
- Industry Deep Research;
- ReviewDecision;
- Graph Database;
- Vector Database;
- RAG;
- multi-agent orchestration;
- generic Workflow Engine;
- Memory, Evaluation, and Research Artifact systems.

The Application Runtime and Client architecture remains frozen in `docs/architecture/RESEARCHHUB_APPLICATION_RUNTIME_CLIENT_ARCHITECTURE_V0.1.md`: local-first single-user Node.js runtime, direct Pi SDK embedding, React + TypeScript + Vite browser client, and HTTP JSON + SSE. The implemented Runtime, Homepage, Knowledge Graph, and read-only Review surfaces are part of Production Baseline v1.

## 4. Execution and Application Layers

ResearchHub keeps the Workflow / Skill / Plugin / Knowledge separation.

### Pi Application Host

Pi owns the user-facing Agent experience and directly supplies the model/provider/auth/settings runtime and normal coding-agent capabilities. Pi-specific application integration belongs under `app/pi/`.

### Application Services

The implemented thin `app/services/` layer is shared by Pi Application Tools and the future Runtime/browser Product API. Services coordinate existing domain capabilities without becoming a generic service framework.

### Current Product Layer

The local Application Runtime, Homepage Shell, read-only Knowledge Graph, and read-only Review surface are implemented under the frozen architecture. The Runtime owns Pi session lifecycle, HTTP JSON, SSE, attachments, and local runtime security; the browser consumes Product APIs and shared Application Services rather than accessing filesystem or Knowledge storage directly.

The next phase is Knowledge Production / Knowledge Architecture iteration. Production stabilization is complete for Baseline v1; do not automatically start Production E2E reruns, provider architecture work, Runtime refactors, or harness expansion.

Personal Research v1 Company Deep Research is now the first additional Knowledge Producer. It is implemented only for the A-share company slice and requires an explicit Schema 0.4 / Storage 1 fresh Knowledge Base; existing Schema 0.3 runtime data is not automatically migrated.

### Application Tools

Agent-facing tools express product actions, not low-level canonical mutation primitives. They may query Knowledge, start approved production, observe or cancel a Workflow, and read Review state. They must not expose operations such as `create_entity`, `create_relation`, `create_claim`, `create_changeset`, `commit_changeset`, or `write_registry`.

### Workflow

Workflow owns execution order, conditional routing, retries, blocking, bounded parallel scheduling, authoritative `WorkflowRun` state, validation, write authorization, and completion.

### Skill

Skill owns professional semantic methodology such as report understanding, semantic decomposition, candidate extraction, and reconciliation. ResearchHub Skills under `skills/` are distinct from Pi Agent Skills under `.pi/skills/`. Agent context and Workflow semantic context remain separate.

### Plugin

Plugin owns external capabilities and host-specific integration, including document parsing, filesystem/external I/O, and the Pi reasoning integration.

### Knowledge Domain

Knowledge owns deterministic domain rules and persistence integrity. Canonical mutation remains inside the Knowledge Production path:

```text
Knowledge Production → Workflow → ChangeSet → Validation → Writer
```

`ReasoningExecutor` remains the Workflow semantic-operation boundary and deterministic testing seam. It is not a host-portability architecture.

## 5. Knowledge Baseline and Runtime Boundary

ResearchHub_Lite starts from:

- Knowledge Schema: `0.3`;
- Storage Format: `1`.

Knowledge Base instance data is runtime data and must remain separate from source code. The conceptual default is:

```text
runtime-data/
└── knowledge-bases/
```

Application Context should store bounded references and lightweight execution state, not the entire Knowledge Base or large Knowledge payloads. Detailed Knowledge is retrieved through bounded query capabilities.

Formal ingestion starts only after explicit Knowledge Production intent:

```text
workspace/uploads/<file> → AttachmentRef → ingest_document → Raw Archive → Ingestion Workflow
```

Upload is not ingestion, and Free Research output is not canonical Evidence without formal provenance.

## 6. Source Baseline

Initial migration reference:

- Original repository: `https://github.com/rzpeuler/ResearchHub`;
- Baseline commit: `4c141172d6ba4123e909f0d8b9481072912e3ef2`.

Migration remains selective reuse, not repository cloning. Historical migration governance remains in `docs/governance/MIGRATION_MANIFEST.md`.
