# RHL-M3B-3B-FIX-028 - Codex CLI Windows Standalone Resolution

- Baseline: `7350cfa06cb47e8a67cad78903b25368479fb125`
- Task: `RHL-M3B-3B-FIX-028-CODEX-CLI-WINDOWS-STANDALONE-RESOLUTION`
- Status: implementation complete; no commit or push performed

## FIX-027 acceptance context

FIX-027 established the shared resolver in `plugins/reasoning/codex-cli/executor.ts`, removed independent executable discovery from the application model-selection path, preserved direct native invocation with `shell: false`, and retained the explicit -> `CODEX_EXECUTABLE` -> PATH -> roaming AppData precedence. Its smoke remained unresolved because the supported resolver locations did not include the current standalone Windows installation layouts.

## Final resolution precedence

The resolver now checks valid regular files in this order:

1. explicit executable option;
2. `CODEX_EXECUTABLE`;
3. `codex` through Windows `PATH`/`Path` and `PATHEXT` (or `PATH` on non-Windows);
4. `%APPDATA%/npm/codex.cmd`, then `%APPDATA%/npm/codex.exe`, with the existing `USERPROFILE/AppData/Roaming` derivation when `APPDATA` is absent;
5. `%LOCALAPPDATA%/Programs/OpenAI/Codex/bin/codex.exe`;
6. the exact optional `%LOCALAPPDATA%/OpenAI/Codex/bin/codex.exe` runtime-compatible path;
7. `%USERPROFILE%/.codex/packages/standalone/current/bin/codex.exe`.

All fallback candidates are bounded exact paths and must be existing regular files. Missing files, directories, inaccessible files, and invalid junction targets are skipped. No version enumeration, recursive `.codex` scan, hash-directory scan, WindowsApps/LocalCache scan, registry lookup, or other application-internal discovery was added. Native executables remain direct `spawn` calls with `shell: false`; the FIX-027 command-shim wrapper is unchanged.

## Validation

- `npx tsx --test tests/plugins/reasoning/codex-cli.test.ts` - PASSED (23 tests), including synthetic standalone, managed-package, precedence, exact local-runtime, and fail-closed regressions.
- `node --import tsx tests/validation/codex-cli-windows-resolution-smoke.ts` - FAILED as local evidence: the resolver found no executable in the bounded supported layouts. The smoke performed only `--version` and `exec --help`; it made no model, authentication, configuration, acquisition-provider, or TEST-026 call.
- `npm run typecheck` - PASSED.
- `npm test` - FAILED overall: client tests passed (21/21), node tests passed 854/855, with the same unrelated `VAL-HTTP-001` valuation timing/status mismatch (`running` vs expected `blocked`). No valuation files were changed.
- `git diff --check` - PASSED.

The sanitized evidence is in `tests/validation/evidence/RHL_M3B_CODEX_CLI_WINDOWS_RESOLUTION.json` and records `CLI_NOT_INSTALLED_IN_SUPPORTED_LAYOUT`, with no absolute path or environment contents. The local result is not `CLI_PRESENT_BUT_NOT_EXECUTABLE` because discovery itself failed.

## TEST-026 decision

TEST-026 was not run. A fresh TEST-026 rerun is not yet justified because the bounded non-model smoke did not discover an executable. The remaining condition is specifically `CLI_NOT_INSTALLED_IN_SUPPORTED_LAYOUT`, not authentication, API-key, Edge, W2C, or model failure. No further filesystem guessing is authorized by this task.

## Privacy constraints

Evidence and diagnostics expose only sanitized resolution source labels (`explicit`, `environment`, `path`, `appdata`, `standalone`, or `localappdata`) and executable kinds (`native` or `command-shim`). They do not store the executable path, username, `LOCALAPPDATA`, `APPDATA`, `USERPROFILE`, PATH contents, environment dumps, credentials, tokens, or cookies.
