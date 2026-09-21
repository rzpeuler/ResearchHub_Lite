# Thesis Formalization

## Purpose

Turn a narrative investment thesis and bounded research context into explicit,
traceable propositions and an acyclic dependency graph.

## Invocation Match

Use when the user asks to structure an investment thesis into verifiable
propositions, dependencies, assumptions, and verification conditions. Do not
use for adversarial testing, expectation-gap comparison, or canonical Thesis
mutation.

## Typical Intents

- “Turn my investment logic into falsifiable propositions.”
- “What does this thesis depend on?”

## Inputs

A narrative thesis, bounded attributable evidence, and optional structured
proposition hints. The semantic stage proposes proposition types, evidence
basis, horizons, dependencies, verification conditions, and research gaps.

## Produces

A `FormalizedThesisResult` containing propositions, dependency edges,
load-bearing identification, evidence availability, and bounded diagnostics.

## Methodology

The `ReasoningExecutor` proposes candidates once, with one bounded repair when
needed. Validate proposition identity and references, reject duplicate/self/cyclic
dependencies, preserve `verified_evidence`, `inference`, and `hypothesis`
without upgrading them, and derive load-bearing status from downstream
dependency count. Research gaps remain explicit.

## Evidence Requirements

Verified propositions require at least one attributable source reference.
Existing Knowledge references and source references are preserved as supplied;
the Skill does not resolve or create canonical objects.

## Deterministic / Model Boundary

Semantic proposition generation is bounded to the supplied narrative and
evidence allowlist. Validation, graph construction, cycle checks, and
load-bearing derivation are deterministic. No model is allowed to invent a
source ref, date, or threshold; invalid output fails closed.

## Missing Data

Missing evidence remains `insufficient_evidence` or `unavailable`; it is never
converted into verified support.

## Validation / QC

Reject malformed propositions, dangling/self/cyclic dependencies, duplicate
IDs, invalid verification times, and verified propositions without sources.

## Related Skills

`expectation_gap`, `thesis_red_team`, `catalyst_map`, and `thesis_refresh` are
peer Skills composed by a Workflow.
