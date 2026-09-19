# Wave 2 — Valuation Impact and Thesis Filter

Status: `IMPLEMENTED / SOL ACCEPTANCE PENDING`

W2-005 consumes the report-only `EarningsExpectationAnalysis` produced by
W2-004. It normalizes each deterministic expectation comparison into an
`EarningsFinding`, maps the finding to affected valuation input categories,
and reports whether a valuation refresh is required.

The bridge is deliberately non-authoritative. It does not calculate target
price, multiples, DCF value, forecast values, or valuation assumptions. Those
remain owned by `workflows/valuation/**` and `skills/valuation/**`.

## Thesis filter boundary

The workflow reads only canonical Schema 0.4 `KnowledgeThesisV04`,
`KnowledgeReasoningEdgeV04`, `KnowledgeClaimV04`, and
`KnowledgeObservationV04` objects belonging to the resolved Company. A
dependency is eligible only when an existing ReasoningEdge points from that
Claim/Observation to an existing Thesis and the finding's metric/period is
relevant to the dependency. The output preserves the Thesis status and edge
identity for explanation, but it is report-only.

W2-005 never submits a Knowledge proposal, creates a Thesis or Claim, creates
or updates a ReasoningEdge, or changes Thesis lifecycle/status.

## Report and telemetry

The existing `Valuation Implications` and `Thesis Impact` sections are enriched
after W2-004 synthesis. Expectation sources remain report evidence and do not
become canonical Sources solely because the bridge references them. Telemetry
separates valuation impacts, implicated Thesis dependencies, and expectation
findings that did not match a Thesis dependency.
