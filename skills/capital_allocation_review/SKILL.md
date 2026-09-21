# Capital Allocation Review

## Purpose

Review attributable capital actions and calculate bounded capital-intensity,
payout, leverage, share-count, and acquisition metrics.

## Invocation Match

Use for CapEx, M&A, buybacks, dividends, debt repayment, cash accumulation, or
economically relevant R&D questions with dated evidence. Do not infer that an
action created value merely because it occurred.

## Typical Intents

- “How much capital did the company return or reinvest?”
- “Did the acquisition clear an explicit return hurdle?”

## Inputs

Dated actions, amounts and units, period context such as revenue/net income or
market capitalization, optional share/debt observations, subsequent outcomes,
and source references.

## Produces

Deterministic capital metrics plus `value_supported`, `value_destroyed`, or
`inconclusive`. Value assessment is limited to organic CapEx, acquisitions, and
R&D/reinvestment, and requires attributable return, hurdle, action amount, and
subsequent outcome evidence.

## Methodology

Calculate only ratios supported by explicit denominators. Preserve action type,
period, source references, and unavailable metrics independently. Do not apply
an incremental-return/hurdle test to dividends, buybacks, debt repayment, cash
accumulation, or generic actions.

## Evidence Requirements

Every action and subsequent outcome must be attributable and within the as-of
boundary. Value creation requires explicit return, hurdle, action amount, and
subsequent operating/economic outcome evidence.

## Deterministic / Model Boundary

Code owns amount validation, ratios, changes, action-type applicability, and
hurdle comparison. A model may summarize strategic rationale but may not invent
a return, price paid, or economic outcome.

## Missing Data

Missing denominators or value-assessment evidence remain unavailable or
inconclusive and are never replaced with industry defaults.

## Validation / QC

Reject duplicate IDs, future actions, negative amounts, absent units, and
unattributed outcomes. Keep value judgments bounded to explicit metrics.

## Related Skills

`management_execution`, `financial_quality_analysis`, and
`business_driver_analysis` are peer methods composed by a Company Workflow.
