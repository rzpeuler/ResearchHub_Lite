# Valuation Cross-check

## Purpose

Compare independently calculated valuation methods and surface convergence,
divergence, and method availability.

## Invocation Match

Use this Skill when the user asks whether valuation methods agree or what drives
their differences. Do not use it to perform the primary method calculation;
consume already validated results from peer Skills.

## Typical Intents

- “Do the valuation methods agree?”
- “What explains the gap between PE and EV/EBITDA?”

## Inputs

Validated results from two or more valuation methods, shared basis identity,
assumption metadata, point-in-time status, and source refs.

## Produces

Comparable method outputs, divergence/convergence diagnostics, unavailable-method
reasons, and bounded interpretation references.

## Methodology

Align methods to the same company, date, fiscal basis, and unit; compare only
finite code-produced outputs; preserve method-specific assumptions; and explain
differences without selecting a winner absent an explicit Workflow rule.

## Evidence Requirements

Every compared result must carry attributable inputs and a shared valuation
context. Missing method evidence remains visible.

## Deterministic / Model Boundary

Code owns alignment, comparisons, and diagnostics. The model may describe
economic reasons for divergence using supplied evidence only.

## Missing Data

Fewer than two valid methods yields `insufficient_data`, not a synthetic
cross-check or inferred agreement.

## Validation / QC

Reject mixed dates/periods, non-finite values, duplicate method results, and
unbound source refs.

## Related Skills

`dcf_valuation`, `reverse_dcf_expectation_decode`, `scenario_valuation`, and
`comps_valuation` are peer producers; Workflow owns composition.
