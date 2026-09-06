# ResearchHub_Lite — Project Overview

## 1. Project Positioning

ResearchHub_Lite is the active clean foundation for the ResearchHub Agent-first investment research application. It preserves the useful Knowledge architecture and deterministic integrity of the Lite workstream without restoring the runtime and product complexity of the original ResearchHub.

Pi Coding Agent is the canonical application host. ResearchHub directly reuses Pi's Agent loop, ModelRuntime, settings, authentication, provider/model catalog, Skills/Extensions, and session/runtime facilities. Agent-host portability is not a current product requirement.

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
- Company Deep Research;
- ReviewDecision;
- Graph Database;
- Vector Database;
- RAG;
- multi-agent orchestration;
- generic Workflow Engine;
- Memory, Evaluation, and Research Artifact systems.

The Application Runtime and Client architecture is now frozen in `docs/architecture/RESEARCHHUB_APPLICATION_RUNTIME_CLIENT_ARCHITECTURE_V0.1.md`: local-first single-user Node.js runtime, direct Pi SDK embedding, React + TypeScript + Vite browser client, and HTTP JSON + SSE. The runtime/client are not yet implemented.

## 4. Execution and Application Layers

ResearchHub keeps the Workflow / Skill / Plugin / Knowledge separation.

### Pi Application Host

Pi owns the user-facing Agent experience and directly supplies the model/provider/auth/settings runtime and normal coding-agent capabilities. Pi-specific application integration belongs under `app/pi/`.

### Application Services

The implemented thin `app/services/` layer is shared by Pi Application Tools and the future Runtime/browser Product API. Services coordinate existing domain capabilities without becoming a generic service framework.

### Next Product Layer

The next phase is the local Application Runtime, followed by the Homepage Shell. The Runtime will own Pi session lifecycle, HTTP JSON, SSE, attachments, and local runtime security; the browser will consume Product APIs and shared Application Services rather than accessing filesystem or Knowledge storage directly.

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
