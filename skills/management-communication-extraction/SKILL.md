# Management Communication Extraction

## Purpose

Extract bounded, attributable semantic candidates from already-acquired
management communication, exchange Q&A, and statutory disclosure evidence.
This Skill does not acquire data, write Knowledge, synthesize research, score
management, or make investment judgements.

## Invocation Match

Use only when the caller supplies attributable evidence and requests structured
extraction. Formal Guidance is available only for the statutory source lane.
Management communication is not silently upgraded to Formal Guidance.

## Inputs

- one `ManagementCommunicationDocument`;
- a bounded batch of `ExchangeQAPair` values; or
- an existing statutory `NormalizedResearchSource`.

The Workflow supplies the source lane, exact source text, stable source IDs,
publication timestamps, analysis cutoff, and allowed output families.

## Produces

Raw semantic extraction candidates for Formal Guidance, Management Outlook,
explicit KPI facts, and Structured Q&A Evidence. Workflow validation produces
code-owned candidate metadata and may project only to existing
`GuidanceRange` and `SegmentKpiPoint` contracts.

## Methodology

Extract only what the supplied evidence explicitly states. Formal Guidance
requires the statutory lane and explicit guidance language such as a stated
range, minimum, maximum, point, or qualitative formal target. Do not classify
hopes, plans, demand outlook, IR meeting commentary, or exchange Q&A estimates
as Formal Guidance.

Management Outlook may cover demand, pricing, capacity, inventory, orders,
margin, capex, products, technology, international business, competition,
production, customers, or utilization. Preserve the stated direction and raw
period/value/unit text; do not infer confidence, probability, credibility,
bullishness, or investment significance.

KPI extraction is limited to explicit operating facts such as shipments,
volume, ASP, capacity, utilization, yield, orders, customer count, segment or
product revenue, regional revenue, penetration, production, and inventory.
Return raw labels and tokens. Do not invent canonical segment keys or calculate
canonical values.

For Q&A, retain the exact `ExchangeQAPair.id`. Add topic tags, claim spans,
management statement spans, product/segment references, and explicitly stated
metrics only. Do not calculate response quality, evasion, credibility,
sentiment, or a management score.

Every semantic item must cite an evidence locator. The model may return only
raw evidence locations and semantic fields. Candidate IDs, publication time,
authority, extraction version, canonical period/unit/value, and projection are
Workflow-owned.

## Deterministic / Model Boundary

The model identifies candidate statements and raw source tokens. Workflow code
owns source-lane enforcement, source spans, publication cutoffs, authority
inheritance, numeric parsing, unit conversion, fiscal-period resolution,
stable IDs, deduplication, conflict handling, midpoint arithmetic, and final
contract projection.

## Missing Data

Missing or ambiguous period, unit, segment identity, or numeric endpoint remains
explicitly unavailable for projection. It is never filled by an inferred value.

## Validation / QC

Reject nonexistent or ambiguous evidence spans, future sources, invented
numeric tokens, unknown source IDs, forbidden output families, authority
upgrades, and semantic/source mismatches. Allow at most one bounded format
repair for schema-invalid model output; do not repair semantic or evidence
failures with another model call.
