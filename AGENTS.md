# ResearchHub Lite — Agent Entry Guide

ResearchHub_Lite is the active clean foundation of the ResearchHub Agent-first investment research application.

It is focused on:

1. Agent-first Free Research, Knowledge Query, and Knowledge Production.
2. Knowledge architecture, validation, provenance, and canonical persistence.

Before making any engineering change, read these documents in order:

1. `docs/governance/PROJECT_OVERVIEW.md`
2. `docs/governance/ARCHITECTURE.md`
3. `docs/governance/CURRENT_STATUS.md`
4. `docs/governance/DECISION_LOG.md`
5. `docs/governance/DEVELOPMENT_RULES.md`
6. `docs/governance/MIGRATION_MANIFEST.md`
7. `docs/architecture/RESEARCHHUB_APPLICATION_INTERACTION_ARCHITECTURE_V0.1.md`
8. `docs/architecture/RESEARCHHUB_APPLICATION_RUNTIME_CLIENT_ARCHITECTURE_V0.1.md`
9. The relevant document under `docs/architecture/`

## Non-negotiable boundaries

- Do not build a custom Agent Runtime.
- Do not introduce DeepSeek Harness / DSH dependencies.
- Workflow owns deterministic execution control and routing.
- Skill owns professional semantic methodology.
- Plugin owns external capability integration, including Pi-specific reasoning-host integration.
- Pi Coding Agent is the canonical application host; Agent-host portability is not a product requirement.
- `ReasoningExecutor` is the Workflow semantic-operation boundary and deterministic testing seam, not host-portability architecture.
- Pi-specific application integration belongs under `app/pi/`; business semantics remain under Workflow, Skill, Plugin, and Knowledge.
- Application Runtime/client architecture is frozen; Runtime implementation is the next engineering phase.
- Runtime v0.1 is local-first with one Node process, direct Pi SDK embedding, React + TypeScript + Vite, HTTP JSON + SSE, and no WebSocket.
- Do not introduce Pi RPC subprocess integration, direct browser filesystem/Knowledge access, arbitrary frontend canonical writes, or Next.js as the backend runtime.
- Canonical Knowledge mutation is allowed only through the ResearchHub Knowledge Production path, validated ChangeSet, and Writer.
- Pi Agent Skills under `.pi/skills/` and ResearchHub Skills under `skills/` are distinct; their contexts must not be conflated.
- Knowledge Base runtime data is not source code.
- Schema 0.3 / Storage Format 1 is the initial Knowledge baseline.
- Do not revive fixed `chunk → batch → extraction` as the current ingestion architecture.
- Do not port the original monolithic ingestion `workflow.ts` wholesale.

Engineering completion is not architecture acceptance. Every completed engineering task must be independently reviewed against the repository state and the frozen architecture.
