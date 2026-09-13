# RHL-M3B-3B-FIX-027 — Codex CLI Windows Path Resolution

- Baseline: `df2ad88eef8c358a0389f6138e3a1c4b60a633b0`
- Task: `RHL-M3B-3B-FIX-027-CODEX-CLI-WINDOWS-PATH-RESOLUTION`
- Status: implementation complete; no commit or push performed

## Root cause and ownership

The failure before TEST-026 occurred before any provider or model execution because the orchestrator process could not discover `codex`. Discovery was duplicated in `app/pi/model-selection.ts` and depended on `where.exe` on Windows (or `which` elsewhere), while the adapter itself accepted a raw command without validating or resolving it. The canonical resolver now lives in `plugins/reasoning/codex-cli/executor.ts`; the app factory constructs the adapter and retains only a compatibility delegating export.

Precedence is exact and fail-closed: valid explicit `options.executable`, non-empty `CODEX_EXECUTABLE`, process PATH/`Path`, then bounded Windows AppData fallback. Path-like values must be regular files; bare commands are resolved through the same bounded rules.

## Windows behavior and safety

Windows PATH resolution uses `PATH`/`Path` and `PATHEXT`, including native `.exe` and npm `.cmd`/`.bat` shims. With no usable PATH, the resolver checks only `%APPDATA%/npm/codex.cmd` and `%APPDATA%/npm/codex.exe`, or `USERPROFILE/AppData/Roaming/npm` when APPDATA is absent. No recursive profile, disk, registry, shell-history, browser-state, or unrelated-directory search was added.

Native executables and non-Windows commands remain direct `spawn(..., shell: false)`. Windows command shims use a narrowly scoped `cmd.exe /d /s /c` wrapper containing only separately quoted executable/argument values. Prompts continue through stdin and are never interpolated into the command line. Existing `exec`, model, reasoning effort, ephemeral, read-only sandbox, git-check bypass, schema, JSON, output-file, and stdin arguments remain unchanged.

## Files changed

- `plugins/reasoning/codex-cli/executor.ts` — shared resolver, diagnostics, and shim invocation construction.
- `app/pi/model-selection.ts` — removed independent discovery and delegates through the adapter.
- `tests/plugins/reasoning/codex-cli.test.ts` — deterministic precedence, PATH/AppData, failure, and shim tests.
- `tests/validation/codex-cli-windows-resolution-smoke.ts` — non-model `--version`/`exec --help` smoke.
- `tests/validation/evidence/RHL_M3B_CODEX_CLI_WINDOWS_RESOLUTION.json` — sanitized smoke evidence.
- `docs/task-reports/RHL-M3B-3B-FIX-027-CODEX-CLI-WINDOWS-PATH-RESOLUTION.md` — this report.

## Validation

- `npx tsx --test tests/plugins/reasoning/codex-cli.test.ts` — PASSED (19 tests).
- `npx tsx --test tests/app/pi/codex-cli-selection.test.ts` — PASSED (2 tests).
- `npm run typecheck` — PASSED.
- `git diff --check` — PASSED.
- `node --import tsx tests/validation/codex-cli-windows-resolution-smoke.ts` — FAILED as evidence: this environment has no discoverable local Codex CLI. It made no model or authentication call and wrote sanitized negative evidence.
- `npm test` — FAILED overall because one unrelated existing runtime valuation test observed `running` instead of expected `blocked`; client tests passed (21/21) and node tests passed 850/851. No valuation files were changed.

The smoke failure is reported as `tests_status: FAILED` per task instruction. TEST-026 was not rerun. A fresh production E2E rerun is not yet justified until the local smoke can find and safely execute the installed Codex CLI and the full-suite baseline failure is reconciled by its owner.

## Privacy and security constraints

Evidence contains no resolved path, username, APPDATA, USERPROFILE, PATH contents, environment dump, credentials, tokens, cookies, or authorization data. Resolver diagnostics expose only `explicit`, `environment`, `path`, or `appdata`, plus `native` or `command-shim`. The resolver fails with `reasoning_host_unavailable` when authorized candidates are exhausted and does not misclassify discovery as authentication, model, Edge, or W2C failure.
