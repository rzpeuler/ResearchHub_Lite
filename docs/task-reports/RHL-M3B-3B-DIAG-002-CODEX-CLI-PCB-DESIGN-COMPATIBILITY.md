# RHL-M3B-3B-DIAG-002 — Codex CLI Luna PCB Design Compatibility

Status: MODEL_SEMANTIC_COMPATIBILITY_NOT_PROVEN / CTO REVIEW REQUIRED

## Acceptance boundary

FIX-003 at `5c63d540c36b7ccbfa9afe58ffbba886e7fe0dae` is accepted only for optional Codex CLI Luna backend availability. It does not change the production reasoning model and does not satisfy M3B-3B. Production selection/failover remains unauthorized.

## Test execution

The current `IndustryResearchSkill.design()` produced the captured first-attempt request for target `PCB Manufacturing`, alias `Printed Circuit Board`, and empty Existing Knowledge. No request field was rewritten or normalized before dispatch. The deterministic fingerprint convention was `sha256(JSON.stringify(value)).slice(0,16)`; all three historical DIAG-001 fingerprints matched:

- instruction: `7a04f3501b1d420d`
- input: `36c1bc2fc516f169`
- output contract: `9854f93073c44d96`

The pre-call assertions passed for operation `industry_research_design`, target/alias, empty knowledge, and the current `INDUSTRY_RESEARCH_DESIGN_CONTRACT`. Exactly one real call was made through the explicit `createCodexCliLunaReasoningExecutor()` factory and the `PiReasoningExecutor` boundary. Evidence records backend `codex-cli`, model `gpt-5.6-luna`, reasoning effort `medium`, and safe invocation mode `exec-stdin-json-output-read-only`.

The call reached the backend, but the executor returned `reasoning_output_invalid`. No bounded JSON semantic object was available, so the current parser/validator could not establish a valid Design, no targetKind was recorded, and no repair or fallback was used.

Final compatibility classification: `MODEL_OUTPUT_INVALID`.

## Safety and mutation checks

Only sanitized evidence was persisted. Complete prompts, contracts, model output, traces, credentials, private paths, and unrestricted stderr were not persisted. No Knowledge Base, Source/Raw, Gateway, Writer, ResearchReport, graph, acquisition, or production model-selection mutation occurred.

The existing production default `zhipu-openapi/glm-5.3-flash` was not changed. M3B-3B remains NOT CTO PASS. A separate production model-selection/failover task is not authorized by this result; the complete frozen M3B-3B Real Pi gate remains open.

## Validation evidence

The required offline classification test passed all five cases. The real diagnostic evidence is in `tests/validation/evidence/RHL_M3B_CODEX_CLI_PCB_DESIGN_COMPATIBILITY.json`. The full deterministic regression commands were run after the diagnostic; their statuses are recorded in the final Luna result.
