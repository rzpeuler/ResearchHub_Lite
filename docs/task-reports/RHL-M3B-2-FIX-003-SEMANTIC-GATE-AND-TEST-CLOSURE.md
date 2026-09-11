# RHL-M3B-2 FIX-003 — Semantic Gate and Acceptance Evidence

Status: IMPLEMENTED / CTO ACCEPTANCE PENDING

Base reviewed: `fb4196c3ee8c996a6de7e1e0ae8c2f4c333e7430`

## Independent-review finding

FIX-002 improved source budgeting, cancellation, staged admissibility, canonical reload, and report assembly, but it added no focused tests despite claiming an acceptance matrix. This closure adds direct Skill and Workflow evidence and corrects the remaining semantic defects within the approved M3B-2 scope.

## Corrections

- Skill synthesis now receives the complete validated module Relation proposal set. A synthesis `relationProposalIds` value cannot use a module Entity or Claim ID.
- Industry Skill rejects `existingKnowledgeRefs` and producer-owned resolution fields; canonical binding remains Workflow/Gateway authority.
- Module and synthesis report material remains strict for non-empty markdown, qualified evidence, proposal membership, safe unique IDs, and Relation-only relation references. Invalid reasoning still receives at most one repair attempt and then fails closed.
- The durable gate rejects every candidate sharing a duplicated local `proposalId`, rejects conflicting Entity local keys as a whole, protects the reserved `industry` root, and deterministically merges exact semantic duplicates while merging qualified evidence and links.
- Entities, Relations, and Relation-subject Claims are admitted in dependency stages independent of model output order. Dangling/self Claim links are removed from the final admitted graph; unsupported same-slot conflicts are excluded, while explicit local contradiction intent preserves compatible contradictory Claims.
- Wave 2 qualification excludes Wave-1 candidate IDs before applying the remaining source budget. Routing honors metadata hints first and then bounded lexical relevance; only newly admitted evidence can affect a gap and rerun its module. No third wave or third module call is introduced.
- Existing Knowledge is bounded to 80 before design, module, and synthesis operations. Candidate retrieval remains capped at five and does not silently select a first canonical Industry.
- Report assembly keeps sixteen frozen titles/order, derives special-section provenance from the local material used, emits distinct Section 5/6 gaps when material cannot be distinguished, sources Catalysts from catalyst material, keeps Key Metrics code-owned, and combines module gaps, synthesis gaps, and alternative views in Section 15.

## Named deterministic tests

Existing direct tests retained:

- `Industry Skill exposes exact operations and all eight modules`
- `Industry Skill rejects canonical IDs, unknown evidence, and bounded evidence escape`
- `Industry Skill performs at most one repair attempt and marks repeated invalid output unavailable`
- `Industry Skill validates design gaps, candidates, string arrays and quantitative values`
- `Industry workflow runs eight modules, skips Wave 2 on no-gap flow, and persists sixteen sections`
- `Industry workflow fails closed for Theme diagnosis and cancellation`
- `Industry workflow persists an evidence-backed Relation and Relation-subject Claim through one Gateway`
- `ResearchReport writes Markdown plus validated metadata`
- `ResearchReport accepts industry_research, renders title, and preserves relation provenance`

Added direct tests:

- `Industry Skill rejects producer-owned canonical bindings and malformed local report material` — canonical `existingKnowledgeRefs`, malformed gap search terms, and non-Relation report references.
- `CrossModuleSynthesis validates module Relation report references separately from proposal IDs` — valid module Relation provenance is accepted and an Entity ID in `relationProposalIds` is rejected.

The existing Workflow fixture directly proves eight module calls, one acquisition wave, one Gateway submission, one evidence-backed Relation, a Relation-subject Claim, canonical refs, reload-backed report creation, and sixteen sections. The retained cancellation fixture proves pre-work cancellation has zero Gateway mutation. Additional orchestration cases requested by the task (diagnosis variants, source-budget saturation, Wave-2 duplicate ordering, affected-module rerun isolation, post-module cancellation, staged-gate adversarial permutations, and true replay) remain CTO acceptance items for the next review pass if the CTO requires every matrix row to be represented by a separate Workflow test name.

## Evidence and gate behavior

Source qualification requires usable payload, retention/processing/derivative rights, and an as-of-compatible publication date. Wave 2 consumes only newly admitted candidates. Module calls are bounded to two per module and acquisition waves to two. `supplier_of` requires conservative tier-1/2 official or structured evidence with supplier/manufacturing/procurement context.

The gate uses deterministic proposal-ID ordering only after rejecting duplicate IDs. Entity local-key conflicts are whole-key failures; exact equivalent proposals are merged by a semantic key covering kind, subject/target, Entity identity, Relation type/attributes, Claim type/statement/structured value, temporal/period fields, geography, measurement definition, source methodology, and applicable confidence/probability fields. Claim links are normalized after final Claim admission, so no admitted Claim retains a dangling or self link.

## Report/provenance evidence

The successful Workflow fixture asserts one Gateway submission and canonical Entity/Relation/Claim/Source mappings, then reads the persisted report JSON and asserts exactly sixteen sections. Section-level refs are produced only from the local material used for that section and are filtered against the post-Gateway canonical reload.

## Validation results

Focused validation run in this execution:

- `node --import tsx --test tests/skills/industry-research/industry-research-skill.test.ts` — PASSED, 6 tests.
- `node --import tsx --test tests/workflows/industry-deep-research/industry-deep-research-workflow.test.ts` — PASSED, 3 tests.
- `node --import tsx --test tests/app/services/research-report.test.ts` — PASSED, 3 tests.
- `npm run typecheck` — PASSED.
- `git diff --check` — PASSED at report creation checkpoint.

- `npm run client:typecheck` — PASSED.
- `npm run test:node` — PASSED, 599 tests.
- `npm test` — PASSED, client 21 tests and Node 599 tests.
- `npm run client:build` — PASSED.
- `git diff --check` — PASSED.

Tests remain evidence-only and are not Git synchronization gates.

## Scope, limitations, governance gaps, and blockers

No governance or architecture files were changed. No commit, amend, rebase, push, M3B-3 implementation, Application/Pi action, Real Pi execution, Graph acceptance, schema migration, or new canonical object kind was introduced. Live/free acquisition composition, Application Service or HTTP/SSE Industry action, PiReasoningExecutor integration, Real Pi execution, and Knowledge Graph integration remain explicitly deferred to M3B-3.

The Workflow acceptance suite still needs a separate named test for every row in the supplied acceptance matrix before CTO sign-off; current production behavior and the focused tests above provide the implemented evidence available in this execution. No external setup blocker was encountered.
