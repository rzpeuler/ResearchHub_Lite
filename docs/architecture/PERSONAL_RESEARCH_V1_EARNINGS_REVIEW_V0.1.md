# Personal Research v1 Earnings Review v0.1

Status: IMPLEMENTED / CTO ACCEPTANCE PENDING
Architecture baseline: Personal Research v1 Research Coverage Architecture v0.1
Implementation task: `RHL-PERSONAL-RESEARCH-V1-M3A-EARNINGS-REVIEW-001`

## Product intent

Earnings Review maintains an already-covered company's investment research state after one exact fiscal reporting period. It is not Company Deep Research and does not initialize a company. The Workflow must resolve exactly one existing Schema 0.4 Company by normalized ticker and exchange before acquisition, reasoning, or Gateway submission.

When coverage is absent or ambiguous, the product returns `COMPANY_COVERAGE_NOT_FOUND` or `COMPANY_COVERAGE_AMBIGUOUS` and directs the user to run `research_company` first. No Company is created and Pi is not used for identity resolution.

## Fiscal period contract

The product input is:

```ts
interface EarningsReviewInput {
  workflowRunId: string
  symbol: string
  name?: string
  exchange?: string
  fiscalYear: number
  period: 'Q1' | 'H1' | 'Q3' | 'FY'
  asOf?: string
}
```

The deterministic mapping is Q1 → March 31, H1 → June 30, Q3 → September 30, and FY → December 31. Local period keys are `YYYY-Q1`, `YYYY-H1`, `YYYY-Q3`, and `YYYY-FY`. The Workflow rejects arbitrary period strings and invalid fiscal years/dates.

## Acquisition and evidence

M3A-1 uses only the existing official disclosure seam (`OfficialDisclosureResearchPlugin` / `CninfoOfficialDisclosureClient`) and the existing AKShare financial-data seam. GDELT, RSS, community, Xueqiu, consensus, new providers, and provider frameworks are outside scope.

Official filing candidates are filtered by `publishedAt <= asOf`, exact fiscal year, and exact period title semantics. A full exact-period filing wins deterministically; relevant correction notices may supplement it; a summary is used only as an explicit lower-quality fallback when no full filing is available. A different year, period, or unrelated announcement is never silently substituted. Selection diagnostics are retained in Workflow output.

AKShare calls only `financialData`. The normalizer uses explicit tested aliases, finds the exact current period and prior-year comparable period, never assumes row order, and preserves unavailable/malformed values as unavailable. A period-scoped `NormalizedResearchSource` has `companySymbol`, `dataKind: earnings_financial`, and `period` metadata. Gateway evidence bindings are filtered to sources referenced by accepted durable proposals; unused report evidence is not canonicalized.

## Financial computation boundary

The Earnings Review Skill owns a narrow deterministic computation module. Direct metrics are emitted only when numeric and period-verified: revenue, net profit, gross margin, operating cash flow, and EPS. Derived values include revenue YoY, net-profit YoY, gross-margin delta in basis points, and operating-cash-flow/net-profit ratio where compatible inputs exist. Division by zero, missing values, malformed values, and incompatible units produce unavailable metrics. Code, not the model, owns arithmetic and numerical structured values.

## Skill, reasoning, and assessments

`EarningsReviewSkill` emits exactly the 14 required report sections, local impact assessments, and local claim-only proposals. The only reasoning operation is `earnings_review_synthesis`. Model input is bounded to company identity, period, selected filing excerpts, deterministic metrics, and company-only existing Claims ordered by thesis, assumption, risk, catalyst, fact/viewpoint/trend priority.

Every existing knowledge reference must be a current canonical Claim in that projection and must include the covered Company in its subject set. Assessment dispositions are `new_fact`, `supports_existing`, `contradicts_existing`, `changes_assumption`, `affects_thesis`, `new_catalyst`, `new_risk`, `no_change`, or `research_gap`.

Local deterministic validation calculates durable eligibility. `no_change` and `research_gap` are never durable. Assumption changes require an assumption Claim; thesis impacts require a thesis Claim; support/contradiction requires an existing Claim; every durable assessment requires evidence from the current exact-period review.

Invalid model serialization supports JSON strings, fenced JSON, and one shallow wrapper. At most one bounded repair retry is attempted for invalid structured semantic output. Remaining failures preserve sanitized diagnostics and use deterministic gap sections with zero unauthorized proposals. A reasoning call is not counted as applied unless structured output is validated.

## Durable proposal gate

Before Gateway submission, proposals must be local claim proposals with `subjectKey: company`, non-empty current source candidate IDs, non-empty assessment references, at least one durable referenced assessment, consistent evidence, compatible claim type, and any structured value must exactly match a deterministic verified/computed metric. `assessmentRefs` is stripped before conversion to the existing `SemanticProductionProposal` contract. No Entity, Relation, Source proposal, canonical ID allocation, or Writer change is introduced.

Accepted proposals are submitted through the existing `KnowledgeProductionGateway` with `producerType: earnings_review`, Schema 0.4 / Storage 1, and Raw provenance required. The existing Binding, Diff, Resolution, ChangeSet validation, and Writer path remains authoritative. A valid review may submit zero proposals and retain the existing Knowledge revision.

## Report semantics and entrypoints

The existing `ResearchReport` validator now supports `reportType: earnings_review` while preserving `company_research` and `daily_brief`. An Earnings Review report has the existing canonical Company as `subjectRefs`, only Gateway-returned canonical Source/Claim refs, bounded non-canonical `evidenceLinks`, exactly 14 sections, and the explicit text `Consensus unavailable`. Reports remain runtime artifacts under `runtime-data/reports/`.

Product entrypoints are `ResearchService.startEarningsReview`, Pi `review_earnings`, `POST /api/production/review-earnings`, and the short alias `POST /api/review-earnings`. `GET /api/research-reports/:reportId` remains the generic reader. No frontend page, scheduler, queue, or separate runtime composition is added.

## Validation evidence

Focused executable tests are in `tests/workflows/earnings-review.test.ts` and `tests/app/runtime/earnings-review-route.test.ts`. Regression coverage continues through the existing Company Deep Research, Daily Intelligence, and Raw Document Knowledge Production suites. Committed evidence files are:

- `tests/validation/evidence/RHL_M3A_EARNINGS_REVIEW_V1.json`
- `tests/validation/evidence/RHL_M3A_EARNINGS_REVIEW_V1_SUMMARY.md`
- `tests/validation/evidence/RHL_M3A_EARNINGS_REVIEW_V1_PI_E2E.json`
- `tests/validation/evidence/RHL_M3A_EARNINGS_REVIEW_V1_PROVIDER_SMOKE.json`
- `tests/validation/evidence/RHL_M3A_EARNINGS_REVIEW_V1_TEST_MATRIX.json`

Real Pi evidence records the actual configured model and distinguishes called, validated, applied, fallback, assessment, durable-assessment, proposal, and report outcomes. Real CNINFO/AKShare smoke records provider attempt, transport outcome, exact-period evidence, and usability independently. No GitHub CI status is inferred from local validation.
