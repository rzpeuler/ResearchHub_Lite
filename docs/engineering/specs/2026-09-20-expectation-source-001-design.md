# EXPECTATION-SOURCE-001 — Point-in-Time Expectation Source Design

Date: 2026-09-20
Status: `001B IMPLEMENTED / SOL ACCEPTANCE PENDING`
Baseline: `414559326574842eaf029d5cb0486b5381869544`

## Track state

001A Eastmoney report-level EPS acquisition is complete. 001B adds the
Workflow-owned automatic bundle assembler and Earnings Review wiring. 001C,
real point-in-time end-to-end validation and robustness hardening, has not
started.

## Activation and precedence

The Workflow resolves expectations in this order: an explicitly supplied
caller bundle wins, otherwise an injected `EarningsEastmoneyExpectationSource`
may be attempted, otherwise expectations remain absent. An explicitly empty
caller bundle still owns the input and prevents Eastmoney acquisition. The
source client is never instantiated or called implicitly by Earnings Review.

Automatic acquisition requests the normalized company, Earnings Review
`asOf`, and requested Earnings fiscal year. Provider `currentYear` continues
to control 001A field-to-year mapping; it never replaces the requested
Earnings fiscal year.

## Automatic bundle assembly

001B validates the 001A `EstimatePoint` projection again, retaining only finite
annual EPS points for the exact requested `YYYY-FY` period and
`CNY_per_share` unit whose publication time is at or before analysis `asOf`.
Missing source bindings, duplicate Estimate IDs, and same-institution,
same-metric, same-period, same-timestamp ambiguity exclude all affected
points. Sources are narrowed to those referenced by retained estimates.

When the official Earnings filing timestamp is valid and no later than
analysis `asOf`, automatic consensus uses the strict cutoff one millisecond
before that result. It calls the existing W2 `buildConsensusSnapshot()` with
`minimumCount = 2`; it does not reimplement consensus arithmetic. Prior
institution keys use the same safe pre-result history. Latest genuine
value-changing adjacent revisions are represented only as
`EstimateRevisionLink[]`; W2 calculates revision magnitudes.

Automatic bundles contain sources, safe estimates, consensus snapshots, prior
institution keys, revision links, and an optional valid result cutoff. They do
not acquire Guidance or Segment KPI data and do not invoke W2-002 Knowledge
projection.

## Period and degradation rules

Automatic data is annual EPS only. FY consensus is never compared with an H1,
Q1, or Q3 actual because existing W2 exact-period matching remains
authoritative. Annual EPS revisions may still appear in report-level revision
sections for a non-FY review.

Provider failure, malformed data, unsupported fiscal year, empty data, an
unexpected client exception, and zero safe estimates are non-blocking for an
otherwise valid Earnings Review. The Workflow records provider outcome,
bounded acquisition diagnostics, mode, status, and assembly counts while
leaving the base report usable.

## Boundaries

Earnings Skill reasoning runs before automatic acquisition and receives no
Eastmoney source, EstimatePoint, ConsensusSnapshot, revision link, or
expectation finding. Automatic expectation sources are report evidence only;
they are excluded from semantic evidence validation and Knowledge Production
Gateway bindings. Automatic expectations cannot create canonical Sources,
Claims, Observations, Thesis state, or durable proposals.

Caller mode records provider acquisition as `not_attempted` regardless of
caller bundle contents; `expectationStatus` separately reports whether caller
expectations produced usable findings. Automatic telemetry distinguishes clean
usable, partial, unavailable, and failed acquisition. Report methodology uses
the corresponding high-level automatic state and never copies raw provider
exceptions or diagnostic lists into the report. No aggregate consensus endpoint
or LLM arithmetic is used. Existing 14-section report structure is preserved.
