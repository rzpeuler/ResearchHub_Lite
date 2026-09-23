# D3-002 v0.1 — Minimal PE/PB Comparable Input Closure

- Task: `RHL-D3-002-DESIGN`
- Status: `DESIGN READY / SOURCE FEASIBILITY PROBED / SOL REVIEW PENDING`
- Checked: `2026-09-23`
- Branch: `codex/d3-002-comparable-input-design`
- Worktree: `C:\Users\Administrator\Desktop\ResearchHub_Lite_worktrees\D3_002`
- Starting HEAD: `626f3ab69bc0d8dfc94d98467059a73675387263`
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
- EastMoney industry identity, board-list, board-constituent, and real-time
  spot endpoints were transport-unavailable in this environment.
- The published direct PE field is explicitly labelled `市盈率-动态`; its
  denominator and period semantics were not established.
- Free current sources and the existing repository contracts did not prove a
  deterministic comparability set beyond coarse industry membership plus a
  possible market-cap scale filter.

Therefore the architecture outcome for this design/probe task is:

> **C. NOT_CURRENTLY_SUPPORTABLE**

This is a source-and-contract feasibility result, not a statement that a
future narrow Option C design is impossible. The cleanest future direction,
if the missing source and comparability gates are later proven, is a bounded
current-only resolver that computes peer PE/PB from price and common-period
EPS/BVPS. No runtime D3-002 implementation is authorized by this document.

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
| Period alignment | Possible but expensive | Not proven | Deterministic latest common published FY |
| Provenance | Many fields and deferred components | Direct field lineage but weak semantic proof | Separate identity, market, financial, publication, and comparability refs |
| Existing code reuse | Reuses legacy arithmetic but smuggles deferred inputs | Little safe reuse beyond display | Reuses D3-001 price/EPS/BVPS/publication seams and existing crosscheck adapter |
| Runtime complexity | High; many fields and calls | Low but semantically unsafe | Bounded discovery plus per-peer evidence calls |
| Recommendation | Reject for D3-002 scope | Reject as canonical calculation input | Conditional future direction only after source/comparability gates pass |

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
price timing, and publication/value-version semantics are explicit. The live
probe did not establish the candidate universe or deterministic comparability
gate needed to authorize it now.

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

## 9. Target discovery and candidate universe design

### 9.1 Deterministic target-industry resolution

The future resolver should use this sequence, only in current mode:

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

The live probe could not execute steps 2–4 because all three relevant
EastMoney endpoint families were transport-unavailable. Consequently:

| Target | Resolved industry | Board source | Candidate count | Sample candidates | Ambiguity |
|---|---|---|---:|---|---|
| `600519` | unavailable in probe | unavailable | unavailable | none claimed | unresolved by transport |
| `000333` | unavailable in probe | unavailable | unavailable | none claimed | unresolved by transport |
| `300750` | unavailable in probe | unavailable | unavailable | none claimed | unresolved by transport |
| `601398` | unavailable in probe | unavailable | unavailable | none claimed | unresolved by transport |

### 9.2 Industry is candidate discovery only

Same-board membership is not proof of business-model, product, customer,
economics, growth, margin, capital-intensity, geography, or scale comparability.
It may supply one `industry_membership` evidence item in a future additive
contract. It must not be expanded into arbitrary values for the existing nine
`COMPARABILITY_DIMENSIONS`.

### 9.3 Proposed bounded funnel

If the missing source gates are later proven, the smallest deterministic funnel
is:

```text
exact target identity
  -> exact current industry board and membership
  -> exclude target and invalid identities
  -> current market-cap availability
  -> proposed scale band: 0.25x <= peer/target market cap <= 4.0x
  -> stable ticker-order cap of 12 expensive candidates
  -> common-period EPS/BVPS and publication checks
  -> deterministic comparability gate
  -> 3–8 accepted metric-specific peers
```

The `0.25x–4.0x` scale band and 12-candidate expensive-validation cap are
design recommendations, not live-proven thresholds. They are intentionally
scale-based and ticker-stable; they do not rank by valuation, return, or
performance. Sol must approve or revise them before implementation.

The live probe did not establish a practical target-specific universe size.
The documentation example shows that a board constituent query can return an
entire board, so the future resolver must never send an unbounded 50–200-name
board through financial and CNINFO calls.

## 10. Comparability design

### 10.1 Dimensions actually provable

From the currently available free structured surfaces, the only plausible
code-owned dimensions are:

- exact current EastMoney industry-board membership;
- market-cap scale, if the spot snapshot is available and its units are valid;
- A-share identity and exchange;
- common annual reporting period and currency after D3-001 normalization.

The probe did not establish a deterministic product/service, customer,
business-model, economics, growth, margin, capital-intensity, or geography
classifier. CNINFO text may contain business descriptions, but no existing
structured operation proves those dimensions without introducing an extraction
and policy project. LLM selection is not an acceptable substitute.

### 10.2 Minimum evidence

A future peer must have, independently:

- exact identity evidence: ticker, exchange, company ID, and name;
- exact industry-board and membership evidence;
- current market evidence for price and the scale filter;
- common-period annual EPS and/or BVPS evidence;
- CNINFO annual-publication proof for the same fiscal year;
- explicit currency, units, retrieval time, and current-only PIT status;
- a non-empty, code-owned comparability evidence set.

For the current free-source design, industry membership plus scale is not enough
to claim all existing generic comparability dimensions. This is the quality
blocker behind the architecture outcome C. A future implementation must either
freeze those two dimensions as sufficient for a deliberately narrow PE/PB
comps contract, or add a separately proven deterministic business-similarity
source. It must not silently populate unsupported dimensions.

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
current industry membership, current market observations, and the latest common
annual financial period whose publication evidence is available.

When `asOf` is explicitly supplied, automatic peer resolution returns
`AUTO_COMPS_HISTORICAL_UNAVAILABLE` unless versioned industry membership,
market, financial, and comparability evidence is separately proven. Current
board constituents must never be projected backward into a historical universe.

Caller-supplied historical `CompsValuationInput` remains governed by its
existing contract and gates.

### 11.2 Latest common fiscal year

The proposed period is the latest fiscal year in the intersection of:

- the target's annual EPS/BVPS rows;
- every candidate's annual EPS/BVPS rows;
- publication-eligible CNINFO annual reports for the target and every accepted
  peer.

Every accepted peer and the subject must use the same `FYyyyy` period. A peer
cannot independently choose its own latest fiscal year and still enter the same
peer median.

Current market price may be latest observable current-mode price, but the
result remains `CURRENT_VALUE_ONLY`; CNINFO publication proves disclosure
availability, not a historical version of EastMoney's numeric value.

### 11.3 Market timing choice

The preferred future choice is reuse of D3-001's `historicalMarketData()` path
for peer prices, in omitted-`asOf` current mode, because it preserves the
existing daily-close normalization and retrieval semantics. The spot endpoint
is needed only for a current market-cap scale prefilter if its transport and
field contract are available.

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
| Industry/membership | future bounded EastMoney board acquisition | EastMoney classification remains S3/discovery evidence, not statutory fact |

Every accepted peer must retain separate source refs for:

```text
identity/industry
market price
financial numeric
official publication
comparability evidence
```

No synthetic one-source peer record may hide those lineages. No EastMoney
numeric observation may be relabelled as CNINFO authority, and no AKShare
retrieval may become the publisher.

## 13. Conditional narrow calculation contract

If source and comparability gates are later proven, the additive contract should
be narrower than `ComparableCompanyInput` and metric-specific. A conceptual
shape is:

```text
ComparableEquityMultiplePeer {
  identity: { companyId, ticker, exchange, name }
  method: PE | PB
  multiple: number
  period: { kind: FY, label: FYyyyy, fiscalYear }
  currency: CNY
  asOf: current retrieval timestamp / current-run marker
  pitStatus: CURRENT_VALUE_ONLY
  sourceRefs: identity + market + financial + publication + comparability
  comparabilityEvidence: explicitly supported dimensions only
}
```

The calculation input would also need the subject's existing D3-001 EPS/BVPS
and price basis, rather than reacquiring target financial evidence. The exact
type is deliberately not frozen because the current live probe did not prove
that the resolver is implementable.

The contract must remain additive:

- existing caller-supplied `CompsValuationInput` remains valid;
- legacy EV/Revenue, EV/EBITDA, and FCF callers are not migrated;
- automatic v0.1 emits only PE/PB;
- no generic `PeerDataEngine`, `PeerService`, or Knowledge peer graph is added.

## 14. PE and PB calculation proposals

### PE

For each accepted PE peer:

```text
peerPE = peerCurrentPrice / peerCommonFYAnnualEPS
```

Required: positive finite price, positive finite annual EPS, common FY period,
CNY units, current-mode timestamp, industry/scale comparability evidence, and
CNINFO publication proof.

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
CNY units, current-mode timestamp, industry/scale comparability evidence, and
CNINFO publication proof.

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
  -> build narrow PE/PB summary if all gates pass
  -> expose existing comps_valuation crosscheck

caller comps absent + fixed asOf supplied
  -> AUTO_COMPS_HISTORICAL_UNAVAILABLE
  -> keep comps unavailable; do not fabricate a historical universe
```

`buildValuationCrosscheck()` should remain the integration seam. It should
receive a compatible valuation method result or a narrow adapter result; its
basis compatibility, disagreement diagnostics, and `automaticAveraging: false`
behavior must not be redesigned.

Automatic comps must remain a cross-check. It must not replace the selected
primary scenario method or silently change investment conclusions.

## 16. Banks and sector control

`601398` is intentionally included as a control. The proposed current-only
machinery can calculate PE/PB for banks without introducing bank EV, debt, or
EBITDA. However, the live industry/spot probe did not establish the bank board
membership or a sufficient bank-specific comparability set.

Therefore `601398` does not authorize a bank peer result. A future acceptance
run must separately prove that the target and accepted bank peers pass the same
identity, period, publication, metric, and comparability gates. A bank sector
gate may be needed, but no bank-specific generic debt or EBITDA path belongs in
D3-002.

## 17. Candidate and peer-count policy

Proposed future defaults, pending Sol approval:

- minimum valid peers per metric: `3`;
- maximum accepted peers per metric: `8`;
- maximum expensive financial/publication validations after cheap filters: `12`;
- selection basis: `peer_median` only;
- fewer than three valid peers: `INSUFFICIENT_VALID_PEERS`;
- no dynamic lowering of the minimum;
- PE and PB counts remain metric-specific.

The probe could not validate these counts because the industry and spot
endpoints were transport-unavailable. They are design hypotheses, not accepted
runtime behavior.

## 18. Future D0 requirements

Only if the source feasibility blocker is cleared, a future D0 design should
define narrow requirements for:

```text
peer_candidate_discovery
peer_industry_membership
peer_market_price
peer_market_cap_scale
peer_eps
peer_bvps
peer_publication
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
- exact target industry-to-board mapping and membership proof;
- at least three accepted peers for PE and/or PB;
- common fiscal year across subject and accepted peers;
- separate market, financial, CNINFO, identity, and comparability source refs;
- deterministic peer median and existing `comps_valuation` crosscheck;
- no debt/cash/netDebt/shares/EBITDA acquisition;
- fixed-asOf negative control returning `AUTO_COMPS_HISTORICAL_UNAVAILABLE`.

Negative acceptance must fail closed for:

```text
industry mapping unresolved
too few qualified peers
period mismatch
missing source or dangling source ref
source after cutoff
metric unavailable
insufficient comparability evidence
fixed-asOf automatic request
direct PE/PB denominator semantics unknown
```

No live success may be claimed when industry, market, financial, or CNINFO
stages fail. Fixture rows must never replace a failed live stage.

## 20. Architecture decision

**C. NOT_CURRENTLY_SUPPORTABLE**

Exact blockers:

1. The required current industry identity/board/constituent path could not be
   transport-verified for any sample target.
2. The required current spot market-cap path could not be transport-verified,
   so no bounded scale filter or current peer market input was established.
3. The direct PE/PB fields have unproven denominator, period, and update
   semantics and cannot be canonicalized.
4. Existing free structured sources prove only coarse membership and possible
   scale; they do not prove enough deterministic comparability dimensions for
   the existing peer contract.
5. The legacy contract requires deferred debt/cash and, for implied per-share
   output, shares, so retaining it would violate D3-001 scope.

Conditional future direction: re-probe the blocked endpoints in a transportable
environment, then evaluate a narrow Option C contract with Sol-approved
industry/scale comparability, common-FY rules, metric-specific acceptance, and
current-only PIT semantics. Until then, automatic D3-002 must remain unavailable
and caller-supplied comps must remain the only normal input path.

## 21. Open/blocking questions

- Can a governed runtime transport EastMoney board and spot endpoints reliably
  enough for a bounded current product call?
- Is exact EastMoney board membership plus a scale band sufficient for the
  narrow PE/PB comparability contract, or is a deterministic product/business
  evidence source required?
- What exact scale band and expensive-validation cap should Sol approve?
- Should peer price use the D3-001 latest daily close or a current spot price
  when both are available, and how should the two source timestamps be compared?
- Which fiscal-year intersection rule should be frozen when a peer lacks the
  latest annual row or CNINFO publication proof?
- Is a separate bank-sector comparability gate required for `601398`?
- How should metric-specific peer summaries be represented without coupling
  legacy EV fields to automatic PE/PB?
- What exact D0 policies and acceptance labels should be added after live
  transport and comparability are proven?

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

