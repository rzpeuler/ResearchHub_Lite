# ResearchHub_Lite — Development Rules

These rules are mandatory unless explicitly superseded by a recorded architecture decision.

## 1. Runtime and Host

1. Do not build a custom Agent Runtime.
2. Do not add DSH / DeepSeek Harness dependencies.
3. Do not recreate Capability, Provider, Planner, or ResearchManager layers.
4. Codex is the current reasoning host, not the Workflow control plane.
5. `ReasoningExecutor` must allow coding-agent execution and must not require direct model API integration.

## 2. Workflow

6. Workflow owns routing.
7. The reasoning host must not choose arbitrary next nodes.
8. Workflow must not bypass deterministic validation.
9. Workflow must not import Codex-specific code.
10. Retry must be bounded and explicit.
11. Parallel extraction must be bounded and explicit.
12. All required ExtractionUnits must meet at a consolidation barrier before canonical resolution.

## 3. Skill

13. Skill owns professional semantic methodology.
14. Skill must not import Codex-specific code.
15. Knowledge Curation Skill must not write canonical Knowledge.
16. Skill may propose semantic decomposition, but may not authorize its own execution path.
17. Semantic repair after deterministic rejection must be bounded.

## 4. Plugin

18. Host-specific reasoning integration belongs under `plugins/reasoning/<host>/`.
19. Document parsing belongs behind the document Plugin boundary.
20. Plugin code must not duplicate Knowledge Writer logic.

## 5. Knowledge Domain

21. Knowledge Schema baseline is 0.3 / Storage Format 1.
22. Schema 0.3 changes require explicit architecture approval.
23. Do not introduce automatic legacy schema migration.
24. Do not port v0.2 compatibility solely to satisfy legacy imports.
25. Knowledge provenance remains `Knowledge → Source → Raw`.
26. Canonical IDs are allocated deterministically.
27. ExtractionUnits use only local candidate IDs.
28. ExtractionUnits must not mutate the Knowledge Base.
29. Final semantic persistence requires a validated ChangeSet.
30. Writer must preserve revision, stale-target, idempotency, staging, validation, and atomicity semantics.
31. Runtime Knowledge Base data is not source code and is Git-ignored by default.

## 6. Document and Extraction Model

32. Do not use page-count thresholds as the semantic extraction planning rule.
33. Do not revive fixed `chunk → batch → extraction` as the primary Workflow architecture.
34. Block is a provenance anchor.
35. ExtractionUnit is a semantic reasoning context.
36. ExtractionUnits may cross Section boundaries.
37. A Block may appear in multiple Units where context requires it.
38. Prefer `primaryRefs` and `contextRefs` to distinguish extraction responsibility from supporting context.

## 7. Migration Discipline

39. Migration classifications are `COPY`, `ADAPT`, `REFERENCE`, or `EXCLUDE`.
40. Do not clone the original ResearchHub repository into Lite.
41. Do not migrate old code merely to satisfy import chains.
42. Prefer removing obsolete dependency chains over adding compatibility layers.
43. The original monolithic ingestion Workflow is reference-only.
44. Legacy v0.2 loaders, migration code, and legacy Writer are excluded from Lite v0.1.

## 8. Scope Control

45. Do not add Graph DB, Vector DB, or RAG without architecture approval.
46. Do not add frontend, broad research workflows, Memory, Evaluation, or Research Artifacts during Lite v0.1 unless separately authorized.
47. Keep dependencies minimal.

## 9. Governance and Git

48. `CURRENT_STATUS.md` is a compact current snapshot, not an append-only history.
49. Record only material architecture/product decisions in `DECISION_LOG.md`.
50. Update governance when the architecture or implementation state materially changes.
51. Every completed engineering task must be committed and pushed.
52. Return the exact commit hash in the engineering report.
53. A clean working tree is required at task completion.
54. Engineering completion does not equal CTO/System Architect acceptance.
