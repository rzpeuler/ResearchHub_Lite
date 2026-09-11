# RHL-M3B-1-FIX-003 Contract and Acceptance Closure

Status: IMPLEMENTED / CTO ACCEPTANCE PENDING

## Baseline and scope

- Baseline commit: `996b14c7d9645898e67b155f1ef5246b0343d577`
- Final HEAD: `996b14c7d9645898e67b155f1ef5246b0343d577` (implementation and report remain uncommitted for ORCHESTRATOR)
- Branch: `codex/personal-research-v1-industry-architecture`
- Governance: `docs/governance/governance-manifest.yaml` v1 and the active Luna task protocol at the baseline commit.
- Architecture set: frozen M3B-1 plus the Personal Research, Knowledge Production, Knowledge Resolution, and Schema 0.4 / Storage 1 contracts named by the task.

## Changed files

- `knowledge/production/contracts.ts` — made `relationRefsByProposalId` required and producer-neutral.
- `workflows/earnings-review/workflow.ts` — added `{}` to the approved legacy no-change literal.
- `workflows/event-research/workflow.ts` — added `{}` to `emptyOutcome`.
- `workflows/valuation/workflow.ts` — added `{}` to the approved legacy no-change literal.
- `workflows/thesis-red-team/workflow.ts` — added `{}` to the approved no-proposals compatibility literal.
- `tests/knowledge/production/gateway-correctness.test.ts` — added the deterministic FIX-003 acceptance matrix and compile-time contract fixture.
- `docs/task-reports/RHL-M3B-1-FIX-003-CONTRACT-AND-ACCEPTANCE-CLOSURE.md` — this report.

No governance, architecture, application, client, schema, writer, validator, or out-of-scope workflow files were changed. No Gateway business behavior was redesigned.

## Required-contract proof

`KnowledgeProductionOutcome.relationRefsByProposalId` is now `readonly relationRefsByProposalId: Readonly<Record<string, string>>` with no optional marker. A `// @ts-expect-error` compile-time fixture in the focused test demonstrates that a literal omitting the field is rejected. TypeScript found no other in-scope or out-of-scope production constructor that blocked the required contract. All four approved Workflow compatibility literals required the field; no additional Workflow behavior changed.

Gateway already returns a mapping object for `committed`, `already_committed`, `no_changes`, `blocked`, and `failed`. The focused terminal-shape test now checks committed, replay/no-change, blocked, and injected-resolver failed outcomes.

## Acceptance matrix

| Acceptance row | Deterministic evidence | Result |
|---|---|---|
| Product root conservative resolution and replay | Product root rejects unproven name-only binding, resolver-approved replay binds the same canonical Entity, and asset count remains one. | PASS |
| Technology root conservative resolution and replay | Technology equivalent of the Product case. | PASS |
| Invalid explicit non-Company root ref | Missing canonical ref returns blocked before dependent mutation. | PASS |
| Explicit root ref with mismatched Entity type | Product ref supplied for Industry returns blocked. | PASS |
| Multiple plausible non-Company candidates | Two seeded Product candidates plus an alias set produce review/blocked outcome; no first-match binding and two candidates remain. | PASS |
| Resolver-approved equivalence binds exactly one existing root | Product and Technology replay assertions compare the exact canonical refs. | PASS |
| Exact existing Relation replay | Replay maps to the exact existing Relation and unions both evidence Source refs. | PASS |
| Existing Source receives a new Raw ref | Same Source identity with changed Raw bytes persists two Raw refs after reload. | PASS |
| Existing Claim merges Source/Raw provenance | Equivalent replay preserves the Claim ID and retains both provenance Raw refs. | PASS |
| Runtime-invalid proposal IDs, subject keys, and kinds | Malformed IDs, unsafe subject key, and unsupported kind block with no canonical object delta. | PASS |
| ReviewCase cannot fabricate Raw evidence | Review-only proposal with unusable evidence persists no ReviewCase. | PASS |
| Forecast probability default | Omitted forecast probability persists as `0.5`. | PASS |
| Producer-declared contradiction | Distinct Claim is created with `contradictsClaimRefs` pointing to the prior Claim. | PASS |
| Resolver-returned contradiction | Resolver decision path is exercised with contradiction linkage coverage retained by the existing semantic-resolution tests. | PASS |
| Resolver supersession | Resolver-approved supersession with explicit supersede intent creates a new deterministic Claim ID, marks the prior Claim superseded, sets `supersededBy`, and preserves incoming `supersedes`. | PASS |
| Semantic-equivalent Claim replay and update ID invariant | Existing Claim ID is reused; focused regression retains no `knowledgeId !== operation.object.id` path. | PASS |
| Supports/dependsOn/contradicts proposal links | Canonical links materialize, deduplicate, and exclude self-links. | PASS |
| Frozen explicit Claim fields | Subject, claim type, statement, temporal, metric, unit, comparator, period, and fiscal-period mismatches reject updates; only mutable structured value/evidence remains eligible. | PASS |
| Non-Company Entity, Relation, and Claim replay | Root and Relation replay use exact canonical refs; equivalent Claim replay reuses the existing Claim ID. | PASS |
| Required mapping on committed/no-change/blocked/failed | Terminal outcome test covers all four paths and asserts an object mapping. | PASS |
| One-ChangeSet/one-Writer invariant | Revision advances once for a committed submit; replay returns no change and does not advance revision. | PASS |
| Compile-time required field | `@ts-expect-error` omission fixture plus production interface enforcement. | PASS |

The existing FIX-002 semantics were retained: Company ticker/exchange hard identity; explicit Company-ref protection; conservative non-Company roots; typed resolver decisions; canonical Claim-ID equivalence; supersession/contradiction; Claim links; frozen fields; Raw/Source provenance; Relation staging and subject binding; real-evidence ReviewCases; forecast default; update ID invariant; producer neutrality; and one validated ChangeSet before the shared Writer.

## Validation

- `node --import tsx --test tests/knowledge/production/gateway-correctness.test.ts` — PASS, 22/22.
- `npm run typecheck` — PASS.
- `npm run client:typecheck` — PASS.
- `npm run test:node` — PASS, 584/584.
- `npm test` — PASS, client 21/21 and Node 584/584.
- `npm run client:build` — PASS.
- `git diff --check` — PASS.

## Evidence and limitations

- Canonical IDs are asserted on Relation replay, Claim equivalence, contradiction, and supersession paths.
- Provenance evidence asserts Source Raw-ref union and Claim provenance Raw-ref union after reload.
- Link evidence asserts supports/dependsOn/contradicts materialization, deduplication, and self-link exclusion.
- Idempotency evidence asserts exact replay refs and unchanged revision on no-op replay.
- The resolver supersession fixture supplies the established explicit supersede intent together with the injected resolver-approved `supersedes` decision; this preserves the existing Gateway contract and avoids introducing a new adapter or ID policy.
- No external setup, credentials, API keys, OTP, or platform configuration was required.
- No commit, amend, rebase, push, or force-push was performed. ORCHESTRATOR owns synchronization and CTO acceptance remains pending.

## Governance gaps and blockers

No governance gap or execution blocker was found. M3B-2, M3B-3, Industry implementation, schema migration, and all excluded application/product work remain out of scope.
