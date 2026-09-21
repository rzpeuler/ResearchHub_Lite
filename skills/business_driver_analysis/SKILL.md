# Business Driver Analysis

## Purpose

Attribute a company's consolidated revenue or profit change to explicit
business drivers such as volume, price, mix, segment, or cost inputs.

## Invocation Match

Use this Skill when the question asks whether growth came from volume, price,
mix, segment, or cost drivers. Do not use it for a generic business model map
or for per-customer/unit economics.

## Typical Intents

- “Was revenue growth driven by volume, price, or mix?”
- “Which segment explains the change in operating profit?”

## Inputs

Two comparable periods, consolidated and segment financials, operating KPIs,
volume/price/mix disclosures when available, units, as-of boundary, and source
refs.

## Produces

A period-aligned driver decomposition, contribution diagnostics, confidence and
availability flags, evidence bindings, and unresolved gaps.

## Methodology

Align periods and units; prefer disclosed driver bridges; calculate only
deterministic decompositions supported by supplied numbers; separate direct
contributions from plausible explanations; and preserve residual/unattributed
change rather than forcing a complete bridge.

## Evidence Requirements

Actual financials and operating drivers must be attributable to the same
periods. A narrative claim about volume or price without a metric is
interpretive context, not a quantified driver.

## Deterministic / Model Boundary

Code owns period matching, arithmetic, and residuals. The model may explain a
bounded causal chain but cannot invent volume, price, mix, or segment values.

## Missing Data

Missing driver data is `unavailable` and the residual remains explicit; it is
never zero-filled or inferred from total growth alone.

## Validation / QC

Check units, period identity, finite values, contribution totals, residual
signs, and source refs. Do not claim a full bridge when material residuals are
unresolved.

## Related Skills

`business_model_map`, `unit_economics`, and `earnings_variance_analysis` are
peer methods composed by a Workflow.
