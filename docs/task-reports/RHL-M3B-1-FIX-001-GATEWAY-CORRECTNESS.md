# RHL-M3B-1-FIX-001 — Gateway Correctness

Status: **IMPLEMENTED / CTO ACCEPTANCE PENDING**

Baseline: `10acf953cc10ba4e692ddad40abb30c615b2b714` (verified at start). The intervening governance commit `5cc65f71b24c457f3bf5a5cbc9936ee1397e00c6` preceded this baseline and is not part of Luna's M3B-1 implementation scope.

## Defects and decisions

| Defect | Root cause | Before | After |
| --- | --- | --- | --- |
| Non-Company root binding | Root path always used Company hard matcher | Industry/Product/Technology roots could be created or missed without typed conservative resolution | Explicit refs are existence/type checked; Company uses exchange/ticker; non-Company roots use typed plausible retrieval plus bounded resolver/review |
| Root contract overwrite | Entity proposal map replaced the root input on the same local key | A semantic proposal could change the authoritative root | Conflicting root-key proposals fail closed |
| Relation outcome mapping | Terminal helpers dropped mappings and exact Relation reconstruction replaced evidence | Mapping was incomplete on blocked/failed paths and prior Relation evidence could disappear | `relationRefsByProposalId` is returned on all outcomes; exact Relations union source refs |
| Raw/Source provenance | Raw map was never populated and Claims used the first/synthetic Raw | Distinct evidence collapsed to one Raw; unarchived Raw refs were possible | Every usable binding maps localSourceId → archived Raw; Claim provenance is Source-specific; review cases require real Raw |
| Existing Source persistence | In-memory merge had no ChangeSet update | Added Raw refs could be lost on reload | Existing Source Raw union emits an explicit update operation |
| Claim replay/update semantics | Existing provenance was replaced/omitted and update was too permissive | Replay could drop provenance or alter frozen fields | Provenance unions are duplicate-free; explicit updates require one existing ref and only change the established structured value slot |
| Claim lifecycle semantics | Forecast defaults and contradiction/resolution guards were weakened | Omitted forecast probability remained invalid; malformed refs could be ignored | Forecast defaults to `0.5`; contradiction links and supersession lifecycle links are retained; runtime-invalid shapes fail closed |

The implementation remains producer-neutral: no `industry_research` branch was added under `knowledge/production`.

## Changed files

- `knowledge/production/gateway.ts`
- `tests/knowledge/production/gateway-correctness.test.ts`
- `docs/task-reports/RHL-M3B-1-FIX-001-GATEWAY-CORRECTNESS.md`

No governance, architecture, Schema, Writer, Validation, application, Workflow, Skill, or Plugin files were changed.

## Focused test matrix

The focused suite now contains 9 deterministic tests covering usable-evidence qualification, Source identity, Claim temporal identity, Company hard identity, Relation mapping/replay, Relation-subject Claims, conservative Industry root replay, Company ref/ticker protection, root-key protection, and distinct Source-to-Raw Claim provenance.

The new tests explicitly prove that a fresh Industry root is created once and resolver-bound replay does not duplicate it; a Company existing ref cannot bind a different ticker; a semantic proposal cannot overwrite the root; and two evidence bindings retain two distinct archived Raw refs in Claim provenance.

## Validation

- `node --import tsx --test tests/knowledge/production/gateway-correctness.test.ts` — **PASS**, 9/9.
- `npm run typecheck` — **PASS**.
- `npm run test:node` — **PASS**, 572 Node tests in the final full run context.
- `npm test` — **PASS**, 4 client files / 21 client tests and 60 Node files / 572 Node tests.
- `git diff --check` — **PASS**.

## Invariants and evidence

The Gateway still creates one validated ChangeSet and invokes the shared Writer once per submission. Source updates, Relation evidence merges, Claim provenance merges, and lifecycle changes are represented as ChangeSet operations before validation. Replays produce `no_changes` when canonical state and provenance are already complete. Blocked/failed outcomes retain accumulated entity, relation, source, and claim mappings; no synthetic Raw ref is used. ReviewCases are only persisted when a usable evidence binding supplied a real archived Raw ref.

## Remaining limitations and governance gaps

This task does not implement M3B-2 Industry Research Skill or Workflow, M3B-3 acquisition/Application/Pi/Graph integration, Schema migration, or a generic semantic engine. Non-Company semantic equivalence remains bounded by the supplied resolver; without a resolver, a plausible textual match remains review-required. CTO acceptance remains pending orchestration review.
