# RHL-M3B-2-FIX-001 — Workflow Contract and Acceptance

Status: **IMPLEMENTED / CTO ACCEPTANCE PENDING**

Base commit: `f4b3b5898dd4216206fe9ddadb2664834df54924`

This report records the bounded M3B-2 correction pass. It does not authorize or implement M3B-3 live acquisition, Application/Pi integration, Real Pi E2E, Knowledge Graph acceptance, schema migration, or a new canonical object kind.

## CTO findings and corrections

1. The three frozen Industry operations were added directly to `REASONING_OPERATIONS`: `industry_research_design`, `industry_module_analysis`, and `industry_cross_module_synthesis`. `IndustryResearchSkill` now passes the typed `ReasoningOperation` contract without an operation-as-`never` escape. Reasoning regression evidence verifies the three literals and representative pre-existing operations.
2. Skill validation now bounds ResearchDesign target diagnosis, all eight module questions, string arrays, known-gap module membership and safe IDs, verification-candidate kinds, local proposal IDs, allowed Entity/Claim types, evidence references, proposal links, and structured quantitative values. A failed model output receives one repair attempt; repeated invalid module output becomes explicit `unavailable`.
3. The single Skill and exactly eight frozen modules remain unchanged.
4. Workflow now requires a final available `industry_definition` result before synthesis/Gateway submission. Other modules may remain `supported`, `partial`, or `unavailable`; unavailable output is retained as explicit gap/report material.
5. Module evidence is routed deterministically. Explicit normalized-source metadata hints (`module`, `modules`, `moduleHints`, `researchModules`) take precedence; otherwise title/snippet/content is matched against module, target, and design-question terms. Results are sliced to `maxEvidencePerModule`. A single official disclosure is treated as the bounded broad-context fixture case; multiple sources are subset-routed by relevance. No module receives an unbounded corpus.
6. Existing Knowledge projection is bounded to at most five plausible Industry candidates by name/alias retrieval signal, then one-hop relations/claims and at most 80 objects. No candidate is bound in Workflow; canonical equivalence remains Gateway/SemanticResolver authority.
7. The Workflow durable gate is typed and deterministic. It checks local IDs, local Entity/Relation endpoints, Schema 0.4 relation existence and endpoint types, allowed Claim types, evidence binding, structured quantitative completeness, proposal links as supplied by Skill, and conservative `supplier_of` evidence. Root local key `industry` is included as an Industry endpoint. Relation-subject Claims are preserved and unresolved subjects are rejected.
8. Claims and Relations without admitted evidence are excluded from the Gateway bundle. Structured values retain period/fiscal-period semantics and supplied geography, measurement definition, and source methodology fields. Same-slot structured conflicts produce a deterministic diagnostic rather than first-match admission. Supplier evidence requires tier 1/2 official or structured data plus bounded publisher/title/content signals; community/rumor-only evidence is rejected.
9. Gateway submission remains exactly once per run. After a successful or no-change outcome, Workflow calls the read-only canonical loader and fails closed if any mapped Entity/Source/Relation/Claim reference is absent before report construction.
10. The report retains the frozen sixteen section titles and order, `industry_research` support, canonical provenance fields, and safe relative output paths. Report references are derived from Gateway maps and therefore checked against the post-Gateway canonical reload.

## Wave 2, cancellation, and persistence evidence

- Wave 2 is still zero or one execution, only when first-pass actionable gaps exist. Only modules whose gaps match newly admitted evidence rerun, at most once. No third reasoning wave exists.
- Cancellation is checked before acquisition/module work and immediately before Gateway submission. The existing cancellation test confirms zero Gateway mutation for an already-cancelled run.
- The offline no-gap fixture demonstrates eight module calls, one acquisition wave, one Gateway submit, sixteen report sections, and no Wave 2.
- Industry Definition unavailable after bounded repair/gap-fill returns `blocked` before Gateway. Theme diagnosis remains blocked before acquisition/Gateway.
- The shared Gateway/Writer path remains the sole canonical mutation path; canonical reload is read-only and does not create a second revision or Writer invocation.

## Acceptance matrix covered by this pass

Focused tests explicitly cover the exact operations, all eight modules, target diagnosis, strict Design/gap/candidate validation, allowed/invalid Claim types, local/canonical ID rules, evidence escape rejection, structured-value validation, and one-repair maximum. Workflow fixtures cover the eight-module no-gap path, sixteen-section persistence, Theme blocking, cancellation, bounded acquisition, the mandatory Industry Definition boundary, and a successful Product/Company/Relation/Relation-subject Claim bundle. Existing Knowledge Gateway tests cover Relation-subject Claim mapping, replay/idempotency, canonical Relation mapping, multiple plausible non-Company candidates, source/raw provenance, one-submit/one-revision behavior, and runtime-invalid proposal fail-closed behavior.

The successful offline Industry fixture confirms the report type and relation provenance support. The full repository suite also exercises the shared producer-neutral Gateway behavior that supplies canonical object mapping and replay guarantees.

## Validation evidence

All requested commands passed:

- `node --import tsx --test tests/skills/industry-research/industry-research-skill.test.ts` — 4 passed.
- `node --import tsx --test tests/workflows/industry-deep-research/industry-deep-research-workflow.test.ts` — 3 passed.
- `node --import tsx --test tests/plugins/reasoning/reasoning.test.ts` — 11 passed.
- `node --import tsx --test tests/app/services/research-report.test.ts` — 3 passed.
- `npm run typecheck` — passed.
- `npm run client:typecheck` — passed.
- `npm run test:node` — 597 passed, 0 failed.
- `npm test` — client 21 passed; Node 597 passed.
- `npm run client:build` — passed.
- `git diff --check` — passed; Git reported only normal LF/CRLF conversion warnings.

## Remaining limitations and governance blockers

- This is offline Workflow evidence. Live/free acquisition composition remains M3B-3 and is intentionally not implemented.
- Application Service, Pi integration, Real Pi execution, and Graph acceptance remain out of scope.
- CTO acceptance still requires external review of the resulting worktree against the frozen architecture revision set. No commit, amend, rebase, force-push, or push was performed; Git synchronization is owned by the orchestrator.
- The task remains `IMPLEMENTED / CTO ACCEPTANCE PENDING`, not externally blocked.
