# ResearchHub Lite — Agent Entry Guide

ResearchHub_Lite is a lightweight, runtime-neutral research knowledge system focused on:

1. Raw Document → Canonical Knowledge Base ingestion.
2. Knowledge architecture, validation, provenance, and persistence.

Before making any engineering change, read these documents in order:

1. `docs/governance/PROJECT_OVERVIEW.md`
2. `docs/governance/ARCHITECTURE.md`
3. `docs/governance/CURRENT_STATUS.md`
4. `docs/governance/DECISION_LOG.md`
5. `docs/governance/DEVELOPMENT_RULES.md`
6. `docs/governance/MIGRATION_MANIFEST.md`
7. The relevant document under `docs/architecture/`

## Non-negotiable boundaries

- Do not build a custom Agent Runtime.
- Do not introduce DeepSeek Harness / DSH dependencies.
- Workflow owns deterministic execution control and routing.
- Skill owns professional semantic methodology.
- Plugin owns external capability integration, including reasoning-host integration.
- Codex is the current reasoning host, not the owner of Workflow routing.
- Workflow and Skill must remain portable across reasoning hosts.
- Codex-specific integration may exist only behind the `ReasoningExecutor` plugin boundary.
- Knowledge Base runtime data is not source code.
- Schema 0.3 / Storage Format 1 is the initial Knowledge baseline.
- Do not revive fixed `chunk → batch → extraction` as the current ingestion architecture.
- Do not port the original monolithic ingestion `workflow.ts` wholesale.

Engineering completion is not architecture acceptance. Every completed engineering task must be independently reviewed against the repository state and the frozen architecture.
