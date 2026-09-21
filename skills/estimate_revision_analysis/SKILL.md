# Estimate Revision Analysis

## Purpose

Describe how an attributable estimate changed from an old point-in-time state
to a newer one.

## Invocation Match

Use this Skill when the question asks how estimates were revised, which metrics
changed, or whether revisions broadened or narrowed. Do not use it for the
current consensus snapshot alone or for reported actual-vs-consensus variance.

## Typical Intents

- “What changed in estimates since the last report?”
- “Which forward metric was revised down?”

## Inputs

Old and new estimate observations, metric and fiscal period, contributor/source
identity, publication timestamps, as-of boundary, units, and source refs.

## Produces

Old-to-new estimate deltas, direction and magnitude diagnostics, contributor
coverage, PIT evidence refs, and research gaps.

## Methodology

Pair only like-for-like estimates; verify old publication precedes new
publication; compute absolute and percentage revisions deterministically; keep
contributor and period identity; and distinguish a revision from a newly
observed consensus level.

## Evidence Requirements

Both sides of a revision require attributable observations and valid publication
times. The requested as-of boundary applies to the new observation.

## Deterministic / Model Boundary

Code owns pairing, arithmetic, ordering, and eligibility. The model may explain
possible reasons only when supported by supplied evidence.

## Missing Data

Without both old and new eligible observations the result is `unavailable`, not
zero, estimated, or inferred.

## Validation / QC

Reject period/metric mismatches, duplicate pairs, reversed timestamps, invalid
numbers, and missing source bindings.

## Related Skills

`consensus_expectations_analysis`, `earnings_variance_analysis`, and
`guidance_analysis` may be composed by Earnings Review Workflow.
