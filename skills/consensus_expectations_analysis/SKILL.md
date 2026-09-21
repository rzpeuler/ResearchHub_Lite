# Consensus Expectations Analysis

## Purpose

Describe the point-in-time consensus state available before or at the relevant
research cutoff.

## Invocation Match

Use this Skill when the question asks what analysts currently expected for a
metric, period, or company at a defined as-of time. Do not use it to explain a
reported beat, a guidance change, or an old-to-new estimate revision; those are
separate Skills.

## Typical Intents

- “What was consensus expecting before the result?”
- “What is the current point-in-time revenue consensus?”

## Inputs

Company/metric identity, fiscal period, explicit as-of cutoff, attributable
consensus observations, publication timestamps, contributor/source identity,
and source references.

## Produces

An availability-qualified consensus state, normalized observations, period and
PIT diagnostics, source references, and explicit research gaps.

## Methodology

Filter observations to the requested metric and fiscal period; reject snapshots
published after the cutoff; normalize units and contributor identity; preserve
the attributable observation set; and summarize only the eligible state.

## Evidence Requirements

Consensus observations must be attributable and point-in-time aligned. The
publication time and fiscal period must be explicit; post-result or post-cutoff
snapshots are not eligible.

## Deterministic / Model Boundary

Code owns filtering, period matching, unit normalization, and aggregation. The
model may explain the qualified state but cannot infer consensus or invent a
missing observation.

## Missing Data

Missing consensus is `unavailable`, never zero, estimated, or inferred. An
empty eligible set remains an explicit gap.

## Validation / QC

Reject mismatched periods, post-cutoff observations, duplicate contributor
records, invalid numbers, and unbound source references.

## Related Skills

`earnings_variance_analysis`, `guidance_analysis`, and
`estimate_revision_analysis` may consume this result through a Workflow.
