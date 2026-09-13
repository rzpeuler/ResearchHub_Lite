# RHL-M3B-3B-FIX-015 — Proven Codex Schema Compatibility

Status: **IMPLEMENTED / CODEX_INDUSTRY_SCHEMA_COMPATIBILITY_PASS / CTO ACCEPTANCE PENDING**

## Scope and acceptance

DIAG-014 at `9e6601cd11c40093ffff71c473cf1f29b6e0dfe5` is recorded as CTO-accepted with aggregate classification `MODULE_TRANSPORT_COMPATIBILITY_SET_PROVEN` and next action `IMPLEMENT_PROVEN_CODEX_SCHEMA_COMPATIBILITY_SET`. Its bounded harness caveat is preserved: real call ordinal 5 was an invalid TEST-harness argument-order attempt and was discarded; retained Probe E at ordinal 6 executed once with no production mutation. FIX-015 did not reproduce that extra call.

The Codex transport normalizer now implements exactly the four approved transformations, without changing Industry contracts, parser, validator, Skill, model selection, or runtime execution policy:

1. Primitive `const` type inference for string, boolean, finite integer, finite non-integer number, and null; object/array const values and enum-only nodes remain untyped.
2. Guarded conversion of `oneOf` to `anyOf` only for strict object variants with `additionalProperties:false`, required primitive `properties.kind.const`, and unique discriminator values; order and variant contents are preserved.
3. Removal of redundant `required`-only `anyOf` branches after all-properties-required strengthening, only when every referenced property is already finally required.
4. Exact normalization of an empty schema only at `.properties.structuredValue.properties.value` to finite number/string/boolean `anyOf`.

FIX-006 all-properties-required behavior remains in force, including source-required reference validation. The source contract is deep-copied and remains immutable. The Design transport regression remains passing and does not acquire Module-only transformations.

## Fingerprints and structural evidence

For `createIndustryModuleResultContract('industry_definition', [])`:

- Source: `9d2c118931979c45`, 6341 bytes.
- Normalized transport: `736e8d9d5d72c5cb`, 4649 bytes.
- Counters: primitive const typed 4; guarded kind `oneOf` converted 1; redundant required-only `anyOf` removed 1; exact scalar leaves normalized 1.
- Unresolved normalized incompatibilities: all zero.

The source and normalized fingerprints are recorded in the privacy-safe evidence artifact at [RHL_M3B_CODEX_PRODUCTION_INDUSTRY_SCHEMA_COMPATIBILITY.json](../../tests/validation/evidence/RHL_M3B_CODEX_PRODUCTION_INDUSTRY_SCHEMA_COMPATIBILITY.json). Synthesis transport was also normalized and had zero unresolved prohibited incompatibilities. Its source is 6467 bytes and normalized transport is 4649 bytes.

## Focused real validation

The only real-backend command was `node --import tsx tests/validation/codex-production-industry-schema-compatibility.ts`. It made exactly two calls through `createIndustryProductionReasoningExecutor`: one neutral full Module call, followed only after Module success by one neutral full CrossModuleSynthesis call.

- Runtime: `codex-cli`, `gpt-5.6-luna`, medium reasoning, `exec-stdin-json-output-read-only`, structured output enabled.
- Module: normal exit, parser PASS, validator PASS, returned status `unavailable`.
- Synthesis: normal exit, parser PASS, validator PASS.
- Final classification: `MODULE_AND_SYNTHESIS_TRANSPORT_VALIDATED`.
- `livePcbModuleDiagnosticAuthorized: true`.
- Acquisition calls 0; Knowledge mutation false; Gateway submits 0; Writer commits 0; source contracts mutated false.

No raw prompts, complete inputs/schemas/outputs, stdout/stderr/JSONL, credentials, private paths, or reasoning traces were persisted.

## Validation

Current focused and deterministic validations passed, including Codex executor tests, FIX-015 offline classification/evidence tests, Industry Skill tests, both prior Module compatibility test suites, the Industry Pi gate tests, type checks, Node regression, client regression, client build, and `git diff --check`. The full repository regression completed with 796 tests passing after the corrected prior fingerprint expectation; the initial aggregate run contained one stale DIAG-014 fingerprint expectation and was rerun after correction.

No commit, push, amend, rebase, or force-push was performed. The next authorized task is the live PCB module-stage diagnostic using current production acquisition and this fixed transport.
