# RHL-M3B-3B-DIAG-005 — Codex Schema Type-Inference Isolation

Status: COMPLETED under the TEST contract. No production file was modified and Luna did not perform Git synchronization.

## Baseline and DIAG-004 acceptance

The run used base commit `128215bb47b680fed02cf38558803a8724b23eae`. DIAG-004 is recorded as CTO-accepted TEST evidence only: native Probe A and Probe B succeeded with `gpt-5.6-luna` at medium effort; native Probe B used `--output-schema + --json + -o` and returned valid minimal schema-conformant JSON. Its actual model-call count was two. The DIAG-004 aggregate `npm run test:node` and `npm test` each retained one unrelated timing/environment-sensitive failure in `tests/app/runtime/valuation-route.test.ts`; those failures were not changed here.

The tested schema delta was the DIAG-003 adapter control fingerprint `6403f2b1cc6b62ac` at 107 bytes, with `const: "ok"` and no explicit primitive type, versus the DIAG-004 native-good 123-byte schema with `type: "string"` and the same const. This is recorded as the motivating delta, not as a causal conclusion.

## Offline isolation

The TEST-only `inferPrimitiveSchemaTypes` helper deep-copies schema nodes and adds a type only for a primitive `const` or a non-empty homogeneous primitive enum. It distinguishes integer from non-integer number, refuses mixed/empty/object/array enum or const values, recurses through the schema positions used by the contracts, and leaves the imported source untouched.

The unchanged Design source fingerprint was `9854f93073c44d96` before and after copying; source JSON was byte-identical. Actual inferred paths were:

- `$.properties.targetKind` → `string`
- `$.properties.knownGaps.items.properties.module` → `string`
- `$.properties.verificationCandidates.items.properties.kind` → `string`

The inferred copy normalized through the unchanged production normalizer to fingerprint `66ca1308a52ea98d`, 2159 bytes. Probe A's exact typed minimal contract normalized to `1bf50a2dc6bf4c0b`, 123 bytes and was structurally identical to the DIAG-004 native-good minimal schema.

## Real probes

The real calls used the existing `createCodexCliLunaReasoningExecutor()` → `PiReasoningExecutor` path, Codex CLI `0.152.1`, backend `codex-cli`, model `gpt-5.6-luna`, medium effort, stdin semantic context, ephemeral read-only execution, structured output, bounded temporary files, timeout/cancellation and cleanup.

Probe A `ADAPTER_EXPLICIT_TYPED_MINIMAL_CONTROL` succeeded once: process started, normal exit, Pi JSON parsing succeeded, output was exactly the harmless `{status: "ok"}` shape, and runtime metadata confirmed Codex CLI / Luna / medium / structured output enabled.

Probe B `ADAPTER_TYPE_INFERRED_DESIGN_NEUTRAL` executed once conditionally and exited non-zero after process start. It produced no semantic result and was classified with safe failure class `unknown_nonzero_exit`; no raw provider output was persisted. Because this was a backend/runtime failure rather than a structured-output configuration result, the final classification is:

`BACKEND_FAILURE_DIAGNOSTIC_INCONCLUSIVE`

Next action: `REVIEW_BACKEND_RUNTIME_FAILURE`.

Actual real-call count was two. The run therefore does not authorize a production schema-normalizer change. It neither proves nor disproves primitive enum/const type inference as the cause of the earlier adapter failure.

## Scope, mutation and privacy checks

No PCB call, Industry Skill real invocation, Knowledge, Source/Raw, Gateway, Writer, ResearchReport, graph, production model selection, Codex adapter, Pi executor, or production schema-normalizer mutation occurred. No production model routing or failover policy changed.

Evidence persists only safe hashes, sizes, statuses, fingerprints, paths of inferred schema nodes, and bounded structural metadata. Raw prompts, stdout, stderr, JSONL, final model output, complete schemas, complete Design output, credentials, authentication data, private paths and reasoning traces were not persisted.

## Validation

The DIAG-005 scoped offline test passed 9/9. The generated evidence is at [RHL_M3B_CODEX_CLI_SCHEMA_TYPE_INFERENCE_ISOLATION.json](../../tests/validation/evidence/RHL_M3B_CODEX_CLI_SCHEMA_TYPE_INFERENCE_ISOLATION.json).

Validation results: the DIAG-005 scoped test passed 9/9; Codex adapter tests passed 7/7; Industry Skill tests passed 15/15; the Industry Pi gate passed 19/19; `npm run typecheck`, `npm run client:typecheck`, `npm run client:build`, and `git diff --check` passed. `npm run test:node` ran 724 tests with 723 passed and one unrelated `VAL-HTTP-001` timing/environment-sensitive failure in `tests/app/runtime/valuation-route.test.ts`. `npm test` ran the client suite 21/21 and the Node suite 721/724, retaining that valuation-route failure plus two unrelated Windows timing/cleanup-sensitive failures in `tests/plugins/reasoning/reasoning.test.ts` (EBUSY temp-directory cleanup in timeout/failure tests). These are evidence-only under the TEST contract and were not fixed here. No failure was used to authorize a production change.
