# RHL-M3B-3B-FIX-017 — Gov.cn Official Industry Evidence

Status: IMPLEMENTED / GOVCN_REAL_VALIDATION_NOT_PROVEN / CTO REVIEW REQUIRED

## Acceptance context

DIAG-016 is accepted as completed TEST evidence at `312e2c8f36da3e0bcbc0ed5b46993cb45c838bab`. Its measured facts are preserved: production reasoning was `codex-cli / gpt-5.6-luna / medium`, automatic fallback count was zero, there was one Design call and eight Module calls, all eight Module outputs passed the unchanged parser and validator, final module statuses were unavailable, synthesis was not requested, and Knowledge revision remained 0.

The acquisition facts are recorded separately and unchanged: CNINFO empty, GDELT failed, Eastmoney failed, AKShare failed, and normalized source count 0. DIAG-016 did not prove an evidence-relevance defect. The immediate measured blocker was zero live Industry evidence availability. The product acquisition gap is broader: even when Eastmoney succeeds, its board-membership evidence does not by itself supply official Industry definition, policy/standards, technology evolution, supply-demand, qualification, or industrial-chain context.

## Implementation

`GovCnIndustryResearchPlugin` is a dependency-free, additive, Tier-1 `govcn` provider behind the existing `ResearchAcquisitionPlugin` contract. It uses native Node `fetch` against only `https://sousuo.www.gov.cn/search-gov/data`, with the public `zhengcelibrary_gw_bm_gb` policy-library query family, `title:content:summary` search fields, relevance ordering, at most four target-derived queries, two pages per query, page size 10, 20-second timeout, and 2 MiB search-response bound. It accepts only HTTPS `gov.cn`/`*.gov.cn` result URLs, canonicalizes fragments and tracking-only query parameters, deduplicates by canonical URL, ranks title overlap before bounded snippet overlap/date/URL, and caps output at eight candidates.

Fetch validates candidate ownership and government hosts before network access, permits only same-domain government redirects, bounds document responses at 8 MiB, accepts HTML/text/PDF-compatible media types, hashes raw bytes, and rejects unsupported binary content. Normalization delegates to the existing `DocumentInputResolver`, returns bounded normalized text rather than HTML, preserves the validated final URL and hash, uses official publication metadata or `China Government Website`, and applies public-access / non-redistribution personal noncommercial research rights. No claims, relations, company exposures, Industry identity, raw payloads, cookies, or headers are produced or persisted.

The runtime default Industry-only list is `[GovCnIndustryResearchPlugin, EastmoneyIndustryResearchPlugin]`. The general CNINFO/GDELT list and all other workflows remain unchanged. Explicit `industryAcquisitionPlugins` replacement semantics are preserved, including an explicit empty list.

## Deterministic validation

The focused provider fixtures pass: Company zero-network behavior; target-derived query construction and caps; documented empty response; malformed JSON; HTTP and payload-size errors; government URL filtering; deduplication; target-specific ranking and generic-word exclusion; HTML fetch and unsupported binary rejection; resolver-based markup stripping; deterministic hash, publisher, canonical URL, and rights metadata. Offline classification tests pass for the frozen eight-term PCB target, bounded context categories, substantive-context gating, and privacy-safe evidence projection. Runtime tests pass for default ordering, explicit empty-list replacement, and Industry route behavior.

## Focused real validation

The authorized command was run once: `node --import tsx tests/validation/govcn-industry-production-acquisition.ts`. It instantiated the production provider directly, made exactly one `discover()` call, and recorded one real search request, zero document requests, zero selected documents, zero model calls, and no Knowledge/Gateway/Writer activity. The live response did not expose a bounded result array recognized by the fail-closed parser, so the final classification is `GOVCN_SEARCH_INVALID_RESPONSE`, with `livePcbModuleRerunAuthorized: false`. No retry, alternate search engine, alternate host, hard-coded PCB URL, or bypass behavior was used. The privacy-safe evidence is at `tests/validation/evidence/RHL_M3B_GOVCN_INDUSTRY_PRODUCTION_ACQUISITION.json`.

Per task policy this is not interpreted as permanent Gov.cn failure. It is implemented but real discovery/document normalization is not proven and requires CTO review or a separately authorized compatibility adjustment. A successful future focused provider validation would authorize a separate TEST rerun of the DIAG-016 live PCB module stage; FIX-017 did not run that stage or the M3B gate.

## Mutation and regression boundary

The focused run records `modelCallCount:0`, `knowledgeMutation:false`, `gatewaySubmitCount:0`, `writerCommitCount:0`, `productionCodeMutation:true`, and `sourceContractsMutated:false`. No governance, architecture, Knowledge, Skill, Workflow, Gateway, Writer, reasoning transport, Company acquisition, or source-contract paths were changed. Luna performed no Git synchronization.
