# Structured Management Communication Extraction v0.1 (D2-002)

Status: IMPLEMENTED / SOL ACCEPTANCE PENDING
Task: `RHL-D2-002-DESIGN`
Baseline: `origin/main = 286dd6ff8deafae4318bfb7103934d5adb0ff2e2`
Target branch: `codex/d2-002-structured-management-communication-extraction`

## 1. Purpose and design-only boundary

D2-002 converts already-acquired, point-in-time-safe evidence into bounded
structured research inputs. It does not acquire external data, make an
investment conclusion, mutate Knowledge, or wire a downstream research
consumer.

The semantic output families are:

1. Formal Guidance;
2. Management Outlook;
3. KPI Candidate;
4. Structured Q&A Evidence.

These families do not have a common source authority. The source lane is part
of the contract and cannot be inferred away after extraction.

The original design-only gate authorized only this specification and was
recorded by design commit `902b7d5`. The implementation described by the
current task now follows that approved boundary: runtime code and focused
tests may be added, but no acquisition, Knowledge, API, UI, or downstream
consumer behavior may change. D2-003 may later consume the independently
testable structured result.

During implementation, this specification is the controlling D2-002 contract.
The model emits only raw extraction fields. Workflow code owns inherited
metadata, validation, canonicalization, candidate identity, and projection.

### 1.1 Exact statutory source binding

Formal Guidance consumes the existing
`NormalizedResearchSource` type from
`plugins/research-acquisition/contracts.ts`. Its required source fields are:

- `candidate.candidateId`: stable source identity and downstream source
  binding;
- `candidate.kind`: must be `official_disclosure` for the statutory lane;
- `candidate.tier`: the existing official-disclosure path uses tier `1`;
- `candidate.publishedAt`: source publication time;
- `content`: the exact text supplied to the reasoning request and span
  validator;
- `retrievedAt`, `contentHash`, `title`, `publisher`, and `rights`: existing
  acquisition/provenance and processing metadata.

`NormalizedResearchSource` does not contain a separate `authority` property.
For D2-002, the narrow statutory adapter derives the code-owned
`S0_STATUTORY` authority only from the existing `official_disclosure` + tier 1
source contract and preserves `candidate.candidateId` as the source binding.
CNINFO hosting alone is not sufficient. Lane A continues to use the D2-001
`ManagementCommunicationDocument` and `ExchangeQAPair` contracts, whose
`CommunicationProvenance` carries their management/interaction authority.

## 2. Source lanes and authority

### 2.1 Lane A: Management Communication

Lane A consumes the D2-001 inputs:

- `ManagementCommunicationDocument`;
- `ExchangeQAPair`.

`ManagementCommunicationDocument` carries the acquired document `id`, content,
published timestamp, and D2-001 `CommunicationProvenance`. `ExchangeQAPair`
retains its pair `id`, question, answer, platform, published timestamp, and
provenance. The question and answer are one attributable evidence item.

Lane A may produce:

- `ManagementOutlookCandidate`;
- `KpiCandidate`;
- `StructuredQAEvidence`.

It may not produce `FormalGuidanceCandidate` or an authoritative
`GuidanceRange`. In particular:

```text
ManagementCommunicationDocument != Formal Guidance source
```

This remains true for CNINFO official IR, company IR, roadshows, analyst
meetings, and exchange Q&A. A statement such as “demand should improve in the
second half,” “capacity is planned to reach ...,” or “we aim to achieve mass
production in Q4” is management outlook unless a future separately governed
rule changes the source authority.

Exchange Q&A may be batched for execution efficiency, but each extracted fact
must retain the originating pair ID. Batching never creates a combined,
unattributable statement.

### 2.2 Lane B: Statutory Disclosure

Lane B reuses the existing official statutory-disclosure acquisition path. Its
conceptual input is an existing `NormalizedResearchSource` or equivalent
official-disclosure document object with all of the following:

- `kind = official_disclosure` or the equivalent existing statutory source
  classification;
- company attribution;
- valid `publishedAt`;
- point-in-time eligibility for the requested `analysisAsOf`;
- source content and stable source identity.

The source must retain the existing statutory authority designation
(`S0_STATUTORY`, or its equivalent in the mounted source contract). A source
does not become statutory merely because it is hosted by CNINFO or contains a
formal-sounding statement.

Only Lane B may produce `FormalGuidanceCandidate`, which may project to the
existing `GuidanceRange` only after deterministic validation. D2-002 adds no
announcement crawler and does not change the existing statutory acquisition
path.

Lane B may also yield explicit KPI candidates when a statutory source contains
an attributable numeric operating fact. That does not change its special
authority for Formal Guidance, and no candidate may exceed the authority of
its source.

### 2.3 Authority and point-in-time invariants

Each candidate inherits source provenance. The extraction result must retain
the source authority/disclosure class or an immutable source reference that
resolves to them. The invariant is:

```text
output authority <= source authority
candidate.publishedAt = source.publishedAt
candidate.publishedAt <= analysisAsOf
```

Extraction cannot upgrade an S1 management statement to S0 statutory
guidance. It also cannot create a new information time: the model may not
invent or infer `publishedAt`. A future source reaching the extractor is a
validation failure, not a candidate with a later effective date.

## 3. Raw extraction and validated candidate contracts

The model output is separate from the validated candidate. Raw model output
does not contain authoritative `candidateId`, `publishedAt`, source
authority, extraction version, reasoning operation, canonical fiscal periods,
canonical units, canonical segment keys, or canonical numeric values.

```text
RawExtractionOutput
        -> schema validation
        -> semantic/source/PIT/numeric validation
        -> code-owned ValidatedCandidate
```

The raw contract uses the exact source text supplied to the executor. It
supports incompleteness where the source omits a period, unit, segment, or
numeric endpoint.

```ts
interface RawEvidenceLocator {
  sourceObjectId: string
  startOffset?: number
  endOffset?: number
  exactText?: string
}

interface RawFormalGuidanceCandidate {
  metric: string
  rawFiscalPeriodText?: string
  guidanceType: 'range' | 'minimum' | 'maximum' | 'point' | 'qualitative'
  rawLow?: string
  rawHigh?: string
  rawPoint?: string
  rawUnit?: string
  qualifiers: readonly string[]
  evidence: RawEvidenceLocator
}

interface RawManagementOutlookCandidate {
  topic: string
  metric?: string
  direction?: 'increase' | 'decrease' | 'stable' | 'improve' | 'deteriorate' | 'uncertain'
  rawTimeHorizon?: string
  rawNumericValue?: string
  rawNumericRange?: string
  rawUnit?: string
  rawFiscalPeriodText?: string
  evidence: RawEvidenceLocator
}

interface RawKpiCandidate {
  rawSegmentLabel?: string
  rawProductLabel?: string
  metric: string
  rawFiscalPeriodText?: string
  rawValue: string
  rawUnit?: string
  evidence: RawEvidenceLocator
}

interface RawStructuredQAEvidence {
  pairId: string
  topicTags: readonly string[]
  claimSpans: readonly RawEvidenceLocator[]
  managementStatementSpans: readonly RawEvidenceLocator[]
  rawReferencedProductOrSegment?: string
  explicitlyStatedMetrics: readonly string[]
}
```

For Q&A, `pairId` must be one of the explicitly supplied pair IDs. The raw
model does not echo the authoritative question, answer, platform, or
publication time; Workflow code copies those fields from the original pair.

Validated candidates are code-owned structures. Their shared metadata is:

```ts
interface EvidenceSpan {
  sourceObjectId: string
  startOffset: number
  endOffset: number
  exactText?: string
}

interface ValidatedCandidateMetadata {
  candidateId: string
  sourceObjectId: string
  publishedAt: string
  sourceAuthority: string
  extractionContractVersion: 'management-communication-extraction-v0.1'
  reasoningOperation: 'management_communication_extract'
  evidenceSpan: EvidenceSpan
}
```

### 3.1 Validated FormalGuidanceCandidate

```ts
interface FormalGuidanceCandidate extends ValidatedCandidateMetadata {
  metric: string
  fiscalPeriod: string
  guidanceType: 'range' | 'minimum' | 'maximum' | 'point' | 'qualitative'
  rawLow?: string
  rawHigh?: string
  rawPoint?: string
  rawUnit?: string
  qualifiers: readonly string[]
}
```

This candidate is valid only for Lane B statutory disclosure. It is still an
intermediate extraction result and cannot be consumed by Earnings comparison
code until projection to the existing contract succeeds.

### 3.2 Validated ManagementOutlookCandidate

```ts
interface ManagementOutlookCandidate extends ValidatedCandidateMetadata {
  topic: string
  metric?: string
  direction?: 'increase' | 'decrease' | 'stable' | 'improve' | 'deteriorate' | 'uncertain'
  timeHorizon?: string
  rawNumericValue?: string
  rawNumericRange?: string
  rawUnit?: string
}
```

`ManagementOutlookCandidate` is intentionally not structurally equivalent to
`GuidanceRange` and must never automatically project to it.

### 3.3 Validated KpiCandidate

```ts
interface KpiCandidate extends ValidatedCandidateMetadata {
  rawSegmentLabel?: string
  rawProductLabel?: string
  metric: string
  fiscalPeriod?: string
  rawValue: string
  rawUnit?: string
}
```

The generic candidate covers explicit operating facts without creating dozens
of fixed KPI fields. A candidate with ambiguous identity, period, unit, or
value remains diagnostic-bearing and unprojected.

### 3.4 Validated StructuredQAEvidence

```ts
interface StructuredQAEvidence extends ValidatedCandidateMetadata {
  pairId: string
  question: string
  answer: string
  platform: 'SZSE_HUDONGYI' | 'SSE_EINTERACTION'
  topicTags: readonly string[]
  claimSpans: readonly EvidenceSpan[]
  managementStatementSpans: readonly EvidenceSpan[]
  referencedProductOrSegment?: string
  explicitlyStatedMetrics: readonly string[]
}
```

`pairId` is the D2-001 `ExchangeQAPair.id`. The question, answer, platform,
and publication time are copied from the acquired pair. D2-002 does not
calculate response quality, management credibility, evasiveness, or a
bullish/bearish rating.

## 4. Existing final contracts remain authoritative

D2-002 introduces no parallel final numeric schema. The existing contracts
remain authoritative:

- `GuidanceRange` from `skills/earnings-review/expectations/contracts.ts`;
- `SegmentKpiPoint` from the same existing expectations contract.

The only permitted path is:

```text
LLM extraction candidate
        -> deterministic validation
        -> existing downstream contract
```

The model output is never treated as a final Earnings input. Projection must
carry the validated source binding in `sourceCandidateIds` and must not invent
a segment, period, value, unit, or source identity to satisfy the final
contract.

### 4.1 Guidance projection

Only a validated `FormalGuidanceCandidate` from a point-in-time eligible
statutory source may project to `GuidanceRange`. The projection provides:

- deterministic `guidanceId` derived from the candidate identity;
- `metric` and an explicitly resolved `fiscalPeriod`;
- `guidanceType`;
- exact inherited `publishedAt`;
- source candidate IDs;
- qualifiers;
- numeric `low`, `high`, `midpoint`, and `unit` when the guidance type is
  numeric.

`midpoint` is calculated in code from validated canonical endpoints. It is not
returned by the model and is not inferred for a minimum, maximum, or
qualitative statement. A qualitative candidate remains an extraction result
unless an existing downstream contract explicitly supports the qualitative
shape; D2-002 does not add that support.

### 4.2 KPI projection

A validated `KpiCandidate` may project to `SegmentKpiPoint` only when all of
these are known and deterministic:

```text
segmentKey + metric + fiscalPeriod + canonical value + canonical unit
+ sourceCandidateIds
```

If segment identity is absent, no placeholder segment is invented. The
candidate remains independently inspectable and unprojected.

## 5. One-pass reasoning design

### 5.1 Existing reasoning boundary

The implementation reuses the existing `ReasoningExecutor` and adds
one narrow operation to the existing closed operation catalog:

```text
management_communication_extract
```

No `ExtractionEngine`, `LLMManager`, `SemanticProvider`, new Agent, Planner,
generic provider abstraction, or generic document framework is permitted.

### 5.2 Request shape and batching

There is one bounded semantic extraction request per document or bounded source
batch. A Q&A batch contains a bounded number of complete
`ExchangeQAPair` records. The request carries source identity, source lane,
source authority, exact publication time, `analysisAsOf`, and bounded source
text. It also carries the output contract version and the allowed output
families for that lane.

The structured output has this shape:

```text
{
  formalGuidanceCandidates: [],
  managementOutlookCandidates: [],
  kpiCandidates: [],
  structuredQaCandidates: []
}
```

The Workflow rejects a family that the input lane is not allowed to emit. It
does not issue four independent calls. One pass reduces cost, latency,
duplicate interpretation, and cross-call inconsistency while preserving
per-source and per-pair attribution.

### 5.3 Responsibilities by layer

The future physical ownership is:

```text
Skill
  -> semantic methodology, extraction instructions, allowed topics, QC rules
Workflow
  -> input lanes, bounded batching, ReasoningExecutor call, schema validation,
     evidence/PIT/authority validation, deterministic parsing, projection
Reasoning Plugin
  -> model execution only through the existing ReasoningExecutor seam
```

The semantic methodology belongs in a narrow future
`skills/management-communication-extraction/SKILL.md`. If code is needed, it
belongs in a focused helper under that Skill or the extraction Workflow; no
new Skill-to-Skill orchestration is introduced. A future Workflow module may
be `workflows/management-communication-extraction/` with contracts,
validation, projection, and workflow files, reusing D2-001 contracts rather
than copying them.

## 6. LLM and deterministic boundaries

### 6.1 The model may

The model may identify candidate statements, classify a semantic topic,
identify a stated metric, identify an explicitly stated fiscal period and
unit, locate an evidence span, distinguish management outlook from historical
fact, and identify explicit Q&A topics and references.

### 6.2 The model may not

The model may not invent or calculate numbers, convert units, infer unstated
periods or units, infer management intent, upgrade outlook to guidance,
calculate deltas or consensus, score credibility, or produce an investment
conclusion. It must return raw tokens and raw text where the source states
them; canonical arithmetic is code-owned.

### 6.3 Evidence-span validation

`EvidenceSpan.sourceObjectId` must resolve to an input source. When offsets are
present, they must be integer character offsets within the source content,
with `0 <= startOffset <= endOffset <= content.length`. The validator obtains
the source substring and, when `exactText` is present, requires exact equality
with that substring after no more than the documented offset convention.

When only bounded `exactText` is returned, the validator must find the exact
text deterministically in the source and reject an absent or ambiguous match;
it may not ask the model to repair a nonexistent span. Evidence text is
bounded to prevent an extraction result from copying an entire document.

Every semantic candidate must have a valid span. A numeric candidate is
invalid unless its raw numeric token occurs in that evidence span. A Q&A
candidate additionally must retain the original pair identity; its question
and answer must come from the acquired pair, not only from a generated
summary.

### 6.4 Numeric truth and unit normalization

Numeric truth follows this path:

```text
source text -> raw numeric token -> deterministic parser -> canonical number
```

Examples:

```text
“约12亿元”       -> rawValue “约12”, rawUnit “亿元”
“同比增长20%-30%” -> raw range tokens, rawUnit “%”
```

The parser owns sign, decimal, range, and registered locale handling. It does
not treat an LLM-supplied canonical result as authoritative.

Unit conversion is a closed, code-owned map. The initial allowed families may
include `元`, `万元`, `亿元`, `股`, `万股`, `台`, `万辆`, `吨`, `万吨`, `%`, and
`bps`; exact conversion factors and aliases must be explicitly registered and
tested. An unknown unit produces a diagnostic and no numeric projection. The
LLM is never asked to invent a conversion factor.

### 6.5 Fiscal-period resolution

The implementation distinguishes:

1. explicit period text;
2. bounded context-derived period;
3. unknown period.

For example, “2026年全年” deterministically maps to `2026-FY`. Relative text
such as “今年” is not resolved unless the source event/publication context and
an accepted methodology make the mapping deterministic. The model may return
raw period text, but it may not silently canonicalize an ambiguous relative
period. Unknown or ambiguous periods prevent projection to final contracts.

## 7. Deterministic validation and failure semantics

Validation is performed after the reasoning result and before projection. At
minimum it checks:

- source object and source binding exist;
- source lane permits the candidate family;
- evidence span exists, is bounded, and matches source content;
- every candidate `publishedAt` equals the source `publishedAt` exactly;
- `publishedAt <= analysisAsOf`;
- numeric tokens occur in the evidence span;
- unit is explicit or deterministically recoverable by a registered rule;
- fiscal period is explicit or resolved by an approved bounded rule;
- no unsupported authority upgrade occurred;
- candidate identity is stable and complete;
- duplicate candidates are handled deterministically.

Invalid candidates are rejected with a stable diagnostic. They are not
silently repaired by another reasoning call.

### 7.1 Stable candidate identity and duplicates

Candidate IDs are deterministic. The identity input includes:

```text
contract version
+ candidate type
+ sourceObjectId
+ evidence start/end offsets (or normalized exact span identity)
+ metric/topic
+ raw value/range/unit
+ resolved or raw fiscal-period identity
```

The implementation should use the repository's existing deterministic hashing
utility and a versioned, documented ID prefix; it must not use a random UUID.
Unchanged input under the same contract version produces the same identity.

Exact repeated candidates are deduplicated by candidate ID. Candidates with a
shared source/span and conflicting semantic or numeric fields are retained as
diagnostic-bearing conflicts and cannot project until deterministic conflict
resolution is available. Batch order does not affect identity or the final
deduplicated set.

### 7.2 Repair and retry

The retry policy is bounded:

```text
first reasoning output
        -> schema validation
schema-invalid output
        -> at most one bounded format repair
semantic/source mismatch
        -> no LLM repair; reject candidate
```

The repair request contains only the bounded invalid output, shape
diagnostics, the same output contract, and the source identity/allowed family
context. There is no open-ended retry loop. A valid schema does not bypass
semantic, evidence, authority, numeric, or PIT validation.

### 7.3 Result status

The future extraction result reports `COMPLETE`, `PARTIAL`, or `UNAVAILABLE`
with structured diagnostics and candidate-level rejection reasons:

- absent `ReasoningExecutor` returns `STRUCTURED_EXTRACTION_UNAVAILABLE`;
- malformed output after the bounded repair fails closed;
- valid candidates are preserved when sibling candidates fail, producing
  `PARTIAL`;
- raw D2-001 evidence remains valid when semantic extraction is unavailable;
- no regex extraction fallback is allowed except for deterministic parsing and
  transformations explicitly defined in this specification.

## 8. Explicit architecture boundaries

D2-002 does not:

- call CNINFO, AKShare, EastMoney, the web, search, or a browser;
- add an announcement crawler or acquisition provider;
- write Knowledge, `Claim`, `Observation`, `Thesis`, or `Prediction`;
- modify the Knowledge schema, Gateway, ChangeSet, Writer, or canonical IDs;
- wire Earnings Review, Company Research, Thesis, or Continuous Research;
- calculate guidance deltas, consensus, Q&A quality, credibility, evasiveness,
  sentiment, or investment conclusions;
- introduce a new Agent, Planner, provider abstraction, extraction manager,
  semantic engine, generic LLM framework, or generic document framework.

Acquisition remains D2-001. Structured extraction is D2-002. Consumer wiring
and downstream comparisons remain later work.

## 9. Future offline test plan

The future default test suite must use fixtures and zero network access. It
must cover at least:

1. Formal Guidance is accepted only from a valid statutory source.
2. Management IR outlook cannot become `GuidanceRange`.
3. A numeric token must exist in its evidence span.
4. An invented number is rejected.
5. A future source is rejected.
6. `publishedAt` is preserved exactly.
7. An unknown unit cannot project a numeric contract.
8. An ambiguous fiscal period cannot project.
9. Guidance midpoint is computed by code.
10. KPI projection reuses `SegmentKpiPoint`.
11. Q&A pair ID, question, answer, platform, and publication time are retained.
12. Candidate IDs are deterministic.
13. Same input plus contract version produces stable identity.
14. Malformed reasoning output fails closed after one bounded repair.
15. Semantic/source mismatch is rejected without LLM repair.
16. Valid partial candidates are preserved with diagnostics.
17. Duplicate handling is order-independent.
18. Default tests perform no network access.

The tests must also prove authority inheritance, source-span exactness,
registered unit conversion only, no management-to-guidance projection,
source-candidate binding on final contracts, and absence of Knowledge writes.

## 10. Future gated real-evidence validation

The gated validation harness may prepare fixtures using already-acquired real
public evidence, but acquisition and extraction telemetry must remain separate.
The minimum evidence set is:

- one statutory guidance disclosure;
- one CNINFO IR document;
- one SZSE or SSE exchange Q&A set.

The harness validates:

```text
source -> extraction candidate -> deterministic validator -> projection
```

It must report source acquisition status separately from semantic extraction
status and must not make a new external request from the extraction Workflow.
It must preserve the distinctions among fixture-backed validation,
provider-available smoke, and authenticated/real model execution. No live
provider result is implied by an offline pass.

## 11. Future flow and downstream handoff

The intended bounded path is:

```text
D2-001 Acquisition
        |
        v
D2-002 Structured Extraction
        |
        +--> Formal Guidance Candidate --validated--> GuidanceRange
        |                                             |
        |                                             +--> later comparisons
        |
        +--> KPI Candidate -----------validated--> SegmentKpiPoint
        |                                             |
        |                                             +--> later KPI deltas
        |
        +--> Management Outlook Candidate ----------> later commentary delta
        |
        +--> Structured Q&A Evidence ---------------> later clustering/analysis
```

Only acquisition and structured extraction are in this design. No consumer
automatically reads these outputs until a separately approved D2-003 design.

## 12. Decision register

| Decision | D2-002 resolution |
| --- | --- |
| Input contracts | D2-001 `ManagementCommunicationDocument`, `ExchangeQAPair`, and existing statutory `NormalizedResearchSource` equivalent |
| Source lanes | Statutory lane for Formal Guidance; management/Q&A lane for Outlook, KPI, and Structured Q&A |
| Intermediate contracts | `FormalGuidanceCandidate`, `ManagementOutlookCandidate`, `KpiCandidate`, `StructuredQAEvidence`, shared `EvidenceSpan`/metadata |
| Final contracts | Existing `GuidanceRange` and `SegmentKpiPoint`; no duplicate final numeric schema |
| Reasoning ownership | Existing `ReasoningExecutor`, one narrow `management_communication_extract` operation |
| Call strategy | One bounded pass per document or bounded Q&A batch |
| Evidence attribution | Stable source ID plus bounded character offsets; exact text is secondary and bounded |
| Numeric boundary | Raw source token from model; parsing, conversion, and arithmetic in deterministic code |
| Unit boundary | Explicit registered deterministic map only |
| Fiscal period | Explicit or bounded deterministic context; ambiguous remains unknown |
| Authority | Inherited; never upgraded by extraction |
| PIT | Exact source `publishedAt`, and source must be at or before `analysisAsOf` |
| Candidate ID | Deterministic versioned hash inputs; no random UUID |
| Versioning | `management-communication-extraction-v0.1` on every candidate |
| Repair | At most one schema/format repair; no semantic/source repair |
| Partial failure | Valid candidates preserved with `PARTIAL` and diagnostics |
| Acquisition | None; D2-001 remains the only acquisition path |
| Knowledge | None; no canonical projection |
| Consumer integration | None; D2-003 owns downstream wiring |

## 13. Implementation facts

The approved design is implemented in the following narrow boundaries:

- statutory input is the existing `NormalizedResearchSource` from
  `plugins/research-acquisition/contracts.ts`; D2-002 requires
  `candidate.kind = official_disclosure`, tier `1`, publication time,
  company attribution in `candidate.metadata.companySymbol` or `issuer`, and
  source content;
- D2-001 management documents and Q&A pairs remain their existing contracts;
  D2-002 contains no acquisition client or provider call;
- raw model contracts live in
  `skills/management-communication-extraction/contracts.ts` and are parsed by
  `workflows/management-communication-extraction/schema.ts`; model-supplied
  IDs, timestamps, authority, canonical periods, units, values, and keys are
  ignored rather than trusted;
- validated candidates are created by
  `workflows/management-communication-extraction/validation.ts`, with IDs
  derived from the versioned family/source/span/semantic/raw identity hash;
- the methodology is in
  `skills/management-communication-extraction/SKILL.md`; deterministic
  orchestration, validation, parsing, and projection are in the matching
  Workflow directory;
- the only new reasoning operation is
  `management_communication_extract`, registered in the existing closed
  `plugins/reasoning/contracts.ts` catalog;
- document input is bounded to `min(60,000, maxContextTokens * 3)` UTF-16
  characters per reasoning unit. Each unit carries an explicit
  `ReasoningSourceSlice` containing the exact model-visible text and its
  `absoluteStartOffset`; model locators are validated as slice-local offsets
  first, translated to absolute offsets only after local success, and then
  rechecked against the complete source. Offset-free `exactText` lookup is
  likewise slice-scoped, so repeated text elsewhere in the document does not
  create a false ambiguity;
- Q&A uses a deterministic default batch cap of five pairs and caller cap of
  fifty. A single pair exceeding the context character bound is skipped with
  `QA_PAIR_EXCEEDS_CONTEXT_BOUND`; question/answer text is never truncated or
  sent in an oversized request;
- each unit receives one reasoning call and at most one format-repair call;
  semantic/evidence failures are never repaired by the model;
- the closed unit registry normalizes the implemented families to `CNY`,
  `share_count`, `unit_count`, `vehicle_count`, `ton`, `%`,
  `percentage_points`, and `bps`; unknown units remain candidates but block
  projection;
- numeric ranges require one bounded source expression joining both endpoints.
  The accepted connectors are `-`, `–`, `—`, `~`, `～`, `至`, and `到`, with
  short unit or percent text allowed around the connector. Independent numbers
  in one span are not a range; this gate applies to Formal Guidance, Outlook
  ranges, and range-valued KPIs (which remain non-projectable);
- conflict detection compares family-specific semantic keys rather than span
  occupancy. Formal Guidance keys include source/span, metric, period,
  guidance type, and semantic unit; KPI keys additionally include raw
  segment/product identity; Outlook keys include topic, metric, and horizon;
  Structured Q&A candidates are not conflicted merely because primary spans
  overlap. Only incompatible values for one semantic key are excluded from
  projection, while all validated candidates remain available for audit;
- candidate identity canonicalizes unordered qualifiers, topic tags, stated
  metrics, and evidence-span collections by trimming, deduplicating, and
  sorting before hashing. Incidental model array ordering therefore does not
  change a candidate ID;
- fiscal period normalization reuses the existing Earnings keys `YYYY-Q1`,
  `YYYY-H1`, `YYYY-Q3`, and `YYYY-FY`. Explicit Q2/Q4/H2 and ambiguous
  relative periods remain unprojectable because the repository has no accepted
  canonical convention for them;
- `GuidanceRange` and `SegmentKpiPoint` are reused without shape changes;
  midpoint arithmetic is code-owned and segment projection requires a
  caller-supplied deterministic label-to-key map;
- the gated real-evidence harness is
  `scripts/acceptance-management-communication-extraction-d2-real.ts`. It
  consumes pre-acquired `statutory.json`, `management.json`, and `qa.json`
  files, keeps acquisition outside the extraction Workflow, and writes only
  bounded telemetry to
  `tests/validation/evidence/RHL_D2_002_MANAGEMENT_EXTRACTION_REAL.json`.

Focused offline validation is in
`tests/workflows/management-communication-extraction.test.ts` with 17 passing
tests covering chunk translation, slice-scoped exact text, bounded Q&A, range
relations, semantic conflicts, and order-invariant IDs. The real-evidence harness was executed under its gate and truthfully
reported `REAL_EVIDENCE_UNAVAILABLE` because no evidence directory was
provided; no live source or model success is claimed.

## 14. Deliverable and acceptance gate

The D2-002 deliverable includes this specification and the bounded Skill,
Workflow, reasoning catalog entry, focused tests, and gated validation harness.
Completion of the implementation task requires:

- no runtime implementation or unrelated file changes;
- a self-review for placeholders, contradictions, scope leakage, and
  ambiguous ownership;
- a commit on the target branch;
- remote branch verification after push.

The implementation is ready for Sol review. D2-003 consumer integration and
any Knowledge projection remain outside this task.
