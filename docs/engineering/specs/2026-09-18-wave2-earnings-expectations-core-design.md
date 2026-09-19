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
