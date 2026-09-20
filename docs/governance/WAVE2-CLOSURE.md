# ResearchHub Lite — Wave 2 Governance State

Updated: 2026-09-20

This is the concise current governance record for Wave 2. Older project-state
files and task reports remain historical evidence and are not active task
registries.

## Current baseline

- Wave: `Wave 2 — Earnings Expectations Core`
- Status: `COMPLETE / CLOSED`
- Accepted implementation HEAD: `18259cb7bcb1f42e35669c01b0cfa5af22c3bb16`
- Closure / promoted main baseline: `origin/main` (final FF-only promoted commit recorded in delivery history)
- Current active phase: post-Wave-2 closure
- Next development track: `PENDING POST-CLOSURE DECISION`

## Task status

| Task | Status |
| --- | --- |
| W2-001 Expectations Domain + Deterministic Comparison Engine | COMPLETE |
| W2-002 Estimate / Consensus Knowledge Projection | COMPLETE |
| W2-003 Guidance Core | COMPLETE |
| W2-004 Earnings Review Expectations Integration | COMPLETE |
| W2-005 Valuation Impact + Thesis Filter | COMPLETE |

## Frozen Wave 2 boundaries

- Point-in-time expectations are mandatory when expectation analysis is supplied.
- Durable Estimate / Consensus persistence is separate from derived analytical deltas.
- Actual-vs-consensus, estimate revisions, Guidance analysis, Segment KPI deltas,
  valuation bridges, and Thesis filtering are report-level analytical results
  unless another explicit governed persistence path exists.
- LLM reasoning does not own numerical expectation arithmetic.
- Valuation Impact signals valuation-input refresh only; it does not calculate a
  target price.
- Thesis relevance uses existing first-class Thesis and ReasoningEdge context and
  does not mutate Thesis state.
- No Knowledge Schema revision was required, and no new top-level research Skill
  was created.

## Remaining acquisition gap

`EXPECTATION-SOURCE-001` remains a candidate next track for point-in-time
expectation acquisition. It was not part of Wave 2 and is not implemented or
accepted here. Its absence does not make the Wave 2 method implementation
incomplete; Wave 2 consumes explicit historical expectation data when supplied.

## Next-track decision state

- Wave 2: closed.
- Preferred candidate: `EXPECTATION-SOURCE-001`.
- Candidate status: `PENDING POST-CLOSURE DECISION`.
- Wave 3: not started; status `PENDING POST-CLOSURE DECISION`.

## Closure history

On 2026-09-20, the accepted W2-005 implementation chain was reconciled with
the Wave 2 engineering specification and this governance state. The closure
branch passed the release-level regression gate and was promoted to `main`
using FF-only history.
