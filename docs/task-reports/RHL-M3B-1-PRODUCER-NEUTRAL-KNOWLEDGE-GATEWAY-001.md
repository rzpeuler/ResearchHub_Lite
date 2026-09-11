# RHL-M3B-1 Producer-Neutral Knowledge Gateway

Status: IMPLEMENTED / CTO ACCEPTANCE PENDING

## Baseline and scope

- Baseline commit: `92774c58a4f89bc4c8e211dd4a8076ba6ffc79f7`
- Final commit: pending orchestrator synchronization after validation.
- Scope changed only `knowledge/production/`, `tests/knowledge/production/`, and this report.
- Luna did not push. The local implementation commit was converted back into the worktree so the orchestrator can perform the governed commit and push. M3B-2, Industry Skill/Workflow, Schema migration, and all excluded infrastructure remain untouched.

## Assumptions and implementation decisions

- Company root binding remains the deterministic `(exchange, ticker)` hard-identity path.
- `ProductionEntityInput.existingEntityRef` is optional, and is accepted only when the canonical object exists and has the requested Entity type; invalid references fail closed into review/block behavior.
- Industry, Product, and Technology candidates are type-filtered. A textual candidate is not hard-bound without the configured semantic resolver returning `equivalent`; multiple candidates never use first-match selection.
- Relations are staged before Claims. `relationRefsByProposalId` is populated for newly created and exact existing Relations, including no-change/blocked outcome shapes.
- Relation-subject Claims use the mapped canonical Relation ref and do not fall back to the root Entity when that Relation is unresolved.
- Existing Claim update/supersede/review compatibility was retained for current producers.

## Acceptance mapping

- Generic root binding and optional canonical ref: implemented in `knowledge/production/contracts.ts` and `gateway.ts`.
- Conservative non-Company resolution and duplicate-resistant deterministic creation: implemented with type-aware candidate retrieval and bounded semantic resolver use.
- Relation proposal mapping and staged Claim subject resolution: implemented with `relationRefsByProposalId` and Relation-first processing.
- Provenance, evidence, relation endpoint/attribute checks, temporal Claim identity, ChangeSet validation, and one Writer boundary: preserved and validated by focused/full suites.
- Producer neutrality: no `industry_research` conditional branch was introduced in Knowledge Production.

## Changed files

- `knowledge/production/contracts.ts`
- `knowledge/production/gateway.ts`
- `tests/knowledge/production/gateway-correctness.test.ts`
- `docs/task-reports/RHL-M3B-1-PRODUCER-NEUTRAL-KNOWLEDGE-GATEWAY-001.md`

## Validation evidence

- `node --import tsx --test tests/knowledge/production/gateway-correctness.test.ts` — PASS, 6/6.
- `npm run typecheck` — PASS.
- `npm run test:node` — PASS, 568/568.
- `npm test` — PASS: client 21/21 and Node 568/568.
- `git diff --check` — PASS.

Focused coverage includes Company hard identity and replay, explicit typed root binding, producer-neutral Industry Relation mapping, Relation-subject Claim creation, temporal/slot replay, Relation deduplication, and governed review behavior. The added regression proves a Relation-subject Claim stores the canonical Relation ref rather than silently using the Industry root.

## One-commit and provenance checks

The Gateway still constructs one validated ChangeSet and invokes the shared Writer at most once per submission. Raw bytes are archived before Source/Claim persistence; canonical Source and Claim provenance continue to reference the archived Raw identity. Existing tests covering single-commit behavior, Raw/Source provenance, replay, and Writer validation pass.

## Regressions and limitations

- Existing Company, Event, Earnings Review, Valuation, Knowledge Resolution, Writer, and client suites passed.
- The Gateway remains intentionally conservative: an unproven non-Company textual match becomes review-required unless a supplied semantic resolver establishes equivalence.
- This report does not claim CTO acceptance; the independent Sol/CTO acceptance round remains pending.

## Governance gaps and blockers

- No governance conflict or external setup blocker was encountered.
- No Schema, Writer, Validation, governance, architecture, app, skill, workflow, or plugin files were changed.
