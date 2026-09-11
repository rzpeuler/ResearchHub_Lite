# RHL-M3B-1-FIX-004 Resolver Contradiction Acceptance

Status: FAILED / CTO ACCEPTANCE PENDING

## Task and baseline

- Task: `RHL-M3B-1-FIX-004-RESOLVER-CONTRADICTION-ACCEPTANCE`
- Base HEAD: `c801a09067aa477196a96cc932653c3380301773`
- Branch: `codex/personal-research-v1-industry-architecture`
- Governance: `docs/governance/governance-manifest.yaml` v1 and the active Luna task protocol at the base HEAD.
- Architecture revision set: frozen M3B-1 Personal Research, Knowledge Production, Knowledge Resolution, and Schema 0.4 / Storage Format 1 contracts named by the task.
- Current base HEAD is the orchestrator-synchronized FIX-003 commit. Luna cannot know or invent the future orchestrator synchronization commit.

## Changed files

- `tests/knowledge/production/gateway-correctness.test.ts` — split the misleading producer/resolver test, retained producer contradiction evidence, retained resolver supersession evidence, and added a dedicated resolver-returned contradiction regression.
- `docs/task-reports/RHL-M3B-1-FIX-003-CONTRACT-AND-ACCEPTANCE-CLOSURE.md` — corrected FIX-003 commit wording and replaced the unsupported resolver-contradiction acceptance claim with the new evidence and failure.
- `docs/task-reports/RHL-M3B-1-FIX-004-RESOLVER-CONTRADICTION-ACCEPTANCE.md` — this report.

No production file was modified. In particular, `knowledge/production/gateway.ts` is unchanged.

## Dedicated regression and observed behavior

The new test is named `resolver-returned contradiction creates a distinct linked Claim, preserves the prior Claim, and replays idempotently`.

- The prior canonical Claim is seeded as `base`, with persisted canonical ID captured as `baseId`.
- The incoming Claim has a changed structured value and changed statement, with no producer-declared `resolution: 'contradict'`.
- The injected resolver callback is actually entered and returns exactly `{ outcome: 'contradicts', reason: 'deterministic semantic contradiction' }`.
- The expected incoming contradiction ID is captured separately and is required to differ from `baseId`.
- The test asserts `contradictsClaimRefs` exactly equals `[baseId]`, snapshots the complete persisted prior Claim before the operation, and compares it after the operation.
- The replay uses the same contradiction input and asserts `no_changes`, the same contradiction Claim ID, exactly two canonical Claims, and unchanged prior Claim state.

The first resolver-contradiction submit does not commit. It returns `blocked` with `V04_CREATE_CONFLICT: Create conflicts with existing canonical object: claim:research-368b65a69b8f5391` (the exact hash can be deterministic for the seeded fixture). Therefore the distinct Claim, contradiction-link, prior immutability, and replay assertions cannot be reached as passing evidence. This is a production-behavior defect exposed by the required regression, not a test weakening or a report-only limitation.

## Validation

- `node --import tsx --test tests/knowledge/production/gateway-correctness.test.ts` — FAILED, 23 passed / 1 failed; the dedicated resolver contradiction regression fails with the exact `V04_CREATE_CONFLICT` above. The focused suite now contains 24 tests and retains all prior FIX-003 behaviors.
- `npm run typecheck` — NOT RUN after the focused failure.
- `npm run client:typecheck` — NOT RUN after the focused failure.
- `npm run test:node` — NOT RUN after the focused failure.
- `npm test` — NOT RUN after the focused failure.
- `npm run client:build` — NOT RUN after the focused failure.
- `git diff --check` — PASS.

## Limitations, governance gaps, and blockers

- The required idempotency and persisted-link assertions are present but cannot pass until the production Gateway/validation behavior is corrected. The task explicitly forbids a production change in this round, so no such change was attempted.
- No governance gap, credential, API-key, OTP, or platform-configuration blocker was found.
- The blocker is an in-scope production behavior failure: the resolver-returned contradiction path attempts a conflicting canonical create before the test can establish the required acceptance properties.
- No commit, amend, rebase, push, or force-push was performed. ORCHESTRATOR owns synchronization.
