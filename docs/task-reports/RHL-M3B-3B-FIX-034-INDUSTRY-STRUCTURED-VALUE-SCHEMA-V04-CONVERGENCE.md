# RHL-M3B-3B-FIX-034 — Industry structured values aligned with Knowledge Schema 0.4

Status: implementation complete; no live model/provider call was performed.

## TEST-033 evidence and implementation conclusion

TEST-033 is accepted as a valid diagnostic execution, but its external-only interpretation is overridden for implementation planning. Repository inspection independently proves the producer-to-canonical drift that can explain `V04_STRUCTURED_VALUE`:

- Industry exposed `geography`, `measurementDefinition`, and `sourceMethodology`, while Schema 0.4 permits only `metric`, `value`, `unit`, `comparator`, `period`, `fiscalPeriod`, and `semanticKey`.
- Industry accepted any non-empty comparator string, while Schema 0.4 permits only `eq`, `gt`, `gte`, `lt`, `lte`, and `approx`.
- Industry local validation did not reject unknown structuredValue keys.

## Change and authority

`KNOWLEDGE_SCHEMA_V04.claim.structuredValueFields` and `.comparators` are now the single source for the Industry contract. `skills/industry-research/contracts.ts` exports one shared `isValidIndustryStructuredValue` helper. The model-facing schema, Skill local validation, and Workflow deterministic gate use that authority. The Industry-specific stricter rules remain: metric/unit are non-empty bounded strings, value is finite/non-empty scalar, comparator is canonical, at least one period/fiscalPeriod is present, and semanticKey is optional bounded text.

No file under `knowledge/schema/`, `knowledge/validation/`, or `knowledge/production/` was changed. No fields were added to Schema 0.4, and no old fields were remapped.

## Files changed

- `skills/industry-research/contracts.ts`: V04-derived field/comparator constants, shared validator, corrected model schema.
- `skills/industry-research/skill.ts`: shared local validation for module and synthesis proposals.
- `workflows/industry-deep-research/workflow.ts`: shared deterministic gate validation and canonical structured-value conflict slot.
- `tests/skills/industry-research/industry-research-skill.test.ts`: unknown-field, comparator, semanticKey, contract, repair, and repeated-invalid regressions.
- `tests/workflows/industry-deep-research/industry-deep-research-workflow.test.ts`: fresh-KB repair, one Gateway, one revision, sixteen sections, canonical validation, and persisted structured-value regression.
- `tests/plugins/reasoning/codex-cli.test.ts`: normalizer preservation regression.
- `tests/validation/codex-module-remaining-schema-deltas.test.ts` and `tests/validation/codex-production-industry-schema-compatibility.test.ts`: updated deterministic contract fingerprint/size snapshots required by the intentional contract correction.
- `docs/task-reports/RHL-M3B-3B-FIX-034-INDUSTRY-STRUCTURED-VALUE-SCHEMA-V04-CONVERGENCE.md`: this report.

## Preserved invariants and offline evidence

Evidence allowlists, proposal identity, canonical-ID exclusion, relation semantics, `supplier_of` requirements, same-slot conflict handling, Source/Raw provenance, Gateway/Writer behavior, and the sixteen-section report contract remain unchanged. The Skill repair path remains bounded to one repair call: compatible repair is accepted after exactly two calls; a second incompatible result becomes unavailable and does not synthesize a fallback.

The offline Workflow regression uses a fresh Schema 0.4 / Storage Format 1 Knowledge Base and deterministic evidence. It proves an initial `geography` candidate is rejected, one compatible repair is accepted, exactly one Gateway submission and one revision occur, the canonical reload validates with no `V04_STRUCTURED_VALUE`, the report has sixteen sections, and the persisted Claim retains `metric`, `value`, `unit`, `comparator: eq`, `period`, and `semanticKey` exactly.

## Validation

- `npx tsx --test tests/skills/industry-research/industry-research-skill.test.ts` — PASSED (21/21).
- `npx tsx --test tests/workflows/industry-deep-research/industry-deep-research-workflow.test.ts` — PASSED (41/41).
- `npx tsx --test tests/plugins/reasoning/codex-cli.test.ts` — PASSED (25/25).
- `npm run typecheck` — PASSED.
- `npm test` — FAILED only by unrelated `VAL-HTTP-001` runtime-state expectation (`running` observed where the test expects `blocked`); 883/884 passed. The contract snapshot failures caused by this change were updated and their 10 focused tests pass.
- `git diff --check` — PASSED.

No live Codex/model call, public provider call, TEST-032 rerun, or TEST-033 rerun was performed. Luna did not commit or push.

## Next step

With the focused and offline Workflow regressions passing, the single next step is one fresh TEST-033 live rerun using the real production Codex Industry reasoning path and deterministic acquisition fixture. Do not expand sources or begin product-quality review until that runtime diagnostic reaches Gateway/report successfully.
