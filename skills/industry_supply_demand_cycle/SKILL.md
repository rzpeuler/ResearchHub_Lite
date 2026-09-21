# Industry Supply Demand Cycle

## Purpose

Assess demand, capacity, utilization, inventory, pricing, and cycle evidence at
an explicit point in time.

## Invocation Match

Use for supply-demand, inventory, pricing, and inflection questions. Do not use
for market boundary definition or competitor mapping.

## Typical Intents

- “Is falling inventory evidence of industry bottoming?”
- “Are capacity additions likely to keep pricing under pressure?”

## Inputs

Demand indicators, capacity observations with lifecycle state, utilization
evidence, producer/channel/customer inventory, pricing observations, comparable
periods where available, and source references.

## Produces

Cycle state, leading/confirming/contradicting indicators, inflection
classification, effective-capacity evidence, utilization method, price deltas,
and explicit missing indicators.

## Methodology

Keep the economic chain visible: demand → capacity → utilization → inventory →
price/spread. Treat announced, under-construction, installed, commissioned, and
effective capacity as distinct states.

## Evidence Requirements

Inventory direction requires history. Utilization requires reported utilization
or explicit output divided by capacity; a level does not become a direction
without a comparable prior value or explicit sourced direction. Price deltas
require same-unit aligned periods.

## Deterministic / Model Boundary

Code owns state validation, utilization arithmetic, price deltas, and bounded
cycle classification. A model may explain indicators but may not infer a cycle
state from news language, treat missing demand as weak demand, turn a level
threshold into direction, or create probabilities.

## Missing Data

Missing demand, utilization, effective capacity, inventory history, or pricing
remains explicitly missing; it is never treated as weak, zero, or normal.

## Validation / QC

Reject future/unattributed evidence, unit mismatch, announced-as-effective
substitution, and contradictory evidence deletion. Confirmed inflection
requires comparable-period change across at least two attributable indicators;
single-period evidence is at most possible. Contradictions stay visible.

## Related Skills

`market_structure_analysis` and `competitive_market_map` are peer Industry
methods composed by the Industry Workflow.
