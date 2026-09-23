# D3-002 v0.1 — Minimal PE/PB Comparable Input Closure

- Task: `RHL-D3-002-DESIGN`
- Status: `DESIGN ACCEPTED / RUNTIME IMPLEMENTATION NOT STARTED`
- Checked: `2026-09-23`
- Branch: `codex/d3-002-comparable-input-design`
- Worktree: `C:\Users\Administrator\Desktop\ResearchHub_Lite_worktrees\D3_002`
- Accepted design chain: `6a7bcde` → `fc19a155` → `7e7aaa75` → `c24a0c249458965a1dcc085c0a4e7f8dc002624a`
- Existing D0 worktree: preserved and untouched

## 1. Decision summary

The current normal Valuation product does not automatically construct a peer
universe. `CompsValuationInput` is caller-supplied and
`executeCompsValuation()` is a deterministic validation and arithmetic seam,
not a discovery adapter.

The live probe establishes a partial future path:

- D3-001 `valuationFinancialIndicators()` returned annual EPS/BVPS rows for all
  four sample issuers.
- The existing CNINFO annual-publication resolver found current annual reports
  for `600519` and `000333`.
- The initial EastMoney industry identity, board-list, board-constituent, and
  real-time spot endpoints remain transport-unavailable in this environment.
- The supplemental EastMoney dedicated peer-comparison endpoints succeeded on
  `datacenter.eastmoney.com` for all four targets, returning bounded target-
  relative cohorts plus raw period, ranking, growth, economics, and scale
  fields.
- Shenwan third-level classification metadata was available through the
  installed wrapper, while its constituent wrapper had a schema mismatch;
  current upstream contains a header-cleaning correction.
- The published direct PE field is explicitly labelled `市盈率-动态`; its
  denominator and period semantics were not established.
- The initial board/spot probe did not establish sufficient comparability
  evidence, but the supplemental dedicated EastMoney comparison probe
  established structured source-specific cohort membership plus growth,
  economics, margin, and scale evidence sufficient to define the frozen narrow
  source-consensus comparability gate.

Therefore the corrected architecture outcome for this design/probe task is:

> **A. IMPLEMENTABLE_WITH_NARROW_CONTRACT**

This is a design-feasibility result, not runtime authorization. The narrow
future direction is a bounded current-only resolver that preserves dedicated
EastMoney cohort provenance, requires structured scale plus at least one actual
growth/economics profile, reuses D3-001 price/EPS/BVPS/publication evidence,
and computes peer PE/PB from price and common-period EPS/BVPS. No runtime
D3-002 implementation is authorized by this document.

The final hardening state is:

- `SOURCE FEASIBILITY = CLOSED`;
- `COMPARABILITY GATE = FROZEN`;
- `NARROW EXECUTION CONTRACT = FROZEN`;
- `RUNTIME IMPLEMENTATION = NOT STARTED`.

## 2. Forcing function and hard scope

The frozen question is:

> For a selected A-share issuer in a current valuation run, can ResearchHub
> automatically construct a small, attributable, comparability-qualified peer
> set and consistent PE/PB peer multiples so the existing comps/crosscheck path
> can execute without caller-supplied peers, while avoiding deferred EV/debt/
> share dependencies?

This task is design and live-source probe only. The committed change is exactly
this document. No runtime Workflow, Skill, Plugin, Knowledge, Schema, test,
UI, or application-composition file is changed.

Explicitly deferred:

- EV/Revenue, EV/EBITDA, FCF Yield, DCF, cash, debt, net debt, and share history;
- historical automatic peer universes or historical industry membership;
- Company peer graphs, Industry company mapping, and generic peer platforms;
- LLM peer selection, numeric fallback, source averaging, and new provider
  frameworks.

## 3. Current architecture audit

### 3.1 Existing deterministic comps Skill

`skills/comps_valuation/skill.ts:executeCompsValuation()` already owns:

- input date and identity validation;
- source-ID integrity and dangling-source rejection;
- `retrievedAt`, peer `asOf`, and `publishedAt` cutoff checks;
- exact period, currency, metric-unit, and share-basis comparison;
- comparability-evidence presence and vocabulary checks;
- accepted/rejected peer accounting;
- metric-specific diagnostics, so one peer can have PE while PB is
  unavailable;
- deterministic PE/PB/EV/FCF arithmetic through
  `skills/valuation/calculations/comps.ts`;
- min/median/max multiple summaries and explicit selected-multiple policy;
- no automatic averaging between valuation methods.

It does not own candidate discovery, industry resolution, market retrieval,
financial retrieval, publication proof, or comparability evidence acquisition.

### 3.2 Existing Valuation Workflow

`workflows/valuation/workflow.ts` owns the normal target acquisition and D3-001
basis evidence path. It acquires target company-basic, financial, and
historical-market observations, resolves CNINFO annual publication evidence,
constructs the existing target basis, runs deterministic valuation scenarios,
and builds the existing crosscheck.

The current comps path is:

```text
caller supplies input.comps
        -> executeCompsValuation(input.comps)
        -> buildValuationCrosscheck({ compsResult })
        -> optional comps quality/report output
```

When `input.comps` is absent, the Workflow does not construct a peer universe;
the comps section is explicitly optional/unavailable. The normal HTTP/Pi
Valuation entry does not add peer candidates.

### 3.3 Current contract mismatch

`ComparableCompanyInput` requires `marketCap`, `grossDebt`, and `cash` even for
PE/PB. `ComparableFinancials` inherits those requirements. The current PE/PB
implied per-share path also requires target `dilutedShares` because it first
constructs an equity value and divides by shares.

That contract is suitable for the legacy multi-method comparable model, but it
conflicts with D3-001's accepted deferral of debt, cash, and shares. It is not
acceptable to set `grossDebt = 0` or `cash = 0` merely to make PE/PB fit, and
the design does not source deferred fields just because the old interface is
mandatory.

The smallest future automatic PE/PB shape must therefore be additive and
metric-specific. It must not deform `ComparableCompanyInput` or force legacy
EV callers to change.

## 4. Existing strengths to preserve

Any later implementation must preserve the current Skill gates for:

- source references, rights, and retrieval timestamps;
- `asOf` and `publishedAt` rejection;
- exact common periods, currencies, units, and share-basis semantics;
- explicit comparability evidence;
- accepted/rejected peer accounting and method-level diagnostics;
- min/median/max calculation and `peer_median` selection;
- crosscheck basis compatibility and disagreement diagnostics;
- `automaticAveraging = false`;
- caller-supplied legacy EV/Revenue, EV/EBITDA, and FCF inputs.

Industry membership must remain candidate discovery evidence, not an automatic
claim that all existing comparability dimensions are proven.

## 5. Three architectural options

| Dimension | Option A — legacy full financials | Option B — direct observed PE/PB | Option C — recomputed per-share PE/PB |
|---|---|---|---|
| New data required | Market cap, debt, cash, revenue/EBITDA or net income/book equity, and shares as applicable | Current price, source PE/PB, and hidden source denominator semantics | Current price plus common-period EPS/BVPS and publication evidence |
| Debt/cash/shares required | Yes; reopens deferred scope | Not necessarily, but source may embed an unknown share basis | No for peer multiples or subject implied price |
| Denominator semantics | Explicit only if all full financials share one basis | Not established for `市盈率-动态`; PB basis also unproven | Explicit annual EPS/BVPS period and units |
| Source authority | EastMoney numeric would remain S3; CNINFO still needed for publication | EastMoney S3 only unless separately crosswalked | EastMoney numeric S3, AKShare retrieval, CNINFO S0 publication proof |
| PIT integrity | Heavy and still incomplete | Current snapshot only; fixed-asOf unavailable | Current-only; fixed-asOf unavailable without versioned peer universe |
| Period alignment | Possible but expensive | Not proven | Subject-selected D3-001 fiscal year; no automatic backshift |
| Provenance | Many fields and deferred components | Direct field lineage but weak semantic proof | Separate identity, market, financial, publication, and comparability refs |
| Existing code reuse | Reuses legacy arithmetic but smuggles deferred inputs | Little safe reuse beyond display | Reuses D3-001 price/EPS/BVPS/publication seams and existing crosscheck adapter |
| Runtime complexity | High; many fields and calls | Low but semantically unsafe | Bounded discovery plus per-peer evidence calls |
| Recommendation | Reject for D3-002 scope | Reject as canonical calculation input | Recommended narrow additive direction; runtime remains Sol-gated |

### Option A — keep `ComparableCompanyInput`

This is not a valid D3-002 v0.1 choice. It requires debt/cash and potentially
shares even when the selected method is only PE or PB. It would reintroduce the
very deferred fields D3-001 deliberately left unavailable and would encourage
zero-filling or unproven balance-sheet acquisition.

### Option B — direct source PE/PB

The direct source exposes `市盈率-动态` and `市净率`, but the probe and public
interface description do not establish whether PE is TTM, forecast,
annualized, or another dynamic convention. The PB report period and update
timing are likewise not established. These fields may be useful as display or
discovery evidence, but they cannot be combined with the target's annual EPS or
BVPS as canonical peer multiples.

### Option C — recomputed per-share PE/PB

The mathematically coherent future shape is:

```text
peer PE = peer current price / peer common-period annual EPS
peer PB = peer current price / peer common-period annual BVPS

subject PE implied price = subject common-period EPS × selected peer PE
subject PB implied price = subject common-period BVPS × selected peer PB
```

This avoids debt, cash, and diluted shares, but only if period, unit, currency,
price timing, and publication/value-version semantics are explicit. The
supplemental probe establishes a bounded source candidate path and a narrow
comparability gate; runtime authorization still requires Sol review.

## 6. Mathematical equivalence and limitation

Under one identical period and share basis:

```text
marketCap / netIncome
= (price × shares) / (EPS × shares)
= price / EPS
```

Likewise:

```text
marketCap / bookEquity
= (price × shares) / (BVPS × shares)
= price / BVPS
```

The equivalence fails when market capitalization and the denominator use
different basic/diluted shares, weighted-average versus end-period shares,
continuing versus total operations, restated versus unrevised periods, units,
currencies, or fiscal periods. Therefore the future resolver must use the
per-share formula directly and must not infer equivalence from unrelated
market-cap, net-income, or book-equity fields.

## 7. Live probe method and environment

Checked on `2026-09-23` from the D3-002 worktree using the installed AKShare
bridge environment:

- Python `3.12.10`;
- local AKShare `1.18.64`;
- direct public AKShare calls, without fixtures;
- existing TypeScript D3-001 CNINFO client for official publication checks;
- no raw response bodies or credentials persisted;
- transport failures recorded as failures, never as empty successful data.

Public AKShare documentation was also checked for the actual output contracts:
[stock data documentation](https://akshare.akfamily.xyz/data/stock/stock.html).
The installed source implementation was inspected to confirm the endpoint field
maps and EastMoney URLs used by each function.

## 8. Live source feasibility

### 8.1 Endpoint matrix

| Operation | Live result on 2026-09-23 | Observed contract / fields | Design consequence |
|---|---|---|---|
| `stock_individual_info_em` | `ProxyError` for all four targets at `push2.eastmoney.com` | `行业`, `总市值`, `最新`, `总股本`, `股票代码`, `股票简称` | Intended target-industry lookup and identity/scale probe unavailable |
| `stock_board_industry_name_em` | `ProxyError` at `17.push2.eastmoney.com` | Current board name/code, board total market value, gain counts | No live board universe or target board code established |
| `stock_board_industry_cons_em` | `ProxyError` for tested `白酒` and `银行` calls at `17.push2.eastmoney.com` | Code, name, latest price, dynamic PE, PB, volume and trading fields | No live constituent counts or membership proof established |
| `stock_zh_a_spot_em` | `ProxyError` at `82.push2.eastmoney.com` | Latest price, dynamic PE, PB, total/float market cap; market-cap unit is CNY according to docs | No live current market-cap filter or current snapshot accepted |
| `stock_zh_a_hist` | `600519`: 17 rows for 2026-09-01…2026-09-23; other three returned `ProxyError` at `push2his.eastmoney.com` | Daily unadjusted rows with date, open, close, high, low, volume, amount and turnover | Existing D3-001 current-mode price seam is reusable, but transport is not uniformly reliable |
| `stock_financial_analysis_indicator_em` | Succeeded for all four | Annual rows include `REPORT_DATE`, `NOTICE_DATE`, `EPSJB`, `BPS`, `CURRENCY` plus many other indicators | D3-001 financial numeric seam is reusable per peer |
| CNINFO annual resolver | `FOUND` for `600519` and `000333` FY2025 | Official title, timestamp, Shanghai calendar date, PDF URL, CNINFO S0 provenance | D3-001 publication proof is reusable per peer |

The EastMoney errors are explicit proxy transport failures, not valid empty
universes. The probe therefore does not report candidate counts, accepted peers,
or current PE/PB values.

### 8.2 Financial and official controls

The four direct EastMoney financial calls returned:

| Target | Rows | FY2025 report date | FY2025 notice date | EPSJB | BPS |
|---|---:|---|---|---:|---:|
| `600519` | 103 | 2025-12-31 | 2026-04-17 | 65.66 | 195.3554497 |
| `000333` | 79 | 2025-12-31 | 2026-03-31 | 5.80 | 29.3822620 |
| `300750` | 41 | 2025-12-31 | 2026-03-10 | 16.14 | 73.8655343 |
| `601398` | 85 | 2025-12-31 | 2026-03-28 | 1.00 | 10.83 |

These are current EastMoney observations, not statutory numeric values. The
existing D3-001 normalization must remain the only numeric path; no duplicate
financial adapter is proposed.

The existing CNINFO resolver independently returned:

| Target | Filing | Official timestamp | Shanghai calendar date | URL |
|---|---|---|---|---|
| `600519` | `贵州茅台2025年年度报告` | `2026-04-16T16:00:00Z` | 2026-04-17 | `https://static.cninfo.com.cn/finalpage/2026-04-17/1225114741.PDF` |
| `000333` | `2025年年度报告` | `2026-03-30T16:00:00Z` | 2026-03-31 | `https://static.cninfo.com.cn/finalpage/2026-03-31/1225065145.PDF` |

This proves that publication evidence can be acquired per peer through the
existing CNINFO boundary. It does not prove a historical numeric version of the
EastMoney EPS/BVPS row.

### 8.3 Direct PE/PB semantics

The AKShare source maps both `stock_zh_a_spot_em` and
`stock_board_industry_cons_em` fields as:

- `市盈率-动态`;
- `市净率`.

The public documentation gives field names but no denominator period, update
cutoff, restatement policy, or share basis for those values. The probe could not
obtain rows to reverse-check them. They are therefore not suitable as canonical
peer PE/PB inputs and must not be combined with D3-001 annual EPS/BVPS.

### 8.4 Supplemental Structured Peer-Comparison Probe

The initial `push2` conclusion was provisional because it tested only board and
spot routes; its provisional architecture outcome was the historical initial C
finding that a deterministic automatic peer set was not yet proven. That
finding remains preserved as the result of the first probe only. The installed
AKShare `1.18.64` operations below were then called
for `SH600519`, `SZ000333`, `SZ300750`, and `SH601398`:

| Operation | Raw reportName | Installed wrapper result | Raw result | Host |
|---|---|---|---|---|
| `stock_zh_growth_comparison_em` | `RPT_PCF10_INDUSTRY_GROWTH` | success, 8 rows per target | success, 8 rows per target | `datacenter.eastmoney.com` |
| `stock_zh_valuation_comparison_em` | `RPT_PCF10_INDUSTRY_CVALUE` | success for three; `601398` `KeyError` because `QYBS` is absent | success for all four | `datacenter.eastmoney.com` |
| `stock_zh_dupont_comparison_em` | `RPT_PCF10_INDUSTRY_DBFX` | success, 8 rows per target | success, 8 rows per target | `datacenter.eastmoney.com` |
| `stock_zh_scale_comparison_em` | `RPT_PCF10_INDUSTRY_MARKET` | success, one target row because the wrapper filters `CORRE_SECUCODE` to the target | success with target plus top peer rows when the raw cohort filter is used | `datacenter.eastmoney.com` |

All sixteen raw comparison requests succeeded in the normal environment. An
isolated `requests.Session(trust_env=False)` probe also succeeded for all
sixteen. Therefore the result is not `ENVIRONMENT_TRANSPORT_LIMITATION` for
the dedicated comparison host; the original failures remain specific to
`push2.eastmoney.com`, `17.push2.eastmoney.com`, `82.push2.eastmoney.com`, and
`push2his.eastmoney.com`.

The raw payload was inspected without persisting complete response bodies. The
common raw identity fields were `SECUCODE`, `CORRE_SECUCODE`,
`CORRE_SECURITY_CODE`, `CORRE_SECURITY_NAME`, `PAIMING`, and `TOTAL_COUNT`.
The family-specific fields were:

| Raw family | Period/date metadata | Actual structured fields inspected | Count/ranking behavior |
|---|---|---|---|
| Growth | `REPORT_DATE=2025-12-31 00:00:00` | `MGSY_3Y`, `MGSYTB`, `YYSR_3Y`, `YYSRTB`, `JLR_3Y`, `JLRTB`; forecast keys `*_1E`, `*_2E`, `*_3E` were excluded | six coded peers plus target and aggregate rows; `TOTAL_COUNT` was 20, 13, 107, and 42 for the four targets |
| Valuation | `REPORT_DATE=2025-12-31 00:00:00` | `PB`, `PB_MRQ`, `PE_TTM`, `PE_1Y`, `PEG`, plus raw identity/ranking fields | six coded peers plus target and aggregate rows; `TOTAL_COUNT` was 20, 13, 107, and 42 |
| DuPont | `REPORT_DATE=2025-12-31 00:00:00` | `ROE_AVG`, `XSJLL_AVG`, `TOAZZL_AVG`, and raw `*_L1`/`*_L2`/`*_L3` fields | six coded peers plus target and aggregate rows; `TOTAL_COUNT` was 20, 13, 107, and 42 |
| Scale | `REPORT_TYPE=2026年中报` | `TOTAL_CAP`, `FREECAP`, `TOTAL_OPERATEINCOME`, `NETPROFIT`, and all four rank fields | raw cohort query returned five rows; `result.count` was 22, 15, 109, and 44; targeted raw filters returned individual peers |

The raw target/peer identity and representative rows included:

| Target | Growth representative | Valuation representative | DuPont representative | Scale representative |
|---|---|---|---|---|
| `600519` | `600809 山西汾酒`, `REPORT_DATE=2025-12-31`, `JLR_3Y=14.66` | `000858 五粮液`, `REPORT_DATE=2025-12-31`, `PB=2.2830`, `PE_TTM=20.9280` | `600809 山西汾酒`, `ROE_AVG=38.17`, `XSJLL_AVG=32.85` | `000858 五粮液`, `REPORT_TYPE=2026年中报`, `TOTAL_CAP=273808628672.7` |
| `000333` | `002668 TCL智家`, `REPORT_DATE=2025-12-31`, `YYSR_3Y=16.69` | `002668 TCL智家`, `REPORT_DATE=2025-12-31`, `PB=2.7561`, `PE_TTM=9.8026` | `002668 TCL智家`, `ROE_AVG=52.31`, `XSJLL_AVG=10.74` | `000651 格力电器`, `REPORT_TYPE=2026年中报`, `TOTAL_CAP=213861671191.38` |
| `300750` | `002058 紫竹高科`, `REPORT_DATE=2025-12-31`, `MGSY_3Y=-32.51` | `603026 石大胜华`, `REPORT_DATE=2025-12-31`, `PB=2.8328`, `PE_TTM=26.6511` | `002058 紫竹高科`, `ROE_AVG=36.89`, `XSJLL_AVG=5.57` | `300014 亿纬锂能`, `REPORT_TYPE=2026年中报`, `TOTAL_CAP=109860160064.25` |
| `601398` | `601128 常熟银行`, `REPORT_DATE=2025-12-31`, `YYSR_3Y=9.67` | `002948 青岛银行`, `REPORT_DATE=2025-12-31`, `PB=0.8637`, `PE_TTM=6.1329` | `601128 常熟银行`, `ROE_AVG=13.96`, `XSJLL_AVG=37.10` | `601939 建设银行`, `REPORT_TYPE=2026年中报`, `TOTAL_CAP=2856676165532.28` |

Authority is kept separate: EastMoney is the original publisher/aggregator
surface classified as `S3_AGGREGATOR`; AKShare is only the retrieval library;
CNINFO remains `S0_STATUTORY` for publication proof. Peer-cohort membership is
not an official company fact and must never be expanded into business model,
product, customer, or geography claims.

The `TOTAL_COUNT` value is a source-reported cohort size, not the number of
rows returned by the wrapper. Aggregate rows such as `行业平均` and `行业中值`
are not peers and must be excluded. The target row is also excluded from the
candidate set.

#### Year-label drift and period truth

The installed and current-upstream comparison source both contain display
mappings such as `MGSYTB -> 24A`, `MGSY_1E -> 25E`, and DuPont `*_L1 -> 24A`.
On this probe the raw growth and DuPont payloads reported
`REPORT_DATE=2025-12-31`, while those display labels still said `24A`. This is
year-label drift. The display labels are not period truth and must not enter a
future contract. A narrow design may use only raw actual keys such as `*_3Y`
and `*_AVG`, anchored to raw `REPORT_DATE`, until field-level period semantics
are explicitly documented. Forecast `E` fields are excluded.

#### Peer cohort consistency

The four families do not describe one identical universe. The following coded
sets were returned after excluding aggregate rows; the target is shown in each
set because the source includes it, but the future resolver must remove it.

| Target | Growth cohort sample | Valuation cohort sample | DuPont cohort sample | Scale top-peer sample | All-four intersection excluding target |
|---|---|---|---|---|---|
| `600519` | `000995,000860,600809,600519,600197,603919` | `000858,603198,600559,603369,600519,603919` | `600809,600519,000568,603198,600779,603369` | `000858,600809,000568` | none |
| `000333` | `600983,002668,000921,200521,000521,000333` | `002668,000333,001387,600690,000651,600983` | `002668,000651,000921,000333,600690,001387` | `000651,600690,000921` | none |
| `300750` | `002058,002074,688772,300409,688155,300750` | `603026,688353,300619,300390,002812,300750` | `301513,920289,002058,301662,300750,920523` | `300014,301217,301511,002709` | none |
| `601398` | `002948,600926,002958,601665,601128,601398` | `002948,601128,601665,601963,600926,601398` | `601838,601128,600926,600036,002142,601398` | `601939,601288,601988,600036` | none |

The overlap is therefore evidence to preserve, not evidence that all four
families share a common universe. A candidate appearing in multiple families is
stronger; a candidate appearing in one family remains source-specific evidence.
The resolver must preserve each membership observation instead of silently
intersecting or averaging cohorts.

#### Growth, economics, and scale semantics

- `MGSY_3Y`, `YYSR_3Y`, and `JLR_3Y` provide historical actual growth-profile
  candidates when finite; raw `*_TB` fields are actual-looking but remain
  period-label-sensitive until their raw field semantics are frozen.
- `ROE_AVG`, `XSJLL_AVG`, and `TOAZZL_AVG` provide structured profitability,
  margin, and economics observations anchored to the raw report date.
- Asset turnover is not capital-intensity evidence. `capital_intensity` stays
  unsupported.
- `TOTAL_CAP` and `FREECAP` are current scale observations. Revenue and net
  profit in the scale payload carry `REPORT_TYPE=2026年中报`; those report-period
  metrics must not be conflated with current market capitalization.
- The scale endpoint can replace `stock_zh_a_spot_em` as a candidate scale
  dependency when queried through a controlled raw route. D3-001's normalized
  market-price path remains the preferred price source.

#### Shenwan probe and authority

Installed AKShare results were separated from current-upstream evidence:

| Operation | Installed `1.18.64` result | Authority/host interpretation |
|---|---|---|
| `sw_index_third_info()` | success, 335 level-3 rows | Legulegu-hosted classification/aggregator data |
| `sw_index_third_cons()` | `ValueError: Length mismatch` because the live table had 19–20 columns while the wrapper expected 17 | Legulegu host; installed wrapper/schema mismatch, not source infeasibility |
| `stock_industry_clf_hist_sw()` | wrapper SSL verification failure against `www.swsresearch.com` | SWS-hosted classification file; an isolated `verify=False` probe retrieved 12,920 rows, but this is not accepted runtime behavior |
| `index_component_sw()` | available for ordinary SWS index components | Not a substitute for third-level target industry membership |

The isolated SWS classification-file probe mapped the latest observed rows for
the samples as follows: `600519 -> 340501` (白酒), `000333 -> 330102` (空调),
`300750 -> 630701` (锂电池), and `601398 -> 480201` (国有大型银行). The
classification file carried admission/update dates, but target constituent
membership through the installed third-level wrapper was not accepted because
of the schema mismatch and subsequent Legulegu rate limiting.

Current AKShare upstream was inspected separately. Its [`index_sw.py` source](https://github.com/akfamily/akshare/blob/main/akshare/index/index_sw.py)
contains header cleaning for the expanded Legulegu table and recognizes fields
including `ROE(%)`, current market value, and actual growth columns. The current
upstream source is therefore ahead of installed `1.18.64`; no dependency or
isolated latest-version environment was installed for this task. The upstream
source is the relevant correction evidence, not runtime authorization.

Shenwan data must be labelled accurately: the Legulegu route is an aggregator
retrieval surface, while the SWS classification workbook is an SWS-hosted
classification artifact. Neither source's PE/PB fields become canonical
valuation inputs.

Because the installed Shenwan constituent wrapper failed before returning target
rows, no EastMoney-versus-Shenwan constituent intersection is claimed. The
available cross-source evidence is target classification mapping only; a future
probe may use intersection as a confidence signal but must not require it by
default or fabricate membership from industry names.

#### Corrected comparability dimensions

| Dimension | Supplemental status | Boundary |
|---|---|---|
| `business_model` | `UNSUPPORTED` | no structured proof |
| `customer_decision` | `UNSUPPORTED` | no structured proof |
| `product_service` | `COARSE_PROXY_ONLY` | source cohort/industry only |
| `economics` | `STRUCTURED_PROVABLE` | ROE, net margin, asset turnover observations |
| `growth_profile` | `STRUCTURED_PROVABLE` | raw 3Y actual growth with report-date anchoring |
| `margin_structure` | `STRUCTURED_PROVABLE` | raw net-margin observations |
| `capital_intensity` | `UNSUPPORTED` | asset turnover is not a substitute |
| `geography` | `UNSUPPORTED` | no structured evidence |
| `scale` | `STRUCTURED_PROVABLE` | current cap/free-cap plus separately dated report metrics |

This is enough to evaluate a narrow PE/PB-only contract, but not enough to
claim that all nine legacy generic dimensions are proven.

## 9. Target discovery and candidate universe design

### 9.1 Initial board-path alternative

The initial board hypothesis remains a valid alternative only if its transport
is restored. It is not a mandatory dependency after the supplemental probe. Its
current-mode sequence was:

1. Resolve the target's exact A-share identity (`ticker`, exchange, company ID)
   through existing identity helpers.
2. Read the target's EastMoney `行业` value from
   `stock_individual_info_em`.
3. Match that value exactly to one row from
   `stock_board_industry_name_em`, obtaining the board code.
4. Query `stock_board_industry_cons_em` by board code and require the target
   ticker to be present in the returned constituent rows.
5. Exclude the target and require each remaining candidate to have a valid
   six-digit A-share identity.

No fuzzy name matching, substring fallback, or board-name guessing is allowed.
No exact board match, multiple exact matches, or failed membership check yields
`INDUSTRY_MAPPING_UNRESOLVED` and no automatic comps result.

The initial live probe could not execute steps 2–4 because all three relevant
EastMoney endpoint families were transport-unavailable. This historical result
is retained below; the dedicated comparison route now supplies the primary
bounded candidate-universe hypothesis.

| Target | Resolved industry | Board source | Candidate count | Sample candidates | Ambiguity |
|---|---|---|---:|---|---|
| `600519` | unavailable in probe | unavailable | unavailable | none claimed | unresolved by transport |
| `000333` | unavailable in probe | unavailable | unavailable | none claimed | unresolved by transport |
| `300750` | unavailable in probe | unavailable | unavailable | none claimed | unresolved by transport |
| `601398` | unavailable in probe | unavailable | unavailable | none claimed | unresolved by transport |

### 9.2 Initial board-path target/peer evidence matrix

The following is the complete bounded evidence record for the initial board
path. It does not claim a candidate universe where transport stopped before
candidate construction. `NOT_PROBED` means that the stage was not reached; it
is not an accepted-peer rejection after a completed comparability evaluation.

| Target | Candidate | Industry evidence | Scale evidence | Price | EPS | BVPS | Official publication | PE recomputable | PB recomputable | Comparability | Rejection/status |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `600519` | none established | `INDUSTRY_DISCOVERY_TRANSPORT_UNAVAILABLE` | `INDUSTRY_DISCOVERY_TRANSPORT_UNAVAILABLE` | target historical row observed; peer not probed | target/peer candidate not paired | target/peer candidate not paired | target CNINFO FY2025 control available; peer not probed | no accepted peer | no accepted peer | not reached | no candidate universe accepted |
| `000333` | none established | `INDUSTRY_DISCOVERY_TRANSPORT_UNAVAILABLE` | `INDUSTRY_DISCOVERY_TRANSPORT_UNAVAILABLE` | peer not probed | target/peer candidate not paired | target/peer candidate not paired | target CNINFO FY2025 control available; peer not probed | no accepted peer | no accepted peer | not reached | no candidate universe accepted |
| `300750` | none established | `INDUSTRY_DISCOVERY_TRANSPORT_UNAVAILABLE` | `INDUSTRY_DISCOVERY_TRANSPORT_UNAVAILABLE` | peer not probed | target/peer candidate not paired | target/peer candidate not paired | peer publication control not probed | no accepted peer | no accepted peer | not reached | no candidate universe accepted |
| `601398` | none established | `INDUSTRY_DISCOVERY_TRANSPORT_UNAVAILABLE` | `INDUSTRY_DISCOVERY_TRANSPORT_UNAVAILABLE` | peer not probed | target/peer candidate not paired | target/peer candidate not paired | peer publication control not probed | no accepted peer | no accepted peer | not reached | no candidate universe accepted |

Accepted peer count for the initial board path is therefore `0` because no
candidate universe was accepted, not because a completed universe produced zero
valid peers. No row in this matrix is an accepted peer or a runtime result.

### 9.3 Industry is candidate discovery only

Same-board membership is not proof of business-model, product, customer,
economics, growth, margin, capital-intensity, geography, or scale comparability.
It may supply one `industry_membership` evidence item in a future additive
contract. It must not be expanded into arbitrary values for the existing nine
`COMPARABILITY_DIMENSIONS`.

### 9.4 Initial board funnel (not recommended as the primary route)

If the missing board/spot source gates are later proven, the initial funnel
would be:

```text
exact target identity
  -> exact current industry board and membership
  -> exclude target and invalid identities
   -> current market-cap availability
   -> scale profile, without a frozen round-number band
  -> section-17 deterministic ordering and cap of 12 expensive candidates
  -> common-period EPS/BVPS and publication checks
  -> deterministic comparability gate
  -> 3–8 accepted metric-specific peers
```

The prior `0.25x–4.0x` scale band is withdrawn as a default. The supplemental
sample has peer/target total-cap ratios far below `0.25x` for most selected
peers, so freezing that band would be arbitrary and would eliminate otherwise
source-qualified candidates. Any future scale threshold requires a fresh
observed-distribution analysis and Sol approval.

The live probe did not establish a practical target-specific universe size.
The documentation example shows that a board constituent query can return an
entire board, so the future resolver must never send an unbounded 50–200-name
board through financial and CNINFO calls.

### 9.5 Corrected dedicated-peer funnel

The recommended design funnel is now:

```text
exact target identity
  -> raw EastMoney dedicated peer-comparison cohorts
  -> preserve growth/valuation/DuPont membership observations separately
  -> exclude target and aggregate rows
  -> targeted raw scale profile for each bounded candidate
  -> require at least one raw actual growth or profitability/economics profile
  -> subject-FY D3-001 EPS/BVPS and normalized current price
  -> CNINFO publication proof
  -> deterministic PE/PB recomputation and existing crosscheck
```

The additive narrow evidence contract is:

```text
PeerComparabilityEvidence {
  peerCohortMembership: one or more source-specific EastMoney cohort refs
  scaleProfile: current TOTAL_CAP/FREECAP with separate report-period fields
  growthProfile?: raw 3Y actual growth anchored to REPORT_DATE
  profitabilityProfile?: ROE_AVG / XSJLL_AVG / TOAZZL_AVG
}
```

`peerCohortMembership` and `scaleProfile` are required. At least one actual
`growthProfile` or `profitabilityProfile` observation is also required for a
future accepted peer; when a candidate appears in multiple families, all
memberships and observations are preserved. The source families are not
intersected or averaged. This is deliberately narrower than the legacy
generic comparability contract and is not equivalent to “same industry plus
size.”

Evidence completeness is not the same as actual comparability. In particular:

- `scaleProfile != similar scale`;
- `growthProfile != similar growth`;
- `profitabilityProfile != similar profitability`.

These profiles are observable evidence required by the narrow gate, not a
claim that the values are close, economically interchangeable, or suitable for
investment ranking. No arbitrary absolute-ratio cutoff is frozen. A candidate
must first pass the source-consensus gate below, then its metric-specific
financial, publication, price, and profile evidence is evaluated.

### 9.5.1 Frozen source-consensus gate

The automatic source-consensus gate is exactly:

```text
cohortFamilyCount >= 2
AND (hasGrowthMembership OR hasDupontMembership)
```

The four recognized source families are `GROWTH`, `VALUATION`, `DUPONT`, and
`SCALE`. `SCALE` alone never proves comparability. `VALUATION` alone never
proves comparability. A candidate must therefore have corroboration from at
least two families and at least one growth or DuPont membership observation;
the scale profile remains a required separate evidence item rather than a
substitute for that consensus.

The bounded probe below records the candidate-level consensus result. It is a
source-consensus result, not final runtime acceptance: D3-001 normalized price,
subject-fiscal-year metrics, and CNINFO publication checks still run later.

| Target | Candidate | Families observed | Family count | Growth membership | DuPont membership | Scale evidence | Consensus |
|---|---|---|---:|---|---|---|---|
| `600519` | `600809` | GROWTH, DUPONT, SCALE | 3 | yes | yes | yes | pass |
| `600519` | `603198` | VALUATION, DUPONT, SCALE | 3 | no | yes | yes | pass |
| `600519` | `603369` | VALUATION, DUPONT, SCALE | 3 | no | yes | yes | pass |
| `600519` | `603919` | GROWTH, VALUATION, SCALE | 3 | yes | no | yes | pass |
| `000333` | `002668` | GROWTH, VALUATION, DUPONT, SCALE | 4 | yes | yes | yes | pass |
| `000333` | `600983` | GROWTH, VALUATION, SCALE | 3 | yes | no | yes | pass |
| `000333` | `000921` | GROWTH, DUPONT, SCALE | 3 | yes | yes | yes | pass |
| `000333` | `000651` | VALUATION, DUPONT, SCALE | 3 | no | yes | yes | pass |
| `000333` | `600690` | VALUATION, DUPONT, SCALE | 3 | no | yes | yes | pass |
| `000333` | `001387` | VALUATION, DUPONT, SCALE | 3 | no | yes | yes | pass |
| `300750` | `002058` | GROWTH, DUPONT, SCALE | 3 | yes | yes | yes | pass |
| `601398` | `002948` | GROWTH, VALUATION, SCALE | 3 | yes | no | yes | pass |
| `601398` | `600926` | GROWTH, VALUATION, DUPONT, SCALE | 4 | yes | yes | yes | pass |
| `601398` | `601128` | GROWTH, VALUATION, DUPONT, SCALE | 4 | yes | yes | yes | pass |
| `601398` | `601665` | GROWTH, VALUATION, SCALE | 3 | yes | no | yes | pass |

The resulting source-consensus counts are `4` for `600519`, `6` for
`000333`, `1` for `300750`, and `4` for `601398`. The `300750` result is
therefore not a usable automatic peer set under the frozen minimum of three
valid peers, even though one candidate passes source consensus. No family
intersection, source averaging, or dynamic relaxation is permitted.

The source response provides a bounded ranked sample rather than a complete
universe. A future implementation may use the deterministic ordering frozen in
section 17 only after the cheap identity, consensus, profile, and scale gates
pass. No valuation ranking, performance ranking, or arbitrary `0.25x–4.0x`
scale band is authorized by this design.

### 9.6 Representative candidate evidence

These rows are design evidence only. They are not accepted runtime peers because
the future normalized peer-price calls and final code-owned gates were not run.
`scaleRatio` is raw `TOTAL_CAP(peer) / TOTAL_CAP(target)` from the targeted
scale comparison query; all scale rows reported `REPORT_TYPE=2026年中报`.

| Target | Candidate | Cohort/profile evidence | `scaleRatio` | FY2025 EPS / BVPS | CNINFO FY2025 | Provisional status |
|---|---|---|---:|---:|---|---|
| `600519` | `000858 五粮液` | valuation cohort; no growth/DuPont overlap in this target probe | 0.1747 | 2.3068 / 30.8976 CNY | found | cohort + scale + D3-001 financial/publication; profile gate not met |
| `600519` | `603198 迎驾贡酒` | valuation + DuPont; ROE 25.73, net margin 34.17, turnover 54.69 | 0.0199 | 2.48 / 13.2941 CNY | found | candidate evidence complete except normalized price |
| `600519` | `603919 金徽酒` | valuation + growth; 3Y EPS/revenue/net-profit growth 8.37/13.20/6.49 | 0.0054 | 0.70 / 6.7619 CNY | found | candidate evidence complete except normalized price |
| `000333` | `002668 TCL智家` | valuation + growth + DuPont; 3Y EPS/revenue/net-profit growth 38.67/16.69/30.57; ROE 52.31 | 0.0155 | 1.04 / 3.2692 CNY | found | candidate evidence complete except normalized price |
| `000333` | `000651 格力电器` | valuation + DuPont; ROE 24.32, net margin 15.88, turnover 51.13 | 0.3396 | 5.20 / 26.0523 CNY | found | candidate evidence complete except normalized price |
| `000333` | `600690 海尔智家` | valuation + DuPont; ROE 17.20, net margin 6.64, turnover 105.70 | 0.2984 | 2.12 / 12.6576 CNY | found | candidate evidence complete except normalized price |
| `300750` | `002058 紫竹高科` | growth + DuPont; 3Y EPS/revenue/net-profit growth 125.06/76.67/163.78; ROE 36.89 | 0.0018 | 1.41 / 0.3893 CNY | found | union-funnel candidate; not a valuation-cohort member |
| `300750` | `002074 国轩高科` | growth cohort; 3Y EPS/revenue/net-profit growth 94.28/25.04/84.29 | 0.0357 | 1.32 / 16.0541 CNY | found | union-funnel candidate; no DuPont overlap |
| `300750` | `603026 石大胜华` | valuation cohort; no growth/DuPont overlap in this target probe | 0.0099 | 0.07 / 21.1030 CNY | found | cohort + scale + D3-001 financial/publication; profile gate not met |
| `601398` | `002948 青岛银行` | valuation + growth; 3Y EPS/revenue/net-profit growth 23.61/7.77/19.14 | 0.0122 | 0.85 / 7.00 CNY | found | candidate evidence complete except normalized price |
| `601398` | `601128 常熟银行` | valuation + growth + DuPont; growth 8.29/9.67/15.11; ROE 13.96 | 0.0079 | 1.27 / 9.46 CNY | found | candidate evidence complete except normalized price |
| `601398` | `601665 齐鲁银行` | valuation + growth; 3Y EPS/revenue/net-profit growth 11.06/5.89/16.31 | 0.0145 | 1.00 / 7.96 CNY | found | candidate evidence complete except normalized price |

The sample proves common-FY EPS/BVPS and CNINFO feasibility for representative
candidate rows, but it does not prove current normalized price feasibility for
every row: only a subset of the historical-price calls returned rows in the
normal environment. That remains a runtime acquisition gate, not a reason to
consume direct comparison-endpoint PE/PB.

## 10. Comparability design

### 10.1 Dimensions actually provable

From the supplemental structured surfaces, the narrow PE/PB contract can
code-own:

- source-specific EastMoney peer-cohort membership;
- A-share identity and exchange;
- current total/free market-cap scale, with report-period revenue/profit kept
  temporally separate;
- raw 3Y actual growth fields anchored to `REPORT_DATE`;
- raw 3Y-average ROE, net margin, and asset-turnover observations;
- common annual reporting period and currency after D3-001 normalization.

The probe still did not establish deterministic product/service, customer,
business-model, capital-intensity, or geography evidence. CNINFO text may
contain business descriptions, but no existing structured operation proves
those dimensions without introducing an extraction and policy project. LLM
selection is not an acceptable substitute.

### 10.2 Minimum evidence

A future peer must have, independently:

- exact identity evidence: ticker, exchange, company ID, and name;
- source-specific peer-cohort membership evidence passing the frozen
  source-consensus gate;
- current market evidence for price and a scale profile;
- at least one raw actual growth or profitability/economics profile, with the
  observation retained separately from the fact that the profile exists;
- common-period annual EPS and/or BVPS evidence;
- CNINFO annual-publication proof for the same fiscal year;
- explicit currency, units, retrieval time, and current-only PIT status;
- a non-empty, code-owned comparability evidence set.

For the current free-source design, the dedicated source-specific cohort plus
scale/profile evidence is sufficient to evaluate a deliberately narrow PE/PB
contract, but it is not enough to claim all existing generic comparability
dimensions. Unsupported dimensions must remain absent; the narrow contract must
not be passed to legacy EV/Revenue, EV/EBITDA, or FCF methods.

### 10.3 Metric-specific acceptance

Comparability and metric availability must remain separate:

- a peer may be comparable for PE while BVPS is missing;
- a peer may be comparable for PB while EPS is missing;
- a peer with both metrics missing is not useful for either method;
- a peer with numeric metrics but no comparability evidence is rejected.

The future result should expose PE and PB accepted counts independently, rather
than globally rejecting a peer because one metric is unavailable.

## 11. Period, publication, and PIT model

### 11.1 Current-only automatic scope

Automatic peer resolution is permitted only when `asOf` is omitted. It may use
current source-specific peer cohorts and current scale/profile observations,
but the subject fiscal-year anchor is fixed by the already-selected D3-001
`ValuationBasis.fiscalYear`.

When `asOf` is explicitly supplied, automatic peer resolution returns
`AUTO_COMPS_HISTORICAL_UNAVAILABLE` unless versioned industry membership,
market, financial, and comparability evidence is separately proven. Current
board constituents must never be projected backward into a historical universe.

Caller-supplied historical `CompsValuationInput` remains governed by its
existing contract and gates.

### 11.2 Subject fiscal-year anchor

The automatic path must use the subject's already-selected D3-001
`ValuationBasis.fiscalYear`. It must not recompute a latest intersection and
must not automatically backshift the subject or peer period. Every accepted
peer must provide EPS and/or BVPS for that exact subject FY plus CNINFO
publication proof for an annual report covering the same FY. A peer with a
different year, missing same-FY metric, or missing same-FY publication proof is
rejected for the affected metric (and cannot enter that metric's median).

Current market price may be latest observable current-mode price, but the
result remains `CURRENT_VALUE_ONLY`; CNINFO publication proves disclosure
availability, not a historical version of EastMoney's numeric value.

### 11.3 Market timing choice

The canonical peer price is the D3-001 `historicalMarketData()` current-mode
latest normalized daily close. A spot price is not canonical, and a direct
comparison-endpoint PE/PB field is not canonical. The dedicated raw scale
comparison route can supply the scale profile, so `stock_zh_a_spot_em` is not a
hard candidate-prefilter dependency.

The future result must record the actual retrieval timestamp and must not label a
current snapshot as strict historical PIT. Fixed-asOf automatic peer resolution
remains unavailable under this design.

## 12. D3-001 reuse and provenance

The future resolver should reuse, not duplicate:

| Future peer datum | Existing seam | Provenance rule |
|---|---|---|
| Peer price | `AkshareDataAdapter.historicalMarketData()` | EastMoney origin; AKShare retrieval; current-mode availability |
| Peer EPS/BVPS | `valuationFinancialIndicators()` | EastMoney numeric `S3_AGGREGATOR`; report date and notice date preserved |
| Peer publication | `CninfoOfficialDisclosureClient.resolveAnnualReportPublication()` | CNINFO origin and `S0_STATUTORY` publication authority |
| Peer identity | existing company identity normalization | no name-only or fuzzy identity |
| Peer cohort | future bounded raw EastMoney comparison acquisition | `EASTMONEY_PEER_COHORT_MEMBERSHIP`; S3 aggregator evidence, not statutory fact |
| Scale/profile | future bounded raw EastMoney comparison acquisition | current scale plus separately dated growth/economics observations; no direct PE/PB authority |
| Shenwan classification | optional future Legulegu/SWS acquisition | aggregator or SWS-hosted classification authority must remain explicit |

Every accepted peer must retain separate source refs for:

```text
identity/cohort membership
market price
financial numeric
official publication
scale/growth/economics profile
comparability evidence
```

No synthetic one-source peer record may hide those lineages. No EastMoney
numeric observation may be relabelled as CNINFO authority, and no AKShare
retrieval may become the publisher.

## 13. Frozen narrow execution contract

The automatic path uses a new narrow additive contract. It must never adapt an
automatic peer into the legacy `ComparableCompanyInput`, because that would
invite fabricated `grossDebt`, `cash`, `netDebt`, `shares`, `EBITDA`, or
`revenue` fields. The conceptual shapes are:

```text
AutomaticComparablePeer {
  identity
  cohortMemberships[]
  cohortFamilyCount
  scaleProfile
  growthProfile?
  profitabilityProfile?
  price
  priceDate
  fiscalYear
  eps?
  bvps?
  publicationProof
  pitStatus = CURRENT_VALUE_ONLY
  sourceRefs[]
}

AutomaticComparableSubject {
  identity
  valuationDate
  fiscalYear = selected D3-001 ValuationBasis.fiscalYear
  eps?
  bvps?
  sourceRefs[]
}

AutomaticEquityCompsResult {
  fiscalYear
  acceptedPeers
  rejectedPeers
  peSummary?
  pbSummary?
  peImpliedPrice?
  pbImpliedPrice?
  sourceRefs
  diagnostics
  availability
}
```

The deterministic automatic operation belongs in the existing
`skills/comps_valuation/` Skill as a narrow additive PE/PB operation,
conceptually `executeEquityMultipleComps(...)`. It does not call
`executeCompsValuation()` with fake fields. `executeCompsValuation()` remains
the unchanged caller-supplied legacy seam.

The automatic contract is additive and metric-specific:

- existing caller-supplied `CompsValuationInput` remains valid;
- legacy `executeCompsValuation()` behavior and EV/Revenue, EV/EBITDA, and FCF
  callers remain unchanged;
- automatic v0.1 emits only recomputed PE/PB;
- no generic `PeerDataEngine`, `PeerService`, provider layer, or Knowledge peer
  graph is added;
- no fake debt, cash, net debt, shares, EBITDA, or revenue fields are required
  or permitted.

## 14. PE and PB calculation proposals

### PE

For each accepted PE peer:

```text
peerPE = peerCurrentPrice / peerCommonFYAnnualEPS
```

Required: positive finite price, positive finite annual EPS, common FY period,
CNY units, current-mode timestamp, peer-cohort/scale/profile comparability
evidence, and CNINFO publication proof. At least three valid PE peers are
required; fewer returns `INSUFFICIENT_VALID_PEERS`.

The peer median is the deterministic selected multiple. The subject implied
price is:

```text
subjectCommonFYAnnualEPS × peerMedianPE
```

No diluted shares are required.

### PB

For each accepted PB peer:

```text
peerPB = peerCurrentPrice / peerCommonFYAnnualBVPS
```

Required: positive finite price, positive finite annual BVPS, common FY period,
CNY units, current-mode timestamp, peer-cohort/scale/profile comparability
evidence, and CNINFO publication proof. At least three valid PB peers are
required; fewer returns `INSUFFICIENT_VALID_PEERS`.

The subject implied price is:

```text
subjectCommonFYAnnualBVPS × peerMedianPB
```

No debt, cash, net debt, or diluted shares are required.

Both methods preserve the D3-001 distinction between publication PIT and numeric
value-version PIT. Current-mode peer values are not strict historical PIT.

## 15. Caller precedence and crosscheck

The future normal path should be:

```text
caller input.comps supplied
  -> preserve existing executeCompsValuation path

caller comps absent + asOf omitted
  -> attempt bounded automatic current peer resolver
  -> run narrow deterministic PE/PB operation inside existing comps_valuation Skill
  -> expose its pre-adapted result through the existing comps_valuation crosscheck

caller comps absent + fixed asOf supplied
  -> AUTO_COMPS_HISTORICAL_UNAVAILABLE
  -> keep comps unavailable; do not fabricate a historical universe
```

Future product wiring, if separately authorized and source gates are cleared,
should remain narrow and explicit:

```text
ResearchService
  -> runValuation
  -> existing D3-001 target basis
  -> bounded current-only peer resolver
  -> AutomaticComparableSubject + AutomaticComparablePeer[]
  -> executeEquityMultipleComps(...)
  -> existing/minimally extended crosscheck seam
```

This does not authorize a generic Company or Industry service, a new provider
layer, or an Agent Runtime. The resolver remains a bounded Workflow-owned
acquisition step using the existing D3-001 seams.

`buildValuationCrosscheck()` should remain the integration seam. It may receive
the narrow automatic result through a minimal pre-adaptation of the selected
method result; its basis compatibility, disagreement diagnostics, and
`automaticAveraging: false` behavior must not be redesigned.

Automatic crosscheck method selection is frozen to the existing Valuation
assumption plan's `primaryMethod`:

- `primaryMethod = PE` selects the automatic PE peer-median implied price when
  PE has at least three valid peers;
- `primaryMethod = PB` selects the automatic PB peer-median implied price when
  PB has at least three valid peers;
- any other primary method makes the automatic PE/PB crosscheck unavailable;
- PE and PB are never averaged;
- the automatic path never falls back to the alternate PE/PB method;
- if the selected method is unavailable, the crosscheck remains unavailable.

Caller-supplied `input.comps` always wins. The caller path and automatic path
must not both populate the crosscheck.

Automatic comps must remain a cross-check. It must not replace the selected
primary scenario method or silently change investment conclusions.

## 16. Banks and sector control

`601398` is intentionally included as a control. The proposed current-only
machinery can calculate PE/PB for banks without introducing bank EV, debt, or
EBITDA. The dedicated comparison route returned a bank cohort and structured
growth/economics/scale observations, while the initial board/spot route remained
unavailable.

Therefore `601398` does not authorize a bank peer result. A future acceptance
run must separately prove that the target and accepted bank peers pass the same
identity, period, publication, metric, and comparability gates. There is no
bank-specific relaxation: the same source-consensus rule, actual profile
requirement, minimum of three valid peers per metric, and current-only PIT rule
apply. No bank-specific generic debt or EBITDA path belongs in D3-002.

## 17. Candidate and peer-count policy

The following automatic peer-count policy is frozen for the narrow contract:

- minimum valid peers per metric: `3`;
- maximum accepted peers per metric: `8`;
- maximum expensive financial/publication validations after cheap filters: `12`;
- selection basis: `peer_median` only;
- fewer than three valid peers: `INSUFFICIENT_VALID_PEERS`;
- no dynamic lowering of the minimum;
- PE and PB counts remain metric-specific.

The expensive validation cap is applied only after cheap identity,
source-consensus, actual-profile, and scale gates. The final accepted peer set
is capped at eight per metric. The minimum is never lowered dynamically.

If independently valid sources disagree, the future resolver must preserve both
observations and their provenance, emit a deterministic conflict diagnostic, and
reject the affected metric rather than average or silently choose a value. An
unaffected metric may remain usable only when its own evidence is independently
complete and conflict-free. This applies to price, market cap, EPS, BVPS,
peer-cohort membership, publication, profile, and identity observations.

Before the expensive-validation cap, candidates are ordered deterministically by:

1. descending `cohortFamilyCount`;
2. ascending `abs(log(peerMarketCap / targetMarketCap))`;
3. ascending canonical ticker.

After validation, no more than eight valid peers are accepted per metric. This
ordering is a work/comparability ordering only. It is never investment ranking:
no best peer, winner, attractive PE, attractive PB, stock-performance, return,
or momentum selection is allowed.

## 18. Future D0 requirements

If a later task authorizes runtime implementation, a future D0 design should
define narrow requirements for:

```text
peer_candidate_discovery
peer_cohort_membership
peer_market_price
peer_market_cap_scale
peer_eps
peer_bvps
peer_publication
peer_growth_profile
peer_profitability_profile
peer_comparability
```

Each requirement should preserve original publisher, authority, retrieval
provider, observation/publication time, units, period, and explicit unavailable
status. This is not authorization for a new SourcePolicy framework or generic
provider layer.

## 19. Future acceptance proof

If a later task authorizes implementation, its normal current-mode acceptance
must use:

- `600519` plus either `000333` or `300750`;
- `601398` as the financial-sector control;
- no caller-supplied comps input;
  - exact source-specific peer-cohort membership proof;
  - scale profile and at least one actual growth/profitability profile per accepted peer;
- frozen source consensus: at least two families, including growth or DuPont;
- at least three accepted peers for PE and/or PB;
- the subject's selected D3-001 fiscal year across subject and accepted peers;
- separate market, financial, CNINFO, identity, and comparability source refs;
- deterministic peer median and existing `comps_valuation` crosscheck;
- crosscheck selection by the existing `primaryMethod`, with no PE/PB averaging
  or alternate-method fallback;
- no debt/cash/netDebt/shares/EBITDA acquisition;
- fixed-asOf negative control returning `AUTO_COMPS_HISTORICAL_UNAVAILABLE`.

Negative acceptance must fail closed for:

```text
peer cohort unresolved
too few qualified peers
period mismatch
missing source or dangling source ref
source after cutoff
metric unavailable
insufficient comparability evidence
fixed-asOf automatic request
direct PE/PB denominator semantics unknown
```

No live success may be claimed when required cohort, scale/profile, market,
financial, or CNINFO stages fail. Fixture rows must never replace a failed live
stage.

## 20. Architecture decision

**A. IMPLEMENTABLE_WITH_NARROW_CONTRACT**

The supplemental probe corrects the provisional initial C result. The required
source path is now feasible for a narrow additive PE/PB design:

1. All four dedicated EastMoney comparison families returned raw structured
   rows for all four targets through `datacenter.eastmoney.com`.
2. The raw families provide target-relative cohort membership, raw report dates,
   growth/economics observations, and current scale observations. Their cohort
   differences are explicit and can be preserved rather than intersected.
3. Representative candidates have common-FY EPS/BVPS rows and CNINFO FY2025
   publication proof through the existing D3-001 seams.
4. A deliberately narrow contract can require peer-cohort membership, scale,
   one actual growth/profitability profile, subject-FY D3-001 evidence, current
   normalized price, and CNINFO publication proof.
5. Direct comparison-endpoint PE/PB remains non-canonical because denominator,
   period, share-basis, and update semantics are not sufficiently established.
6. The legacy contract remains too broad; debt, cash, net debt, and shares stay
   deferred, and the automatic path emits only recomputed PE/PB.
7. The source-consensus gate, peer-count policy, candidate ordering, subject FY
   anchor, current normalized-close price rule, legacy/automatic contract
   boundary, and primary-method crosscheck rule are now frozen.

The implementation decision is design-level only. Sol review is still required
before runtime work begins, but no further design choice is left open in this
document for the comparability gate or narrow PE/PB execution contract.
Caller-supplied comps retain precedence, and fixed-`asOf` automatic comps remain
unavailable.

Final decision block:

```text
Architecture decision:
A. IMPLEMENTABLE_WITH_NARROW_CONTRACT

Source feasibility:
CLOSED

Comparability gate:
FROZEN

Narrow execution contract:
FROZEN

Runtime implementation:
NOT STARTED
```

## 21. Remaining Sol/runtime questions

These are implementation or deployment questions only; they do not reopen the
frozen comparability or execution contract:

- Can the governed runtime expose the dedicated `datacenter` comparison route
  through a thin Workflow-owned acquisition seam without adding a provider
  layer?
- What exact D0 policies, source adapters, and acceptance labels should be
  added when runtime implementation is separately authorized?
- What transport and environment configuration is required for authenticated
  live acceptance beyond this design/probe environment?

## 22. Changed files and validation

Only the following file is intended to be committed:

```text
docs/engineering/specs/2026-09-23-comparable-input-closure-d3-v0.1.md
```

No temporary probe script or output file was created in the worktree. No runtime
files were changed. Full runtime validation is intentionally not required by
this design/probe-only task. Required checks before commit are:

```text
git diff --check
git diff --name-only origin/main...HEAD
git status --short
```

The expected changed-file list is exactly the single design document above.

## 23. Review gate

This document is ready for Sol review. It does not authorize D3-002 runtime
implementation, branch merge, or the next phase.
