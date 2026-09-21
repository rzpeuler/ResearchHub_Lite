# Financial Quality Analysis

## Purpose

Run a bounded, report-level screen of working capital, accruals, cash
conversion, and revenue-recognition divergence from explicit period facts.

## Invocation Match

Use for earnings-quality and cash-conversion diagnostics when period facts are
supplied. Do not use a screen as a fraud conclusion or as a substitute for
source acquisition.

## Typical Intents

- “Are receivables or inventory moving differently from reported sales?”
- “How well did cash conversion track net income?”

## Inputs

Normalized current, opening, and prior-comparable period facts, an explicit
divergence threshold, and the attributable source candidate ID.

## Produces

Deterministic DSO, DIO, DPO, cash conversion cycle, accrual ratio, cash
conversion, free-cash-flow, and bounded revenue-recognition follow-up flags.

## Methodology

Reuse the existing Wave 1 deterministic financial-quality calculations. Keep
each component independently available or unavailable, preserve period and
source identity, and return a partial result when only some components have
the required facts.

## Evidence Requirements

Facts must be explicitly attributable to the requested periods. Current/opening
balances are required for working-capital and accrual calculations; current and
prior-comparable facts are required for growth divergence comparisons.

## Deterministic / Model Boundary

Code owns normalization, period alignment, ratios, deltas, finite-value checks,
and thresholds. A model may explain a flag, but this Skill does not call a
model and never turns a flag into a manipulation or fraud finding.

## Missing Data

Missing, malformed, zero-denominator, or non-comparable inputs remain
`unavailable` at the component level. Missing is never zero-filled.

## Validation / QC

Reject invalid thresholds, preserve unavailable fields, ensure all output
numbers are finite, and keep diagnostics bounded and source-linked.

## Related Skills

`earnings_variance_analysis`, `business_driver_analysis`, and `unit_economics`
are peer analytical methods composed by a Workflow.
