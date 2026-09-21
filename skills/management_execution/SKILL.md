# Management Execution

## Purpose

Compare attributable management commitments with observable outcomes for the
target period.

## Invocation Match

Use only when dated commitments and dated outcomes are supplied. Do not score
personality, honesty, or management quality from generic prose.

## Typical Intents

- “What did management commit to, and what was delivered?”
- “Was the prior capacity or margin target met?”

## Inputs

Commitment statement, speaker, publication date, target metric/period/type,
numeric bounds or qualitative condition, outcome period/value or qualitative
result, and source references.

## Produces

Evidence-linked assessments: `met`, `partially_met`, `not_met`,
`not_yet_observable`, or `inconclusive`.

## Methodology

Match outcomes to the exact commitment period and compare numeric values with
code-owned bounds. Qualitative outcomes must carry an explicit evidence-based
result; absence of an outcome is not a miss.

## Evidence Requirements

Every commitment and outcome requires attributable source references and must
fall within the as-of boundary.

## Deterministic / Model Boundary

Code owns date boundaries, period matching, numeric comparisons, and status
vocabulary. A model may extract a candidate commitment from evidence but may
not invent target values or assessments.

## Missing Data

Missing outcomes remain `not_yet_observable` only when the target date is still
ahead; otherwise the result is `inconclusive`.

## Validation / QC

Reject duplicate commitments, invalid ranges, unit mismatches, future evidence,
and missing source refs. Never emit a personality score.

## Related Skills

`business_driver_analysis`, `financial_quality_analysis`, and
`capital_allocation_review` are peer methods composed by Company Workflows.
