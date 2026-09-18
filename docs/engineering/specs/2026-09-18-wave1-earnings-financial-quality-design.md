# Wave 1 Earnings Financial Quality Engine

Date: 2026-09-18
Task: `RHL-W1-003-EARNINGS-FINANCIAL-QUALITY`
Status: implemented / Sol acceptance pending

## Scope and non-goals

W1-003 extends the existing Earnings Review Skill with deterministic,
report-only financial-quality analysis. It normalizes a narrow set of explicit
raw accounting amounts already present in the single AKShare
`financialData(...)` payload, computes working-capital, accrual, and cash
conversion measures, and emits bounded revenue-recognition follow-up flags.

This slice does not add a provider, provider call, top-level Skill, Workflow,
Knowledge kind, metric registry entry, durable proposal mapping, Beneish
M-score, Piotroski or Altman score, consensus logic, or automatic persistence.

## Source-data boundary

The Workflow calls `akshare.financialData(...)` once. Financial-quality
normalization receives that same raw payload and selects exact rows by
reporting date, independent of row order. Only explicit amount aliases are
accepted. Missing or malformed fields remain unavailable; provider turnover
ratios, margins, days, and percentage indicators are never reverse-engineered
into raw amounts. Chinese scaled strings such as `万` and `亿` are rejected.

The normalized data distinguishes:

- `current`: the requested exact period;
- `opening`: the previous fiscal year end;
- `priorComparable`: the same reporting period in the prior year.

## Period-day convention

For calendar-year A-share periods, `daysInPeriod` is the inclusive UTC/calendar
day count from January 1 through the exact period end. It therefore handles
non-leap Q1/H1/Q3/FY and leap-year H1/FY without fixed 90/180/365
approximations.

## Deterministic calculations

Working capital uses opening/current averages:

```text
DSO = average AR / current revenue * daysInPeriod
DIO = average inventory / current COGS * daysInPeriod
DPO = average AP / current COGS * daysInPeriod
CCC = DSO + DIO - DPO
```

Revenue must be positive for DSO; COGS must be positive for DIO/DPO; balances
must be non-negative; and CCC is available only when all three components are
available.

Accrual quality is a screening ratio only:

```text
accrual ratio = (current net income - current CFO) / average total assets
```

Both total-asset values and the average must be positive. No universal quality
threshold or manipulation conclusion is produced.

Cash conversion calculates CFO / net income when net income is non-zero. With
explicit non-negative CapEx it also calculates `FCF = CFO - CapEx` and
`FCF / net income`. Negative net income is mathematically allowed; zero net
income makes conversion ratios unavailable.

Revenue-recognition comparisons use an explicit Workflow-supplied threshold
of `0.10` (10 percentage points). Growth requires a positive prior denominator
and non-negative current value; CFO growth additionally requires positive
current and prior CFO. Flags are research follow-up diagnostics only. The
deferred-revenue flag is explicitly context-dependent and requires follow-up.

## Integration and Knowledge neutrality

The calculation summary carries the exact current period, source candidate ID,
deterministic results, and diagnostics. It is included in the bounded local
structured source snapshot and appended deterministically to only the existing
`Cash Flow / Working Capital` and `Earnings Quality` report sections. The
fourteen-section contract is unchanged. Missing optional quality inputs do not
block an otherwise valid Earnings Review.

Financial-quality values are not added to `EarningsComputation.metrics` or
`byMetric`, the durable structured-value allowlist, the v0.4 Knowledge
projection, the metric registry, or canonical Observations. Existing
proposal flow remains:

```text
Semantic Proposal -> Gateway -> Schema validation -> ChangeSet -> Writer
```

The financial-quality calculation directory has no Knowledge, Workflow, App,
or Plugin imports, and performs no network access.
