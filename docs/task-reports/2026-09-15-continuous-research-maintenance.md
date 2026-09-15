# Continuous Research Bounded Maintenance

Date: 2026-09-15
Task: RHL-P2-CONTINUOUS-RESEARCH

This implementation is a bounded Daily Intelligence maintenance slice. It
does not introduce a generic continuous-research engine, a new persistence
layer, or a second canonical write path.

## Implemented boundary

- Daily change assessment now carries normalized `materiality` and
  `thesisImpact` fields. Missing safety fields default to `low` and `unknown`;
  durable eligibility still requires medium/high materiality, attributable
  existing Knowledge refs, suitable source tier, and non-noise evidence.
- Daily synthesis proposals must copy existing Claim refs from the related
  assessment and declare the deterministic `update`, `contradict`, or `review`
  resolution expected by that assessment.
- The workflow validates those refs against projected canonical Knowledge and
  only projects Claim-kind refs into the existing Knowledge Production Gateway.
- Gateway support now accepts explicit existing-Claim `update`, `supersede`,
  `contradict`, and `review` resolutions. Contradiction creates a linked new
  Claim; update merges evidence into the existing Claim under its frozen-field
  rules.
- Replay remains idempotent through the existing Gateway, ChangeSet, Writer,
  reload, and revision protections.

## Verification

- Focused Daily/Gateway/workflow tests: 40/40 passed.
- Full suite after implementation: Node 976/976 passed; client 21/21 passed.
- `npm run typecheck`, `npm run client:typecheck`, `npm run client:build`, and
  `npm run document-parser:check`: passed.
- Fresh real Pi FIX-003: `EXECUTED`, `gate: true`; morning and evening both
  completed; enrichment 6/6 applied; change assessment 3 applied and 3
  safely fell back; synthesis 6 model-derived items; no secrets or raw bodies.
- The workflow replay test proves one Existing Claim update and no new
  Knowledge revision on replay. A telemetry defect found during acceptance was
  corrected so bound existing Claims are counted from canonical Claim
  `targetRef`, not from an intent naming convention.

## Remaining scope

This is not yet a complete cross-workflow Continuous Research product. It
provides the first bounded Daily maintenance path; broader scheduling,
cross-workflow signal routing, and UI exposure remain separate backlog work.
