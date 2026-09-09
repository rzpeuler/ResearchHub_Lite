# Personal Research v1 — Valuation Architecture v0.1

Status: `IMPLEMENTED / CTO ACCEPTANCE PENDING`

## Scope

M3A-2 adds the Valuation vertical for an existing canonical Company. It is a
company-scoped research operation and does not create coverage, a new
valuation object, a new provider framework, or a custom agent runtime.

## Product path

```text
Pi tool / HTTP
  -> ResearchService.startValuation
  -> workflows/valuation
  -> exact canonical Company coverage
  -> AKShare companyBasic + financialData + historicalMarketData
  -> FY/PIT normalization and eligibility
  -> valuation_assumption_design
  -> deterministic scenario and sensitivity engine
  -> valuation_synthesis
  -> bounded proposal validation
  -> existing KnowledgeProductionGateway / Writer
  -> ResearchReport(reportType=valuation)
```

The application runtime remains the frozen local-first Node + Pi SDK + React /
Vite + HTTP JSON/SSE runtime. The public product entrypoints are
`POST /api/production/analyze-valuation` and the compatibility alias
`POST /api/analyze-valuation`; Pi exposes `analyze_valuation`.

## Ownership boundaries

- Workflow owns deterministic routing, coverage resolution, PIT filtering,
  method eligibility, and orchestration.
- Skill owns the bounded semantic contract for selecting one primary method,
  cross-check methods, scenario assumptions, rationales, and interpretation.
- Code owns normalization, FY basis selection, reference multiples, compounding,
  target prices, implied returns, and the 3x3 sensitivity matrix.
- Plugin owns the existing AKShare integration.
- Gateway and Writer remain the only canonical mutation path.

The model is never the arithmetic authority. It receives bounded source and
existing-claim IDs and cannot introduce arbitrary canonical references or
calculated values. One bounded repair is permitted for each reasoning stage;
otherwise the workflow falls back to a safe, non-durable result.

## Data and PIT contract

Only structured AKShare data is used. The market observation is the latest
usable close on or before the valuation date. The financial basis is the latest
annual row whose report date is December 31 and whose publication date is
verified to be on or before an explicit `asOf`. Without explicit `asOf`, the
current snapshot may have `current_snapshot_unverified` status. Future market
rows and future `asOf` values are rejected.

The exact Company is matched by normalized `ticker + exchange`. Zero matches
block with `COMPANY_COVERAGE_NOT_FOUND`; more than one match blocks with
`COMPANY_COVERAGE_AMBIGUOUS` before acquisition or reasoning.

## Valuation methods

Eligible methods are PE, PB, and EV/EBITDA. PE requires positive market price
and EPS; PB requires positive market price and BVPS; EV/EBITDA requires positive
market price, EBITDA, and shares plus finite net debt. Reference multiples are
calculated by code from the FY basis. The requested target fiscal year defaults
to basis FY + 1 and is bounded to basis FY + 1 through FY + 3.

Stage A returns exactly Bear/Base/Bull assumptions for one primary method.
Stage B interprets deterministic results. The engine calculates target prices,
implied returns, and nine sensitivity cells. No DCF or consensus data is
introduced; the report states `Consensus unavailable` and
`DCF: Unavailable / deferred in v1`.

## Persistence and report

At most three durable local proposals are accepted, with only `assumption` or
`viewpoint` claim types. V1 defaults to Base assumptions/viewpoint, stable
code-owned structured values, proposal-referenced evidence only, and no canonical
Valuation object. The report has the fixed sixteen section titles defined by
the Valuation contract and uses canonical refs returned by Gateway.

## Verification and governance

The implementation is verified by executable focused regressions, repository
tests, type/client/build checks, a real `PiReasoningExecutor` run against a
fresh V04 knowledge base with deterministic fixtures, and an AKShare provider
smoke run. The valuation run date is workflow/report context, never canonical
semantic identity. Source `retrievedAt` is the actual acquisition time and is
not rewritten to historical `asOf` or valuation date. Canonical Source
identity is evidence-snapshot based: market evidence is keyed by company and
price date, while financial evidence is keyed by company and FY basis (with
report/publication metadata as evidence context). Data acquired only for
provider telemetry, such as unused `companyBasic`, is not durable evidence.
Under the current Gateway, valuation Claim slots are provided by Claim type,
Company subject, and structured metric plus period; Valuation does not add a
semantic-key identity layer. CTO acceptance remains pending. M3A-3 and M3A-4
are not started.
