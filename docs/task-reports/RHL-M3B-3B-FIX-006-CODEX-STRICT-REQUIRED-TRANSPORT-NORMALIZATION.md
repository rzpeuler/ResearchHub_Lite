# RHL-M3B-3B-FIX-006 — Codex Strict Required Transport Normalization

Status: IMPLEMENTED / CODEX_STRICT_REQUIRED_PCB_DESIGN_PASS / CTO ACCEPTANCE PENDING

## Result

The Codex CLI adapter now converts the temporary transport schema so every object node with declared `properties` has `required` exactly equal to its deterministic property-key order. The rule recurses through properties, array items, schema-valued `additionalProperties`, `oneOf`, and `anyOf`. It preserves the authoritative `ReasoningRequest.outputContract`, semantic request, Pi prompt, contracts, parsers, validators, enum/const values, primitive typing, and `additionalProperties` semantics. Inconsistent source `required` references fail closed with `reasoning_configuration_invalid`; propertyless nodes receive no invented array, and `properties: {}` receives `required: []`.

The existing provider-unsupported keyword removal and 64,000-byte limit remain in place, with the size check applied after requiredness normalization. No model-selection policy or production default changed.

## DIAG-006 acceptance

DIAG-006 is accepted as conclusive TEST evidence: the typed optional-property control failed after process start with `unknown_nonzero_exit`; the structurally identical all-properties-required control succeeded; and the current Design contract succeeded with recursive requiredness alone, authoritative parser PASS, validator PASS, uncertain `targetKind`, and all eight module questions. Probe C required no primitive enum/const type inference. Probe D was not needed; DIAG-006 made three actual real calls. The aggregate `tests/app/runtime/valuation-route.test.ts` timing/environment-sensitive failure remains evidence-only and was not changed.

The source Design fingerprint remained `9854f93073c44d96`. The only strengthened current Design path is `$.properties.knownGaps.items`; its transport `required` is exactly `gapId`, `module`, `question`, `reason`, `actionable`, `searchTerms`. The resulting transport fingerprint is `88711c17a6837ae7` at 2125 bytes.

## Tests and validation

Deterministic tests cover optional/all-required differential behavior, source immutability, recursive schema positions, empty/propertyless nodes, inconsistent references, supported schema semantics, current Design source fingerprint, and dynamic module/synthesis contracts. The validation decision flow covers neutral-failure stopping, request-continuity failure, non-industry non-authorization, industry authorization, and the two-call bound.

The explicit FIX-006 validation script ran exactly two real calls through `createCodexCliLunaReasoningExecutor()` and the Pi boundary. Probe 1 (`PRODUCTION_NORMALIZER_NEUTRAL_DESIGN`) passed process execution, parser, validator, and all eight questions. Probe 2 (`UNCHANGED_PCB_FIRST_ATTEMPT_DESIGN`) used the captured unchanged Skill request; fingerprints were instruction `7a04f3501b1d420d`, input `36c1bc2fc516f169`, and output contract `9854f93073c44d96`. It passed process execution, parser, validator, exact `targetKind: industry`, and all eight questions.

Final classification: `PCB_COMPATIBLE_VALID_INDUSTRY_DESIGN`. `productionSelectionAuthorized: true` authorizes only the next separate narrow production reasoning-model selection task; FIX-006 itself did not change production selection.

Full machine-readable evidence is in [RHL_M3B_CODEX_CLI_STRICT_REQUIRED_PRODUCTION_VALIDATION.json](../../tests/validation/evidence/RHL_M3B_CODEX_CLI_STRICT_REQUIRED_PRODUCTION_VALIDATION.json). No raw prompts, complete contracts, normalized schema, stdout/stderr/JSONL, model output, credentials, private paths, or reasoning traces were persisted.

## Mutation and scope checks

No Knowledge, Source/Raw, Gateway, Writer, ResearchReport, graph, or production model-selection mutation occurred. Only the Codex adapter transport boundary, its README, focused tests, validation script/evidence, and this report were changed. Luna performed no commit, push, amend, rebase, or force-push.

## Next action

Recommend a separate explicit production reasoning-model selection policy task for Industry, followed by the complete frozen M3B-3B Real Pi gate.
