# Market Structure Analysis

## Purpose

Define a bounded market, its segmentation, sizing methodology, participants,
and value-chain relationships from attributable evidence.

## Invocation Match

Use for questions about what belongs in a market, how it is segmented, and how
value flows. Do not use for a supply-demand cycle or a competitor ranking.

## Typical Intents

- “How should this market be defined and divided?”
- “What is the source-backed market size on a comparable basis?”

## Inputs

Included/excluded boundary, edge cases, geography, period, unit, one primary
segmentation axis, estimates with method metadata, value-chain nodes, and
source references.

## Produces

An explicit boundary, segmentation, separately preserved market estimates,
reconciliations, and source-linked value-chain map.

## Methodology

Validate scope before accepting any estimate. Preserve estimates with different
definitions, periods, geographies, units, or methods; never average them.

## Evidence Requirements

Every boundary statement, segmentation value, estimate, and value-chain node
requires attributable source references.

## Deterministic / Model Boundary

Code owns scope validation, comparability checks, and reconciliation labels. A
model may propose search terms or explain differences but may not create TAM or
market-share numbers.

## Missing Data

Missing boundary or segmentation makes the result unavailable. Missing sizing
data is reported as unavailable; it is not estimated from a generic industry
label.

## Validation / QC

Require explicit included/excluded scope, one axis per segmentation result,
finite estimates, and preserved conflicts.

## Related Skills

`industry_supply_demand_cycle` and `competitive_market_map` are peer Industry
methods composed by the Industry Workflow.
