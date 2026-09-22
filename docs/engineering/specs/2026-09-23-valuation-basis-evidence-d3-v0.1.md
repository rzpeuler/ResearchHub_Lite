# D3 v0.1 — Valuation Basis Evidence Design Correction

- Task: `RHL-D3-001-DESIGN-FIX-001`
- Status: `IMPLEMENTATION COMPLETE / SOL REVIEW PENDING`
- Checked: 2026-09-23
- Branch: `codex/d3-001-pe-pb-evidence-closure`
- Starting HEAD: `f58011638dfa5a3514ec915f1c03699ec61509a6`
- Required baseline: `f580116`

## 1. Decision summary

The revised forcing function is frozen:

> For a selected A-share issuer and current/fixed `analysisAsOf`, can the normal
> Valuation product automatically build a provenance-correct PE/PB basis from
> free public data, while distinguishing official report publication from
> numeric-value-version PIT and refusing to claim historical PIT verification it
> cannot prove?

The probe supports a narrow PE/PB evidence-closure plan:

1. Reuse and harden the existing price path, but separate the original
   publisher from AKShare as the retrieval provider.
2. Add a bounded official CNINFO publication crosswalk for annual reports.
3. Treat EastMoney `NOTICE_DATE` as aggregator availability metadata, not as
   statutory publication authority.
4. Normalize annual EPS/BVPS with explicit units, authority, provenance, and
   separate publication/value-version PIT status.
5. Make PB closure the principal new method gain; PE receives provenance and
   PIT hardening on its existing EPS path.
6. Defer cash, debt, net debt, historical shares, and all EV/EBITDA supporting
   fields. The live probe found no defensible EBITDA amount or formula.

The design has now been implemented on the D3-001 branch. The implementation
does not modify Knowledge schema or valuation arithmetic; the remaining state is
Sol review pending.

## 2. Scope and non-goals

### In scope

- Temporal and point-in-time rules for the existing valuation basis.
- Source and provenance design for price, annual EPS/BVPS, and publication/
  value-version evidence.
- Live feasibility results for `600519`, `000333`, `300750`, and `601398`.
- A bounded current and historical acceptance plan for the later implementation
  task.

### Out of scope

- Implementation of adapters, source policies, or CNINFO pagination.
- Changes to `ValuationBasis`, `ValuationFinancialRow`, or arithmetic.
- Cash/debt/net-debt and share-history implementation; those remain deferred
  EV/EBITDA design assets.
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

The existing D0 acquisition contract can already retain the publication-side
provenance needed by this design: `originPublisher`, `originAuthority`,
`retrievalProvider`, `sourceUrl`, `publishedAt`, and `retrievedAt` are present in
`AcquisitionSourceMetadata`. The research-source contract also carries
`candidate.publishedAt`, `retrievedAt`, and open metadata. It does not provide a
typed `valueVersionStatus` or a numeric-source version identifier. Therefore the
future implementation must use an immutable valuation-evidence/source object
as the PIT ledger, or add a narrowly scoped metadata contract, while leaving
`ValuationBasis` as the calculation projection. It must not enlarge
`ValuationBasis` solely to make it an evidence ledger.

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

The PIT result itself is a separate design classification:

- `PIT_VERIFIED`: official publication availability and exact numeric-value
  version availability are both proven by `analysisAsOf`.
- `PUBLICATION_VERIFIED_VALUE_VERSION_UNVERIFIED`: the official disclosure is
  proven public, but the current aggregator value has no historical version
  proof. This is usable as explicitly weaker research evidence only; it is not
  historical PIT-safe.
- `CURRENT_VALUE_ONLY`: the value is being used for a genuinely current run,
  where `analysisAsOf` is approximately retrieval time, subject to period,
  unit, authority, filing existence, and provenance checks. It is not a
  reconstructed past state.
- `UNAVAILABLE`: the required value or evidence cannot be established.

## 4. Temporal and PIT model

The basis has three independent dates plus the analysis cutoff:

| Dimension | Meaning | Rule |
|---|---|---|
| `valuationDate` | market valuation date | price date must be the latest eligible trading observation on or before this date |
| `reportDate` / `basisFiscalYear` | financial period end | v0.1 requires the annual report for the requested fiscal year |
| `officialPublishedAt` | official disclosure availability | must be on or before `analysisAsOf` for publication PIT |
| `numericSourceRetrievedAt` | retrieval time of the numeric observation | records when the current source value was observed; it does not prove an older version existed |
| `analysisAsOf` | information cutoff | no selected evidence may be described as available after this cutoff |

Availability is separate from period. `REPORT_DATE=2024-12-31` means the
financial period ended in 2024; it does not prove that the number was public in
2024. `NOTICE_DATE` is not equivalent to `REPORT_DATE`.

### Publication PIT

Publication PIT asks whether the underlying financial disclosure existed
publicly:

```text
officialPublishedAt <= analysisAsOf
```

CNINFO may establish this for an annual report. It proves disclosure
availability, not the historical version of every number later exposed by an
aggregator.

### Numeric value-version PIT

Numeric value-version PIT asks whether the exact numeric value consumed by the
valuation can be proven to have been available in that form by the cutoff:

```text
valueAvailableAt <= analysisAsOf
```

Equivalent source-version evidence is acceptable only if it identifies the
numeric source, version/snapshot, value, period, and availability timestamp.
The current design has no such EastMoney version history. Therefore:

```text
CNINFO annual-report publication timestamp
does not prove that today's EastMoney EPSJB/BPS value
equals the value exposed by EastMoney at that historical timestamp.
```

The historical risk class is:

```text
original annual report
  -> later correction / restatement / aggregator normalization
  -> today's historical row
```

Today's FY2024 value may differ from the value observable immediately after the
original publication. The design does not claim that EastMoney definitely
restates every row; it records that the current design cannot prove that it
does not. Strict historical numeric use therefore fails closed unless numeric
value-version evidence is separately established.

The temporal matrix is:

| Matrix | Evidence | Selection rule | Failure |
|---|---|---|---|
| A — market state | dated close observation | latest close with `tradeDate <= valuationDate` | `SOURCE_UNAVAILABLE` or no eligible price |
| B — financial period | annual report row | requested annual period; `reportDate <= valuationDate` | `INCOMPLETE_REQUIRED_FIELDS` or no annual row |
| C — publication PIT | official publication crosswalk | `officialPublishedAt <= analysisAsOf` | `DATA_NOT_PUBLISHED` or publication unverified |
| D — numeric value-version PIT | versioned numeric snapshot/evidence | exact value/version available by `analysisAsOf` | `NO_ELIGIBLE_POINT_IN_TIME_DATA` or weaker status |

For a historical run, PE/PB numeric basis selection must satisfy A, B, C, and D
for `PIT_VERIFIED`. A current run where `analysisAsOf` is approximately
retrieval time may consume the current EastMoney EPS/BPS row after period, unit,
authority, official-filing-existence, and provenance checks, with status
`CURRENT_VALUE_ONLY`. It must not be presented as a reconstruction of a past
state.

Examples from the probe:

- `600519` FY2024 has an EastMoney `NOTICE_DATE` and a CNINFO annual-report
  publication date of 2025-04-03. With `analysisAsOf=2025-03-01` the report is
  unavailable. With `analysisAsOf=2025-04-10`, publication PIT passes, but the
  current EM EPSJB/BPS row remains
  `PUBLICATION_VERIFIED_VALUE_VERSION_UNVERIFIED` unless a numeric version is
  independently proven.
- `000333` FY2024 was crosswalked to 2025-03-29; `300750` to 2025-03-15; and
  `601398` to 2025-03-29. Each must be rejected before its respective date.
- The 2025 year-end rows have aggregator notice dates of 2026-04-17,
  2026-03-31, 2026-03-10, and 2026-03-28 respectively. They are visible in
  the 2026-09-23 current probe, but their historical numeric versions are not
  thereby proven for earlier cutoffs.

The future acceptance run must cover these three windows explicitly:

| Window | Required proof |
|---|---|
| Current/latest as of 2026-09-23 | current price transport, latest eligible annual row, and `CURRENT_VALUE_ONLY` limitations |
| FY2025 / 2026 publication season | reject before each official publication; after publication expose publication PIT separately from numeric-version PIT |
| FY2024 / 2025 publication season | use the four crosswalk dates below; prove before-publication rejection and the post-publication weaker/strict status |

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
| `stock_financial_analysis_indicator_em` | Success for all four | `600519` 103, `000333` 79, `300750` 41, `601398` 85; ranges begin 1998/2004/2014/2003 and end 2026-06-30 | `REPORT_DATE`, `NOTICE_DATE`, `EPSJB`, `BPS`, revenue, parent profit, `PER_EBIT` | EastMoney data center via AKShare | `NOTICE_DATE` gives aggregator availability metadata; official crosswalk does not version the numeric row |
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
independent proof of statutory presentation, and their current values are not
historically versioned by the CNINFO crosswalk. They may support a current
`CURRENT_VALUE_ONLY` run after the remaining period, unit, authority, filing,
and provenance checks. For a fixed historical cutoff they are only
`PUBLICATION_VERIFIED_VALUE_VERSION_UNVERIFIED` unless separate numeric
snapshot evidence exists. The annual rows also expose `PER_EBIT`, but that is a
price-to-EBIT ratio, not an EBITDA amount and must not be used as EBITDA.

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
eligibility. The EM `BPS` value should therefore be tagged as an S3 aggregator
numeric observation. The future source policy should require an official
publication crosswalk for publication PIT and separate numeric version evidence
for strict historical PIT.

This is the principal new D3 method closure: before D3, PE is partially
executable from the existing EPS path while PB is commonly unavailable because
BVPS is not normalized. After D3-001, PE evidence/provenance is hardened and PB
becomes automatically executable for current runs where valid BPS exists. That
does not make the current aggregator row historically PIT-verified.

If a later source-backed derivation is needed, the deterministic alternative is
attributable parent equity divided by an explicitly effective share count. This
is not enabled by this design: both the equity-label mapping and the full
share-count history must first be closed, and a derived value must not override
an authoritative source conflict. Direct EM `BPS` is the only BVPS path active
in D3-001 v0.1; Sina remains a compatible cross-check and values are never
averaged.

### 7.3 Cash — probed and deferred

For future EV/EBITDA evidence, the smallest candidate is the raw
`MONETARYFUNDS` field, retaining its original label, period, currency, and
publication evidence. The design does not claim that this field separates
restricted cash; if the source does not provide that distinction, the limitation
must be recorded and the field must not be silently adjusted.

`601398`'s `CASH_DEPOSIT_PBC` is a bank-specific asset category and is not
interchangeable with non-financial `MONETARYFUNDS`. Bank cash/debt treatment is a
separate policy boundary. Generic reuse is forbidden.

### 7.4 Debt — probed and deferred

Do not use `TOTAL_LIABILITIES`. For a future EV/EBITDA implementation, an
explicit non-financial field registry may consider:

- `BORROW_FUND` when the source exposes it as borrowings;
- `NONCURRENT_LIAB_1YEAR` only after its accounting mapping is verified;
- `LONG_PAYABLE` only after its accounting mapping is verified;
- `BOND_PAYABLE`;
- `LEASE_LIAB`, only if the chosen valuation convention includes lease debt.

Accounts payable, contract liabilities, tax/staff payables, other liabilities,
and total liabilities are excluded. If the source-to-accounting mapping is not
closed for the selected issuer class, debt is unavailable rather than guessed.
Banks require a different registry and are excluded from generic EV/EBITDA.

### 7.5 Net debt — probed and deferred

When and only when every selected component is eligible in a future
EV/EBITDA-specific policy:

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

### 7.7 Shares — probed and deferred

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

For the deferred EV/EBITDA market capitalization path, the intended rule is the latest total
share-count event effective on or before `valuationDate`, not an EPS weighted-
average denominator. `SHARE_CAPITAL` from a balance sheet is not a substitute
for outstanding shares without explicit unit and accounting mapping.

No share pagination, historical reconstruction, or share-based BVPS derivation
is authorized in D3-001 v0.1. Shares may return only through a separate design
decision if a future approved deterministic BVPS derivation requires them.

## 8. Decision register

| # | Decision | v0.1 resolution | State |
|---:|---|---|---|
| 1 | Temporal model | Keep `valuationDate`, annual `reportDate`, official publication PIT, numeric value-version PIT, and `analysisAsOf` separate | resolved |
| 2 | Reporting basis | Annual rows only; no interim-to-full-year substitution | resolved |
| 3 | Publication source | CNINFO bounded official crosswalk; EM notice is S3 availability metadata | resolved |
| 4 | BVPS strategy | Use EM `BPS` as an S3 aggregator observation; official crosswalk proves publication only; strict historical use needs value-version evidence | active D3 scope with PIT gate |
| 5 | Cash definition | Retain `MONETARYFUNDS` candidate and bank differences as deferred evidence; no D3 runtime implementation | probed / deferred |
| 6 | Debt definition | Retain explicit non-financial registry candidates; never total liabilities; no D3 runtime implementation | probed / deferred |
| 7 | Net debt | Retain `eligible debt - eligible cash` as a future formula; no D3 runtime implementation | probed / deferred |
| 8 | EBITDA | No direct or defensible derived amount found; keep unsupported | blocking for EV/EBITDA |
| 9 | Shares temporal rule | Retain latest effective total-share event rule as a future EV/EBITDA asset; no D3 runtime implementation | probed / deferred |
| 10 | Share history source | `stock_zh_a_gbjg_em` exists but pagination/coverage is incomplete; do not implement it in D3 | probed / deferred |
| 11 | Financial-sector boundary | `601398` is a negative/control issuer; bank PE/PB may be allowed when EPS/BVPS gates pass; no bank EV design | resolved |
| 12 | Units | Explicit CNY/share mappings for market price, EPS, and BVPS; no numeric inference | active D3 scope |
| 13 | D0 source policy | Active ladders only for market, EPS, BVPS, and publication proof; deferred fields have no D3 runtime policy | resolved |
| 14 | Failure semantics | Separate publication rejection, value-version weakness, current-only use, and unavailable states; fail closed on ambiguity | resolved |
| 15 | Smallest scope | Outcome D: PE/PB Evidence Closure; defer EV/EBITDA supporting fields | resolved for Sol review |

Open/blocking items are implementation acceptance gates, not permission to expand
scope: numeric value-version evidence for strict historical PE/PB, live market
transport, and the future EV/EBITDA field closures.

## 9. Method feasibility

| Method / analysis mode | D3 v0.1 status | Reason |
|---|---|---|
| PE current/latest | `IMPLEMENTABLE_WITH_LIMITATION` | Existing EPS path can be hardened; price transport, units, provenance, official filing existence, and current-value checks remain acceptance requirements |
| PB current/latest | `IMPLEMENTABLE_WITH_LIMITATION` | EM BPS is available as an S3 aggregator observation; current-use gates and provenance remain acceptance requirements |
| PE/PB strict historical PIT | `NOT_YET_PIT_VERIFIED` | CNINFO proves publication, but current EM/Sina rows have no numeric value-version proof; fail closed or expose the weaker status |
| PE/PB bank current/latest | `IMPLEMENTABLE_WITH_LIMITATION` | `601398` may use PE/PB if EPS/BVPS gates pass; no generic bank EV treatment is permitted |
| EV/EBITDA | `NOT_CURRENTLY_SUPPORTABLE` | EBITDA source/formula unavailable; cash/debt and shares are deferred secondary blockers |

No field or historical method is marked `READY` or `PIT_VERIFIED` by this probe.
“Implementable with limitation” applies to the current product path only; it
must not obscure the strict historical limitation.

## 10. Source policy and failure semantics

D3 should use the existing D0 acquisition contracts rather than create a
valuation-specific provider layer. Requirements should identify the consumer as
the valuation workflow, use `AUTHORITATIVE_NUMERIC` for numeric inputs, and
record `originPublisher`, `originAuthority`, `retrievalProvider`, `sourceUrl`,
`publishedAt`, and `retrievedAt` separately.

The D3-001 active policy ladders are limited to:

- `FIRST_VALID` within the approved authority ladder for a single low-risk
  field among market price, EPS, BVPS, and official publication proof, after
  period, unit, provenance, and the appropriate PIT checks;
- `CROSS_CHECK` for EPS/BVPS when the Sina and EastMoney period/unit definitions
  are compatible;
- no LLM numeric fallback. D0's numeric synthesis prohibition remains binding;
- zero or ambiguous official publication matches fail closed;
- source disagreement is surfaced as `SOURCE_CONFLICT`, not averaged.

The authority split is explicit:

| Role | D3 value |
|---|---|
| Origin numeric publisher | EastMoney for `EPSJB`/`BPS`; authority `S3_AGGREGATOR` |
| Retrieval provider | AKShare |
| Official filing availability | CNINFO; authority `S0_STATUTORY` for the disclosure evidence |
| Cross-check publisher | Sina; a cross-check source, not a publication-PIT authority |

CNINFO does not upgrade an S3 numeric observation to S0. AKShare is the
retrieval provider, not the original publisher. The current adapter's
`publisher: "AKShare"` label is insufficient for D3 provenance and must be
corrected in the later implementation without changing the existing provider
boundary. Cash/debt/shares have no active D3 source-policy ladder.

## 11. Smallest safe implementation scope

Outcome D — PE/PB Evidence Closure:

Implement:

1. provenance-correct the existing `historicalMarketData()` path and verify
   transport and date behavior;
2. add the bounded CNINFO annual-report publication crosswalk and retain the
   publication proof;
3. normalize annual EPS/BVPS observations with deterministic unit mapping;
4. separate EastMoney origin publisher/`S3_AGGREGATOR` from AKShare retrieval
   provider and CNINFO `S0_STATUTORY` publication evidence;
5. add publication-PIT gating and the explicit numeric value-version status;
6. wire the normal Valuation Workflow and existing `methodEligibility` without
   changing valuation arithmetic;
7. make `EV_EBITDA` explicitly unavailable.

Reuse:

- existing valuation arithmetic;
- existing `historicalMarketData()`;
- the AKShare bridge;
- the existing CNINFO client boundary;
- D0 contracts for authority, provenance, selection, and numeric-truth policy.

Defer:

- cash, debt, and net debt;
- historical share pagination and valuation-date share reconstruction;
- EV/EBITDA and any supporting-field implementation;
- peers/comps and DCF.

Cash/debt/net-debt and shares remain in this document as `PROBED / DEFERRED`
design assets. No D0 runtime policy for them is authorized by D3-001 v0.1.
Shares may return through a separate design decision only if an approved
deterministic BVPS derivation later requires them.

This scope does not authorize arithmetic changes. It establishes evidence for
the existing PE/PB method calculations and truthful EV/EBITDA unavailability.

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

The implementation task must provide machine-readable current product-path
evidence for at least `600519` and `000333` (or `300750`), plus `601398` as a
control. The current run must prove:

- transport-verified eligible price;
- annual EPS/BVPS with `reportDate`, units, and positive method gates where
  applicable;
- original publisher, authority, retrieval provider, retrieval timestamp, and
  source URLs;
- CNINFO filing existence and publication crosswalk;
- a construction of `ValuationBasis` and normal `methodEligibility` behavior;
- `CURRENT_VALUE_ONLY` rather than a historical PIT claim when numeric version
  evidence is not available;
- explicit `EV_EBITDA` unavailability with no fabricated fields.

### Publication rejection test

For at least one issuer, set `analysisAsOf` before the CNINFO annual-report
publication:

```text
analysisAsOf before official annual-report publication -> reject
```

The financial period is unavailable for that cutoff. This test is mandatory and
proves publication PIT failure.

### Post-publication numeric-version test

Run again after publication:

```text
official publication availability passes
```

Then mark strict historical PIT as `PIT_VERIFIED` only if the exact numeric
source/version is shown to have been available by `analysisAsOf`. Without that
proof, return or expose
`PUBLICATION_VERIFIED_VALUE_VERSION_UNVERIFIED`; strict historical PE/PB
acceptance must fail. The test must expose this distinction rather than infer
numeric version from the CNINFO crosswalk.

The acceptance evidence must also prove that no selected financial row or source
evidence is later than the cutoff, that Sina/EastMoney disagreement produces
`SOURCE_CONFLICT` with both values preserved, and that no LLM-generated numeric
field entered the basis.

The acceptance test must distinguish fixture-backed deterministic tests from
authenticated/live provider acceptance. A fixture can prove selection,
classification, and arithmetic wiring; it cannot prove source availability or
publication authority. No cash/debt/share pagination acceptance belongs in
D3-001 v0.1.

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

## 15. Implementation closure

The implementation uses the existing seams described above:

- `AkshareDataAdapter.valuationFinancialIndicators()` calls the existing
  `stock_financial_analysis_indicator_em` operation and exposes annual
  `report_date`, `aggregator_notice_date`, `eps_jb`, and `bvps` fields. The
  existing `financialData()` operation remains source-compatible for other
  consumers.
- The existing raw market operation remains `stock_zh_a_hist(..., adjust='')`.
  Valuation-local evidence identifies EastMoney as origin publisher,
  `S3_AGGREGATOR` as authority, and AKShare as retrieval provider.
- `CninfoOfficialDisclosureClient.resolveAnnualReportPublication()` reuses
  `topSearch/query` and bounded `hisAnnouncement/query` requests with the
  resolved `<secCode>,<orgId>` stock, annual-report category, bounded
  `seDate`, page size 30, bounded pagination, body-title classification, and
  fail-closed same-time ambiguity.
- `workflows/valuation/basis-evidence.ts` owns annual selection, explicit
  `CURRENT_VALUE_ONLY` versus fixed-`asOf` classification, publication proof,
  metric-level provenance, units, and the non-versioned EastMoney limitation.
  `ValuationBasis` remains the calculation projection; `ValuationWorkflowResult`
  exposes the additive optional `basisEvidence` seam.
- Omitted `asOf` is current-run mode. Any supplied `asOf`, including the current
  calendar date, is fixed-asOf mode. Fixed runs after CNINFO publication remain
  `PUBLICATION_VERIFIED_VALUE_VERSION_UNVERIFIED` and do not construct an
  automatic PE/PB basis.
- The normal Application Runtime passes its existing CNINFO client into
  `ResearchService` and then the Valuation Workflow. No caller performs manual
  publication matching.
- D3 keeps EV/EBITDA unsupported in the normal official-evidence path and does
  not acquire cash, debt, net debt, share history, or EBITDA fields.

The offline D3 matrix is in
`tests/workflows/valuation-basis-evidence.test.ts`. The gated real-source
harness is `scripts/acceptance-valuation-basis-evidence-d3-real.ts`; it is
disabled unless `RESEARCHHUB_RUN_REAL_VALUATION_BASIS=1` and reports transport, EastMoney,
CNINFO, and basis-resolution stages independently without fabricating success.

Implementation validation passed `npm run typecheck`, `npm run client:typecheck`,
`npm run client:build`, `npm test` (1,424 Node tests and 28 client tests), and
`git diff --check`. The enabled real-source attempt reached EastMoney financial
rows for all four targets, but market transport was empty or proxy-unavailable
and no current CNINFO publication proof was returned; every current target
therefore remained unavailable rather than being accepted as a valuation basis.
The same run attempted bounded 600519 FY2024 before/after publication windows;
those historical outcomes are recorded separately from current market failure
and never promote a current numeric row to strict PIT evidence.

## 16. Review gate

Sol acceptance remains pending. The live source feasibility probe and bounded
implementation validation are complete, the current implementation boundary
is preserved, EV/EBITDA is explicitly blocked, and review should confirm the
separate publication/value-version PIT model, publication crosswalk, active
PE/PB scope, and deferred EV/EBITDA evidence assets.
