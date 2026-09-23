# D4 Long-Haul Industry Operating Observations

Date: 2026-09-23  
Status: Approved implementation design  
Scope: `RHL-D4-LONGHAUL-001`

## Decision

Implement a thin, source-specific operating-observation path for the existing
Industry Deep Research product flow. The path is owned by the existing
Workflow/Skill/Plugin/Gateway boundaries:

```text
ResearchService
  -> Industry Deep Research Workflow
  -> D4 source-specific acquisition and pure parsers
  -> validated IndustryOperatingObservation[]
  -> existing NormalizedResearchSource / ModuleEvidence
  -> Industry Research Skill
  -> existing Knowledge Production Gateway / Writer
  -> existing Industry report
```

D4 is additive. It does not create a new runtime, planner, provider registry,
metric service, time-series store, observation repository, Knowledge object, or
canonical schema version.

## Goals

- Support the frozen narrow coverage:
  - lithium battery: `PRODUCTION` and `PRICE`, with MIIT as the primary source;
  - household air conditioner: `PRODUCTION` and `TRADE`, using NBS and CHEAA.
- Preserve source identity, authority, retrieval provenance, publication PIT,
  value-version PIT, product scope, geography, period, aggregation, and
  qualifier without inference or source averaging.
- Make parser output deterministic, bounded, testable offline, and attributable
  to an actual normalized source.
- Expose accepted observations to the relevant Industry modules and render a
  deterministic table in the existing `Key Metrics & Monitoring` section.
- Keep D4 failures fail-soft so ordinary Industry evidence and Knowledge
  production can complete when operating sources are unavailable.
- Prove the complete path through the normal `ResearchService` product entry
  point using a gated real-source acceptance harness.

## Non-goals and hard boundaries

- No new Agent Runtime, Planner, generic provider/metric framework, ontology,
  vector database, time-series database, or observation persistence layer.
- No direct frontend or browser Knowledge writes; canonical writes remain
  Gateway/ChangeSet/Validation/Writer writes.
- No modification to D0 acquisition implementation or ordinary Industry source
  budgets; D4 has a separate bounded source/observation seam.
- No OCR, arbitrary open-web/browser fallback, EastMoney/snippet substitution,
  source averaging, interpolation, latest-retrieval selection, or LLM numeric
  repair.
- No direct GACC household HS mapping claim. CHEAA remains the publisher/host
  for the accepted household trade path, with GACC retained as upstream source
  metadata.
- Unknown targets return `SCOPE_UNSUPPORTED` and perform zero D4 network calls.

## Contract and invariants

The implementation will add one thin observation contract with these fields:

`observationId`, `metricKey`, `observationClass`, `value`, `qualifier`, `unit`,
`originalValue`, `originalUnit`, `periodStart`, `periodEnd`, `frequency`,
`aggregation`, `geography`, `productOrSegment`, `publishedAt`, `retrievedAt`,
`originPublisher`, `hostPlatform`, `retrievalProvider`, `sourceAuthority`,
`determinismClass`, `sourceCandidateId`, `sourceRef`, `publicationPit`,
`valueVersionPit`, and bounded `metadata`.

`observationClass` is limited to `PRODUCTION`, `TRADE`, and `PRICE`.
Qualifiers are `EXACT`, `LOWER_BOUND`, and `UPPER_BOUND`. Existing
`SourceAuthority` and determinism semantics are reused; no second authority
enum is introduced.

Validation rejects missing unit/period/product scope where required, non-finite
values, unsupported classes, invalid dates, missing source lineage, and
ambiguous aggregation. Numeric zero remains valid and is never treated as
missing. Missing, not reported, not applicable, source unavailable, transport
unavailable, and parser unavailable remain distinct statuses.

IDs are stable over metric, scope, geography, period, aggregation, and source
identity. They never include retrieval time, randomness, array order, or
network order. Conflicting observations are retained with diagnostics; no
winner is selected by authority, recency, or averaging.

Publication PIT uses `publishedAt <= analysisAsOf`; date-only timestamps are
interpreted at Asia/Shanghai end-of-day. A trusted future-published descriptor
is not fetched. `publicationPit=VERIFIED` does not imply a verified numeric
value version, so accepted live observations retain
`valueVersionPit=UNVERIFIED` unless independently proven.

## Source implementation

- NBS parser: locate the exact `房间空气调节器` row, header, and unit in the
  verified annual statistical PDF. Emit 2025 calendar production of `26697.5`
  `万台` only when the expected schema is present; schema drift emits no
  observation.
- MIIT parser: preserve 2026 H1 lithium production wording as
  `value=1240`, `qualifier=LOWER_BOUND`, `unit=GWh`; parse article-period
  average lithium carbonate price and optional hydroxide price only when the
  article explicitly identifies them. `3370亿元` export value must never become
  export volume. HTTP 403 is classified as `HTTP_403_ACCESS_GATE` and fails
  soft without fixture or alternate-source substitution.
- CHEAA parser: read only `当月数量（台）` for the explicit `家用空调器` row;
  cumulative quantity, YoY fields, and dollar amounts are separate fields and
  do not become monthly export volume. Fixture expectations include
  2024-09=`4,039,692` and 2025-07=`5,133,858` 台. Provenance remains CHEAA,
  `S2_PROFESSIONAL`, `EVIDENCE_BACKED_NUMERIC`, with upstream GACC metadata.

Transport is HTTPS-only, allowlisted, redirect/timeout/payload/content-type
bounded, abortable, and canonical-URL based. Every accepted observation points
to the exact `NormalizedResearchSource` and its `sourceCandidateId`.

## Workflow, Skill, report, and application integration

After `IndustryResearchSkill.design()` confirms `targetKind=industry`, the
Workflow invokes the narrow D4 seam with `{target, asOf, now, signal}`. The
result contains `{status, observations, sources, diagnostics}` and is bounded
by at most six operating sources and twelve observations. Sources are deduped
by canonical URL/content hash and are not added to the ordinary acquisition
composition budget.

The Workflow validates and merges D4 evidence before ordinary Wave 1 module
analysis, then exposes additive output fields:
`operatingObservations`, `operatingObservationStatus`, and
`operatingObservationDiagnostics`. D4 evidence is routed primarily to
`market_size_growth`, `supply_demand_analysis`, and synthesis.

The Skill receives a maximum twelve-field projection per observation. The
semantic key is `observation:<observationId>`, not a Knowledge reference. The
model is instructed that observation values, units, qualifiers, periods,
geography, and product scope are code-owned immutable facts. Structured claims
must deterministically match those fields and the source candidate; mismatches
are rejected without model repair. Lower bounds remain runtime/report evidence
when the Knowledge comparator cannot faithfully represent them.

The report adds no new section. Its existing `Key Metrics & Monitoring`
section receives a code-generated deterministic table containing metric/class,
value and qualifier, unit, period, aggregation, product, geography, publisher,
authority, publication date, and PIT status. Unavailable and lower-bound states
remain explicit.

`ResearchService` and application runtime wiring accept an injectable D4 seam
for tests and provide the default D4 implementation in the production runtime.
Tests using fakes must not force network access.

## Verification plan

The implementation will add focused offline coverage for contracts, IDs, PIT,
NBS/MIIT/CHEAA parsing and provenance, conflicts, deduplication, unsupported
targets, fail-soft behavior, Skill routing and numeric immutability, report
determinism, Knowledge boundaries, service wiring, and zero-network default
behavior. It will add
`scripts/acceptance-industry-operating-observations-d4-real.ts`, gated by
`RESEARCHHUB_RUN_REAL_INDUSTRY_OBSERVATIONS=1`; the default run proves
`REAL_D4_OPERATING_OBSERVATIONS_NOT_RUN` and zero network calls.

Real acceptance must execute
`ResearchService -> startIndustryResearch -> Workflow -> D4 -> Skill ->
Gateway -> report`, with no injected numeric observations. Lithium requires
production plus price; household air conditioner requires NBS production plus
CHEAA trade. MIIT 403 is reported as the explicit external blocker
`REAL_MIIT_HTTP_403_ACCESS_GATE`; overall success is emitted only when both
targets pass.

Final validation is:

```text
npm run typecheck
npm test
npm run client:typecheck
npm run client:build
git diff --check
```

The final branch is pushed to
`origin/codex/d4-longhaul-industry-operating-observations` and retained with a
clean worktree for Sol review. `main`, `origin/main`, and the D0 worktree must
remain unchanged.
