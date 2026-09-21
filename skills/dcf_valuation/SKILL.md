# DCF Valuation

## Purpose

Estimate forward intrinsic enterprise/equity value from explicit FCFF forecasts
and discount-rate assumptions.

## Invocation Match

Use this Skill when the user supplies or requests a forward cash-flow valuation
from forecast assumptions. Do not use it to decode what the current price
implies; use `reverse_dcf_expectation_decode` for that question.

## Typical Intents

- “Build a DCF from my revenue and margin forecast.”
- “What is intrinsic value under these FCFF assumptions?”

## Inputs

Point-in-time market/financial basis, explicit FCFF forecast, WACC inputs,
terminal growth, debt/cash/equity bridge inputs, share count, forecast period,
and source refs.

## Produces

Deterministic DCF result, enterprise-to-equity bridge, sensitivity outputs,
assumption diagnostics, QC findings, and evidence refs.

## Methodology

Validate the forecast and discount relationship; compute FCFF, WACC, present
values, terminal value, and bridge in code; recompute sensitivity cells from
explicit inputs; and retain unavailable fields rather than filling defaults.

## Evidence Requirements

Forecasts and balance-sheet inputs must be attributable and aligned to the
valuation date. Gross debt is used for WACC weights; cash is used only in the
enterprise-to-equity bridge.

## Deterministic / Model Boundary

All arithmetic is owned by `skills/valuation/calculations/`. The model may
propose bounded assumptions or interpret outputs but cannot author numbers.

## Missing Data

Missing forecast, discount, bridge, or share data is `unavailable`; no default
FCFF, WACC, terminal growth, or price is inferred.

## Validation / QC

Reject non-finite inputs, empty forecasts, terminal growth not below discount
rate, invalid capital structure, and sensitivity mismatches.

## Related Skills

`reverse_dcf_expectation_decode`, `scenario_valuation`, and
`valuation_crosscheck` are peer Workflow steps.
