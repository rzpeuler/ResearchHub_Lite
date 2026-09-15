# Direct Codex Legacy-Mode Cleanup Implementation Report

## Task record

- task_id: `RHL-DIRECT-CODEX-LEGACY-CLEANUP-2026-09-15`
- status: `READY_FOR_SOL_REVIEW`
- baseline: `8c0b9ee3557525481d9957f7ac1d0a9adaafca97`
- branch: `main`
- implementation_commit: `not-created (commit prohibited by the subagent task)`
- verified_remote_tip: `5179d73b957a79ec1e204fe6f42175ebe7a704a9`
- sync_status: `NOT_REQUESTED`
- governance_status: `old registry and external handoff governance removed per authorized design; no replacement control plane added`
- blockers: `no cleanup blocker; npm test retains one unrelated VAL-HTTP-001 failure`

The current user task explicitly authorized implementation of
`docs/superpowers/specs/2026-09-15-direct-codex-legacy-mode-cleanup-design.md`.
The design was read before implementation. No commit, push, reset, or history
rewrite was performed.

## Summary

The repository control-plane cleanup is complete within the approved scope.
The former Web-Chat2Codex backup/reconciliation material and old governance
registry were removed. README and AGENTS now describe direct Codex ownership
and retain the ResearchHub product architecture, Pi integration, Knowledge
boundaries, runtime security, and canonical mutation constraints.

No product implementation, product test, Knowledge schema, Workflow semantic,
Pi behavior, or Application Runtime contract was changed.

## Candidate classification and dependency evidence

| Candidate | Evidence | Decision |
| --- | --- | --- |
| `.web-chat2codex/**` | All 51 tracked paths were backup or reconciliation snapshots under `backups/governance`, `backups/governance-upgrade`, or `backups/reconciliation`. No package script, source import, runtime call site, or test-discovery reference targets them. | Removed. |
| `docs/governance/**` | All 12 tracked paths were the old entry-point registry, project/role/workflow/Git documents, or Writing Block templates. No package script, source import, runtime call site, or test-discovery reference targets them. | Removed. |
| `README.md`, `AGENTS.md` | Both contained instructions requiring the removed governance registry and external role/handoff model. | Rewritten minimally for direct Codex ownership while retaining product architecture and security boundaries. |
| `app/pi/model-selection.ts` | Imports `plugins/reasoning/codex-cli/executor.ts`; its explicit factory is a product reasoning backend and is separate from default production model selection. | Preserved. |
| `plugins/reasoning/codex-cli/{executor,index}.ts` | Implements executable discovery, bounded Codex CLI invocation, structured-output normalization, failure classification, and the Pi reasoning boundary. | Preserved. |
| `tests/app/pi/codex-cli-selection.test.ts`, `tests/plugins/reasoning/{codex-cli,reasoning}.test.ts` | Directly import and exercise the retained Codex CLI/Pi product integration. | Preserved. |
| `tests/validation/codex-cli-*`, `codex-module-*`, and their evidence | Directly import retained executor/model-selection behavior or validate product provider/model compatibility, schema transport, Windows resolution, and bounded live-product gates. They are discovered by the retained Node test runner where they have `.test.ts` entrypoints. | Preserved. |
| `docs/task-reports/**` with historical control-plane wording | These reports document Knowledge, Industry, parser, or Codex CLI product work; none is a report whose primary purpose is the removed transport/lifecycle protocol. Historical wording is retained as evidence and listed below. | Preserved; no history rewriting. |

No protocol-only tests, fixtures, evidence, scripts, or task reports outside
the explicitly removed directories were found. Package scripts do not refer to
the removed paths. The retained test runner still owns the same product test
roots and excludes only `tests/validation/evidence`.

## Retained Codex/Pi/Luna product assets

The following product-facing groups were intentionally not removed:

- `app/pi/` session, model-selection, security, system-prompt, and product-tool integration;
- `plugins/reasoning/codex-cli/`, `plugins/reasoning/pi/`, and shared reasoning contracts/errors;
- `tests/app/pi/codex-cli-selection.test.ts` and `tests/plugins/reasoning/codex-cli.test.ts`;
- `tests/validation/codex-cli-*.test.ts`, `tests/validation/codex-module-*.test.ts`, their runner modules, and corresponding sanitized evidence;
- Industry product validation that explicitly selects the Codex CLI backend through the Pi boundary.

These files have observable product imports/call sites and are not task
transport merely because their model/backend names contain Codex or Luna.

## Changes and deletion list

- Deleted `.web-chat2codex/**`: 51 tracked backup/reconciliation files.
- Deleted `docs/governance/**`: 12 tracked registry, role, workflow, Git
  policy, and Writing Block files.
- Updated `AGENTS.md` to concise direct Codex repository guidance.
- Updated `README.md` to remove the external governance/role registry
  instructions and retain product/runtime documentation.
- Added this implementation report.

## Residual reference audit

The bounded post-cleanup scan found no non-historical control-plane references
outside the design document, task reports, and package-lock integrity hashes.
The remaining task-report mentions are historical metadata or diagnostic
classification text in product reports, specifically:

- `RHL-M3B-1-FIX-003-CONTRACT-AND-ACCEPTANCE-CLOSURE.md` and
  `RHL-M3B-1-FIX-004-RESOLVER-CONTRADICTION-ACCEPTANCE.md` mention the former
  registry/protocol while documenting Knowledge resolution behavior.
- `RHL-M3B-3A-FIX-001-CONTRACT-AND-INTEGRATION-ACCEPTANCE.md` and
  `RHL-M3B-3A-FIX-002-SCOPE-AND-INTEGRATION-EVIDENCE-CLOSURE.md` retain the
  historical registry version in product acceptance evidence.
- `RHL-M3B-3B-DIAG-019-GOVCN-QUERY-COVERAGE.md` mentions the former result
  contract while documenting Gov.cn acquisition coverage.
- `RHL-M3B-3B-FIX-027-CODEX-CLI-WINDOWS-PATH-RESOLUTION.md` and
  `RHL-M3B-3B-FIX-028-CODEX-CLI-WINDOWS-STANDALONE-RESOLUTION.md` mention the
  old external failure vocabulary while documenting retained Codex CLI
  executable discovery behavior.
- `RHL-M3B-3B-IMPL-022-MIIT-OFFICIAL-INDUSTRY-ACQUISITION.md` and
  `RHL-M3B-3B-IMPL-042-MIIT-PCB-INDUSTRY-DEFINITION-EVIDENCE.md` mention old
  governance paths only as historical scope/baseline evidence.
- Two `package-lock.json` matches are ordinary integrity hash substrings, not
  semantic references.

The design document itself intentionally retains the terminology needed to
describe the cleanup scope. README and AGENTS contain no bounded references
to the removed task-handoff model.

## Validation

| Command | Result |
| --- | --- |
| `npm run typecheck` | PASS (`tsc --noEmit`) |
| `npm run client:typecheck` | PASS (`tsc --noEmit -p client/tsconfig.json`) |
| `npm run client:build` | PASS; Vite transformed 175 modules and produced `dist/client`. |
| `npm test` | FAILED with 969 passing and 1 failing test out of 970. The failure is existing/unrelated `tests/app/runtime/valuation-route.test.ts` (`VAL-HTTP-001`): actual `running`, expected `blocked`. Client tests were 21/21. |
| package-script path audit | PASS; all 10 referenced local script/config paths exist across 13 package scripts. |
| removed-path audit | PASS; `.web-chat2codex` and `docs/governance` are absent and zero tracked paths remain under either path. |
| non-historical control-plane scan | PASS; no removed-protocol path/term references outside the documented historical/design/hash exclusions. |
| `git diff --check` and staged diff check | PASS. |

## Risks and follow-up

- The full product test command remains non-zero because of the unrelated
  `VAL-HTTP-001` baseline failure. The main Agent should decide whether to
  repair that product test/runtime behavior in a separate scoped task or
  accept the existing failure explicitly; it was not changed here.
- Historical task reports still contain old protocol vocabulary. Removing or
  rewriting those mixed product reports would alter historical evidence and
  was outside this cleanup's safe scope. If a zero-textual-reference policy
  is required, the main Agent must authorize a separate history/document
  normalization decision.
- The working tree is intentionally uncommitted. The main Agent must review
  the deletion scope and this report before creating the cleanup commit and
  deciding whether to synchronize it.
