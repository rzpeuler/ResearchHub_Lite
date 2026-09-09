# Personal Research v1 — Event Research Architecture v0.1

Status: `FIX-001 IMPLEMENTED / CTO ACCEPTANCE PENDING`

Task identity: `RHL-PERSONAL-RESEARCH-V1-M3A-EVENT-RESEARCH-001-FIX-001` (M3A-3)

This document records the implemented Event Research vertical on the frozen
Personal Research v1 Research Coverage architecture. It is additive to the
existing Workflow / Skill / Plugin / Knowledge boundaries and does not amend
the frozen Application Runtime/Client, Knowledge Schema, Gateway, Writer, or
provider architecture.

## 1. Intent and boundary

Event Research investigates one already selected, material event for exactly
one existing canonical A-share Company. It verifies what happened, projects a
bounded slice of Existing Knowledge, explains first- and second-order impact,
and may submit bounded proposals plus an `event_research` ResearchReport.

Daily Intelligence discovers, deduplicates, ranks, and briefs change. Event
Research consumes one selected signal or explicitly bounded user anchor; it
does not perform broad discovery, ranking, clustering, daily-brief synthesis,
watchlist expansion, or signal mutation. M3A-4 Thesis Red Team, M3B Industry
Research, Theme, Schema, Gateway/Writer redesign, frontend Review Inbox, and
generic provider/framework work are outside this vertical.

## 2. Product path and ownership

```text
Pi research_event / HTTP event action
  -> ResearchService.startEventResearch
  -> Event Research Workflow
  -> exact canonical Company resolution
  -> Event Anchor resolution and deterministic identity
  -> targeted CNINFO / GDELT acquisition
  -> event_evidence_assessment (Stage A)
  -> deterministic verification gate
  -> bounded Existing Knowledge projection
  -> event_research_synthesis (Stage B)
  -> deterministic proposal gate
  -> KnowledgeProductionGateway / validated ChangeSet / Writer
  -> ResearchReport(reportType=event_research)
```

- Workflow owns ordering, cancellation, point-in-time filtering, source caps,
  verification, identity, arithmetic/structured values, proposal admissibility,
  Gateway entry, and terminal status.
- Skill owns bounded semantic prompts, strict Stage A/B parsing, one-repair
  behavior, impact vocabulary, and semantic proposal shaping.
- Plugin owns the existing concrete CNINFO Official and GDELT acquisition
  capabilities. No generic URL fetcher or Provider Registry is introduced.
- Knowledge remains the canonical integrity authority. Only the existing
  Gateway -> ChangeSet -> Validation -> Writer path may mutate canonical data.
- `ReasoningExecutor` remains the Workflow semantic-operation boundary and
  deterministic test seam; Pi-specific reasoning remains under the existing
  Plugin/Pi integration.

## 3. Input and anchor contract

`EventResearchInput` contains a safe local `workflowRunId`, one six-digit
A-share symbol, optional display metadata, one `EventAnchor`, optional `asOf`,
and the existing mounted Knowledge Base, acquisition, signal-store, report,
reasoning, clock, and cancellation dependencies.

The four anchors are:

| Anchor | Resolution | Durable authority |
| --- | --- | --- |
| `daily_signal` | exact `signalId` lookup through `getById` | operational context only; never Gateway-submitted |
| `article` | bounded user-supplied article metadata/content and safe URL | context only; cannot establish a durable fact alone |
| `url` | bounded URL metadata | context only; no arbitrary fetch authorization |
| `user_event` | bounded title/description and optional date | context only; cannot create Raw, Source, or Claim alone |

Titles, descriptions, article content, URLs, IDs, and dates are normalized and
bounded before use. Future or malformed dates and anchors after `asOf` block.
Company resolution is normalized `(exchange, ticker)` matching against the
mounted canonical Knowledge Base and occurs before provider acquisition or
reasoning. Zero matches block with `COMPANY_COVERAGE_NOT_FOUND`; multiple hard
matches block with `COMPANY_COVERAGE_AMBIGUOUS`. No Company is auto-created and
Company Deep Research is never invoked.

## 4. Daily bridge and anchor identity

The only Daily Intelligence bridge is `DailySignalStore.getById(signalId)`.
The existing append/list behavior is preserved. The resolved signal must exist,
contain the exact Company symbol, and have valid stored timestamp fields and
safe source/content references. `publishedAt` is the only signal date eligible
for event-date derivation; `discoveredAt` is never substituted as event time.

The signal remains non-canonical operational context. Its metadata may be
shown in the report anchor and supplied in bounded semantic context, but it is
not submitted to the Gateway as evidence or a canonical mutation.

For article/URL anchors, the canonicalized URL is retained as explicit anchor
metadata. For user events, normalized title, description, and date form the
bounded identity context. `eventFingerprint` is a deterministic workflow-local
hash of the exact Company identity plus event identity. For a Daily Signal, a
non-empty `clusterKey` is authoritative; otherwise normalized title plus
authoritative event/published date is used. `signalId` is operational
provenance only and is never part of durable event identity. The model cannot
invent or alter it.

`eventDate` is selected by code, in order: explicit valid anchor date,
Daily Signal `publishedAt`, or the earliest valid supporting Source publication
date. It is not model-owned. Calendar-only user events compare by day; timestamp
anchors use full point-in-time comparison. If no authoritative date exists,
the report may complete with `EVENT_DATE_UNAVAILABLE`, but strong verification
cannot create the deterministic event-occurrence Claim.

## 5. URL security

Only absolute `http`/`https` URLs are accepted. The validator rejects malformed,
overlong, credential-bearing, non-default-port, localhost, loopback, link-local,
private/reserved IPv4/IPv6, `.local`/`.internal`, and equivalent unsafe targets.
Fragments are removed for identity. URL anchors do not authorize arbitrary
network fetching: acquisition still occurs only through the selected existing
CNINFO/GDELT plugin and its bounded candidate interface. Unsafe candidate URLs
are discarded before `fetch`; no provider fetch is invoked for them.

## 6. Acquisition, bounds, and evidence

Only provider plugins identified as CNINFO Official or GDELT are eligible.
Each provider receives the one resolved Company and `limitPerKind <= 6`; the
normalized global source cap is 12. Candidates are filtered by `publishedAt <=
asOf` when known, narrowed to the configured event window (default 7 days,
maximum 30), and deduplicated first by canonical URL and then by content hash.
Unknown publication time can remain contextual but cannot establish strong
historical verification. Provider transport success, fetch success, and
usable normalized evidence are recorded separately; empty usable output is
not reported as a transport failure.

Workflow-local roles are `anchor_context`, `verification`, `supporting`,
`contradicting`, and `background`. These roles are audit metadata only. They
must not be written into Source identity or used to rewrite `retrievedAt`.
Provider metadata remains provider/evidence identity. Existing Knowledge is
projected through `KnowledgeProductionGateway.projectExistingKnowledge`, then
restricted to Claims whose subject references contain the exact Company root,
bounded to approximately 60 Claims, and prioritized across thesis, assumption,
risk, catalyst, viewpoint, trend, and fact.

## 7. Stage A — evidence assessment

`event_evidence_assessment` receives only Company identity, bounded anchor
context, authoritative dates, exact source candidate IDs, and bounded source
metadata/excerpts (no raw bodies or unrestricted URLs). Its strict output has
source verdicts, at most 12 verified fact candidates, and contradictions. All
IDs, enums, reference sets, confidence values, evidence requirements, and
structured values are validated against the supplied allowlists.

One repair request is permitted. It contains only bounded prior output,
sanitized validator diagnostics, the original allowlists, and the same bounded
context. Invalid first output and invalid repair output fail closed to an
`unverified` assessment with no durable proposals.

## 8. Verification gate

Code derives exactly one verification level:

- `official_verified`: a usable official CNINFO source supports the event;
- `corroborated`: independent usable supporting sources corroborate it;
- `single_source`: only one non-official/insufficient source supports it;
- `conflicted`: supporting and contradicting evidence coexist;
- `unverified`: no valid supporting evidence or the assessment fell back.

Only `official_verified` and `corroborated` are `strongVerification`. A strong
run still requires deterministic supporting source IDs and an available
authoritative event date before creating the event-occurrence fact. Weak,
conflicted, and unverified runs may produce a report and audit telemetry, but
complete with zero durable proposals, zero canonical Sources, and zero Claims.

## 9. Stage B — impact synthesis

`event_research_synthesis` receives only verified facts, supporting and
contradicting bounded excerpts, bounded Company-only Knowledge, exact local
reference allowlists, and deterministic event identity/date. The model returns
bounded interpretations, explicit impact assessments, and local proposals;
code assembles the exact sixteen-section report. Assessments carry explicit
impact type, basis, direction, materiality, horizon, existing-claim refs,
source refs, rationale, and causal chain. Second-order assessments require a
non-empty causal chain; hypothesis-only output is report-only.

Code remains authoritative for evidence validity, canonical identity, numeric
equality, structured periods/units/comparators, proposal admissibility, and
Gateway authority. A second one-repair limit applies; invalid synthesis falls
back to safe report sections with no unauthorized proposal/reference.

## 10. Deterministic proposal gate and persistence

The local gate bounds durable viewpoint, risk, and catalyst proposals to at
most one each and requires supporting evidence plus a valid assessment. An
assumption update requires an exact existing structured assumption Claim and
preserves its metric, unit, period, and comparator while changing only the
value. Thesis impact is report-level and cannot mutate thesis Claims.

At strong verification with an authoritative date, code may add exactly one
event-occurrence fact using the stable structured metric
`event_occurrence_<eventFingerprint>` and the event-date period, without a
semantic key. Replays bind the same existing Claim slot. Local proposal,
assessment, and source IDs are stripped before Gateway submission; dependencies
are accepted-only; evidence is proposal-referenced-only. Zero accepted
proposals means zero canonical event Sources/Claims. Gateway `failed` and
`blocked` outcomes remain distinct Workflow terminal states.

## 11. Report contract

The report is `reportType: event_research`, subject-scoped to the canonical
Company, and has exactly these sections:

1. Event Definition
2. Verification Status
3. Source & Evidence Map
4. Verified Facts
5. Conflicting / Unverified Claims
6. Existing Research Context
7. First-Order Impact
8. Second-Order Impact
9. Business / Industry Transmission
10. Financial / Operating Implications
11. Assumption Impact
12. Thesis Impact
13. Catalyst Changes
14. Risk Changes
15. Valuation / Monitoring Implications
16. Open Questions / Research Gaps

Top-level references are canonical `source:` and `claim:` refs returned by the
Gateway. Section provenance is narrowed to the refs that support that section.
Daily Signal refs and article/URL links remain explicit anchor metadata and do
not become synthetic canonical refs.

The report is assembled by Workflow and persisted through the existing
`ResearchService.startEventResearch` -> `WorkflowService` -> report-writer
path. Canonical event occurrence and stable viewpoint/risk/catalyst slots are
code-owned; a missing authoritative event date is report-only and cannot
create an occurrence slot.

## 12. Fallback, cancellation, and telemetry

Missing/ambiguous Company, missing/mismatched signal, unsafe anchor, invalid
date, or future `asOf` block before the dependent stage. Reasoning errors use
sanitized diagnostics and one bounded repair; persistent invalid output falls
back without durable mutation. Cancellation is checked before acquisition,
before Gateway submission, and before report construction. If cancellation
arrives after evidence/semantic work but before Gateway, the result retains
bounded audit context and commits nothing.

Telemetry records anchor/company resolution, fingerprint/date, provider bounds,
transport/fetch/usable outcomes, filtering/deduplication, source roles,
Stage A/B `called`/`validated`/`applied`, repair and fallback state,
verification level, Knowledge projection size, proposal narrowing, canonical
deltas, and the current report-persistence contract state.

## 13. Entrypoints

The authoritative product route is the Event Research action exposed through
the shared `ResearchService.startEventResearch` path and Pi `research_event`
tool. HTTP and Pi must pass the same bounded input to the same Workflow and
preserve Workflow cancellation/status. Exact route spelling and DTO details
remain application-level contracts documented by the existing runtime
architecture; no alternate event manager, RPC subprocess, browser filesystem
access, or direct canonical write is permitted.

## 14. Validation and evidence

Focused executable coverage currently spans E1–E86 in the Event Research
Workflow/Skill tests: exact Company and Daily Signal blocking, anchor/date and
URL security, CNINFO/GDELT caps and point-in-time filtering, deduplication,
provider outcome separation, bounded Stage A/B context, source roles,
verification levels, deterministic fingerprint/date and Claim slots, replay,
proposal/evidence gates, report shape, cancellation, and regressions. E87–E88
are reserved for the validation-owned Real Pi gate and provider/evidence
closure; they are not claimed as focused test PASS rows unless an executable
run proves them.

Task 5 evidence assets are:

- `RHL_M3A_EVENT_RESEARCH_V1_SUMMARY.md` — scope, commands, outcomes, and risks;
- `RHL_M3A_EVENT_RESEARCH_V1.json` — sanitized aggregate evidence;
- `RHL_M3A_EVENT_RESEARCH_V1_PI_E2E.json` — harness-generated Real Pi gate;
- `RHL_M3A_EVENT_RESEARCH_V1_PROVIDER_SMOKE.json` — separate non-blocking live smoke;
- `RHL_M3A_EVENT_RESEARCH_V1_TEST_MATRIX.json` — row-level executable matrix.

The Real Pi harness uses the actual `PiReasoningExecutor`, current selected
production model, a fresh Schema 0.4 / Storage 1 Knowledge Base, one seeded
Daily Signal, one official disclosure, one supporting/context article, and one
irrelevant source. It must report `EXECUTED / PASS GATE` only when all semantic,
verification, canonical-delta, no-irrelevant-source, and report-persistence
conditions pass. If the current report contract or model/provider environment
prevents that, it records `REAL_MODEL_CONTRACT_BLOCKED` or
`NOT_EXECUTED/BLOCKED` with the sanitized reason and exits non-zero. Provider
smoke is informational and never upgrades product acceptance.

## 15. Acceptance state and non-claims

Engineering implementation is recorded as `IMPLEMENTED / CTO ACCEPTANCE
PENDING`; it is not M3A-3 closure. CTO acceptance still requires independent
review of the complete branch, confirmation that the report contract is
closed, review of the generated evidence, and confirmation that no protected
or excluded source files changed. M3A-4 remains not started, M3B remains
architecture-required, and Theme remains deferred.
