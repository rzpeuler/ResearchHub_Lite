# Management Communication Acquisition Foundation v0.1 (D2-001)

Status: DESIGN SPEC — IMPLEMENTATION NOT STARTED  
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
`publishedAt`, optional title and participant lists, content, and provenance.

`ExchangeQAPair` contains a stable `id`, `ticker`, `question`, optional
`questionAt`, `answer`, `answeredAt`, platform (`SZSE_HUDONGYI` or
`SSE_EINTERACTION`), and provenance.

Question and answer are one attributable evidence item. An answer cannot be
stored without its question and is not automatically converted into a Company
Fact. The acquisition layer records documents and pairs; it does not decide
whether content is Formal Guidance or Management Outlook.

## 5. Separate source ladders

For `ManagementCommunicationDocument`:

```text
PRIMARY: CNINFO official IR record
F1:      company official IR, only when an explicit reusable path already exists
F2:      EastMoney institutional research
LLM_WEB: official/public document discovery only
```

If no reusable company-IR path exists, F1 is represented in policy metadata but
is not implemented through a new generic crawler.

For `ExchangeQAPair`:

```text
SZSE: AKShare stock_irm_cninfo / stock_irm_ans_cninfo
SSE:  AKShare stock_sns_sseinfo
LLM_WEB: official-page discovery only
```

EastMoney institutional research is never an Exchange Q&A fallback. A failed
Q&A request remains a bounded Q&A acquisition outcome.

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
`evidence`, ticker/exchange subject, `asOf`, and the appropriate determinism
class. It resolves an explicit `SourcePolicy` and invokes
`runResearchDataAcquisition` through an injected executor.

`operationId` is dispatch metadata only. The executor uses a closed,
code-owned switch for concrete operations; there is no dynamic registry,
reflection, service locator, or Plugin discovery framework.

Every attempted source produces exactly one D0 attempt record. A successful
primary prevents fallback invocation. Failures remain typed and bounded; no
values are averaged and no failed source is reported as successful.

## 7. Point-in-time, normalization, and deduplication

The three time fields remain distinct: `eventDate` is when activity occurred,
`publishedAt` is when the public record became available, and `retrievedAt` is
when acquisition obtained it.

Historical eligibility is governed only by `publishedAt <= analysisAsOf`.
`eventDate` or `questionAt` cannot substitute for missing or unreliable
`publishedAt`. Future, malformed, or absent publication timestamps produce a
bounded exclusion/validation outcome rather than being treated as current.

Normalization preserves question/answer pairing, rejects empty or malformed
rows, preserves all five provenance concepts, derives stable IDs from source
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
policy, workflow, and index files. Concrete external capabilities remain in
the existing research-acquisition Plugin area. No root-level `providers/`,
`drivers/`, `engines/`, `data/`, `common/`, or `capabilities/` architecture is
authorized. No client, public API, Knowledge schema, Writer, Skill, Scheduler,
or existing research-workflow behavior is changed.

## 9. Offline fixtures and gated live probes

Offline tests must prove product-specific routing, authority versus host and
retrieval provider, IR-only fallback order, strict separation between IR and
exchange-Q&A ladders, question/answer pairing, independent event/publication/
retrieval times, future and malformed publication handling, stable IDs,
order-independent deduplication, bounded provider failures, and exactly one D0
attempt record per attempted source. Tests must perform zero external network
access.

A real-probe script may be added only behind an explicit environment gate. It
must use bounded requests, emit privacy-safe structural evidence, and report
provider availability separately from semantic acceptance. It is never part of
the normal test suite and cannot establish authenticated production E2E.

## 10. Explicit non-goals

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
