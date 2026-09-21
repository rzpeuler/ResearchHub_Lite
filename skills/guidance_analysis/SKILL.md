# Guidance Analysis

## Purpose

Analyze forward management guidance and its change versus prior guidance and
eligible consensus.

## Invocation Match

Use this Skill when the question asks what management guided, how guidance
changed, or whether guidance is above/below expectations. Do not use it to
explain the already-reported actual beat or to describe estimate revisions.

## Typical Intents

- “How did guidance change from last quarter?”
- “Is management’s FY guidance above consensus?”

## Inputs

Guidance metric and fiscal period, current and prior guidance, publication
timestamps, point-in-time consensus when available, units, and source refs.

## Produces

Guidance-vs-prior deltas, guidance-vs-consensus relationships, range/midpoint
diagnostics, evidence refs, and explicit availability gaps.

## Methodology

Normalize point or range guidance without collapsing ranges; compare like-for-
like metrics and periods; calculate low/high/midpoint deltas in code; enforce
publication ordering; and label management commentary separately from numeric
guidance.

## Evidence Requirements

Current and prior guidance must be attributable and dated. Consensus must be
available no later than the relevant guidance publication; later snapshots are
ineligible.

## Deterministic / Model Boundary

Code owns range math, period matching, ordering, and relationship labels. The
model may explain implications but cannot upgrade an unavailable range.

## Missing Data

Missing guidance or consensus is `unavailable`, not zero or inferred. A
qualitative statement without a bounded numeric range remains a gap.

## Validation / QC

Reject invalid ranges, reversed bounds, mismatched periods, future snapshots,
and unbound evidence.

## Related Skills

`consensus_expectations_analysis`, `earnings_variance_analysis`, and
`estimate_revision_analysis` are peer Workflow steps.
