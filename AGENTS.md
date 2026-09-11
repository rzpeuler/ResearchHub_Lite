# ResearchHub Lite — Agent Entry Guide

> Governance notice: this file is repository guidance, not active governance. The only authoritative governance entry point is docs/governance, and docs/governance/governance-manifest.yaml is the only active-source registry.

ResearchHub_Lite is the active clean foundation of the ResearchHub Agent-first investment research application.

It is focused on:

1. Agent-first Free Research, Knowledge Query, and Knowledge Production.
2. Knowledge architecture, validation, provenance, and canonical persistence.

Before making any engineering change:

1. Read docs/governance/README.md.
2. Read docs/governance/governance-manifest.yaml.
3. Read every document registered by that manifest with status: active that applies to the current role and scope.
4. Follow the approved task and its architecture revision set.
5. Consult the relevant documents under docs/architecture/, docs/engineering/, and other repository documentation only as technical or historical context. Those files do not become active governance merely because they contain status words such as FROZEN, NORMATIVE, PASS, or CLOSED.

If non-governance documentation conflicts with active governance, active governance wins. If the conflict cannot be resolved safely within the approved scope, report the governance gap or block the dependent work rather than inventing a rule.

## Current architecture context

The following points describe the current repository architecture. They do not independently create governance authority.

- Do not build a custom Agent Runtime.
- Do not introduce DeepSeek Harness / DSH dependencies.
- Workflow owns deterministic execution control and routing.
- Skill owns professional semantic methodology.
- Plugin owns external capability integration, including Pi-specific reasoning-host integration.
- Pi Coding Agent is the canonical application host; Agent-host portability is not a product requirement.
- ReasoningExecutor is the Workflow semantic-operation boundary and deterministic testing seam, not host-portability architecture.
- Pi-specific application integration belongs under app/pi/; business semantics remain under Workflow, Skill, Plugin, and Knowledge.
- Application Runtime v0.1 is implemented and accepted; use the approved task and architecture revision set to determine the architecture scope that is binding for new work.
- Runtime v0.1 is local-first with one Node process, direct Pi SDK embedding, React + TypeScript + Vite, HTTP JSON + SSE, and no WebSocket.
- Do not introduce Pi RPC subprocess integration, direct browser filesystem/Knowledge access, arbitrary frontend canonical writes, or Next.js as the backend runtime.
- Canonical Knowledge mutation is allowed only through the ResearchHub Knowledge Production path, validated ChangeSet, and Writer.
- Pi Agent Skills under .pi/skills/ and ResearchHub Skills under skills/ are distinct; their contexts must not be conflated.
- Knowledge Base runtime data is not source code.
- Do not use this guide as Knowledge Schema-version authority; use the mounted Knowledge Base contract and the approved task context.
- Do not revive fixed chunk → batch → extraction as the current ingestion architecture.
- Do not port the original monolithic ingestion workflow.ts wholesale.

Engineering completion is not architecture acceptance. Every completed engineering task must be independently reviewed against the repository state, active governance, and the architecture revision set approved for that task.
