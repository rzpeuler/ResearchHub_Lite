# RHL-M3B-3B-DIAG-004 — Native Codex Structured Output Isolation

## Result

TEST evidence is complete. DIAG-003 at `e47030644852be3091a2dc7bba913b34907d2c81` is accepted despite its reported FAILED aggregate status: its approved-scope tests passed, its `MINIMAL_STRICT_CONTROL` used a 107-byte normalized strict schema, started Codex, exited non-zero as `unknown_nonzero_exit`, made exactly one real call, and correctly stopped later probes. The aggregate `npm run test:node` and `npm test` failures were unrelated timing/environment-sensitive evidence and were not changed or repaired. No schema transformation or production change was authorized.

DIAG-004 bypassed all ResearchHub adapters and invoked the discovered native Codex CLI directly. CLI metadata checks passed for Codex `0.152.1` and all required flags. Probe A succeeded under the exact model, effort, ephemeral/read-only/safe flags, stdin prompt, bounded temporary directory, JSON events, and `-o`. Probe B used the otherwise identical invocation plus the minimal strict schema and also succeeded with valid schema-conformant JSON. The matrix stopped as required after two real calls; Probes C and D were not run.

Final classification: `NATIVE_STRUCTURED_OUTPUT_WORKS`  
Next action: `REVIEW_RESEARCHHUB_ADAPTER_INVOCATION_DELTA`  
M3B-3B remains NOT PASS. This diagnostic authorizes no production schema, adapter, model-selection, routing, or failover change.

## Sanitized evidence

The execution record is [RHL_M3B_CODEX_CLI_NATIVE_STRUCTURED_OUTPUT_ISOLATION.json](../../tests/validation/evidence/RHL_M3B_CODEX_CLI_NATIVE_STRUCTURED_OUTPUT_ISOLATION.json). It records only classifications, hashes, byte sizes, bounded exit states, flag booleans, and safe summaries. The minimal schema fingerprint and size are recorded without its complete contents.

Probe A: started, exit code 0, 8,818 ms, valid JSON, output file non-empty; schema disabled.  
Probe B: started, exit code 0, 11,050 ms, valid JSON satisfying the strict schema; schema, JSON events, and output file enabled.  
Actual model calls: 2 of a maximum of 4.

The exact normalized command line and private executable path were not persisted. The neutral prompt was supplied via stdin. No PCB call, Industry request, Knowledge/Source/Raw/Gateway/Writer/ResearchReport/graph mutation, production model selection, production adapter, or schema normalizer mutation occurred.

## Privacy and mutation boundary

Raw prompt, stdout, stderr, JSONL, final model output, complete schema, credentials, authentication data, private paths, and reasoning traces were not persisted. Each real probe used a new temporary directory and deleted it after collecting hashes and safe metadata. No Codex configuration or auth state was changed, and no production file was modified.

## Validation

The DIAG-004 scoped unit tests passed (8/8). The focused adapter, Industry Skill, and Pi gate tests passed (7/7, 15/15, and 19/19); root and client typechecks and client build passed. `npm run test:node` and `npm test` each reported one unrelated timing/environment-sensitive failure at `tests/app/runtime/valuation-route.test.ts` (`running` versus expected `blocked`), with the remaining 714/715 Node tests passing and client tests 21/21 passing. That failure remains evidence-only under the TEST contract and was not fixed in this task. `git diff --check` passed. Luna did not commit, push, amend, rebase, or force-push.
