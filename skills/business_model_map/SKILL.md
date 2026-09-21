# Business Model Map

## Purpose

Explain how a company creates, delivers, and captures economic value across
products, customers, segments, and channels.

## Invocation Match

Use this Skill when the question asks what a company sells, who pays, or how
the business model fits together. Do not use it to attribute a period's growth
to volume/price/mix or to calculate unit economics.

## Typical Intents

- “What does this company actually make money from?”
- “Who are the customers and how do the segments connect?”

## Inputs

Company identity, products/services, customer types, segments, pricing/revenue
mechanisms, channels, supply/value-chain relationships, period/as-of, and
source refs.

## Produces

A bounded model map with revenue mechanisms, segment relationships, customer
and channel roles, evidence bindings, and explicit gaps.

## Methodology

Separate product, customer, channel, monetization, cost/value-chain, and
segment relationships; distinguish disclosed facts from interpretation; map
each relationship to supplied evidence; and preserve alternative or unknown
mechanisms as gaps.

## Evidence Requirements

Use attributable company filings, official materials, or bounded industry
evidence with an explicit as-of boundary. A generic company description is not
evidence of a monetization mechanism.

## Deterministic / Model Boundary

Code owns source/reference validation, identity, and output bounds. The model
may synthesize the map from supplied evidence but may not invent customers,
segments, prices, or revenue shares.

## Missing Data

Unknown monetization, customer, or segment relationships are `unavailable` or
research gaps, never inferred from a typical industry pattern.

## Validation / QC

Every material edge must have a source reference; facts and interpretations are
separate; and no edge may reference a different company.

## Related Skills

`business_driver_analysis`, `unit_economics`, and `market_structure_analysis`
are peer methods selected by a Workflow.
