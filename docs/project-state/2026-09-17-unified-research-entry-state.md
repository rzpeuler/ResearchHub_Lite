# Unified Research Entry — Current State

Date: 2026-09-17

## Implemented

- `ResearchRequest` and validated `ResearchDispatchDecision` are the typed entry contract.
- Explicit Workflow selection is authoritative; free routing scores the registered Workflow definitions before eligible Research Skills and Free Research.
- Workflow definitions and ResearchHub Skill classifications are exposed by registries. Pi Skills remain a separate namespace.
- Chat exposes the Workflow selector and explicit `structuredKnowledge`, `sourceLibrary`, and `writeKnowledge` controls.
- `writeKnowledge: false` is enforced at the Knowledge Production Gateway and is propagated through the research workflows; canonical revision and ReviewCases remain unchanged.
- Each started dispatch persists a `ResearchBundle`; its structured result, report reference, and proposal projections share one execution result.
- Source Library is a rebuildable lexical index over Raw records with `rawRef` provenance. Search returns no hits when the policy is disabled.
- External Skill onboarding requires safe inspection, pinned GitHub provenance, deterministic classification, and fail-closed unsafe installation. Fixed-commit GitHub archives are fetched into a temporary directory, path-checked, inspected, installed, and recorded; repeated installs of the same provenance are idempotent. Only an onboarded `research` Skill can be registered for research dispatch.
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
- Client tests pass (28 tests); root Node tests pass 1,007/1,007.
- `npm run typecheck`, `npm run client:typecheck`, and `npm run client:build` pass; the client build transforms 176 modules.
- The existing Windows `EBUSY` process-tree cleanup race was made retry-safe and no longer reproduces in the full run.

## Remaining mission work

- Add `useStructuredKnowledge` enforcement inside the low-level Industry Research workflow itself; the application entry now fails closed before mounting/reading Canonical Knowledge when the policy is disabled.
- Run the realistic A–G acceptance matrix with saved runtime artifacts, parser preflight when applicable, and repository remote verification.
