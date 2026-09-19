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

## W2-003 report-only Guidance and Segment KPI core

W2-003 adds schema-neutral deterministic methods under the existing Earnings
Review expectations skill. Guidance remains report-only and is not projected to
Knowledge. Numeric Guidance requires an explicit unit and type-specific shape;
qualitative Guidance requires meaningful normalized qualifiers, does not invent
a unit, and cannot enter numeric comparisons. Range midpoint is always
calculated by code after validating any supplied midpoint.

Guidance revision results preserve shared low, high, midpoint, and range-width
dimensions separately. Revision requires compatible metric, fiscal period, and
unit plus strictly later publication, with no unit conversion. Guidance versus
Consensus uses `ConsensusSnapshot.mean`, requires matching metric, period, and
unit, and rejects a Consensus snapshot published after the Guidance point in
time. Minimum and maximum Guidance do not receive a fabricated midpoint.

Segment KPI is a narrow caller-supplied research-domain contract rather than a
universal segment ontology. Prior and expectation comparisons preserve their
explicit fiscal periods, require matching segment/metric/unit semantics, fail
closed when a supplied comparator is incompatible, and use deterministic
numeric deltas. Numeric direction is descriptive only and is not an economic
good/bad interpretation.

W2-003 does not change the live Earnings Review Workflow or Skill, add source
acquisition, perform LLM extraction, persist Guidance or Segment KPI results,
or modify Knowledge Schema, the metric registry, or W2-002 projection.

W2-003 derived numeric outputs have a finite-value invariant. Range midpoint
calculation uses one shared finite-safe implementation for validation and
normalization; Guidance deltas, revisions, and range widths fail closed when
their arithmetic cannot be represented finitely. Tests inspect JavaScript
numbers recursively rather than relying on JSON serialization.
# W2-004 — Earnings Review Expectations Integration

W2-004 adds an optional, direct Workflow input for an explicit caller-supplied
expectations bundle. It does not add live acquisition, broker integration, a
public route, Pi input, or a new Knowledge persistence path.

The Workflow validates source bindings, normalizes source IDs, reproduces
consensus snapshots through the existing deterministic expectations primitives,
and applies strict point-in-time boundaries. When available, the official
selected result publication timestamp is authoritative; actual-vs-consensus
requires a strictly earlier consensus snapshot. Actual-vs-prior-estimate uses
only explicitly named institution keys. Current Guidance and estimate
revision links are also explicit; Guidance-vs-Consensus retains its own
Guidance publication cutoff.

Expectation findings are deterministic post-synthesis report enrichment. The
LLM does not receive expectation analysis in W2-004, and expectation findings
cannot authorize durable Claims, Guidance persistence, surprise persistence,
or revision persistence. Expectation-only sources remain report-only unless a
separate independent Knowledge production path persists them. Invalid or
incomplete expectations are non-blocking, and `Consensus unavailable` remains
the fail-closed fallback when no valid actual-vs-consensus finding exists.

## W2-004-FIX-001 — PIT cutoff and report integrity

The effective result publication cutoff is usable only when its timestamp is
valid and no later than `analysisAsOf`. A missing cutoff produces
`result_publication_cutoff_unavailable`; malformed or future values produce a
deterministic invalid-cutoff diagnostic and disable both actual-vs-consensus
and actual-vs-prior comparisons. A selected official result publication time
remains authoritative over the caller bundle fallback.

Expectation report rendering is finite-safe and reads only already validated
deterministic result fields. It does not recalculate range widths, surprise
amounts, revisions, midpoints, or relationships. Relative deltas are formatted
as percentages only for display, with non-finite values omitted. Guidance
revision dimensions remain separate, and absent minimum/maximum/qualitative
numeric fields are not fabricated. Revision-link ambiguity is evaluated only
after each link is individually valid, so an invalid extra predecessor cannot
suppress a unique valid revision while multiple valid predecessors still fail
closed.
