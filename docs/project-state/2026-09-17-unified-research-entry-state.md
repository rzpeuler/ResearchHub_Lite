# Unified Research Entry — Current State

Date: 2026-09-17

## Implemented

- `ResearchRequest` and validated `ResearchDispatchDecision` are the typed entry contract.
- Explicit Workflow selection is authoritative; free routing scores the registered Workflow definitions before eligible Research Skills and Free Research.
- Production dispatch uses the existing `ReasoningExecutor` boundary for semantic intent resolution. Its structured `ResearchDispatchDecision` is validated, repaired at most once, and falls back safely; it cannot change explicit Workflow IDs or request policies.
- Runtime identity extraction has no product hardcoded company-alias table. Deterministic fallback accepts a six-digit symbol; name-only identity remains a missing input unless Knowledge or the semantic resolver supplies identity evidence.
- Workflow definitions and ResearchHub Skill classifications are exposed by registries. Pi Skills remain a separate namespace.
- Chat exposes the Workflow selector and explicit `structuredKnowledge`, `sourceLibrary`, and `writeKnowledge` controls.
- `writeKnowledge: false` is enforced at the Knowledge Production Gateway and is propagated through the research workflows; canonical revision and ReviewCases remain unchanged.
- Each started dispatch persists a `ResearchBundle`; its structured result, report reference, and proposal projections share one execution result.
- Source Library is a rebuildable lexical index over Raw records with `rawRef` provenance. Search returns no hits when the policy is disabled.
- External Skill onboarding requires safe inspection, pinned GitHub provenance, deterministic classification, and fail-closed unsafe installation. Fixed-commit GitHub archives are fetched into a temporary directory, path-checked, inspected, installed, and recorded; repeated installs of the same provenance are idempotent. Only an onboarded `research` Skill can be registered for research dispatch.
- Pi exposes governed `inspect_external_skill` and `install_external_skill` tools backed by `SkillOnboardingService`. Installation requires HTTPS GitHub plus a 40-character commit pin; unsafe content is rejected unless the caller explicitly approves it. Installed ResearchHub Skills enter the ResearchHub registry and remain separate from `.pi/skills/`.
- Source Library retrieval occurs before semantic dispatch reasoning when enabled. Hits are injected into downstream Workflow semantic calls and into the Pi `search_source_library` capability; the implementation is lexical Source Retrieval, not vector RAG. `sourceLibrary: false` prevents both pre-retrieval and tool access.
- Free/Skill session prompts receive the selected ResearchHub Skill definitions (`intentDescription`, `whenToUse`, and `outputContract`) plus bounded Source Library provenance. The finalized session `ResearchBundle` records the answer, selected skills, hits, entities, evidence refs, and proposal candidates.
- Free/Skill session dispatch returns a bundle run ID; the conversation command associates that ID and finalizes the bundle from the captured assistant message. Empty capture is recorded as a failure rather than a synthetic success.
- Session-bound ResearchRequest policy is installed in the Pi tool context for the duration of the prompt: Knowledge reads and production writes are denied when disabled, and research adapters receive the request's persistence/context flags.
- The read-only Research Bundles page lists bundle artifacts, proposals, attached Source Library hits, bounded structured-result previews, and direct Raw-backed Source Library search.
- Source Library HTTP enabled/disabled behavior is covered by a runtime route test.

## Binding boundaries

- Workflow owns deterministic routing and execution control.
- Skill owns semantic methodology and proposal generation.
- Plugin owns external capability integration.
- Knowledge Gateway, ChangeSet validation, and Writer remain the only canonical Knowledge mutation path.
- Raw remains the original evidence store; Source Library is derived and rebuildable.

## Validation evidence

- Focused dispatch, bundle, Source Library, onboarding, session-finalization, and Gateway policy tests pass.
- Client tests pass (28 tests); root Node tests pass 1,014/1,014.
- `npm run typecheck`, `npm run client:typecheck`, and `npm run client:build` pass; the client build transforms 176 modules.
- The existing Windows `EBUSY` process-tree cleanup race was made retry-safe and no longer reproduces in the full run.
- `npm run acceptance:unified-research` passes and writes the fixture-backed A–G runtime evidence to `docs/project-state/evidence/2026-09-17-unified-research-entry-a-g.json`. The artifact explicitly does not claim authenticated provider E2E; the GitHub case uses a mocked codeload response at a fixed commit.
- `npm run acceptance:unified-research-closure` passes all C1–C7 cases and writes `docs/project-state/evidence/2026-09-17-unified-research-entry-closure.json`. The artifact is fixture-backed, records semantic resolution, pre-reasoning lexical retrieval, OFF blocking, Pi-to-onboarding registration, unsafe fail-closed behavior, and makes no authenticated provider claim.

## Closure status

- Original A–G acceptance remains passing, and the new unified-entry closure C1–C7 acceptance is passing. Final commit and `origin/main` equality are recorded only after the final regression, commit, push, and remote verification for this closure change.
- This evidence is fixture-backed. It does not establish authenticated external-provider E2E availability; provider transport, model availability, and live GitHub availability remain environment-dependent.
