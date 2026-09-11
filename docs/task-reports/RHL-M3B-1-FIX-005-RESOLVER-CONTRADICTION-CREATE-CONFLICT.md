# RHL-M3B-1 FIX-005 — Resolver Contradiction Canonical Create Conflict

Status: IMPLEMENTED / CTO ACCEPTANCE PENDING

## Scope and baseline

- Task: `RHL-M3B-1-FIX-005-RESOLVER-CONTRADICTION-CREATE-CONFLICT`
- Baseline: `27c6f9181ea53474627871dd9779cb6df2e0a2ae`
- Changed paths: `knowledge/production/gateway.ts`, `tests/knowledge/production/gateway-correctness.test.ts`, and this report.
- No Schema, Validator, Writer, Review, contracts, Workflow, architecture, or M3B-2 changes were made.

## Reproduction evidence

The committed FIX-004 regression was run unchanged before the production correction. It failed on the first resolver-returned contradiction submission:

`V04_CREATE_CONFLICT: Create conflicts with existing canonical object: claim:research-368b65a69b8f5391`

The resolver was entered and returned `{ outcome: 'contradicts', reason: 'deterministic semantic contradiction' }`. The deterministic fixture's prior Claim was `claim:research-368b65a69b8f5391`; the planned incoming contradiction Claim ID was `claim:research-7a46fbc3fdc5b96b`. The ChangeSet nevertheless contained a create object carrying the prior ID, which the unchanged Validator correctly rejected.

## Root cause and correction

The resolver path set `old` to the one plausible existing Claim and set `semanticContradict`. The subsequent existing-Claim evidence merge branch tested only producer-declared `p.resolution` values. Because the producer had declared no resolution, that branch replaced the newly planned incoming Claim with a copy of `old`, including the prior canonical ID, before the create operation was assembled.

The Gateway now excludes `semanticSupersede` and `semanticContradict` from that merge branch. Resolver contradiction therefore retains the incoming semantic content and deterministic contradiction identity/link. Claim create operation construction also explicitly carries the planned Claim ID, preserving the invariant that a create targets an ID absent from the baseline and earlier incompatible operations. Update construction preserves `knowledgeId === object.id`.

Replay of an already materialized contradiction Claim still enters the supplied resolver while retaining the exact existing contradiction Claim and its ID; it produces the established no-op outcome.

## Canonical evidence

For the deterministic FIX-004 fixture:

- Prior Claim: `claim:research-368b65a69b8f5391`
- Incoming contradiction Claim: `claim:research-7a46fbc3fdc5b96b`
- IDs differ.
- First submission creates exactly the incoming ID; it does not create the prior ID.
- Incoming `contradictsClaimRefs` is exactly `["claim:research-368b65a69b8f5391"]`.
- The prior Claim remains byte-for-byte equal to its pre-submission snapshot, including ID, lifecycle, statement, subject, temporal and structured fields, and existing links.
- The first submission leaves exactly two canonical Claims.
- Identical replay returns `no_changes`, resolves the same incoming Claim ID, enters the resolver again, leaves the canonical Claim count at two, and preserves both Claims.

Producer-declared contradiction remains separately covered and unchanged. Equivalent, supersedes, and uncertain/review resolver behavior remains covered by the existing Gateway tests.

## Validation

- `node --import tsx --test tests/knowledge/production/gateway-correctness.test.ts` — PASSED, 24/24.
- `npm run typecheck` — PASSED.
- `npm run client:typecheck` — PASSED.
- `npm run test:node` — PASSED, 587/587.
- `npm test` — PASSED, client 21/21 and Node 587/587.
- `npm run client:build` — PASSED; 175 modules transformed.
- `git diff --check` — PASSED; only Git's normal LF-to-CRLF working-copy warnings were emitted.

The focused regression additionally asserts the resolver decision, distinct incoming ID, exact contradiction link, prior immutability, replay idempotency, unchanged canonical count, and create-result ID consistency.

## Remaining limitations and governance

No governance gap or blocker was encountered. This correction remains producer-neutral and does not implement M3B-2 Industry Research Skill or Industry Deep Research Workflow behavior. Final CTO acceptance remains pending and is not claimed by Luna.
