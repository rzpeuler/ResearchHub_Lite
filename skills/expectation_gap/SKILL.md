# Expectation Gap

## Purpose

Locate a specific, comparable disagreement between price-implied expectations,
point-in-time consensus, management guidance, and an input-supplied research
expectation.

## Invocation Match

Use when the question asks where the market, management, consensus, or the
research view differs. Do not use to formalize a thesis, recalculate valuation,
or invent an own estimate.

## Typical Intents

- “What is the specific disagreement between the market and our view?”
- “Is consensus above or below guidance?”

## Inputs

Comparable expectation surfaces with metric, period, unit, basis, value or
range, source/upstream references, publication timestamps, and an as-of cutoff.

## Produces

Pairwise compatibility, deterministic deltas, preserved range relationships,
gap propositions, no-material-gap results, source refs, and diagnostics.

## Methodology

Validate point-in-time surfaces, compare only identical metric/period/unit/basis
identities, calculate arithmetic in code, and preserve point/range structure.
Six supported peer pairs are evaluated without calling another Skill.

## Evidence Requirements

Every surface requires source or upstream-result traceability. Own research is
never accepted from narrative alone. Consensus and other dated observations
must not be published after the requested as-of cutoff.

## Deterministic / Model Boundary

Code owns compatibility, arithmetic, range relationships, and no-material-gap
classification. A model may explain a bounded gap later but cannot create a
price-implied, consensus, guidance, or own-research value.

## Missing Data

Missing surfaces produce `unavailable` pair results. Incompatible surfaces are
`not_directly_comparable`; they never receive a manufactured percentage gap.

## Validation / QC

Reject malformed value/range shapes, invalid units or periods, missing
traceability, post-as-of surfaces, reversed ranges, and unsupported pair types.

## Related Skills

`reverse_dcf_expectation_decode`, `consensus_expectations_analysis`,
`guidance_analysis`, and `thesis_formalize` are peer Workflow inputs.
