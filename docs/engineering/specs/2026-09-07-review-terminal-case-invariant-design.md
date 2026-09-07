# Review Terminal / Durable ReviewCase Invariant

## Objective

Ensure Raw Document Knowledge Ingestion derives successful terminal status from the durable actionable ReviewCase set, not from ReviewSummary telemetry.

## Frozen semantics

- `blocked` remains the terminal state for failed deterministic Knowledge validation.
- `completed_with_review` is valid only when at least one durable actionable ReviewCase is built and persisted.
- `completed` is valid when no durable actionable ReviewCase exists, including when `ReviewSummary.total > 0` because telemetry contains extraction rejection or other non-actionable diagnostics.
- ReviewSummary remains complete quality telemetry and is not filtered to mimic ReviewCase state.

## Implementation boundaries

1. Update every Raw Document Knowledge Ingestion status decision path—normal completion, no-change, Writer/ChangeSet status hint, and replay—to use the durable ReviewCase set.
2. Normalize legacy replay projections from authoritative recovered ReviewCases without rewriting historical execution logs.
3. Add a minimal ProductionService defensive check that rejects success states inconsistent with `workflow.reviewCases?.length` before exposing the result through Application APIs.
4. Keep ReviewCase schema, taxonomy, Review API/UI, Knowledge schema, Writer transaction architecture, Pi, Provider, Docling, Graph, Attachment, and frozen architecture unchanged.
5. Correct validation evidence `currentRun`/`classification` consistency only; do not modify historical RERUN-003 or restart-persistence raw evidence.

## Validation

Offline tests cover telemetry-only completion, actionable ReviewCase completion, both impossible ProductionService states, no-change and Writer hints, durable Review replay, and legacy replay normalization. A validation-only targeted real run uses the configured real Zhipu Provider, PiReasoningExecutor, Docling, Attachment API, Production API, Workflow API, and Review API. It does not run Free Research, Browser smoke, full Production E2E, or Runtime B restart.

Evidence is written to `tests/validation/evidence/rhl-review-terminal-case-invariant-001.json` and `tests/validation/evidence/RHL_REVIEW_TERMINAL_CASE_INVARIANT_001_SUMMARY.md`.

## Acceptance boundary

The task is recorded as `executed / CTO acceptance pending`. Even if the targeted real reproduction passes, Runtime restart persistence remains a separate validation task and is not resumed automatically.
