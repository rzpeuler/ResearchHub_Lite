# Management Communication Acquisition Foundation v0.1 (D2-001)

Status: IMPLEMENTED — SOL ACCEPTANCE PENDING
Baseline: `origin/main = 14700808154b4d1a459ad16965797a349cd9ea4d`  
Stage: Data Source Wave D2

## 1. Purpose and frozen boundary

D2-001 provides deterministic acquisition for two research-input families:

- `ManagementCommunicationDocument`;
- `ExchangeQAPair`.

It owns CNINFO official IR acquisition/reuse, company official IR only when an
explicit reusable path already exists, Shenzhen Hudongyi acquisition, Shanghai
e-interaction acquisition, EastMoney institutional-research fallback for IR
documents, D0 `SourcePolicy` execution, normalization, provenance, PIT
filtering, deterministic deduplication, offline fixtures, and gated live probes.

D2-001 does not extract Formal Guidance, Management Outlook, KPI candidates,
tone or sentiment, Q&A quality, question clusters, or management execution. It
does not project Knowledge or change Skill methodology. Those belong to
D2-002/D2-003.

## 2. Architecture and ownership

The implementation remains inside the existing Workflow/Plugin/Knowledge
boundaries. The Workflow performs only explicit requirement routing, D0 policy
resolution, bounded acquisition, normalization, PIT validation, and
deduplication. It does not classify document semantics or make investment
judgments.

The Plugin directory may add concrete external acquisition capabilities only.
It must not add `IRProvider`, `ManagementCommunicationProvider`,
`SourceManager`, a provider registry, a generic adapter layer, or a generic web
crawler. If the existing CNINFO Plugin already searches or fetches the needed
record, D2 reuses it and adds only a narrow extension. A second CNINFO client is
not allowed.

## 3. Provenance contract

The following are five independent concepts and must remain independently
representable: `originPublisher`, `hostPlatform`, `retrievalProvider`,
`authority`, and `disclosureClass`.

`CommunicationProvenance` contains `originPublisher`, optional
`hostPlatform`, optional `retrievalProvider`, authority from
`S0_STATUTORY | S1_OFFICIAL | S2_PROFESSIONAL | S3_AGGREGATOR | S4_COMMUNITY`,
and disclosure class from `STATUTORY_DISCLOSURE | OFFICIAL_IR |
EXCHANGE_INTERACTION | AGGREGATED_IR | MEDIA`.

For a company IR record hosted by CNINFO and retrieved through AKShare:

```text
originPublisher=company; hostPlatform=CNINFO; retrievalProvider=AKShare;
authority=S1_OFFICIAL; disclosureClass=OFFICIAL_IR
```

Transport never changes authority. CNINFO statutory filings remain on the
existing statutory-disclosure path and are not silently reclassified as IR.

## 4. Research input contracts

`ManagementCommunicationDocument` contains a stable `id`, `ticker`, bounded
`documentType` (`INVESTOR_RELATIONS_RECORD`, `EARNINGS_BRIEFING`, `ROADSHOW`,
`ANALYST_MEETING`, or `COMPANY_IR_DOCUMENT`), optional `eventDate`, required
`publishedAt`, required `retrievedAt`, optional title and participant lists,
required `content`, and provenance.

`ExchangeQAPair` contains a stable `id`, `ticker`, `question`, optional
`questionAt`, required `answer`, required `answeredAt`, required `publishedAt`,
required `retrievedAt`, platform (`SZSE_HUDONGYI` or `SSE_EINTERACTION`), and
provenance. `answeredAt` is not an implicit substitute for `publishedAt`.
When a concrete exchange source proves that answer time is public-availability
time, normalization may set `publishedAt = answeredAt`; both fields remain
independently represented.

Question and answer are one attributable evidence item. An answer cannot be
stored without its question and is not automatically converted into a Company
Fact. The acquisition layer records documents and pairs; it does not decide
whether content is Formal Guidance or Management Outlook.

`documentType` is assigned only through deterministic source-native category
mapping, a bounded title allowlist, or an explicit endpoint mapping. For
example, a source-native `投资者关系活动记录` maps to
`INVESTOR_RELATIONS_RECORD`, and `业绩说明会` maps to `EARNINGS_BRIEFING`.
An unresolved or ambiguous category is excluded and recorded as a diagnostic;
it does not receive a universal `COMPANY_IR_DOCUMENT` fallback and is never
classified by an LLM. This is deterministic metadata normalization, not
document semantic classification.

## 5. Separate source ladders

The design document records both a logical long-term ladder and the executable
v0.1 policy. The logical ladder may mention deferred acquisition families, but
`SourcePolicy.candidates` contains only sources with a concrete executor in
the current implementation.

Logical ladder for `ManagementCommunicationDocument`:

```text
PRIMARY: CNINFO official IR record
F1:      company official IR, only when an explicit reusable path already exists
F2:      EastMoney institutional research
LLM_WEB: official/public document discovery only
```

Executable v0.1 IR policy:

```text
PRIMARY: CNINFO official IR record
F1:      existing reusable company official IR capability, only if present
F2:      EastMoney institutional research
```

If no reusable company-IR capability exists, F1 is omitted from
`SourcePolicy.candidates`; the policy does not contain a known
non-executable placeholder. `LLM_WEB` is deferred documentation only and is
not a runtime candidate in D2-001.

For `ExchangeQAPair`:

```text
SZSE: AKShare stock_irm_cninfo / stock_irm_ans_cninfo
SSE:  AKShare stock_sns_sseinfo
```

The Q&A logical ladder is exchange-routed and has no EastMoney fallback.
Before creating the D0 requirement, D2 uses the existing deterministic market
or exchange resolution. It then creates one of two concrete operations:

```text
SZSE → capability/operation exchange_qa_szse → SZSE Hudongyi PRIMARY
SSE  → capability/operation exchange_qa_sse  → SSE e-interaction PRIMARY
unsupported or unresolved → explicit UNAVAILABLE
```

The two policies have no cross-exchange candidate. EastMoney institutional
research is never an Exchange Q&A fallback, and a failed Q&A request remains
a bounded Q&A acquisition outcome.

| Source | Authority | Disclosure class |
| --- | --- | --- |
| CNINFO statutory filing | S0 | `STATUTORY_DISCLOSURE` |
| CNINFO official IR record | S1 | `OFFICIAL_IR` |
| company official IR | S1 | `OFFICIAL_IR` |
| SZSE Hudongyi | S1 | `EXCHANGE_INTERACTION` |
| SSE e-interaction | S1 | `EXCHANGE_INTERACTION` |
| EastMoney institutional research | S3 | `AGGREGATED_IR` |

## 6. D0 SourcePolicy integration

The Workflow creates D0 `DataRequirement` values with `dataKind` `document` or
`evidence`, ticker subject, `asOf`, and the appropriate determinism class. D2
does not add an `exchange` field to `DataRequirement` or exchange matching to
D0. Exchange resolution occurs before the Q&A requirement is created and
selects the explicit `exchange_qa_szse` or `exchange_qa_sse` operation; an
unsupported or unresolved exchange returns `UNAVAILABLE` without trying the
wrong exchange source. The Workflow resolves an explicit `SourcePolicy` and
invokes `runResearchDataAcquisition` through an injected executor.

Only currently executable sources may appear in `SourcePolicy.candidates`.
Deferred or discovery-only ladder entries remain documentation metadata and
are not passed to D0 execution.

`operationId` is dispatch metadata only. The executor uses a closed,
code-owned switch for concrete operations; there is no dynamic registry,
reflection, service locator, or Plugin discovery framework.

Every attempted source produces exactly one D0 attempt record. A successful
primary prevents fallback invocation. Failures remain typed and bounded; no
values are averaged and no failed source is reported as successful.

## 7. Point-in-time, normalization, and deduplication

The three time fields remain distinct: `eventDate` is when activity occurred,
`publishedAt` is when the public record became available, and `retrievedAt` is
when acquisition obtained it. Both D2 contracts must carry `publishedAt` and
`retrievedAt`; Q&A `answeredAt` remains a separate source event time.

Historical eligibility is governed only by `publishedAt <= analysisAsOf`.
`eventDate` or `questionAt` cannot substitute for missing or unreliable
`publishedAt`. D2 normalization/execution is stricter than generic D0: a
missing, malformed, or otherwise invalid `publishedAt` returns
`VALIDATION_ERROR` or `NO_DATA` before the attempt can be reported as
`SUCCESS`. D2 must not rely on D0's optional future-date check, and workflow
completion time must not silently substitute for the source's actual
`retrievedAt`.

Normalization preserves question/answer pairing, rejects empty or malformed
rows, preserves all five provenance concepts, applies only the deterministic
`documentType` mappings defined in Section 4, derives stable IDs from source
identity and normalized content, remains invariant to row order, and dedupes
deterministically without merging distinct provenance contexts.

The result is acquisition/report evidence only. D2-001 never invokes the
Knowledge Writer or creates durable canonical objects.

## 8. Plugin implementation boundary

The implementation may narrowly extend the existing CNINFO official client and
add explicit AKShare bridge methods for the identified endpoints. Existing
injected runner seams and current provider behavior must remain unchanged.

The Workflow implementation is limited to a
`workflows/management-communication-acquisition/` module containing contracts,
normalization, dedupe, policy, workflow, and index files. Concrete external capabilities remain in
the existing research-acquisition Plugin area. No root-level `providers/`,
`drivers/`, `engines/`, `data/`, `common/`, or `capabilities/` architecture is
authorized. No client, public API, Knowledge schema, Writer, Skill, Scheduler,
or existing research-workflow behavior is changed.

## 9. Offline fixtures and gated live probes

Offline tests must prove product-specific routing, authority versus host and
retrieval provider, executable-candidate-only policies, IR-only fallback order,
strict SZSE/SSE routing and separation from the IR ladder, question/answer
pairing, independent event/publication/answer/retrieval times, missing/future/
malformed publication handling before success, deterministic document-type
mapping and exclusion diagnostics, stable IDs, order-independent
deduplication, bounded provider failures, and exactly one D0 attempt record
per attempted source. Tests must perform zero external network access.

A real-probe script may be added only behind an explicit environment gate. It
must use bounded requests, emit privacy-safe structural evidence, and report
provider availability separately from semantic acceptance. It is never part of
the normal test suite and cannot establish authenticated production E2E.

## 10. Implementation facts from the accepted source probes

The bounded probe runtime used Node `v24.16.0`, Python `3.12.10`, and AKShare
`1.18.64`.

The existing `CninfoOfficialDisclosureClient` remains the CNINFO path. Its
observed list contract is `title`, `url`, `publishedAt`, and `issuer`; the D2
operation reuses its list/fetch and applies the bounded IR title mapping before
normalization. A live CNINFO IR fetch in the acceptance environment was
blocked by the existing `DocumentInputResolver` managed-Python runtime not
being ready; this is reported as a provider/runtime limitation, not as
fabricated live success.

The existing AKShare bridge now exposes only these explicit D2 operations:

```text
exchange_qa_szse        → stock_irm_cninfo
exchange_qa_szse_answer → stock_irm_ans_cninfo
exchange_qa_sse         → stock_sns_sseinfo
institutional research → stock_jgdy_detail_em(date)
```

Observed SZSE fields include `股票代码`, `问题`, `提问时间`, `更新时间`,
`问题编号`, `回答ID`, and `回答内容`. `更新时间` is treated as the concrete
public answer/update time for this source when no separate publication field is
present; it is preserved as `answeredAt` and used deterministically as
`publishedAt`. A live run returned 19 raw rows and 14 accepted Q&A pairs after
contract, timestamp, and PIT validation.

Observed SSE currently returned an empty result and emitted the provider's
existing instability warning; no live SSE evidence is claimed.

Observed EastMoney institutional-research fields include `代码`, `名称`,
`调研机构`, `机构类型`, `调研人员`, `接待方式`, `接待人员`, `接待地点`,
`调研日期`, and `公告日期`. The D2 normalizer uses the endpoint identity as
the deterministic `INVESTOR_RELATIONS_RECORD` mapping and serializes the raw
row structure as evidence content without fabricating a narrative. A bounded
live run returned 1,971 rows for the requested window but no accepted row for
the selected ticker.

No company-official-IR F1 capability or LLM runtime candidate is registered in
D2-001. The executable IR policy is CNINFO primary followed directly by
EastMoney F2.

## 11. Explicit non-goals

The following are explicitly excluded from D2-001:

- Formal Guidance extraction;
- Management Outlook extraction;
- KPI extraction;
- tone or sentiment analysis;
- Q&A response quality;
- question clustering;
- management execution tracking;
- Knowledge projection;
- Skill methodology changes;
- generic IR Provider;
- generic web crawler.

D2-002 may perform bounded semantic extraction from acquired documents.
D2-003 may add guidance comparison, commentary deltas, Q&A clustering, and
execution tracking.
