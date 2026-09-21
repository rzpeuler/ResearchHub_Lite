# Unit Economics

## Purpose

Analyze the economics of one explicitly defined operating unit, such as a
customer, shipment, site, subscription, or project.

## Invocation Match

Use this Skill when the user asks for the economics of a measurable underlying
unit. Do not use it for consolidated revenue/profit drivers or a high-level
business model description.

## Typical Intents

- “What is the most useful economic unit for this business?”
- “What are revenue, gross profit, retention, or payback per customer?”

## Inputs

Explicit unit definition, unit counts, revenue/cost components, cohort or
retention data where relevant, period, customer/channel scope, and source refs.

## Produces

Unit definition, deterministic per-unit metrics, cohort/trend diagnostics,
availability flags, evidence bindings, and research gaps.

## Methodology

Choose a unit only when the supplied evidence identifies it; define numerator,
denominator, time basis, and cohort scope; calculate metrics in code; keep
aggregate and per-unit measures separate; and disclose whether the unit is
reported, derived, or unavailable.

## Evidence Requirements

Counts and financial inputs must share a period and scope. Customer or shipment
definitions must be attributable; no industry-default unit or retention rate
is acceptable.

## Deterministic / Model Boundary

Code owns denominators, period alignment, arithmetic, and cohort bounds. The
model may interpret supplied unit economics but cannot choose a unit or invent
missing data without explicit evidence.

## Missing Data

Missing unit identity, counts, or cost/revenue inputs is `unavailable`, never
zero or estimated. A proposed unit without evidence remains a research gap.

## Validation / QC

Require positive valid denominators, aligned periods, explicit units, finite
values, and source refs for every metric. Flag non-comparable cohorts.

## Related Skills

`business_model_map` and `business_driver_analysis` are peer methods; Workflow
owns any composition with financial quality or thesis analysis.
