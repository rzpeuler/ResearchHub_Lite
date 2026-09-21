# Reverse DCF Expectation Decode

## Purpose

Decode the future FCFF or revenue performance implied by a current enterprise
value or share price under explicit assumptions.

## Invocation Match

Use this Skill when the question asks what growth, margin, or terminal economics
the current price already assumes. Do not use it for forward intrinsic value
from user forecasts; that is `dcf_valuation`.

## Typical Intents

- “How much growth is already priced in?”
- “What revenue CAGR does this valuation imply?”

## Inputs

Current price or enterprise value, shares, debt/cash bridge, explicit FCFF
forecast, discount rate, terminal growth, current revenue, steady-state FCFF
margin when decoding revenue, valuation date, and source refs.

## Produces

Implied terminal FCFF, optional implied terminal revenue, implied revenue CAGR,
assumption diagnostics, and source refs.

## Methodology

Build the explicit-period present value; calculate the positive terminal value
required by current enterprise value; decode terminal FCFF; and only derive
revenue/CAGR when current revenue and a positive steady-state margin are
explicit. Keep all outputs tied to the valuation date.

## Evidence Requirements

Market value, capital structure, forecasts, and all assumptions require
point-in-time attributable inputs. Future observations and synthetic assumptions
are rejected.

## Deterministic / Model Boundary

`calculateReverseDcf` and related helpers own all arithmetic. The model may
explain the implied expectation but cannot invent a margin or growth rate.

## Missing Data

Missing price, enterprise bridge, forecast, discount, terminal growth, revenue,
or margin yields `unavailable`; it is never treated as zero or inferred.

## Validation / QC

Require a positive implied terminal value, finite outputs, discount above
terminal growth, and a valid positive steady-state margin when used.

## Related Skills

`dcf_valuation`, `expectation_gap`, and `valuation_crosscheck` may consume this
result through a Workflow.
