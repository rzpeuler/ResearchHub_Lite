# Daily Intelligence Breadth Closure — D5 v0.1

Status: implemented candidate; D5 branch only; Sol acceptance pending

## Scope and baseline

D5 is an additive data-coverage closure on the accepted M2 Daily Intelligence
workflow. M2 remains closed. The existing `DailyIntelligenceService`,
`runDailyIntelligence`, `ResearchSignal` processing, brief synthesis, scheduler,
trading calendar, signal/brief stores, and Knowledge Production Gateway remain
the product path and are not redesigned.

The implementation starts from `f6496692bb5414a6fe0ca37ee0739fc54a092293`.
The normal catalog contains 43 entries, but only CNINFO and GDELT are currently
active in the default composition. Reference-only homepages are not acquisition
paths. The audited gov.cn RSS URL returned HTTP 404 and will not be activated
without a reproducible feed endpoint.

## Design choice

D5 uses explicit, bounded acquisition lanes through the existing acquisition
seam. It does not introduce a provider registry, universal observation bus,
source manager, data lake, new scheduler, or canonical Daily object.

The default composition will explicitly retain CNINFO and GDELT and add only
truthful lanes:

- AKShare market observations, when the existing bounded Python bridge is
  available;
- a D1 expectation snapshot/revision adapter that reuses the existing
  `AkshareEarningsExpectationsSource` and code-owned revision calculator;
- AKShare institutional activity, represented as activity rather than a view or
  consensus;
- a D4 industry-observation adapter that reuses the existing D4 acquisition and
  parsers for exact supported targets only.

Each lane remains optional and fail-soft. Catalog metadata describes identity,
role, and operational status explicitly; catalog presence or `enabled: true`
does not activate an acquisition path.

## Data flow

The existing Daily workflow remains the orchestrator:

```text
explicit catalog/composition lanes
  -> bounded candidates and normalized sources
  -> existing Daily signal projection
  -> existing stable dedup, enrichment, clustering, ranking, assessment
  -> existing Morning/Evening synthesis and optional Gateway path
```

Company and broad lanes retain their current scopes. A small explicit industry
scope extension lets the D4 adapter receive watchlist industries without using
synthetic company identities. Unsupported broad aliases return no candidates
and make zero D4 acquisition calls.

Structured details stay source-owned in candidate metadata and source content;
`ResearchSignal` is not converted into a universal numeric schema. Daily signal
metadata identifies the bounded lane and observation identity so reports and
telemetry can explain the source without allowing model-generated numeric truth.

## Lane contracts

### Market

`AkshareDailyMarketAcquisition` selects the latest deterministic row whose trade
date is not after `asOf`. It rejects missing or future trade dates and never
uses an unrestricted current row as historical truth. Candidate identity is
based on source endpoint, metric, trade date, and observed value—not caller
`asOf` alone—so changing the run cutoff does not fabricate novelty, while a new
date or genuinely changed value can produce a new signal.

Market metadata retains metric, value, unit, observation/trade date,
retrieval time, underlying publisher where knowable, `S3_AGGREGATOR` authority,
and AKShare retrieval provenance. Major index observations are required where
the bridge returns deterministic rows. Sector and breadth fields are optional
and are admitted only when field meaning, unit, date, and PIT semantics are
deterministic.

### Expectations

The D1 source and projection code remain authoritative. D5 does not fetch or
reimplement THS/EastMoney data. The adapter projects a bounded company-level
snapshot or old-to-new estimate revision from validated D1 points. A missing
prior point produces a snapshot classification, never a fabricated revision.
The same snapshot twice produces no new signal; a real value/publication change
produces one stable revision identity. `publishedAt <= analysisAsOf` remains
mandatory. D1 unavailable becomes an explicit lane diagnostic and does not
become consensus.

### Institutional activity

The adapter uses `AkshareDataClient.institutionalResearchDetail()` only when
the method is available. Each admitted row retains company attribution,
activity/event date, publication or source date when provided, and source
lineage. A company visit or survey is classified as `institutional_activity`;
it is not called an institutional view, recommendation, or consensus. Duplicate
rows use a stable source-native identity.

Catalog CICC/CITICS/HTSEC homepages remain reference-only unless a real
article/feed/search endpoint is separately proven.

### Industry observations

The adapter calls the existing D4 seam and reuses its normalized sources,
observation IDs, parsers, qualifiers, units, PIT fields, and source lineage.
Only exact supported identities—lithium battery and household/room air
conditioner—activate the lane. `new-energy`, `consumer`, `home appliance`,
HVAC, `锂电材料`, and other broad aliases do not activate it. Re-retrieving the
same D4 observation is not a new event; a new publication, period, or validated
value change is.

## Identity, deduplication, and PIT

Structured provider identity is preferred over URL when deduplicating Daily
signals. This prevents one D4 source document from collapsing several distinct
observations while still deduplicating repeated news URLs. Stable identity uses
source/observation identity, metric, period/date, subject, and value where a
changed value is itself meaningful. Retrieval timestamps are never identity.

Every time-sensitive lane distinguishes observation/event date, `publishedAt`,
and `retrievedAt`. Unknown publication time remains allowed only for qualitative
discovery with `temporalConfidence: unknown`; structured numeric observations
require deterministic observation-date eligibility. Future source rows are
rejected, and the existing quality gate continues to treat future evidence as an
error while leaving undated qualitative material as a warning.

## Composition and telemetry

Composition reports actual lane state rather than catalog size. Existing
provider outcomes are preserved and extended only with bounded factual counts
for configured, active, attempted, succeeded, blocked, and structured signals
where needed. Reference-only, metadata-only, and blocked entries are visibly
not attempted. A failing optional lane never blocks a brief; existing fatal
input, cancellation, quality-gate, and Gateway failures retain their behavior.

Morning and Evening continue through the same `startBrief` → `runDailyIntelligence`
path. No investment recommendation or deterministic conviction output is added.

## Knowledge boundary

Structured Daily signals remain runtime monitoring artifacts. They do not become
canonical Claims or new Knowledge objects automatically. Existing Change
Assessment → eligible proposal → Gateway behavior remains the only durable
mutation path. Gateway-owned canonical Source IDs are not manufactured by D5.

## Validation and acceptance

Offline tests remain zero-network and cover catalog role/status activation,
historical market PIT filtering, exact trade-date selection, missing dates,
zero values, stable identity, asOf-only reruns, D1 snapshots/revisions/future
points/unavailability, institutional activity semantics and dedup, D4 reuse,
unsupported target zero-call behavior, Morning and Evening normal product paths,
scheduler timing/trading-day behavior, fail-soft provider diagnostics, and the
unchanged Knowledge boundary.

The gated real harness is
`scripts/acceptance-daily-breadth-d5-real.ts` and runs only with
`RESEARCHHUB_RUN_REAL_DAILY_BREADTH=1`. Its default output is
`REAL_DAILY_BREADTH_NOT_RUN` with `networkCalls=0`. The real run uses normal
composition and the Daily service for both Morning and Evening. It records
actual provider outcomes, structured signal counts, date/PIT quality, brief
sections, and precise external limitations. No fabricated fallback is allowed.

Full validation remains:

```text
npm run typecheck
npm test
npm run client:typecheck
npm run client:build
git diff --check
```

The D5 branch is pushed for Sol review and is not merged into main by this
task.

## Implementation evidence

The catalog audit is explicit at runtime: 43 entries resolve to 3 active feeds
(CNINFO, GDELT, AKShare), 39 metadata-only reference entries, and 1 blocked
gov.cn entry. The gov.cn entry is retained as `reference_only` with its audited
RSS 404 reason; it is not attempted by composition.

The default provider graph is the existing CNINFO/GDELT path plus four bounded
Daily lanes: AKShare market, D1 expectations, AKShare institutional activity,
and D4 industry observations. The normal composition exposes one shared
calendar and the existing scheduler/service path remains unchanged. The
calendar injection used by the real harness is a test seam only and marks the
requested trade date as manual so an external calendar outage cannot prevent
lane execution.

Offline validation completed on the D5 worktree: 28 client tests, 1,473 Node
tests, server typecheck, client typecheck, client production build, and
`git diff --check`.

## D5-FIX-001 evidence

The market adapter now keeps logical index identity separate from the provider
transport map: `000001→sh000001`, `399001→sz399001`, `399006→sz399006`, and
`000688→sh000688`. It uses Shanghai close availability at 15:00, accepts the
same-day row only at or after that boundary, and records Sina Finance as the
origin publisher with AKShare as retrieval provider. Epoch-encoded provider
dates are normalized before PIT selection.

The institutional adapter sends a bounded seven-day Shanghai lookback as
`YYYYMMDD`, admits only event and publication dates available at `asOf`,
normalizes date-only publication to Shanghai end-of-day, supports the actual
AKShare columns (`代码`, `名称`, `调研机构`, `调研日期`, `公告日期`), and excludes
retrieval/request time from stable identity. It records returned, PIT-rejected,
accepted, and limit-dropped row counts.

D1 snapshots now use `expectation_snapshot`; only non-zero estimate changes use
`expectation_revision`. D4 Daily signals use
`kind=industry_observation, category=industry`. Enrichment freezes categories
for structured D5 lanes, and Morning/Evening routing keeps activity in IR
sections, views in Institutional Views, and D4 observations out of market
sections.

The corrected gated harness was executed for 2026-09-23 through Morning and
Evening. It made 36 ordinary network fetches and 14 AKShare bridge calls. Both
briefs completed; market returned 4/4 indexes, institutional activity returned
1,709 rows with 61 PIT-rejected, 10 accepted, and 1,638 additional valid rows
dropped by the bounded output limit; D1 and D4 lanes succeeded, PIT was safe,
and no fabricated fallback was used. The run remains partial only
for CNINFO managed parser availability and GDELT responses (HTTP 429/invalid
provider response). The default no-network harness mode reports
`REAL_DAILY_BREADTH_NOT_RUN` with `networkCalls=0`.
