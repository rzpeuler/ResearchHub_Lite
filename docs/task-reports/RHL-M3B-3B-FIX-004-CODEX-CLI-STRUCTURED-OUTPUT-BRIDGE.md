# RHL-M3B-3B-FIX-004 — Codex CLI Structured-Output Bridge

Status: IMPLEMENTED / PCB_SEMANTIC_COMPATIBILITY_NOT_PROVEN / CTO REVIEW REQUIRED

## Scope and baseline

Implementation was based on `f7990053997cd2df670880d58daacbe8e0c30ef4`. DIAG-002 remains accepted TEST evidence classified `MODEL_OUTPUT_INVALID`: the unchanged PCB Manufacturing request reached the Codex CLI backend once, all three continuity fingerprints matched, and no parser-visible object existed. No Industry validator, Skill, Workflow, or production model-selection change was inferred from that result.

## Local CLI capability

The installed CLI was inspected with `codex exec --help` before implementation. It exposes `--output-schema <FILE>`. The adapter now uses that actual flag and does not infer or guess an alternate syntax. The live validation observed `codex-cli 0.152.1`.

## Implementation

- `PiReasoningExecutor` passes the unchanged `ReasoningRequest.outputContract` as typed completion metadata while preserving the existing semantic system/user Context and final JSON parser.
- The Codex adapter converts the contract at the completion boundary into a small JSON Schema, validates that it is a rooted JSON value, JSON-serializable, and at most 64,000 bytes, then writes it only inside the bounded invocation directory.
- ResearchHub prompt metadata (`name`, `bounds`, `allowlists`, `proposalRules`) and known provider-unsupported generation constraints are removed from transport only. The original contract remains in the Pi prompt and existing validators remain authoritative. Current Design normalization removed: `bounds`, `maxItems`, `maxLength`, `minItems`, `minLength`, `name`, and `uniqueItems`.
- Structural semantics such as object/array/string/number/boolean/null types, properties, required, additionalProperties, items, enum, const, oneOf, and anyOf are retained where present. Unknown keywords, unsafe values, invalid roots, and oversized schemas fail closed before process launch.
- The safe argument array contains `--output-schema` exactly once and only the temporary schema path. The semantic Context remains on stdin. Existing ephemeral, read-only, no-approval-escalation, JSON-event, final-output-file, timeout, cancellation, bounded-output, and cleanup controls remain active.
- Runtime metadata reports `structuredOutputEnabled: true`; the adapter also records only the normalized schema fingerprint and byte size after conversion. The normalizer rejects non-finite numbers and non-plain objects before spawn. No production default or failover policy changed. `PRIMARY_PRODUCTION_REASONING_MODEL` remains `zhipu-openapi/glm-5.3-flash`.

## Deterministic validation

Focused tests passed for Pi contract transport, unchanged Context generation, Design normalization, dynamic enum/const/oneOf handling, fail-closed unsafe inputs including non-finite numbers and non-plain objects, size limits, safe invocation arguments, request-on-stdin behavior, Codex Luna model/medium configuration, opt-in model selection, and production-model preservation. TypeScript type checking passed.

## Actual unchanged PCB validation

The new single real validation command captured the first `IndustryResearchSkill.design()` request and made exactly one attempted Codex call after checking:

- instruction hash `7a04f3501b1d420d`
- input hash `36c1bc2fc516f169`
- outputContract hash `9854f93073c44d96`

Structured output was enabled with schema fingerprint `95e315657e862a7e`, size 2,111 bytes, and model `gpt-5.6-luna` at medium effort. The Codex process exited before returning semantic output; the result is `BACKEND_EXECUTION_FAILED`, with sanitized evidence only. No authentication/setup signal was observed, so this run is not classified as `BLOCKED_EXTERNAL_SETUP`. There was no parser or validator result and no production authorization.

Evidence: `tests/validation/evidence/RHL_M3B_CODEX_CLI_PCB_DESIGN_STRUCTURED_OUTPUT.json`.

## Safety and mutation boundary

The full schema, prompt, input, model output, reasoning trace, credentials, private paths, and stderr are not persisted. The temporary schema and invocation directory are removed on success and failure. Knowledge, Source/Raw, Gateway, Writer, report, graph, and production model selection were not mutated.

## Remaining acceptance

The bridge implementation is present and deterministic tests pass, but PCB semantic compatibility is not proven because the one live Codex process failed before semantic output. No production model selection or failover task is authorized by this result. A later rerun may classify the result as a structured-output configuration failure, external setup block, model-output invalid, or compatibility pass based on the actual sanitized failure/response.
