# Wave 1 Deterministic Valuation Calculation Engine

Date: 2026-09-18
Task: `RHL-W1-002-VALUATION-CALCULATION-ENGINE`
Status: approved execution baseline

## Scope and ownership

W1-002 implements pure deterministic finance calculations under
`skills/valuation/calculations/`, owned by the existing Valuation Skill. The
module has no Knowledge, Workflow, Application, Plugin, persistence, or
reasoning dependency. It is an internal calculation surface and is not
re-exported by `skills/valuation/index.ts`.

The current Valuation v0.1 product remains PE, PB, and EV/EBITDA. No DCF
route, tool, workflow, report contract, or public method is added. Acquisition
and input-readiness for risk-free rate, beta, ERP, debt cost, and forecasts are
deferred to a later integration decision.

## Deterministic calculations

- CAPM uses `costOfEquity = riskFreeRate + beta * equityRiskPremium`; ERP is
  non-negative and all inputs/results are finite.
- After-tax debt cost uses `afterTaxKd = pretaxCostOfDebt * (1 - taxRate)`
  with a bounded tax rate.
- WACC uses market-value equity and gross debt only. Cash is intentionally not
  `WACC = equityWeight * costOfEquity + debtWeight * afterTaxKd`, with
  `equityWeight = E / (E + D)` and `debtWeight = D / (E + D)`.
- FCFF is constructed per explicit forecast period as
  `EBIT = revenue * ebitMargin`, `NOPAT = EBIT * (1 - taxRate)`, and
  `FCFF = NOPAT + D&A - CapEx - changeInNwc`.
- Forward DCF uses Gordon growth, annual or explicit mid-year discount periods,
  and the final discount period for terminal-value discounting:
  `TV = FCFF_N * (1 + g) / (r - g)` and `EV = PV(explicit FCFF) + PV(TV)`.
- Reverse DCF decodes the terminal FCFF implied by an explicit current EV and
  the same annual forward-DCF convention; it is an expectation diagnostic,
  not an optimizer or unique market conclusion.
- Comparable-company arithmetic accepts an already-selected peer set,
  computes `EV = marketCap + grossDebt + preferredStock + minorityInterest -
  cash` and eligible multiples, and records unavailable denominators rather
  than producing `NaN`, `Infinity`, or synthetic peers.
- DCF sensitivity fully recalculates every cell. Cells with `r <= g` are
  explicit unavailable/error cells.
- QC emits bounded critical/warning/info diagnostics. Terminal-value share
  above 80% is a warning about assumption sensitivity, not an investment
  recommendation.

## Error and validation boundary

Invalid numeric inputs raise `ValuationCalculationError` with stable safe
codes. Calculation results are checked for finite values before returning.
Optional balance-sheet adjustments use neutral arithmetic absence only where
the contract marks them optional; no market or valuation assumption is
defaulted.
