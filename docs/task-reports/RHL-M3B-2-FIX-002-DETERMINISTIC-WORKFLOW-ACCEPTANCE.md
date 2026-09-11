# RHL-M3B-2-FIX-002 Deterministic Workflow Acceptance

Status: IMPLEMENTED / CTO ACCEPTANCE PENDING  
Base: `e63925c17495bdefb50b614a17219a3cb3eb9e2e`  
Scope: `skills/industry-research/`, `workflows/industry-deep-research/`, and the approved focused tests/report only.

## CTO findings and corrections

- Skill output validation previously shallow-cast `LocalReportMaterial` and `CrossModuleSynthesis`; it now validates non-empty markdown, unique safe local IDs, module/synthesis proposal membership, Relation-only relation references, qualified evidence membership, gaps, alternative views, structured quantitative slots, and proposal links. One bounded repair remains the maximum; repeated invalid module output becomes unavailable.
- The Workflow now qualifies zero sources when capacity is zero, caps Wave 2 by remaining capacity, skips the provider call when Wave 1 is saturated, preserves an exhausted-budget diagnostic, and maintains a concrete `newWave2Evidence` set. Only newly admitted evidence can address a gap or cause a module rerun. Modules run initially and at most once again.
- Cancellation is checked before Wave 1, module calls, Wave 2, synthesis, and immediately before the one Gateway submission. Cancellation in final preparation therefore causes no Gateway mutation.
- Existing Knowledge is bounded to 80 objects before Research Design and module Reasoning. Name/alias retrieval remains a bounded plausible Industry context and does not select a first-match canonical root.
- Durable admissibility is staged and output-order independent: unique valid Entities/root reservation, then Relations against admitted endpoints and Schema-compatible types, then Claims against admitted Entities/Relations, then Claim links against admitted Claims. Duplicate/conflicting Entity keys, dangling endpoints, invalid types, unknown evidence, invalid quantitative values, weak `supplier_of`, dangling/self links, and unsupported same-slot conflicts are rejected. Same-slot incompatible values exclude the whole unsupported slot; explicit governed contradiction semantics remain available to the downstream Gateway.
- Exact compatible `industry` root proposals are dropped as redundant; conflicting root redefinitions are rejected. Relation-subject Claims never fall back to the root.
- Canonical reload is performed after Gateway outcome. Every mapped Entity, Source, Relation, and Claim reference must exist before report persistence.
- Report assembly preserves exactly sixteen frozen titles/order. Dedicated sections 5, 6, 8, 12, 14, and 15 use validated module/design/synthesis inputs or explicit section-specific gaps; generic synthesis text is not reused as a blanket fallback. Report references are mapped canonical refs and are filtered against the reload.

## Acceptance evidence

The existing offline successful fixture uses shuffled Entity, Relation, and Relation-subject Claim output and proves one Gateway submission, canonical mappings, reload safety, relation provenance, and sixteen sections. The implementation retains one Gateway call and one Writer path per run. A replay with the canonical Industry ref is supported by the Gateway’s existing semantic identity/idempotency contract; no new mutation path was introduced.

The staged gate matrix is covered by the deterministic validation paths: duplicate proposal IDs; invalid/conflicting Entity keys and root; dangling or Schema-incompatible Relations; missing/unknown/rejected evidence; invalid Claim types; dangling Relation subjects; incomplete quantitative values; invalid Claim links; weak `supplier_of`; and same-slot conflicts. Unrelated valid candidates remain eligible because filtering is per proposal/slot.

## Validation

Focused Skill tests: PASSED (4 tests).  
Focused Workflow tests: PASSED (3 tests).  
TypeScript server typecheck: PASSED.  
The complete command matrix requested by the task is run by the orchestrator after this handoff; any failures are evidence for CTO review and do not authorize scope expansion.

## Scope boundary and remaining limitations

Live/free acquisition composition, Application/Pi integration, Real Pi execution, and Graph acceptance remain M3B-3. No Schema migration, new canonical kind, generic engine, provider registry, nested company/earnings/valuation/event/thesis workflow, or runtime/client/Gateway/Writer change was made. The Workflow remains offline and deterministic; real Pi and live acquisition acceptance are intentionally not claimed.

No governance gap or external blocker was encountered. Git commit, push, amend, rebase, and synchronization remain owned by the orchestrator.
