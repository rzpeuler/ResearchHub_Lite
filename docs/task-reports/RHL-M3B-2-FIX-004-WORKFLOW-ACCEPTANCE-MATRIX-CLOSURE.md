# RHL-M3B-2 FIX-004 — Workflow Acceptance Matrix Closure

Status: CTO ACCEPTANCE PENDING

Baseline: `4921572d81439a30f429593a08a24e7eb47434a9`.

## Scope and changed files

Only the approved test scope changed:

- `tests/skills/industry-research/industry-research-skill.test.ts`
- `tests/workflows/industry-deep-research/industry-deep-research-workflow.test.ts`

No production correction was required after the new tests. No file under `skills/industry-research/**` or `workflows/industry-deep-research/**` was changed. No M3-3 behavior was implemented. Commit, push, amend, rebase, and force-push were not performed.

## Direct acceptance evidence

| Acceptance area | Direct named test evidence |
|---|---|
| Five diagnosis kinds and fail-closed target routing | `Workflow acceptance matrix covers all four non-industry target diagnoses independently`; `Industry Skill target diagnosis accepts exactly the five contract kinds and rejects others` |
| Industry Definition bounded repair and mandatory availability | `Workflow blocks when Industry Definition remains unavailable after one repair`; `Industry Skill performs at most one repair attempt and marks repeated invalid output unavailable` |
| No-gap Wave 1 and eight module calls | `Workflow no-gap acceptance proves one wave and one call for each module` |
| One-gap Wave 2, affected-module isolation, no Wave 3 | `Workflow Wave-2 acceptance admits one new source, reruns only its affected module, and never starts Wave 3` |
| Source budget and duplicate candidate capacity | `Workflow source-budget saturation skips Wave 2 and emits deterministic exhaustion diagnostic`; `Workflow duplicate Wave-2 candidates do not consume the remaining source slot` |
| Hint routing, unrelated evidence isolation, per-module bound | `Workflow routes hinted evidence, bounds module evidence, and bounds Existing Knowledge to 80` |
| Existing Knowledge bound | Same routing test captures design and every module input at 80 objects |
| Late cancellation before durable submission | `Workflow late cancellation is observed after module work and before durable submission` |
| Sixteen-section order and canonical section provenance | `Workflow produces exact sixteen frozen sections with section-specific material and canonical provenance` |
| Catalyst, metric, unresolved-gap, and alternative-view semantics | `Workflow report material proves validated catalyst and metric inputs, plus independent gaps and alternative views` |
| Candidate retrieval without first-match binding | `Workflow exposes bounded plausible Industry candidates without first-candidate binding` |
| Replay and one Gateway per run | `Workflow replay reuses the canonical Industry and exact semantic objects while writing a second report` |
| Shuffled Entity/Relation/Relation-subject Claim order | `Workflow shuffled-order fixture stages Entity, Relation, and Relation-subject Claim independent of model output order` |
| Exact semantic duplicate merge and stable linkage | `Workflow exact semantic duplicates merge deterministically, preserve linkage, and do not merge material differences` |
| Explicit contradiction vs unsupported conflict | `Workflow explicit contradiction retains both governed Claims while unsupported same-slot conflict is excluded` |
| Durable-gate local-failure behavior | `Workflow durable-gate adversarial matrix is local-failure tolerant and never commits malformed canonical objects` |
| Skill contract negatives | `Industry Skill rejects duplicate or malformed ResearchDesign arrays and gap IDs`; `Industry Skill rejects invalid verification kind, canonical IDs, resolution fields, links, and quantitative values`; `Industry Skill validates module and synthesis report material, references, gaps, and relation-only IDs` |

## Observed execution evidence

- Workflow focused suite: 23/23 passed.
- Skill focused suite: 10/10 passed.
- Research report focused suite: 3/3 passed.
- `npm run typecheck`: passed after the final test-fixture correction.
- `npm run client:typecheck`: passed.
- `npm run test:node`: 623/623 passed.
- `npm test`: client 21/21 and Node 623/623 passed.
- `npm run client:build`: passed.
- `git diff --check`: passed.
- One initial combined validation invocation reported two test-fixture TypeScript errors before the final correction; the required commands were rerun and passed afterward.

The matrix directly proves one acquisition wave for the no-gap path, at most two waves for the actionable-gap path, no third module call, eight first-pass module calls, isolated second-pass calls, source-budget saturation, duplicate skipping, and one Gateway submission on successful runs. Cancellation cases show zero Gateway submissions, unchanged revision, and no report output. Successful fixtures reload every mapped canonical Entity/Relation/Claim/Source reference and persist a second sixteen-section replay report.

## Remaining acceptance gap

The adversarial test is a representative Workflow-exercised durable-gate matrix and proves local-failure tolerance, but it does not yet have one separately named direct case for every requested permutation: conflicting Entity local subject keys, reserved root redefinition, dangling Relation source/target, unsupported Relation type, schema-incompatible Relation endpoints, durable Claim/Relation without evidence, unknown evidence, invalid Claim type, malformed structured value, rejected Relation-subject Claim link, weak/community-only `supplier_of`, and every final-graph link permutation. Existing Gateway/schema suites cover several of those lower-level rules, but the task explicitly requires each to be direct through `runIndustryDeepResearch`.

Therefore this report does not claim full CTO acceptance closure. The remaining work is limited to expanding the Workflow adversarial table into those individually named cases and recording their direct results. No production defect was exposed by the completed matrix.

## M3-3 boundary retained

Live/free acquisition composition, Application Service action, Pi integration, Real Pi E2E, Graph acceptance, and other M3-3 work remain future scope and were not implemented.
