# EXPECTATION-SOURCE-001 Closure Record

Status: `IMPLEMENTED / SOL ACCEPTANCE PENDING`

Track governance state: `COMPLETE / CLOSED` after the accepted functional
implementation was reconciled. This record does not claim a new SOL approval.

Accepted functional implementation HEAD:
`54cbf00ce594dbaf25d797324e2b19181a9912eb`

## Release gates

- Parser: `READY`; Docling `2.116.0`; Torch `2.14.0+cpu`; torchvision
  `0.29.0+cpu`; bridge smoke PASS.
- 001A real gate: PASS with reachable Eastmoney acquisition, 224 reports,
  202 usable EstimatePoints, and 25 institutions.
- 001C real gate: PASS; primary 600519 Workflow completed with 14 sections,
  PIT audit PASS, deterministic replay PASS, bundle determinism PASS,
  degradation PASS, and unchanged durability state.
- Offline release gate: `npm test` passed client `28/28` and Node `1205/1205`;
  serialized Node `1205/1205`; root/client typechecks, client build, and
  `git diff --check` passed.

## Accepted capability and limitations

The track provides real Eastmoney report-level EPS acquisition,
institution-attributable EstimatePoints, strict PIT consensus, post-result
revision analysis, automatic Earnings Review assembly, caller precedence,
non-blocking degradation, report-only expectation evidence, the valuation
refresh bridge, bounded Thesis filtering, real-provider E2E validation, and
deterministic Workflow replay.

The source remains EPS-only and annual FY-estimate-only. Historical surprise is
not generally available because of the rolling current-year / `+1` / `+2`
horizon. There is no Guidance or Segment KPI acquisition, automatic expectation
Knowledge persistence, target-price calculation, or public API/UI exposure.

## Evidence

- Detailed 001C evidence:
  `docs/project-state/evidence/2026-09-20-expectation-source-001c-real.json`
- Parser/financial environment evidence:
  `docs/project-state/evidence/2026-09-21-expectation-source-001c-env-001.json`
- Engineering specification:
  `docs/engineering/specs/2026-09-20-expectation-source-001-design.md`

The 300750 secondary case completed with usable exact-period financial data,
136 Eastmoney reports, 124 estimates, 19 institutions, and 18 revisions;
consensus remained unavailable because its result cutoff was unavailable. The
600519 FY2025 case completed with `forecastBaseYear=2026`, zero usable
estimates, and no fabricated consensus.

## Promotion and next track

The closure branch is intended for fast-forward-only promotion after the
remote ancestry gate. No merge commit, rebase, squash, or force push is
permitted. Wave 2 remains `COMPLETE / CLOSED` and was not reopened by this
post-Wave-2 source-acquisition track. `EXPECTATION-ARCHIVE-001` and Wave 3
remain `PENDING POST-CLOSURE DECISION` for the next Sol review.
