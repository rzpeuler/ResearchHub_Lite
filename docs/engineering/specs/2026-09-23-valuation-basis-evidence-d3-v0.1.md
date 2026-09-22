# D3 v0.1 — Valuation Basis Evidence Design

- Task: `RHL-D3-001-DESIGN`
- Status: `DESIGN READY / SOURCE FEASIBILITY PROBED / SOL REVIEW PENDING`
- Checked: 2026-09-23
- Branch: `codex/d3-001-valuation-basis-evidence-design`
- Baseline: `2d8e2d4cc335f6478a73a039793bbb94e63524fc`

## 1. Decision summary

The forcing function is frozen:

> Given `valuationDate`, `analysisAsOf`, issuer, and method (`PE`, `PB`, or
> `EV_EBITDA`), produce a deterministic valuation basis with a market price,
> an annual financial period, a publication/availability proof, and the
> method-required financial inputs. Reject any input that was not available by
> `analysisAsOf`; never substitute an LLM-generated number.

The probe supports a narrow D3 implementation plan:

1. Reuse the existing price and financial adapter seams, but separate the
   original publisher from AKShare as the retrieval provider.
2. Add a bounded official CNINFO publication crosswalk for annual reports.
3. Treat EastMoney `NOTICE_DATE` as aggregator availability metadata, not as
   statutory publication authority.
4. Support PE and PB subject to source-authority and point-in-time checks.
5. Support cash/debt/shares only through an explicit issuer/accounting field
   registry; do not use total liabilities or a generic bank formula.
6. Leave EV/EBITDA unsupported in v0.1. The live probe found no direct EBITDA
   amount or defensible source-native EBIT plus depreciation-and-amortisation
   derivation.

This document is design-only. It does not modify runtime, Skill, Workflow,
Plugin, Knowledge, schema, tests, application services, or valuation arithmetic.

## 2. Scope and non-goals

### In scope

- Temporal and point-in-time rules for the existing valuation basis.
- Source and provenance design for price, annual EPS/BVPS, cash, debt, shares,
  and publication evidence.
- Live feasibility results for `600519`, `000333`, `300750`, and `601398`.
- A bounded acceptance plan for the later implementation task.

### Out of scope

- Implementation of adapters, source policies, or CNINFO pagination.
- Changes to `ValuationBasis`, `ValuationFinancialRow`, or arithmetic.
- Company, peer, DCF, forecast, LLM numeric, or frontend work.
- New crawler infrastructure, generic provider abstractions, or a custom Agent
  Runtime.
- Canonical Knowledge writes.

Temporary probe scripts and JSON outputs used during investigation were deleted
before this design was prepared.

## 3. Existing contract and hard gates

The current valuation contract in `skills/valuation/contracts.ts` has these
fields:

```text
valuationDate: string
priceDate: string
marketPrice: number
marketPriceUnit: "CNY/share"
basisFiscalYear: number
reportDate: string
publicationStatus: "verified" | "current_snapshot_unverified"
eps?: number
bvps?: number
ebitda?: number
netDebt?: number
shares?: number
units: Record<string, string>
```

The current financial row also has optional `publicationDate`, but the final
`ValuationBasis` does not retain it. A future implementation must preserve the
selected publication date in the immutable selection proof or extend the basis
evidence contract. Discarding the date after selection would make later audit
of the PIT decision impossible.

Current method gates are unchanged:

| Method | Required usable inputs |
|---|---|
| PE | positive finite market price and positive finite EPS |
| PB | positive finite market price and positive finite BVPS |
| EV/EBITDA | positive finite market price and EBITDA, positive finite shares, finite net debt |

The current normalizers select the latest market row whose date is on or before
`valuationDate`, and annual financial rows whose `reportDate` ends in
`-12-31`. This design keeps D3 v0.1 annual-only. It does not silently promote
interim rows to a full-year basis.

Required unit conventions are:

| Field | Required unit |
|---|---|
| market price, EPS, BVPS | `CNY/share` |
| EBITDA, cash, debt, net debt | `CNY` |
| shares | share count |
| fiscal year | calendar year represented by `reportDate` |

Units are accepted only when the adapter contract or source field mapping
establishes them. A numeric value with no unit evidence is unavailable, not
implicitly CNY.

The existing diagnostics remain the base vocabulary. D3 should add only narrow
diagnostics where the reason is materially different, including:

- `POINT_IN_TIME_PUBLICATION_UNVERIFIED`
- `NO_ELIGIBLE_POINT_IN_TIME_DATA`
- `SOURCE_UNAVAILABLE`
- `DATA_NOT_PUBLISHED`
- `INCOMPLETE_REQUIRED_FIELDS`
- `INSUFFICIENT_AUTHORITY`
- `SOURCE_CONFLICT`
- `VALUATION_BASIS_FINANCIAL_SECTOR_UNSUPPORTED`
- `VALUATION_BASIS_EBITDA_UNSUPPORTED`
- `VALUATION_BASIS_SHARES_HISTORY_INCOMPLETE`

## 4. Temporal model

The basis has three independent dates plus the analysis cutoff:

| Dimension | Meaning | Rule |
|---|---|---|
| `valuationDate` | market valuation date | price date must be the latest eligible trading observation on or before this date |
| `reportDate` / `basisFiscalYear` | financial period end | v0.1 requires the annual report for the requested fiscal year |
| `publicationDate` | public availability date of that annual report | must be on or before `analysisAsOf` |
| `analysisAsOf` | information cutoff | no selected numeric or publication evidence may be later than this cutoff |

Availability is separate from period. `REPORT_DATE=2024-12-31` means the
financial period ended in 2024; it does not prove that the number was public in
2024. `NOTICE_DATE` is not equivalent to `REPORT_DATE`.

The required temporal matrix is:

| Matrix | Evidence | Selection rule | Failure |
|---|---|---|---|
| A — market state | dated close observation | latest close with `tradeDate <= valuationDate` | `SOURCE_UNAVAILABLE` or no eligible price |
| B — financial period | annual report row | requested annual period; `reportDate <= valuationDate` | `INCOMPLETE_REQUIRED_FIELDS` or no annual row |
| C — availability | official publication crosswalk plus source availability | `publicationDate <= analysisAsOf` | `POINT_IN_TIME_PUBLICATION_UNVERIFIED` or `DATA_NOT_PUBLISHED` |

For historical analysis, every method-required value must satisfy all three
matrices. A current run without an explicit `analysisAsOf` may retain the
existing `current_snapshot_unverified` status, but it must not be described as
historically verified.

Examples from the probe:

- `600519` FY2024 has an EastMoney `NOTICE_DATE` of 2025-04-03 and a CNINFO
  annual-report publication date of 2025-04-03. With `analysisAsOf=2025-03-01`
  it must be rejected; with `analysisAsOf=2025-04-10` it is eligible if the
  official document crosswalk matches the report.
- `000333` FY2024 was crosswalked to 2025-03-29; `300750` to 2025-03-15; and
  `601398` to 2025-03-29. Each must be rejected before its respective date.
- The 2025 year-end rows have aggregator notice dates of 2026-04-17,
  2026-03-31, 2026-03-10, and 2026-03-28 respectively. They are available by
  the 2026-09-23 probe cutoff, but remain unavailable to earlier cutoffs.

The future acceptance run must cover these three windows explicitly:

| Window | Required proof |
|---|---|
| Current/latest as of 2026-09-23 | current price transport, latest eligible annual row, and current-source limitations |
| FY2025 / 2026 publication season | reject before each issuer's 2026 notice/publication date; accept after the matched official publication |
| FY2024 / 2025 publication season | use the four crosswalk dates below; prove both before-publication rejection and after-publication acceptance |

## 5. Probe methodology and universe

The probe ran on Python 3.12.10 with AKShare 1.18.64. The four issuers were
chosen to cover a large consumer company, a large appliance manufacturer, a
growth industrial company, and a bank:

| Issuer | Purpose |
|---|---|
| `600519` Kweichow Moutai | non-financial, long history, annual EPS/BVPS and balance-sheet fields |
| `000333` Midea Group | non-financial, recent share-capital events and annual availability |
| `300750` CATL | non-financial, rapid capital changes and large balance-sheet fields |
| `601398` ICBC | financial-sector negative control for cash/debt/EV semantics |

Each endpoint was probed once per issuer in a bounded run, with the CNINFO
publication query separately bounded to the 2024 annual-report publication
window. The live environment had a proxy failure for EastMoney `push2` and
`push2his`; that is recorded as transport evidence, not treated as a schema
failure.

## 6. Live source feasibility

### 6.1 Endpoint matrix

| Endpoint/function | Result on probe | Rows/range | Key raw fields | Origin and retrieval | PIT assessment |
|---|---|---|---|---|---|
| `stock_financial_analysis_indicator` | Success for all four | 14 rows each; 2023-03-31 to 2026-06-30 | `日期`, adjusted EPS and BVPS fields, ratios; no publication date | Sina endpoint via AKShare | Has period dates but no publication evidence; candidate cross-check only |
| `stock_financial_analysis_indicator_em` | Success for all four | `600519` 103, `000333` 79, `300750` 41, `601398` 85; ranges begin 1998/2004/2014/2003 and end 2026-06-30 | `REPORT_DATE`, `NOTICE_DATE`, `EPSJB`, `BPS`, revenue, parent profit, `PER_EBIT` | EastMoney data center via AKShare | `NOTICE_DATE` gives aggregator availability metadata; requires official crosswalk |
| `stock_balance_sheet_by_report_em` | Success for all four | Same row counts as the EM indicator probe | non-bank `MONETARYFUNDS`, debt-like candidates, equity, liabilities, `SHARE_CAPITAL`; bank-specific fields | EastMoney PC HSF10 via AKShare | Period and notice dates present; field semantics and issuer class must be enforced |
| `stock_zh_a_gbjg_em` | Success for all four | 16/20/20/20 rows for 600519/000333/300750/601398 | `变更日期`, `总股本`, `已上市流通A股`, `已流通股份`, `变动原因` | EastMoney data center via AKShare | Effective-date timeline exists, but wrapper hardcodes page 1/page size 20; historical coverage is not closed |
| `stock_individual_info_em` | Failed for all four | no rows | source maps `f84` total shares and `f85` float shares | EastMoney `push2` via AKShare | Current snapshot only; live transport blocked and no effective date in the adapter result |
| `stock_zh_a_hist` | Failed for all four | no rows | dated OHLCV, including close | EastMoney `push2his` via AKShare | Existing market path is structurally suitable, but this environment cannot transport-verify it |
| CNINFO `topSearch/query` | Success for all four | one organization mapping per issuer | `code`, `orgId` | CNINFO official endpoint, direct bounded request | Organization IDs resolved for official crosswalk |
| CNINFO `hisAnnouncement/query` with `seDate` | Success for all four | 10/14/16/13 rows in the 2025 publication windows | `announcementTime`, `adjunctUrl`, issuer and title | CNINFO official endpoint, direct bounded request | Annual-document publication dates and PDF URLs crosswalked; existing unbounded page-1 client is insufficient for old cutoffs |

The live market failures were:

```text
ProxyError: HTTPSConnectionPool(host='push2.eastmoney.com', port=443):
Max retries exceeded ... /api/qt/stock/get

ProxyError: HTTPSConnectionPool(host='push2his.eastmoney.com', port=443):
Max retries exceeded ... /api/qt/stock/kline/get
```

The failure does not invalidate the existing market schema. It means the D3
acceptance run must include an environment with transport access, and the final
field cannot be marked live-ready from this probe alone.

### 6.2 Publication crosswalk evidence

For each issuer, the date-bounded CNINFO query used the resolved organization ID,
`searchkey=2024`, and a 2025 publication window. The annual-report documents
were:

| Issuer | FY2024 official publication date | Example CNINFO PDF |
|---|---:|---|
| `600519` | 2025-04-03 | `https://static.cninfo.com.cn/finalpage/2025-04-03/1222993920.PDF` |
| `000333` | 2025-03-29 | `https://static.cninfo.com.cn/finalpage/2025-03-29/1222951197.PDF` |
| `300750` | 2025-03-15 | `https://static.cninfo.com.cn/finalpage/2025-03-15/1222807006.PDF` |
| `601398` | 2025-03-29 | `https://static.cninfo.com.cn/finalpage/2025-03-29/1222948914.PDF` |

CNINFO returned timestamps at 16:00 UTC for these examples; the normalized
publication calendar date is the next day in Asia/Shanghai. The future adapter
must normalize this explicitly and retain both the source timestamp and the
calendar date.

The existing `CninfoOfficialDisclosureClient.list()` fetches page 1 without a
date range and filters locally. The probe showed that page 1 contains current
2026 filings, so it cannot reliably find a 2025 document for a historical
cutoff. The implementation should use the existing CNINFO operation and
endpoint with a bounded date window and deterministic annual-report matching;
it must fail closed on zero or ambiguous matches. This is a narrow extension,
not permission to create a new crawler.

### 6.3 Financial and balance-sheet observations

The EM annual rows contain useful period and notice metadata. Examples:

| Issuer | FY2024 (`REPORT_DATE`) | FY2024 notice | FY2025 notice | FY2025 EPSJB / BPS |
|---|---:|---:|---:|---:|
| `600519` | 2024-12-31 | 2025-04-03 | 2026-04-17 | 65.66 / 195.3554497 |
| `000333` | 2024-12-31 | 2025-03-29 | 2026-03-31 | 5.80 / 29.3822620 |
| `300750` | 2024-12-31 | 2025-03-15 | 2026-03-10 | 16.14 / 73.8655343 |
| `601398` | 2024-12-31 | 2025-03-29 | 2026-03-28 | 1.00 / 10.83 |

`EPSJB` and `BPS` are direct fields returned by an aggregator. They are not
independent proof of statutory presentation. The annual rows also expose
`PER_EBIT`, but that is a price-to-EBIT ratio, not an EBITDA amount and must not
be used as EBITDA.

Balance-sheet shapes differ materially:

- Non-financial issuers expose fields including `MONETARYFUNDS`,
  `NONCURRENT_LIAB_1YEAR`, `LONG_PAYABLE`, `BOND_PAYABLE`, `LEASE_LIAB`,
  `TOTAL_PARENT_EQUITY`, `TOTAL_LIABILITIES`, and `SHARE_CAPITAL`.
- `601398` exposes bank fields including `CASH_DEPOSIT_PBC`, `BORROW_FUND`,
  `BOND_PAYABLE`, `SUBBOND_PAYABLE`, and bank financial-asset/liability fields;
  it does not expose the same `MONETARYFUNDS` shape.

`TOTAL_LIABILITIES` and `SHARE_CAPITAL` are not acceptable substitutes for
interest-bearing debt and outstanding shares. Their accounting meanings differ
from the required valuation inputs.

Null and missing values are meaningful. `PER_EBIT` is null for the bank rows;
some non-financial debt-like columns such as `BORROW_FUND` are absent or null;
and a missing field must not be converted to zero. Raw monetary rows carry
`CURRENCY=CNY` in the tested EM responses, while per-share fields are source
columns whose unit is established by the endpoint contract. The adapter must
retain raw nulls, explicitly map units, and reject any field whose schema
contract is not present.

## 7. Field-by-field design

### 7.1 Market price

Reuse the existing `historicalMarketData` adapter and its close-date
normalization. The source path is AKShare → EastMoney `push2his` and the
original publisher is EastMoney. The normalized value is `CNY/share`; the
observation must carry its raw trade date and retrieval metadata.

The probe could not transport-verify this endpoint. Future acceptance must prove
that the selected `priceDate <= valuationDate`, that the close is positive, and
that the returned row is not after `analysisAsOf` when a historical cutoff is
requested. No volume-based inference is needed for the existing valuation
arithmetic.

### 7.2 EPS and BVPS

The primary v0.1 candidate is the EM annual indicator row:

- EPS: `EPSJB`, unit `CNY/share`.
- BVPS: `BPS`, unit `CNY/share`.
- Period: `REPORT_DATE`.
- Aggregator availability: `NOTICE_DATE`.

The Sina indicator endpoint is a useful cross-check and exposes adjusted EPS/BVPS
fields, but it lacks a publication date. It cannot independently establish PIT
eligibility. The EM `BPS` value should therefore be tagged as an aggregator
field, and the future source policy should require an official publication
crosswalk for historical use.

If a later source-backed derivation is needed, the deterministic alternative is
attributable parent equity divided by an explicitly effective share count. This
is not enabled by this design: both the equity-label mapping and the full
share-count history must first be closed, and a derived value must not override
an authoritative source conflict.

### 7.3 Cash

For non-financial issuers, the smallest v0.1 candidate is the raw
`MONETARYFUNDS` field, retaining its original label, period, currency, and
publication evidence. The design does not claim that this field separates
restricted cash; if the source does not provide that distinction, the limitation
must be recorded and the field must not be silently adjusted.

`601398`'s `CASH_DEPOSIT_PBC` is a bank-specific asset category and is not
interchangeable with non-financial `MONETARYFUNDS`. Bank cash/debt treatment is a
separate policy boundary. Generic reuse is forbidden.

### 7.4 Debt

Do not use `TOTAL_LIABILITIES`. For a non-financial issuer, a future explicit
field registry may consider:

- `BORROW_FUND` when the source exposes it as borrowings;
- `NONCURRENT_LIAB_1YEAR` only after its accounting mapping is verified;
- `LONG_PAYABLE` only after its accounting mapping is verified;
- `BOND_PAYABLE`;
- `LEASE_LIAB`, only if the chosen valuation convention includes lease debt.

Accounts payable, contract liabilities, tax/staff payables, other liabilities,
and total liabilities are excluded. If the source-to-accounting mapping is not
closed for the selected issuer class, debt is unavailable rather than guessed.
Banks require a different registry and are excluded from generic EV/EBITDA.

### 7.5 Net debt

When and only when every selected component is eligible:

```text
netDebt = sum(eligible debt components) - eligible cash
```

The result may be negative. Each component must retain source field, period,
publication evidence, unit, and deterministic arithmetic trace. A provider's
precomputed net-debt number must not replace the component calculation unless a
future policy explicitly proves the same definition and authority.

### 7.6 EBITDA

No direct EBITDA amount was found in the probed raw columns. `PER_EBIT` is a
ratio and is explicitly rejected. The probe also did not establish source-native
EBIT plus depreciation and amortisation components from which a defensible
EBITDA could be derived.

Therefore `EV_EBITDA` is `NOT_CURRENTLY_SUPPORTABLE` in v0.1 and should return
`VALUATION_BASIS_EBITDA_UNSUPPORTED` (or the existing incomplete-fields
diagnostic where that is the established contract). No proxy, ratio inversion,
net-profit adjustment, or LLM estimate is permitted.

### 7.7 Shares

The current snapshot candidate is `stock_individual_info_em`, where AKShare maps
EastMoney `f84` to total shares and `f85` to float shares. It is not PIT-safe:
the live endpoint was proxy-blocked and the adapter result has no effective date.

The historical candidate is `stock_zh_a_gbjg_em`:

- `变更日期` is the effective/change date;
- `总股本` is the total-share event value;
- `已上市流通A股` and `已流通股份` are float-related fields;
- `变动原因` explains the event.

The wrapper hardcodes page 1 and page size 20. The probe returned deep history
for `600519`, only recent events for `000333` and `300750`, and an older slice
for `601398`. Until pagination and coverage are proven, historical shares must
fail with `VALUATION_BASIS_SHARES_HISTORY_INCOMPLETE`.

For EV/EBITDA market capitalization, the intended rule is the latest total
share-count event effective on or before `valuationDate`, not an EPS weighted-
average denominator. `SHARE_CAPITAL` from a balance sheet is not a substitute
for outstanding shares without explicit unit and accounting mapping.

## 8. Decision register

| # | Decision | v0.1 resolution | State |
|---:|---|---|---|
| 1 | Temporal model | Keep `valuationDate`, annual `reportDate`, official `publicationDate`, and `analysisAsOf` separate | resolved |
| 2 | Reporting basis | Annual rows only; no interim-to-full-year substitution | resolved |
| 3 | Publication source | CNINFO bounded official crosswalk; EM notice is S3 availability metadata | resolved |
| 4 | BVPS strategy | Use EM `BPS` as an aggregator candidate with official PIT crosswalk; no unproven derivation override | resolved with implementation gate |
| 5 | Cash definition | Non-financial `MONETARYFUNDS`; no restricted-cash inference; bank-specific treatment | resolved with accounting limitation |
| 6 | Debt definition | Explicit non-financial registry; never total liabilities; bank registry separate | resolved with field-mapping blocker |
| 7 | Net debt | Eligible debt components minus eligible cash | resolved |
| 8 | EBITDA | No direct or defensible derived amount found; keep unsupported | blocking for EV/EBITDA |
| 9 | Shares temporal rule | Latest effective total-share event on or before valuation date | resolved |
| 10 | Share history source | `stock_zh_a_gbjg_em`, but pagination/coverage must be closed | blocking for historical shares |
| 11 | Financial-sector boundary | `601398` is a negative control; no generic bank EV formula | resolved |
| 12 | Units | Explicit CNY, CNY/share, or share-count mappings; no numeric inference | resolved |
| 13 | D0 source policy | Authority ladder, `FIRST_VALID`/`CROSS_CHECK`, numeric LLM fallback forbidden | resolved |
| 14 | Failure semantics | Use the diagnostic vocabulary in sections 3 and 9; fail closed on ambiguity | resolved |
| 15 | Smallest scope | Outcome B: BVPS + cash/debt + shares; leave EBITDA unsupported | resolved for Sol review |

Open/blocking items are implementation acceptance gates, not permission to expand
scope: historical share pagination, exact accounting mapping for selected debt
fields, and live market transport.

## 9. Eligibility matrix

| Method / issuer class | D3 v0.1 status | Reason |
|---|---|---|
| PE, non-financial | `IMPLEMENTABLE_WITH_LIMITATION` | Annual EPS and publication crosswalk are feasible; price transport and authority cross-check remain acceptance requirements |
| PB, non-financial | `IMPLEMENTABLE_WITH_LIMITATION` | Annual BPS is available from the aggregator with notice dates; official crosswalk and source-authority policy are required |
| PE/PB, bank | `IMPLEMENTABLE_WITH_LIMITATION` | EPS/BVPS can be evaluated independently of generic EV cash/debt semantics; bank-specific accounting source policy remains required |
| EV/EBITDA, non-financial | `NOT_CURRENTLY_SUPPORTABLE` | No defensible EBITDA; share history coverage and debt registry are incomplete |
| EV/EBITDA, bank | `NOT_CURRENTLY_SUPPORTABLE` | No generic bank cash/debt definition and no EBITDA source |

No field is marked `READY` by this probe. “Implementable with limitation” means
that the source path and acceptance proof are sufficiently bounded for a future
implementation task; it is not a claim that the current runtime already passes
live source acceptance.

## 10. Source policy and failure semantics

D3 should use the existing D0 acquisition contracts rather than create a
valuation-specific provider layer. Requirements should identify the consumer as
the valuation workflow, use `AUTHORITATIVE_NUMERIC` for numeric inputs, and
record `originPublisher`, `originAuthority`, `retrievalProvider`, `sourceUrl`,
`publishedAt`, and `retrievedAt` separately.

The narrow policy shape is:

- `FIRST_VALID` within the approved authority ladder for a single low-risk
  field, after period, unit, and PIT checks;
- `CROSS_CHECK` for BVPS, debt components, and shares when an independent field
  is available;
- no LLM numeric fallback. D0's numeric synthesis prohibition remains binding;
- zero or ambiguous official publication matches fail closed;
- source disagreement is surfaced as `SOURCE_CONFLICT`, not averaged.

AKShare is the retrieval provider, not the original publisher. The current
adapter's `publisher: "AKShare"` label is insufficient for D3 provenance and
must be corrected in the later implementation without changing the existing
provider boundary.

## 11. Smallest safe implementation scope

Outcome B is selected:

> Implement BVPS + cash/debt + shares with explicit field registries and PIT
> evidence; leave EBITDA unsupported.

The practical ordering is:

1. official annual-report crosswalk and retained publication proof;
2. annual EPS/BVPS selection with EM/Sina cross-check semantics;
3. non-financial cash/debt registry with fail-closed unmapped fields;
4. share-event pagination and valuation-date selection;
5. PE/PB acceptance on the four-issuer probe set;
6. leave EV/EBITDA gated until an approved EBITDA source and all required
   financial definitions exist.

This scope does not authorize arithmetic changes. It only establishes evidence
needed by the existing method calculations.

## 12. Architecture placement

The later implementation belongs at the existing seams:

- `plugins/research-acquisition/akshare.ts`: provider retrieval and raw-to-
  normalized adapter metadata;
- `plugins/research-acquisition/official.ts`: bounded official publication
  crosswalk using the existing CNINFO client boundary;
- `workflows/valuation/`: deterministic selection, evidence composition, and
  method eligibility;
- D0 source-policy contracts: authority, provenance, and fail-closed reasons.

Do not add a generic provider layer, a new agent runtime, a new crawler, direct
Knowledge mutation, Skill-to-Skill orchestration, or LLM numeric synthesis.
Valuation arithmetic remains in the existing Skill contract.

## 13. Future acceptance proof

The implementation task must provide machine-readable evidence for at least
`600519` and `000333` (or `300750`) covering:

- a current run with a transport-verified market price;
- an annual historical run whose publication date is before `analysisAsOf`;
- a before-publication run that rejects the same report;
- no financial row or source evidence after the analysis cutoff;
- report date, publication date, price date, units, source authority, original
  publisher, retrieval provider, and source URLs;
- PE and PB eligibility or the exact fail-closed reason;
- EV/EBITDA rejection with the explicit EBITDA-unavailable reason;
- `601398` as the negative control for generic bank cash/debt/EV treatment;
- a proof that no LLM-generated numeric field entered the basis.

The acceptance test must distinguish fixture-backed deterministic tests from
authenticated/live provider acceptance. A fixture can prove selection and
arithmetic wiring; it cannot prove source availability or publication authority.

## 14. External feasibility sources checked

Checked on 2026-09-23:

- [AKShare stock data documentation](https://akshare.akfamily.xyz/data/stock/stock.html)
- [Sina financial-guide-line endpoint](https://money.finance.sina.com.cn/corp/go.php/vFD_FinancialGuideLine/)
- [EastMoney securities data endpoint](https://datacenter.eastmoney.com/securities/api/data/get)
- [EastMoney HSF10 financial-analysis endpoint](https://emweb.securities.eastmoney.com/PC_HSF10/NewFinanceAnalysis/Index)
- [EastMoney current stock snapshot endpoint](https://push2.eastmoney.com/api/qt/stock/get)
- [EastMoney historical market endpoint](https://push2his.eastmoney.com/api/qt/stock/kline/get)
- [CNINFO organization search](https://www.cninfo.com.cn/new/information/topSearch/query)
- [CNINFO announcement query](https://www.cninfo.com.cn/new/hisAnnouncement/query)
- [CNINFO official site](https://www.cninfo.com.cn/new/index)

## 15. Review gate

This document is ready for Sol review. The live source feasibility probe is
complete, the current implementation boundary is preserved, EV/EBITDA is
explicitly blocked, and no implementation should begin until Sol accepts the
temporal model, publication crosswalk, cash/debt registry, share-history
coverage requirement, and the Outcome B scope.
