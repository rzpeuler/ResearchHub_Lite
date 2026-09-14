# RHL-M3B-3B-FIX-030 — Industry synthesis contract and repair convergence

## Result

Status: implementation completed. This was an offline FIX task; no live Codex, network, TEST-029 replacement E2E, commit, push, or production rerun was performed.

The production Industry E2E is ready for one fresh live rerun after orchestrator review of this change. That future rerun remains the acceptance evidence for real Codex execution and is not claimed here.

## TEST-029 defect evidence

TEST-029 established the accepted reproduction: Codex CLI preflight passed with codex-cli 0.154.0; real reasoning completed one `industry_research_design`, eight `industry_module_analysis`, and two `industry_cross_module_synthesis` operations; no Knowledge Production Gateway submission occurred; Knowledge revision delta remained zero; and no report was persisted.

The smallest failing boundary was the project-controlled IndustryResearchSkill synthesis contract/validator/one-repair path. Acquisition, Codex CLI resolution, Gateway, Writer, report persistence, and the frozen Workflow were left unchanged.

## Root cause and exact repairs

- `createIndustrySynthesisContract` enum-locked `reportMaterial.proposalIds` and `relationProposalIds` to pre-call module IDs. A synthesis response could legally create a new local Claim or Relation, but the structured contract rejected references to those same-response IDs before local validation.
- Synthesis report references now use the bounded local-ID schema. The validator remains authoritative for exact membership after parsing: validated module IDs plus IDs created in the same response. Relation references are checked against module Relation IDs plus same-response Relation IDs only.
- Synthesis proposal collisions with module IDs or another same-response synthesis ID now emit the deterministic `synthesis_proposal_collision` diagnostic. Canonical-looking IDs remain rejected by the existing local-ID and canonical-ID checks.
- `reportOnly` is type-checked when present. Existing evidence, proposal variant, structured-value, gap, numeric, provenance, and canonical-resolution restrictions remain unchanged.
- Repair diagnostics remain bounded and machine-oriented. The repair instruction identifies the sanitized validation code and explicitly omits the rejected candidate body; no complete model output, prompt, source body, private reasoning, or canonical Knowledge content is copied into the repair instruction.
- The synthesis repair maximum remains exactly one. A second invalid synthesis fails closed; no fallback synthesis or fabricated report was added.

## Files changed

- `skills/industry-research/contracts.ts`
- `skills/industry-research/skill.ts`
- `tests/skills/industry-research/industry-research-skill.test.ts`
- `tests/workflows/industry-deep-research/industry-deep-research-workflow.test.ts`
- `tests/plugins/reasoning/codex-cli.test.ts`
- This report

No out-of-scope or protected path was changed.

## Regression coverage

Deterministic coverage now proves:

- same-response Claim and Relation proposals can be referenced by synthesis report material;
- unknown proposal references, unknown Relation references, non-Relation Relation references, and proposal collisions fail validation;
- the synthesis contract does not enum-lock report references to pre-existing module IDs;
- Codex schema normalization accepts the corrected contract and retains bounded local-ID string semantics without dynamic enums;
- a fake executor repairs one invalid synthesis exactly once and returns the validated repaired result;
- repeated invalid synthesis terminates after exactly two synthesis calls with a validation failure;
- a fresh Schema 0.4 / Storage Format 1 offline workflow performs one design call, eight module calls, exactly one synthesis repair, one Gateway submission, one bounded revision, canonical reload, and sixteen-section report persistence.

The offline workflow uses only conservative evidence-backed fixture proposals and does not perform a live run.

## Validation evidence

- `npx tsx --test tests/skills/industry-research/industry-research-skill.test.ts` — PASSED (18 tests)
- `npx tsx --test tests/workflows/industry-deep-research/industry-deep-research-workflow.test.ts` — PASSED (40 tests)
- `npx tsx --test tests/plugins/reasoning/codex-cli.test.ts` — PASSED (24 tests)
- `npm run typecheck` — PASSED
- `npm test` — PASSED (865 tests: 21 client, 865 Node as reported by the suite)
- `git diff --check` — PASSED

Git synchronization was intentionally not performed; the orchestrator owns commit and push.
