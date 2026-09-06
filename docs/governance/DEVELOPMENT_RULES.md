# ResearchHub_Lite — Development Rules

These rules are mandatory unless explicitly superseded by a recorded architecture decision.

## 1. Runtime and Host

1. Do not build a custom Agent Runtime.
2. Do not add DSH / DeepSeek Harness dependencies.
3. Do not recreate Capability, Provider, Planner, or ResearchManager layers.
4. Pi Coding Agent is the canonical application host and is not the Workflow control plane. Agent-host portability is not a product requirement.
5. Do not build a Host portability abstraction. `ReasoningExecutor` remains the Workflow semantic-operation boundary and deterministic testing seam, not host-portability architecture.
6. Pi-specific application integration belongs under `app/pi/`; Workflow, Skill, Plugin, and Knowledge retain business and integrity semantics.

## 2. Workflow

7. Workflow owns routing and authoritative `WorkflowRun` lifecycle state.
8. The reasoning host must not choose arbitrary next nodes.
9. Workflow must not bypass deterministic validation.
10. Workflow must not import application-host-specific code, including Pi- or Codex-specific code.
11. Retry must be bounded and explicit.
12. Parallel extraction must be bounded and explicit.
13. All required ExtractionUnits must meet at a consolidation barrier before canonical resolution.

## 3. Skill

14. Skill owns professional semantic methodology.
15. Skill must not import application-host-specific code, including Pi- or Codex-specific code.
16. Knowledge Curation Skill must not write canonical Knowledge.
17. Skill may propose semantic decomposition, but may not authorize its own execution path.
18. Semantic repair after deterministic rejection must be bounded.

## 4. Plugin

19. Host-specific reasoning integration belongs under `plugins/reasoning/<host>/` and Pi application integration under `app/pi/`.
20. Document parsing belongs behind the document Plugin boundary.
21. Plugin code must not duplicate Knowledge Writer logic.

## 5. Knowledge Domain

22. Knowledge Schema baseline is 0.3 / Storage Format 1.
23. Schema 0.3 changes require explicit architecture approval.
24. Do not introduce automatic legacy schema migration.
25. Do not port v0.2 compatibility solely to satisfy legacy imports.
26. Knowledge provenance remains `Knowledge → Source → Raw`.
27. Canonical IDs are allocated deterministically.
28. ExtractionUnits use only local candidate IDs.
29. ExtractionUnits must not mutate the Knowledge Base.
30. Final semantic persistence requires a validated ChangeSet.
31. Writer must preserve revision, stale-target, idempotency, staging, validation, and atomicity semantics.
32. Runtime Knowledge Base data is not source code and is Git-ignored by default.

## 6. Application Boundaries

33. Free Research must not automatically persist canonical Knowledge; canonical mutation requires explicit Knowledge Production intent.
34. Application Tools must expose product-level actions and must not expose canonical mutation primitives such as `create_entity`, `create_relation`, `create_claim`, `create_changeset`, `commit_changeset`, or `write_registry`.
35. Application Services must remain thin. Pi tools and future UI/API must share them rather than duplicate business logic.
36. Application Context stores bounded references and lightweight state, not entire Knowledge Base payloads.
37. Upload is not ingestion. Attachments become canonical Raw/Evidence only through the formal Knowledge Production path.
38. WorkflowRun progress and status are authoritative; an Agent must not invent them.
39. `ReviewCase` is downstream actionable governance; `ReviewSummary` is execution telemetry.
40. Do not expose `resolve_review_case` before `ReviewDecision` exists and is implemented through the Knowledge Integrity path.
41. Pi Agent Skills under `.pi/skills/` and ResearchHub Skills under `skills/` remain separate contexts.

## 7. Document and Extraction Model

42. Do not use page-count thresholds as the semantic extraction planning rule.
43. Do not revive fixed `chunk → batch → extraction` as the primary Workflow architecture.
44. Block is a provenance anchor.
45. ExtractionUnit is a semantic reasoning context.
46. ExtractionUnits may cross Section boundaries.
47. A Block may appear in multiple Units where context requires it.
48. Prefer `primaryRefs` and `contextRefs` to distinguish extraction responsibility from supporting context.

## 8. Migration Discipline

49. Migration classifications are `COPY`, `ADAPT`, `REFERENCE`, or `EXCLUDE`.
50. Do not clone the original ResearchHub repository into Lite.
51. Do not migrate old code merely to satisfy import chains.
52. Prefer removing obsolete dependency chains over adding compatibility layers.
53. The original monolithic ingestion Workflow is reference-only.
54. Legacy v0.2 loaders, migration code, and legacy Writer are excluded from Lite v0.1.

## 9. Scope Control

55. Do not add Graph DB, Vector DB, or RAG without architecture approval.
56. Frontend implementation is not yet authorized, but the frozen v0.1 client technology is React + TypeScript + Vite and the frozen transport is HTTP JSON + SSE; do not implement either until the Runtime/Homeshell tasks are authorized.
57. Keep dependencies minimal.

## 10. Application Runtime and Client

65. Runtime v0.1 remains local-first, single-user, and loopback-bound by default.
66. Use one Node.js / TypeScript Application Runtime process; do not introduce microservices, Redis, queues, or worker clusters.
67. Embed Pi through the SDK; do not integrate Pi through an RPC subprocess.
68. Do not build ResearchHub conversation persistence; use Pi session infrastructure.
69. Use Pi AgentSessionRuntime for conversation lifecycle, with at most one active conversation runtime in v0.1.
70. Browser client technology is React + TypeScript + Vite.
71. Browser code must not access the filesystem, canonical Knowledge storage, or Writer directly.
72. Browser Product APIs must use the existing shared Application Services.
73. HTTP JSON + SSE is the current v0.1 transport; do not add WebSocket without a new architecture decision.
74. Do not stream raw model hidden reasoning, system prompts, credentials, raw stacks, or unrestricted internal tool payloads.
75. Upload creates an AttachmentRef only; upload is not canonical ingestion.
76. Browser-facing file identifiers must be attachment IDs, never arbitrary host filesystem paths.
77. Canonical Knowledge files must never be statically served.
78. Runtime mutation APIs require same-origin protection and a runtime nonce/token; do not add login, RBAC, JWT, or multi-user identity in v0.1.
79. Do not create a generic Event Bus or Workflow Engine for client streaming or observation.
80. Workflow progress must remain authoritative; Workflow polling is the current v0.1 observation design.

## 11. Governance and Git

81. `CURRENT_STATUS.md` is a compact current snapshot, not an append-only history.
82. Record only material architecture/product decisions in `DECISION_LOG.md`.
83. Update governance when the architecture or implementation state materially changes.
84. Every completed engineering task must be committed and pushed.
85. Return the exact commit hash in the engineering report.
86. A clean working tree is required at task completion.
87. Engineering completion does not equal CTO/System Architect acceptance.
