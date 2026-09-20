# EXPECTATION-SOURCE-001 — Point-in-Time Expectation Source Design

Date: 2026-09-20
Status: `001A IMPLEMENTED / SOL ACCEPTANCE PENDING`
Baseline: `f0cfa92ecca64843fcdb616869f4c78680454b9f`

## Scope

Slice 001A adds a narrow Eastmoney `reportapi` client for individual company
research-report records and a Workflow-side projection into the existing
`EstimatePoint` contract. It does not assemble an expectations bundle, build
consensus or revision links, wire automatic acquisition into Earnings Review,
persist Knowledge, or alter Valuation, Thesis, App, or Client behavior.

## Why individual reports are primary

The source is the individual report endpoint, not a current aggregate
consensus page. Each accepted report preserves provider report identity,
institution identity, publication time, forecast base year, and the provider's
three EPS forecast fields. Consensus remains a deterministic W2 operation over
attributable estimates; the source does not calculate it.

## Eastmoney source contract

The client uses the HTTPS allowlisted endpoint
`https://reportapi.eastmoney.com/report/list` with `qType=0` and the provider's
company `code` parameter. Requests use bounded page size, page count, payload
size, and timeout limits. The response must contain an array `data`, integer
`TotalPage`, and integer `currentYear`. Invalid response structure, transport
failure, redirects outside the allowlisted host, and malformed pagination fail
closed with diagnostics.

The provider-native record requires `infoCode`, matching six-digit stock code,
non-empty `orgCode`, report title, publication value, and institution display
identity. `orgCode` becomes `eastmoney-org:<orgCode>`; display names remain
metadata. The researcher string is retained as metadata and is not promoted to
an analyst identity.

## Forecast and PIT semantics

Forecast mapping is anchored only by provider `currentYear`:

- `predictThisYearEps` → `currentYear`;
- `predictNextYearEps` → `currentYear + 1`;
- `predictNextTwoYearEps` → `currentYear + 2`.

Publication year, system year, report title, and requested earnings year never
anchor this mapping. Full timestamps without an explicit zone are interpreted
as Asia/Shanghai and normalized to UTC. Date-only timestamps are conservatively
placed at 23:59:59.999 Asia/Shanghai. Records after the requested `asOf` are
filtered locally before projection.

001A maps only annual EPS to `YYYY-FY` with unit `CNY_per_share`. Finite
positive, zero, and negative values are valid; malformed values are rejected
field-by-field without substitution. A target outside the provider's current
year/+1/+2 horizon produces no EstimatePoint and an explicit diagnostic.

## Structured-source provenance

One `NormalizedResearchSource` represents one accepted report. Its source
candidate has kind `structured_data`, tier 3, provider
`eastmoney-reportapi`, stable identity derived from `infoCode`, deterministic
structured JSON content, and no `metadata.period`. Public access is recorded
with `redistributionAllowed: false`. No report PDF is downloaded, parsed, OCR'd,
or persisted.

Exact duplicate `infoCode` rows are deduplicated. Conflicting stock,
institution, publication, title, or forecast semantics for one `infoCode` are
excluded with a deterministic conflict diagnostic. Output ordering is stable
and independent of provider row order.

## Historical limitation and track boundaries

The endpoint exposes a rolling forecast field set anchored by provider
`currentYear`. 001A can reconstruct point-in-time estimates only for fiscal
years currently exposed through those three fields; it is not a universal
historical consensus archive and does not extrapolate unavailable years.

- 001A: report-level source, strict validation, normalized source, and
  EstimatePoint projection.
- 001B: automatic expectations bundle assembly, deterministic consensus and
  revision construction, and Earnings Review wiring.
- 001C: real point-in-time end-to-end validation and failure/degradation
  hardening.
