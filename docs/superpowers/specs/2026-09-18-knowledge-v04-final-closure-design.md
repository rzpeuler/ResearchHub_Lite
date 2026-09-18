# Knowledge Schema v0.4 Final Closure Design

Date: 2026-09-18
Status: approved execution baseline; implementation pending

## Scope

This closure addresses the four remaining semantic integration gaps from the
v0.4 goal: real Earnings Review projection, dual Thesis semantics, typed
ExternalIdentifier coverage for every core Entity, and the TypeScript
ReasoningEdge endpoint contract. Existing Workflow, Skill, Gateway, ChangeSet,
Writer, storage, and migration boundaries remain authoritative.

## Design decision

Add one thin deterministic projection module at the existing Earnings Review
workflow boundary. The module converts verified official disclosure and
structured financial input, plus validated Skill assessments, into existing
Gateway proposals for Event, MetricObservation, optional Estimate/Consensus,
Claim, Thesis, and ReasoningEdge. It does not allocate canonical IDs, write
files, guess unavailable values, or create a second production path.

Earnings `affects_thesis` is translated to a first-class Thesis proposal or an
explicit update of a resolved Thesis, with Claim-to-Thesis and
Observation-to-Claim edges. A `claimType: thesis` remains readable for legacy
v0.3/v0.4 state and migration compatibility, but is rejected in all new
ChangeSet operations and Gateway proposals.

Every v0.4 core Entity accepts typed `externalIdentifiers`; legacy
`externalIds` remains readable. Company resolution continues to use ticker plus
exchange as the hard identity and never uses an external identifier as a
replacement identity key.

ReasoningEdge TypeScript and runtime contracts are aligned: sources are only
Observation or Claim, and targets are only Claim or Thesis.

## Alternatives considered

- Inline all new semantics in `workflow.ts`: rejected because it would mix
  deterministic evidence projection with workflow orchestration.
- Rewrite the Earnings Review Skill output: rejected because the Skill already
  validates bounded assessments and is not the canonical persistence boundary.
- Add a new Gateway or Writer: rejected because it would duplicate the
  governed production path.

## Validation and evidence

Add focused tests for real `runEarningsReview()` projection, Thesis legacy
read/new-write behavior, typed identifiers, and edge endpoints. Add a final
acceptance script that records F1–F7 from the real workflow and retains K1–K10
as lower-level contract coverage. Final evidence records workflow run ID,
canonical IDs, revisions, refs, and all F/K assertions without private source
content or credentials.
