# Wave 2 Earnings Expectations Core

Date: 2026-09-18
Task: `W2-001 — Expectations Domain + Deterministic Comparison Engine`
Status: implementation slice; no Workflow or Knowledge integration

## Scope

The existing Earnings Review Skill owns a schema-neutral expectations domain.
This slice implements attributable estimate points, point-in-time matching,
latest-per-institution selection, consensus statistics, actual metric
adaptation, actual-vs-expectation comparisons, actual-vs-prior-estimate
matching, and estimate revision bridges.

It does not add a top-level Skill, Workflow, provider, acquisition call,
Knowledge projection, Knowledge Schema change, or durable persistence rule.

## Point-in-time discipline

Every estimate must have a finite value, metric, fiscal period, unit,
institution, valid publication timestamp, and at least one source candidate ID.
Estimates published after `asOf` are excluded. Consensus selection first
filters the requested metric and fiscal period, then retains exactly one latest
eligible estimate per institution. Ties at the same publication time are
resolved by estimate ID for deterministic replay. Duplicate estimate IDs are
excluded as integrity conflicts rather than selected by first-seen order.

Consensus requires an explicit minimum count of at least two. It reports
mean, median, high, low, count, population standard deviation, contributing
estimate IDs, and the common unit of its selected estimates. Mixed units or
insufficient contributors fail closed. Future and malformed records that are
excluded from selection retain diagnostics but do not invalidate an otherwise
valid point-in-time snapshot; exclusion diagnostics and blocking diagnostics
are semantically distinct.

## Comparison semantics

Actual-vs-expectation uses `actual - benchmark`; relative delta exists only
when the benchmark is non-zero. Direction is numeric (`above`, `below`, or
`in_line`) and is not an economic interpretation. Actual and benchmark must
match metric, fiscal period, and unit.

Prior-estimate comparison requires an explicit institution and selects only a
strictly older estimate for the same metric and fiscal period. Actual-vs-
consensus uses the consensus unit and fails closed on a unit mismatch; no unit
conversion is performed. Revision bridges require the same institution,
metric, fiscal period, and unit, with the new estimate published strictly
after the old estimate. Relative revision is omitted when the old estimate is
zero.

All derived comparison outputs are report-level analytical results. They do
not create canonical objects in W2-001.

## W2-002 durable Knowledge projection

W2-002 adds one centralized Workflow-layer projection boundary:

`EstimatePoint` → `Observation(estimate)`

`ConsensusSnapshot` → `Observation(consensus)`

Estimate observations preserve the attributable unit, source/raw provenance,
published timestamp, institution, optional analyst, and fiscal period. Explicit
revision links become durable `revisionOf` lineage; old estimate observations
remain historical objects and are never overwritten. Exact replay reuses the
same semantic identity and preserves `recordedAt`.

Consensus observations preserve their own historical `asOf`, mean, median,
high, low, count, dispersion, and canonical contributor Observation refs. The
contributor refs must resolve only to Estimate observations and must agree on
subject, metric, fiscal period, point-in-time eligibility, and unit. Consensus
unit is validated through those contributor units; Schema v0.4 is unchanged and
does not gain a standalone consensus unit field. A direct consensus Source is
not fabricated when the snapshot is derived from estimates.

W2-002 keeps surprise/beat-miss, actual-vs-consensus, actual-vs-prior-estimate,
revision deltas, guidance, and valuation bridges report-only. It does not wire
expectations into the live Earnings Review Workflow; that remains deferred to
W2-004. No source acquisition or provider is part of this projection boundary.

FIX-001 projection integrity rules:

- source candidate collections are canonicalized as deterministic sets before durable identity and provenance are built; partial declared Estimate provenance fails closed;
- ambiguous valid revision lineage is never auto-selected, while exact duplicate links are harmless;
- institution and analyst party local identity is namespaced by party kind, even when their domain keys are equal.
