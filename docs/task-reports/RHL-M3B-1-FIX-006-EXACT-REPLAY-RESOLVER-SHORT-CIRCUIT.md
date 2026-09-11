# RHL-M3B-1 FIX-006 — Exact Claim Replay Resolver Short-Circuit

Status: IMPLEMENTED / CTO ACCEPTANCE PENDING

## Scope and baseline

- Task: `RHL-M3B-1-FIX-006-EXACT-REPLAY-RESOLVER-SHORT-CIRCUIT`
- Baseline commit: `cadd036d3061dec9b52fe71bf5b6d4c3577df94f`
- Allowed implementation paths changed: `knowledge/production/gateway.ts`, `tests/knowledge/production/gateway-correctness.test.ts`, and this report.
- No governance, architecture, schema, validation, writer, review, workflow, skill, plugin, application, client, or M3B-2 changes were made.

## Rejected FIX-005 behavior and root cause

FIX-005 corrected the resolver-returned contradiction create conflict, but retained a replay-only branch that invoked `SemanticResolver` whenever an exact canonical Claim was found and `old.contradictsClaimRefs?.length === 1`. The result was ignored. This made exact replay depend on contradiction-link count and introduced an unnecessary production side effect.

The exact Claim lookup already resolves canonical semantic identity before any bounded candidate resolution. The root cause was the additional resolver call after that successful exact match, rather than a failure to resolve an exact Claim.

## Production correction

Removed the FIX-005 replay-only resolver invocation. The Gateway now keeps the deterministic order:

1. Resolve an exact canonical Claim by canonical semantic identity.
2. Short-circuit all semantic resolution when that exact Claim exists.
3. Invoke the bounded `SemanticResolver` only when no exact Claim exists and plausible changed semantic-slot candidates are present.

FIX-005's first-submit correction remains unchanged: a resolver-returned `contradicts` decision retains the newly planned incoming Claim, allocates a distinct incoming deterministic ID, links it to the prior Claim, and leaves the prior Claim unchanged. Create operations carry the planned canonical ID, and update operations preserve `knowledgeId === operation.object.id`.

## Regression evidence

The resolver-contradiction regression now:

- records the exact resolver decision `{ outcome: 'contradicts', reason: 'deterministic semantic contradiction' }`;
- proves the first changed submission enters the resolver exactly once;
- proves the incoming Claim ID differs from the prior Claim ID;
- proves the first result creates only the incoming ID and links `contradictsClaimRefs` exactly to the prior ID;
- proves the prior Claim is unchanged after the first submission;
- configures the resolver to throw on any second invocation;
- proves identical replay succeeds as `no_changes`, resolves the same incoming Claim ID, does not advance the Knowledge Base revision, retains exactly two Claims, and leaves both Claims unchanged.

For the deterministic FIX-005 fixture, the canonical IDs remain:

- prior Claim: `claim:research-368b65a69b8f5391`
- incoming resolver-contradiction Claim: `claim:research-7a46fbc3fdc5b96b`
- exact contradiction link: `["claim:research-368b65a69b8f5391"]`

A separate ordinary non-contradiction Claim replay uses a throw-on-invocation resolver and proves exact canonical Claim matching bypasses resolution generically, without depending on contradiction links, producer run, proposal ID, statement text, fixture values, or generated IDs.

## Validation

- `node --import tsx --test tests/knowledge/production/gateway-correctness.test.ts` — PASSED, 25/25.
- `npm run typecheck` — PASSED.
- `npm run client:typecheck` — PASSED.
- `npm run client:build` — PASSED; 175 modules transformed.
- `git diff --check` — PASSED; only normal LF-to-CRLF working-copy warnings were emitted.
- `npm run test:node` — PASSED, 588/588. An earlier concurrent run was not used as final evidence because it reported one unrelated timing-sensitive `VAL-HTTP-001` failure; the required sequential rerun passed, including `VAL-HTTP-001`.
- `npm test` — PASSED; client tests 21/21 and Node tests 588/588.

## Remaining limitations, governance, and blockers

The full regression is green on sequential rerun. The exact Claim replay path still merges newly archived provenance when replay evidence is distinct, as required by existing provenance behavior; this task only removes semantic resolution from exact matching.

No governance gap, external-setup blocker, or scope conflict was encountered. M3B-2 and all later M3B phases remain unimplemented and out of scope. Final CTO acceptance is pending and is not claimed by Luna.
