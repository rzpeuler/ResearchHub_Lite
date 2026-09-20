# EXPECTATION-SOURCE-001 Governance State

Updated: 2026-09-21

## Track

- Track: `EXPECTATION-SOURCE-001`
- Status: `COMPLETE / CLOSED`
- Accepted functional implementation HEAD: `54cbf00ce594dbaf25d797324e2b19181a9912eb`
- 001A: `COMPLETE / SOL accepted`
- 001B: `COMPLETE / SOL accepted`
- 001C: `COMPLETE / SOL accepted`
- Wave 2: `COMPLETE / CLOSED`
- Wave 3: `NOT STARTED`

## Closed capability and limitations

The closed track provides real Eastmoney report-level EPS acquisition,
institution-attributable EstimatePoints, strict PIT pre-result consensus,
post-result estimate-revision analysis, automatic Earnings Review bundle
assembly, caller expectation precedence, non-blocking source degradation,
report-only expectation evidence, the valuation-refresh bridge, bounded Thesis
dependency filtering, real-provider E2E validation, and deterministic Workflow
replay.

The source remains EPS-only and annual FY-estimate-only. Eastmoney exposes a
rolling `currentYear` / `+1` / `+2` horizon, so historical actual-vs-consensus
reconstruction is not generally available and `HISTORICAL_SURPRISE_READY` is
`NO`; `HISTORICAL_SURPRISE_LIMITED_BY_ROLLING_WINDOW` is `YES`. The track does
not acquire Guidance or Segment KPI data, persist automatic expectations to
Knowledge, calculate target prices, or expose a public API/UI.

Accepted source classification:

- `LIVE_CURRENT_FORECAST_AND_REVISION_READY = YES`
- `HISTORICAL_SURPRISE_READY = NO`
- `HISTORICAL_SURPRISE_LIMITED_BY_ROLLING_WINDOW = YES`

## Frozen principles

- Individual attributable estimates are primary; consensus is reconstructed by
  deterministic W2 methodology.
- Publication time is point-in-time critical, and provider current-year
  metadata anchors forecast-year mapping.
- Aggregate current consensus is not historical truth.
- No provider-specific field bypasses validation.
- Source acquisition failure is non-fabricating.
- Provider source acquisition and research methodology remain separate.

## Slice boundaries

001A provides a bounded Eastmoney report-level EPS source and Workflow-side
`EstimatePoint` projection. 001B adds opt-in Workflow-owned automatic bundle
assembly and Earnings Review wiring while preserving caller-bundle precedence,
report-only expectation sources, and expectation-blind reasoning. 001C is the
real point-in-time end-to-end and robustness phase; its final gated run completed
against the repaired CPU-only managed parser environment with usable CNINFO,
AKShare, and Eastmoney evidence. The track is now closed after SOL acceptance.
