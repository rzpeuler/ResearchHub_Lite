# RHL-M3B-3B-FIX-005 — Codex CLI Structured Output Failure Closure

Status: IMPLEMENTED / BACKEND_FAILURE_DIAGNOSTIC_INCONCLUSIVE / CTO REVIEW REQUIRED

## Acceptance boundary and baseline caveat

FIX-004 is accepted as useful deterministic structured-output transport implementation, but it did not prove PCB semantic compatibility. The unchanged PCB Manufacturing Design request reached the Codex backend with structured output enabled, then ended without semantic output and was recorded only as generic `reasoning_execution_failed`. Production reasoning-model selection remains unauthorized.

The FIX-004 report/evidence retains its historical attribution to implementation lineage `f7990053997cd2df670880d58daacbe8e0c30ef4`. The accepted task baseline was later captured as `cbaa6c74b451464593cd4250b544a8810af41b2e`; this FIX-005 implementation and evidence use the required actual base commit `aefb22a2b4beb3389f52c5291a8d081a1c95acac` and do not rewrite historical evidence.

## Diagnostic implementation

- Codex CLI execution now records process start independently of a successful `ReasoningResult`. A spawned non-zero process is `processStarted: true`, `exitState: nonzero_exit`, and `semanticResultAvailable: false`.
- Executable discovery, process start, normal exit, non-zero exit, timeout, cancellation, and semantic-result availability remain separate states.
- Bounded stdout JSONL event envelopes and bounded stderr patterns are classified in memory into structured-output configuration, authentication/account, model unavailable, rate/quota, safety/policy, timeout/cancel, transport/service, or unknown non-zero exit.
- Structured events expose only bounded event type and safe error code. Malformed JSONL does not crash classification and falls back to stderr or `unknown_nonzero_exit`.
- Codex CLI errors never attach raw stdout, raw stderr, complete JSONL events, provider messages, prompts, credentials, or reasoning traces. The legacy stderr field remains available only for the separate pre-existing non-CLI adapter.
- Existing `--output-schema`, read-only sandbox, `--ephemeral`, stdin context, `gpt-5.6-luna`, medium effort, bounded temp directory/output, timeout/cancellation, and cleanup behavior are unchanged. No source contract, validator, Skill, Industry request, production default, or safety control changed.

## Real FIX-005 validation

The validation captured the exact first-attempt request from `IndustryResearchSkill.design()` through a deterministic executor seam. Before the real call, all unchanged continuity fingerprints matched:

| Field | Fingerprint |
|---|---|
| instruction | `7a04f3501b1d420d` |
| input | `36c1bc2fc516f169` |
| outputContract | `9854f93073c44d96` |

The explicit Codex CLI Luna factory and current PiReasoningExecutor boundary were used with backend `codex-cli`, model `gpt-5.6-luna`, medium effort, read-only invocation, and structured output enabled. Codex CLI was `0.152.1`; normalized schema fingerprint was `95e315657e862a7e`, 2,111 bytes.

The one real attempt started the subprocess and ended non-zero without semantic output. Neither stdout JSONL nor bounded stderr supplied a recognized safe signal, so the truthful final classification is `BACKEND_FAILURE_DIAGNOSTIC_INCONCLUSIVE`. This is not a deterministic structured-output configuration diagnosis. Therefore no transport-schema correction was authorized and no second real model call was made. PCB semantic compatibility remains unproven.

Evidence: `tests/validation/evidence/RHL_M3B_CODEX_CLI_PCB_STRUCTURED_OUTPUT_FAILURE_CLOSURE.json`.

## Privacy, mutation, and validation

Evidence persists only hashes, sizes, bounded state/classification fields, schema metadata, request fingerprints, and safe mutation/privacy flags. Knowledge, Source/Raw, Gateway, Writer, ResearchReport, graph, and production model selection were not mutated. No commit, push, amend, rebase, or force-push was performed.

Focused diagnostics, classifier fixtures, spawned-process accounting, malformed-JSONL fallback, raw-channel exclusion, and type checking passed. The full regression matrix was run after the final code state: Industry Skill `15/15`, M3B gate `19/19`, Node suite `700/700`, client suite `21/21`, `npm run typecheck`, `npm run client:typecheck`, `npm run client:build`, and `git diff --check` all passed. The explicit real validation was run separately and made exactly one model call.
