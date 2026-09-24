# RHL-TL-001 Thesis Lifecycle Product Closure — Design & Contract Freeze

**Status:** DESIGN_COMPLETE / SOL REVIEW PENDING
**Date:** 2026-09-24
**Mode:** design and source-code audit only; no runtime implementation in this task

This document freezes the smallest product contract for maintaining an existing
canonical Thesis when new accepted, point-in-time-safe evidence arrives. It is
intentionally a product and architecture contract, not a second workflow engine.

## Executive Decision

Implement the maintenance loop as a bounded `REFRESH` product path first, with a
small `CREATE` path sufficient to establish the same canonical shape:

```text
accepted PIT-safe evidence
  -> existing Thesis and proposition Claims
  -> deterministic PriorThesisSnapshot reconstruction
  -> refreshThesis()
  -> proposition deltas and candidate transition
  -> safe additive proposals or Thesis-scoped ReviewCase
  -> current-Knowledge rebind on human decision
  -> Knowledge Production Gateway
  -> validated ChangeSet / Writer
  -> canonical reload and visible report
```

The canonical model remains Knowledge schema v0.4:

* `KnowledgeThesisV04` is the aggregate identity, subject, statement, aggregate
  lifecycle status, and dates.
* Each formalized proposition is a `KnowledgeClaimV04` with a deterministic
  bounded `ClaimTypeV04` mapping.
* A `ReasoningEdgeV04` of type `qualifies`, from proposition Claim to Thesis,
  is the exclusive membership convention. It means “this Claim is a
  constitutive qualification/proposition of this Thesis”; it does not mean the
  Claim supports the Thesis.
* Evidence impact is represented by source/Observation/Claim provenance and
  impact edges to the proposition Claim. `supports`, `challenges`,
  `contradicts`, and conditionally `invalidates` retain their truthful meanings.

No `KnowledgeThesisProposition`, `ThesisPropositionStore`, `ThesisGraphStore`,
new Knowledge database, Agent, Planner, Provider layer, scheduler, event bus, or
generic review platform is designed here.

The source evidence for this decision is the current formalization contract
(`skills/thesis_formalize/contracts.ts:1-105`), refresh contract
(`skills/thesis_refresh/contracts.ts:1-123`), v0.4 domain model
(`knowledge/schema/domain-v04.ts:3-14,66-78,207-232`), production proposal
contract (`knowledge/production/contracts.ts:7-60`), and Gateway behavior
(`knowledge/production/gateway.ts:42-45,62,148-179`).

## Current Runtime Gap

The repository already has the deterministic semantic pieces but not the
product closure:

* `runThesisLifecycle` composes `CREATE`/`REFRESH` skills and currently returns
  `completed|blocked` (`workflows/thesis-lifecycle/contracts.ts:7-32`). It does
  not itself provide a durable application-level lifecycle run, report, or
  Gateway/Writer closure.
* `formalizeThesis()` already accepts the nine proposition types and three
  evidence bases, and returns normalized propositions, dependencies, load-bearing
  refs, diagnostics, and `asOf` (`skills/thesis_formalize/contracts.ts:1-5,18-43,85-105`).
* `refreshThesis()` already provides the required evidence relations, proposition
  statuses, kill assessments, unchanged refs, deltas, and candidate transition
  (`skills/thesis_refresh/contracts.ts:1-8,93-123`).
* The Gateway already writes Thesis, Claim, and ReasoningEdge proposals through
  the governed production path. It rejects a Claim with `claimType: 'thesis'`
  as legacy semantics and requires the Thesis object instead
  (`knowledge/production/gateway.ts:62,148-179`).
* The application currently exposes read-only ReviewCase list/get and bounded
  research starts, including Earnings Review and thesis red-team, but no
  thesis-lifecycle start/report/decision path
  (`app/runtime/server.ts:390-409,492-515`; `app/pi/tools.ts:55,84,103-113`).

The gap is therefore orchestration, durable review decision handling, current
revision rebinding, reporting, and UI/API/Pi exposure—not new thesis semantics.

## Canonical Thesis Model

`KnowledgeThesisV04` owns:

* canonical `thesis:<id>` identity;
* subject entity references;
* title and aggregate statement;
* aggregate status (`active`, `strengthening`, `weakening`, `challenged`,
  `invalidated`, or `archived`);
* creation, review, update, and lifecycle dates.

It does not duplicate a proposition list or proposition text. The current schema
is exactly this shape (`knowledge/schema/domain-v04.ts:207-218`).

An individual proposition is a `KnowledgeClaimV04`. Its statement, mapped claim
type, source references, provenance, temporal fields, confidence/probability
where valid, claim-to-claim relationships, and supersession state live on the
Claim (`knowledge/schema/domain-v04.ts:66-78`).

Proposition refresh status is a derived lifecycle interpretation, not a new
Claim field. The current status is reproducible from the active proposition
Claim, its `qualifies` membership edge, accepted evidence impact edges, and the
latest lifecycle report/decision. This prevents duplicate status truth in both
Claim and a new proposition object. A status-changing accepted decision must
leave enough graph evidence or Claim supersession state for the next refresh to
recompute the same result.

## Canonical Proposition Mapping

The mapping is deterministic and bounded. It is applied before proposal
construction; a model may supply a proposition, but may not choose an arbitrary
canonical type.

| Formal proposition type | `verified_evidence` | `inference` | `hypothesis` |
| --- | --- | --- | --- |
| `business_driver` | `fact` | `viewpoint` | `assumption` |
| `industry_condition` | `fact` | `viewpoint` | `assumption` |
| `competitive_position` | `fact` | `viewpoint` | `assumption` |
| `financial_outcome` | `fact` | `viewpoint` | `assumption` |
| `earnings_expectation` | `forecast` | `forecast` | `forecast` |
| `valuation_expectation` | `forecast` | `forecast` | `forecast` |
| `catalyst` | `catalyst` | `catalyst` | `catalyst` |
| `risk` | `risk` | `risk` | `risk` |
| `other` | `fact` | `viewpoint` | `assumption` |

`trend` is reserved for a proposition whose statement is explicitly a temporal
trend observation; it is not selected solely by the input type. `thesis` is not
selected for propositions because the Gateway rejects legacy Claim-as-Thesis
semantics. A Thesis is always proposed as `kind: 'thesis'`; its propositions are
Claims.

An invalid or missing basis is a blocked formalization, not a model-selected
fallback. A proposition that cannot be mapped without semantic invention is
`DESIGN_DRIFT` for implementation review.

## Proposition Identity

`ThesisPropositionInput.propositionId` is a producer-run-local reference. The
formalization contract explicitly carries `existingKnowledgeRefs`, but the
production contract states that proposal IDs are local proposal keys only
(`skills/thesis_formalize/contracts.ts:18-33,85-93`;
`knowledge/production/contracts.ts:7-10,48-60`).

For `REFRESH`, canonical identity is resolved in this order:

1. Resolve exactly one canonical Thesis by explicit `thesisRef`, subject, and
   title/identity constraints. Zero or multiple matches block.
2. Read active `qualifies` edges targeting that Thesis.
3. Resolve each edge source to an active Claim. The canonical Claim ref becomes
   the refresh-local proposition ref.
4. Match incoming formalized proposition refs to those canonical Claim refs using
   the persisted producer binding plus the deterministic identity tuple:
   mapped claim type, normalized statement, subject refs, temporal fields, and
   valid structured value. The Gateway currently uses this tuple for exact Claim
   identity (`knowledge/production/gateway.ts:42-44`).
5. If exactly one existing Claim is bound, preserve it even when the run ID,
   report ID, retrieval time, or `asOf` changes. If no unique binding exists,
   create a review-required resolution; never allocate a new Claim merely due to
   a new run.

The producer-side convention, when a stable key is needed for a proposal, is:

```text
thesis:<canonical-thesis-ref>:proposition:<bounded-stable-key>
```

It is a local binding hint, not a new canonical namespace. The current top-level
`SemanticProductionProposal.semanticKey` is not sufficient: the Gateway’s Claim
identity and persisted ID allocation do not use it as a universal identity
(`knowledge/production/contracts.ts:57`; `knowledge/production/gateway.ts:42-44,153-159`).
Therefore every refresh proposal must also carry the exact canonical Claim in
`existingKnowledgeRefs` when updating, superseding, or contradicting. An
ambiguous key or a key that disagrees with the current `qualifies` binding is a
ReviewCase, not an automatic rebind.

## Claim Graph

Claim-to-Claim proposition relationships use the native v0.4 arrays:

* `dependsOnClaimRefs` for prerequisite propositions;
* `supportsClaimRefs` for a proposition that supports another Claim;
* `contradictsClaimRefs` for a proposition that logically contradicts another;
* `supersedes`/`supersededBy` for an accepted replacement.

The formalization dependencies map directly from
`dependsOnPropositionRefs`/`supportingPropositionRefs` to these arrays after
canonical refs are bound. No dependency graph is stored as opaque JSON.

Evidence impact is separate from proposition membership. A new Observation or
evidence Claim may create a ReasoningEdge to the proposition Claim:

| Refresh relation | Canonical impact representation |
| --- | --- |
| `supports` | `ReasoningEdge(type: 'supports')` |
| `weakens` | `ReasoningEdge(type: 'challenges')` |
| `contradicts` | `ReasoningEdge(type: 'contradicts')` |
| `context` | source/provenance only unless a truthful qualifying edge exists |
| `irrelevant` | no proposition impact edge |

`weakens` remains the refresh vocabulary; v0.4 has no `weakens` edge, so
`challenges` is the truthful canonical approximation. `invalidates` is reserved
for an objectively met invalidation condition, not ordinary model disagreement.

## Thesis Linkage

The chosen membership convention is:

```text
Claim(proposition) --qualifies--> Thesis
```

`qualifies` means the Claim is a constitutive qualification of the Thesis. It
does not assert that the proposition supports the Thesis. A risk Claim can
therefore qualify a Thesis without being incorrectly marked as supportive.

The Gateway validator already permits a Claim or Observation as a ReasoningEdge
source and a Claim or Thesis as target
(`knowledge/schema/domain-v04.ts:220-232`; `knowledge/production/gateway.ts:177`).
The edge ID is deterministic from edge type, source, and target in the Gateway,
so membership is reconstructable and idempotent.

CREATE emits one Thesis, one Claim per proposition, Claim relationship links,
and one `qualifies` edge per proposition in the same production proposal set.
REFRESH reconstructs membership solely from active `qualifies` edges targeting
the Thesis. A missing edge is a canonical binding gap and blocks; it is not
silently inferred from report text.

No `propositionRefs` field is added to `KnowledgeThesisV04`. v0.4 is sufficient
under this explicit convention. If implementation discovers that the existing
validator/storage cannot persist or reconstruct `qualifies` membership without
repurposing an edge inaccurately, the implementation must stop with
`DESIGN_SCHEMA_GAP` rather than add a hidden parallel store.

## Evidence Contract

Every refresh evidence item has:

* stable run-local `evidenceId`;
* canonical or candidate source refs;
* required publication timestamp;
* refresh relation and target canonical proposition refs;
* statement and, when applicable, metric, period, unit, value, and basis.

This mirrors `RefreshEvidence` (`skills/thesis_refresh/contracts.ts:25-37`).
Evidence is admitted only after source governance and source binding. An
unbound source, missing required provenance, or a source whose rights/policy do
not permit derived Knowledge blocks that item.

Lineage is:

```text
Thesis -> qualifies edge -> proposition Claim
proposition Claim <- impact edge <- Observation or evidence Claim
Observation/evidence Claim <- source/provenance <- Source and raw evidence
```

A report alone never mutates a Thesis. The canonical write contains the Source,
Observation/evidence Claim, impact edge, and any explicitly accepted Claim or
Thesis update through the Gateway.

## PIT Contract

For refresh `currentAsOf = T`, only evidence with `publishedAt <= T` is
eligible. The source’s retrieval time is not publication time. Future evidence
is rejected from the refresh; unknown publication time is not eligible to drive
kill-criterion satisfaction, canonical contradiction, or automatic
supersession.

An unknown publication date may be retained as an inspectable acquisition
diagnostic or a non-decisive source artifact, but it cannot affect
`propositionDeltas`, `candidateTransition`, or a canonical status decision.
Source contracts that prove availability at `T` may provide a separately
validated timestamp; absent that proof, the item remains unavailable.

The PIT filter runs before `refreshThesis()`, is recorded in the report, and is
replayed during ACCEPT. A later Writer call cannot widen the evidence set.

## Refresh State Machine

The application state machine is:

```text
START
  -> RESOLVE_THESIS
  -> RECONSTRUCT_SNAPSHOT
  -> ADMIT_AND_PIT_FILTER_EVIDENCE
  -> RUN_REFRESH
  -> SPLIT_PROPOSALS
       |-- no semantic change ----------------------> COMPLETE
       |-- safe additive evidence only -------------> GATEWAY -> WRITER -> RELOAD -> COMPLETE
       |-- material proposition/thesis change ------> REVIEW_OPEN
       |                                                |-- ACCEPT -> REBIND_CURRENT -> GATEWAY
       |                                                |             -> WRITER -> RELOAD -> COMPLETE
       |                                                |-- REJECT -> RELOAD/REPORT -> COMPLETE
       |                                                |-- DEFER  -> REPORT -> COMPLETED_WITH_REVIEW
       |-- blocked prerequisite ---------------------> BLOCKED
```

`refreshThesis()` remains the only source of refresh semantics. Its outputs
`propositionDeltas`, `unchangedPropositionRefs`, `killCriterionAssessments`, and
`candidateTransition` are preserved verbatim in the lifecycle report
(`skills/thesis_refresh/contracts.ts:93-123`).

The application-level run status is one of `completed`,
`completed_with_review`, `blocked`, `failed`, or `cancelled`. Semantic decision
state is separate: `NO_CHANGE`, `AUTO_APPLIED`, `REVIEW_REQUIRED`, `ACCEPTED`,
`REJECTED`, `DEFERRED`, `STALE`, or `BLOCKED`. An open ReviewCase makes the run
`completed_with_review`; it must not be disguised as ordinary completion.

Automatic canonical writes are limited to source/observation admission,
additive non-disputed evidence, a new non-disputed factual Claim, and
idempotent impact/membership edges when they do not change a load-bearing
proposition or Thesis status. The system never auto-supersedes a load-bearing
Claim merely because a semantic resolver says it is weakened.

## Kill Criterion Semantics

The frozen rule is:

```text
kill criterion status = met
  -> proposition status = invalidation_condition_met
  -> candidate transition = invalidation_condition_met
  -> affected refs, evidence refs, rationale, recommendation, ReviewCase
```

It does not write `KnowledgeThesisV04.status = invalidated`. `inconclusive`,
`not_yet_observable`, and `threshold_pending_evidence` remain non-invalidation
outcomes. The existing `KillCriterionAssessment` fields provide condition,
status, target propositions, evidence refs, and rationale
(`skills/thesis_refresh/contracts.ts:39-50,105-111`).

Only an explicit human ACCEPT of the scoped ReviewCase may commit aggregate
`invalidated`, and that ACCEPT must still pass current-Knowledge validation.

## Automatic vs Human-Owned Actions

| Action | Owner | Rule |
| --- | --- | --- |
| source admission and PIT filtering | system | deterministic, fail closed |
| evidence-to-proposition binding | system | exact or unique bounded match only |
| unchanged preservation | system | preserve every active bound Claim not affected by eligible evidence |
| support/weakening/contradiction classification | system + existing deterministic skill | output only; preserve refresh vocabulary |
| kill calculation | system | condition assessment only |
| new additive source/Observation/evidence Claim | system | only if non-disputed and no status change |
| `qualifies`, support, challenge, or contradiction edge | system | safe when endpoints and semantics are unambiguous; invalidation is review-gated |
| proposition text update | human approval required | ACCEPT must identify current Claim and intended update |
| proposition supersession | human approval required | never automatic for load-bearing Claims |
| Thesis `active`/`strengthening`/`weakening`/`challenged` | human approval required on refresh | system emits recommendation only |
| Thesis `invalidated` | human only | requires met kill condition and ACCEPT |
| Thesis `archived` | human only | explicit archive decision; not a refresh side effect |
| report and diagnostic persistence | system | durable and replay-safe |

CREATE is an explicit user launch and may create the initial active Thesis and
its proposition graph. That is user authorization to create, not automatic
semantic status mutation during REFRESH.

## ReviewCase Trigger Matrix

| Trigger | Review? | Reason |
| --- | --- | --- |
| no eligible new evidence | no | report `NO_CHANGE` |
| exact unchanged proposition with additive evidence | normally no | add evidence/impact edge only |
| unique new non-load-bearing factual Claim | normally no | additive, no Thesis status change |
| existing proposition contradiction | yes | semantic meaning changes |
| existing proposition supersession | yes | identity and historical continuity change |
| load-bearing proposition weakened/challenged | yes | material thesis meaning risk |
| `possible_invalidation` or `invalidation_condition_met` | yes | never automatic invalidation |
| any Thesis status change | yes | aggregate investment-thesis decision |
| ambiguous Thesis/proposition binding | yes, or block if unsafe | no deterministic target |
| proposition no longer active/superseded | yes or block | stale semantic target |
| missing/future/unknown PIT source | no write; diagnostic | evidence is not decision-eligible |
| duplicate equivalent proposal | no new case | idempotent replay |

The current ReviewCase model has only `entity`, `relation`, and `claim` root
proposal kinds (`knowledge/review/contracts.ts:4-10`). The lifecycle uses a
Claim-backed case: the affected proposition Claim is the root, and a minimal
Thesis scope (`thesisRef`, affected proposition refs, candidate transition, and
base revision) is attached to the case context. No generic Thesis root or
generic ReviewDecision engine is introduced.

## Thesis-Scoped ReviewDecision

The decision vocabulary is exactly `ACCEPT`, `REJECT`, or `DEFER`. The client
may submit only `reviewCaseId`, the decision, and an optional bounded note. It
cannot submit Knowledge operations, Claim IDs to write, proposals, patches, or
source refs.

The ReviewCase remains the durable immutable proposal context. A minimal
`ReviewDecision` record is persisted beside it in the existing review storage
boundary:

```text
<knowledge-base>/reviews/runs/<producerRunId>/manifest.yaml
<knowledge-base>/reviews/runs/<producerRunId>/cases/<reviewCaseId>.yaml
<knowledge-base>/reviews/runs/<producerRunId>/decisions/<reviewCaseId>.yaml
```

The new record is not a Knowledge asset and does not create a new store. It
contains `version`, `reviewCaseId`, `producerRunId`, `knowledgeBaseId`,
`decision`, `actor: local_user`, `decisionAt`, the ReviewCase hash/base
revision, current Knowledge revision, terminal outcome, canonical result refs,
and diagnostics. Writes use the existing ReviewCase store’s path safety,
atomic-temp-rename, deterministic replay, and mutation-lock conventions
(`knowledge/review/store.ts:29-70,90-95`).

`ReviewCaseStatus` is currently only `open` and therefore is not overloaded.
The decision record supplies terminal state while preserving the original case;
list/get projections join the decision record and report `open`, `accepted`,
`rejected`, `deferred`, or `stale` as an application view.

## ACCEPT Semantics

ACCEPT is a server-side command, not approval of a stale ChangeSet:

1. Load the immutable ReviewCase and its decision record.
2. Reject if already accepted with a different payload, or return the durable
   prior result for an identical replay.
3. Reload current Knowledge and compare revision, Thesis status, proposition
   Claim lifecycle, `qualifies` edge, supersession, and source eligibility.
4. Reconstruct the current proposition binding and rerun the applicable
   deterministic refresh/proposal builder. Do not trust client-supplied or
   stale proposal payloads.
5. If the case is no longer applicable, persist `STALE_REVIEW_DECISION` with no
   semantic write and require a new refresh.
6. Otherwise create the current proposal set and route it through Gateway,
   validated ChangeSet, and Writer.
7. Reload canonical Knowledge, verify expected Thesis/Claim/edge refs and
   revision, then persist the decision as `applied` with canonical result refs
   and lifecycle report.

ACCEPT may update a proposition Claim, create an accepted replacement with
`supersedes`/`supersededBy`, add an impact edge, or update the Thesis aggregate
status only for the exact reviewed scope. It cannot perform arbitrary graph
mutation.

## REJECT Semantics

REJECT durably records actor, time, bounded note, base revision, and
`rejected` outcome. It closes the semantic decision in the application view but
does not write a proposed Claim, Thesis status, supersession, or impact edge.
The original evidence and report remain inspectable. A later refresh may
produce a new ReviewCase if new eligible evidence changes the assessment.

An identical replay returns `already_resolved` and the stored rejection; a
different decision payload for the same resolved case is a conflict.

## DEFER Semantics

DEFER durably records actor, time, bounded note, base revision, and `deferred`
outcome without canonical semantic mutation. The case remains inspectable and
eligible for later reconsideration, but ACCEPT later must still reload and
rebind current Knowledge. A deferred case cannot be accepted using its stale
proposal bundle.

Repeated identical DEFER is idempotent. A later decision may move a deferred
case to ACCEPT or REJECT only through the current-revision revalidation path;
otherwise it becomes `STALE` and requires a new lifecycle refresh.

## Stale Revision / Replay

Every lifecycle report, ReviewCase, decision, ChangeSet, and Writer attempt
records the Knowledge revision it observed. Any revision mismatch before ACCEPT
causes current-Knowledge rebind; a mismatch that changes the reviewed Thesis,
Claim, membership edge, source eligibility, or case condition returns
`STALE_REVIEW_DECISION` without a semantic write. There is no automatic semantic
rebase.

Replay keys are producer run plus deterministic proposal/case identity and
canonical endpoint identity. Replaying the same run or decision must not create
duplicate Source, Claim, ReasoningEdge, Thesis mutation, ReviewCase, or
ReviewDecision records. The Gateway’s existing deterministic identity and
`bound_existing` behavior are reused (`knowledge/production/gateway.ts:42-45,
148-179`).

## CREATE Product Path

CREATE is a bounded setup path:

1. User selects company/entity and supplies a thesis summary and propositions.
2. `formalizeThesis()` validates and normalizes proposition types, bases,
   dependencies, load-bearing refs, evidence gaps, and `asOf`.
3. The deterministic mapping above produces Claim proposals; the proposal set
   includes one Thesis, Claims, Claim links, sources/evidence, and `qualifies`
   edges.
4. Gateway resolves or creates the entity, validates the proposal graph, creates
   a ChangeSet, Writer commits, and the application reloads canonical refs.
5. The report records the created Thesis and proposition Claim refs, binding
   convention, sources, gaps, and initial status.

Expectation gap, catalyst map, and thesis red-team remain bounded peer skills of
the existing Workflow composition, not new lifecycle engines
(`workflows/thesis-lifecycle/contracts.ts:1-17`).

## REFRESH Product Path

REFRESH is the first implementation priority:

1. User selects an existing canonical Thesis; server resolves the company and
   exact Thesis, never accepts a caller-created `PriorThesisSnapshot`.
2. Server reconstructs the snapshot from active `qualifies` edges and Claims,
   ordered deterministically by canonical ref. Superseded/inactive Claims are
   retained as history but excluded from active proposition matching.
3. Server collects accepted evidence from existing Daily Change Assessment,
   Earnings Review, Event Research, Company Research, or an explicitly accepted
   source lane; no new acquisition layer is introduced.
4. Server admits sources, applies the PIT contract, and binds evidence to
   canonical proposition refs.
5. Server calls `refreshThesis()` with the reconstructed snapshot and eligible
   evidence. Its unchanged refs, deltas, kill assessments, candidate transition,
   and diagnostics are retained.
6. Server splits safe additive actions from review actions using the trigger
   matrix. It persists ReviewCases before returning `completed_with_review`.
7. Safe actions go through Gateway/ChangeSet/Writer/reload. Review actions wait
   for ACCEPT, REJECT, or DEFER as defined above.

`PriorThesisSnapshot` is therefore an internal adapter output, not a caller
contract. Its `propositionId` values are canonical Claim refs in REFRESH, even
though the skill contract leaves them structurally run-local
(`skills/thesis_refresh/contracts.ts:12-23,52-57`).

## Daily Handoff

Daily Change Assessment remains an evidence producer. It hands off only accepted
source/observation evidence, publication timestamps, canonical subject refs,
and its existing run provenance. The lifecycle performs the Thesis binding and
refresh; Daily does not write Thesis state directly and does not rerun every
research workflow.

Daily items with no exact publication time are diagnostics/non-decisive inputs.
Daily evidence that supports or challenges a proposition follows the evidence
relation mapping and trigger matrix.

## Earnings Handoff

Earnings Review remains the exact-period producer and uses its existing
valuation-impact/thesis filtering semantics. The current filter distinguishes
load-bearing `depends_on` and `invalidates` edges
(`workflows/earnings-review/valuation-impact-thesis-filter.ts:35,148`).

The handoff provides the accepted earnings source, observation/claim refs,
period, publication time, and affected Thesis/Claim candidates. The lifecycle
revalidates PIT and canonical binding, maps ordinary weakening to `challenges`,
and escalates load-bearing or contradictory effects to ReviewCase.

## Report Contract

Every lifecycle run produces a durable report containing:

* run ID, mode, application status, semantic decision state, and timestamps;
* requested Thesis/entity and current Knowledge revisions;
* reconstructed before snapshot and canonical proposition Claim refs;
* all evidence candidates, admission results, publication timestamps, PIT
  exclusions, source rights/provenance, and accepted source refs;
* full `refreshThesis()` result: proposition deltas, unchanged refs, kill
  assessments, candidate transition, and diagnostics;
* automatic proposal actions and their Gateway/ChangeSet/Writer outcomes;
* ReviewCase IDs, trigger reasons, decision status, actor/time/note, and stale or
  replay outcome;
* Thesis/proposition state before and after, including canonical refs and
  resulting Knowledge revisions;
* final reload verification and unresolved diagnostics.

The report is operational evidence, not canonical Knowledge. It must be readable
before and after a human decision and survive process restart.

## Application / HTTP / Pi Surface

The future normal ApplicationService path adds bounded contracts analogous to
existing research services (`app/services/contracts.ts:107-150`):

* `startThesisLifecycle({ mode: 'CREATE'|'REFRESH', ... })`;
* `getThesisLifecycleReport(runId)`;
* `listThesisReviewCases(...)` and `getReviewCase(...)`;
* `decideThesisReview({ reviewCaseId, decision, note? })`.

Suggested HTTP surface:

```text
POST /api/thesis-lifecycle/create
POST /api/thesis-lifecycle/refresh
GET  /api/thesis-lifecycle/:runId/report
GET  /api/reviews/:reviewCaseId
POST /api/reviews/:reviewCaseId/decision
```

The decision body is bounded to `reviewCaseId` from the route, `decision`, and
bounded `note`; the server reconstructs all Knowledge operations. The Gateway,
ChangeSet, Writer, and canonical storage are never exposed to the client.

Pi receives normal tools for launch/report/decision under the existing scoped
production/research service boundary. Pi interprets the report and may request
the bounded command; it never mutates Knowledge directly. Existing read-only
ReviewCase tools remain read-only until this decision path exists.

The minimum UI is a Thesis selector, Refresh action, run status, before/after
report, evidence/PIT view, proposition delta view, ReviewCase detail, and
ACCEPT/REJECT/DEFER controls with final canonical result/revision.

## Knowledge Boundary

The Knowledge Production Gateway remains the only canonical write boundary.
The flow is:

```text
Application/Workflow proposal
  -> Gateway resolution and validation
  -> validated ChangeSet
  -> Writer
  -> canonical reload
```

The client, Pi, skills, reports, and semantic model cannot write canonical
objects directly. Review governance state is durable operational state, not
Knowledge. This preserves the existing Gateway behavior for exact Claim
resolution, Thesis object creation/update, ReasoningEdge endpoint validation,
and ReviewCase persistence (`knowledge/production/gateway.ts:148-179`).

## Real E2E Design

The eventual configured-Pi E2E uses an existing company Thesis already present
in the mounted Knowledge Base:

1. Select the Thesis and record its current revision and active `qualifies`
   proposition Claims.
2. Run a live accepted Earnings, Event, or Daily source lane with a real
   publication timestamp at or before the refresh `asOf`.
3. Verify one proposition is unchanged and one is weakened/challenged by the
   deterministic refresh output.
4. Verify a durable Thesis-scoped ReviewCase and `completed_with_review`.
5. ACCEPT through normal HTTP or Pi command using only case ID, decision, and
   note.
6. Verify current-Knowledge rebind, Gateway, validated ChangeSet, Writer,
   reload, expected Claim/edge/Thesis result refs, and lifecycle report.
7. Repeat the same ACCEPT and verify no duplicate mutation.

The negative run DEFERs or REJECTs the same type of case and proves the
canonical Thesis, proposition Claims, edges, and revision are unchanged while
the decision/report is durable.

This is an implementation acceptance design. This docs-only task performs no
live source probe and creates no fixture evidence.

## Failure Matrix

| Failure | Required behavior |
| --- | --- |
| Thesis not found | `blocked`, `THESIS_NOT_FOUND`, no proposals/writes |
| ambiguous Thesis | `blocked`, `THESIS_AMBIGUOUS`, require explicit selection |
| no canonical propositions | `blocked`, `NO_CANONICAL_PROPOSITIONS`; do not invent membership |
| missing source | exclude item, report diagnostic; block if no eligible evidence remains |
| future source | exclude from PIT set, report diagnostic, no semantic write |
| unknown publication time | retain inspectable diagnostic only; no kill/contradiction/supersession |
| stale revision before ACCEPT | `STALE_REVIEW_DECISION`, no semantic write |
| proposition inactive/superseded | rebind fails closed; require new refresh/review |
| proposal already superseded | current rebind detects conflict; no stale write |
| ReviewCase already resolved | identical replay returns stored result; conflicting payload is conflict |
| ReviewCase deferred | no canonical write; later decision must rebind current state |
| duplicate replay | idempotent existing refs/result; no duplicate assets |
| kill criterion inconclusive | no invalidation; report assessment and recommendation only |
| provider unavailable | no fabricated evidence; run blocked or completed with unavailable diagnostics |
| Pi unavailable | HTTP/Application path remains authoritative; no direct fallback mutation |
| Gateway blocked | no Writer call; preserve report and diagnostics |
| Writer rejected | no claimed completion; report ChangeSet/Writer failure and current revision |

## Implementation Scope

The future implementation is limited to:

1. A normal ApplicationService lifecycle start/report path around existing
   Workflow skills and accepted evidence lanes.
2. Canonical Thesis selection and deterministic proposition reconstruction from
   `qualifies` edges.
3. PIT-safe evidence adapter and deterministic `refreshThesis()` invocation.
4. Canonical proposal builder for Claims, impact edges, Thesis updates, and
   bounded supersession.
5. Minimal Thesis scope metadata on Claim-backed ReviewCases, if current
   payload/context cannot carry the refs safely.
6. Adjacent durable `ReviewDecision` persistence in existing review storage.
7. ACCEPT/REJECT/DEFER service commands with revision/replay protection.
8. Gateway → ChangeSet → Writer → reload verification and report persistence.
9. HTTP/UI/Pi surface using existing ApplicationService and scoped Pi patterns.
10. Real configured-Pi E2E and the negative no-mutation decision test.

The implementation must first prove v0.4 `qualifies` persistence and
reconstruction. If that proof fails, stop with `DESIGN_SCHEMA_GAP`; do not
quietly add `propositionRefs` or a parallel store.

## Explicit Non-Goals

This design does not include:

* a generic continuous-research engine, scheduler, or event bus;
* a generic ReviewDecision platform;
* a new Agent runtime, Planner, Provider, or DSH integration;
* a new Knowledge database, proposition store, or Thesis graph store;
* a replacement for `formalizeThesis()` or `refreshThesis()`;
* Prediction objects, outcome acquisition, forecast scoring, Brier score,
  prediction review, or investment performance evaluation;
* portfolio, trading, buy/sell, sizing, rebalance, or order execution;
* direct client/Pi Knowledge mutation or LLM-owned canonical writes;
* report-only canonical mutation or source averaging;
* rerunning all research workflows for every Thesis refresh.

If implementation requires any architecture listed in this section, the result
is `DESIGN_DRIFT` and the implementation stops for architecture review.

## Implementation Acceptance Gate

The design is accepted for implementation only when all of the following are
demonstrated on the real configured-Pi path:

* normal ResearchService/Application lifecycle path;
* canonical Thesis selection and unique proposition reconstruction;
* PIT-safe accepted evidence and source lineage;
* deterministic `refreshThesis()` result with unchanged preservation;
* explicit proposition mapping and Claim/Thesis/edge bindings;
* durable Claim-backed ReviewCase with Thesis scope;
* durable ACCEPT, REJECT, and DEFER decisions;
* ACCEPT current-Knowledge reload/rebind before proposal construction;
* Gateway → validated ChangeSet → Writer → canonical reload;
* no automatic invalidation, archive, load-bearing supersession, or status
  change;
* stale revision rejection and duplicate replay idempotency;
* lifecycle report with before/after, PIT, deltas, decisions, refs, and
  revisions;
* HTTP and normal Pi interaction;
* live accepted evidence E2E with one unchanged and one weakened/challenged
  proposition;
* negative DEFER or REJECT E2E proving no canonical semantic mutation;
* `git diff --check` and `npm run typecheck` passing with no runtime/test/schema
  changes in this design task.

# RHL-TL-001 DESIGN REPORT

Status:
DESIGN_COMPLETE / SOL REVIEW PENDING

Baseline:
- origin/main: `0a0d2b1b50b293b2a8e666a8344e8d073af7fab5`
- starting HEAD: `0a0d2b1b50b293b2a8e666a8344e8d073af7fab5`
- branch: `codex/tl-001-thesis-lifecycle-product-design`
- worktree: `C:\Users\Administrator\Desktop\ResearchHub_Lite_worktrees\TL_001`

Canonical model:
- Knowledge schema changed: no; v0.4 is sufficient with explicit `qualifies` membership edges.
- Thesis role: canonical identity, subject, title, aggregate statement/status, and lifecycle dates.
- proposition canonical type: `KnowledgeClaimV04`.
- proposition identity: active Claim refs reconstructed from deterministic Claim→Thesis `qualifies` edges; local `propositionId` is not identity.
- proposition → thesis linkage: `ReasoningEdgeV04(type: 'qualifies')` from Claim to Thesis.
- dependency linkage: Claim `dependsOnClaimRefs`, `supportsClaimRefs`, `contradictsClaimRefs`; accepted replacements use `supersedes`/`supersededBy`.

Claim mapping:
- business_driver: fact / viewpoint / assumption for verified evidence / inference / hypothesis.
- industry_condition: fact / viewpoint / assumption.
- competitive_position: fact / viewpoint / assumption.
- financial_outcome: fact / viewpoint / assumption.
- earnings_expectation: forecast.
- valuation_expectation: forecast.
- catalyst: catalyst.
- risk: risk.
- other: fact / viewpoint / assumption.

System-owned:
- source admission, PIT filtering, evidence binding, proposition matching, unchanged preservation, refresh classification, kill calculation, candidate transition, canonical proposal binding, stale detection, replay/idempotency, and report persistence.

Human-owned:
- semantic proposition changes, load-bearing weakening/contradiction, supersession, all refresh-driven Thesis status changes, invalidation, and archive.

Thesis statuses:
- active: human approval required for REFRESH status changes; allowed as explicit CREATE result.
- strengthening: human approval required.
- weakening: human approval required.
- challenged: human approval required.
- invalidated: human-only; requires met kill condition and ACCEPT.
- archived: human-only; never a refresh side effect.

Kill criterion:
- met behavior: emit `invalidation_condition_met`, evidence/affected refs/rationale/recommendation, and ReviewCase.
- automatic invalidation: none.
- review required: yes, before Thesis `invalidated` or any proposition supersession.

Review:
- ReviewProposalKind change required: no; use Claim-backed root with minimal Thesis scope metadata.
- decision persistence: adjacent durable `decisions/<reviewCaseId>.yaml` under existing ReviewCase run storage.
- ACCEPT: reload/rebind current Knowledge, rebuild applicable proposals, Gateway → ChangeSet → Writer → reload.
- REJECT: durable rejection, no canonical semantic mutation.
- DEFER: durable deferral, no canonical semantic mutation; later reconsideration rebinds.
- stale revision: `STALE_REVIEW_DECISION`, no stale write.
- replay: identical replay returns durable result; no duplicate canonical assets or decisions.

Prior snapshot:
- reconstruction source: active canonical Claims reached by active Claim→Thesis `qualifies` edges, deterministically ordered.
- caller manual snapshot required: no.

Evidence:
- accepted lanes: Daily Change Assessment, Earnings Review, Event Research, Company Research, and explicitly accepted evidence already admitted by existing source governance.
- PIT: `publishedAt <= currentAsOf`; retrieval time does not substitute.
- unknown publication: diagnostic/non-decisive; cannot drive kill, contradiction, or supersession.
- source lineage: Source/raw evidence → Observation/evidence Claim → impact edge → proposition Claim → `qualifies` edge → Thesis.

Product path:
- CREATE: formalize, map, propose Thesis/Claims/links/qualifies edges, Gateway, Writer, reload.
- REFRESH: reconstruct, admit/PIT-filter, run refresh, split safe/review actions, decide, Gateway, Writer, reload.
- Daily handoff: accepted source/observation evidence and provenance; lifecycle owns Thesis binding.
- Earnings handoff: accepted exact-period evidence and existing load-bearing impact semantics; lifecycle owns final refresh/review.

Interaction:
- launch: Thesis selector plus bounded CREATE/REFRESH ApplicationService, HTTP, and Pi commands.
- report: run status, PIT, before/after snapshot, proposition deltas, unchanged refs, kill assessments, proposals, decisions, and revisions.
- review: inspect Claim-backed Thesis-scoped ReviewCase.
- decision: ACCEPT/REJECT/DEFER with case ID and bounded note only.

Real E2E design:
- existing company Thesis → live accepted Earnings/Event/Daily evidence → unchanged plus weakened/challenged proposition → ReviewCase → ACCEPT → current rebind → Gateway → Writer → reload → report; negative DEFER/REJECT proves no canonical mutation.

Schema sufficiency:
- v0.4 sufficient: yes, if `qualifies` is persisted and reconstructable as defined.
- DESIGN_SCHEMA_GAP: none identified; implementation must stop if the convention cannot be truthfully persisted.

Implementation scope:
- bounded REFRESH-first ApplicationService, deterministic snapshot/PIT/refresh adapter, canonical proposal/review path, adjacent decision persistence, HTTP/Pi/UI surface, reports, replay/stale protections, and real E2E.

Explicit non-goals:
- generic engines/platforms/stores/schedulers, Prediction, portfolio/trading, new Agent/Planner/Provider, direct mutation, and LLM-owned canonical writes.

Acceptance gate:
- all gates in the Implementation Acceptance Gate section, including real accepted-evidence E2E and negative no-mutation decision path.

Files changed:
- `docs/engineering/specs/2026-09-24-thesis-lifecycle-product-closure-v0.1.md` only.

Validation:
- diff check: pending after document creation.
- typecheck: pending after document creation.

Git:
- commit: pending.
- final HEAD: pending.
- remote branch: pending.
- local == remote: pending.
- worktree clean: pending.
- main unchanged: baseline verified before branch creation.
- D0 unchanged: baseline verified before branch creation.

Notes for Sol:
- v0.4 is sufficient only under the explicitly frozen Claim→Thesis `qualifies` membership convention. The current Gateway top-level `semanticKey` is not universal Claim identity. The implementation must fail closed on ambiguous binding and must never auto-invalidate, archive, or supersede a load-bearing proposition.
