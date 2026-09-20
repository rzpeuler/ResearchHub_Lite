# EXPECTATION-SOURCE-CLOSE-001 — Track Closure & Main Promotion

task_id: `RHL-EXPECTATION-SOURCE-CLOSE-001-TRACK-CLOSURE`
status: `READY_FOR_SOL_REVIEW`
baseline: `54cbf00ce594dbaf25d797324e2b19181a9912eb`
branch: `codex/expectation-source-close-001`
implementation_commit: `pending`
verified_remote_tip: `pending`
sync_status: `READY_TO_SYNC`

## Summary

Closure-only reconciliation for `EXPECTATION-SOURCE-001`. The accepted
functional implementation remains frozen at `54cbf00`; this round changes only
governance, engineering closure wording, and durable closure reporting. The
accepted detailed real-E2E evidence remains immutable.

## Acceptance criteria

- 001A: `COMPLETE / SOL accepted`.
- 001B: `COMPLETE / SOL accepted`.
- 001C: `COMPLETE / SOL accepted` in governance after the supplied acceptance.
- Track: `COMPLETE / CLOSED`.
- Wave 2: `COMPLETE / CLOSED`; it is not reopened or modified.
- Wave 3 and `EXPECTATION-ARCHIVE-001`: pending next-track decision.
- Fast-forward-only promotion; no merge, rebase, squash, or force push.

## Release evidence

- Parser: `READY`, Docling `2.116.0`, Torch `2.14.0+cpu`, torchvision
  `0.29.0+cpu`, bridge smoke PASS.
- 001A real gate: PASS; 224 reports, 202 usable EstimatePoints, 25
  institutions.
- 001C real gate: PASS; primary 600519 completed with 14 sections, 191
  pre-result estimates, 11 post-result estimates, one consensus, 25
  contributors, 22 revision links, 11 cross-result revisions, 22 valuation
  impacts, 22 critical Thesis findings, deterministic replay, bundle
  determinism, degradation, and unchanged durability.
- 300750 completed partially with 14 sections, usable exact-period financial
  evidence, 136 Eastmoney reports, 124 estimates, 19 institutions, and 18
  revisions/valuation impacts; consensus was unavailable because its result
  cutoff was unavailable.
- 600519 FY2025 completed with `forecastBaseYear=2026`, zero usable estimates,
  and no fabricated consensus.

## Validation

- `npm run document-parser:check`: READY.
- 001A real acceptance: PASS.
- 001C real acceptance: PASS.
- `npm test`: client `28/28`; Node `1205/1205`.
- Serialized Node regression: `1205/1205`.
- Root typecheck, client typecheck, client build, and `git diff --check`: PASS.
- `VAL-HTTP-001`: isolated PASS; full serialized Node regression PASS.

## Governance status

- [EXPECTATION-SOURCE-001 governance](../governance/EXPECTATION-SOURCE-001.md)
  records the track as `COMPLETE / CLOSED`.
- [Wave 2 governance](../governance/WAVE2-CLOSURE.md) records the external
  track as closed and Wave 2 as unchanged and closed.
- [Detailed 001C evidence](../project-state/evidence/2026-09-20-expectation-source-001c-real.json)
  and [ENV evidence](../project-state/evidence/2026-09-21-expectation-source-001c-env-001.json)
  remain the authoritative artifacts.

## Changes and scope

Changed paths are governance, engineering specification closure wording, the
closure record, this task report, and reconciliation of the evidence assertion
test with the successful detailed artifact. No files under `plugins/**`,
`workflows/**`, `skills/**`, `knowledge/**`, `app/**`, `client/**`,
`scripts/document-parser-runtime.mjs`, or `config/document-parser/**` changed.

## Blockers and risks

- No release blocker observed.
- Historical surprise reconstruction remains limited by Eastmoney's rolling
  forecast horizon.
- Final Git promotion remains an explicit fast-forward-only operation after
  branch push and immediate remote ancestry recheck.
