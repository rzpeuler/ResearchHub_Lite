# Earnings Expectations Acquisition v0.1 (D1-001)

Status: implementation evidence for Sol acceptance; this document does not close or merge D1-001.

## Scope

The Earnings Review automatic expectations path acquires report-level analyst estimates through the existing Workflow, Skill, Plugin, and Knowledge boundaries. It does not add an Agent Runtime, a generic provider layer, a vector store, or a direct Knowledge writer.

The acquisition result remains report-only input to the existing W2 `EstimatePoint` and `ConsensusSnapshot` contracts. Caller-supplied `EarningsReviewExpectationsBundle` input has absolute precedence.

## Live schema probe

Probe target: ticker `600519` (贵州茅台), executed on Windows with Python `3.12.10` and AKShare `1.18.64`.

### THS institution forecast

Call: `ak.stock_profit_forecast_ths(symbol="600519", indicator="业绩预测详表-机构")`.

Observed columns:

`机构名称`, `研究员`, `预测年报每股收益2026预测`, `预测年报每股收益2027预测`, `预测年报每股收益2028预测`, `预测年报净利润2026预测`, `预测年报净利润2027预测`, `预测年报净利润2028预测`, `报告日期`.

Representative observed rows included 诚通证券 / 陈文倩 with EPS `65.14`, `67.87`, `71.32`, net profit `814.24亿`, `848.44亿`, `891.60亿`, report date `2026-09-18`; 浙商证券 / 张潇倩; and 国海证券 / 刘旭德.

The live AKShare JSON bridge returns Chinese column names as UTF-8 and provider timestamps as epoch milliseconds. The adapter explicitly sets `PYTHONIOENCODING=utf-8`; the projection accepts numeric timestamps and normalizes the provider's Shanghai calendar date to Asia/Shanghai end-of-day.

### EastMoney individual research reports

Call: `ak.stock_research_report_em(symbol="600519")`.

Observed columns:

`序号`, `股票代码`, `股票简称`, `报告名称`, `东财评级`, `机构`, `近一月个股研报数`, `2026-盈利预测-收益`, `2026-盈利预测-市盈率`, `2027-盈利预测-收益`, `2027-盈利预测-市盈率`, `2028-盈利预测-收益`, `2028-盈利预测-市盈率`, `行业`, `日期`, `报告PDF链接`.

Observed individual rows included 诚通证券, 西南证券, and 中银证券 with EPS values, numeric report dates, and `https://pdf.dfcfw.com/pdf/...` links.

The aggregate `ak.stock_profit_forecast_em()` probe exposed only aggregate fields such as `序号`, `代码`, `名称`, `研报数`, rating counts, and aggregate forecast columns. It does not expose the institution, report publication timestamp, or report PDF binding required for an `EstimatePoint`; the D1 path therefore never projects aggregate rows as individual estimates.

## Source ladder and D0 integration

The registered policy is `earnings-expectations-source-ladder-v0.1`, selection mode `FIRST_VALID`:

1. `ths-institution-forecast` / `akshare.stock_profit_forecast_ths` — PRIMARY, S3 aggregator, Tonghuashun origin; supports EPS and net profit.
2. `eastmoney-individual-research-report` / `akshare.stock_research_report_em` — FALLBACK_1, S3 aggregator, EastMoney origin; supports EPS only.

The ladder runs through `runResearchDataAcquisition` per metric. A successful THS response prevents the EastMoney call for that metric. THS transport failure, empty data, malformed rows, or no eligible point-in-time rows can fall through to the eligible EastMoney EPS route. Net profit has no fabricated fallback.

The existing direct EastMoney Report API remains supported as a compatibility fallback when the new AKShare individual-report method is not present. It is not used to replace the observed AKShare route.

D0 hardening included in this slice:

- all-future or point-in-time-invalid attempts resolve to `NO_ELIGIBLE_POINT_IN_TIME_DATA`;
- all no-data attempts resolve to `DATA_NOT_PUBLISHED`;
- incomplete required fields resolve to `INCOMPLETE_REQUIRED_FIELDS`;
- `LLM_WEB` with `EXTRACT_WITH_PROVENANCE` requires origin publisher, source URL, publication timestamp, and retrieval timestamp.

## Normalization and provenance

- Institution keys are deterministic: trimmed/NFKC-normalized names are preserved in source metadata and mapped to `ths-org:<name>` or `eastmoney-org:<name>`; no fuzzy entity resolution is performed.
- EPS unit is `CNY_per_share`.
- THS net profit unit is `CNY_yuan`. Only explicit `元`, `万元`/`万`, or `亿元`/`亿` values are accepted; bare numeric net-profit values are rejected and never zero-filled.
- Date-only and provider epoch dates are normalized to Asia/Shanghai end-of-day (`23:59:59.999` local time).
- Source and estimate IDs are SHA-256-derived from provider, ticker, institution, metric, fiscal period, publication timestamp, and normalized value. Row order is not an identity input.
- Source metadata retains origin publisher, retrieval provider, publication date, retrieval date, report title, and individual EastMoney PDF URL where provided.

## W2 behavior

The existing W2 assembly remains authoritative. It accepts EPS and net-profit annual points for the requested fiscal year, validates source bindings and point-in-time constraints, links genuine revisions, and selects the latest point per institution for consensus. Consensus is still calculated only for annual EPS with the existing minimum of two institutions; no raw-point averaging is introduced. Future points are excluded, and one-institution input remains unavailable.

## Real validation evidence

Command: `RESEARCHHUB_RUN_REAL_EXPECTATIONS=1 npm run acceptance:earnings-expectations-d1-real`.

This command exercises `resolveEarningsExpectations` with an AKShare client on the workflow input and does not manually inject `earningsExpectationsSource`.

Observed normal-resolver run at `2026-09-22T03:14:01.237Z` for `600519`:

- status: `EXPECTATIONS_PRODUCT_PATH_VERIFIED`;
- automatic source injection: false;
- acquisition status: `available`;
- THS: attempted and succeeded for the EPS and net-profit requirements;
- THS provider: attempted and succeeded, 10 usable sources;
- EastMoney individual fallback: not attempted;
- resolver output: 20 requested-fiscal-year points, 10 institutions, 1 EPS consensus snapshot;
- the full Earnings Review Workflow was not run by this gated script; official filing and reasoning dependencies were outside this focused product-path validation.

Live provider data is expected to change; the command is intentionally gated and is not part of the offline test suite.
