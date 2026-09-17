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
- External Skill onboarding requires safe inspection, pinned GitHub provenance, deterministic classification, and fail-closed unsafe installation. Only an onboarded `research` Skill can be registered for research dispatch.

## Binding boundaries

- Workflow owns deterministic routing and execution control.
- Skill owns semantic methodology and proposal generation.
- Plugin owns external capability integration.
- Knowledge Gateway, ChangeSet validation, and Writer remain the only canonical Knowledge mutation path.
- Raw remains the original evidence store; Source Library is derived and rebuildable.

## Validation evidence

- Focused dispatch, bundle, Source Library, onboarding, and Gateway policy tests pass.
- Client tests pass (28 tests at the last full client run).
- Strict root TypeScript typecheck passes.
- The full Node run passed 1,004 of 1,005 tests; the only failure was a Windows `EBUSY` temp-directory cleanup race in the existing timed-out process-tree test. That test passed when rerun alone.

## Remaining mission work

- Complete the Free Research session execution handoff so its final result is attached to the pending bundle rather than only recording a session boundary.
- Load approved external research Skills into the runtime registry and implement the remote GitHub inspect/install adapter.
- Add complete bundle/source-library client views and route-level policy regression coverage.
- Run the realistic A–G acceptance matrix, parser preflight when applicable, full validation, and repository remote verification.
