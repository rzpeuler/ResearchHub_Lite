# Competitive Market Map

## Purpose

Map attributable market participants, positioning, comparable peer evidence,
and competitive entry, exit, acquisition, capacity-entry, and pivot dynamics.

## Invocation Match

Use for competitor landscapes, customer overlap, positioning, and competitive
dynamics. Do not infer peer status from a broad industry label alone.

## Typical Intents

- “Which companies actually compete for the same purchase decision?”
- “Where is there a supported whitespace, and is it economically attractive?”

## Inputs

An explicit market boundary and segmentation, players with status and sourced
positioning, geography, optional scale proxies, explicit peer comparability
evidence, competitive events, whitespace evidence, and an as-of boundary.

## Produces

A sourced player map, attributable-peer assessments, competitive event map, and
a whitespace conclusion that keeps unmet need separate from economics.

## Methodology

Validate the market scope and each player first. A player is an attributable
peer only when purchase decision, workflow, economics, and customer overlap are
all explicitly supported by evidence. Entry, exit, acquisition, capacity entry,
and pivot events remain event records rather than inferred trends.

## Evidence Requirements

Every player, positioning statement, peer assertion, scale proxy, event, and
whitespace conclusion requires source references. Status `unknown` is valid and
does not imply active competition.

## Deterministic / Model Boundary

Code owns validation and peer/evidence classification. A model may propose
candidate players or explain positioning, but may not invent market share,
ranking, customer overlap, or economic attractiveness.

## Missing Data

Missing scope makes the result unavailable. Missing comparability evidence
means a player is not an attributable peer. Missing economics makes whitespace
inconclusive; an empty player list is never proof of a large opportunity.

## Validation / QC

Reject future evidence, invalid statuses, unsourced positioning, invalid scale
proxies, duplicate players, and unsupported peer claims. Preserve event types
and contradictory or unknown status explicitly.

## Related Skills

`market_structure_analysis` and `industry_supply_demand_cycle` are peer Industry
methods composed by the Industry Workflow.
