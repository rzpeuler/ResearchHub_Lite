# RHL-M3B-3B-FIX-003 — Codex CLI Luna Pi-Compatible Reasoning

Status: IMPLEMENTED / CODEX_CLI_LUNA_AVAILABLE / CTO ACCEPTANCE PENDING

## Scope and inspection

- Base and current HEAD: `cf8b7445e9eee5721b88199bdd306c9c44cc2557`.
- Branch: `codex/personal-research-v1-industry-architecture`.
- Pi packages: `@earendil-works/pi-ai` and `@earendil-works/pi-coding-agent`, both `0.85.1`.
- Existing `ModelRuntime` selection remains in `app/runtime/application-runtime.ts`; the new backend is not wired into that default path.
- Existing primary selection remains exactly `zhipu-openapi/glm-5.3-flash`.
- Local CLI discovery found the `codex` executable; private absolute paths and authentication material were not recorded.

## Actual CLI capability and adapter

Installed version: `codex-cli 0.152.1`.

Help-derived invocation: `codex exec --model gpt-5.6-luna -c model_reasoning_effort="medium" --ephemeral --sandbox read-only --skip-git-repo-check -C <bounded-temp-directory> --json -o <bounded-temp-file> -`. The installed `exec` help does not expose `--ask-for-approval`; the adapter therefore relies on the explicitly read-only sandbox and does not use any approval-bypass flag.

The adapter uses Node `spawn` with an argument array and `shell: false`; the semantic context is sent through stdin. It uses the existing `PiReasoningExecutor` context construction, timeout/cancellation boundary, output-size bound, and JSON parsing. The backend is truthfully identified as Pi host plus `codex-cli` completion backend, rather than as a native Pi `Model<Api>`.

The factory is explicit and fail-closed on missing executable. No Codex settings or credentials were changed. No dangerous bypass, writable sandbox, automatic write approval, or unrestricted stderr propagation is used.

## Validation

The real availability check is `tests/validation/codex-cli-luna-availability.ts`. It performs version/help checks and one harmless request for `{ "status": "ok" }` through the new factory and Pi executor. Its sanitized evidence is written to `tests/validation/evidence/RHL_M3B_CODEX_CLI_LUNA_AVAILABILITY.json`.

Deterministic tests cover fixed model/effort construction, safe flags, JSONL final-response extraction, Pi-boundary execution, malformed structured output, and production-model preservation. The real call completed in 9,377 ms and returned a 15-byte JSON result; request/result hashes and sizes are in the evidence file.

Validation results: focused Codex/Pi/availability tests passed (5/5); `npm run typecheck` passed; `npm run client:typecheck` passed; `npm run test:node` passed (687/687); `npm test` passed (client 21/21 and Node 687/687); `npm run client:build` passed; `git diff --check` passed with only normal LF-to-CRLF warnings for three edited text files. The initial concurrent focused run observed one stale assertion before the test process loaded the corrected file; the final focused run passed.

## Files changed

- `app/pi/model-selection.ts`
- `app/pi/README.md`
- `plugins/reasoning/pi/executor.ts`
- `plugins/reasoning/codex-cli/`
- `tests/plugins/reasoning/codex-cli.test.ts`
- `tests/app/pi/codex-cli-selection.test.ts`
- `tests/validation/codex-cli-luna-availability.ts`
- `tests/validation/codex-cli-luna-availability.test.ts`
- `tests/validation/evidence/RHL_M3B_CODEX_CLI_LUNA_AVAILABILITY.json`

The frozen PCB Manufacturing Industry Design request, acceptance gates, governance/architecture documents, Knowledge data, and primary production model were not modified. Luna performed no commit, push, amend, rebase, or force-push; ORCHESTRATOR retains all Git synchronization ownership.
