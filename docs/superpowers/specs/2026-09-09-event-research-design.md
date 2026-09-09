# Personal Research v1 M3A-3 Event Research v1 Design

Status: approved design; implementation target is `RHL-PERSONAL-RESEARCH-V1-M3A-EVENT-RESEARCH-001`.

## Intent and boundary

Event Research deeply investigates one already selected material event for
exactly one existing canonical Company. It verifies what happened, analyzes
first- and second-order impact against existing Company Knowledge, and may
persist bounded proposals plus an `event_research` ResearchReport.

Daily Intelligence remains responsible for discovering and ranking change.
Event Research does not perform broad discovery, ranking, clustering, or daily
brief synthesis. M3A-4, M3B, Theme, Schema, Gateway, Writer, and provider
framework work remain outside this design.

## Architecture

The vertical is producer-specific and additive:

```text
Pi / HTTP
  -> ResearchService.startEventResearch
  -> Event Research Workflow
  -> exact canonical Company resolution
  -> Event Anchor resolution and deterministic identity
  -> targeted CNINFO / GDELT acquisition
  -> event_evidence_assessment
  -> deterministic verification gate
  -> bounded Existing Knowledge projection
  -> event_research_synthesis
  -> deterministic proposal gate
  -> KnowledgeProductionGateway / validated ChangeSet / Writer
  -> ResearchReport(reportType=event_research)
```

The implementation adds `skills/event-research/` and
`workflows/event-research/`, exactly two reasoning operations, the narrow
`DailySignalStore.getById` bridge, and the application/Pi/HTTP entrypoints.
It does not create an EventResearchManager, EventEngine, EventStore,
ResearchEvent canonical object, generic workflow, provider registry, generic
URL fetcher, new agent, or multi-agent orchestration.

## Input and anchor semantics

`EventResearchInput` contains a safe local `workflowRunId`, a six-digit A-share
symbol, optional Company metadata, an `EventAnchor`, and optional `asOf`.
Anchors are `daily_signal`, bounded manual `article`, bounded `url`, or
`user_event`. Titles, descriptions, article content, URLs, and dates are
strictly validated; future dates and anchors after `asOf` are rejected.

Company resolution uses normalized ticker plus exchange and occurs before any
provider acquisition or reasoning. Missing and ambiguous matches block with
`COMPANY_COVERAGE_NOT_FOUND` and `COMPANY_COVERAGE_AMBIGUOUS` respectively.
No Company is auto-created and Company Deep Research is never invoked.

Daily Signal lookup is exact by `signalId`; a missing signal blocks with
`EVENT_SIGNAL_NOT_FOUND`. The signal remains operational context only and is
never submitted to the Gateway. Manual article and user-event content may
enter bounded reasoning context but cannot independently establish verified
durable facts or create Raw, Source, or Claim objects.

URL anchors are validated absolute HTTP/HTTPS references only. They preserve
anchor metadata and may use an existing compatible acquisition plugin, but do
not authorize arbitrary network fetching or private-network access.

`eventFingerprint` is a deterministic workflow-local hash derived from the
Company and the strongest available anchor identity. `eventDate` is selected
by code from explicit anchor dates, Daily Signal publication time, or the
earliest verified supporting Source. The model cannot invent either value.

## Acquisition and evidence

Only the existing CNINFO Official and GDELT-backed acquisition plugins are
used. Each provider is targeted to the one Company with `limitPerKind <= 6`;
the global normalized source cap is 12. Sources are filtered by
`publishedAt <= asOf`, deduplicated by canonical URL and then content hash,
and optionally narrowed to the bounded event window. Unknown publication
times may provide context but cannot establish strong historical verification.

Provider metadata remains provider/evidence identity. Workflow-local event
roles (`anchor_context`, `verification`, `supporting`, `contradicting`, and
`background`) are not written into Source identity or `retrievedAt`.

Existing Knowledge is projected through
`KnowledgeProductionGateway.projectExistingKnowledge`, then restricted to
Claims whose subject references contain the exact Company root and bounded to
approximately 60 Claims, prioritizing thesis, assumption, risk, catalyst,
viewpoint, trend, and fact.

## Reasoning and deterministic gates

Stage A `event_evidence_assessment` receives only Company identity, bounded
anchor context, dates, exact source candidate IDs, and bounded source
metadata/excerpts. Its strict output contains source verdicts, at most 12
verified fact candidates, and contradictions. All IDs, enums, references,
confidence values, and evidence requirements are validated. One repair attempt
may include only bounded prior output, sanitized diagnostics, and exact
allowlists. Invalid output falls back to `unverified` with no durable
proposals.

Code derives `verificationLevel` as one of `official_verified`,
`corroborated`, `single_source`, `conflicted`, or `unverified`. Only the first
two are `strongVerification`; single-source, conflicted, and unverified runs
complete with a report but zero durable proposals.

Stage B `event_research_synthesis` receives only verified facts, supporting or
contradicting excerpts, bounded Company Knowledge, and exact allowed refs. The
model supplies causal interpretation, direct impact, second-order impact,
assumption impact, thesis impact, risks, catalysts, and research gaps. Code
owns evidence validity, canonical identity, structured numerical equality,
proposal admissibility, and Gateway authority.

At strong verification with an available event date, code may create exactly
one event-occurrence fact using the stable structured metric
`event_occurrence_<eventFingerprint>` and the event date period, without a
semantic key. Repeated research binds the same existing Claim slot. Durable
viewpoint, risk, and catalyst proposals are bounded to one each and require
supporting evidence. Assumption updates require an exact existing structured
assumption reference and preserve metric, unit, period, and comparator while
changing only the value. Thesis impact is report-level and cannot mutate
thesis Claims. Local event refs are stripped before Gateway submission;
evidence is proposal-referenced-only; zero durable proposals produce zero
event Sources and Claims.

The report has exactly 16 sections and distinguishes verified facts,
interpretation, direct impact, second-order impact, affected assumptions,
affected thesis, catalysts, risks, and open research questions. Top-level
references are canonical; Daily Signal references and URL/article evidence
links remain explicit anchor metadata.

## Runtime and telemetry

`ResearchService.startEventResearch` registers `workflowType:
event_research`, preserves cancellation, and delegates to the workflow. Pi
`research_event` and the HTTP event product action use the same service path.
Runtime composition reuses existing acquisition plugins and does not alter
Daily Intelligence discovery or scheduling.

Telemetry distinguishes reasoning `called`, `validated`, and `applied`, and
records anchor resolution, acquisition bounds, verification, Stage A/B repair
and fallback state, impact counts, proposal narrowing, and canonical deltas.
Provider transport success is recorded separately from usable verification
evidence.

## Validation and evidence

Focused executable tests cover the task's E1-E88 requirements, including
Company and Signal blocking, anchor security, date and source bounds,
assessment validation/repair/fallback, verification levels, deterministic
fingerprint/date and Claim slots, Knowledge projection, impact/proposal gates,
report provenance, routing, cancellation, and regressions for Company,
Daily, Earnings, Valuation, and Raw Document workflows.

The Real Pi gate uses the actual `PiReasoningExecutor` and current production
model with deterministic provider fixtures, a fresh Schema 0.4 / Storage 1
Knowledge Base, one seeded Daily Signal, one official disclosure, one
supporting/context article, and one irrelevant source. It must prove
`EXECUTED / PASS GATE` with exit 0 and no canonicalization of the irrelevant
source. Provider smoke is separate and non-blocking. Evidence includes the
summary, Real Pi result, provider smoke result, and row-level executable test
matrix.
