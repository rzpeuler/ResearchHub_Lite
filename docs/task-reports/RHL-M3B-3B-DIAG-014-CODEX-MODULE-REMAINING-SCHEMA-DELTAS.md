# RHL-M3B-3B-DIAG-014 — Codex Module Remaining Schema Deltas

## Result

DIAG-013 is accepted as TEST evidence only at `a2d8eb6f5d4a6a93df0e413e9b11fa8cc0bc87d2`. Its accepted controlled results are preserved: untyped primitive `const` failed while typed `const` succeeded; nested strict disjoint `oneOf` failed while equivalent `anyOf` succeeded. The three DIAG-013 full Module combinations remained pre-semantic `unknown_nonzero_exit`, so no production normalization was authorized.

This diagnostic isolates the remaining required-only `period`/`fiscalPeriod` conditional and the exact empty `structuredValue.value` leaf using A/B and C/D controlled differentials. The authoritative source remains the read-only `createIndustryModuleResultContract('industry_definition', [])` contract, with source fingerprint `9d2c118931979c45` and 6,341 bytes, and production-normalized fingerprint `afdce2f01f414709` and 4,585 bytes.

## Probe results

The approved runtime was verified as `codex-cli`, `gpt-5.6-luna`, medium reasoning, read-only structured output (`exec-stdin-json-output-read-only`), CLI `codex-cli 0.152.1`. A/B and C/D each executed once. A failed pre-semantic with `unknown_nonzero_exit`, B succeeded semantically; therefore `redundantRequiredAnyOfDifferential=proven`. C failed pre-semantic with `unknown_nonzero_exit`, D succeeded semantically; therefore `emptySchemaLeafDifferential=proven`. The exact full transformation set was consequently primitive const typing, guarded disjoint-kind `oneOf` to `anyOf`, redundant required-only `anyOf` removal, and exact structured-value scalar-leaf normalization.

Probe E executed with a fresh authoritative source and exactly that transformation set. The valid corrected Probe E call returned semantic output with status `unavailable`; parser and authoritative validator both passed. The aggregate classification is `MODULE_TRANSPORT_COMPATIBILITY_SET_PROVEN`, with next action `IMPLEMENT_PROVEN_CODEX_SCHEMA_COMPATIBILITY_SET`.

The final evidence records six total real calls. Call ordinal 5 was discarded as a TEST-harness argument-order correction before the valid final Probe E at ordinal 6; no raw data or output from that discarded call was persisted. The four required transformations were primitive const typing, guarded disjoint-kind `oneOf` to `anyOf`, removal of the redundant required-only `period`/`fiscalPeriod` conditional after current transport requiredness, and exact structured-value scalar-leaf normalization. Both DIAG-014 candidate features were independently proven required; no optional feature remained unrequired.

Probe F was not needed because Probe E passed parser and validator. No production code was modified, and exactly one subsequent implementation task is recommended to add only the proven generic Codex transport compatibility transformations; Industry contracts remain unchanged.

## Safety and validation

This TEST task does not modify production code, Industry contracts, parser, validator, Skill instructions, model selection, or executor behavior. It performs zero acquisition calls, zero Knowledge mutations, zero Gateway submissions, zero Writer commits, and does not mutate the source contract. It persists no raw prompt, full input, full schema, model output, stdout/stderr, JSONL, credentials, private paths, or reasoning trace.

The explicit diagnostic is capped at six real Codex calls and stops immediately on runtime configuration mismatch or genuine environmental failure. The final valid probes were each executed once; the evidence separately discloses one discarded TEST-harness correction. A valid failed real probe remains completed TEST evidence. Full regression results are recorded below.

## Validation

Passed: DIAG-014 offline tests (7/7), Codex CLI regression (11/11), Industry Skill regression (15/15), Industry Pi E2E gate (19/19), `npm run typecheck`, `npm run client:typecheck`, `npm run test:node` (789/789), `npm test` (client 21/21 and Node 789/789), `npm run client:build`, `git diff --check`, and evidence JSON parsing. The final worktree contains only the two TEST files, the evidence JSON, and this task report; no commit or push was performed.
