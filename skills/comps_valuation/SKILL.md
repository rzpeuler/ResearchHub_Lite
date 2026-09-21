# Comparable Valuation Skill

## Purpose

Answer how a company is valued relative to genuinely comparable companies on a
point-in-time, period-compatible and economically attributable basis.

## Invocation Match

Use for comparable-company valuation, peer multiples, and peer-median implied
value questions. Do not use for price-implied growth; that belongs to
`reverse_dcf_expectation_decode`. Composite valuation requests belong to the
Valuation Workflow.

## Typical Intents

- “这家公司相对可比公司贵不贵？”
- “用可比公司法估值。”
- “同行 PE/EV EBITDA 大概是多少？”
- “按同行中位数推算合理价值。”

## Inputs

Bounded candidate peers, stable identity, attributable source references,
retrieval and publication timestamps, compatible period basis, currency/unit
metadata, comparability dimensions, and target valuation metrics.

## Produces

`CompsValuationResult` with candidate, accepted and rejected peers, reason-coded
diagnostics, multiple distributions, selected-multiple basis, implied value,
source references, and availability.

## Methodology

Validate identity and evidence first, reject future or incompatible data, keep
metric-specific denominator failures local to that metric, then reuse the
existing deterministic comparable arithmetic. No synthetic peers or metrics
are introduced.

## Evidence Requirements

Every accepted peer has stable company ID/ticker/exchange, at least one source
reference, PIT-compatible timestamps, compatible period/currency/share basis,
and explicit comparability evidence.

## Deterministic / Model Boundary

The Skill accepts bounded peer candidates. A model may identify or explain
candidate comparability upstream, but cannot invent identity, metrics, source
references or peer status. Code owns validation, distributions, and implied
valuation arithmetic.

## Missing Data

Missing is unavailable, never zero, estimated, inferred, or synthetically
filled. Insufficient usable peers return typed diagnostics.

## Validation / QC

Identity, source, PIT, period, unit, currency, metric applicability, finite
numbers, rejected-peer visibility, and selected-multiple provenance are
validated before a result is available.

## Related Skills

`competitive_market_map` may supply candidate context through a Workflow;
competitor status does not automatically make a valid valuation peer.

