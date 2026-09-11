# RHL-M3B-1-FIX-002 Gateway Semantic Resolution

Status: IMPLEMENTED / CTO ACCEPTANCE PENDING

## Baseline and scope

- Task: `RHL-M3B-1-FIX-002-GATEWAY-SEMANTIC-RESOLUTION`
- Base commit verified: `42170df9b0027b86e48abbb22ca8a9f8993cf04e`
- FIX-001 code commit: `72ec6ea632ac4f6ea1408b2b987fa301812133a`
- `42170df9b0027b86e48abbb22ca8a9f8993cf04e` only advanced the active task-template governance after FIX-001.
- Changed paths: `knowledge/production/**`, `tests/knowledge/production/**`, and this report only.
- No commit, push, amend, rebase, or force-push was performed.

## CTO findings and corrections

1. Semantic-equivalent changed Claims now bind `claimRefsByProposalId` to the existing canonical Claim ID. Evidence/provenance is merged without creating a duplicate or emitting an update with a mismatched `knowledgeId` and object ID.
2. Resolver outcomes are explicit: `supersedes` creates a new deterministic incoming Claim and reciprocal lifecycle links; `contradicts` creates a distinct Claim with `contradictsClaimRefs`; `uncertain` remains review-required.
3. Claim proposal dependency links are materialized through resolved proposal refs into `supportsClaimRefs`, `dependsOnClaimRefs`, and `contradictsClaimRefs`, with self-link filtering and deterministic deduplication.
4. Explicit `existingKnowledgeRefs` updates are fail-closed unless the canonical subject, claim type, statement, temporal identity, metric, unit, comparator, period, and fiscal-period fields remain frozen. Only the structured value is mutable, with evidence/provenance merge.
5. Resolver construction now uses the shared `SemanticResolver` contract instead of `(x: any) => any`.
6. Every Gateway runtime terminal return includes `relationRefsByProposalId`, including blocked, failed, and no-change paths. The public interface remains source-compatible with legacy workflow no-change literals outside the approved scope; this is a known typing limitation and is pending CTO decision on whether to authorize workflow updates.
7. A final operation-plan invariant blocks any update where `knowledgeId !== operation.object.id`.

FIX-001 behavior was retained: producer-neutral root binding, Company hard identity, conservative non-Company resolution, root proposal protection, Source-to-Raw provenance, Source raw-ref merging, Relation evidence union, Relation-before-Claim staging, Relation-subject Claim support, no unresolved Relation root fallback, real Raw-backed ReviewCases, producer neutrality, and one validated ChangeSet / one Writer boundary.

## Focused acceptance evidence

`node --import tsx --test tests/knowledge/production/gateway-correctness.test.ts`: PASSED, 12/12.

The focused suite now covers source usability, contextual Source identity, temporal Claim identity, Relation deduplication, supersession/review behavior, Relation-subject Claims, non-Company root resolution, Company/root guards, replayed provenance, semantic-equivalent canonical-ID preservation, proposal-link materialization, frozen-field update rejection, and structurally present Relation mappings on terminal outcomes.

## Full validation

- `npm run typecheck`: PASSED
- `npm run test:node`: PASSED, 575/575
- `npm test`: PASSED; client 21/21 and Node 575/575
- `git diff --check`: PASSED

## Invariants and remaining limitations

- Canonical Claim equivalent resolution preserves the existing object ID and does not emit a mismatched update operation.
- Supersession uses a new incoming Claim ID, marks the prior Claim superseded, and records reciprocal lifecycle references.
- Claim evidence and provenance are merged by canonical Source/Raw pair.
- Relation proposal refs and Claim proposal refs are deterministic and bounded by resolved local mappings.
- No intermediate canonical write was introduced; Gateway validation precedes the single shared Writer invocation.
- The required runtime Relation mapping is present on all Gateway outcomes. Making that field statically required would require edits to legacy no-change literals in `workflows/**`, which is explicitly outside this task scope; those callers were not modified.
- Final status remains IMPLEMENTED / CTO ACCEPTANCE PENDING as required by the task.
