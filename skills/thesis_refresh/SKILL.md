# Thesis Refresh

## Purpose

Assess which propositions in an existing thesis changed after new,
point-in-time evidence, while preserving unaffected propositions.

## Invocation Match

Use when a prior thesis snapshot and new evidence are available and the user
asks what changed. Do not use to create a thesis from scratch or rewrite every
proposition after any event.

## Typical Intents

- “After the earnings release, which parts of the thesis changed?”
- “Did this new evidence meet a precommitted kill criterion?”

## Inputs

A prior thesis snapshot with `priorAsOf`, new bounded evidence with publication
times and proposition refs, current as-of, and optional evidence-backed kill
criteria.

## Produces

Targeted proposition deltas, preserved unchanged proposition refs, candidate
thesis transition, kill-criterion assessments, evidence refs, and diagnostics.

## Methodology

Require a prior snapshot, apply strict `publishedAt > priorAsOf` and
`publishedAt <= currentAsOf` filtering, target only referenced propositions,
and preserve unrelated propositions. Deterministic kill predicates may produce
`invalidation_condition_met` only when their sourced threshold is satisfied.

## Evidence Requirements

New evidence must be attributable, dated, and linked to an existing
proposition. Thresholds require their own source refs. Old evidence is context,
not a new delta; future evidence is rejected.

## Deterministic / Model Boundary

Code owns PIT filtering, reference checks, targeted delta mapping, and numeric
kill-criterion evaluation. The Skill does not call upstream Skills, mutate a
canonical Thesis, or emit BUY/SELL/HOLD decisions.

## Missing Data

Missing prior thesis blocks refresh. Missing basis or qualitative support yields
`requires_review`; it never becomes a fabricated strengthening or weakening.

## Validation / QC

Reject invalid prior snapshots, future/forged evidence references, duplicate
propositions, invalid predicates, and thresholds without provenance. Verify that
unaffected propositions remain unchanged.

## Related Skills

`thesis_formalize`, `expectation_gap`, `thesis_red_team`, and `catalyst_map` are
peer Skills composed by a Workflow.
