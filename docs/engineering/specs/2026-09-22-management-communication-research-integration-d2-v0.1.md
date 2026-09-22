# RHL-D2-003 Management Communication Research Capability Integration v0.1

Status: implementation specification for `codex/d2-003-management-communication-research-integration`

Baseline: `16bcb22ed98c78f590489e633307d34f83f13f0e`

## 1. Decision summary

D2-003 integrates management-communication evidence into the existing
Earnings Review Workflow. Workflow owns orchestration, precedence, date/source
boundaries, deterministic comparison, diagnostics, and report enrichment.
The existing Earnings Review Skill and its expectation methods remain the
semantic and arithmetic boundary. D2-001 remains the acquisition boundary and
D2-002 remains the validated extraction boundary.

The normal application path supplies the existing D2-001 source operations
from the application runtime. Earnings Review invokes D2-001 and D2-002
internally when caller-owned validated inputs are absent and the dependencies
are configured. Missing dependencies or provider failures are fail-soft:
ordinary Earnings Review can still complete, while the management capability
is marked unavailable and its diagnostics are retained.

No Knowledge schema, Knowledge write, new Agent Runtime, Provider/Manager/
Engine abstraction, generic research framework, Planner, or cross-workflow
Skill-to-Skill orchestration is introduced.

## 2. Mandatory capability audit

Each requested capability is classified exactly once against the baseline
checkout.

| Capability | Classification | Definition location | Execution location | Current input/output contract | Current consumer | Missing dependency | D2-003 implementation decision |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `guidance_vs_prior` | EXISTING_EXECUTABLE | `skills/earnings-review/expectations/contracts.ts` (`GuidanceRange`, `PriorGuidanceSelectionInput`, `GuidanceRevisionResult`) | `skills/earnings-review/expectations/guidance.ts` (`selectPriorGuidance`, `buildGuidanceRevisionBridge`); `workflows/earnings-review/expectations-integration.ts` | Validated dated `GuidanceRange[]` plus current guidance IDs; returns deterministic revision deltas and diagnostics | `runEarningsReview` and `enrichEarningsReviewSectionsWithExpectations` | Automatic D2 guidance/outlook projection is not connected to Earnings | Reuse unchanged. Feed validated caller or D2-002 projected guidance only when the caller did not supply guidance. Preserve `GuidanceRange` shape. |
| `guidance_vs_consensus` | EXISTING_EXECUTABLE | `skills/earnings-review/expectations/contracts.ts` (`GuidanceVsConsensusResult`) | `skills/earnings-review/expectations/guidance.ts` (`compareGuidanceVsConsensus`); `workflows/earnings-review/expectations-integration.ts` | Dated guidance plus pre-result `ConsensusSnapshot`; returns bounded relationship, delta, and direction | Earnings report `Management Guidance` section and Earnings telemetry | Automatic D2 guidance is not connected; consensus remains caller/automatic expectation input | Reuse unchanged. Apply existing pre-result and as-of validation; no new consensus semantics. |
| `segment_kpi_delta` | EXISTING_EXECUTABLE | `skills/earnings-review/expectations/contracts.ts` (`SegmentKpiPoint`, `SegmentKpiDeltaInput`, `SegmentKpiDeltaResult`) | `skills/earnings-review/expectations/segment-kpi.ts` (`compareSegmentKpi`); `workflows/earnings-review/expectations-integration.ts` | Current point with optional comparable prior/expectation point; returns arithmetic deltas and directions | Earnings report `Segment Performance` section and Earnings telemetry | D2-002 projected KPIs are not connected to the report | Reuse unchanged. Build only compatible period/metric/unit pairs and retain missing comparisons as diagnostics. |
| `management_commentary_delta` | MISSING | No baseline contract or implementation; D2-002 `ManagementOutlookCandidate` is validated evidence, not a comparison result | None | D2-002 supplies dated topic/metric/direction/horizon/numeric evidence; no prior/current delta contract exists | None | Comparison methodology, compatibility rules, and report wiring | Implement one narrow deterministic Earnings-owned comparison over validated outlook candidates. Compare only compatible topic/metric/time-horizon keys; classify `new`, `unchanged`, `strengthened`, `weakened`, `reversed`, or `inconclusive`. Do not infer numeric deltas when units/periods are incompatible. |
| `qa_question_cluster` | MISSING | D2-002 `StructuredQAEvidence` contains question, answer, tags, spans, and source metadata; no cluster contract exists | None | Validated Q&A evidence with bounded topic tags, claim spans, and explicitly stated metrics | None | Stable cluster identity and deterministic grouping | Implement a deterministic cluster keyed by normalized topic tags plus referenced product/segment, with stable member IDs and source refs. Empty tags fall back to a normalized bounded question key. |
| `qa_response_quality` | MISSING | No baseline contract or implementation | None | D2-002 retains the exact question/answer and evidence spans | None | Bounded qualitative response-quality policy | Implement a fail-closed qualitative assessment: `direct`, `partial`, `non_answer`, or `inconclusive`, with explicit diagnostics and evidence refs. No personality scoring, unsupported truth scoring, or numeric quality score. |
| `management_execution_tracker` | EXISTS_UNWIRED | `skills/management_execution/contracts.ts` | `skills/management_execution/calculations.ts` (`assessManagementExecution`), registered by `app/services/skill-registry.ts` and cataloged by `app/services/research-skill-catalog.ts` | Explicit dated `ManagementCommitment` plus `ManagementOutcome`; deterministic numeric bound assessment; qualitative results remain inconclusive | Registered Company Economics Skill path; not normal Earnings Review | No adapter from D2-002 concrete outlook to commitment/outcome and no Earnings report consumer | Reuse unchanged through a narrow Earnings adapter. Adapt only concrete, attributable numeric outlooks with a valid period/unit and supplied or validated KPI outcomes. Never infer qualitative execution or fabricate an outcome. |

The absent Company Research and Thesis seams are intentionally deferred. The
current Company path accepts `CompanyResearchInput` without a typed management
communication input, and Thesis Lifecycle accepts bounded peer Skill inputs;
neither is widened by this task. D2-003 therefore does not silently add a
second product consumer.

## 3. Precedence and activation

For each management capability, the effective input precedence is:

1. caller-supplied validated management result/input;
2. caller-supplied validated D2-002 extraction;
3. automatic D2-001 acquisition followed by D2-002 extraction;
4. unavailable.

The same precedence applies field-by-field for existing Earnings expectation
fields. Caller-supplied `expectations.guidances` and
`expectations.segmentKpiComparisons` are never overwritten by automatic D2
projections. Automatic management work is skipped when all relevant validated
caller inputs are present. A caller may inject D2-001/D2-002 seams in tests,
but a normal application caller only starts Earnings Review; the application
runtime owns construction of the D2 source operations.

Automatic management acquisition is attempted only when the configured
management source operations exist. It uses the existing D2-001 document and
exchange-Q&A workflows, then the existing D2-002 extraction workflow with the
existing `ReasoningExecutor`. Existing exact-period official Earnings sources
may be supplied to the D2-002 statutory-disclosure lane for formal guidance
extraction; this does not duplicate acquisition.

## 4. Matching and safety rules

### Guidance

Existing `GuidanceRange` validation remains authoritative. Current guidance is
selected only from validated records at or before `analysisAsOf`; when a
current ID is not caller-supplied, the latest unambiguous record per
metric/period/type-compatible surface is selected. Prior guidance uses the
existing strict publication-time rule. The existing range/minimum/maximum/
point/qualitative semantics, unit equality, and source-reference requirements
are frozen.

### Segment KPI

Only points with identical normalized segment key, metric, and unit are
comparable when the prior period is the exact prior fiscal shape under the
Earnings convention: `2026-FY` maps to `2025-FY`, `2026-H1` to `2025-H1`,
`2026-Q1` to `2025-Q1`, and `2026-Q3` to `2025-Q3`. A current point is
retained without `priorComparable` when no exact prior exists, with
`KPI_NO_COMPARABLE_PRIOR` recorded. A same-year different-shape point is not
a comparable prior. No segment identity is invented; unmapped D2-002 KPI
candidates remain diagnostics. The existing `compareSegmentKpi`
implementation owns arithmetic and direction labels after this period guard.

### Commentary

Outlook records match on normalized topic, metric (when present), and
time-horizon. Both candidates must be published at or before `analysisAsOf`.
The latest eligible candidate is current and the latest eligible candidate
before it is prior. A numeric change is calculated only when both records have
compatible canonical units and comparable numeric shape. Direction changes are
ordered only for the explicit pairs `increase`/`improve` and
`decrease`/`deteriorate`; `stable` and `uncertain` do not create a directional
claim. Identical same-direction values are `unchanged`. `strengthened` or
`weakened` requires an explicitly identifiable absolute target-level meaning;
otherwise a different same-direction value is `inconclusive` with
`COMMENTARY_NUMERIC_SEMANTICS_AMBIGUOUS`. Opposite directional pairs are
`reversed`. Incompatible or conflicting records retain source refs and
diagnostics. The prior candidate must have a strictly earlier publication
timestamp than current. Same-timestamp exact semantic duplicates are
deduplicated deterministically; incompatible same-timestamp current
candidates produce `COMMENTARY_CURRENT_CONFLICT` and an `inconclusive` delta.

### Q&A

Q&A clusters use one normalized validated topic tag plus the normalized
question/product identity. A multi-topic Q&A member is included once in each
relevant topic cluster; duplicate topic tags do not create duplicate members.
Explicit product/segment identity remains part of the cluster key, so distinct
products remain separate. With no topic tags, the bounded question fallback is
retained. Each member keeps its D2-002 evidence span and source object ID.
Response quality is qualitative and evidence-local. `direct` requires bounded
coverage evidence: a meaningful normalized question term/phrase appears in
the answer, or an explicitly stated metric appears in both question and
answer. A substantive answer that cannot establish coverage is `partial`; an
explicit refusal, non-answer, or empty answer is `non_answer`; otherwise it is
`inconclusive`. The existence of a management statement span or an
answer-only metric is not sufficient for `direct`. The result never asserts
that management's answer is true.

### Execution

Only explicit numeric outlooks with attributable publication, concrete target
period, canonical unit, and numeric bound/value are adapted to existing
`ManagementCommitment`. Candidate ID/source object ID is preserved as the
source ref and the evidence text is the statement. A commitment source never
serves as its own outcome. Automatic outcomes use validated D2-002
`KpiCandidate` evidence and require compatible metric/period/unit, a later
publication than the commitment, an independent source object, and a
published observation at or after the target end date. SegmentKpiPoint alone
cannot create an automatic outcome. Automatic KPI scope is also required:
`rawSegmentLabel` or `rawProductLabel` must exist and match literally within
the commitment evidence text after normalization. Missing scope produces
`EXECUTION_OUTCOME_SCOPE_UNRESOLVED`; a non-matching scope produces
`EXECUTION_OUTCOME_SCOPE_MISMATCH`. Missing scope is never treated as
company-wide. Caller-supplied outcomes are filtered
before assessment unless they have non-empty independent source refs, a
compatible period/unit, `commitment.publishedAt <= observedAt <= analysisAsOf`,
and an observed date at or after the target end date. Premature outcomes
therefore resolve to `not_yet_observable`; missing later evidence remains
`inconclusive` after the due date. The existing execution Skill determines
`met`, `not_met`, `not_yet_observable`, and `inconclusive`; qualitative targets
remain non-authoritative.

Management commitment target-end timestamps are explicit Asia/Shanghai
end-of-day instants (`T23:59:59.999+08:00`) for Q1, H1, Q3, and FY. Date-only
period boundaries are not passed into execution assessment.

### Consumer-side point-in-time validation

Caller-supplied validated D2-002 extraction is revalidated against the current
Earnings `analysisAsOf` before consumption. One deterministic consumer-side
view excludes every formal-guidance, outlook, KPI, and Q&A candidate whose
`publishedAt` is invalid or later than `analysisAsOf`, with bounded
diagnostics. Projected `SegmentKpiPoint` values have no date of their own and
are retained only when every `sourceCandidateId` is backed by an eligible
`KpiCandidate`; otherwise `KPI_PIT_SOURCE_UNAVAILABLE` is recorded. Guidance
publication dates are rechecked before current-guidance selection. Commentary,
Q&A, execution, segment comparisons, and report enrichment consume only this
filtered view.

Caller-reconstructed source objects preserve the unique underlying validated
publication timestamp as `candidate.publishedAt`. Conflicting timestamps for
one source object ID are not resolved arbitrarily; the source is excluded and
a bounded conflict diagnostic is retained. Synthetic retrieval time is not
used as publication evidence.

## 5. Contracts and report integration

D2-003 adds one narrow management-research result contract under the Earnings
Workflow. It contains:

- management source candidates and acquisition/extraction diagnostics;
- commentary deltas with current/prior candidate IDs and source refs;
- Q&A clusters with members and qualitative response assessments;
- execution result from the existing `assessManagementExecution` method;
- bounded telemetry counts and unavailable/partial status.

It does not alter the D2-001 or D2-002 output contracts, the GuidanceRange,
SegmentKpiPoint, or ConsensusSnapshot shapes, and it does not add Knowledge
objects.

Report enrichment appends to existing sections only:

- `Management Guidance`: existing guidance, guidance-vs-prior, and
  guidance-vs-consensus plus management commentary deltas;
- `Segment Performance`: existing segment KPI comparisons;
- `Changes vs Prior Research`: commentary changes when a prior record exists;
- `Research Gaps / Monitoring`: Q&A cluster/response status and execution
  tracking gaps, without creating a new top-level report section.

Source IDs and evidence links are retained. Missing management evidence is
reported as unavailable/partial and never converted into a positive claim.
Management research is report-only and cannot mutate Knowledge directly.

## 6. Failure semantics and diagnostics

The existing Earnings status remains governed by exact-period official or
structured financial evidence and the existing quality gate. Management
communication acquisition, extraction, comparison, Q&A, and execution errors
are bounded diagnostics. They do not block an otherwise eligible Earnings
Review, except for an internal contract violation or a pre-existing quality
gate failure. Provider calls are never retried by a new generic framework.

Every automatic attempt records whether it was not attempted, available,
partial, unavailable, or failed; extraction failures preserve D2-002
diagnostics. Future-published, ambiguous, duplicate, missing-source, unit-
mismatch, period-mismatch, and unsupported qualitative execution inputs fail
closed.

## 7. Architecture and non-goals

The path is:

`Application Runtime -> ResearchService -> Earnings Review Workflow ->`
`D2-001 acquisition / D2-002 extraction -> Earnings-owned deterministic`
`management comparisons -> existing Earnings report enrichment`.

The Skill boundary remains the existing Earnings semantic synthesis and
existing deterministic Skills. Plugin boundaries remain source/model
capabilities. Workflow owns sequencing and validation. There is no direct
Skill-to-Skill call, no new orchestration runtime, no generic provider layer,
and no Knowledge writer path for management findings.

Company Research and Thesis integration remain explicit future work because
their current typed inputs do not expose a direct management-evidence seam.
Changing that boundary would be DESIGN_DRIFT for D2-003.

## 8. Validation obligations

The implementation must include:

- one offline product-path fixture proving normal Earnings invocation can
  automatically run D2-001/D2-002 when configured, while caller input
  precedence suppresses redundant calls;
- unit tests for all seven audited capabilities, including guidance safety,
  source/date/unit/period matching, Q&A evidence preservation, and execution
  fail-closed behavior;
- telemetry and diagnostic assertions for unavailable, partial, failed, and
  future-filtered paths;
- a gated real harness that is skipped unless explicitly enabled and reports
  provider/model/auth/network state without exposing secrets;
- full repository validation and a clean worktree before delivery.
