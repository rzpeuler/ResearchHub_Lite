# Data Source Governance Foundation v0.1

## Purpose

D0-001 adds the smallest Workflow-owned foundation needed to make future data
acquisition deterministic and auditable. It defines what a research Workflow
needs, which source candidates are eligible, how fallback is selected, and how
failure, provenance, point-in-time safety, and source conflict are reported.

This is an isolated runtime domain contract. It is not a new architecture
layer: Workflow still owns lifecycle, routing, fallback, and validation;
Plugin remains the boundary for concrete external capability integration; Skill
continues to own professional methodology; and Knowledge remains the durable
semantic and persistence authority.

## Contracts

`DataRequirement` identifies the consumer, subject, data kind, time boundary,
determinism class, required fields, authority floor, and LLM-web eligibility.
`SourceCandidate` describes a possible operation and its original publisher
authority. `SourcePolicy` matches requirements exactly and supplies candidates
plus one of `FIRST_VALID`, `CROSS_CHECK`, or `COLLECT_DIVERSE`.

`SourceAuthority` is the authority of the original publisher (`S0_STATUTORY`
through `S4_COMMUNITY`). `FallbackLevel` is the route used by the Workflow
(`PRIMARY`, `FALLBACK_1`, `FALLBACK_2`, or `LLM_WEB`). They are independent.
For example, an LLM web retrieval can preserve `originAuthority: S0_STATUTORY`
when the attributable page was published by a statutory source. The
`retrievalProvider` is separately recorded and does not change source
authority.

`AcquisitionAttempt` records every candidate actually invoked. Candidates that
were never invoked do not appear in telemetry. `AcquisitionResult` retains the
selected source, attempts, quality, fallback reason, and—when multiple sources
are used—separate observations and source metadata.

## Policy and selection semantics

Policy matching is exact. Specificity is deterministic: `metricId` outranks
`metricFamily`, which outranks `dataKind` plus `capability`, which outranks a
generic `dataKind` match. Equal-specificity matches return `AMBIGUOUS_POLICY`;
the policy array order is never used as an implicit tie-breaker. No match
returns `NO_REGISTERED_POLICY`.

`FIRST_VALID` invokes candidates in fallback order and returns the first result
that passes result validation and point-in-time checks. A successful primary
prevents fallback invocation. A failed primary records its bounded attempt and
allows an eligible fallback to run. No value averaging or silent replacement
occurs.

`CROSS_CHECK` retains every valid observation independently. Equal observations
are `CONSISTENT`; one observation is `INSUFFICIENT_CROSS_CHECK`; differing
observations are `CONFLICT` and surface `SOURCE_CONFLICT`. The first
observation is exposed as the compatibility `data` field, but conflicting
observations remain available and are never averaged.

`COLLECT_DIVERSE` retains all valid observations and their provenance. It does
not synthesize a model-authored single truth.

## Validation and unavailable data

Requirements must have an id, consumer workflow and capability, a valid
`asOf`, and (for metric requirements) a metric id or family. Required result
fields use presence checks, so `0`, `false`, and an empty array remain valid
values. A source with `publishedAt > asOf` produces
`POINT_IN_TIME_INVALID` and may fall through. A configured authority floor is
enforced using the fixed `S0 > S1 > S2 > S3 > S4` ordering.

Unavailable data is explicit. The Workflow does not return zero, a null that
means zero, a synthetic estimate, or a placeholder. It returns a bounded
unavailable reason such as `NO_REGISTERED_POLICY`, `INSUFFICIENT_AUTHORITY`,
`SOURCE_CONFLICT`, or `ALL_FALLBACKS_EXHAUSTED`.

## LLM-web boundary

D0-001 does not execute web search, browser automation, or any LLM source
integration. It only encodes eligibility. `AUTHORITATIVE_NUMERIC` rejects
`FULL_EVIDENCE_RESEARCH`; `DISCOVERY_ONLY` does not authorize a data
acquisition attempt. Attributable extraction with provenance can preserve the
original publisher authority, while qualitative requirements may represent
`FULL_EVIDENCE_RESEARCH`. No model-generated numeric fallback exists.

## Boundaries and future integration

The executor is a narrow per-run Workflow testing/integration seam. It has no
global registration, plugin discovery, provider framework, or service locator.
Future D1 work may bind concrete Plugin functions explicitly—for example, the
planned expectations acquisition—without changing the contracts or current
research Workflow behavior.

No Knowledge Schema, Writer, canonical ID, existing Plugin, Skill methodology,
Application/API/UI surface, or current research Workflow is changed by D0.
Acquisition results remain runtime research-domain objects until a later,
separately governed Knowledge projection is designed.
