# RHL-D4-001 — Industry Operating Observation Closure

**Task type:** Design + source audit + live source probe only
**Baseline:** `main == origin/main == 2b9ddac3cf68432177ee2c6210a466885cf53706`
**Branch:** `codex/d4-001-industry-operating-observation-design`
**Worktree:** `C:\Users\Administrator\Desktop\ResearchHub_Lite_worktrees\D4_001`
**Date:** 2026-09-23
**Status:** **SOURCE FEASIBILITY CLOSED / SOL REVIEW PENDING**

## 1. Scope and non-goals

This document is the complete D4-001 design, repository audit, and live-source feasibility record. It does not implement a runtime observation model, add a database table, add a source client, modify the Industry workflow, modify a Skill, add a plugin operation, extend the Knowledge schema, or change dependencies.

The probe used read-only web search/open access and direct read-only HTTP transport checks. The repository's `browser-harness` executable was unavailable in this environment (`ModuleNotFoundError: No module named 'browser_harness'`), so no browser-harness output is represented as successful evidence. Direct HTTP results are recorded separately from the source's underlying authority and from indexed/web-reader access.

The D0 worktree remains outside this worktree and is not part of this change. It remains at `1ca5060a2197ae5da4748411b085a1d232178308`.

## 2. Decision summary

### General architecture decision: A — IMPLEMENTABLE_WITH_NARROW_OBSERVATION_CONTRACT

The evidence supports a small common observation contract because both representative industries have at least one repeatable, attributable operating metric with explicit value, unit, period, geography, publisher, and publication timing:

- Lithium battery: MIIT recurring official industry pages provide production and product/material price observations, with repeated annual/YTD reporting and explicit publication timestamps.
- Household air conditioners: NBS provides statutory production observations; the China Household Electrical Appliances Association provides recurring production and GACC-sourced household-air-conditioner export-volume tables with explicit headers, units, periods, and publication dates.

The contract must remain narrow. This is not evidence for a universal industrial data platform, a generic provider layer, daily breadth, a new taxonomy, or automatic numeric extraction from arbitrary prose. The first proven vocabulary is:

- `PRODUCTION` — supported for NBS/MIIT/association observations when product scope and unit are explicit.
- `TRADE` — freeze only with a specific metric key such as `air_conditioner.export_volume`; the proven household scope is the CHEAA label `家用空调器`, with the report identifying GACC as the data source. It is not accepted from an export-value-only source.
- `PRICE` — supported for an explicitly scoped industry/material average price, but must not be mislabeled as futures, spot, or ASP.

`SALES_VOLUME`, `SHIPMENTS`, `INVENTORY`, `CAPACITY`, `CAPACITY_UTILIZATION`, `OPERATING_RATE`, `IMPORT_VOLUME`, `ORDERS`, and `BACKLOG` remain probe-supported only in isolated or non-representative cases, or unsupported for the current representative acceptance path. They are not frozen as generally usable classes.

The common contract is justified by shared provenance, period, unit, geography, product/segment, publication, and conflict semantics. Source-specific interpretation remains in narrow Workflow-owned operations. If later live acceptance shows that the common contract causes product-specific semantics to be lost, the implementation may move to B — `IMPLEMENTABLE_AS_INDUSTRY_SPECIFIC_OPERATIONS` — without introducing a generic provider framework.

## 3. Existing Industry path audit

### 3.1 Workflow ownership

The current Industry workflow is `workflows/industry-deep-research/workflow.ts`, with its contracts in `workflows/industry-deep-research/contracts.ts`. It owns deterministic execution control, bounded acquisition waves, module routing, evidence retention, quality gates, report assembly, and the Knowledge Production Gateway submission boundary.

The current workflow has eight modules:

1. `industry_definition`
2. `market_size_growth`
3. `supply_demand_analysis`
4. `industry_chain_analysis`
5. `competitive_landscape`
6. `technology_evolution`
7. `company_mapping`
8. `risk_analysis`

It assembles sixteen report sections, including `Supply, Capacity & Utilization`, `Supply-Demand Balance & Pricing`, `Key Metrics & Monitoring`, `Research Gaps & Alternative Views`, and `Methodology & Provenance`. These section names identify the intended analytical surface but do not imply that the current runtime has a structured operating-series acquisition layer.

The workflow currently receives an `acquisitionWave` function and a bounded set of `NormalizedResearchSource` values. It applies source usability, retention/rights, as-of, source-count, and per-module evidence limits; routes evidence through deterministic terms; invokes the Industry Skill for semantic analysis; optionally performs a bounded second acquisition wave for gaps; builds report material; and submits Knowledge proposals through the existing Gateway path. It does not emit an `OperatingObservation` object or series.

`asOf` currently governs publication eligibility where a parseable source publication time exists. This is useful D0 behavior, but it does not prove a numeric value-version PIT. D4 must preserve that distinction.

### 3.2 Skill ownership

The Industry Skill is `skills/industry-research/skill.ts`, with contracts in `skills/industry-research/contracts.ts` and methodology in `skills/industry-research/SKILL.md`. It owns professional semantic methodology, module analysis, cross-module synthesis, gaps, claims, report material, and proposal shaping. Its operations are:

- `industry_research_design`
- `industry_module_analysis`
- `industry_cross_module_synthesis`

The Skill contract already validates bounded structured values attached to model claims. Those values require fields such as metric, value, unit, comparator, and period/fiscal period. They are claim-level model outputs, not acquired source-owned observations. They must not be repurposed as a second observation store or treated as proof that acquisition owns numeric truth.

The Skill may reason over accepted observations and documents. It must not select an unproven number, infer a missing absolute from YoY/MoM, perform source reconciliation, or silently normalize units.

### 3.3 Acquisition and Plugin ownership

Current acquisition contracts are in `plugins/research-acquisition/contracts.ts`. They distinguish candidates, fetched sources, normalized sources, provider outcomes, and diagnostics. `plugins/research-acquisition/industry-composition.ts` performs bounded plugin composition: discovery, fetch, normalize, concurrency, source limits, and provider outcome aggregation.

The current Industry plugins do not provide a structured operating-observation operation:

- `plugins/research-acquisition/industry.ts` uses AKShare's industry board snapshot to discover a uniquely matched industry board and serializes the matched board row as structured data. This is board/sector snapshot evidence, not production, shipments, inventory, capacity, or price history.
- `plugins/research-acquisition/eastmoney-industry.ts` uses public Eastmoney board-list/constituent endpoints. The live endpoint returned HTTP 200 JSON during this probe, but the payload is board membership/market snapshot data, not an operating series.
- `plugins/research-acquisition/miit-industry.ts` fetches bounded official MIIT HTML/PDF/document evidence. It has the correct publisher boundary for MIIT documents but does not parse a reusable observation series.
- `plugins/research-acquisition/govcn-industry.ts` searches bounded government articles and returns document evidence.
- `plugins/research-acquisition/cpca-industry.ts` fetches bounded association/PCB documents and classifies access gates; it is document evidence, not a structured operating-series source.
- `plugins/research-acquisition/akshare.ts` exposes company, financial, valuation, historical-market, research-report, index, sector-performance, calendar, exchange-Q&A, and related operations. The current interface contains no commodity, futures, spot, or industry-operating-series operation.

The future implementation boundary may use narrow Workflow-owned operations under `plugins/research-acquisition/`, conceptually such as `fetchOfficialStatistics` and `fetchIndustryOperatingSeries`. These are design hypotheses only. No generic provider framework, gateway layer, or new Agent Runtime is warranted.

### 3.4 Application entry and report/view

`app/services/research-service.ts` validates the Industry request, configures acquisition plugins, optionally attaches the AKShare Industry plugin, registers `industry_deep_research`, mounts the configured Knowledge Base, and calls the existing workflow. It exposes provider outcomes and acquisition diagnostics to the application result. This is the correct future entry point for a module-driven operating-observation requirement; it is not permission for a parallel acquisition route.

The existing report builder/view path already has a supply/capacity/pricing narrative surface and a methodology/provenance surface. D4 should add a structured observation rendering section only in a later runtime change, reusing the current report lineage. No separate dashboard-only data path is required by this design.

### 3.5 Deterministic numeric observations already present

Existing deterministic numeric material is present in three forms:

1. Source documents and structured source payloads are retained with publisher, URL/report identity, publication metadata, and normalized source fields.
2. Skill-level claim structured values validate metric, value, unit, comparator, and period/fiscal period.
3. Existing acquisition plugins can return structured source payloads such as market/industry board snapshots.

None of these is yet a reusable, source-owned, observation-classed operating metric with explicit period aggregation, geographic scope, product scope, publication PIT, value-version status, and conflict identity. That is the D4 design gap.

The semantic/document-derived remainder includes definitions, drivers, risks, market interpretation, supply-demand explanation, technology commentary, and conclusions. Those remain Skill-owned reasoning. D4 does not convert conclusions or scores into observations.

### 3.6 Knowledge boundary

The current Industry workflow can write validated Knowledge proposals through the Knowledge Production Gateway and produce report/source/entity/relation/claim references. D4 does not add automatic observation persistence, a new schema, a new canonical industry object, or a new `IndustryIdRegistry`/ontology/taxonomy framework.

The first consumer should be the Industry runtime and its report lineage. A future durable Knowledge representation may be designed after live acceptance proves the contract, but that is outside D4.

## 4. Observation model design

### 4.1 Candidate observation classes

The requested candidate classes were evaluated as follows:

| Class | D4 disposition | Boundary |
|---|---|---|
| `PRODUCTION` | Freeze narrowly | Physical output only; preserve product definition and original unit. |
| `SHIPMENTS` | Not frozen | Do not infer from production, exports, or sales. Requires explicit shipment semantics. |
| `SALES_VOLUME` | Not generally frozen | Retail sales, sell-in, and industry sales are distinct; exact scope must be explicit. |
| `INVENTORY` | Not proven for representative path | Requires stock type, date/period, geography, and reporting population. |
| `CAPACITY` | Not generally frozen | Company capacity is not industry capacity; nameplate vs effective capacity differs. |
| `CAPACITY_UTILIZATION` | Not proven | Requires numerator/denominator alignment and period identity. |
| `OPERATING_RATE` | Not proven | Do not equate with utilization without source definition. |
| `PRICE` | Freeze narrowly | Industry/material average price is allowed only with explicit product, average method, unit, and period. It is not automatically spot, futures, or ASP. |
| `ASP` | Not frozen | Requires explicit average selling price semantics and numerator/denominator scope. |
| `IMPORT_VOLUME` | Conditional | Exact product/HS, unit, geography, period, and customs table headers required. |
| `TRADE` / export volume | Freeze narrowly by metric key | Use `TRADE` with a product-specific key such as `air_conditioner.export_volume`; export value is not export volume. |
| `ORDERS` | Not proven | Requires order definition and period. |
| `BACKLOG` | Not proven | Requires explicit backlog stock definition and period-end date. |

Derived scores, conclusions, trend labels, supply-demand balances, margins, spreads, confidence grades, and risk scores are explicitly excluded. They may be calculated later from accepted observations under deterministic transformation policy, but they are never observations.

### 4.2 Minimal contract concept

The smallest common concept is an immutable observation point or a bounded series containing points. It should be considered conceptually as:

```text
OperatingObservation {
  industryId?: canonical industry reference,
  metricKey: stable metric identity,
  observationClass: candidate class,
  value: numeric value or explicitly qualified numeric bound,
  unit: original source unit,
  periodStart: date,
  periodEnd: date,
  frequency: evidenced release/observation cadence,
  aggregation: PERIOD | YTD | POINT_IN_TIME,
  geography: canonical geography label,
  productOrSegment: source-preserved product/segment scope,
  publishedAt?: source publication timestamp,
  retrievedAt: retrieval timestamp,
  originPublisher: source owner,
  retrievalProvider: host/platform/wrapper used to retrieve,
  sourceAuthority: S0_STATUTORY | S1_OFFICIAL | S2_PROFESSIONAL | S3_AGGREGATOR | S4_COMMUNITY,
  determinismClass: AUTHORITATIVE_NUMERIC | EVIDENCE_BACKED_NUMERIC,
  sourceRef: URL/report/table/document identity,
  metadata: qualifiers, original label, revision/version fields, method, scope, and transport facts
}
```

This is a design concept, not a TypeScript interface. It deliberately does not define a database schema or force every source into a common series abstraction.

Required truth fields are `value`, `unit`, `periodStart`, `periodEnd`, `geography`, `sourceRef`, and `publishedAt` where the source publishes a publication time. A value with unclear unit, period, geography, product scope, or source identity is not a usable numeric observation. A source can remain a document `Evidence` item when these fields are unavailable.

Original source values and units must be retained. A future canonical value/unit may be added only with an explicit, deterministic, auditable conversion. No silent conversion, scaling, currency conversion, annualization, interpolation, or synthetic resampling is permitted.

`metricKey` should be stable and narrow, for example `room_air_conditioner.production` or `lithium_battery.total_output`, with the product/unit/segment mapping carried alongside it. It must not become a hundreds-of-metrics taxonomy. Existing canonical industry identity and mapping mechanisms are reused.

### 4.3 Point versus series

The smallest representation that fits the existing evidence/report architecture is a source-attributable observation point with optional sibling points grouped by a source-defined series identity. D4 does not select a time-series database, chunk/batch/extraction architecture, or a new persistence layer.

The preferred sequence is:

```text
structured observation -> attributable numeric Evidence -> module reasoning/report material
```

This keeps the observation tied to the existing Evidence universe rather than creating a parallel numeric universe.

### 4.4 Frequency and aggregation

The probe evaluated monthly, quarterly, annual, and daily/weekly availability:

- `MONTHLY`: evidenced by NBS's major industrial product publication model and by association/CAAM monthly publication patterns, but the exact NBS interactive series endpoint was not isolated in this probe. Support is `PARTIAL` until the endpoint/table identifier is captured.
- `QUARTERLY`: evidenced by the CHEAA Q1 2024 air-conditioner production observation and CAAM Q1 2025 reporting. Support is `PARTIAL` because these are article/report observations rather than a common structured API.
- `ANNUAL`: evidenced by the NBS 2025 industrial product table and Customs annual static tables. Production and broad trade headers are proven; household trade scope is proven through the recurring CHEAA/GACC-backed table, while direct GACC HS-coded retrieval remains a future improvement.
- `DAILY/WEEKLY`: not evidenced for representative industry operating metrics. Existing AKShare does not expose a commodity/futures/spot operation in this Industry boundary. Do not add daily breadth in D4.

MIIT also exposes recurring YTD/H1 and Jan-to-month reporting. `YTD` is an aggregation qualifier, not a substitute for a monthly frequency. A YTD observation must not be treated as a standalone monthly point. A half-year report should retain its H1 period and source wording rather than being silently labeled quarterly or annual.

There is no interpolation, back-solving, annualization, or synthetic resampling. A YoY/MoM rate is a distinct observation/claim from an absolute value; the absolute value cannot be reverse-engineered when absent.

### 4.5 PIT and revision semantics

D0 publication PIT is reused:

```text
publishedAt <= analysisAsOf
```

The Shanghai date-only convention applies conservatively: a publication date without time is treated as available at the end of that Shanghai calendar day. `periodEnd` is the observation period boundary, not publication availability.

Each observation must distinguish:

- `observationPeriod`: the economic/statistical period measured;
- `publishedAt`: when the publisher made the source available;
- `retrievedAt`: when the application retrieved it;
- `revision` or `version`, when explicitly provided by the source;
- the revision guarantee actually supported.

The live probe found publication timestamps and historical periods, but did not find a stable value-version identifier or immutable revision snapshot for the representative sources. Therefore the default source status is `PUBLICATION_PIT_ONLY`; a current series value may be labeled `CURRENT_SERIES_VALUE` only when the source explicitly exposes current-series semantics; otherwise record `VALUE_VERSION_UNVERIFIED`. Publication PIT must not be presented as numeric value-version PIT.

### 4.6 Authority, determinism, and conflicts

Authority classes:

- `S0_STATUTORY`: NBS and Customs statutory/government statistical sources.
- `S1_OFFICIAL`: MIIT official releases and official government pages.
- `S2_PROFESSIONAL`: recognized industry associations such as CHEAA or CAAM.
- `S3_AGGREGATOR`: structured market/data aggregators.
- `S4_COMMUNITY`: community or user-generated sources.

Primary numeric evidence should prefer S0/S1. S2 can be useful fallback or corroboration with accurate authority labeling. LLM/web search may locate explicit evidence but may not synthesize a value or reconcile conflicting values.

`AUTHORITATIVE_NUMERIC` is reserved for an explicit, structured statutory/official value with identity and unit/period/scope proven. `EVIDENCE_BACKED_NUMERIC` covers explicit numeric text/table evidence whose provenance or parsing method requires semantic care, including MIIT prose HTML and association reports. The MIIT H1 2026 lithium figures are evidence-backed, not automatically authoritative numeric, because the page states that its basis combines normative-announcement enterprise information and an industry-association estimate.

Conflicts preserve both observations and their authority, method, source identity, period, geography, product scope, and qualifiers. The system must diagnose likely causes such as production versus shipment, domestic versus global scope, calendar versus fiscal period, source revision, or differing population. It must not average values, choose the latest retrieval timestamp, or ask an LLM to reconcile numeric truth.

## 5. Live source probe results

### 5.1 Representative evidence table

The table records live source evidence, not fixtures. `Usable` means usable for a future narrow design/acceptance path, not necessarily ready for automatic production ingestion today.

| Industry | Metric/class | Source and authority | Retrieval mechanism | Value | Unit | Period / aggregation | Geography / product scope | publishedAt | History depth / PIT | Transport result | Usable |
|---|---|---|---|---:|---|---|---|---|---|---|---|
| Household air conditioner | `PRODUCTION` | NBS, S0_STATUTORY | Official annual statistical PDF/table | 26,697.5 | 万台 | 2025-01-01–2025-12-31 / PERIOD | China national / `房间空气调节器` | 2026-03-02 report publication | Annual 2025; NBS explains monthly historical series exists. Publication PIT only; value-version unverified. | Direct HTTPS 200; PDF 1,734,666 bytes. | Yes for annual evidence-backed design; exact series endpoint still pending. |
| Household air conditioner | `PRODUCTION` | China Household Electrical Appliances Association, S2_PROFESSIONAL | Official association HTML article | 6,878 | 万台 | 2024-Q1 / PERIOD | China national / air-conditioner category | 2024-05-24 | Q1 point; article-level history only; publication PIT only. | Direct HTTPS 200; HTML 33,620 bytes. | Partial; accepted as association evidence, not statutory replacement. |
| Household air conditioner | `TRADE` / `air_conditioner.export_volume` | Customs, S0_STATUTORY | Official English static annual table | 6,159 | `10000N` | 2024-01-01–2024-12-31 / PERIOD; table also exposes Dec quantity 481 | China export table / exact source label `Air conditioners`; no HS code in this summary table, so do not relabel as household-only | 2025-01-23 | Header is explicit: `Commodity | Quantity Unit | 12 | 1to12 | Percentage Change` and paired `Quantity | Value`; publication PIT only; value-version unverified. | Direct HTTPS certificate validation failed (`SSL_ERROR`); official page/search exposed the table. | Yes for broad GACC `Air conditioners` trade evidence; not sufficient alone for household-only scope. |
| Household air conditioner | `TRADE` / `air_conditioner.export_volume` | CHEAA publication, S2_PROFESSIONAL; data source stated as GACC | Official CHEAA PDF, recurring monthly table | 4,039,692 | 台 | 2024-09 / PERIOD; cumulative 66,841,194台 also shown | China national export / exact source label `家用空调器` | 2024-11-08 issue publication | Monthly table; same methodology also observed for 2023-09, 2024-05, 2024-11, 2024-12, and 2025-07. Publication PIT only; value-version unverified. | Direct HTTPS 200; PDF 6,045,707 bytes. | Yes as recurring household-specific S2/GACC-backed evidence; no HS code is supplied by the report. |
| Household air conditioner | `TRADE` / `air_conditioner.export_volume` | CHEAA publication, S2_PROFESSIONAL; data source stated as GACC | Official CHEAA PDF, recurring monthly table | 5,133,858 | 台 | 2025-07 / PERIOD; cumulative 61,001,511台 also shown | China national export / exact source label `家用空调器` | 2025-09-08 issue publication | Same explicit headers and methodology as 2024-09; publication PIT only; value-version unverified. | Direct HTTPS 200; PDF 7,916,822 bytes. | Yes; establishes a second comparable monthly period for the same household export-volume metric. |
| Lithium battery | `PRODUCTION` | MIIT Electronics Information Department, S1_OFFICIAL | Official MIIT HTML article | `>1,240` | GWh | 2026-01-01–2026-06-30 / H1/YTD | China national / total lithium-ion battery industry | 2026-09-15 14:43 | Recurring MIIT history: 2024 annual, 2024 Jan–Oct, 2025 Jan–Apr, 2026 H1; publication PIT only; value-version unverified. | Direct curl 403 access gate; web reader/search retrieved explicit article. Raw `HTTP_403_ACCESS_GATE`; not treated as source failure. | Yes as evidence-backed lower-bound observation, not exact authoritative point value. |
| Lithium battery | `PRICE` | MIIT Electronics Information Department, S1_OFFICIAL | Same official HTML article | 16.3 / 15.3 | 万元/吨 | 2026 H1 article period / PERIOD | China national / battery-grade lithium carbonate and lithium hydroxide | 2026-09-15 14:43 | Same recurring article family; publication PIT only; value-version unverified. | Same MIIT access gate. | Partial/yes for explicitly scoped industry/material average price; not spot/futures/ASP. |
| Lithium battery | `PRODUCTION` | MIIT, S1_OFFICIAL | Official HTML article | 1,170 | GWh | 2024-01-01–2024-12-31 / PERIOD | China national / total lithium-ion battery industry | 2025-02-27 15:06 | Annual comparison with later H1/YTD reports; publication PIT only. | Direct curl 403 access gate; indexed official page available. | Yes as evidence-backed annual observation. |
| Lithium battery | candidate export metric | MIIT, S1_OFFICIAL; underlying statement says Customs | Official HTML article | 3,370 | 亿元 | 2026 H1 / PERIOD | China national / lithium battery export total value | 2026-09-15 14:43 | Recurring article family; publication PIT only. | Same MIIT access gate. | No for `EXPORT_VOLUME`: it is export value, not export volume. Retain as document evidence only. |
| Manufacturing control | production/orders/inventory indexes | NBS, S0_STATUTORY | Official PMI release/table | Example 2026-05 production index 51.2; new orders 49.9; raw-material inventory 48.6 | index points | Monthly / POINT_IN_TIME | China national / manufacturing-wide PMI | Official NBS monthly release | 13-month table in live result; publication PIT only. | Official page/search accessible; not industry-specific. | No representative Industry observation; negative/control evidence only. |
| Association control | production and sales | CAAM, S2_PROFESSIONAL | Official association HTML | 300.6 production; 291.5 sales | 万辆 | 2025-03 / PERIOD; Q1 YTD also shown | China national / automobiles | 2025-04-18 | Monthly/Q1 article recurrence visible; publication PIT only. | Local curl TLS handshake failed (`SSL_ERROR`); web search indexed the explicit article. | Control only; proves association cadence, not lithium/air-conditioner scope. |
| Existing market wrapper | industry board snapshot | Eastmoney endpoint via current boundary | Public JSON HTTP endpoint | Board snapshot JSON returned; no operating metric | N/A | Point-in-time market snapshot | Board/constituent scope | No operating publication timestamp | No operating history | Direct HTTPS 200, JSON 164 bytes for bounded request. | No; not an operating observation. |

### 5.1.1 Probe source references

The source identity used by the table is preserved here as a direct URL/report identity. These are live public source references, not fixture paths:

- NBS major industrial product output explanation: `https://www.stats.gov.cn/zs/tjws/jbtjzswd/tjzb/202503/t20250321_1959112.html`.
- NBS 2025 annual statistical report PDF containing `房间空气调节器`: `https://www.stats.gov.cn/zs/tjwh/tjkw/tjqk/zgxxb/202603/P020260302324456002021.pdf`.
- NBS National Data portal: `https://data.stats.gov.cn/`.
- MIIT 2026 H1 lithium-ion battery industry operation: `https://wap.miit.gov.cn/gxsj/tjfx/dzxx/art/2026/art_09763880ab3b4f3da2dcd747b0a4058d.html`.
- MIIT 2024 full-year lithium-ion battery industry operation: `https://www.miit.gov.cn/gxsj/tjfx/dzxx/art/2025/art_f59c26cfa29d41e299f875c46f66aaff.html`.
- MIIT 2024 household-appliance production release citing NBS: `https://www.miit.gov.cn/gxsj/tjfx/xfpgy/jd/art/2025/art_0053121a1a5c43d5a3adc1f166d0a301.html`.
- Customs public portal: `https://online.customs.gov.cn/ocgb/`.
- Customs 2024 major export commodities static table: `https://english.customs.gov.cn/Statics/0422513d-3184-40e0-a0f4-fec49e8f5d77.html`.
- Customs 2023 major export commodities static table: `https://english.customs.gov.cn/Statics/504dd159-162d-488d-981d-621e1a781284.html`.
- Customs monthly statistics index: `https://english.customs.gov.cn/Statistics/Statistics?ColumnId=1`.
- Customs monthly bulletin index: `https://english.customs.gov.cn/statics/report/monthly.html`.
- Customs 2025 December major export table: `https://english.customs.gov.cn/Statics/7367d7db-7fbd-42a5-8f75-442a7f989e64.html`.
- Customs statistical explanatory notes: `https://english.customs.gov.cn/Statics/33529d38-1c0f-4e03-9d35-b34519f799f4.html`.
- Customs HS4 index lead: `https://english.customs.gov.cn/Statics/40b4521b-9118-4de2-9142-c3c293a81a7d.html`.
- CHEAA 2024 air-conditioner committee article: `https://www.cheaa.org/contents/329/11201.html`.
- CHEAA companion article with the explicit Q1 production statement: `https://www.cheaa.org/contents/329/11203.html`.
- CHEAA July 2024 household-appliance export table: `https://www.cheaa.org/upload/file/20240923/6386270329028309632265539.pdf`.
- CHEAA September 2024 household-appliance export table: `https://www.cheaa.org/upload/file/20241210/6386944728591111044948028.pdf`.
- CHEAA December 2024 household-appliance export table: `https://www.cheaa.org/upload/file/20250314/6387755356284024054836551.pdf`.
- CHEAA July 2025 household-appliance export table: `https://www.cheaa.org/upload/file/20250928/6389465323530752764793788.pdf`.
- CAAM 2025 March production/sales article: `https://www.caam.org.cn/chn/4/cate_32/con_5236697.html`.
- Eastmoney bounded board endpoint used only as a transport/control probe: `https://push2.eastmoney.com/api/qt/clist/get` with the bounded query recorded in the probe command, not as operating evidence.

### 5.2 NBS

The NBS official explanation of major industrial product output states that industrial product output reflects physical production scale and trends and explicitly includes room air conditioners. It explains that monthly output is primarily collected from above-scale industrial monthly reports, with annual below-scale supplementation, and that monthly output is published through the NBS latest release and National Data portal with time-series downloads.

The 2025 official annual report table provides a clean representative point:

```text
product: 房间空气调节器
value: 26697.5
unit: 万台
period: 2025 annual
publisher: National Bureau of Statistics
source: 2025 annual statistical report PDF
published: 2026-03-02
```

The official data portal itself was directly reachable and redirected to the current data application with HTTP 200. The interactive portal's exact table identifier, query payload, and machine-readable response were not captured in this probe. The correct design result is therefore `PARTIAL` for a future monthly NBS operation: the source family and monthly series capability are proven, but implementation must first capture the table/metric identifier and response schema. No NBS client is being added here.

The NBS statutory source is the strongest candidate for `AUTHORITATIVE_NUMERIC` once the exact machine-readable table identity and revision behavior are verified. The annual PDF point is currently `EVIDENCE_BACKED_NUMERIC` for design purposes because the document/table extraction and value-version behavior remain to be formalized.

### 5.3 MIIT lithium battery

The MIIT 2026 H1 official page is HTML, not a direct numeric API. It reports:

- total lithium-ion battery output above 1,240 GWh;
- consumer battery output above 40 GWh;
- energy-storage battery output above 420 GWh;
- power battery output above 785 GWh;
- lithium battery export total value of 337 billion yuan;
- battery-grade lithium carbonate output above 620,000 tonnes and average price 163,000 yuan/tonne;
- lithium hydroxide output above 180,000 tonnes and average price 153,000 yuan/tonne.

The page states that the production basis combines information from normative-announcement enterprises and an industry-association estimate. That language requires a qualifier and prevents an unconditional `AUTHORITATIVE_NUMERIC` label. A future parser must preserve lower-bound qualifiers such as `above` and must not store them as exact values without a bound/qualifier field.

The MIIT source family is recurring rather than a single article: the probe found 2024 full-year, 2024 Jan–Oct, 2025 Jan–Apr, and 2026 H1 pages with explicit publication dates. The history is not a clean monthly point series; the periods are annual or YTD/H1. This supports recurring evidence-backed observations but not synthetic monthly resampling.

The direct local HTTP probe received HTTP 403 on the official MIIT pages, while the web reader/search retrieved the official HTML and explicit numeric text. This is recorded as a transport/access gate, not as proof that MIIT is unavailable or that the underlying source failed. A future plugin must preserve both the source URL and retrieval method, classify the direct transport result, and avoid silently falling back to an aggregator.

### 5.4 Customs

Customs is the statutory authority for import/export observations. The probe now proves the physical-quantity field and its header in the official major-export table. The 2024 annual table is titled `Major Export Commodities in Quantity and Value,1-12.2024`, published 2025-01-23, and explicitly declares:

```text
Unit: US$1,000
Commodity | Quantity Unit | 12 | 1to12 | Percentage Change
           Quantity | Value | Quantity | Value | Quantity | Value
Air conditioners | 10000N | 481 | 669,343 | 6,159 | 8,987,530 | 32.5 | 35.0
```

The annual GACC row therefore proves `6,159 × 10,000 units` for the `1to12` quantity field and separately exposes the export value. The exact source label is `Air conditioners`, not `household air conditioners`; because no HS code is supplied in this summary table, it must not be relabeled as household-only.

The official HS4 index exposes `8415` for air conditioners and `8507` for accumulators. This does not freeze an exact lithium-battery HS taxonomy. Exact HS6/product mapping must remain source-specific and explicit. D4 does not build a taxonomy.

The official Customs statistics index and monthly bulletin establish that the same `Major Exports by Quantity and Value` table is recurring monthly. The 2025 September official page, published 2025-10-08, exposes the same quantity/value headers and `1-9 Total` comparison structure; the 2025 December page, published 2026-01-08, exposes the same annual structure. The local direct TLS probe for the English static pages failed certificate validation (`SSL_ERROR`), while official search/open access returned the pages. This is a local transport fact and must not be converted into `SOURCE_NOT_AVAILABLE`.

For household-specific scope and a directly retrievable recurring numeric series, the probe uses the official CHEAA monthly tables whose rows are explicitly labeled `家用空调器` and whose footer says `数据来源：海关总署` (data source: General Administration of Customs). The September 2024 and July 2025 reports expose the same headers, the physical unit `台`, monthly quantity, cumulative quantity, and cumulative quantity growth. This is a reproducible S2 publication path with GACC source attribution, and it proves the narrow household export-volume class without inventing an HS code that the report does not provide.

The future live acceptance path should prefer a direct GACC retrieval when the TLS/query path is resolved, but it may retain the CHEAA/GACC-backed source with accurate provenance: CHEAA is the `originPublisher`, the CHEAA official web/PDF host is the `hostPlatform`, ResearchHub direct HTTPS is the `retrievalProvider`, and GACC is upstream data-source/method attribution in metadata. It must preserve the broader direct GACC `Air conditioners` scope separately from the household-specific `家用空调器` scope.

Customs export value must not be stored as `EXPORT_VOLUME`. MIIT's lithium export value is likewise document evidence, not a volume observation.

### 5.5 Association evidence

The China Household Electrical Appliances Association is a high-quality professional association source for the air-conditioner path. Its official 2024 air-conditioner committee article is dated 2024-05-24 and states that 2024 Q1 air-conditioner production reached 68.78 million units and grew by 16.5% year over year. A second official association page reproduces the same Q1 production and describes retail-volume/retail-value context.

The association's official magazine also publishes a recurring monthly export table. The September 2024 issue, published 2024-11-08, reports `家用空调器` monthly export quantity `4,039,692 台`, cumulative quantity `66,841,194 台`, and cumulative quantity YoY `26.66%`; the July 2025 issue, published 2025-09-08, reports `5,133,858 台`, cumulative quantity `61,001,511 台`, and cumulative quantity YoY `6.05%`. Both tables explicitly separate quantity from dollar amount and state that the data source is GACC. Additional same-method periods were found for 2023-09, 2024-05, 2024-11, and 2024-12.

This is a clear S2 professional observation with an explicit household product label, physical unit, recurring periods, publication dates, and GACC source attribution. It is accepted as `TRADE` with `metricKey=air_conditioner.export_volume`, determinism `EVIDENCE_BACKED_NUMERIC`, and `PUBLICATION_PIT_ONLY` / `VALUE_VERSION_UNVERIFIED`. It is not promoted to S0 statutory authority and does not claim an HS code that the report does not expose.

CAAM was also probed as a control association. Its official 2025 March article provides monthly and Q1 automobile production/sales figures. It is not a representative lithium or air-conditioner source and must not be used to inflate D4 support claims.

### 5.6 Price path and AKShare boundary

The existing AKShare client interface has no commodity, futures, spot, or general price-series operation. Its `historicalMarketData` and `indexDaily` operations serve market instruments/indexes, while `sectorPerformance` serves industry-board snapshots. They do not establish an industry operating-price path.

The MIIT lithium page provides explicitly scoped average prices for battery-grade lithium carbonate and lithium hydroxide. Those can support a narrow `PRICE` observation with product and method metadata. They must not be labeled as:

- futures price;
- spot price;
- industry-wide ASP;
- a daily/weekly market series.

No AKShare dependency or operation is added in D4. If price becomes a required live acceptance metric, it needs a separate, source-specific design and transport probe.

## 6. Source governance and design matrix

| Source family | Authority | Proven observations | Retrieval form | Publication/history | Main failure/gap | Future feasibility |
|---|---|---|---|---|---|---|
| NBS | S0_STATUTORY | Industrial product production; manufacturing PMI control | Official portal, release pages, PDF/table | Monthly capability explained; annual table proven; history available in portal | Interactive table identifier/schema and revision behavior not captured | Narrow official-statistics operation; strong candidate for production |
| MIIT | S1_OFFICIAL | Lithium output, segment output, material output, explicitly scoped average prices; broader electronics/household-appliance releases | Official HTML, sometimes PDF/prose | Recurring annual/YTD/H1 pages with explicit publication dates | HTML prose; lower-bound qualifiers; local direct 403; mixed enterprise/association methodology | Narrow evidence-backed MIIT operation, not generic API parsing |
| Customs | S0_STATUTORY | Physical quantity/value headers and broad `Air conditioners` annual trade row; HS4 index | Official portal/static table and monthly bulletin index | 2024 annual row published 2025-01-23; recurring monthly/annual table family; value-version unverified | Local TLS, direct query/session path, and exact household HS mapping remain unresolved | Broad S0 trade evidence; direct GACC runtime contract still needs a bounded transport task |
| China Household Electrical Appliances Association | S2_PROFESSIONAL; data source GACC | Air-conditioner Q1 production plus recurring household-air-conditioner export quantity | Official HTML and directly retrievable PDFs | 2023-09 through 2025-07 comparable monthly tables; issue publication dates explicit | No HS code in the household table; preserve S2 origin and GACC data-source attribution | Proven narrow household `TRADE`/`air_conditioner.export_volume` fallback |
| CAAM control | S2_PROFESSIONAL | Automobile monthly/Q1 production and sales | Official HTML article | Recurring article pages; local TLS issue | Not representative for D4 industries | Control only |
| Existing AKShare | S3 wrapper/host, underlying source varies | Industry board snapshot and market/index operations | Existing in-repo wrapper boundary | No operating-series evidence in current interface | No commodity/futures/spot operation; wrapper/source distinction | Do not expand without a new scoped task |

### Authority and method provenance

Every future observation must preserve, separately:

- `originPublisher`: NBS, MIIT, Customs, CHEAA, etc.;
- `hostPlatform`: official portal or article host;
- `retrievalProvider`: direct HTTP, current plugin, web reader, or approved wrapper;
- `sourceAuthority`: S0–S4 classification;
- `sourceRef`: URL plus report/table/document identity;
- `retrievedAt` and raw transport diagnostics;
- publication and version/revision fields.

AKShare is a retrieval wrapper/host boundary, not the publisher. A wrapper failure is not automatically an underlying source failure. The future diagnostic must distinguish:

- `SOURCE_NOT_AVAILABLE`
- `ENDPOINT_CHANGED`
- `RATE_LIMITED`
- `PROXY_ERROR`
- `SSL_ERROR`
- `PARSER_SCHEMA_DRIFT`
- `NO_PUBLIC_HISTORY`
- `AUTH_REQUIRED`

The live probe additionally records raw HTTP statuses such as `HTTP_403_ACCESS_GATE` when they do not safely map to one of those canonical categories. The raw status must not be discarded.

### Access and licensing posture

The probed sources are publicly readable or publicly indexed, but public visibility does not imply stable API access, unrestricted automation, or a license to redistribute raw content. Future implementation must record whether the path is public/free, requires a cookie/session, is rate-limited, or requires authorization. No credential, cookie, or bypass was used in D4.

## 7. Identity, unit, scope, and transformation rules

### Industry and metric identity

Use the existing canonical industry mapping and target identity. D4 does not introduce a new industry ID registry, ontology, or taxonomy. A metric key is a narrow stable label coupled with source-preserved product/segment scope.

Examples of acceptable narrow identities:

- `room_air_conditioner.production` + product label `房间空气调节器` + unit `万台`;
- `lithium_battery.total_output` + product label `锂离子电池` + unit `GWh`;
- `lithium_battery.material_average_price` + `battery-grade lithium carbonate` + unit `万元/吨`;
- `air_conditioner.export_volume` for the explicit `家用空调器` source label, with CHEAA/GACC provenance retained; a direct GACC HS-coded contract remains a separate improvement.

`all lithium battery`, `power`, `storage`, and `consumer` are different scopes. A power-battery observation must not be merged into total lithium-battery output. Domestic production, global production, domestic sales, and exports are different geographies/scope combinations.

At minimum the future mapping must distinguish `CHINA_NATIONAL`, `GLOBAL`, and a named region. It must not mix them in one series.

### Period and aggregation

Every accepted point declares:

- period start/end;
- release/observation frequency when evidenced;
- `PERIOD`, `YTD`, or `POINT_IN_TIME` aggregation;
- calendar/fiscal semantics when relevant.

YoY and MoM are separate comparative values. They cannot be used to reconstruct an absent absolute. A point-in-time inventory observation cannot be treated as a period flow.

### Safe future transformations

After two comparable accepted points exist, a deterministic Workflow operation may calculate:

- YoY or MoM for comparable periods;
- rolling direction/trend;
- inventory delta;
- price delta;
- production-versus-sales spread when both scopes, units, periods, and population definitions are aligned.

These transformations must preserve input references and must never become source observations. No source averaging is permitted.

## 8. Availability, quality, and failure semantics

Future source operations should report one of:

- `AVAILABLE` — required truth fields and source identity are proven;
- `PARTIAL` — some observations/periods are usable, but history, schema, scope, or transport is incomplete;
- `UNAVAILABLE` — the source family or required metric is not available;
- `TRANSPORT_UNAVAILABLE` — the underlying source may exist but the approved retrieval path failed;
- `SCOPE_UNSUPPORTED` — source data exists but does not match the required product/segment/geography;
- `PIT_UNVERIFIED` — publication may be known, but required value-version PIT cannot be proven.

Missingness must not collapse into zero. At minimum distinguish:

- zero reported;
- not reported;
- not applicable;
- source unavailable;
- transport unavailable;
- scope unsupported;
- PIT unverified.

The quality gate must fail closed for an observation missing value, unit, period, geography, product scope, or source identity. A source may still be retained as document Evidence and used for a qualitative module gap, but not as numeric truth.

Coverage is a quality dimension. A source with one current point and no public history is not equivalent to a usable series. The requested 12 monthly/8 quarterly history targets are evaluation targets, not universal requirements; where the source cannot provide them, the result must say `PARTIAL`, `NO_PUBLIC_HISTORY`, or `PIT_UNVERIFIED` rather than inventing history.

## 9. Representative industry outcomes

### Lithium battery: PARTIAL / evidence-backed operating observations

The lithium path is `OPERATING_OBSERVATION_READY` for a narrow evidence-backed subset and `PARTIAL` for a production-grade recurring series:

- `PRODUCTION`: supported by MIIT official recurring HTML reports, including total output and segment output. Qualifiers such as `above` must be retained.
- `PRICE`: supported for explicitly named battery-grade materials and article-period average prices. This is not a spot/futures/ASP series.
- `EXPORT_VOLUME`: not currently supported by the live evidence. MIIT provides export value; Customs exact lithium-battery HS/volume mapping was not proven.
- monthly point series, revision/value-version PIT, inventory, capacity utilization, operating rate, orders, and backlog: not currently proven.

Thus the live acceptance result should be recorded as **PARTIAL**, not as a complete lithium operating-series capability.

### Household air conditioner: AIR_CONDITIONER_SECOND_CLASS_PROVEN

The air-conditioner path now has two proven recurring metric classes for the narrow contract:

- `PRODUCTION`: supported by NBS 2025 annual output with explicit unit and period; monthly NBS capability is documented but exact table/API identity remains to be captured.
- association production: supported as S2 cross-check for 2024 Q1, with explicit date and unit.
- `TRADE` / `air_conditioner.export_volume`: supported for the exact CHEAA report label `家用空调器`, with monthly quantity in `台`, explicit quantity/value headers, two comparable periods (2024-09 and 2025-07), publication dates, direct PDF retrieval, and explicit GACC data-source attribution. The direct GACC annual `Air conditioners` row independently proves the statutory quantity/value header and broad trade class, but is not relabeled as household-only.
- retail sales/shipment data: association reports distinguish retail context from production, but no common absolute sales series is frozen.
- capacity/utilization/inventory/backlog: not proven.

Thus the air-conditioner result is **AIR_CONDITIONER_SECOND_CLASS_PROVEN**. The source is `EVIDENCE_BACKED_NUMERIC`, `S2_PROFESSIONAL` for the recurring household table, with `PUBLICATION_PIT_ONLY` and `VALUE_VERSION_UNVERIFIED`. Runtime implementation remains unauthorized pending Sol review.

### Banking control

Banking is a negative control, not a manufacturing target. The contract must not force production/capacity/utilization semantics onto banking. A future bank-specific operation may use deposits, loans, NIM, asset quality, or other domain metrics under a separate scope; D4 does not design or implement it.

## 10. Integration hypothesis for a future implementation

This section is deliberately non-implementing.

1. `ResearchService.startIndustryResearch` remains the entry point.
2. The target's existing canonical industry identity and module-driven research design determine required operating metric kinds.
3. The Workflow requests only the narrow metric classes required by the relevant module and target scope.
4. A narrow source operation under the existing research-acquisition plugin boundary retrieves source evidence and, only when truth fields are proven, emits observation candidates.
5. The Workflow validates PIT, authority, determinism, unit, period, geography, product scope, source lineage, and conflicts.
6. Accepted observations are attributable numeric Evidence for the Industry modules and report builder.
7. The Skill reasons over accepted observations and documents; it does not own source acquisition or numeric truth.
8. The report includes observation rows with provenance and explicit unavailable/partial states.
9. Knowledge writes remain through the existing validated ChangeSet/Writer path. No new automatic observation schema is introduced in this task.

A possible future Workflow file is `workflows/industry-research/operating-observations.ts`, but this is only a naming hypothesis. It must not become a generic data provider or a second Workflow runtime.

## 11. Future live acceptance test design

The first runtime implementation should be accepted only through the normal Industry product path, with no injected observation fixtures:

### Lithium acceptance

- Run one normal Industry research request for a canonical lithium-battery target.
- Require at least one accepted `PRODUCTION` observation and one accepted `PRICE` observation, each with source URL, publisher, unit, period, geography, publication PIT, qualifier/method, and retrieval provenance.
- Confirm export value is not labeled export volume.
- Confirm MIIT lower-bound wording remains a lower bound.
- Confirm absent monthly/inventory/capacity metrics appear as explicit gaps or partial availability.
- Confirm the report and module reasoning cite the observation Evidence rather than model-generated numbers.

### Air-conditioner acceptance

- Run one normal Industry research request for a canonical household-air-conditioner target.
- Require one accepted NBS `PRODUCTION` observation and one accepted `TRADE` observation with `metricKey=air_conditioner.export_volume` for the explicit `家用空调器` scope.
- Require the CHEAA Q1 observation to remain S2 professional evidence and not override NBS without a diagnosed conflict/corroboration decision.
- Confirm exact product labels and units remain visible.
- Confirm the direct GACC broad `Air conditioners` row is not silently relabeled as household air conditioners, and that the CHEAA/GACC-backed household table retains its S2 authority and source-method provenance.
- Confirm the report distinguishes production, trade, retail sales, and shipment terminology.

### Cross-cutting acceptance

- `publishedAt <= analysisAsOf` is enforced using the Shanghai date-only convention.
- A period end date is never used as publication availability.
- Retrieval and origin publisher are distinct.
- Wrapper failure and underlying source failure are distinct diagnostics.
- No source averaging, latest-retrieval selection, interpolation, or reverse-engineered absolute value appears.
- A source without public history is labeled `NO_PUBLIC_HISTORY`/`PARTIAL`, not promoted to a full series.
- Knowledge writes, if enabled through the existing Industry workflow, remain canonical Gateway/Writer writes with source bindings.

## 12. Deferred items

- Runtime `OperatingObservation` TypeScript contracts and validators.
- Exact NBS machine-readable table identifiers and revision/version probe.
- Exact direct GACC query endpoint/session behavior, HS-coded household mapping, and direct S0 runtime retrieval; the narrow household trade class is already proven through recurring CHEAA/GACC-backed tables.
- MIIT HTML parser and lower-bound/qualifier representation.
- Association source normalization and raw-source lineage rules.
- Commodity/futures/spot price integration.
- Monthly breadth, daily/weekly market data, interpolation, and synthetic resampling.
- Observation persistence or Knowledge schema expansion.
- Any new generic provider abstraction, Agent Runtime, or direct Knowledge mutation route.
- Bank-specific operating metrics.

## 13. D4-001-FIX-001 REPORT

**Status:** `SOURCE FEASIBILITY CLOSED / SOL REVIEW PENDING`

**Baseline:**

- required HEAD: `444e65f1f176f04f9c9fdd7e2a22102beee7c4de`
- starting HEAD: `444e65f1f176f04f9c9fdd7e2a22102beee7c4de`
- origin/main: `2b9ddac3cf68432177ee2c6210a466885cf53706`

**Current proven classes:**

- lithium: `PRODUCTION`, `PRICE`
- air conditioner: `PRODUCTION`, `TRADE` with `metricKey=air_conditioner.export_volume`

**Customs probe:**

- official source: General Administration of Customs of the People's Republic of China, official English statistics; recurring major-export quantity/value tables.
- exact table/report: `Major Export Commodities in Quantity and Value,1-12.2024`, published 2025-01-23; recurring monthly bulletin family also exposed through the official statistics index.
- exact commodity: direct GACC table label `Air conditioners`; household-specific recurring report label `家用空调器`.
- HS code: no HS code is supplied in the accepted summary rows; do not invent one or relabel broad GACC `Air conditioners` as household-only. HS4 `8415` remains a broad lead, not the frozen household identity.
- field/header: `Commodity | Quantity Unit | 12 | 1to12 | Percentage Change`, with paired `Quantity | Value` fields. CHEAA household tables use `产品名称 | 当月数量（台） | 累计数量（台） | 数量累计同比增长（%） | 当月金额（美元） | 累计金额（美元） | 金额累计同比增长（%）`.
- quantity/value/index: physical quantity is explicit and separate from dollar value; percentage fields are YoY comparison fields, not quantity values.
- numeric value: direct GACC annual broad row `1to12 quantity = 6,159` in `10000N`; household rows `4,039,692台` for 2024-09 and `5,133,858台` for 2025-07.
- unit: direct GACC `10000N`; household recurring table `台`.
- period: direct GACC 2024-01-01 through 2024-12-31; household recurring periods 2024-09 and 2025-07, with cumulative fields retained separately.
- aggregation: `PERIOD` for monthly/annual observations; cumulative fields are source-reported cumulative/YTD values and are not converted to monthly values.
- geography: China national exports.
- publishedAt: direct GACC annual table 2025-01-23; CHEAA issue publication 2024-11-08 for the 2024-09 row and 2025-09-08 for the 2025-07 row.
- retrieval: direct stable public CHEAA PDF URLs returned HTTP 200; official GACC pages/search/index exposed the exact statutory headers and annual row. For the accepted household recurring path, `originPublisher=CHEAA`, `hostPlatform=CHEAA official web/PDF host`, `retrievalProvider=ResearchHub direct HTTPS`, and `metadata.upstreamDataSource=GACC`; the local direct GACC HTTPS path failed certificate validation (`SSL_ERROR`).
- recurring periods: same CHEAA/GACC-backed methodology observed for 2023-09, 2024-05, 2024-09, 2024-11, 2024-12, and 2025-07; at least two comparable monthly periods are proven.
- authentication/session: no authentication or cookie required for the accepted CHEAA PDF retrieval; direct GACC session/query behavior remains unverified.
- transport: CHEAA PDFs HTTP 200; direct GACC English static pages local `SSL_ERROR`; official web/index access returned source content.
- usable: `YES` for narrow S2/GACC-backed household `TRADE`/`air_conditioner.export_volume`; direct S0 GACC HS-coded runtime path remains a future transport/mapping improvement.

**Alternative probe if Customs volume failed:**

- source: not required; the exact recurring household export-volume class was proven through CHEAA reports explicitly sourced to GACC.
- metric class: `TRADE` / `air_conditioner.export_volume`.
- reason evaluated: the direct GACC page transport was locally certificate-blocked and the broad official summary row did not expose household HS mapping, so the recurring S2 publication was used with authority and source-method provenance preserved.
- usable: `YES`, as `EVIDENCE_BACKED_NUMERIC`, not as an S0 HS-coded claim.

**Air-conditioner result:**

- `PRODUCTION`: proven through NBS annual output and CHEAA production cross-check.
- second metric class: `TRADE`.
- second class proven: `YES` — `air_conditioner.export_volume`.
- source: CHEAA official recurring PDFs, with explicit `家用空调器` product label and `数据来源：海关总署`; direct GACC annual table is corroborating statutory evidence for the broader `Air conditioners` label.
- recurring: `YES` — monthly tables with 2023-09 through 2025-07 examples, including 2024-09 and 2025-07 numeric points.
- PIT quality: `PUBLICATION_PIT_ONLY`; `VALUE_VERSION_UNVERIFIED`.

**Implementation-ready gate:**

- lithium >=2: `YES` — `PRODUCTION` + `PRICE`.
- air conditioner >=2: `YES` — `PRODUCTION` + `TRADE/air_conditioner.export_volume`.
- original threshold lowered: `NO`.

**Observation vocabulary:**

- `TRADE`: retained as the narrow class for trade observations; do not freeze a universal `EXPORT_VOLUME` top-level class without product-specific scope.
- `metricKey`: `air_conditioner.export_volume`.
- source scope retained: direct GACC broad `Air conditioners` remains distinct from CHEAA/GACC-backed `家用空调器`; original units, monthly/annual periods, cumulative fields, publication dates, S2 authority, GACC origin, and transport provider remain visible.

**Final D4 decision:**

- A / PARTIAL: **A. IMPLEMENTABLE_WITH_NARROW_OBSERVATION_CONTRACT**, with source feasibility closed for the two-class gate but runtime implementation still awaiting Sol review/authorization.
- exact justification: lithium and household air conditioners each have two recurring, attributable metric classes. The common contract remains narrow; the household trade class is accepted as evidence-backed S2/GACC-sourced data, while direct GACC HS-coded transport is not overclaimed.

**Future live acceptance:**

- lithium required classes: `PRODUCTION` + `PRICE`.
- air-conditioner required classes: `PRODUCTION` + `TRADE/air_conditioner.export_volume` for `家用空调器`.

**Changed files:**

- `docs/engineering/specs/2026-09-23-industry-operating-observation-d4-v0.1.md`

**Validation:**

- diff check: required `git diff --check` to be run after this documentation update.
- runtime files changed: `NO`.
- temporary files removed: `YES`; no temporary probe files were created.

**Git:**

- FIX-001 commit: `49b24e2210845421ba5bc3b126b6bf38db3bb9d7`.
- remote branch: `origin/codex/d4-001-industry-operating-observation-design`.
- local == remote at FIX-001 completion: `yes`.
- worktree clean at FIX-001 completion: `yes`.

**D4 runtime implementation started:**

- no.

**Notes for Sol:**

- The second air-conditioner class is now proven without changing the accepted architecture. It is a narrow `TRADE` observation with `metricKey=air_conditioner.export_volume`, explicit household product label, physical quantity, recurring monthly periods, publication dates, direct PDF retrieval, and GACC data-source attribution.
- The direct GACC summary table proves quantity/value headers and a broad annual row but does not expose an HS code or household-only scope. The document keeps this limitation explicit and does not promote it to an HS-coded household claim.

## 14. D4-001-FIX-002 REPORT

**Status:** `DOCUMENT RECONCILED / SOL FINAL REVIEW PENDING`

**Baseline:**

- required HEAD: `49b24e2210845421ba5bc3b126b6bf38db3bb9d7`
- starting HEAD: `49b24e2210845421ba5bc3b126b6bf38db3bb9d7`
- origin/main: `2b9ddac3cf68432177ee2c6210a466885cf53706`

**Accepted design:**

- architecture decision: `A. IMPLEMENTABLE_WITH_NARROW_OBSERVATION_CONTRACT`
- source feasibility: `CLOSED`
- lithium classes: `PRODUCTION` + `PRICE`
- air-conditioner classes: `PRODUCTION` + `TRADE / air_conditioner.export_volume`
- original two-class gate lowered: `NO`

**CHEAA/GACC provenance:**

- `originPublisher`: `CHEAA` / China Household Electrical Appliances Association.
- `hostPlatform`: CHEAA official web/PDF host.
- `retrievalProvider`: ResearchHub direct HTTPS retrieval, conceptually; exact implementation field name remains implementation-time detail.
- `sourceAuthority`: `S2_PROFESSIONAL`.
- `determinismClass`: `EVIDENCE_BACKED_NUMERIC`.
- GACC role: upstream data-source and source-method attribution, retained in metadata such as `metadata.upstreamDataSource` or `metadata.dataSourceAttribution`.
- GACC promoted to `originPublisher`: `NO` for the CHEAA PDF observation.
- CHEAA labeled `retrievalProvider`: `NO`; CHEAA is publisher/host, while ResearchHub is the retrieval provider.

**Direct GACC:**

- broad `Air conditioners` scope retained: `YES`.
- household HS mapping claimed: `NO`.
- authority: `S0_STATUTORY` for the direct broad GACC table; the accepted CHEAA/GACC-backed household observation remains `S2_PROFESSIONAL`.

**PIT:**

- publication PIT: `FROZEN` using `publishedAt <= analysisAsOf` and the Shanghai date-only convention.
- value-version PIT: `NOT GENERALLY VERIFIED`; accepted status remains `VALUE_VERSION_UNVERIFIED`.

**Document reconciliation:**

- stale pending commit text removed: `YES`.
- FIX-001 commit recorded: `49b24e2210845421ba5bc3b126b6bf38db3bb9d7`.
- FIX-001 remote state recorded: local and remote matched and the worktree was clean at FIX-001 completion.
- final top-level status: architecture A; source feasibility `CLOSED`; observation contract `DESIGN FROZEN`; provenance semantics `FROZEN`; runtime implementation `NOT STARTED`.

**Changed files:**

- `docs/engineering/specs/2026-09-23-industry-operating-observation-d4-v0.1.md`

**Validation:**

- diff check: `git diff --check`.
- runtime files changed: `NO`.
- network probes run: `NO` for FIX-002; no source re-probe was performed.

**Git:**

- commit: FIX-002 reconciliation commit; its SHA is intentionally not embedded here to avoid self-reference.
- remote branch: `origin/codex/d4-001-industry-operating-observation-design`.
- local == remote: `YES` at FIX-002 completion.
- worktree clean: `YES` at FIX-002 completion.

**D4 runtime implementation started:**

- no.

**Notes for Sol:**

- Only provenance role terminology and stale FIX-001 metadata were reconciled.
- CHEAA remains the publisher and host for the accepted PDF evidence; ResearchHub is the retrieval provider; GACC remains upstream data-source/method attribution.
- No source conclusions, metric classes, PIT semantics, runtime files, probes, or architecture decisions changed.
- The browser-harness executable remained unavailable; live evidence was obtained through official web search/open results and direct read-only HTTPS checks. No runtime implementation was started.

## 15. D4 long-haul implementation appendix

**Status:** `IMPLEMENTED / SOL ACCEPTANCE PENDING`

The approved D4 contract is implemented on the isolated branch
`codex/d4-longhaul-industry-operating-observations` and remains additive to the
existing Industry Workflow, Skill, Knowledge Production Gateway, Writer, and
report path.

Implementation facts:

- `plugins/research-acquisition/industry-operating-observations.ts` owns the
  source-specific HTTPS acquisition, publication-PIT gate, bounded payload
  handling, deterministic parsing, observation validation, and fail-soft
  diagnostics. It does not introduce a provider registry, generic metric
  repository, or new Knowledge schema.
- Lithium uses official MIIT disclosures for `PRODUCTION` and `PRICE`.
  Production preserves the article's lower-bound qualifier; price observations
  are article-period averages and retain `valueVersionPit=UNVERIFIED`.
- Household air conditioner production uses the NBS official PDF. Trade uses
  CHEAA official PDFs with `metadata.upstreamDataSource=GACC`; CHEAA remains
  `originPublisher` and `S2_PROFESSIONAL`, while ResearchHub remains the
  retrieval provider. The parser supports both horizontal and vertical PDF
  text layouts and reads the monthly quantity column rather than cumulative or
  money columns.
- The Workflow independently caps D4 sources and observations, deduplicates
  D4 and ordinary evidence by canonical URL/content hash, routes observations
  only to the market/supply/synthesis Industry modules, and renders the
  code-owned observation table in the existing `Key Metrics & Monitoring`
  report section. Numeric truth is not delegated to the Skill or model.
- The normal runtime injects the acquisition port through application runtime
  construction. Unknown targets return `SCOPE_UNSUPPORTED` without D4 network
  calls, and the default real-acceptance harness is network-disabled unless
  `RESEARCHHUB_RUN_REAL_INDUSTRY_OBSERVATIONS=1` is set.

Live acceptance evidence on 2026-09-23:

- Default harness: `REAL_D4_OPERATING_OBSERVATIONS_NOT_RUN`, `networkCalls=0`.
- Enabled harness: `D4_INDUSTRY_OPERATING_REAL_PRODUCT_PATH_VERIFIED`,
  `networkCalls=5`, no secrets or raw response bodies emitted.
- Lithium accepted both required classes: MIIT `PRODUCTION` and `PRICE`.
- Household air conditioner accepted NBS `PRODUCTION` and CHEAA/GACC-backed
  `TRADE`, including source references bound by the Gateway and report output.
- The MIIT annual fallback also parses the official alias and paired annual
  price sentence; both lithium sources complete without parser drift.

Validation performed for this appendix includes focused parser/workflow tests,
TypeScript typecheck, the default and enabled real harnesses, and the complete
repository/client/build suite recorded in the final task report.
