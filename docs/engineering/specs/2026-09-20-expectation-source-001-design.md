# EXPECTATION-SOURCE-001 — Point-in-Time Expectation Source Design

Date: 2026-09-20
Status: `001C IMPLEMENTED / SOL ACCEPTANCE PENDING`
Baseline: `033394269a847118468a3fd27f4cbb25be0a6d13`

## Track state

001A Eastmoney report-level EPS acquisition is complete. 001B adds the
Workflow-owned automatic bundle assembler and Earnings Review wiring. 001C is
the real point-in-time end-to-end validation and robustness phase and remains
pending SOL acceptance.

## Activation and precedence

The Workflow resolves expectations in this order: an explicitly supplied
caller bundle wins, otherwise an injected `EarningsEastmoneyExpectationSource`
may be attempted, otherwise expectations remain absent. An explicitly empty
caller bundle still owns the input and prevents Eastmoney acquisition. The
source client is never instantiated or called implicitly by Earnings Review.

Automatic acquisition requests the normalized company, Earnings Review
`asOf`, and requested Earnings fiscal year. Provider `currentYear` continues
to control 001A field-to-year mapping; it never replaces the requested
Earnings fiscal year.

## Automatic bundle assembly

001B validates the 001A `EstimatePoint` projection again, retaining only finite
annual EPS points for the exact requested `YYYY-FY` period and
`CNY_per_share` unit whose publication time is at or before analysis `asOf`.
Missing source bindings, duplicate Estimate IDs, and same-institution,
same-metric, same-period, same-timestamp ambiguity exclude all affected
points. Sources are narrowed to those referenced by retained estimates.

When the official Earnings filing timestamp is valid and no later than
analysis `asOf`, automatic consensus uses the strict cutoff one millisecond
before that result. It calls the existing W2 `buildConsensusSnapshot()` with
`minimumCount = 2`; it does not reimplement consensus arithmetic. Prior
institution keys use the same safe pre-result history. Latest genuine
value-changing adjacent revisions are represented only as
`EstimateRevisionLink[]`; W2 calculates revision magnitudes.

Automatic bundles contain sources, safe estimates, consensus snapshots, prior
institution keys, revision links, and an optional valid result cutoff. They do
not acquire Guidance or Segment KPI data and do not invoke W2-002 Knowledge
projection.

## Period and degradation rules

Automatic data is annual EPS only. FY consensus is never compared with an H1,
Q1, or Q3 actual because existing W2 exact-period matching remains
authoritative. Annual EPS revisions may still appear in report-level revision
sections for a non-FY review.

Provider failure, malformed data, unsupported fiscal year, empty data, an
unexpected client exception, and zero safe estimates are non-blocking for an
otherwise valid Earnings Review. The Workflow records provider outcome,
bounded acquisition diagnostics, mode, status, and assembly counts while
leaving the base report usable.

## Boundaries

Earnings Skill reasoning runs before automatic acquisition and receives no
Eastmoney source, EstimatePoint, ConsensusSnapshot, revision link, or
expectation finding. Automatic expectation sources are report evidence only;
they are excluded from semantic evidence validation and Knowledge Production
Gateway bindings. Automatic expectations cannot create canonical Sources,
Claims, Observations, Thesis state, or durable proposals.

Caller mode records provider acquisition as `not_attempted` regardless of
caller bundle contents; `expectationStatus` separately reports whether caller
expectations produced usable findings. Automatic telemetry distinguishes clean
usable, partial, unavailable, and failed acquisition. Report methodology uses
the corresponding high-level automatic state and never copies raw provider
exceptions or diagnostic lists into the report. No aggregate consensus endpoint
or LLM arithmetic is used. Existing 14-section report structure is preserved.

## 001C Real PIT E2E

The gated acceptance harness is
`scripts/acceptance-expectation-source-001c-real.ts`, enabled only by
`RHL_REAL_EXPECTATION_E2E=1`. It captures CNINFO, AKShare, and Eastmoney input
in memory, seeds temporary Schema 0.4 Thesis context through
`KnowledgeProductionGateway`, and writes summary-only evidence to
`docs/project-state/evidence/2026-09-20-expectation-source-001c-real.json`.

The live 600519 / SSE / 2026 H1 run used its execution timestamp as `asOf` and
selected an official result at `2026-08-14T16:00:00.000Z`. The independent
Eastmoney capture contained 224 report records, 224 normalized expectation
sources, 202 EPS points, and 25 institutions. The automatic assembler retained
191 estimates strictly before the result, produced one pre-result consensus
with 25 contributors, and retained 22 genuine non-zero revision links,
including 11 cross-result revisions. Reversing source, estimate, and
institution order produced the same bundle hash. Post-result estimates stayed
in safe history but did not enter the pre-result consensus.

The annual estimate period remains `2026-FY`; the actual Earnings period is
`2026-H1`. Exact-period matching therefore produces no actual-vs-consensus or
actual-vs-prior-estimate comparison for those annual estimates. Annual
revisions remain valid annual signals and are not relabeled as H1 evidence.

The parser environment was repaired before the final rerun: the managed
environment reports Docling `2.116.0`, Torch `2.14.0+cpu`, torchvision
`0.29.0+cpu`, CPU-only execution, and a passing bridge smoke. The Windows
setup uses the detected local SOCKS5 proxy, exact official CPU wheels, and
short temporary staging to avoid the earlier dependency and Long Path failures.
The financial adapter was also repaired narrowly: the legacy
`stock_financial_analysis_indicator` call remains classified
`TRUE_UPSTREAM_EMPTY`, while `stock_financial_analysis_indicator_em` with
`600519.SH` / `300750.SZ` provides usable exact `2026-H1` financial data.

The final live 600519 / SSE / 2026 H1 Workflow completed with the required 14
report sections. CNINFO, AKShare, and Eastmoney each supplied usable evidence;
Eastmoney supplied 224 reports, 202 EstimatePoints, and 25 institutions. The
result was published at `2026-08-14T16:00:00.000Z`; 191 estimates were strictly
pre-result and 11 were post-result history. The PIT cutoff was
`2026-08-14T15:59:59.999Z`, with one consensus snapshot and 25 contributors,
22 revision links, and 11 cross-result revisions. No post-result estimate
entered consensus, and bundle reversal remained deterministic.

The annual expectation period remains `2026-FY`, while the actual Earnings
period is `2026-H1`; actual-vs-consensus and actual-vs-prior-estimate counts
therefore remain zero. The Workflow produced 22 estimate revisions, 22
valuation-impact bridge findings, and `valuationRefreshRequired=true`, without
calculating a target price. Existing first-class Thesis context classified all
22 findings as critical, with zero relevant or uncertain findings, and did not
mutate Thesis state.

Two complete captured-input Workflow replays produced identical hashes
(`679dba4b35837eaaa42218db97be66b74eea8cccd311e2be31fc89ffdfab74b2`), while
the independent bundle determinism hash was
`6b97f1a7ef2783fb3d9460ab0f3957a1a54e312b5f52500e6a1aa005c5e94d04` for both
normal and reversed input. The full injected-Eastmoney-failure Workflow also
completed with the 14-section base report preserved, expectation acquisition
`failed`, expectation status `unavailable`, truthful methodology, unchanged
Knowledge revision/hash, and zero canonical Eastmoney Sources.

The 300750 / SZSE / 2026 H1 Workflow completed partially with 14 sections,
usable AKShare exact-period evidence, 136 Eastmoney reports, 124 estimates,
19 institutions, 18 revision links, and 18 critical Thesis findings. Its
result cutoff was unavailable, so no consensus was asserted. The 600519 FY2025
case completed with `forecastBaseYear=2026`, zero usable estimates, no fabricated
consensus, and explicit unsupported-year diagnostics. Historical surprise
reconstruction remains limited because the provider exposes only a rolling
current-year/+1/+2 forecast horizon; no year relabeling is permitted.
