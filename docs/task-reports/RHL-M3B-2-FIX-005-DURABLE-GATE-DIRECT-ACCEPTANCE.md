# RHL-M3B-2 FIX-005 — Direct Durable Gate Acceptance

Status: IMPLEMENTED / CTO ACCEPTANCE PENDING

Task: `RHL-M3B-2-FIX-005-DURABLE-GATE-DIRECT-ACCEPTANCE`  
Baseline: `ab9006abae01ab54e4082574742bd512edcdeea2`  
Observed HEAD: `ab9006abae01ab54e4082574742bd512edcdeea2`

## Scope and changed files

Only the approved paths changed:

- `tests/workflows/industry-deep-research/industry-deep-research-workflow.test.ts`
- `docs/task-reports/RHL-M3B-2-FIX-005-DURABLE-GATE-DIRECT-ACCEPTANCE.md`

No production code, Skill, Workflow, Knowledge, Gateway, Schema, Writer, Resolution, provenance, Application, Pi, or Graph path was changed. Commit, push, amend, rebase, and force-push were not performed; those operations remain owned by the orchestrator.

## FIX-004 remaining-gap statement

FIX-004 recorded that the adversarial test was a representative Workflow-exercised durable-gate matrix, but did not provide separately named direct `runIndustryDeepResearch` coverage for each requested permutation. The lower-level Gateway/Schema tests therefore could not substitute for the missing direct Workflow evidence.

## Row-by-row direct Workflow evidence

Every test below invokes `runIndustryDeepResearch` through `directGateRun` and reloads canonical Schema 0.4 assets after persistence assertions.

| Durable-gate rule | Exact named Workflow test | Result |
|---|---|---|
| Duplicate local proposal IDs reject every duplicate while unrelated candidate survives | `Workflow direct durable gate rejects duplicate local proposal IDs in full while preserving unrelated candidates` | PASS; Skill fail-closed diagnostic is asserted; canonical reload excludes duplicate semantics |
| Conflicting Entity local subject key rejects the key as a whole | `Workflow direct durable gate rejects conflicting Entity local subject keys as a whole` | PASS; both conflicting names absent after reload; unrelated Claim survives |
| Reserved Industry root cannot be redefined | `Workflow direct durable gate rejects reserved Industry root redefinition and preserves Workflow root` | PASS; authoritative `entity:industry-fixture-industry` remains the sole root |
| Dangling Relation source endpoint | `Workflow direct durable gate rejects dangling Relation source endpoint` | PASS; Relation diagnostic and canonical absence asserted |
| Dangling Relation target endpoint | `Workflow direct durable gate rejects dangling Relation target endpoint` | PASS; Relation diagnostic and canonical absence asserted |
| Unsupported Relation type | `Workflow direct durable gate rejects unsupported Relation type while unrelated research completes` | PASS; invalid type is absent after reload and unrelated Claim survives |
| Schema-incompatible Relation endpoint types | `Workflow direct durable gate rejects Schema-incompatible Relation endpoint types independent of proposal ordering` | PASS; `component_of` with Company/Product endpoints is rejected |
| Durable Relation without evidence | `Workflow direct durable gate excludes evidence-less durable Relation and preserves evidence-backed candidates` | PASS; rejected Relation absent; evidence-backed Claim survives |
| Durable Claim without evidence | `Workflow direct durable gate excludes evidence-less durable Claim and preserves evidence-backed candidates` | PASS; rejected Claim absent; evidence-backed Claim survives |
| Unknown evidence reference | `Workflow direct durable gate rejects unknown evidence binding for Claim without creating a canonical object` | PASS; Skill fail-closed unknown-evidence path asserted; no Claim after reload |
| Invalid Claim type | `Workflow direct durable gate fails closed for invalid Claim type without coercion` | PASS; invalid Claim path asserted; no coerced canonical Claim |
| Malformed structured quantitative value missing period/fiscalPeriod | `Workflow direct durable gate rejects malformed structured quantitative Claim without period or fiscalPeriod` | PASS; durable rejection and canonical absence asserted |
| Relation-subject Claim does not fall back to Industry when Relation is rejected | `Workflow direct durable gate excludes Relation-subject Claim when its Relation is rejected` | PASS; both rejected Relation and dependent Claim are absent |
| Weak/community-only `supplier_of` evidence | `Workflow direct durable gate rejects weak community-only supplier_of evidence while continuing report processing` | PASS; tier-4 news/community-style evidence fails conservative supplier gate; no canonical `supplier_of` Relation |
| Final Claim graph self-link | `Workflow direct final Claim graph strips a self Claim link` | PASS; Skill fail-closed unresolved-link path asserted and no malformed Claim persists |
| Final Claim graph link to Claim filtered by durable gate | `Workflow direct final Claim graph strips a dangling link to a Claim filtered by the durable gate` | PASS; unknown-evidence target fails closed and no survivor with dangling link persists |
| Existing explicit contradiction and unsupported same-slot conflict retained | `Workflow explicit contradiction retains both governed Claims while unsupported same-slot conflict is excluded` | RETAINED unchanged from FIX-004; PASS |

The tests intentionally preserve the actual boundary behavior: duplicate IDs, unknown evidence, invalid Claim types, and invalid local links are rejected by the Industry Skill before the durable gate can run. Their bounded repair/fail-closed module path is asserted directly rather than being mistaken for successful durable filtering.

## Validation

- Focused Workflow: `39/39` passed (`23` FIX-004 baseline plus `16` new named cases).
- `npm run typecheck`: passed.
- `npm run client:typecheck`: passed.
- `npm run test:node`: `639/639` passed.
- `npm test`: client `21/21` passed; Node `639/639` passed.
- `npm run client:build`: passed.
- `git diff --check`: passed (only the expected LF-to-CRLF working-copy warning).

An earlier parallel validation run had one unrelated valuation-route timing failure while another full test process was concurrently active; the required `npm run test:node` and `npm test` commands were rerun independently and passed.

## Canonical reload and local-failure evidence

Rejected Entity, Relation, and Claim semantics are checked against reloaded canonical assets, not only returned mapping dictionaries. Local failures retain unrelated admissible Entity/Claim paths where applicable and successful runs complete report processing. Root redefinition reload proves the Workflow-controlled Industry root remains authoritative. No production defect was exposed by the final focused or full validation runs.

## Remaining rows, governance gaps, and blockers

No requested M3B-2 direct durable-gate row remains untested in this scope. No governance gap or external blocker was encountered. Engineering completion remains distinct from CTO acceptance, hence the status above.

## M3B-3 boundary

M3B-3 remains out of scope. Live/free acquisition composition, Application Service action, Pi integration, Real Pi E2E, and Graph acceptance were not implemented in this task.
