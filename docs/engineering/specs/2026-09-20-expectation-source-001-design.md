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

The live full Workflow case is externally blocked in this environment before
report completion. Repository-authoritative parser preflight is
`BRIDGE_SMOKE_FAILED` with Python ready, Docling `2.116.0`, model artifacts
ready, and bridge exit code `1`; the captured bridge stderr ends with
`document_parser_failed: No module named 'torch'`, classified as
`EXTERNAL_DEPENDENCY_BLOCKED`. The AKShare bridge is
installed (`1.18.64`) but independent calls for both `600519` and `300750`
returned zero rows and were classified `UPSTREAM_EMPTY`. The evidence therefore
does not claim a full 14-section real-provider report pass. The live Eastmoney
contract still demonstrated current forecast/revision readiness, while
historical FY2025 surprise reconstruction remains unavailable because
`forecastBaseYear=2026` and the endpoint exposes a rolling current-year/+1/+2
horizon. No year relabeling or fabricated historical consensus is permitted.

The current 300750 rerun returned 136 report records and 124 valid 2026-FY EPS
points across 19 institutions; it was not treated as an empty projection. The
600519 FY2025 negative case returned zero points with explicit unsupported-year
diagnostics, preserving the rolling-window conclusion.

The acceptance evidence distinguishes deterministic bundle assembly from
Workflow replay. Reversed-input assembly is demonstrated by equal normal and
reversed bundle hashes; `workflowReplay` remains unavailable with
`FULL_WORKFLOW_NOT_COMPLETED`, and both replay hashes are null because two
completed Workflow replays did not occur. This is a blocked partial E2E result,
not a replay pass.
